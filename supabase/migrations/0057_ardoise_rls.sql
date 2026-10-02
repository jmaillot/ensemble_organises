-- 0057_ardoise_rls.sql
-- RLS par ardoise : un membre du foyer non inscrit à l'ardoise ne voit rien.
-- Les invités ne lisent jamais PostgREST (aucune politique ne les vise) : leur
-- accès passe par l'Edge Function en `service_role` + ticket HMAC.
--
-- Les helpers `can_read/write/admin_expense` intègrent l'appartenance à
-- l'ardoise : les politiques des parts (0007/0037) suivent sans réécriture.

begin;

-- ---------------------------------------------------------------------------
-- Helpers : foyer de l'ardoise, appartenance, visibilité, écriture.
-- ---------------------------------------------------------------------------
create or replace function private.ardoise_household_id(p_ardoise_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.household_id from public.ardoises a where a.id = p_ardoise_id;
$$;

create or replace function private.is_ardoise_member(p_ardoise_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.ardoise_members am
      join public.ardoises a on a.id = am.ardoise_id
     where am.ardoise_id = p_ardoise_id
       and am.member_id = private.current_member_id(a.household_id)
  );
$$;

create or replace function private.can_write_ardoise(p_ardoise_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write_household(private.ardoise_household_id(p_ardoise_id))
     and (
       private.is_household_admin(private.ardoise_household_id(p_ardoise_id))
       or private.is_ardoise_member(p_ardoise_id)
     );
$$;

grant execute on function private.ardoise_household_id(text) to authenticated, service_role;
grant execute on function private.is_ardoise_member(text) to authenticated, service_role;
grant execute on function private.can_write_ardoise(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ardoises : lecture membre, écriture writer, suppression admin. Les invités
-- n'apparaissent dans aucune politique : sans JWT, aucune ne les reconnaît.
-- ---------------------------------------------------------------------------
drop policy if exists ardoises_select on public.ardoises;
create policy ardoises_select on public.ardoises
  for select using (private.is_household_member(household_id));

drop policy if exists ardoises_insert on public.ardoises;
create policy ardoises_insert on public.ardoises
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists ardoises_update on public.ardoises;
create policy ardoises_update on public.ardoises
  for update using (private.can_write_household(household_id))
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists ardoises_delete on public.ardoises;
create policy ardoises_delete on public.ardoises
  for delete using (private.is_household_admin(household_id));

-- Membres et invités : lecture membre du foyer, gestion admin (l'inscription
-- par code passe par l'Edge en `service_role`, jamais par PostgREST).
drop policy if exists ardoise_members_select on public.ardoise_members;
create policy ardoise_members_select on public.ardoise_members
  for select using (
    private.is_household_member(private.ardoise_household_id(ardoise_id))
  );

drop policy if exists ardoise_members_admin on public.ardoise_members;
create policy ardoise_members_admin on public.ardoise_members
  for all using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  )
  with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

drop policy if exists ardoise_guests_select on public.ardoise_guests;
create policy ardoise_guests_select on public.ardoise_guests
  for select using (
    private.is_household_member(private.ardoise_household_id(ardoise_id))
  );

drop policy if exists ardoise_guests_admin on public.ardoise_guests;
create policy ardoise_guests_admin on public.ardoise_guests
  for all using (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  )
  with check (
    private.is_household_admin(private.ardoise_household_id(ardoise_id))
  );

-- ---------------------------------------------------------------------------
-- Dépenses : périmètre ardoise. L'attribution du payeur reste libre entre
-- membre et invité (vérifiée par trigger), la frontière est l'inscription.
-- ---------------------------------------------------------------------------
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (
    private.is_household_member(household_id)
    and (
      private.is_household_admin(household_id)
      or private.is_ardoise_member(ardoise_id)
    )
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    private.can_write_household(household_id)
    and (
      private.is_household_admin(household_id)
      or private.is_ardoise_member(ardoise_id)
    )
    and (paid_by is null or private.member_in_household(paid_by, household_id))
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (
    private.can_write_household(household_id)
    and (
      private.is_household_admin(household_id)
      or private.is_ardoise_member(ardoise_id)
    )
  )
  with check (
    private.can_write_household(household_id)
    and (
      private.is_household_admin(household_id)
      or private.is_ardoise_member(ardoise_id)
    )
    and (paid_by is null or private.member_in_household(paid_by, household_id))
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete using (private.can_admin_expense(id));

-- ---------------------------------------------------------------------------
-- Helpers des parts : périmètre ardoise (les politiques 0007/0037 suivent).
-- Suppression : admin du foyer OU créateur de l'ardoise.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.expenses e
     where e.id = p_expense_id
       and private.is_household_member(e.household_id)
       and (
         private.is_household_admin(e.household_id)
         or private.is_ardoise_member(e.ardoise_id)
       )
  );
$$;

create or replace function private.can_write_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.expenses e
     where e.id = p_expense_id
       and private.can_write_household(e.household_id)
       and (
         private.is_household_admin(e.household_id)
         or private.is_ardoise_member(e.ardoise_id)
       )
  );
$$;

create or replace function private.can_admin_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.expenses e
      join public.ardoises a on a.id = e.ardoise_id
     where e.id = p_expense_id
       and (
         private.is_household_admin(e.household_id)
         or a.created_by = private.current_member_id(e.household_id)
       )
  );
$$;

commit;
