-- 0183_ardoise_single_permissive_policy.sql
-- Phase 52 (SEC-45-01 / D-02 du 52-CONTEXT.md) — une seule politique permissive
-- par (rôle, action) sur `ardoise_guests` et `ardoise_members`.
--
-- Définitions EFFECTIVES relevées le 2026-11-14 via pg_policies (canal stdin
-- `scripts/psql.sh`, AGENTS §2.7-C — jamais réécrites d'après 0057 seul,
-- Pitfall 2 du 52-RESEARCH) :
--   ardoise_members_select — 0113_enfant_perimeter.sql:100-105 :
--     for select using (private.can_write_household(
--       private.ardoise_household_id(ardoise_id)))
--   ardoise_guests_select  — 0113_enfant_perimeter.sql:107-112 : idem.
--   ardoise_members_admin / ardoise_guests_admin — 0057_ardoise_rls.sql:93-114 :
--     for all using/with check (private.is_household_admin(
--       private.ardoise_household_id(ardoise_id)))
--   Toutes `to public` (rôle authentifié filtré par les helpers).
--
-- Forme lint-0006-safe (Pitfall 1, §2.6) : le lint 0006 se déclenchait car
-- pour l'admin, SELECT était couvert par DEUX politiques permissives (la
-- SELECT et la ALL). On remplace la ALL par des politiques d'écriture par
-- commande (insert/update/delete, admin exclusif) et on fusionne la SELECT
-- (membre OU admin dans la garde). Aucune fusion en `for all` membre-OU-admin :
-- cela donnerait le droit d'écriture aux simples membres (escalade, §2.6).
-- Droits effectifs inchangés ou plus restreints : un simple membre peut
-- SELECT mais NE peut PAS INSERT/UPDATE/DELETE ; l'admin peut tout.
-- Source de la fiche : .planning/ROADMAP-TODO.md entrée SEC-45-01
-- (45-AUDIT.md §5 fiche SEC-45-01, l. 528-534).

begin;

-- --------------------------------------------------------------------------
-- ardoise_members
-- --------------------------------------------------------------------------
drop policy if exists ardoise_members_select on public.ardoise_members;
drop policy if exists ardoise_members_admin on public.ardoise_members;

create policy ardoise_members_select on public.ardoise_members
  for select using (
    private.can_write_household(private.ardoise_household_id(ardoise_id))
    or private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_members_insert on public.ardoise_members
  for insert with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_members_update on public.ardoise_members
  for update using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  )
  with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_members_delete on public.ardoise_members
  for delete using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

-- --------------------------------------------------------------------------
-- ardoise_guests
-- --------------------------------------------------------------------------
drop policy if exists ardoise_guests_select on public.ardoise_guests;
drop policy if exists ardoise_guests_admin on public.ardoise_guests;

create policy ardoise_guests_select on public.ardoise_guests
  for select using (
    private.can_write_household(private.ardoise_household_id(ardoise_id))
    or private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_guests_insert on public.ardoise_guests
  for insert with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_guests_update on public.ardoise_guests
  for update using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  )
  with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

create policy ardoise_guests_delete on public.ardoise_guests
  for delete using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

-- Garde de non-escalade (pattern 0182:346-355) : échoue si un (rôle, action)
-- reste couvert par deux politiques permissives sur ces tables, ou si une
-- politique d'écriture n'est pas exclusivement gardée par is_household_admin.
do $$
declare
  v_dupes int;
  v_bad_writes int;
begin
  -- 1. Aucun couple (table, rôle, action) couvert par deux politiques permissives.
  select count(*) into v_dupes
  from (
    select pol.relname as table_name, r.rolname, act.cmd
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class pol on p.polrelid = pol.oid
    join pg_catalog.pg_namespace n on pol.relnamespace = n.oid
    join pg_catalog.pg_roles r
      on p.polroles @> array[r.oid] or p.polroles = array[0::oid]
    cross join lateral (
      select x.cmd
      from unnest(
        case p.polcmd
          when 'r' then array['SELECT'::text]
          when '*' then array['SELECT'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]
          when 'a' then array['INSERT'::text]
          when 'w' then array['UPDATE'::text]
          when 'd' then array['DELETE'::text]
          else array['ERROR'::text]
        end
      ) x(cmd)
    ) act
    where n.nspname = 'public'
      and pol.relname in ('ardoise_members', 'ardoise_guests')
      and p.polpermissive
      and not r.rolbypassrls
      and r.rolname not like 'pg_%'
      and r.rolname not like 'supabase%admin'
    group by pol.relname, r.rolname, act.cmd
    having count(1) > 1
  ) dupes;

  if v_dupes > 0 then
    raise exception 'SEC-45-01 : % couple(s) (rôle, action) encore couvert(s) par plusieurs politiques permissives sur ardoise_members/ardoise_guests', v_dupes;
  end if;

  -- 2. Toute politique d'écriture (insert/update/delete) doit être gardée par
  --    is_household_admin en using ET en with check — jamais par une garde
  --    membre (can_write_household), sinon escalade d'écriture aux simples membres.
  select count(*) into v_bad_writes
  from pg_policies
  where schemaname = 'public'
    and tablename in ('ardoise_members', 'ardoise_guests')
    and cmd in ('INSERT', 'UPDATE', 'DELETE')
    and (
      (cmd in ('UPDATE', 'DELETE') and (qual is null or qual not like '%is_household_admin%'))
      or (cmd in ('INSERT', 'UPDATE') and (with_check is null or with_check not like '%is_household_admin%'))
    );

  if v_bad_writes > 0 then
    raise exception 'SEC-45-01 : % politique(s) d''écriture sans garde admin exclusive (escalade interdite)', v_bad_writes;
  end if;
end;
$$;

commit;
