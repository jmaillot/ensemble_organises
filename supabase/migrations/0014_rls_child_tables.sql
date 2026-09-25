-- 0014_rls_child_tables.sql
-- Active la RLS sur les tables enfants qui en avaient besoin sans l'avoir eue.
--
-- Constat (première application réelle, campagne de tests du 25/09/2026) :
-- le contrat de schéma a relevé sept tables dont la RLS était désactivée —
-- conversation_members, event_reminders, gift_list_shares, routine_assignees,
-- routine_reminders, task_assignees, task_reminders.
--
-- Ces tables n'étaient pas en cause dans 0003/0004 : le bloc
-- `alter table … enable row level security` qui suit la création des tables
-- oublie les tables de jointure et de rappel. Les politiques, elles, ont bien
-- été écrites par 0007_rls_policies.sql — et une politique sans RLS activée
-- est inerte.
--
-- L'effet était concret : 0009_grants.sql accorde
-- `select, insert, update, delete on all tables in schema public to
-- authenticated`, donc ces sept tables étaient intégralement lisibles et
-- modifiables par tout utilisateur connecté, tous foyers confondus. Lire les
-- assignataires de toutes les tâches de toutes les familles et y écrire une
-- affectation arbitraire ne demandait aucune privilège particulier.
--
-- Cette migration répare la classe de défaut, pas la liste : elle active la
-- RLS sur toute table de `public` qui porte au moins une politique et dont la
-- RLS est désactivée, puis exige que les sept tables nommées ci-dessus soient
-- couvertes. Une politique manquante échoue ici, bruyamment, au lieu de livrer
-- une table verrouillée et vide.

begin;

do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass::text as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity
       and exists (
         select 1
           from pg_policies p
          where p.schemaname = 'public'
            and p.tablename = c.relname
       )
     order by c.relname
  loop
    execute format('alter table %s enable row level security', r.table_name);
    raise notice 'RLS activée sur % (les politiques existaient déjà)', r.table_name;
  end loop;
end;
$$;

-- Garde-fou : les sept tables attendues sont couvertes et verrouillées.
do $$
declare
  v_expected text[] := array[
    'conversation_members', 'event_reminders', 'gift_list_shares',
    'routine_assignees', 'routine_reminders', 'task_assignees', 'task_reminders'
  ];
  v_broken text;
begin
  select coalesce(array_agg(t.table_name order by t.table_name)::text, '{}')
    into v_broken
    from unnest(v_expected) as t(table_name)
   where not exists (
           select 1
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = t.table_name
              and c.relrowsecurity
         )
      or not exists (
           select 1
             from pg_policies p
            where p.schemaname = 'public'
              and p.tablename = t.table_name
         );

  if v_broken <> '{}' then
    raise exception
      'RLS ou politiques manquantes sur : %', v_broken;
  end if;
end;
$$;

commit;
