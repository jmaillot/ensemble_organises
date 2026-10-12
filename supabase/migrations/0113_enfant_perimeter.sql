-- 0113_enfant_perimeter.sql
-- Phase 14 perimetre enfants (D-01…D-04, plan 14-01) : fermeture serveur des
-- 5 modules au role `enfant` — ardoises (+members/guests), expenses
-- (+participants), gift_lists/items/shares/ideas/invites, loyalty_cards,
-- provider_types/providers (+attachments), pets/records (+attachments).
--
-- INVENTAIRE PREALABLE (sonde RED 14-01, supprimee apres preuve) : avant
-- cette migration, l'enfant lisait CHAQUE table listee (18/18 sondes a >= 1
-- ligne, foyer + privee a son nom + inscrit compris) ; ecritures directes
-- deja refusees partout (can_write_household admin/membre, prouve par
-- 0002/0009/0024/0048/0050 — verifiees intactes ici, jamais churnees).
-- Aucune table pre-securisee en lecture : tout ce qui suit resserre.
--
-- LECTURES (D-01) : deux formes, une seule raison.
--   * Tables a perimetre membre (flats, ardoises, depenses, idees) :
--     `is_household_member` → `can_write_household` (helper existant,
--     aucune fonction neuve — membres et admins byte-identiques, l'enfant
--     est le seul role membre exclu).
--   * gift_lists/items/shares : `can_read_gift_list` est AUSSI la porte des
--     partages inter-foyers explicites (0033 : un externe detenant un
--     partage lit sans appartenir au foyer — `household_role` y vaut NULL).
--     Exiger `can_write_household` ici casserait 0033 ; la porte devient
--     donc `can_read_gift_list(...) AND household_role(...) IS DISTINCT
--     FROM 'enfant'` — fonction existante, NULL-safe pour les externes,
--     prouve necessaire par 0033 (vert apres). C'est la seule entorse a la
--     lettre de D-01, et elle preserve exactement son esprit.
-- ECRITURES (D-02) : verifiees une a une ; resserrees les seules branches
-- qui fuyaient — proprietaire/createur enfant (gift_lists_update/delete,
-- gift_items insert/delete, shares insert/update/delete, garde trigger,
-- can_admin_expense cote ardoise). L'update gift_items 0083 (USING
-- `can_write OR has_reservation`, prouve par 0033 §1) n'est PAS touche en
-- politique — y ajouter un conjonct ecrivain transformerait le refus
-- trigger des externes en 0-ligne silencieuse et casserait 0033 ; c'est le
-- garde trigger qui porte le refus enfant (voie serveur uid NULL inchangee).
-- ACTIONS (D-03) : les RPC service_role resolvent le role depuis p_actor_id
-- (session verifiee par l'Edge, jamais un claim client) et refusent
-- l'enfant — gestion exige ecrivain (403 inchange cote Edge), echange sous
-- oracle `code invalide`/`ardoise introuvable` (404 inchanges), reserve
-- `non autorisee` (403 inchange), soldes `inscription requise` (42501
-- inchange). `member_leave_gift_list` (0095) INCHANGE : il refuse deja tout
-- membre du foyer de la liste (dont tout enfant du foyer — oracle uniforme)
-- et ne supprime que les parts propres de l'appelant sans rien reveler ;
-- un enfant hors foyer y est un externe comme un autre, refuser sa sortie
-- piegerait ses donnees sans rien proteger.
-- DONNEES (D-04) : aucun backfill, aucune suppression — les lignes enfant
-- preexistantes deviennent invisibles (prouve en 0051 : toujours presentes
-- cote serveur, illisibles pour l'enfant).
-- CHEMINS AUDITES SANS CHANGEMENT (tache 3) : vue gift_items_for_list
-- (SECURITY INVOKER, suit la RLS — 0 ligne enfant prouve), RPC invites
-- anonymes (sans identite, ouverts par construction — byte-identiques
-- prouves), contacts/anniversaires/widgets (hors perimetre, intacts
-- prouves), notifications (birthdays/messages/rappels taches-routines-event
-- : aucune source des 5 modules — audit de code), Storage household-media
-- (lecture `is_household_member` conservee : les chemins ne sont pas
-- namespaces par module, restreindre bloquerait aussi Cercle/Messages des
-- enfants — hors perimetre ; les URL des 5 modules sont masquees par les
-- gates tables, les URL signees restent imprévisibles).
--
-- Vers l'avant uniquement : aucun fichier applique retouche, signatures
-- RPC inchangees, GRANT re-emis a l'identique.

begin;

-- ---------------------------------------------------------------------------
-- A. Lectures : flats membre → ecrivain (D-01, helper existant)
-- ---------------------------------------------------------------------------
drop policy if exists pets_select_household on public.pets;
create policy pets_select_household on public.pets
  for select using (private.can_write_household(household_id));

drop policy if exists pet_records_select_household on public.pet_records;
create policy pet_records_select_household on public.pet_records
  for select using (private.can_write_household(household_id));

drop policy if exists pet_attachments_select_household on public.pet_attachments;
create policy pet_attachments_select_household on public.pet_attachments
  for select using (private.can_write_household(household_id));

drop policy if exists provider_types_select_household on public.provider_types;
create policy provider_types_select_household on public.provider_types
  for select using (private.can_write_household(household_id));

drop policy if exists providers_select_household on public.providers;
create policy providers_select_household on public.providers
  for select using (private.can_write_household(household_id));

drop policy if exists provider_attachments_select_household on public.provider_attachments;
create policy provider_attachments_select_household on public.provider_attachments
  for select using (private.can_write_household(household_id));

drop policy if exists loyalty_cards_select_household on public.loyalty_cards;
create policy loyalty_cards_select_household on public.loyalty_cards
  for select using (private.can_write_household(household_id));

-- ---------------------------------------------------------------------------
-- B. Lectures : ardoises + depenses → ecrivain (membre/admin identiques)
-- ---------------------------------------------------------------------------
drop policy if exists ardoises_select on public.ardoises;
create policy ardoises_select on public.ardoises
  for select using (private.can_write_household(household_id));

drop policy if exists ardoise_members_select on public.ardoise_members;
create policy ardoise_members_select on public.ardoise_members
  for select using (
    private.can_write_household(private.ardoise_household_id(ardoise_id))
  );

drop policy if exists ardoise_guests_select on public.ardoise_guests;
create policy ardoise_guests_select on public.ardoise_guests
  for select using (
    private.can_write_household(private.ardoise_household_id(ardoise_id))
  );

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (
    private.can_write_household(household_id)
    and (
      private.is_household_admin(household_id)
      or private.is_ardoise_member(ardoise_id)
    )
  );

-- ---------------------------------------------------------------------------
-- C. Lectures : cadeaux — porte partage + refus enfant (0033 preserve,
--    household_role existant, NULL-safe pour les externes non membres)
-- ---------------------------------------------------------------------------
drop policy if exists gift_lists_select on public.gift_lists;
create policy gift_lists_select on public.gift_lists
  for select using (
    private.can_read_gift_list(id)
    and private.household_role(household_id) is distinct from 'enfant'
  );

drop policy if exists gift_items_select on public.gift_items;
create policy gift_items_select on public.gift_items
  for select using (
    private.can_read_gift_list(list_id)
    and private.household_role(private.gift_list_household_id(list_id)) is distinct from 'enfant'
  );

drop policy if exists gift_list_shares_select on public.gift_list_shares;
create policy gift_list_shares_select on public.gift_list_shares
  for select using (
    private.can_read_gift_list(list_id)
    and private.household_role(private.gift_list_household_id(list_id)) is distinct from 'enfant'
  );

drop policy if exists gift_ideas_select on public.gift_ideas;
create policy gift_ideas_select on public.gift_ideas
  for select using (
    private.can_write_household(household_id)
    and private.can_read_gift_idea(id)
  );

-- ---------------------------------------------------------------------------
-- D. Ecritures : branches proprietaire/createur enfant resserrees (D-02).
--    Le reste (can_write/admin) est verifie intact en 0051, jamais churné.
-- ---------------------------------------------------------------------------
drop policy if exists gift_lists_update on public.gift_lists;
create policy gift_lists_update on public.gift_lists
  for update using (
    private.can_write_gift_list(id)
    and private.can_write_household(household_id)
  )
  with check (
    private.can_write_gift_list(id)
    and private.member_in_household(owner_member_id, household_id)
    and private.can_write_household(household_id)
  );

drop policy if exists gift_lists_delete on public.gift_lists;
create policy gift_lists_delete on public.gift_lists
  for delete using (
    private.can_manage_gift_list(id)
    and private.can_write_household(household_id)
  );

drop policy if exists gift_items_insert on public.gift_items;
create policy gift_items_insert on public.gift_items
  for insert with check (
    private.can_write_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
    and private.member_in_household(
      coalesce(reserved_by, private.current_member_id(private.gift_list_household_id(list_id))),
      private.gift_list_household_id(list_id)
    )
  );

-- NOTE : gift_items_update (0083, USING can_write OR has_reservation)
-- volontairement inchange en politique — cf. en-tete : le garde trigger
-- ci-dessous porte le refus enfant, 0033 §1 reste byte-identique.

drop policy if exists gift_items_delete on public.gift_items;
create policy gift_items_delete on public.gift_items
  for delete using (
    private.can_write_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
  );

drop policy if exists gift_list_shares_insert on public.gift_list_shares;
create policy gift_list_shares_insert on public.gift_list_shares
  for insert with check (
    private.can_manage_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
    and (
      shared_with_member_id is null
      or private.member_in_household(
        shared_with_member_id, private.gift_list_household_id(list_id)
      )
    )
  );

drop policy if exists gift_list_shares_update on public.gift_list_shares;
create policy gift_list_shares_update on public.gift_list_shares
  for update using (
    private.can_manage_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
  )
  with check (
    private.can_manage_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
  );

drop policy if exists gift_list_shares_delete on public.gift_list_shares;
create policy gift_list_shares_delete on public.gift_list_shares
  for delete using (
    private.can_manage_gift_list(list_id)
    and private.can_write_household(private.gift_list_household_id(list_id))
  );

-- Suppression depense/parts : admin OU createur — desormais ecrivain aussi
-- (l'enfant createur d'une ardoise preexistante ne supprime plus).
create or replace function private.can_admin_expense(p_expense_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.expenses e
      join public.ardoises a on a.id = e.ardoise_id
     where e.id = p_expense_id
       and private.can_write_household(e.household_id)
       and (
         private.is_household_admin(e.household_id)
         or a.created_by = private.current_member_id(e.household_id)
       )
  );
$$;

comment on function private.can_admin_expense(text) is
  'Suppression depense/parts : admin du foyer OU createur de l''ardoise, desormais ecrivain dans les deux cas (0113 : enfant createur exclu).';

-- ---------------------------------------------------------------------------
-- E. Garde trigger articles : voie gestionnaire ecrivain, refus enfant direct
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
  -- Phase 14 (0113) : la voie gestionnaire exige le role ecrivain — un
  -- enfant proprietaire ne modifie plus en direct, comme en politique.
  if private.can_write_gift_list(NEW.list_id)
     and private.can_write_household(private.gift_list_household_id(NEW.list_id)) then
    return NEW;
  end if;

  -- Phase 14 (0113) : un enfant detenteur d'un partage ne modifie rien en
  -- direct — la reserve passe par le RPC attribue. Voie serveur (uid NULL)
  -- inchangee (motif 0089) : le test ne porte que sur l'identite presente.
  if auth.uid() is not null
     and private.household_role(private.gift_list_household_id(NEW.list_id)) = 'enfant' then
    raise exception 'réserve enfant refusée : voie attribuée uniquement' using errcode = '42501';
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
  'Borne les non-gestionnaires aux colonnes de reserve, a leur seul nom ; reserved_by_name intouchable hors voie serveur (0089, D-08). 0113 : voie gestionnaire ecrivain (enfant proprietaire exclu) et refus enfant en direct (voie attribuee uniquement).';

-- ---------------------------------------------------------------------------
-- F. Invitations cadeaux : gestion ecrivain, echange oracle, reserve attribuee (D-03)
-- ---------------------------------------------------------------------------

create or replace function public.create_gift_list_invite(
  p_actor_id uuid,
  p_list_id text,
  p_token_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_max_uses integer;
  v_expires_at timestamptz;
  v_invite_id text;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  -- Phase 14 (0113) : la gestion exige le role ecrivain — un enfant
  -- proprietaire ne gere plus les codes (D-03, meme 403 cote Edge).
  perform private.assert_household_writer(v_household_id, p_actor_id);

  v_max_uses := coalesce(p_max_uses, 20);
  if v_max_uses < 1 or v_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;

  if p_expires_at is null then
    v_expires_at := now() + interval '90 days';
  else
    if p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
      raise exception 'expiration invalide' using errcode = '22023';
    end if;
    v_expires_at := p_expires_at;
  end if;

  -- Régénération : le code précédent de CETTE liste est désactivé aussitôt.
  update public.gift_list_invites
     set is_active = false
   where list_id = p_list_id
     and is_active;

  insert into public.gift_list_invites (
    list_id, token_hash, created_by, expires_at, max_uses, use_count, is_active
  ) values (
    p_list_id, p_token_hash, p_actor_id, v_expires_at, v_max_uses, 0, true
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'list_id', p_list_id,
    'expires_at', v_expires_at,
    'max_uses', v_max_uses
  );
end;
$$;

create or replace function public.revoke_gift_list_invite(
  p_actor_id uuid,
  p_list_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_revoked integer;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  -- Phase 14 (0113) : la gestion exige le role ecrivain — un enfant
  -- proprietaire ne gere plus les codes (D-03, meme 403 cote Edge).
  perform private.assert_household_writer(v_household_id, p_actor_id);

  update public.gift_list_invites
     set is_active = false
   where list_id = p_list_id
     and is_active;

  get diagnostics v_revoked = row_count;

  return jsonb_build_object('list_id', p_list_id, 'revoked', v_revoked);
end;
$$;

create or replace function public.gift_list_invite_summary(
  p_actor_id uuid,
  p_list_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_owner_member_id text;
  v_member_id text;
  v_role text;
  v_out jsonb;
begin
  if p_actor_id is null or p_list_id is null then
    raise exception 'acteur et liste obligatoires' using errcode = '22023';
  end if;

  select l.household_id, l.owner_member_id into v_household_id, v_owner_member_id
    from public.gift_lists l where l.id = p_list_id;
  if v_household_id is null then
    raise exception 'liste introuvable' using errcode = 'P0002';
  end if;

  -- Appelée en `service_role` (sans JWT) : l'acteur est le paramètre, jamais
  -- auth.uid(), qui serait NULL ici et fermerait tout (motif 0058).
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_member_id is distinct from v_owner_member_id
     and v_role is distinct from 'admin' then
    raise exception 'gestion de la liste réservée' using errcode = '42501';
  end if;

  -- Phase 14 (0113) : la gestion exige le role ecrivain — un enfant
  -- proprietaire ne gere plus les codes (D-03, meme 403 cote Edge).
  perform private.assert_household_writer(v_household_id, p_actor_id);

  select jsonb_build_object(
           'invite_id', t.id,
           'list_id', t.list_id,
           'is_active', t.is_active,
           'expires_at', t.expires_at,
           'max_uses', t.max_uses,
           'use_count', t.use_count,
           'created_at', t.created_at
         )
    into v_out
    from public.gift_list_invites t
   where t.list_id = p_list_id
   order by t.created_at desc
   limit 1;

  return v_out;
end;
$$;

create or replace function public.redeem_gift_list_invite(
  p_token_hash text,
  p_actor_id uuid default null,
  p_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.gift_list_invites%rowtype;
  v_household_id text;
  v_member_id text;
  v_role text;
  v_email text;
  v_existing text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux échanges simultanés du même code ne peuvent pas
  -- franchir `use_count < max_uses`. La ligne est d'abord localisée par
  -- l'index sur `token_hash`, puis la comparaison est refaite à temps
  -- constant (motif 0017).
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

  select l.household_id into v_household_id
    from public.gift_lists l where l.id = v_invite.list_id;
  -- La liste a pu disparaître entre-temps (cascade) : oracle uniforme, le
  -- client n'apprend rien de plus que sur un code inconnu.
  if v_household_id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer : partage idempotent, sans consommer le compteur.
  -- Phase 14 (0113) : un enfant membre n'echange plus — oracle `code
  -- invalide` unique, comme tout code inconnu (D-03).
  if p_actor_id is not null then
    select m.id, m.role into v_member_id, v_role
      from public.household_members m
     where m.household_id = v_household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      if v_role = 'enfant' then
        raise exception 'code invalide' using errcode = 'P0002';
      end if;
      select s.id into v_existing
        from public.gift_list_shares s
       where s.list_id = v_invite.list_id
         and s.shared_with_member_id = v_member_id
       limit 1;
      if v_existing is not null then
        return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
      end if;

      insert into public.gift_list_shares (list_id, shared_with_member_id, permission)
      values (v_invite.list_id, v_member_id, 'reservation');

      update public.gift_list_invites
         set use_count = use_count + 1,
             is_active = (use_count + 1 < max_uses)
       where id = v_invite.id;

      return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
    end if;
  end if;

  -- Externe par e-mail : même idempotence, même compteur. Un acteur d'un
  -- autre foyer sans e-mail tombe ici aussi : oracle uniforme.
  if p_email is null or btrim(p_email) = '' then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'adresse e-mail invalide' using errcode = '22023';
  end if;

  select s.id into v_existing
    from public.gift_list_shares s
   where s.list_id = v_invite.list_id
     and lower(btrim(s.shared_with_email)) = v_email
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', true);
  end if;

  insert into public.gift_list_shares (list_id, shared_with_email, permission)
  values (v_invite.list_id, v_email, 'reservation');

  update public.gift_list_invites
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_invite.id;

  return jsonb_build_object('list_id', v_invite.list_id, 'already_shared', false);
end;
$$;

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

  -- Phase 14 (0113) : un enfant du foyer de la liste ne reserve ni ne
  -- libere — meme refus, sans donnee (D-03). Hors foyer, le partage
  -- explicite fait foi, comme avant (G-06-1b-bis intact).
  if exists (
    select 1
      from public.household_members m
     where m.household_id = v_household_id
       and m.user_id = p_actor_id
       and m.role = 'enfant'
  ) then
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

comment on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) is
  'USAGE SERVEUR UNIQUEMENT. Cree un code de partage et desactive le precedent de la liste. Gestion : proprietaire ou admin, desormais ecrivain (0113 : enfant proprietaire exclu).';
comment on function public.revoke_gift_list_invite(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Revoque tous les codes actifs de la liste. Gestion : proprietaire ou admin, desormais ecrivain (0113 : enfant proprietaire exclu).';
comment on function public.gift_list_invite_summary(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Resume du dernier code de la liste, sans son empreinte. Gestion : proprietaire ou admin, desormais ecrivain (0113 : enfant proprietaire exclu).';
comment on function public.redeem_gift_list_invite(text, uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Echange un code contre un partage `reservation` (membre ecrivain du foyer ou e-mail externe), atomique et idempotent, oracle `code invalide` unique (0113 : enfant membre refuse sous oracle).';
comment on function public.member_reserve_gift_item(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Reserve attribuee d''un membre authentifie, y compris inter-foyers (G-06-1b-bis, 0094) : partage reservation verifie, nom derive du profil verifie, conflit 409 propre, refus unique sinon (0113 : enfant du foyer de la liste refuse). Seul ecrivain serveur de reserved_by_name avec guest_reserve_gift_item.';

-- ---------------------------------------------------------------------------
-- G. Ardoises : gestion ecrivain, resume/soldes ecrivains, echange oracle (D-03)
-- ---------------------------------------------------------------------------

create or replace function public.create_ardoise_invite(
  p_actor_id uuid,
  p_ardoise_id text,
  p_invite_hash text,
  p_expires_at timestamptz default null,
  p_max_uses integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  select a.household_id into v_household_id
    from public.ardoises a where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_role is distinct from 'admin'
     and not exists (
       select 1 from public.ardoises a
        where a.id = p_ardoise_id and a.created_by = v_member_id
     ) then
    raise exception 'gestion de l''ardoise réservée' using errcode = '42501';
  end if;

  -- Phase 14 (0113) : la gestion exige le role ecrivain — un enfant
  -- createur ne gere plus les codes (D-03, meme 403 cote Edge).
  perform private.assert_household_writer(v_household_id, p_actor_id);
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'empreinte d''invitation invalide' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'nombre d''utilisations invalide' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '90 days') then
    raise exception 'expiration invalide' using errcode = '22023';
  end if;

  -- Régénérer désactive immédiatement le précédent (un seul code actif).
  update public.ardoises
     set invite_hash = null, is_active = false, use_count = 0
   where id = p_ardoise_id;

  update public.ardoises
     set invite_hash = p_invite_hash,
         is_active = true,
         use_count = 0,
         max_uses = p_max_uses,
         expires_at = p_expires_at
   where id = p_ardoise_id;

  return jsonb_build_object(
    'ardoise_id', p_ardoise_id,
    'expires_at', p_expires_at,
    'max_uses', p_max_uses
  );
end;
$$;

create or replace function public.revoke_ardoise_invite(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  select a.household_id into v_household_id
    from public.ardoises a where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id and m.user_id = p_actor_id
   limit 1;
  if v_role is distinct from 'admin'
     and not exists (
       select 1 from public.ardoises a
        where a.id = p_ardoise_id and a.created_by = v_member_id
     ) then
    raise exception 'gestion de l''ardoise réservée' using errcode = '42501';
  end if;

  -- Phase 14 (0113) : la gestion exige le role ecrivain — un enfant
  -- createur ne gere plus les codes (D-03, meme 403 cote Edge).
  perform private.assert_household_writer(v_household_id, p_actor_id);

  update public.ardoises
     set invite_hash = null, is_active = false
   where id = p_ardoise_id;

  return jsonb_build_object('ardoise_id', p_ardoise_id, 'revoked', true);
end;
$$;

create or replace function public.ardoise_invite_summary(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  -- Appelée en `service_role` (sans JWT) : l'acteur est le paramètre, jamais
  -- auth.uid(), qui serait NULL ici et fermerait tout.
  select jsonb_build_object(
           'ardoise_id', a.id,
           'is_active', a.is_active,
           'has_code', a.invite_hash is not null,
           'expires_at', a.expires_at,
           'max_uses', a.max_uses,
           'use_count', a.use_count
         )
    into v_out
    from public.ardoises a
   where a.id = p_ardoise_id
     -- Phase 14 (0113) : membres ecrivains seuls — l'enfant rend le meme
     -- oracle que l'exterieur (`ardoise introuvable`, D-03).
     and exists (
       select 1 from public.household_members m
        where m.household_id = a.household_id and m.user_id = p_actor_id
          and m.role in ('admin', 'membre')
     );
  if v_out is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  return v_out;
end;
$$;

create or replace function public.ardoise_settlement(
  p_actor_id uuid,
  p_ardoise_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_balances jsonb;
  v_settlements jsonb;
  v_household_id text;
  v_member_id text;
  v_role text;
begin
  if p_actor_id is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_ardoise_id is null then
    raise exception 'ardoise obligatoire' using errcode = '22023';
  end if;

  select a.household_id into v_household_id
    from public.ardoises a
   where a.id = p_ardoise_id;
  if v_household_id is null then
    raise exception 'ardoise introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_member(v_household_id, p_actor_id);

  select m.id, m.role into v_member_id, v_role
    from public.household_members m
   where m.household_id = v_household_id
     and m.user_id = p_actor_id
   limit 1;
  -- Phase 14 (0113) : un enfant inscrit ne lit plus les soldes — meme
  -- refus que le non inscrit, sans distinguer (D-03).
  if v_role is distinct from 'admin' and v_role is distinct from 'membre' then
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;
  if v_role <> 'admin'
     and not exists (
       select 1 from public.ardoise_members am
        where am.ardoise_id = p_ardoise_id and am.member_id = v_member_id
     ) then
    raise exception 'inscription à l''ardoise requise' using errcode = '42501';
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'kind', b.kind,
               'participant_id', b.participant_id,
               'display_name', b.display_name,
               'amount', round(b.balance, 2)
             ) order by b.display_name
           ),
           '[]'::jsonb
         )
    into v_balances
    from private.ardoise_balances(p_ardoise_id) b;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'from_kind', s.debtor_kind,
               'from_id', s.debtor_id,
               'from_name', s.debtor_name,
               'to_kind', s.creditor_kind,
               'to_id', s.creditor_id,
               'to_name', s.creditor_name,
               'amount', round(s.amount, 2)
             ) order by s.debtor_name, s.creditor_name
           ),
           '[]'::jsonb
         )
    into v_settlements
    from private.simplify_ardoise_debts(p_ardoise_id) s;

  return jsonb_build_object(
    'ardoise_id', p_ardoise_id,
    'household_id', v_household_id,
    'balances', v_balances,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

create or replace function public.redeem_ardoise_invite(
  p_invite_hash text,
  p_actor_id uuid default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ardoise public.ardoises%rowtype;
  v_member_id text;
  v_role text;
  v_ticket text := encode(extensions.gen_random_bytes(24), 'base64');
  v_guest_id text := private.new_id('ardoise-guest');
begin
  if p_invite_hash is null or p_invite_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  select * into v_ardoise
    from public.ardoises a
   where a.invite_hash = p_invite_hash
   for update;
  if v_ardoise.id is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_ardoise.is_active
     or (v_ardoise.expires_at is not null and v_ardoise.expires_at <= now())
     or (v_ardoise.max_uses is not null and v_ardoise.use_count >= v_ardoise.max_uses) then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  -- Membre du foyer déjà connecté : inscription idempotente, sans ticket.
  -- Phase 14 (0113) : un enfant membre ne rejoint plus — oracle `code
  -- invalide` unique, sans inscription ni part a zero (D-03).
  if p_actor_id is not null then
    select m.id, m.role into v_member_id, v_role
      from public.household_members m
     where m.household_id = v_ardoise.household_id and m.user_id = p_actor_id
     limit 1;
    if v_member_id is not null then
      if v_role = 'enfant' then
        raise exception 'code invalide' using errcode = 'P0002';
      end if;
      insert into public.ardoise_members (ardoise_id, member_id)
      values (v_ardoise.id, v_member_id)
      on conflict do nothing;
      -- Dépenses existantes : part à zéro là où il manque (ni dette sur le
      -- passé, ni doublon en cas de double échange).
      insert into public.expense_participants (expense_id, participant_type, member_id, share_amount)
      select e.id, 'membre', v_member_id, 0
        from public.expenses e
       where e.ardoise_id = v_ardoise.id
         and not exists (
           select 1 from public.expense_participants ep
            where ep.expense_id = e.id
              and ep.participant_type = 'membre'
              and ep.member_id = v_member_id
         )
      on conflict do nothing;
      return jsonb_build_object('ardoise_id', v_ardoise.id, 'already_member', true);
    end if;
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 120 then
    raise exception 'pseudonyme invalide' using errcode = '22023';
  end if;
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values (v_guest_id, v_ardoise.id, btrim(p_display_name),
          encode(extensions.digest(v_ticket, 'sha256'), 'hex'));

  update public.ardoises
     set use_count = use_count + 1
   where id = v_ardoise.id;

  return jsonb_build_object('ardoise_id', v_ardoise.id, 'guest_ticket', v_ticket);
end;
$$;

comment on function public.ardoise_settlement(uuid, text) is
  'USAGE SERVEUR UNIQUEMENT. Soldes et compensation minimale des dettes d''une ardoise (0113 : membre inscrit ecrivain ou admin, meme refus sinon).';
comment on function public.redeem_ardoise_invite(text, uuid, text) is
  'Echange d''un code : membre ecrivain inscrit (parts a zero sur le passe) ou invite externe (ticket) ; enfant membre refuse sous oracle `code invalide` (0113).';

-- ---------------------------------------------------------------------------
-- H. Privileges : re-emis a l'identique apres les REPLACE (la redefinition
--    conserve les droits, cette section les verrouille a nouveau — motif
--    0079/0093/0096, aucune signature ne change).
-- ---------------------------------------------------------------------------
revoke all on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_gift_list_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.gift_list_invite_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_gift_list_invite(text, uuid, text) from public, anon, authenticated;
revoke all on function public.member_reserve_gift_item(uuid, text) from public, anon, authenticated;
revoke all on function public.create_ardoise_invite(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.revoke_ardoise_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.ardoise_invite_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.ardoise_settlement(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_ardoise_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_gift_list_invite(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_gift_list_invite(uuid, text) to service_role;
grant execute on function public.gift_list_invite_summary(uuid, text) to service_role;
grant execute on function public.redeem_gift_list_invite(text, uuid, text) to service_role;
grant execute on function public.member_reserve_gift_item(uuid, text) to service_role;
grant execute on function public.create_ardoise_invite(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.revoke_ardoise_invite(uuid, text) to service_role;
grant execute on function public.ardoise_invite_summary(uuid, text) to service_role;
grant execute on function public.ardoise_settlement(uuid, text) to service_role;
grant execute on function public.redeem_ardoise_invite(text, uuid, text) to service_role;

do $$
begin
  if has_function_privilege('authenticated', 'public.redeem_gift_list_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir échanger un code de liste en direct';
  end if;
  if has_function_privilege('authenticated', 'public.member_reserve_gift_item(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas réserver en membre attribué en direct';
  end if;
  if has_function_privilege('authenticated', 'public.redeem_ardoise_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir rejoindre une ardoise en direct';
  end if;
  if not has_function_privilege('service_role', 'public.redeem_gift_list_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir échanger un code de liste';
  end if;
  if not has_function_privilege('service_role', 'public.member_reserve_gift_item(uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir réserver en membre attribué';
  end if;
  if not has_function_privilege('service_role', 'public.redeem_ardoise_invite(text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir faire rejoindre une ardoise';
  end if;
end;
$$;

commit;
