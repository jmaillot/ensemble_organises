-- 0180_ardoise_bridge_token.sql
-- Phase 40 — Pont invité ardoise → foyer (« Rejoindre via mon compte »).
--
-- Deux objets, une transaction :
--   1. Table private.ardoise_bridge_identities : la table pont d'identité
--      (décision OPTION B verrouillée, 40-CONTEXT) — à l'émission d'un token
--      bridge, l'Edge ardoise-invite y enregistre les guests de l'ardoise
--      présentée pour l'utilisateur demandeur. Le redeem (plan 40-02) la
--      consomme pour réconcilier expense_participants invite: → membre:.
--      Types : les identifiants métier sont `text` (private.new_id, 0002/0055)
--      — SEUL user_id est `uuid` (auth.users). Le plan parlait d'uuid partout ;
--      les types effectifs du schéma priment (FK impossibles sinon).
--   2. Fonction public.create_household_bridge_token : émission d'un token
--      d'invitation foyer à usage unique, borné (max_uses=1, 15 minutes en
--      dur), réservée à service_role. Elle ne vérifie PAS l'adhésion à un
--      foyer (private.assert_household_admin) : c'est précisément pour un
--      invité SANS foyer qu'elle existe — l'autorisation vient de l'Edge
--      (session utilisateur + code de partage ardoise validé, hash HMAC).

begin;

-- ---------------------------------------------------------------------------
-- 1. Table pont d'identité (schéma private : inaccessible aux rôles API,
--    aucun besoin de RLS — 0006 et les tables private préexistantes).
--    Aucune colonne household_id n'est ajoutée aux tables de partage ardoise
--    (ardoises, ardoise_guests) : ARD-03, espaces de clés distincts.
-- ---------------------------------------------------------------------------
create table private.ardoise_bridge_identities (
  id uuid primary key default gen_random_uuid(),
  household_id text not null references public.households (id) on delete cascade,
  ardoise_id text not null references public.ardoises (id) on delete cascade,
  guest_id text not null references public.ardoise_guests (id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  -- Idempotence : l'émission bridge peut tourner deux fois (deux tokens
  -- distincts pour un même code), le remplissage pont ne duplique pas.
  constraint ardoise_bridge_identities_user_guest_key unique (user_id, guest_id)
);

comment on table private.ardoise_bridge_identities is
  'Pont d''identité invité→utilisateur (phase 40, OPTION B) : rempli par l''Edge ardoise-invite à l''émission d''un token bridge, consommé par redeem_household_invite_token (0181) pour réconcilier les participations invitées en participations membres.';

-- ---------------------------------------------------------------------------
-- 2. RPC d'émission bridge token — USAGE SERVEUR UNIQUEMENT.
--    Forme miroir de create_household_invite_token (0176) SANS
--    assert_household_admin : l'appelant est un invité sans foyer. Les bornes
--    (max_uses=1, 15 minutes) sont EN DUR dans la fonction : aucun paramètre
--    ne peut les élargir (menace T-40-02).
-- ---------------------------------------------------------------------------
create function public.create_household_bridge_token(
  p_household_id text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id text;
  v_expires_at timestamptz;
begin
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash de token invalide' using errcode = '22000';
  end if;

  if not exists (
    select 1 from public.households h where h.id = p_household_id
  ) then
    raise exception 'foyer inconnu' using errcode = 'P0002';
  end if;

  -- Bornes en dur (A3 accepté) : usage unique, 15 minutes.
  v_expires_at := now() + interval '15 minutes';

  insert into public.household_invite_tokens (
    household_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_household_id, p_token_hash, null, v_expires_at, 1, 0, true
  )
  returning id into v_token_id;

  return jsonb_build_object(
    'id', v_token_id,
    'expires_at', v_expires_at
  );
end;
$$;

comment on function public.create_household_bridge_token(text, text) is
  'USAGE SERVEUR UNIQUEMENT — émission bridge invité→foyer, appelée par l''Edge ardoise-invite (service_role). Token à usage unique (max_uses=1), expiration 15 minutes en dur ; ne vérifie PAS l''adhésion à un foyer (l''invité n''en a pas) — l''autorisation vient de l''Edge.';

-- ---------------------------------------------------------------------------
-- 3. Privilèges : service_role seul (0009/0176, menace T-40-02). Un client
--    porteur d'un JWT utilisateur est `authenticated` et se voit refuser
--    l'appel — contrôle négatif prouvé après application.
-- ---------------------------------------------------------------------------
revoke all on function public.create_household_bridge_token(text, text) from public, anon, authenticated;
grant execute on function public.create_household_bridge_token(text, text) to service_role;

commit;
