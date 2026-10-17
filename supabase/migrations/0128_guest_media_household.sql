-- supabase/migrations/0128_guest_media_household.sql
-- Phase 23 — Un média référencé par une surface invitée est borné à son foyer
-- (plan 23-01 ; ferme le résidu R3 de `21-SECURITY.md`).
--
-- La phase 22 a fermé la surface `recipe-invite` (`0126`, `0127`). Il restait
-- DEUX signeurs invités non bornés, re-vérifiés ouverts sur le code du
-- 2026-10-17 : `gift-list-invite/index.ts:865` et `ardoise-invite/index.ts:645`.
-- Les deux ont la MÊME cause — un chemin brut signé avec le client
-- service-role, donc hors de la politique du bucket
-- `(storage.foldername(name))[1]`, pour un visiteur sans compte que la RLS ne
-- protège pas — mais DEUX remèdes, parce que le foyer n'est pas connu au même
-- endroit. Cette migration prononce le verdict de la surface Cadeaux, là où le
-- foyer est autoritaire : dans le RPC.
--
-- Le foyer est connu DANS la fonction par construction : `v_invite.list_id`
-- désigne une `public.gift_lists` dont `household_id` est le foyer de la liste
-- que l'invité lit. `handleGuestView` (`gift-list-invite/index.ts:873`) appelle
-- ce RPC et signe ce qu'il rend : c'est donc le SEUL chemin par lequel l'Edge
-- obtient une valeur à signer. Filtrer ici ferme la fuite inter-foyers.
--
-- Le foyer retenu est celui de la LISTE, pas celui de l'article : c'est le
-- foyer dont l'invité lit la fiche, même choix que `0127:119-120` (le foyer de
-- la RECETTE, pas celui de l'étape).
--
-- Pourquoi pas une contrainte d'écriture sur `gift_items.photo_url` : la
-- colonne est ANTÉRIEURE à toute borne, sa forme `http(s)` est tolérée
-- (`cadeaux/types.ts:51` : « chemin du bucket pour un dépôt, URL héritée ou
-- `data:` sinon »), et le client réécrit la valeur existante à chaque édition.
-- Une contrainte refuserait l'édition d'une ligne héritée, et `not valid` la
-- rendrait presque inerte (D-02). Le trou n'est pas l'écriture, c'est la
-- SIGNATURE service-role d'un objet d'un autre foyer : le filtre de lecture le
-- ferme, y compris sur une ligne héritée.
--
-- Conséquence assumée sur la surface invitée : une photo `http(s)` héritée
-- n'est plus relayée (D-03). La perte est nulle : le formulaire cadeau n'offre
-- qu'un sélecteur de fichier pour la photo — l'URL distante a sa propre colonne
-- `gift_items.url` — et la forme héritée n'est qu'un reliquat antérieur à la
-- doctrine média de la phase 19.
--
-- Correction VERS L'AVANT : `0092` (et les migrations antérieures) sont
-- APPLIQUÉES, elles ne sont jamais réécrites (AGENTS.md §2.7 A.1). Cette
-- migration ne fait que REMPLACER la définition effective de
-- `public.guest_view_gift_list`. Tout le reste est byte-identique à `0092` :
-- SECURITY DEFINER, search_path vide avec noms pleinement qualifiés,
-- comparaison à temps constant, oracle unique `code invalide` sur tous les
-- états invalides, booléen `reserved` dérivé des auteurs, compteur `use_count`
-- intact, aucune colonne d'auteur dans la charge (D-07).
--
-- Le segment relatif se teste par `strpos(valeur, '..') = 0`, jamais par un
-- motif `like` : les noms déposés sont `file_<uuid>.<ext>` (`randomId('file')`
-- → `file_` + UUID, `storage.ts`) et ne contiennent jamais deux points
-- consécutifs, donc le refus ne touche aucune valeur légitime (`0127:42-47`).
-- `starts_with`, jamais `like` : `household_id` est un texte `household_<uuid>`
-- qui contient `_`, métacaractère `like` (`0126:22-31`). La normalisation d'un
-- `..` par Storage n'est pas observable sur cet hôte (`deno` absent) et n'est
-- PAS supposée : le verdict tombe avant la signature.

begin;

-- ---------------------------------------------------------------------------
-- Lecture invitée par code (D-05/D-06) : aucun JWT requis, aucun compteur
-- touché. Toute forme de code invalide rend l'oracle unique `code invalide`.
-- Le verdict média est prononcé contre le foyer de la LISTE ; le foyer n'est
-- JAMAIS rendu (D-01).
-- ---------------------------------------------------------------------------
create or replace function public.guest_view_gift_list(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.gift_list_invites%rowtype;
  v_list_name text;
  v_list_household text;
  v_items jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Lecture sans verrou : l'état est lu à l'instant, seule la réserve
  -- verrouille (T-06-02). Comparaison à temps constant (motif 0017/0079).
  select t.* into v_invite
    from public.gift_list_invites t
   where t.token_hash = p_token_hash
     and private.token_hash_matches(t.token_hash, p_token_hash);
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_invite.is_active
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- `household_id` est lu ici, et n'est JAMAIS rendu au visiteur :
  -- `jsonb_build_object` garde ses trois seules clés. Le foyer sert uniquement
  -- à prononcer le verdict ci-dessous, contre le foyer de la LISTE — celui dont
  -- l'invité lit la fiche, pas celui de l'article.
  select l.name, l.household_id into v_list_name, v_list_household
    from public.gift_lists l where l.id = v_invite.list_id;
  -- Liste disparue entre-temps (cascade) : oracle uniforme.
  if v_list_name is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Charge invitée (choix verrouillé 3, étendu G-06-1a) : id, nom, prix,
  -- commentaire, lien `url`, chemin `photo_url` borné au foyer de la liste et
  -- un booléen `reserved` — jamais reserved_by ni reserved_by_name (D-07).
  -- Une photo d'un autre foyer, qui remonte par `..`, ou une forme `http(s)`
  -- héritée rend `null` : l'Edge ne reçoit rien à signer (R3).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'price', i.price,
             'comment', i.comment,
             'url', i.url,
             'photo_url', case
               when i.photo_url is null then null
               when starts_with(i.photo_url, v_list_household || '/')
                and strpos(i.photo_url, '..') = 0
                 then i.photo_url
               else null
             end,
             'reserved', (i.reserved_by is not null or i.reserved_by_name is not null)
           )
           order by i.created_at, i.id
         ), '[]'::jsonb)
    into v_items
    from public.gift_items i
   where i.list_id = v_invite.list_id;

  return jsonb_build_object(
    'list_id', v_invite.list_id,
    'list_name', v_list_name,
    'items', v_items
  );
end;
$$;

comment on function public.guest_view_gift_list(text) is
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une liste par code pour un visiteur sans compte (D-05) : rend nom + articles avec booléen reserved, lien url et chemin photo_url BORNE au foyer de la liste (R3/0128), sans identifiant d''auteur (D-07), oracle `code invalide` unique, compteur intact. Le foyer ne sort jamais de la fonction.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- Ré-émis après le REPLACE : la redéfinition conserve les droits, cette
-- section les verrouille et les prouve à nouveau.
-- ---------------------------------------------------------------------------
revoke all on function public.guest_view_gift_list(text) from public, anon, authenticated;
grant execute on function public.guest_view_gift_list(text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.guest_view_gift_list(text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas lire une liste par code en direct';
  end if;
  if not has_function_privilege('service_role', 'public.guest_view_gift_list(text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir lire une liste par code';
  end if;
end;
$$;

commit;
