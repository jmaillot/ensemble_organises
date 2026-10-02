-- 0047_calendrier.sql
-- Phase 1 Calendrier : catégories, calendriers Commun/Perso, rattachement
-- events, zone scolaire, cache fériés/vacances.
--
-- Règles : corriger vers l'avant, search_path='' sur fonctions, tables
-- qualifiées public.*, RLS activée + politiques explicites par table.

begin;

-- ---------------------------------------------------------------------------
-- event_categories : Repas/Médical/École/Sport + custom par foyer.
-- ---------------------------------------------------------------------------
create table public.event_categories (
  id text primary key default private.new_id('event-category'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  is_default boolean not null default false,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_categories_name_unique unique (household_id, name)
);
comment on table public.event_categories is
  'Catégories d''événement par foyer (Repas/Médical/École/Sport + custom).';

-- ---------------------------------------------------------------------------
-- event_calendars : un Commun par foyer + N Perso (owner seul + admin lecture).
-- ---------------------------------------------------------------------------
create table public.event_calendars (
  id text primary key default private.new_id('event-calendar'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  visibility text not null check (visibility in ('commun', 'perso')),
  owner_member_id text references public.household_members (id) on delete cascade,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_calendars_visibility_owner_check check (
    (visibility = 'commun' and owner_member_id is null)
    or (visibility = 'perso' and owner_member_id is not null)
  ),
  constraint event_calendars_name_unique unique (household_id, name)
);
comment on table public.event_calendars is
  'Calendriers du foyer : Commun partagé + Perso visible par owner (et admin en lecture).';

-- ---------------------------------------------------------------------------
-- households.school_zone : A/B/C/NULL (NULL = vacances masquées + CTA).
-- ---------------------------------------------------------------------------
alter table public.households
  add column school_zone text check (school_zone in ('A', 'B', 'C'));

-- ---------------------------------------------------------------------------
-- Référentiels globaux (sans household_id, justifié : données publiques).
-- Lecture seule client, écriture serveur/cron uniquement (aucune politique
-- d'écriture = refus RLS par défaut).
-- ---------------------------------------------------------------------------
create table public.public_holidays (
  holiday_date date primary key,
  name text not null,
  year integer not null generated always as (extract(year from holiday_date)::integer) stored
);
comment on table public.public_holidays is 'Jours fériés France métropole (cache annuel API).';
create index public_holidays_year_idx on public.public_holidays (year);

create table public.school_holidays (
  id text primary key default private.new_id('school-holiday'),
  zone text not null check (zone in ('A', 'B', 'C')),
  school_year text not null,
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  constraint school_holidays_zone_dates_unique unique (zone, start_date, end_date)
);
comment on table public.school_holidays is 'Vacances scolaires par zone (cache annuel API).';
create index school_holidays_zone_idx on public.school_holidays (zone, start_date, end_date);

-- ---------------------------------------------------------------------------
-- events : rattachement catégorie + calendrier (nullable pour backfill).
-- ---------------------------------------------------------------------------
alter table public.events
  add column category_id text references public.event_categories (id) on delete set null,
  add column calendar_id text references public.event_calendars (id) on delete cascade;
create index events_calendar_idx on public.events (calendar_id, start_at);
create index events_category_idx on public.events (category_id);

-- ---------------------------------------------------------------------------
-- Seed : 4 catégories + 1 Commun par foyer existant, backfill events.
-- ---------------------------------------------------------------------------
insert into public.event_categories (household_id, name, color, is_default, created_by)
select h.id, v.name, v.color, true, null
  from public.households h
  cross join (values
    ('Repas', '#E8930C'),
    ('Médical', '#D64545'),
    ('École', '#3E7CB1'),
    ('Sport', '#4CAF50')
  ) as v(name, color)
 where not exists (
   select 1 from public.event_categories c
    where c.household_id = h.id and c.name = v.name
 );

insert into public.event_calendars (household_id, name, visibility, owner_member_id)
select h.id, 'Commun', 'commun', null
  from public.households h
 where not exists (
   select 1 from public.event_calendars c
    where c.household_id = h.id and c.name = 'Commun'
 );

update public.events e
   set calendar_id = c.id
  from public.event_calendars c
 where e.calendar_id is null
   and c.household_id = e.household_id
   and c.name = 'Commun'
   and c.visibility = 'commun';

alter table public.events alter column calendar_id set not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.event_categories enable row level security;
alter table public.event_calendars enable row level security;
alter table public.public_holidays enable row level security;
alter table public.school_holidays enable row level security;

-- Helpers visibilité calendrier (search_path vide, noms qualifiés).
create or replace function private.is_calendar_visible(p_calendar_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.event_calendars c
     where c.id = p_calendar_id
       and private.is_household_member(c.household_id)
       and (
         c.visibility = 'commun'
         or c.owner_member_id = private.current_member_id(c.household_id)
         or private.is_household_admin(c.household_id)
       )
  );
$$;

create or replace function private.can_write_calendar(p_calendar_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.event_calendars c
     where c.id = p_calendar_id
       and private.can_write_household(c.household_id)
       and (
         (c.visibility = 'commun')
         or (
           c.visibility = 'perso'
           and c.owner_member_id = private.current_member_id(c.household_id)
         )
       )
  );
$$;

-- event_categories : motif foyer plat + défauts non supprimables.
drop policy if exists event_categories_select_household on public.event_categories;
create policy event_categories_select_household on public.event_categories
  for select using (private.is_household_member(household_id));

drop policy if exists event_categories_insert_household on public.event_categories;
create policy event_categories_insert_household on public.event_categories
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists event_categories_update_household on public.event_categories;
create policy event_categories_update_household on public.event_categories
  for update using (private.can_write_household(household_id))
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
  );

drop policy if exists event_categories_delete_admin on public.event_categories;
create policy event_categories_delete_admin on public.event_categories
  for delete using (
    private.is_household_admin(household_id) and not is_default
  );

-- event_calendars : commun (admin écrit) + perso (owner écrit, admin lit).
drop policy if exists event_calendars_select on public.event_calendars;
create policy event_calendars_select on public.event_calendars
  for select using (
    private.is_household_member(household_id)
    and (
      visibility = 'commun'
      or owner_member_id = private.current_member_id(household_id)
      or private.is_household_admin(household_id)
    )
  );

drop policy if exists event_calendars_insert on public.event_calendars;
create policy event_calendars_insert on public.event_calendars
  for insert with check (
    private.can_write_household(household_id)
    and private.member_in_household(owner_member_id, household_id) = (visibility = 'perso')
    and (
      (visibility = 'commun' and private.is_household_admin(household_id) and owner_member_id is null)
      or (
        visibility = 'perso'
        and owner_member_id = private.current_member_id(household_id)
      )
    )
  );

-- Note : member_in_household(null, …) vaut false ; l'égalité avec
-- (visibility='perso') impose owner non-null en perso, null en commun.
-- La redondance avec le CHECK est volontaire (défense RLS + contrainte).

drop policy if exists event_calendars_update on public.event_calendars;
create policy event_calendars_update on public.event_calendars
  for update using (
    private.can_write_household(household_id)
    and (
      (visibility = 'commun' and private.is_household_admin(household_id))
      or (
        visibility = 'perso'
        and owner_member_id = private.current_member_id(household_id)
      )
      or private.is_household_admin(household_id)
    )
  )
  with check (
    private.can_write_household(household_id)
    and (
      (visibility = 'commun' and owner_member_id is null)
      or (
        visibility = 'perso'
        and private.member_in_household(owner_member_id, household_id)
      )
    )
  );

drop policy if exists event_calendars_delete on public.event_calendars;
create policy event_calendars_delete on public.event_calendars
  for delete using (
    private.is_household_admin(household_id) and name <> 'Commun'
  );

-- Référentiels : lecture seule.
drop policy if exists public_holidays_select on public.public_holidays;
create policy public_holidays_select on public.public_holidays
  for select using (true);

drop policy if exists school_holidays_select on public.school_holidays;
create policy school_holidays_select on public.school_holidays
  for select using (true);

-- events : resserrer sur la visibilité du calendrier (remplace le motif 0007).
drop policy if exists events_select_household on public.events;
create policy events_select_household on public.events
  for select using (
    private.is_household_member(household_id)
    and private.is_calendar_visible(calendar_id)
  );

drop policy if exists events_insert_household on public.events;
create policy events_insert_household on public.events
  for insert with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.can_write_calendar(calendar_id)
  );

drop policy if exists events_update_household on public.events;
create policy events_update_household on public.events
  for update using (
    private.can_write_household(household_id)
    and private.can_write_calendar(calendar_id)
  )
  with check (
    private.can_write_household(household_id)
    and (created_by is null or created_by = private.current_member_id(household_id))
    and private.can_write_calendar(calendar_id)
  );

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events
  for delete using (
    private.is_household_admin(household_id)
    or (
      private.can_write_household(household_id)
      and exists (
        select 1 from public.event_calendars c
         where c.id = public.events.calendar_id
           and c.visibility = 'perso'
           and c.owner_member_id = private.current_member_id(public.events.household_id)
      )
    )
  );

-- Rappels : même périmètre calendrier via l'événement parent.
create or replace function private.can_read_event(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and private.is_household_member(e.household_id)
       and private.is_calendar_visible(e.calendar_id)
  );
$$;

create or replace function private.can_write_event(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and private.can_write_household(e.household_id)
       and private.can_write_calendar(e.calendar_id)
  );
$$;

create or replace function private.can_admin_event(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and (
         private.is_household_admin(e.household_id)
         or (
           private.can_write_household(e.household_id)
           and exists (
             select 1 from public.event_calendars c
              where c.id = e.calendar_id
                and c.visibility = 'perso'
                and c.owner_member_id = private.current_member_id(e.household_id)
           )
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Cohérence : catégorie et calendrier du même foyer que l'événement.
-- ---------------------------------------------------------------------------
create or replace function private.validate_event_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calendar_household text;
  v_category_household text;
begin
  select c.household_id into v_calendar_household
    from public.event_calendars c
   where c.id = new.calendar_id;
  if v_calendar_household is null then
    raise exception 'calendrier introuvable' using errcode = '23503';
  end if;
  if v_calendar_household <> new.household_id then
    raise exception 'calendrier d''un autre foyer' using errcode = '23514';
  end if;
  if new.category_id is not null then
    select c.household_id into v_category_household
      from public.event_categories c
     where c.id = new.category_id;
    if v_category_household is null then
      raise exception 'catégorie introuvable' using errcode = '23503';
    end if;
    if v_category_household <> new.household_id then
      raise exception 'catégorie d''un autre foyer' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_event_scope on public.events;
create trigger validate_event_scope
  before insert or update of calendar_id, category_id, household_id on public.events
  for each row execute function private.validate_event_scope();

-- Privilèges : helpers appelés par les politiques RLS (évaluées avec le rôle
-- appelant) doivent être exécutables par authenticated ; le trigger ne l'est
-- jamais directement (même motif que 0009/0026).
grant execute on function private.is_calendar_visible(text) to authenticated, service_role;
grant execute on function private.can_write_calendar(text) to authenticated, service_role;
revoke all on function private.validate_event_scope() from public, anon, authenticated;

commit;
