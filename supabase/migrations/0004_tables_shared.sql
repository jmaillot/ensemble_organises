-- 0004_tables_shared.sql
-- Partage et mémoire : Ardoise, Cadeaux, Anniversaires, Animaux, Prestataires,
-- Fidélité, Adresses, Cercle, Voyages, Messages, Widgets du tableau de bord.

begin;

-- ---------------------------------------------------------------------------
-- Ardoise
-- ---------------------------------------------------------------------------
create table public.expenses (
  id text primary key default private.new_id('expense'),
  household_id text not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  amount numeric(12, 2) not null check (amount > 0),
  paid_by text not null references public.household_members (id) on delete restrict,
  expense_date date not null default current_date,
  split_type text not null default 'egal' check (split_type in ('egal', 'personnalise')),
  created_at timestamptz not null default now()
);
comment on table public.expenses is
  'Dépenses du foyer. `paid_by` référence household_members.id, pas auth.users.';

create table public.external_participants (
  id text primary key default private.new_id('external'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  contact text
);
comment on table public.external_participants is
  'Participants externes aux membres, mais toujours rattachés au même foyer.';

create table public.expense_participants (
  id text primary key default private.new_id('expense-participant'),
  expense_id text not null references public.expenses (id) on delete cascade,
  participant_type text not null check (participant_type in ('membre', 'externe')),
  member_id text references public.household_members (id) on delete cascade,
  external_participant_id text references public.external_participants (id) on delete cascade,
  share_amount numeric(12, 2) not null check (share_amount >= 0),
  -- Contraintes imposées par AGENTS.md §5 : `membre` exige `member_id` et
  -- interdit `external_participant_id` ; `externe` exige l'inverse.
  constraint expense_participants_kind_check check (
    (participant_type = 'membre' and member_id is not null and external_participant_id is null)
    or (participant_type = 'externe' and member_id is null and external_participant_id is not null)
  ),
  constraint expense_participants_member_unique unique nulls not distinct (expense_id, member_id),
  constraint expense_participants_external_unique unique nulls not distinct (expense_id, external_participant_id)
);
comment on table public.expense_participants is
  'Partages d''une dépense. La somme des parts est validée par trigger différé.';

-- ---------------------------------------------------------------------------
-- Cadeaux
-- ---------------------------------------------------------------------------
create table public.gift_lists (
  id text primary key default private.new_id('gift-list'),
  household_id text not null references public.households (id) on delete cascade,
  owner_member_id text not null references public.household_members (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  visibility text not null default 'privee'
    check (visibility in ('privee', 'foyer', 'partagee')),
  created_at timestamptz not null default now()
);
comment on table public.gift_lists is
  'Listes de cadeaux. `privee` : seul le propriétaire et les partages explicites la lisent.';

create table public.gift_items (
  id text primary key default private.new_id('gift-item'),
  list_id text not null references public.gift_lists (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par les requêtes de résolution de
  -- cadeau (tous les articles non achetés du foyer) et validé par trigger.
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  price numeric(12, 2) check (price is null or price >= 0),
  comment text,
  photo_url text,
  url text,
  reserved_by text references public.household_members (id) on delete set null,
  purchased boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.gift_items is 'Articles d''une liste de cadeaux.';

create table public.gift_list_shares (
  id text primary key default private.new_id('gift-share'),
  list_id text not null references public.gift_lists (id) on delete cascade,
  shared_with_member_id text references public.household_members (id) on delete cascade,
  shared_with_email text,
  permission text not null default 'lecture' check (permission in ('lecture', 'reservation')),
  constraint gift_list_shares_target_check check (
    (shared_with_member_id is not null and shared_with_email is null)
    or (shared_with_member_id is null and shared_with_email is not null)
  ),
  constraint gift_list_shares_member_unique unique nulls not distinct (list_id, shared_with_member_id),
  constraint gift_list_shares_email_unique unique nulls not distinct (list_id, shared_with_email)
);
comment on table public.gift_list_shares is
  'Partages d''une liste. Clé primaire `id`, unicité du couple (liste, destinataire).';

-- ---------------------------------------------------------------------------
-- Anniversaires
-- ---------------------------------------------------------------------------
create table public.birthdays (
  id text primary key default private.new_id('birthday'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  birth_date date not null,
  photo_url text,
  linked_member_id text references public.household_members (id) on delete set null
);
comment on table public.birthdays is 'Anniversaires du foyer et des contacts.';

-- ---------------------------------------------------------------------------
-- Animaux
-- ---------------------------------------------------------------------------
create table public.pets (
  id text primary key default private.new_id('pet'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  species text not null,
  breed text,
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg > 0),
  birth_date date,
  identification_number text,
  photo_url text,
  created_at timestamptz not null default now()
);
comment on table public.pets is 'Animaux du foyer.';

create table public.pet_records (
  id text primary key default private.new_id('pet-record'),
  pet_id text not null references public.pets (id) on delete cascade,
  -- `household_id` dénormalisé : justifié par la vue « carnet de santé du
  -- foyer » et validé par trigger.
  household_id text not null references public.households (id) on delete cascade,
  type text not null check (type in ('produit', 'vaccin', 'traitement', 'info')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  record_date date not null default current_date,
  next_due_date date,
  notes text,
  attachment_url text,
  constraint pet_records_due_check check (next_due_date is null or next_due_date >= record_date)
);
comment on table public.pet_records is 'Carnet de santé : vaccins, traitements, produits.';

-- ---------------------------------------------------------------------------
-- Prestataires
-- ---------------------------------------------------------------------------
create table public.provider_types (
  id text primary key default private.new_id('provider-type'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  icon text,
  created_at timestamptz not null default now(),
  constraint provider_types_name_unique unique (household_id, name)
);
comment on table public.provider_types is 'Types de prestataires configurables par foyer.';

create table public.providers (
  id text primary key default private.new_id('provider'),
  household_id text not null references public.households (id) on delete cascade,
  provider_type_id text references public.provider_types (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  email text,
  phone text,
  address text,
  postal_code text,
  city text,
  notes text,
  created_at timestamptz not null default now()
);
comment on table public.providers is 'Carnet d''adresses des prestataires du foyer.';

-- ---------------------------------------------------------------------------
-- Fidélité
-- ---------------------------------------------------------------------------
create table public.loyalty_cards (
  id text primary key default private.new_id('loyalty'),
  household_id text not null references public.households (id) on delete cascade,
  member_id text references public.household_members (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  code_type text not null check (code_type in ('barcode', 'qr')),
  code_value text not null,
  brand_color text,
  created_at timestamptz not null default now()
);
comment on table public.loyalty_cards is 'Cartes de fidélité du foyer.';

-- ---------------------------------------------------------------------------
-- Adresses
-- ---------------------------------------------------------------------------
create table public.places (
  id text primary key default private.new_id('place'),
  household_id text not null references public.households (id) on delete cascade,
  type text not null check (type in (
    'restaurant', 'cafe', 'bar', 'hotel', 'boutique', 'parc', 'musee', 'cinema',
    'theatre', 'bien_etre', 'lieu_phare', 'tourisme', 'autre'
  )),
  photo_url text,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  street text,
  postal_code text,
  city text,
  phone text,
  rating smallint check (rating is null or rating between 1 and 5),
  visited boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.places is 'Lieux du foyer, à visiter ou déjà visités.';

-- ---------------------------------------------------------------------------
-- Cercle
-- ---------------------------------------------------------------------------
create table public.posts (
  id text primary key default private.new_id('post'),
  household_id text not null references public.households (id) on delete cascade,
  author_id text not null references public.household_members (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  created_at timestamptz not null default now()
);
comment on table public.posts is 'Fil du Cercle. `author_id` référence household_members.id.';

create table public.post_media (
  id text primary key default private.new_id('post-media'),
  post_id text not null references public.posts (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  url text not null
);
comment on table public.post_media is 'Médias d''une publication.';

create table public.post_comments (
  id text primary key default private.new_id('post-comment'),
  post_id text not null references public.posts (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  author_id text not null references public.household_members (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
comment on table public.post_comments is 'Commentaires du Cercle.';

create table public.post_reactions (
  id text primary key default private.new_id('post-reaction'),
  post_id text not null references public.posts (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  author_id text not null references public.household_members (id) on delete cascade,
  reaction_type text not null default 'coeur',
  created_at timestamptz not null default now(),
  constraint post_reactions_unique unique (post_id, author_id, reaction_type)
);
comment on table public.post_reactions is 'Réactions du Cercle, uniques par auteur et type.';

-- ---------------------------------------------------------------------------
-- Voyages
-- ---------------------------------------------------------------------------
create table public.trips (
  id text primary key default private.new_id('trip'),
  household_id text not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  destination text not null,
  start_date date not null,
  end_date date not null,
  cover_photo text,
  notes text,
  created_at timestamptz not null default now(),
  constraint trips_dates_check check (end_date >= start_date)
);
comment on table public.trips is 'Voyages du foyer.';

-- ---------------------------------------------------------------------------
-- Messages (périmètre réduit : conversations de foyer / direct)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id text primary key default private.new_id('conversation'),
  household_id text not null references public.households (id) on delete cascade,
  type text not null default 'direct' check (type in ('direct', 'groupe')),
  title text,
  created_at timestamptz not null default now()
);
comment on table public.conversations is 'Conversations du foyer.';

create table public.conversation_members (
  conversation_id text not null references public.conversations (id) on delete cascade,
  member_id text not null references public.household_members (id) on delete cascade,
  primary key (conversation_id, member_id)
);
comment on table public.conversation_members is
  'Participants d''une conversation. Accès dérivé de la conversation.';

create table public.messages (
  id text primary key default private.new_id('message'),
  conversation_id text not null references public.conversations (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  sender_id text not null references public.household_members (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  media_url text,
  created_at timestamptz not null default now()
);
comment on table public.messages is 'Messages. `household_id` dénormalisé, aligné par trigger.';

-- ---------------------------------------------------------------------------
-- Widgets du tableau de bord
-- ---------------------------------------------------------------------------
create table public.dashboard_widgets (
  id text primary key default private.new_id('widget'),
  member_id text not null references public.household_members (id) on delete cascade,
  household_id text not null references public.households (id) on delete cascade,
  widget_type text not null
    check (widget_type in ('calendrier', 'taches', 'meteo', 'anniversaires', 'routines')),
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 1 check (width between 1 and 4),
  height integer not null default 1 check (height between 1 and 4),
  settings jsonb,
  constraint dashboard_widgets_member_type_key unique (member_id, widget_type)
);
comment on table public.dashboard_widgets is
  'Préférences personnelles du tableau de bord. Un widget par type et par membre.';

alter table public.expenses enable row level security;
alter table public.external_participants enable row level security;
alter table public.expense_participants enable row level security;
alter table public.gift_lists enable row level security;
alter table public.gift_items enable row level security;
alter table public.birthdays enable row level security;
alter table public.pets enable row level security;
alter table public.pet_records enable row level security;
alter table public.provider_types enable row level security;
alter table public.providers enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.places enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.trips enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.dashboard_widgets enable row level security;

commit;
