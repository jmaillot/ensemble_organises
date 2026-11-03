-- 0176_token_list_governance.sql
-- Phase 31 (inscriptions ouvertes) — fondations du modèle « liste de tokens »
-- (décisions D-14/D-15/D-16) et du RPC de consultation pré-auth (D-02/D-03/D-05).
--
-- Gap : depuis 0006, `create_household_invite_token` invalide le token
-- précédent (modèle « un seul token actif par foyer ») et l'expiration est
-- optionnelle (null = jamais). La phase 31 ouvre les inscriptions : un foyer
-- doit pouvoir créer PLUSIEURS tokens actifs (liste D-14), chaque token porte
-- une expiration (30 jours par défaut, jamais « infini »), et un étranger doit
-- pouvoir consulter un token AVANT inscription sans le consommer (pré-écran
-- D-02, lecture pure D-05, réponse uniforme anti-énumération D-03).
--
-- Cinq blocs, une transaction :
--   0. « jetables » : tous les tokens actifs pré-existants sont désactivés
--      (décision utilisateur : les tokens d'avant les inscriptions ouvertes
--      sont jetables, aucun n'est actif après la migration).
--   1. create_household_invite_token réécrit : le bloc d'invalidation des
--      prédécesseurs (0006:297-301) DISPARAÎT — deux tokens coexistent ;
--      l'expiration devient obligatoire (null → now() + 30 jours, passée →
--      22023, clamp 90 jours conservé). Copie de la définition 0006, jamais
--      d'édition de la migration appliquée (AGENTS §2.7 A).
--   2. revoke_household_invite_token(uuid, text, text) : révocation
--      INDIVIDUELLE, gabarit de la révocation globale 0006:322-342, UPDATE
--      borné à un seul token (id + foyer + actif). Le global
--      revoke_household_invite_tokens reste inchangé.
--   3. household_invite_tokens_list(uuid, text) : liste anonymisée des tokens
--      du foyer (D-15) — JAMAIS token_hash, assert_household_admin en tête.
--   4. preview_household_invite_token(text) : SECURITY DEFINER lecture pure
--      (aucune écriture), résultat vide uniforme pour tout motif d'échec
--      (inconnu / expiré / épuisé / révoqué — D-03), réponse minimale
--      (nom du foyer + prénom de l'inviteur — D-02).
--
-- Discipline search_path vide : toute table est qualifiée public.x ; les
-- colonnes des returns table sont des variables PL/pgSQL, jamais référencées
-- sans préfixe d'alias.

begin;

-- ---------------------------------------------------------------------------
-- 0. Jetables : aucun token pré-existant ne survit à l'ouverture publique.
--    (L'app a toujours reposé sur un token unique régénérable : rien à
--    conserver, décision « jetables » sans cérémonie — SPEC req. 5.)
-- ---------------------------------------------------------------------------
update public.household_invite_tokens
   set is_active = false
 where is_active;

-- ---------------------------------------------------------------------------
-- 1. create_household_invite_token — modèle liste D-14, expiration obligatoire.
--    Copie de la définition effective 0006:286-317, deux différences : le bloc
--    d'invalidation des prédécesseurs est supprimé, et p_expires_at null est
--    approvisionné à now() + 30 jours au lieu de rester null (jamais infini).
-- ---------------------------------------------------------------------------
create or replace function public.create_household_invite_token(
  p_actor_id uuid,
  p_household_id text,
  p_token_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_uses integer;
  v_expires_at timestamptz;
  v_token_id text;
begin
  if p_household_id is null or p_actor_id is null then
    raise exception 'foyer et acteur obligatoires' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte de token invalide' using errcode = '22023';
  end if;

  perform private.assert_household_admin(p_household_id, p_actor_id);

  v_max_uses := least(greatest(coalesce(p_max_uses, 10), 1), 100);

  -- Expiration obligatoire (0176) : null = 30 jours, passé = refus, clamp 90.
  if p_expires_at is null then
    v_expires_at := now() + interval '30 days';
  else
    if p_expires_at <= now() then
      raise exception 'expiration doit être dans le futur' using errcode = '22023';
    end if;
    v_expires_at := least(p_expires_at, now() + interval '90 days');
  end if;

  -- Modèle liste (0176) : le précédent bloc UPDATE invalidant tous les tokens
  -- actifs du foyer a DISPARU — plusieurs tokens actifs coexistent, chacun est
  -- révoqué individuellement par revoke_household_invite_token.

  insert into public.household_invite_tokens (
    household_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_household_id, p_token_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_token_id;

  return jsonb_build_object(
    'token_id', v_token_id,
    'household_id', p_household_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

comment on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Génère un nouveau token d''invitation sans invalider les précédents (modèle liste, 0176) ; expiration obligatoire (30 jours par défaut, clamp 90 jours).';

-- ---------------------------------------------------------------------------
-- 2. Révocation individuelle — gabarit revoke_household_invite_tokens
--    (0006:322-342), UPDATE borné à UN token : même foyer, identifiant visé,
--    encore actif. Un appel hors foyer ou sur un id inconnu touche 0 ligne.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_household_invite_token(
  p_actor_id uuid,
  p_household_id text,
  p_token_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  perform private.assert_household_admin(p_household_id, p_actor_id);

  update public.household_invite_tokens
     set is_active = false
   where id = p_token_id
     and household_id = p_household_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object(
    'household_id', p_household_id,
    'token_id', p_token_id,
    'revoked', v_revoked
  );
end;
$$;

comment on function public.revoke_household_invite_token(uuid, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Révoque UN token (0176) : l''UPDATE est borné au token visé du foyer, les autres tokens actifs restent intacts.';

-- ---------------------------------------------------------------------------
-- 3. Liste anonymisée des tokens du foyer (D-15) : JAMAIS token_hash, JAMAIS
--    de token brut — id, dates, compteurs et statut suffisent au panneau.
-- ---------------------------------------------------------------------------
create or replace function public.household_invite_tokens_list(
  p_actor_id uuid,
  p_household_id text
)
returns table (
  id text,
  created_at timestamptz,
  expires_at timestamptz,
  max_uses integer,
  use_count integer,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_household_admin(p_household_id, p_actor_id);

  return query
    select t.id, t.created_at, t.expires_at, t.max_uses, t.use_count, t.is_active
      from public.household_invite_tokens t
     where t.household_id = p_household_id
     order by t.created_at desc, t.id desc;
end;
$$;

comment on function public.household_invite_tokens_list(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Liste anonymisée des tokens du foyer (D-15) : aucune empreinte, aucune donnée de token brut.';

-- ---------------------------------------------------------------------------
-- 4. Preview pré-auth (D-02/D-03/D-05) : lecture pure pour le pré-écran
--    d'inscription. Le résultat est vide '{}' pour TOUT motif d'échec
--    (inconnu, expiré, épuisé, révoqué, empreinte malformée) — aucune
--    distinction observable, donc aucune énumération possible. Aucune
--    écriture : use_count et is_active restent intacts (D-05), contrairement
--    à redeem qui désactive un token expiré/épuisé.
-- ---------------------------------------------------------------------------
create or replace function public.preview_household_invite_token(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object();
  end if;

  select jsonb_build_object(
    'household_name', h.name,
    'inviter_first_name', split_part(p.display_name, ' ', 1)
  )
    into v_result
    from public.household_invite_tokens t
    join public.households h on h.id = t.household_id
    left join public.profiles p on p.id = t.created_by
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
     and t.is_active
     and (t.expires_at is null or t.expires_at > now())
     and t.use_count < t.max_uses
   limit 1;

  return coalesce(v_result, jsonb_build_object());
end;
$$;

comment on function public.preview_household_invite_token(text) is
  'Consultation pré-auth d''un token (0176) : nom du foyer + prénom de l''inviteur uniquement, résultat vide uniforme sur tout motif d''échec (anti-énumération), AUCUNE écriture sur le token. Comparaison à temps constant via private.token_hash_matches.';

-- ---------------------------------------------------------------------------
-- Privilèges : create / revoke-one / list restent réservés à service_role
-- (Edge household-invite, clé secrète) ; preview est la SEULE fonction
-- pré-auth du lot — exécutable par anon (clé publiable, sans JWT) et
-- authenticated. Le schéma des tokens reste invisible : RLS sans politique.
-- ---------------------------------------------------------------------------
revoke all on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.create_household_invite_token(uuid, text, text, timestamptz, integer) to service_role;

revoke all on function public.revoke_household_invite_token(uuid, text, text) from public, anon, authenticated;
grant execute on function public.revoke_household_invite_token(uuid, text, text) to service_role;

revoke all on function public.household_invite_tokens_list(uuid, text) from public, anon, authenticated;
grant execute on function public.household_invite_tokens_list(uuid, text) to service_role;

revoke all on function public.preview_household_invite_token(text) from public;
grant execute on function public.preview_household_invite_token(text) to anon, authenticated, service_role;

commit;
