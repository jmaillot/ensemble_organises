-- supabase/migrations/0091_guest_reserve_purchased.sql
--
-- Phase 06 Cadeaux-Invites (suivi CR-01 de 06-REVIEW.md, moitié serveur ;
-- la moitié cliente est déjà corrigée en types.ts/cadeaux-page.tsx).
--
-- POURQUOI (D-07/D-08) : `guest_reserve_gift_item` (0089) ne posait que
-- `reserved_by_name`, mais la vue masquée `gift_items_for_list` expose au
-- propriétaire `i.purchased` avec les colonnes d'auteur à NULL — une tenue
-- anonyme restait donc invisible à l'organisateur, et le contrôle « Libérer »
-- (affiché seulement si `purchased`) n'apparaissait jamais pour elle. Poser
-- `purchased = true` dans le même UPDATE atomique donne au propriétaire le
-- signal qu'il lit déjà, sans rien révéler de l'auteur (D-07 : le nom déclaré
-- reste masqué, la charge invitée reste un booléen).
--
-- Conséquences vérifiées avant d'écrire (ne pas ré-dériver, prouvé en 0031) :
--   - la branche idempotente « même nom » est inchangée : la ligne porte déjà
--     `purchased = true` depuis la première réserve ;
--   - la libération gestionnaire envoie déjà
--     `{reserved_by: null, purchased: false, reserved_by_name: null}`
--     (handleRelease) : elle efface les trois colonnes, rien à changer ;
--   - le garde `guard_gift_item_reserve` ne restreint pas `purchased`, et le
--     RPC tourne en service_role avec auth.uid() NULL : aucun refus 42501 ;
--   - le booléen invité `reserved` reste fondé sur les auteurs, indépendant
--     de `purchased`.
--
-- Corriger vers l'avant uniquement (AGENTS.md §2.7.A.1) : 0089 et antérieurs
-- INCHANGÉS. Cette migration ne fait que REMPLACER la définition effective
-- de `public.guest_reserve_gift_item`.

begin;

-- ---------------------------------------------------------------------------
-- Réserve anonyme par code + nom déclaré (D-05/D-06), identique à 0089 sauf
-- le UPDATE final qui pose aussi `purchased = true` (CR-01, signal
-- propriétaire via la vue masquée).
-- ---------------------------------------------------------------------------
create or replace function public.guest_reserve_gift_item(
  p_token_hash text,
  p_item_id text,
  p_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.gift_list_invites%rowtype;
  v_item_list_id text;
  v_item_reserved_by text;
  v_item_reserved_by_name text;
  v_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux échanges simultanés du même code ne peuvent pas
  -- franchir les contrôles d'état ensemble (motif 0079).
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

  if p_item_id is null or p_item_id = '' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste sur l'article : deux réserves concurrentes du même
  -- article ne passent pas le contrôle « libre » ensemble (T-06-02).
  select i.list_id, i.reserved_by, i.reserved_by_name
    into v_item_list_id, v_item_reserved_by, v_item_reserved_by_name
    from public.gift_items i
   where i.id = p_item_id
   for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  -- Pas de fuite inter-listes : un article d'une autre liste vaut code inconnu.
  if v_item_list_id is distinct from v_invite.list_id then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Nom déclaré : obligatoire, borné comme les dossiers (D-06). Message
  -- NON-oracle : il ne révèle rien de la validité du code (T-06-03).
  if p_name is null then
    raise exception 'nom invalide' using errcode = '22023';
  end if;
  v_name := btrim(p_name);
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'nom invalide' using errcode = '22023';
  end if;

  if v_item_reserved_by is not null or v_item_reserved_by_name is not null then
    -- Idempotence : même nom normalisé sur le même article → succès rejoué,
    -- sans erreur et sans compteur. D-09 : deux visiteurs déclarant le même
    -- nom se confondent — limite acceptée et documentée, pas bloquée.
    if v_item_reserved_by is null
       and lower(btrim(v_item_reserved_by_name)) = lower(v_name) then
      return jsonb_build_object('item_id', p_item_id, 'already_reserved', true);
    end if;
    raise exception 'article déjà réservé' using errcode = 'P0001';
  end if;

  -- La réserve ne consomme JAMAIS use_count : le compteur borne les échanges
  -- (redeem), pas les réserves — un invité légitime réserve N articles
  -- (choix verrouillé 2). L'anti-abus = rate-limit Edge + modération D-08.
  --
  -- CR-01 : `purchased = true` est le signal que le propriétaire lit via la
  -- vue masquée (auteurs à NULL pour lui). La libération gestionnaire efface
  -- déjà les trois colonnes ; le booléen invité `reserved` reste fondé sur
  -- les auteurs et n'en dépend pas.
  update public.gift_items
     set reserved_by_name = v_name,
         purchased = true
   where id = p_item_id;

  return jsonb_build_object('item_id', p_item_id, 'already_reserved', false);
end;
$$;

comment on function public.guest_reserve_gift_item(text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Réserve anonyme par code + nom déclaré (D-05/D-06) : atomique, idempotente à nom égal, conflit 409 sinon, oracle `code invalide` unique, compteur intact. Depuis 0091 (CR-01) : pose aussi purchased = true, signal lu par le propriétaire via la vue masquée (D-07).';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- Ré-émis après le REPLACE : la redéfinition conserve les droits, cette
-- section les verrouille et les prouve à nouveau.
-- ---------------------------------------------------------------------------
revoke all on function public.guest_reserve_gift_item(text, text, text) from public, anon, authenticated;
grant execute on function public.guest_reserve_gift_item(text, text, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.guest_reserve_gift_item(text,text,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas réserver en anonyme en direct';
  end if;
  if not has_function_privilege('service_role', 'public.guest_reserve_gift_item(text,text,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir réserver en anonyme';
  end if;
end;
$$;

commit;
