-- 0157_voyages_d06.sql
-- Correction vers l'avant (trou de la phase 25 : D-06 vs Voyages) — deux
-- fonctions recopiées-modifiées, aucune migration appliquée n'est réécrite
-- (AGENTS.md §2.7A). Les définitions efficaces viennent de la base, pas des
-- fichiers : 0120 sur disque référence `private.ensure_uuid` (inexistant) et
-- `p_household_id` (paramètre absent de la signature) — le dépôt conserve le
-- code fautif, c'est voulu ; la définition effective de `trip_add_member`
-- est celle que la base contient, et c'est elle qui est recopiée ici.
--
-- 1. `update_managed_child_profile` : `'voyages'` rejoint le périmètre D-06
--    activable sur une fiche enfant. Le refus-par-défaut reste : tout autre
--    espace (cadeaux, contacts, etc.) → 22023. Le socle d'insertion 0154
--    (`'{taches,routines,anniversaires,menu}'`) ne change pas : l'enfant
--    créé sans 'voyages' n'apparaît pas dans les sélecteurs (D-06 : fermer
--    la porte).
-- 2. `trip_add_member` : un enfant géré n'est inscriptible que si 'voyages'
--    figure dans SA fiche (assert_child_module_allowed, 42501). Les adultes
--    passent sans garde (0119 inchangé). L'ardoise liée reste aux adultes
--    (v_role in ('admin','membre')) : un enfant voyageur ne devient pas
--    payeur.
--
-- Toute table s'écrit `public.*` (search_path vide ne résout rien). Les
-- comptages de test sont bornés au voyage/foyer (AGENTS.md §2.7D).

begin;

-- ---------------------------------------------------------------------------
-- 1. UPDATE — 0154 recopié-modifié : 'voyages' dans le périmètre D-06.
-- ---------------------------------------------------------------------------
create or replace function public.update_managed_child_profile(
  p_member_id text,
  p_display_name text,
  p_color_tag text,
  p_birth_date date,
  p_avatar_url text,
  p_clear_avatar boolean default false,
  p_managed_modules text[] default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household_id text;
  v_modules text[];
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_member_id is null then
    raise exception 'enfant obligatoire' using errcode = '22023';
  end if;

  select m.household_id into v_household_id
    from public.household_members m
   where m.id = p_member_id;

  if v_household_id is null then
    raise exception 'enfant introuvable' using errcode = '42501';
  end if;

  -- D-03 : tout adulte du foyer de la ligne cible.
  if private.can_write_household(v_household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  -- La cible est un enfant géré ACTIF : un adulte n'est jamais éditable par ce
  -- RPC (22023, forme is not true — jamais not (…)).
  if private.is_managed_child(p_member_id) is not true then
    raise exception 'la ligne visée n''est pas un enfant géré' using errcode = '22023';
  end if;

  if p_display_name is not null and char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception 'le nom doit compter entre 2 et 120 caractères' using errcode = '22023';
  end if;
  if p_color_tag is not null and private.is_member_color(p_color_tag) is not true then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  -- D-06 : validation de FORMAT (has_valid_module_keys, même format que la
  -- CHECK 0144) PUIS de PÉRIMÈTRE : refus-par-défaut. 0157 ajoute 'voyages'
  -- au périmètre activable (D-06 : fermer la porte, l'enfant n'y figure que
  -- si un adulte l'active explicitement). Tout autre espace → 22023.
  if p_managed_modules is not null then
    if private.has_valid_module_keys(p_managed_modules) is not true then
      raise exception 'liste de modules invalide' using errcode = '22023';
    end if;
    if exists (
      select 1
        from pg_catalog.unnest(p_managed_modules) as t (k)
       where k not in ('taches', 'routines', 'messages', 'anniversaires', 'menu', 'voyages')
    ) then
      raise exception 'cet espace n''est pas activable sur une fiche enfant'
        using errcode = '22023';
    end if;
    v_modules := p_managed_modules;
  end if;

  update public.household_members
     set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
         color_tag = coalesce(p_color_tag, color_tag),
         birth_date = p_birth_date,
         avatar_url = case
           when p_clear_avatar is true then null
           else coalesce(p_avatar_url, avatar_url)
         end,
         managed_modules = coalesce(v_modules, managed_modules)
   where id = p_member_id;
end;
$$;

comment on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) is
  'D-01 : met à jour la fiche d''un enfant géré ; modules validés en format (0140) et en périmètre D-06 (refus-par-défaut hors des six espaces gardés, ''voyages'' inclus depuis 0157). p_clear_avatar=true supprime l''avatar (0154). CONTRAT DES ARGUMENTS (0155, IN-01) : birth_date est ÉCRASÉE sans coalesce — tout appelant renvoie la date COURANTE, modifiée ou non ; display_name (vide ⇒ conserver), color_tag et avatar_url (null ⇒ conserver) suivent l''inverse. L''UI ne vide jamais la date de naissance : cette asymétrie est délibérée, ne l''harmonisez pas sans décision produit. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- ---------------------------------------------------------------------------
-- 2. trip_add_member — définition effective de la base recopiée-modifiée :
--    garde D-06 sur les enfants gérés (assert_child_module_allowed, 42501).
-- ---------------------------------------------------------------------------
create or replace function public.trip_add_member(
  p_actor_id uuid,
  p_trip_id text,
  p_member_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_household_id text;
  v_role text;
  v_ardoise_id text;
  v_already boolean;
begin
  if p_actor_id is null or p_trip_id is null or p_member_id is null then
    raise exception 'acteur, voyage et membre obligatoires' using errcode = '22023';
  end if;
  select t.household_id into v_household_id
    from public.trips t
   where t.id = p_trip_id;
  if v_household_id is null then
    raise exception 'voyage introuvable' using errcode = 'P0002';
  end if;
  perform private.assert_household_admin(v_household_id, p_actor_id);

  select m.role into v_role
    from public.household_members m
   where m.id = p_member_id and m.household_id = v_household_id;
  if v_role is null then
    raise exception 'membre du foyer introuvable' using errcode = 'P0002';
  end if;

  -- 0157 / D-06 : un enfant géré n'est inscriptible que si 'voyages' figure
  -- dans SA fiche (restriction par enfant, 0146). Les adultes passent sans
  -- garde (0119 inchangé). Le refus est 42501, comme les autres espaces
  -- gardés (taches, routines, messages, anniversaires, menu).
  if private.is_managed_child(p_member_id) is true then
    perform private.assert_child_module_allowed(p_member_id, 'voyages');
  end if;

  select exists (
    select 1
      from public.trip_members tm
     where tm.trip_id = p_trip_id and tm.member_id = p_member_id
  ) into v_already;
  if not v_already then
    insert into public.trip_members (trip_id, member_id)
    values (p_trip_id, p_member_id);

    -- Ardoise liée : adultes seuls (0119). Un enfant voyageur ne devient pas
    -- payeur : la branche admin/membre exclut role='enfant'.
    if v_role in ('admin', 'membre') then
      select a.id into v_ardoise_id
        from public.ardoises a
       where a.trip_id = p_trip_id;
      if v_ardoise_id is not null then
        insert into public.ardoise_members (ardoise_id, member_id)
        values (v_ardoise_id, p_member_id)
        on conflict do nothing;
      end if;
    end if;
  end if;

  return jsonb_build_object('trip_id', p_trip_id, 'member_id', p_member_id, 'already_member', v_already);
end;
$$;

comment on function public.trip_add_member(uuid, text, text) is
  'USAGE SERVEUR UNIQUEMENT. Inscrit un membre du foyer au voyage (admin seul, idempotent). 0157 : un enfant géré exige ''voyages'' dans sa fiche (42501). Ardoise liée adultes seuls (0119).' ;

-- Privilèges : recopiés défensivement (0154 et 0120, même pattern).
revoke all on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) from public, anon;
grant execute on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) to authenticated;
revoke all on function public.trip_add_member(uuid, text, text) from public, anon, authenticated;
grant execute on function public.trip_add_member(uuid, text, text) to service_role;

commit;
