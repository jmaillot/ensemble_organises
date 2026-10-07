-- supabase/migrations/0094_gift_member_reserve_name.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-07, fermeture du gap G-06-1b-bis,
-- correctif vers l'avant de 0093, AGENTS.md §2.7.A.1 : 0093 reste au dépôt
-- et raconte ce qui s'est passé).
--
-- POURQUOI 0093 NE POUVAIT PAS FONCTIONNER : stocker l'id membre du foyer
-- d'origine (`reserved_by` = ligne d'un autre foyer) viole l'invariant
-- transverse `validate_member_refs` (0008) — « la référence reserved_by
-- n'appartient pas au foyer » (23514), pour TOUS les rôles, service_role
-- compris. Ce n'est pas le garde 0083 qui coinçait en dernier, c'est le
-- schéma : les références de membre appartiennent au foyer de la ligne,
-- par conception. Prouvé à l'exécution en 0033 (pas à la relecture).
--
-- DONC : la réserve attribuée pose `reserved_by_name` (texte, sans
-- contrainte de foyer) avec le nom d'affichage du PROFIL vérifié côté
-- serveur — jamais un nom déclaré par le client (voie invitée), jamais
-- l'id d'un autre membre (voie directe refusée par le garde, prouvé en
-- 0033 §1). Discipline reprise à l'identique de la voie invitée
-- (0089/0091) : exclusion mutuelle des deux formes d'auteur, `purchased =
-- true` comme signal propriétaire via la vue masquée (D-07 : le nom reste
-- masqué au propriétaire), idempotence à nom normalisé égal (limite D-09
-- documentée, partagée avec les invités), conflit propre `article déjà
-- réservé`, refus unique `réservation non autorisée` sans donnée (T-06-13).
--
-- Cette migration :
--   1. RESTAURE le garde à sa définition effective post-0091, au mot près
--      (l'exemption 0093 devient du code mort qui affaiblissait la défense
--      en profondeur : plus aucun écrivain serveur ne touche `reserved_by`) ;
--   2. REMPLACE `member_reserve_gift_item` par la version attribuée-nom :
--      partage `reservation` vérifié (membre OU e-mail, miroir de
--      `has_gift_reservation`), nom dérivé de `profiles.display_name`
--      (1-80 après rognage, sinon échec fermé `identité inexploitable`).
--
-- AUCUNE politique RLS n'est élargie, AUCUNE colonne n'est ajoutée, le garde
-- clients reste byte-identique : les écritures directes inter-foyers sont
-- toujours refusées (0033 §1, toujours vert après).

begin;

-- ---------------------------------------------------------------------------
-- 1. Garde restaurée (définition effective post-0091, 0089 verbatim).
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
  'Borne les non-gestionnaires (invités reservation) aux colonnes reserved_by/purchased, à leur seul nom ; reserved_by_name est intouchable hors voie serveur (0089, D-08). 0094 restaure cette définition après 0093 : la réserve attribuée inter-foyers passe par reserved_by_name (nom vérifié), jamais par un id membre d''un autre foyer (invariant validate_member_refs, 0008).';

-- ---------------------------------------------------------------------------
-- 2. Réserve attribuée : le nom vient du profil vérifié, le partage donne
--    le droit — le client ne fournit ni l'un ni l'autre.
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
  v_name text;
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

  select p.email, p.display_name into v_email, v_name
    from public.profiles p where p.id = p_actor_id;

  -- Partage `reservation` exigé (un partage `lecture` seul ne réserve pas,
  -- motif 0028 §4) : membre vérifié OU e-mail du compte — miroir exact des
  -- deux formes de `has_gift_reservation` (0083), sans l'élargir. Le foyer
  -- de l'appelant n'importe pas : un membre d'un autre foyer détenant un
  -- partage est légitime (G-06-1b-bis).
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

  -- Identité attribuée : le nom d'affichage du PROFIL (session vérifiée),
  -- jamais un nom déclaré par le client. Borné comme les dossiers (D-06) :
  -- un profil hors bornes ne peut pas être attribué — échec fermé, sans
  -- écrire (ni troncature silencieuse, ni dépassement du CHECK).
  if v_name is null then
    raise exception 'identité de réserve inexploitable' using errcode = '22023';
  end if;
  v_name := btrim(v_name);
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'identité de réserve inexploitable' using errcode = '22023';
  end if;

  if v_item_reserved_by is not null or v_item_reserved_by_name is not null then
    -- Idempotence : rejouer sa propre réserve est un succès — tenue membre
    -- par une de ses lignes, ou tenue attribuée à son nom normalisé (même
    -- limite D-09 que la voie invitée : deux homonymes se confondent).
    -- Toute autre tenue vaut conflit propre, jamais de fuite CHECK (T-06-13).
    if (v_item_reserved_by is not null
        and exists (
          select 1
            from public.household_members m
           where m.id = v_item_reserved_by
             and m.user_id = p_actor_id
        ))
       or (v_item_reserved_by is null
        and lower(btrim(v_item_reserved_by_name)) = lower(v_name)) then
      return jsonb_build_object('item_id', p_item_id, 'already_reserved', true);
    end if;
    raise exception 'article déjà réservé' using errcode = 'P0001';
  end if;

  -- La réserve ne consomme aucun compteur d'invitation (même règle que la
  -- voie invitée, choix verrouillé 0089). `purchased = true` est le signal
  -- que le propriétaire lit via la vue masquée (nom à NULL pour lui),
  -- comme 0091 pour la voie invitée ; la libération gestionnaire efface
  -- déjà les trois colonnes. La voie serveur (uid NULL) écrit
  -- `reserved_by_name` sans être contrainte par le garde (motif 0089) ; le
  -- CHECK d'exclusion mutuelle tient car la ligne était libre.
  update public.gift_items
     set reserved_by_name = v_name,
         purchased = true
   where id = p_item_id;

  return jsonb_build_object('item_id', p_item_id, 'already_reserved', false);
end;
$$;

comment on function public.member_reserve_gift_item(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Réserve attribuée d''un membre authentifié, y compris inter-foyers (G-06-1b-bis, 0094) : partage reservation vérifié, nom dérivé du profil vérifié (jamais déclaré, jamais un autre membre), conflit 409 propre, refus unique sinon. Seul écrivain serveur de reserved_by_name avec guest_reserve_gift_item.';

-- ---------------------------------------------------------------------------
-- Privilèges : RPC serveur au seul `service_role` (motif 0009/0079).
-- Ré-émis après le REPLACE : la redéfinition conserve les droits, cette
-- section les verrouille et les prouve à nouveau.
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
