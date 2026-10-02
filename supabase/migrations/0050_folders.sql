-- 0050_folders.sql
-- Phase 1b Dossiers : task_lists / note_folders / routine_folders
-- (mixtes perso + foyer) + folder_id nullable sur les items (NULL = Général).
--
-- Conventions : id text via private.new_id, rattachement household_id explicite,
-- audit created_at, FK folder_id ON DELETE SET NULL (supprimer un dossier
-- range son contenu dans Général, jamais de perte).

begin;

create table public.task_lists (
  id text primary key default private.new_id('task-list'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'foyer' check (visibility in ('perso', 'foyer')),
  owner_member_id text not null references public.household_members (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint task_lists_default_name check (not is_default or name = 'Général'),
  constraint task_lists_name_unique unique (household_id, name)
);
comment on table public.task_lists is 'Dossiers de tâches du foyer (Général + custom perso/foyer).';

create table public.note_folders (
  id text primary key default private.new_id('note-folder'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'foyer' check (visibility in ('perso', 'foyer')),
  owner_member_id text not null references public.household_members (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint note_folders_default_name check (not is_default or name = 'Général'),
  constraint note_folders_name_unique unique (household_id, name)
);
comment on table public.note_folders is 'Dossiers de notes du foyer (Général + custom perso/foyer).';

create table public.routine_folders (
  id text primary key default private.new_id('routine-folder'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'foyer' check (visibility in ('perso', 'foyer')),
  owner_member_id text not null references public.household_members (id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint routine_folders_default_name check (not is_default or name = 'Général'),
  constraint routine_folders_name_unique unique (household_id, name)
);
comment on table public.routine_folders is 'Dossiers de routines du foyer (Général + custom perso/foyer).';

-- Un seul Général par foyer (défense en profondeur derrière le backfill `not exists`).
create unique index task_lists_default_unique on public.task_lists (household_id) where is_default;
create unique index note_folders_default_unique on public.note_folders (household_id) where is_default;
create unique index routine_folders_default_unique on public.routine_folders (household_id) where is_default;

alter table public.tasks
  add column folder_id text references public.task_lists (id) on delete set null;
alter table public.notes
  add column folder_id text references public.note_folders (id) on delete set null;
alter table public.routines
  add column folder_id text references public.routine_folders (id) on delete set null;

create index tasks_folder_idx on public.tasks (household_id, folder_id);
create index notes_folder_idx on public.notes (household_id, folder_id);
create index routines_folder_idx on public.routines (household_id, folder_id);
create index task_lists_household_idx on public.task_lists (household_id);
create index note_folders_household_idx on public.note_folders (household_id);
create index routine_folders_household_idx on public.routine_folders (household_id);

alter table public.task_lists enable row level security;
alter table public.note_folders enable row level security;
alter table public.routine_folders enable row level security;

commit;
