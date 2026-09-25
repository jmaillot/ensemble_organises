-- 0003_tables_daily.sql
-- Vie quotidienne : courses, calendrier, notes, tâches, routines, recettes.

begin;

-- ---------------------------------------------------------------------------
-- Courses
-- ---------------------------------------------------------------------------
create table public.shopping_lists (
  id text primary key default private.new_id('list'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.shopping_lists is 'Listes de courses du foyer.';

create table public.shopping_list_items (
  id text primary key default private.new_id('item'),
  list_id text not null references public.shopping_lists (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par la requête « tous les articles du
  -- foyer cochés/non cochés » et contraint par trigger (cf. 0008).
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  quantity numeric(10, 2),
  unit text,
  category text,
  checked boolean not null default false,
  added_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.shopping_list_items is
  'Articles d''une liste. `household_id` est dénormalisé et validé par trigger.';

-- ---------------------------------------------------------------------------
-- Calendrier
-- ---------------------------------------------------------------------------
create table public.events (
  id text primary key default private.new_id('event'),
  household_id text not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  location text,
  color text,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint events_time_check check (end_at is null or end_at >= start_at)
);
comment on table public.events is 'Événements du foyer (rendez-vous, sorties, anniversaires).';

create table public.event_reminders (
  id text primary key default private.new_id('event-reminder'),
  event_id text not null references public.events (id) on delete cascade,
  remind_at timestamptz not null
);
comment on table public.event_reminders is
  'Rappels d''événement. Accès au foyer dérivé de `events` (pas de RLS ici : cf. 0007).';

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create table public.notes (
  id text primary key default private.new_id('note'),
  household_id text not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null default '',
  category text not null default 'Maison',
  color text,
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.notes is 'Notes du foyer, catégorisées.';

-- ---------------------------------------------------------------------------
-- Tâches
-- ---------------------------------------------------------------------------
create table public.tasks (
  id text primary key default private.new_id('task'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  due_date date,
  priority_order integer not null default 0,
  status text not null default 'a_faire' check (status in ('a_faire', 'en_cours', 'fait')),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.tasks is 'Tâches du foyer. `priority_order` porte le tri manuel.';

create table public.task_assignees (
  task_id text not null references public.tasks (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  primary key (task_id, member_id)
);
comment on table public.task_assignees is
  'Assignataires d''une tâche. Accès au foyer dérivé de `tasks`.';

create table public.task_reminders (
  id text primary key default private.new_id('task-reminder'),
  task_id text not null references public.tasks (id) on delete cascade,
  remind_at timestamptz not null
);
comment on table public.task_reminders is 'Rappels de tâche. Accès au foyer dérivé de `tasks`.';

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------
create table public.routines (
  id text primary key default private.new_id('routine'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  recurrence_rule text not null default 'FREQ=DAILY'
    check (char_length(btrim(recurrence_rule)) > 0),
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.routines is 'Rituels récurrents (règle RRULE iCalendar).';

create table public.routine_assignees (
  routine_id text not null references public.routines (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  primary key (routine_id, member_id)
);
comment on table public.routine_assignees is
  'Assignataires d''une routine. Accès au foyer dérivé de `routines`.';

create table public.routine_reminders (
  id text primary key default private.new_id('routine-reminder'),
  routine_id text not null references public.routines (id) on delete cascade,
  remind_at timestamptz not null
);
comment on table public.routine_reminders is
  'Rappels de routine. Accès au foyer dérivé de `routines`.';

create table public.routine_completions (
  id text primary key default private.new_id('routine-completion'),
  routine_id text not null references public.routines (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par les vues de suivi (historique,
  -- séries) qui interrogent toutes les routines du foyer en une requête.
  household_id text not null references public.households (id) on delete cascade,
  occurrence_date date not null,
  completed_by text references public.household_members (id) on delete set null,
  completed_at timestamptz,
  status text not null default 'en_retard'
    check (status in ('fait', 'en_retard', 'manque')),
  constraint routine_completions_unique_occurrence unique (routine_id, occurrence_date)
);
comment on table public.routine_completions is
  'Occurrences générées par `private.generate_routine_occurrences()` (job pg_cron).';

create table public.recipes (
  id text primary key default private.new_id('recipe'),
  household_id text not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now()
);
comment on table public.recipes is
  'Recettes du foyer. Schéma minimal : le détail (ingrédients, étapes) reste à définir.';

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;
alter table public.recipes enable row level security;
-- Tables enfants : RLS activée, politiques en 0007 (accès dérivé du parent).

commit;
