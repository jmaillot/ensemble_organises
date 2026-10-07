-- supabase/migrations/0092_guest_view_details.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-04, fermeture du gap G-06-1a) : la charge
-- invitée porte le contenu (lien + photo brute), pas seulement un bouton
-- réserver.
--
-- POURQUOI : le rapport UAT réservait deux cadeaux à l'aveugle — nom +
-- réserve OK, mais aucun contenu visible. Cette migration étend
-- `public.guest_view_gift_list` avec deux clés par objet article : `url`
-- (depuis `public.gift_items.url`) et `photo_url` (valeur brute stockée dans
-- `public.gift_items.photo_url` : chemin relatif au bucket `household-media`
-- ou URL http(s) héritée, telle quelle — la base ne mûrit rien, ne signe
-- rien : c'est l'Edge `gift-list-invite` qui forge une `photoUrl` éphémère
-- par requête, en échec fermé vers null).
--
-- Corriger vers l'avant uniquement (AGENTS.md §2.7.A.1) : 0089/0091 et
-- antérieurs INCHANGÉS. Cette migration ne fait que REMPLACER la définition
-- effective de `public.guest_view_gift_list`. Tout le reste est
-- byte-identique à 0089 : SECURITY DEFINER, search_path vide avec noms
-- pleinement qualifiés, comparaison à temps constant, oracle unique
-- `code invalide` sur tous les états invalides, booléen `reserved` dérivé
-- des auteurs, compteur `use_count` intact, aucune colonne d'auteur dans la
-- charge (D-07).

begin;

-- ---------------------------------------------------------------------------
-- Lecture invitée par code (D-05/D-06) : aucun JWT requis, aucun compteur
-- touché. Toute forme de code invalide rend l'oracle unique `code invalide`.
-- Depuis 0092 (G-06-1a) : chaque objet article porte aussi `url` et la
-- valeur brute `photo_url` — jamais reserved_by ni reserved_by_name (D-07).
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

  select l.name into v_list_name
    from public.gift_lists l where l.id = v_invite.list_id;
  -- Liste disparue entre-temps (cascade) : oracle uniforme.
  if v_list_name is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Charge invitée (choix verrouillé 3, étendu G-06-1a) : id, nom, prix,
  -- commentaire, lien `url`, valeur brute `photo_url` et un booléen
  -- `reserved` — jamais reserved_by ni reserved_by_name (D-07).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'price', i.price,
             'comment', i.comment,
             'url', i.url,
             'photo_url', i.photo_url,
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
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une liste par code pour un visiteur sans compte (D-05) : rend nom + articles avec booléen reserved, lien url et valeur brute photo_url (G-06-1a), sans identifiant d''auteur (D-07), oracle `code invalide` unique, compteur intact.';

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
