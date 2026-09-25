-- 0002_tables_identity.sql
-- Identité : foyer, membres, profils, tokens d'invitation, invitations ciblées.
--
-- Rattachement au foyer : `households` est la racine du tenant ; toutes les
-- autres tables métier y sont rattachées par `household_id` ou par leur parent.
-- Clé primaire : `id text` (convention `private.new_id`, cf. 0001).
-- Audit : `created_at` / `updated_at` / `created_by` selon la portée.

begin;

-- ---------------------------------------------------------------------------
-- profiles : profil global, aligné sur auth.users. RLS activée en 0007.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_url text,
  provider text not null check (provider in ('google', 'facebook', 'email')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'Profil applicatif, un par utilisateur Auth. Les colonnes système ne sont pas modifiables par le client.';

-- ---------------------------------------------------------------------------
-- households : racine du tenant.
-- ---------------------------------------------------------------------------
create table public.households (
  id text primary key default private.new_id('household'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  avatar_color text not null default 'accent' check (private.is_member_color(avatar_color)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.households is
  'Foyer : unité de partage de toutes les données du produit.';

-- ---------------------------------------------------------------------------
-- household_members : appartenance au foyer et rôle.
-- `user_id` est nullable pour les profils gérés par un parent (rôle `enfant`).
-- ---------------------------------------------------------------------------
create table public.household_members (
  id text primary key default private.new_id('member'),
  household_id text not null references public.households (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  avatar_url text,
  color_tag text not null default 'accent' check (private.is_member_color(color_tag)),
  role text not null default 'membre' check (role in ('admin', 'membre', 'enfant')),
  created_at timestamptz not null default now(),
  constraint household_members_user_household_key unique (household_id, user_id)
);
comment on table public.household_members is
  'Appartenance au foyer. Les politiques d''écriture interdisent toute escalade de rôle (cf. 0007).';

-- ---------------------------------------------------------------------------
-- household_invite_tokens : empreintes HMAC des tokens d'invitation.
-- RLS activée SANS aucune politique : la table est structurellement invisible
-- pour le client. Création, régénération, révocation et utilisation passent par
-- `public.create_household_invite_token`, `public.revoke_household_invite_tokens`,
-- `public.household_invite_token_summary` et `public.redeem_household_invite_token`,
-- exécutables par `service_role` uniquement, eux-mêmes appelés par l'Edge Function
-- `household-invite`.
-- ---------------------------------------------------------------------------
create table public.household_invite_tokens (
  id text primary key default private.new_id('invite'),
  household_id text not null references public.households (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 10 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint household_invite_tokens_hash_key unique (token_hash),
  constraint household_invite_tokens_uses_check check (use_count <= max_uses)
);
comment on table public.household_invite_tokens is
  'Empreinte HMAC-SHA-256 des tokens d''invitation. Le token brut n''est jamais persisté.';

-- ---------------------------------------------------------------------------
-- invitations : invitations ciblées (partage d'une liste de cadeaux à un
-- externe). Distinctes du token d'accès au foyer.
-- ---------------------------------------------------------------------------
create table public.invitations (
  id text primary key default private.new_id('invitation'),
  household_id text not null references public.households (id) on delete cascade,
  email text,
  phone text,
  role text not null default 'membre' check (role in ('admin', 'membre', 'enfant')),
  status text not null default 'en_attente'
    check (status in ('en_attente', 'acceptee', 'refusee', 'expiree')),
  created_at timestamptz not null default now(),
  constraint invitations_target_check check (
    (email is not null and char_length(btrim(email)) > 0)
    or (phone is not null and char_length(btrim(phone)) > 0)
  )
);
comment on table public.invitations is
  'Invitations ciblées vers une personne extérieure au foyer.';

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invite_tokens enable row level security;
alter table public.invitations enable row level security;

commit;
