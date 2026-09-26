-- 0022_qualify_reminder_source.sql
-- `private.push_reminder_notifications()` s'exécutait, et échouait.
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0019 est appliquée et ne sera pas réécrite. Le défaut est apparu en
--   exécutant `supabase/tests/0007_push.sql`, qui est le premier appel réel de
--   cette fonction : jusqu'ici, seul `create function` l'avait touchée.
--
-- LE DÉFAUT 1 : AUCUNE TABLE N'ÉTAIT QUALIFIÉE
--   La fonction est `security definer` et déclare `set search_path = ''` — la
--   pratique correcte, qui empêche un appelant de placer un objet malveillant
--   dans un schéma de son choix. Mais un `search_path` vide ne résout AUCUN nom
--   non qualifié. Le corps écrivait `from task_reminders`, `join tasks`,
--   `from public.task_assignees` selon l'humeur, et PostgreSQL répondait :
--
--     relation "task_reminders" does not exist
--
--   Aucun schéma n'était dans le `search_path` : « la relation n'existe pas »
--   n'est donc pas un oubli de qualification, c'est le comportement correct et
--   voulu d'un `search_path` vide.
--
-- LE DÉFAUT 2 : LES CTE PORTAIENT LE NOM DES TABLES QU'ILS SÉLECTIONNAIENT
--   Les trois requêtes s'appelaient `tasks`, `events` et `routines`, comme les
--   tables. Dans un CTE, le nom du CTE est résolu en priorité : le `join tasks t`
--   du CTE `tasks` visait donc le CTE lui-même, et PostgreSQL aurait refusé
--   ensuite un « recursive reference to query "tasks" must not appear within a
--   non-recursive CTE ». Seule la qualification manquait encore pour que cette
--   seconde erreur apparaisse — deux défauts distincts, révélés dans l'ordre,
--   tous deux invisibles à la création.
--
-- POURQUOI C'ÉTAIT UN VRAI BUG, PAS UNE AFFAIRE DE TEST
--   C'est la source des rappels : le job `eo-push-reminders`, toutes les quinze
--   minutes, aurait renvoyé une erreur quatre fois par heure depuis la mise en
--   production de 0019, sans qu'aucun test ne le voie. Aucun rappel de tâche,
--   d'événement ou de routine n'aurait jamais été distribué.
--
-- LE CONTRÔLE AUTOMATIQUE
--   Ce défaut appartient à une famille déjà rencontrée trois fois : le mot
--   réservé `window` (0019), la liste de colonnes d'un appel de fonction, et
--   maintenant les noms non qualifiés. À chaque fois, le code passait la
--   migration, le test de contrat, et la relecture. `scripts/check-search-path.py`
--   vérifie désormais, sur la définition EFFECTIVE de chaque fonction — la
--   dernière, celle que la base contient — qu'aucun nom de table n'est non
--   qualifié et qu'aucun CTE ne s'ombre lui-même. Les définitions dépassées
--   restent signalées sans faire échouer le contrôle : 0019 restera au dépôt
--   avec son code fautif, et un contrôle rouge en permanence sHabitue.

begin;

create or replace function private.push_reminder_notifications(p_now timestamptz)
returns table (
  user_id uuid,
  reminder_id text,
  household_id text,
  title text,
  body text,
  url text,
  tag text,
  preference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  -- `bounds` et non `window` : `window` est un MOT RÉSERVÉ de PostgreSQL (la
  -- clause des fonctions fenêtrées), et `with window as (…)` est refusé à
  -- l'analyse. Le premier jet employait ce nom.
  --
  -- Les trois requêtes s'appellent `rappels_*` et non `tasks`/`events`/
  -- `routines` : un CTE masque la table du même nom, et `join tasks t` à
  -- l'intérieur du CTE `tasks` aurait joint le CTE à lui-même.
  --
  -- Toutes les tables sont qualifiées : le `search_path` est vide, et il doit
  -- le rester.
  with bounds as (
    select private.push_reminder_window(p_now) as slot
  ), rappels_taches as (
    select
      m.user_id,
      tr.id as reminder_id,
      t.household_id,
      'Tâche : ' || t.name as title,
      case
        when t.due_date is not null and nullif(btrim(coalesce(t.description, '')), '') is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM') || ' — ' || btrim(t.description)
        when t.due_date is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM')
        else btrim(coalesce(t.description, 'Sans date d''échéance.'))
      end as body,
      '/taches'::text as url,
      'tache-' || t.id as tag,
      'task'::text as preference
    from public.task_reminders tr
    join public.tasks t on t.id = tr.task_id
    cross join bounds w
    -- `lateral … on true` : zéro ligne si la tâche n'a aucun assignataire
    -- doté d'un compte, et le `coalesce` bascule alors sur le créateur.
    left join lateral (
      select ta.member_id
        from public.task_assignees ta
        join public.household_members assignee on assignee.id = ta.member_id
       where ta.task_id = t.id
         and assignee.user_id is not null
      order by ta.member_id
      limit 1
    ) assigned on true
    join public.household_members m on m.id = coalesce(assigned.member_id, t.created_by)
    where tr.remind_at <@ w.slot
      and t.status <> 'fait'
      and m.user_id is not null
  ), rappels_evenements as (
    select
      m.user_id,
      er.id as reminder_id,
      e.household_id,
      'Événement : ' || e.title as title,
      (case
         when e.all_day then 'Toute la journée'
         else to_char(e.start_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI')
       end)
      || case
           when nullif(btrim(coalesce(e.location, '')), '') is null then ''
           else ' — ' || btrim(e.location)
         end as body,
      '/calendrier'::text as url,
      'evenement-' || e.id as tag,
      'event'::text as preference
    from public.event_reminders er
    join public.events e on e.id = er.event_id
    cross join bounds w
    join public.household_members m on m.household_id = e.household_id and m.user_id is not null
    where er.remind_at <@ w.slot
      -- Un événement déjà commencé n'a plus rien à annoncer.
      and e.start_at > coalesce(p_now, now())
      and (e.created_by is null or m.id = e.created_by)
  ), rappels_routines as (
    select
      m.user_id,
      rr.id as reminder_id,
      r.household_id,
      'Routine : ' || r.name as title,
      nullif(btrim(coalesce(r.description, '')), '') as body,
      '/routines'::text as url,
      'routine-' || r.id as tag,
      'routine'::text as preference
    from public.routine_reminders rr
    join public.routines r on r.id = rr.routine_id
    cross join bounds w
    join public.household_members m on m.household_id = r.household_id and m.user_id is not null
    where rr.remind_at <@ w.slot
      and (r.created_by is null or m.id = r.created_by)
  )
  select user_id, reminder_id, household_id, title, body, url, tag, preference from rappels_taches
  union all
  select user_id, reminder_id, household_id, title, body, url, tag, preference from rappels_evenements
  union all
  select user_id, reminder_id, household_id, title, body, url, tag, preference from rappels_routines;
end;
$$;

comment on function private.push_reminder_notifications(timestamptz) is
  'Rappels dus dans la fenêtre, un couple (destinataire, rappel) par ligne.';

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- Inchangés : la fonction n'est appelée que par `public.due_push_notifications()`,
-- lui-même `security definer`, et par les tests via `postgres`.
-- ---------------------------------------------------------------------------
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;

commit;
