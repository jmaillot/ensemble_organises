-- 0180b_ardoise_bridge_fill.sql
-- Phase 40 — Correctif VERS L'AVANT (0180 n'est jamais réécrite, AGENTS §2.7-A).
--
-- Défaut découvert à l'exécution (plan 40-01, Task 3) : le plan confiait à
-- l'Edge ardoise-invite le remplissage de private.ardoise_bridge_identities.
-- Or PostgREST n'expose que `public` et `graphql_public` (PGRST_DB_SCHEMAS) :
-- le client `service_role` de l'Edge ne peut PAS toucher une table du schéma
-- private. Le remplissage pont descend donc DANS le RPC — une seule écriture
-- transactionnelle (token + pont), et l'Edge ne fait qu'un appel.
--
-- Signature étendue : p_ardoise_id et p_user_id remplissent le pont pour les
-- guests de CETTE ardoise. L'ancienne signature 3-arguments est supprimée :
-- elle n'a jamais eu d'appelant (émission bridge de ce plan uniquement).

begin;

drop function public.create_household_bridge_token(text, text);

create function public.create_household_bridge_token(
  p_household_id text,
  p_token_hash text,
  p_ardoise_id text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_id text;
  v_expires_at timestamptz;
  v_ardoise public.ardoises%rowtype;
begin
  if p_household_id is null or p_ardoise_id is null or p_user_id is null then
    raise exception 'foyer, ardoise et utilisateur obligatoires' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash de token invalide' using errcode = '22000';
  end if;

  if not exists (
    select 1 from public.households h where h.id = p_household_id
  ) then
    raise exception 'foyer inconnu' using errcode = 'P0002';
  end if;

  -- Cohérence pont : l'ardoise existe, est ACTIVE et appartient bien au
  -- foyer déclaré. Un appelant mensonger ne peut pas créer de token pour un
  -- foyer qu'il ne contrôle pas via une ardoise d'un autre foyer.
  select * into v_ardoise
    from public.ardoises a
   where a.id = p_ardoise_id
     and a.household_id = p_household_id
     and a.is_active;
  if not found then
    raise exception 'ardoise inconnue pour ce foyer' using errcode = 'P0002';
  end if;

  -- Bornes en dur (A3 accepté) : usage unique, 15 minutes.
  v_expires_at := now() + interval '15 minutes';

  insert into public.household_invite_tokens (
    household_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_household_id, p_token_hash, null, v_expires_at, 1, 0, true
  )
  returning id into v_token_id;

  -- Pont d'identité (OPTION B) : TOUS les guests de l'ardoise sont rattachés
  -- à l'utilisateur demandeur — le redeem (0181) convertira les
  -- expense_participants invite: → membre: pour CE couple user+guest.
  -- Upsert idempotent sur la contrainte unique (user_id, guest_id).
  insert into private.ardoise_bridge_identities (household_id, ardoise_id, guest_id, user_id)
  select v_ardoise.household_id, v_ardoise.id, g.id, p_user_id
    from public.ardoise_guests g
   where g.ardoise_id = v_ardoise.id
  on conflict (user_id, guest_id) do nothing;

  return jsonb_build_object(
    'id', v_token_id,
    'expires_at', v_expires_at
  );
end;
$$;

comment on function public.create_household_bridge_token(text, text, text, uuid) is
  'USAGE SERVEUR UNIQUEMENT — émission bridge invité→foyer, appelée par l''Edge ardoise-invite (service_role). Token à usage unique (max_uses=1), expiration 15 minutes en dur ; remplit la table pont private.ardoise_bridge_identities pour les guests de l''ardoise (OPTION B), atomiquement avec l''émission. Ne vérifie PAS l''adhésion à un foyer (l''invité n''en a pas) — l''autorisation vient de l''Edge.';

-- Privilèges : la nouvelle signature reprend le régime 0180 (service_role seul).
revoke all on function public.create_household_bridge_token(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_household_bridge_token(text, text, text, uuid) to service_role;

commit;
