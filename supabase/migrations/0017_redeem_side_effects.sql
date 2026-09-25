-- 0017_redeem_side_effects.sql
-- Retire deux effets de bord impossibles : ils étaient annulés par l'exception
-- qui les suivait.
--
-- Constat (campagne de tests du 25/09/2026) : « un token expiré est désactivé
-- au moment de l'échange » échouait, `is_active` valant toujours `true`. Sur
-- un token expiré, `redeem_household_invite_token` faisait :
--
--     update public.household_invite_tokens set is_active = false where id = …;
--     raise exception 'token expiré';
--
-- L'`update` et le `raise` appartiennent à la MÊME instruction. L'exception
-- remonte, la transaction est annulée, et l'UPDATE avec elle. La désactivation
-- n'avait donc jamais eu lieu — le code affichait une intention, pas un
-- comportement. Même situation sur le cas « token épuisé ».
--
-- Ce n'est pas exploitable : chaque échange revérifie `expires_at` et
-- `use_count`, donc un token périmé reste refusé quoi qu'il arrive. C'est
-- simplement une propreté qui n'existait pas, et un commentaire qui mentait.
--
-- Le nettoyage appartient à `private.prune_expired_invite_tokens`, que
-- `pg_cron` exécute chaque jour (migration 0011) — c'est le seul endroit où
-- une désactivation peut réellement être committée, parce qu'aucune exception
-- n'y interrompt le traitement.
--
-- Le comportement de sécurité est inchangé : la ligne reste verrouillée
-- (`for update`) pendant les contrôles, l'échange reste atomique, et le
-- compteur `use_count` n'est incrémenté que sur un échange réussi.

begin;

create or replace function public.redeem_household_invite_token(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text default null,
  p_role text default 'membre'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.household_invite_tokens%rowtype;
  v_member_id text;
  v_role text;
  v_color text;
begin
  if p_user_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'token invalide' using errcode = '22023';
  end if;

  -- Un token d'invitation n'attribue jamais le rôle `admin` : le client ne peut
  -- pas s'attribuer un privilège (AGENTS.md §2.6).
  v_role := case when p_role in ('enfant') then 'enfant' else 'membre' end;

  -- Verrou pessimiste : deux utilisations simultanées du même token ne peuvent
  -- pas franchir `use_count < max_uses`. La ligne est d'abord localisée par
  -- l'index sur `token_hash`, puis la comparaison est refaie à temps constant.
  select t.* into v_token
    from public.household_invite_tokens t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash)
   for update;

  if not found then
    raise exception 'token inconnu' using errcode = '22023';
  end if;
  if not v_token.is_active then
    raise exception 'token révoqué' using errcode = '22023';
  end if;

  -- Ni ici ni plus bas, un `update` ne peut être suivi d'un `raise` : les deux
  -- sont dans la même instruction, l'exception annule l'UPDATE. La désactivation
  -- d'un token périmé ou épuisé est donc laissée à
  -- `private.prune_expired_invite_tokens` (pg_cron, quotidien). Ces deux refus
  -- restent, évidemment — seule la désactivation illusoire disparaît.
  if v_token.expires_at is not null and v_token.expires_at <= now() then
    raise exception 'token expiré' using errcode = '22023';
  end if;
  if v_token.use_count >= v_token.max_uses then
    raise exception 'token épuisé' using errcode = '22023';
  end if;

  -- Déjà membre : l'utilisation n'est pas comptabilisée (idempotence).
  select m.id into v_member_id
    from public.household_members m
   where m.household_id = v_token.household_id
     and m.user_id = p_user_id;

  if v_member_id is not null then
    return jsonb_build_object(
      'household_id', v_token.household_id,
      'member_id', v_member_id,
      'already_member', true
    );
  end if;

  v_color := (array['accent', 'ink', 'coral', 'amber', 'violet'])[
    1 + (select count(*) from public.household_members where household_id = v_token.household_id) % 5
  ];

  v_member_id := private.new_id('member');

  insert into public.household_members (
    id, household_id, user_id, display_name, avatar_url, color_tag, role
  ) values (
    v_member_id,
    v_token.household_id,
    p_user_id,
    coalesce(nullif(btrim(p_display_name), ''), 'Nouveau membre'),
    p_avatar_url,
    v_color,
    v_role
  );

  update public.household_invite_tokens
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_token.id;

  return jsonb_build_object(
    'household_id', v_token.household_id,
    'member_id', v_member_id,
    'already_member', false
  );
end;
$$;

comment on function public.redeem_household_invite_token(text, uuid, text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Échange un token contre une ligne household_members, en transaction. Un token périmé ou épuisé est refusé ; sa désactivation revient à private.prune_expired_invite_tokens.';

commit;
