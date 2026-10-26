-- 0154_child_profile_avatar.sql
-- Correction vers l'avant trouvée par la revue de code de la phase 25
-- (finding WR-04) — 0146 recopié-modifié, aucune migration appliquée n'est
-- réécrite :
--
-- 1. CREATE : `p_avatar_url` était déclaré puis jeté — la colonne
--    avatar_url était absente de la liste d'insertion. La fiche naissait
--    sans l'avatar transmis, sans erreur, alors que update_managed_child_
--    profile sait l'écrire : omission, pas choix. L'insertion gagne la
--    colonne, le jsonb rendu gagne la clé.
-- 2. UPDATE : `coalesce(p_avatar_url, avatar_url)` rendait la SUPPRESSION de
--    l'avatar impossible (null = ne rien faire). La fonction gagne
--    p_clear_avatar boolean default false ; le besoin métier (D-03 : tout
--    adulte du foyer édite la fiche) impose nullif sur display_name mais
--    pas sur avatar : un avatar explicite null = suppression demandée
--    serait ambigu avec « ne pas toucher ». La valeur sentinelle évite
--    l'ambiguïté ; la surcharge à six arguments text (sans le boolean)
--    est supprimée pour éviter une résolution ambiguë — l'UI passe
--    désormais 6 arguments dont p_clear_avatar.
--
-- Le reste de 0146 (archive, privilèges, colonnes ENF-03, gardes) est
-- inchangé et non recopié : la migration ne touche que ces deux fonctions.

begin;

-- ---------------------------------------------------------------------------
-- 1. CREATE — 0146 recopié-modifié : avatar_url dans l'insertion + jsonb.
-- ---------------------------------------------------------------------------
create or replace function public.create_managed_child_profile(
  p_household_id text,
  p_display_name text,
  p_color_tag text,
  p_birth_date date default null,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_member_id text;
  v_member_id text;
  v_color text;
begin
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;
  if p_household_id is null then
    raise exception 'foyer obligatoire' using errcode = '22023';
  end if;

  -- D-03 : tout adulte du foyer crée une fiche (admin OU membre).
  if private.can_write_household(p_household_id) is not true then
    raise exception 'action réservée aux adultes du foyer' using errcode = '42501';
  end if;

  select private.current_member_id(p_household_id) into v_actor_member_id;
  if v_actor_member_id is null then
    raise exception 'aucune ligne membre pour cet acteur dans ce foyer' using errcode = '42501';
  end if;

  -- Validation locale : mêmes bornes que la CHECK 0002 (1-120 btrim)
  -- resserrées au contrat produit 2-120 ; couleur validée par
  -- private.is_member_color (0001).
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 120 then
    raise exception 'le nom doit compter entre 2 et 120 caractères' using errcode = '22023';
  end if;
  v_color := coalesce(p_color_tag, 'accent');
  if private.is_member_color(v_color) is not true then
    raise exception 'couleur invalide' using errcode = '22023';
  end if;

  -- Socle D-06 posé comme valeur d'insertion.
  v_member_id := private.new_id('member');
  insert into public.household_members
    (id, household_id, user_id, display_name, color_tag, role, birth_date, avatar_url, managed_modules)
  values (
    v_member_id,
    p_household_id,
    null,
    btrim(p_display_name),
    v_color,
    'enfant',
    p_birth_date,
    p_avatar_url,
    '{taches,routines,anniversaires,menu}'::text[]
  );

  return jsonb_build_object(
    'id', v_member_id,
    'household_id', p_household_id,
    'display_name', btrim(p_display_name),
    'color_tag', v_color,
    'role', 'enfant',
    'birth_date', p_birth_date,
    'avatar_url', p_avatar_url
  );
end;
$$;

comment on function public.create_managed_child_profile(text, text, text, date, text) is
  'D-01 : crée la fiche d''un enfant géré (role enfant, sans compte, socle D-06). Tout adulte du foyer (can_write_household). L''avatar transmis est stocké (0154) et rendu dans le jsonb. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- ---------------------------------------------------------------------------
-- 2. UPDATE — 0146 recopié-modifié : p_clear_avatar boolean default false,
--    avatar_url = case quand la suppression est demandée.
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
  -- CHECK 0144) PUIS de PÉRIMÈTRE : refus-par-défaut, seuls les cinq espaces
  -- gardés sont activables. cadeaux/voyages/contacts et tout autre espace
  -- → 22023 (leur garde rejoindra dans une migration ultérieure si le
  -- produit l'exige).
  if p_managed_modules is not null then
    if private.has_valid_module_keys(p_managed_modules) is not true then
      raise exception 'liste de modules invalide' using errcode = '22023';
    end if;
    if exists (
      select 1
        from pg_catalog.unnest(p_managed_modules) as t (k)
       where k not in ('taches', 'routines', 'messages', 'anniversaires', 'menu')
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
  'D-01 : met à jour la fiche d''un enfant géré ; modules validés en format (0140) et en périmètre D-06 (refus-par-défaut hors des cinq espaces gardés). p_clear_avatar=true supprime l''avatar (0154) — null seul ne touche plus rien. USAGE AUTHENTIFIÉ UNIQUEMENT.';

-- La surcharge à six arguments text (p_member_id … p_managed_modules) —
-- signature de 0146 — n'a plus de corps distinct : elle serait résolue de
-- façon identique et laisserait un chemin sans p_clear_avatar. On la retire.
drop function if exists public.update_managed_child_profile(text, text, text, date, text, text[]);

-- Privilèges : ces RPC SONT la surface client (D-01).
revoke all on function public.create_managed_child_profile(text, text, text, date, text) from public, anon;
revoke all on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) from public, anon;
grant execute on function public.create_managed_child_profile(text, text, text, date, text) to authenticated;
grant execute on function public.update_managed_child_profile(text, text, text, date, text, boolean, text[]) to authenticated;

commit;
