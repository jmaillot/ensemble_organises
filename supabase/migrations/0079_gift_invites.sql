-- 0079_gift_invites.sql
-- Phase 05 Cadeaux-Contacts (plan 05-02) : invitations à code pour les listes
-- de cadeaux (D-15, D-16, D-17), clone de la famille invite ardoise
-- (0058, lignes 332-547).
--
-- Table `gift_list_invites` : empreintes HMAC des codes de partage d'une
-- liste. RLS activée SANS aucune politique + GRANT verrouillés (motif 0009)
-- : la table est structurellement invisible et inscriptible pour
-- anon/authenticated, seuls les RPC `service_role` ci-dessous y touchent,
-- eux-mêmes appelés par l'Edge Function (plan 05-03).
--
-- Gestion (diffère de l'ardoise créateur-ou-admin) : le PROPRIÉTAIRE de la
-- liste OU un admin du foyer, revérifié dans chaque RPC — même une Edge
-- compromise ne peut agir pour un non-gestionnaire.
--
-- Bornes (D-15) : empreinte 64-hex, `max_uses` 1-100, `expires_at` dans le
-- futur et ≤ now()+90j. Défauts : `expires_at` = now()+90j, `max_uses` = 20.
-- La régénération désactive aussitôt le code précédent DE CETTE LISTE.
--
-- Échange (D-16, D-17) : verrou FOR UPDATE + comparaison temps constant via
-- `private.token_hash_matches`, message oracle unique `code invalide`
-- (inconnu, malformé, expiré, épuisé, révoqué, liste disparue, sans
-- destinataire). L'échange insère un partage `gift_list_shares` en
-- permission `reservation` (jamais `lecture` seule, jamais admin) dans la
-- même transaction ; un membre (ou e-mail) déjà partagé rejoue sans
-- consommer `use_count` (idempotence).
--
-- Secret HMAC `GIFT_LIST_INVITE_HMAC_SECRET` : cette migration n'en stocke
-- que le NOM. L'empreinte arrive déjà calculée par l'Edge Function (Vault,
-- provisionnement : gate du plan 05-03) ; ni la valeur, ni le calcul, ni le
-- brut ne transitent par ce fichier.

begin;

-- ---------------------------------------------------------------------------
-- Table gift_list_invites
-- ---------------------------------------------------------------------------
create table public.gift_list_invites (
  id text primary key default private.new_id('gift-invite'),
  list_id text not null references public.gift_lists (id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer not null default 20 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint gift_list_invites_hash_key unique (token_hash),
  constraint gift_list_invites_uses_check check (use_count <= max_uses)
);
comment on table public.gift_list_invites is
  'Empreinte HMAC-SHA-256 des codes de partage d''une liste de cadeaux. Le code brut n''est jamais persisté ; secret GIFT_LIST_INVITE_HMAC_SECRET (Vault, plan 05-03).';

create index gift_list_invites_list_idx on public.gift_list_invites (list_id, is_active);

-- RLS activée SANS politique : inatteignable pour un client (motif 0002/0009).
alter table public.gift_list_invites enable row level security;

-- La migration 0009 accorde par défaut CRUD aux tables créées ensuite : on
-- verrouille explicitement, comme pour household_invite_tokens.
revoke all on table public.gift_list_invites from anon, authenticated;
revoke all on table public.gift_list_invites from public;
grant all on table public.gift_list_invites to service_role;

-- ---------------------------------------------------------------------------
-- Création / régénération (propriétaire OU admin du foyer).
-- ---------------------------------------------------------------------------
create or replace function public.create_gift_list_invite(
  p_actor_id uuid,
  p_list_id text,
  p_token_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_max_uses integer;
  v_expires_at timestamptz;
  v_invite_id text;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  v_max_uses := coalesce(p_max_uses, 20);
  if v_max_uses < 1 or v_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;

  if p_expires_at is null then
    v_expires_at := now() + interval '90 days';
  else
    if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
      raise exception 'expiration invalide' using errcode = '22023';
    end if;
    v_expires_at := p_expires_at;
  end if;

  -- Régénération : le code précédent de CETTE liste est désactivé aussitôt.
  update public.gift_list_invites
     set is_active = false
   where list_id = p_list_id
     and is_active;

  insert into public.gift_list_invites (
    list_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_list_id, p_token_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'list_id', p_list_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

comment on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Crée un code de partage (HMAC GIFT_LIST_INVITE_HMAC_SECRET calculé par l''Edge) et désactive le précédent de la liste. Gestion : propriétaire ou admin.';

-- ---------------------------------------------------------------------------
-- Révocation (propriétaire OU admin du foyer).
-- ---------------------------------------------------------------------------
create or replace function public.revoke_gift_list_invite(
  p_actor_id uuid,
  p_list_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_revoked integer;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  update public.gift_list_invites
     set is_active = false
   where list_id = p_list_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object('list_id', p_list_id, 'revoked', v_revoked);
end;
$$;

comment on function public.revoke_gift_list_invite(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Révoque tous les codes actifs de la liste. Gestion : propriétaire ou admin.';

-- ---------------------------------------------------------------------------
-- Résumé (propriétaire OU admin du foyer, sans jamais rendre l'empreinte).
-- ---------------------------------------------------------------------------
create or replace function public.gift_list_invite_summary(
  p_actor_id uuid,
  p_list_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_out jsonb;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  -- Appelée en `service_role` (sans JWT) : l'acteur est le paramètre, jamais
  -- auth.uid(), qui serait NULL ici et fermerait tout (motif 0058).
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'invite_id', t.id,
           'list_id', t.list_id,
           'is_active', t.is_active,
           'expires_at', t.expires_at,
           'max_uses', t.max_uses,
           'use_count', t.use_count,
           'created_at', t.created_at
         )
    into v_out
    from public.gift_list_invites t
   where t.list_id = p_list_id
   order by t.created_at desc
   limit 1;

  return v_out;
end;
$$;

comment on function public.gift_list_invite_summary(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Résumé du dernier code de la liste, sans son empreinte.';

-- ---------------------------------------------------------------------------
-- Échange d'un code contre un partage `reservation` (D-16, D-17).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_gift_list_invite(
  p_token_hash text,
  p_actor_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.gift_list_invites%rowtype;
  v_household_id text;
  v_member_id text;
  v_email text;
  v_existing text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux échanges simultanés du même code ne peuvent pas
  -- franchir `use_count < max_uses`. La ligne est d'abord localisée par
  -- l'index sur `token_hash`, puis la comparaison est refaite à temps
  -- constant (motif 0017).
  select t.* into v_invite
    from public.gift_list_invites t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
   for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_invite.is_active
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select l.household_id into v_household_id
    from public.gift_lists l where l.id = v_invite.list_id;
  -- La liste a pu disparaître entre-temps (cascade) : oracle uniforme, le
  -- client n'apprend rien de plus que sur un code inconnu.
  if v_household_id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer : partage idempotent, sans consommer le compteur.
  if p_actor_id is not null then
    select m.id into v_member_id
      from public.household_members m
     where m.household_id = v_household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      select s.id into v_existing
        from public.gift_list_shares s
       where s.list_id = v_invite.list_id
         and s.shared_with_member_id = v_member_id
       limit 1;
      if v_existing is not null then
        return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
      end if;

      insert into public.gift_list_shares (list_id, shared_with_member_id, permission)
      values (v_invite.list_id, v_member_id, 'reservation');

      update public.gift_list_invites
         set use_count = use_count + 1,
             is_active = (use_count + 1 < max_uses)
       where id = v_invite.id;

      return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
    end if;
  end if;

  -- Externe par e-mail : même idempotence, même compteur. Un acteur d'un
  -- autre foyer sans e-mail tombe ici aussi : oracle uniforme.
  if p_email is null or btrim(p_email) = '' then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'adresse e-mail invalide' using errcode = '22023';
  end if;

  select s.id into v_existing
    from public.gift_list_shares s
   where s.list_id = v_invite.list_id
     and lower(btrim(s.shared_with_email)) = v_email
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
  end if;

  insert into public.gift_list_shares (list_id, shared_with_email, permission)
  values (v_invite.list_id, v_email, 'reservation');

  update public.gift_list_invites
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_invite.id;

  return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
end;
$$;

comment on function public.redeem_gift_list_invite(text, uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un code contre un partage `reservation` (membre du foyer ou e-mail externe), atomique et idempotent, oracle `code invalide` unique.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0058).
-- ---------------------------------------------------------------------------
revoke all on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_gift_list_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.gift_list_invite_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_gift_list_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_gift_list_invite(uuid, text) to service_role;
grant execute on function public.gift_list_invite_summary(uuid, text) to service_role;
grant execute on function public.redeem_gift_list_invite(text, uuid, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.create_gift_list_invite(uuid,text,text,timestamptz,integer)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir créer une invitation de liste';
  end if;
  if has_function_privilege('authenticated', 'public.redeem_gift_list_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir échanger un code de liste';
  end if;
  if not has_function_privilege('service_role', 'public.redeem_gift_list_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir échanger un code de liste';
  end if;
end;
$$;

commit;
