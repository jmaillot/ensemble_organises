-- supabase/migrations/0096_gift_member_release.sql
--
-- Phase 06 Cadeaux-Invites (plan 06-14, fermeture du gap G-06-23) : un membre
-- peut RELÂCHER sa propre tenue attribuée sur une liste étrangère via la
-- même voie serveur — `member_reserve_gift_item` devient réserve-ou-libère,
-- sous identité vérifiée, sans élargir ni la RLS ni le garde.
--
-- CONTRAT (même signature, `service_role` seul, jamais d'identité fournie) :
--   article libre                                        → tenue au nom vérifié
--                                                          de l'appelant,
--                                                          `purchased = true`
--                                                          (inchangé, 0094) ;
--   article tenu au nom vérifié de l'appelant (nom
--   normalisé égal, OU `reserved_by` = une de ses
--   lignes membre — même définition du « mien » que
--   l'idempotence 0094)                                 → libération (les deux
--                                                          formes d'auteur
--                                                          effacées,
--                                                          `purchased = false`,
--                                                          `released = true`) ;
--   article tenu sous tout autre nom ou id membre        → conflit propre
--                                                          `article déjà
--                                                          réservé` (même 409
--                                                          que la voie
--                                                          invitée, jamais de
--                                                          donnée d'auteur —
--                                                          T-06-23).
--
-- Le contrôle de partage est inchangé : un partage `reservation` (membre OU
-- e-mail, miroir de `has_gift_reservation`) est exigé AVANT toute écriture —
-- la lecture seule ne libère jamais (D-04 amendée intacte). Le nom reste
-- dérivé de `profiles.display_name` (1-80 rogné, sinon échec fermé), jamais
-- déclaré par le client (T-06-23). AUCUNE politique RLS n'est élargie, AUCUNE
-- colonne n'est ajoutée, le garde clients reste byte-identique.
--
-- Vers l'avant uniquement (AGENTS.md §2.7.A.1) : 0093/0094/0095 restent au
-- dépôt et racontent ce qui s'est passé.

begin;

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
  v_mine boolean;
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

  -- Verrou pessimiste sur l'article : une réserve et une libération
  -- concurrentes du même article ne passent pas le contrôle ensemble
  -- (motif 0089).
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

  -- Partage `reservation` exigé (un partage `lecture` seul ne réserve ni ne
  -- libère, motif 0028 §4) : membre vérifié OU e-mail du compte — miroir
  -- exact des deux formes de `has_gift_reservation` (0083), sans l'élargir.
  -- Le foyer de l'appelant n'importe pas : un membre d'un autre foyer
  -- détenant un partage est légitime (G-06-1b-bis).
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
  -- un profil hors bornes ne peut ni tenir ni libérer — échec fermé, sans
  -- écrire (ni troncature silencieuse, ni dépassement du CHECK).
  if v_name is null then
    raise exception 'identité de réserve inexploitable' using errcode = '22023';
  end if;
  v_name := btrim(v_name);
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'identité de réserve inexploitable' using errcode = '22023';
  end if;

  -- Le « mien » (G-06-23) reprend la définition de l'idempotence 0094 : la
  -- tenue membre passe par une de ses lignes, la tenue attribuée par son nom
  -- normalisé (même limite D-09 que la voie invitée : deux homonymes se
  -- confondent — le serveur ne distingue pas mieux qu'avant).
  v_mine := (v_item_reserved_by is not null
       and exists (
         select 1
           from public.household_members m
          where m.id = v_item_reserved_by
            and m.user_id = p_actor_id
       ))
      or (v_item_reserved_by is null
       and v_item_reserved_by_name is not null
       and lower(btrim(v_item_reserved_by_name)) = lower(v_name));

  if v_item_reserved_by is not null or v_item_reserved_by_name is not null then
    -- Tenue d'autrui : conflit propre, données inchangées, jamais de fuite
    -- CHECK ni de donnée d'auteur (T-06-13, T-06-23).
    if not v_mine then
      raise exception 'article déjà réservé' using errcode = 'P0001';
    end if;
    -- Ma tenue : libération (G-06-23) — les deux formes d'auteur sont
    -- effacées et le signal propriétaire retombe, comme la libération
    -- organisatrice (D-08). La voie serveur (uid NULL) écrit
    -- `reserved_by_name` sans être contrainte par le garde (motif 0089).
    update public.gift_items
       set reserved_by = null,
           reserved_by_name = null,
           purchased = false
     where id = p_item_id;
    return jsonb_build_object('item_id', p_item_id, 'already_reserved', false, 'released', true);
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

  return jsonb_build_object('item_id', p_item_id, 'already_reserved', false, 'released', false);
end;
$$;

comment on function public.member_reserve_gift_item(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Réserve-ou-libère d''un membre authentifié, y compris inter-foyers (G-06-1b-bis, 0094 ; G-06-23, 0096) : partage reservation vérifié, nom dérivé du profil vérifié (jamais déclaré, jamais un autre membre) ; libre→tenue, mienne→libération, autrui→409 sans donnée. Seul écrivain serveur de reserved_by_name avec guest_reserve_gift_item.';

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
