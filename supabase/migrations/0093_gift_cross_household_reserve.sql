-- supabase/migrations/0093_gift_cross_household_reserve.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-07, fermeture du gap G-06-1b-bis) :
-- réserve attribuée inter-foyers au niveau données + Edge.
--
-- POURQUOI : un membre qui rejoint une liste d'un autre foyer (redeem avec
-- son e-mail, branche externe 0082) détient un partage `reservation` mais
-- ne peut ni voir la liste dans sa vue (mur côté client, plan 06-07 tâche 2)
-- ni réserver : le garde `guard_gift_item_reserve` (0083) refuse toute
-- écriture directe de `reserved_by` avec un id membre qui n'est pas celui
-- du foyer de la liste — prouvé en 0033 §1 AVANT ce changement. L'Edge seul
-- ne peut pas couvrir le chemin : le garde est un trigger, il s'applique à
-- tous les rôles, y compris `service_role`.
--
-- Corriger vers l'avant uniquement (AGENTS.md §2.7.A.1) : 0083/0089/0091/
-- 0092 et antérieurs INCHANGÉS. Cette migration :
--   1. exempte la voie serveur (`auth.uid() IS NULL`, c'est-à-dire les RPC
--      `service_role`) du seul contrôle `reserved_by = soi-du-foyer` — les
--      écritures clientes (uid non null) restent bornées comme avant, et la
--      colonne `reserved_by_name` reste intouchable hors voie invitée (0089) ;
--   2. ajoute le RPC `member_reserve_gift_item`, seul écrivain serveur de
--      cette colonne : il vérifie un partage `reservation` (membre ou e-mail,
--      comme `has_gift_reservation`), attribue l'identité du membre vérifié
--      (celui du foyer de la liste s'il existe, sinon une ligne membre de
--      l'appelant), pose `purchased = true` (signal propriétaire via la vue
--      masquée, comme 0091), rend un conflit propre `article déjà réservé`
--      (jamais de fuite CHECK) avec idempotence à membre égal, et refuse
--      tout le reste par `réservation non autorisée` unique (article inconnu,
--      liste disparue, sans partage, partage `lecture` seul, sans identité).
--
-- AUCUNE politique RLS n'est élargie : les SELECT/UPDATE sur gift_lists et
-- gift_items sont inchangés, les écritures directes clientes inter-foyers
-- restent refusées par le garde (prouvé en 0033 §1, toujours vert après).

begin;

-- ---------------------------------------------------------------------------
-- Garde étendue : la voie serveur attribue l'identité, les clients restent
-- bornés à leur seul nom du foyer de la liste.
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

  -- Auteur membre : un client (uid non null) ne réserve qu'à son nom du
  -- foyer de la liste (0083, inchangé — prouvé en 0033 §1). La voie serveur
  -- (uid NULL : RPC service_role) attribue elle-même l'identité vérifiée :
  -- `member_reserve_gift_item` est le seul écrivain serveur de cette colonne,
  -- il a vérifié le partage `reservation` avant d'écrire. Sans cette
  -- exemption, aucun rôle ne pourrait poser un id membre d'un autre foyer,
  -- pas même le serveur (le trigger s'applique à tous les rôles).
  if NEW.reserved_by is distinct from OLD.reserved_by
     and auth.uid() is not null then
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
  'Borne les non-gestionnaires (invités reservation) aux colonnes reserved_by/purchased, à leur seul nom du foyer de la liste ; reserved_by_name est intouchable hors voie serveur (0089, D-08). Depuis 0093 : la voie serveur (uid NULL) attribue reserved_by via member_reserve_gift_item, seul écrivain serveur (G-06-1b-bis).';

-- ---------------------------------------------------------------------------
-- Réserve attribuée d'un membre authentifié, y compris inter-foyers.
-- ---------------------------------------------------------------------------
create or replace function public.member_reserve_gift_item(
  p_actor_id uuid,
  p_item_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item_list_id text;
  v_item_reserved_by text;
  v_item_reserved_by_name text;
  v_household_id text;
  v_email text;
  v_chosen_member text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  -- Identifiant inconnu, vide ou d'une autre liste : refus unique, sans
  -- distinguer (même discipline d'oracle que la voie invitée — T-06-13 :
  -- jamais de donnée dans un refus).
  if p_item_id is null or p_item_id = '' then
    raise exception 'réservation non autorisée' using errcode = '42501';
  end if;

  -- Verrou pessimiste sur l'article : deux réserves concurrentes du même
  -- article ne passent pas le contrôle « libre » ensemble (motif 0089).
  select i.list_id, i.reserved_by, i.reserved_by_name
    into v_item_list_id, v_item_reserved_by, v_item_reserved_by_name
    from public.gift_items i
   where i.id = p_item_id
   for update;
  if not found then
    raise exception 'réservation non autorisée' using errcode = '42501';
  end if;

  select l.household_id into v_household_id
    from public.gift_lists l where l.id = v_item_list_id;
  -- Liste disparue entre-temps (cascade) : même refus, rien de plus.
  if v_household_id is null then
    raise exception 'réservation non autorisée' using errcode = '42501';
  end if;

  select p.email into v_email
    from public.profiles p where p.id = p_actor_id;

  -- Partage `reservation` exigé (un partage `lecture` seul ne réserve pas,
  -- motif 0028 §4) : membre vérifié OU e-mail du compte — miroir exact des
  -- deux formes de `has_gift_reservation` (0083), sans l'élargir.
  if not exists (
    select 1
      from public.gift_list_shares s
     where s.list_id = v_item_list_id
       and s.permission = 'reservation'
       and (
         exists (
           select 1
             from public.household_members m
            where m.id = s.shared_with_member_id
              and m.user_id = p_actor_id
         )
         or s.shared_with_email = v_email
       )
  ) then
    raise exception 'réservation non autorisée' using errcode = '42501';
  end if;

  -- Identité attribuée : le membre de l'appelant dans le foyer de la liste
  -- s'il y est membre (cohérent avec la voie cliente directe), sinon une de
  -- ses lignes membre (appelant d'un autre foyer — G-06-1b-bis). Un appelant
  -- sans aucune ligne membre (externe par e-mail seul, sans foyer) n'a pas
  -- d'identité membre à attribuer : refus net, sans donnée.
  select m.id into v_chosen_member
    from public.household_members m
   where m.user_id = p_actor_id
   order by (m.household_id = v_household_id) desc, m.created_at, m.id
   limit 1;
  if v_chosen_member is null then
    raise exception 'réservation non autorisée' using errcode = '42501';
  end if;

  if v_item_reserved_by is not null or v_item_reserved_by_name is not null then
    -- Idempotence à membre égal : rejouer sa propre réserve est un succès,
    -- sans erreur. Toute autre tenue (autre membre ou nom anonyme) vaut
    -- conflit propre — jamais de fuite de violation CHECK (T-06-13).
    if v_item_reserved_by is not null
       and exists (
         select 1
           from public.household_members m
          where m.id = v_item_reserved_by
            and m.user_id = p_actor_id
       ) then
      return jsonb_build_object('item_id', p_item_id, 'already_reserved', true);
    end if;
    raise exception 'article déjà réservé' using errcode = 'P0001';
  end if;

  -- La réserve ne consomme aucun compteur d'invitation (même règle que la
  -- voie invitée, choix verrouillé 0089). `purchased = true` est le signal
  -- que le propriétaire lit via la vue masquée (auteurs à NULL pour lui),
  -- comme 0091 pour la voie invitée ; la libération gestionnaire efface
  -- déjà les trois colonnes. L'exclusion mutuelle des deux formes d'auteur
  -- (contrainte gift_items_single_author_check) tient : la ligne était libre.
  update public.gift_items
     set reserved_by = v_chosen_member,
         purchased = true
   where id = p_item_id;

  return jsonb_build_object('item_id', p_item_id, 'already_reserved', false);
end;
$$;

comment on function public.member_reserve_gift_item(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Réserve attribuée d''un membre authentifié (G-06-1b-bis) : partage reservation vérifié, identité membre dérivée de la session, conflit 409 propre, refus unique sinon. Seul écrivain serveur de reserved_by.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- ---------------------------------------------------------------------------
revoke all on function public.member_reserve_gift_item(uuid, text) from public, anon, authenticated;
grant execute on function public.member_reserve_gift_item(uuid, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.member_reserve_gift_item(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas réserver en membre attribué en direct';
  end if;
  if not has_function_privilege('service_role', 'public.member_reserve_gift_item(uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir réserver en membre attribué';
  end if;
end;
$$;

commit;
