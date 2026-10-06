-- supabase/migrations/0089_gift_guest_reserve.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-01, tracer D-05/D-06/D-07/D-08) : réserve
-- anonyme de bout en bout au niveau données + Edge.
--
-- Fichiers 0079/0080/0083 INCHANGÉS (corriger vers l'avant, AGENTS.md §2.7.A.1 ;
-- choix de schéma verrouillés tâche 1 du plan) : cette migration ajoute
-- seulement, par-dessus, la colonne d'auteur anonyme, l'extension de la vue
-- masquée, l'extension du garde et les deux RPC invités.
--
-- Choix verrouillés (tâche 1) :
--   1. `gift_items.reserved_by_name` texte nullable à côté du FK membre
--      `reserved_by`, avec exclusion mutuelle (un seul auteur par ligne
--      réservée ; « libre » = les deux NULL).
--   2. Les réserves ne consomment JAMAIS `use_count` (le compteur borne les
--      échanges redeem, pas les réserves).
--   3. La charge invitée n'expose qu'un booléen `reserved`, jamais les
--      identifiants d'auteur.
--   4. La libération reste un UPDATE gestionnaire des deux colonnes à NULL,
--      sans RPC dédié.
--
-- Secret HMAC `GIFT_LIST_INVITE_HMAC_SECRET` : comme en 0079, cette migration
-- n'en stocke que le NOM. Les empreintes arrivent déjà calculées par l'Edge
-- Function ; ni la valeur, ni le calcul, ni le brut ne transitent ici.

begin;

-- ---------------------------------------------------------------------------
-- Colonne d'auteur anonyme + exclusion mutuelle (D-05, D-07).
-- ---------------------------------------------------------------------------
alter table public.gift_items
  add column reserved_by_name text
    check (reserved_by_name is null or char_length(btrim(reserved_by_name)) between 1 and 80);

alter table public.gift_items
  add constraint gift_items_single_author_check
    check (not (reserved_by is not null and reserved_by_name is not null));

comment on column public.gift_items.reserved_by_name is
  'Nom auto-déclaré d''un visiteur sans compte ayant réservé l''article (D-05). Exclusif avec reserved_by (FK membre) : un seul auteur par ligne. Écrit uniquement par le RPC invité service_role ; masqué au propriétaire par la vue gift_items_for_list (D-07).';

-- ---------------------------------------------------------------------------
-- Vue masquée étendue (D-07) : le propriétaire ne voit ni reserved_by ni
-- reserved_by_name — seulement « réservé » via la charge invitée / l'UI.
-- La nouvelle colonne est AJOUTÉE EN FIN de liste : CREATE OR REPLACE VIEW
-- apparie les colonnes par position, une insertion au milieu renommerait
-- purchased (erreur 42P16). Les lecteurs sélectionnent par nom : sans impact.
-- ---------------------------------------------------------------------------
create or replace view public.gift_items_for_list
with (security_invoker = true) as
select
  i.id,
  i.list_id,
  i.household_id,
  i.name,
  i.price,
  i.comment,
  i.photo_url,
  i.url,
  case
    when l.owner_member_id = private.current_member_id(l.household_id)
    then null
    else i.reserved_by
  end as reserved_by,
  i.purchased,
  i.idea_id,
  i.created_at,
  case
    when l.owner_member_id = private.current_member_id(l.household_id)
    then null
    else i.reserved_by_name
  end as reserved_by_name
from public.gift_items i
join public.gift_lists l on l.id = i.list_id;

comment on view public.gift_items_for_list is
  'Lecture des articles avec reserved_by ET reserved_by_name masqués (NULL) au propriétaire de la liste (T-05-03, D-07). SECURITY INVOKER : la RLS des tables filtre toujours les lignes. L''UI lit ici, jamais la table brute.';

revoke all on table public.gift_items_for_list from anon;
grant select on table public.gift_items_for_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Garde étendue (D-08) : un non-gestionnaire authentifié ne touche JAMAIS à
-- reserved_by_name (42501) — seul le RPC service_role l'écrit. La règle
-- existante reserved_by = soi-ou-NULL est inchangée.
-- ---------------------------------------------------------------------------
create or replace function private.guard_gift_item_reserve()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_me text;
begin
  if private.can_write_gift_list(NEW.list_id) then
    return NEW;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.list_id is distinct from OLD.list_id
     or NEW.household_id is distinct from OLD.household_id
     or NEW.name is distinct from OLD.name
     or NEW.price is distinct from OLD.price
     or coalesce(NEW.comment, '') is distinct from coalesce(OLD.comment, '')
     or coalesce(NEW.photo_url, '') is distinct from coalesce(OLD.photo_url, '')
     or coalesce(NEW.url, '') is distinct from coalesce(OLD.url, '')
     or coalesce(NEW.idea_id, '') is distinct from coalesce(OLD.idea_id, '') then
    raise exception 'modification non autorisee sur cet article' using errcode = '42501';
  end if;

  -- Auteur anonyme : écriture réservée à la voie serveur (RPC invités en
  -- service_role, sans identité JWT — auth.uid() y vaut NULL, la clé secrète
  -- n'ayant pas de `sub`). Les gardes clients ne s'appliquent pas aux rôles
  -- serveur (motif 0081) ; la libération gestionnaire est déjà sortie plus
  -- haut via can_write_gift_list. Tout client présentant une identité qui
  -- touche cette colonne est refusé, y compris pour libérer (D-08 : seul
  -- l'organisateur libère).
  if NEW.reserved_by_name is distinct from OLD.reserved_by_name
     and auth.uid() is not null then
    raise exception 'reserve anonyme modifiable par la voie invitee uniquement' using errcode = '42501';
  end if;

  if NEW.reserved_by is distinct from OLD.reserved_by then
    select l.household_id into v_household_id
      from public.gift_lists l where l.id = NEW.list_id;
    v_me := private.current_member_id(v_household_id);
    if NEW.reserved_by is not null and NEW.reserved_by is distinct from v_me then
      raise exception 'reservation au nom d''un autre membre interdite' using errcode = '42501';
    end if;
  end if;

  return NEW;
end;
$$;

comment on function private.guard_gift_item_reserve() is
  'Borne les non-gestionnaires (invités reservation) aux colonnes reserved_by/purchased, à leur seul nom ; reserved_by_name est intouchable hors voie serveur (0089, D-08).';

-- ---------------------------------------------------------------------------
-- Lecture invitée par code (D-05/D-06) : aucun JWT requis, aucun compteur
-- touché. Toute forme de code invalide rend l'oracle unique `code invalide`.
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

  -- Charge invitée (choix verrouillé 3) : id, nom, prix, commentaire et un
  -- booléen `reserved` — jamais reserved_by ni reserved_by_name (D-07).
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'price', i.price,
             'comment', i.comment,
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
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une liste par code pour un visiteur sans compte (D-05) : rend nom + articles avec booléen reserved, sans identifiant d''auteur (D-07), oracle `code invalide` unique, compteur intact.';

-- ---------------------------------------------------------------------------
-- Réserve anonyme par code + nom déclaré (D-05/D-06).
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
  update public.gift_items
     set reserved_by_name = v_name
   where id = p_item_id;

  return jsonb_build_object('item_id', p_item_id, 'already_reserved', false);
end;
$$;

comment on function public.guest_reserve_gift_item(text, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Réserve anonyme par code + nom déclaré (D-05/D-06) : atomique, idempotente à nom égal, conflit 409 sinon, oracle `code invalide` unique, compteur intact.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- ---------------------------------------------------------------------------
revoke all on function public.guest_view_gift_list(text) from public, anon, authenticated;
revoke all on function public.guest_reserve_gift_item(text, text, text) from public, anon, authenticated;
grant execute on function public.guest_view_gift_list(text) to service_role;
grant execute on function public.guest_reserve_gift_item(text, text, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.guest_view_gift_list(text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas lire une liste par code en direct';
  end if;
  if has_function_privilege('authenticated', 'public.guest_reserve_gift_item(text,text,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas réserver en anonyme en direct';
  end if;
  if not has_function_privilege('service_role', 'public.guest_view_gift_list(text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir lire une liste par code';
  end if;
  if not has_function_privilege('service_role', 'public.guest_reserve_gift_item(text,text,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir réserver en anonyme';
  end if;
end;
$$;

commit;
