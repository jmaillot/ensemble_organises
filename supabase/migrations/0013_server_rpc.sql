-- 0013_server_rpc.sql
-- Pont `public` vers les fonctions de calcul du schéma `private`, et rapport de
-- la maintenance quotidienne des routines.
--
-- POURQUOI CE PONT EST NÉCESSAIRE
--   PostgREST ne publie que le schéma `public` (cf. migration 0001). Une Edge
--   Function ne dispose que d'un client HTTP `service_role` : elle ne peut donc
--   pas appeler `private.household_balances()` ni
--   `private.simplify_household_debts()` directement, et ces fonctions doivent
--   rester hors de `public` (un client PostgREST ne doit jamais recalculer un
--   solde : AGENTS.md §2.2 et §2.6).
--   Les enveloppes ci-dessous ne déplacent aucune logique : elles revérifient
--   l'acteur en base, puis agrègent le résultat des fonctions privées dans le
--   JSON attendu. Elles sont `SECURITY DEFINER`, leur `EXECUTE` n'est accordé
--   qu'à `service_role`, et l'algorithme de compensation reste la référence
--   unique, testée en SQL par `supabase/tests/0005_ardoise.sql`.
--
-- `private.run_daily_routine_maintenance()` passe de `void` à `jsonb` : le job
-- pg_cron `eo-routine-maintenance` appelle toujours `select
-- private.run_daily_routine_maintenance()` (aucun paramètre, cf. test
-- 0004_cron.sql) et n'est donc pas affecté ; seule la signature de retour
-- change. Le `DROP` est nécessaire : `CREATE OR REPLACE` ne peut pas modifier
-- un type de retour. Les privilèges sont ré-appliqués juste après, un objet
-- recréé retombant sur les privilèges par défaut (`EXECUTE` à `PUBLIC`).
--
-- Idempotence : `drop … if exists` + `create or replace`, et les `GRANT` /
-- `REVOKE` sont rejoués à chaque application.

begin;

-- ---------------------------------------------------------------------------
-- Appartenance vérifiée sur un acteur explicite
--
-- `private.is_household_member()` s'appuie sur `auth.uid()`, qui est nul quand
-- l'appel vient de la clé secrète. Les opérations serveur prennent donc
-- l'identifiant d'acteur en paramètre, comme `private.assert_household_admin()`.
-- ---------------------------------------------------------------------------
create or replace function private.assert_household_member(
  p_household_id text,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_household_id is null or p_user_id is null then
    raise exception 'foyer et acteur obligatoires' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.household_members m
     where m.household_id = p_household_id
       and m.user_id = p_user_id
  ) then
    raise exception 'accès refusé : vous n''appartenez pas à ce foyer'
      using errcode = '42501';
  end if;
end;
$$;

comment on function private.assert_household_member(text, uuid) is
  'Refuse l''opération si l''acteur n''est pas membre du foyer (serveur).';

-- ---------------------------------------------------------------------------
-- Rapport de la maintenance quotidienne des routines
--
-- Les trois compteurs sont pris dans la même transaction que la maintenance :
-- le résumé renvoyé décrit donc exactement l'exécution qui vient d'avoir lieu.
-- ---------------------------------------------------------------------------
drop function if exists private.run_daily_routine_maintenance();

create or replace function private.run_daily_routine_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_created integer;
  v_missed integer;
  v_late integer;
begin
  v_created := private.generate_routine_occurrences(v_today - 14, v_today);
  v_missed := private.evaluate_routine_occurrences();

  -- Occurrences échues et non validées après l'évaluation des retards.
  select count(*)::integer into v_late
    from public.routine_completions
   where status = 'en_retard'
     and occurrence_date <= v_today;

  return jsonb_build_object(
    'occurrences_created', v_created,
    'occurrences_late', v_late,
    'occurrences_missed', v_missed,
    'generated_at', now()
  );
end;
$$;

comment on function private.run_daily_routine_maintenance() is
  'Génère les occurrences dues, évalue les retards et renvoie le résumé JSON.';

-- ---------------------------------------------------------------------------
-- USAGE SERVEUR UNIQUEMENT : compensation de dettes d'un foyer (Ardoise)
-- ---------------------------------------------------------------------------
create or replace function public.expense_settlement(
  p_actor_id uuid,
  p_household_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances jsonb;
  v_settlements jsonb;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;

  -- L'appartenance est revérifiée en base : une Edge Function compromise ne peut
  -- donc pas lire le solde d'un foyer dont l'appelant n'est pas membre.
  perform private.assert_household_member(p_household_id, p_actor_id);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'member_id', b.member_id,
               'display_name', b.display_name,
               'amount', round(b.balance, 2)
             ) order by b.display_name
           ),
           '[]'::jsonb
         )
    into v_balances
    from private.household_balances(p_household_id) b;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'from_member_id', s.debtor_id,
               'from_name', s.debtor_name,
               'to_member_id', s.creditor_id,
               'to_name', s.creditor_name,
               'amount', round(s.amount, 2)
             ) order by s.debtor_name, s.creditor_name
           ),
           '[]'::jsonb
         )
    into v_settlements
    from private.simplify_household_debts(p_household_id) s;

  return jsonb_build_object(
    'household_id', p_household_id,
    'balances', v_balances,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

comment on function public.expense_settlement(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et compensation minimale des dettes d''un foyer.';

-- ---------------------------------------------------------------------------
-- USAGE SERVEUR UNIQUEMENT : maintenance quotidienne des routines
--
-- `p_actor_id` nul = appel cron / runner serveur (mode `secret`).
-- `p_actor_id` renseigné = déclenchement manuel : l'acteur doit alors être
-- administrateur du foyer visé, ou administrateur d'au moins un foyer si aucun
-- foyer n'est précisé.
-- ---------------------------------------------------------------------------
create or replace function public.routine_maintenance(
  p_actor_id uuid default null,
  p_household_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_actor_id is not null then
    if p_household_id is not null then
      perform private.assert_household_admin(p_household_id, p_actor_id);
    elsif not exists (
      select 1
        from public.household_members m
       where m.user_id = p_actor_id
         and m.role = 'admin'
    ) then
      raise exception 'action réservée aux administrateurs du foyer'
        using errcode = '42501';
    end if;
  end if;

  return private.run_daily_routine_maintenance();
end;
$$;

comment on function public.routine_maintenance(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Lance la maintenance quotidienne et renvoie son résumé.';

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- `create or replace` recrée les ACL : le `EXECUTE` par défaut de `PUBLIC` est
-- explicitement retiré, comme pour les quatre fonctions serveur de la
-- migration 0009.
-- ---------------------------------------------------------------------------
revoke all on function private.assert_household_member(text, uuid) from public, anon, authenticated;
revoke all on function private.run_daily_routine_maintenance() from public, anon, authenticated;
revoke all on function public.expense_settlement(uuid, text) from public, anon, authenticated;
revoke all on function public.routine_maintenance(uuid, text) from public, anon, authenticated;

grant execute on function private.assert_household_member(text, uuid) to service_role;
grant execute on function private.run_daily_routine_maintenance() to service_role;
grant execute on function public.expense_settlement(uuid, text) to service_role;
grant execute on function public.routine_maintenance(uuid, text) to service_role;

commit;
