-- 0055_ardoises.sql
-- Phase 2 Ardoises : N ardoises par foyer (nom, description, couverture, code
-- de partage type token) + membres + invités externes sans compte.
-- Les dépenses sont rattachées à une ardoise (`expenses.ardoise_id NOT NULL`
-- après backfill) ; `household_id` reste la colonne RLS/foyer, alignée par trigger.
--
-- Les invités (`ardoise_guests`) n'ont pas de `auth.users` : tout leur accès
-- passe par l'Edge Function en `service_role` + ticket HMAC, jamais PostgREST.

begin;

create table public.ardoises (
  id text primary key default private.new_id('ardoise'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  cover_url text,
  -- NULL = partage coupé (arrêt), lignes conservées. Unique : un seul code actif
  -- par valeur (les NULL multiples sont autorisés en PostgreSQL).
  invite_hash text check (invite_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  max_uses integer check (max_uses is null or max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ardoise_invite_hash_key unique (invite_hash),
  constraint ardoise_uses_check check (max_uses is null or use_count <= max_uses)
);
comment on table public.ardoises is
  'Ardoises du foyer (coloc, week-end…) : un grand-livre chacune, partage par code.';

create table public.ardoise_members (
  ardoise_id text not null references public.ardoises (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  primary key (ardoise_id, member_id)
);
comment on table public.ardoise_members is 'Membres du foyer inscrits à une ardoise.';

create table public.ardoise_guests (
  id text primary key default private.new_id('ardoise-guest'),
  ardoise_id text not null references public.ardoises (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  ticket_hash text not null check (ticket_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint ardoise_guests_ticket_key unique (ticket_hash)
);
comment on table public.ardoise_guests is
  'Invités externes d''une ardoise (sans compte) : seul le HMAC du ticket est stocké.';

alter table public.ardoise_members enable row level security;
alter table public.ardoise_guests enable row level security;
alter table public.ardoises enable row level security;

create index ardoise_members_member_idx on public.ardoise_members (member_id);
create index ardoise_guests_ardoise_idx on public.ardoise_guests (ardoise_id);

-- ---------------------------------------------------------------------------
-- Rattachement des dépenses (nullable pour le backfill, puis NOT NULL).
-- ---------------------------------------------------------------------------
alter table public.expenses
  add column ardoise_id text references public.ardoises (id) on delete cascade;
create index expenses_ardoise_idx on public.expenses (ardoise_id);

-- Une ardoise « Ardoise du foyer » par foyer, existant ou non avec dépenses.
insert into public.ardoises (household_id, name, created_by)
select h.id, 'Ardoise du foyer', null
  from public.households h
 where not exists (
   select 1 from public.ardoises a where a.household_id = h.id
 );

update public.expenses e
   set ardoise_id = a.id
  from public.ardoises a
 where e.ardoise_id is null
   and a.household_id = e.household_id
   and a.name = 'Ardoise du foyer';

-- `expenses` porte un CONSTRAINT TRIGGER DEFERRABLE (`expenses_share_total`,
-- 0008) : le backfill ci-dessus laisse des événements en attente jusqu'au
-- COMMIT, et tout ALTER TABLE ultérieur dans la même transaction échoue
-- (« pending trigger events ») dès que la table contient des lignes — vide
-- en recette, pleine en réel, d'où le vert local et le rouge distant
-- (constaté le 2026-10-03 sur `migrate.sh`, fichier jamais appliqué hors
-- développement : correctif à statements inchangés, résultat final identique).
commit;
begin;

alter table public.expenses alter column ardoise_id set not null;

-- Membres initiaux : admin + membre du foyer (enfants exclus, lecture seule).
insert into public.ardoise_members (ardoise_id, member_id)
select a.id, m.id
  from public.ardoises a
  join public.household_members m
    on m.household_id = a.household_id
   and m.role in ('admin', 'membre')
 where not exists (
   select 1 from public.ardoise_members am
    where am.ardoise_id = a.id and am.member_id = m.id
 );

-- ---------------------------------------------------------------------------
-- Cohérence : la dépense appartient au foyer de son ardoise.
-- ---------------------------------------------------------------------------
create or replace function private.align_ardoise_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
begin
  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = new.ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable : %', new.ardoise_id using errcode = '23503';
  end if;
  if new.household_id is not null and new.household_id <> v_household_id then
    raise exception 'ardoise d''un autre foyer' using errcode = '23514';
  end if;
  new.household_id := v_household_id;
  return new;
end;
$$;

drop trigger if exists align_ardoise_household on public.expenses;
create trigger align_ardoise_household
  before insert or update of ardoise_id, household_id on public.expenses
  for each row execute function private.align_ardoise_household();

revoke all on function private.align_ardoise_household() from public, anon, authenticated;

commit;
