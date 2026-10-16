-- supabase/migrations/0125_recipe_step_photos.sql
-- Phase 21 — Photo d'une étape de recette (plan 21-01, tracer serveur).
--
-- Ajoute `recipe_steps.photo_path` (chemin de bucket, signé à la lecture) et
-- recrée `view_recipe_share` pour rendre ce chemin BRUT au visiteur invité —
-- l'Edge 21-02 le signe (fail-closed si la clé manque).
--
-- Migration NOUVELLE : `0122_recettes_full.sql` n'est jamais réécrite
-- (AGENTS.md §2.7 A.1, corriger vers l'avant). Aucune politique nouvelle :
-- `recipe_steps` porte déjà ses quatre politiques (0122) et le bucket
-- `household-media` juge le foyer par `(storage.foldername(name))[1]`, qui
-- reste le `householdId` dans `<householdId>/recipes/<recipeId>/steps/<stepId>/…`.

begin;

-- Une étape porte au plus une photo : une seule colonne, une seule valeur.
alter table public.recipe_steps add column if not exists photo_path text;

comment on column public.recipe_steps.photo_path is
  'Chemin de bucket (`<householdId>/recipes/<recipeId>/steps/<stepId>/…`) de la photo d''étape, `null` si absente. Valeur produite par `storedValueOf` — jamais une URL signée — et signée à la lecture.';

-- `view_recipe_share` recopiée à l'identique de 0122 avec une seule addition :
-- `'photo_path', st.photo_path` dans le jsonb d'étape (D-16). La fonction reste
-- `security definer` avec `set search_path = ''` : chaque table s'écrit
-- `public.` (contrôles 1 et 2 de `check-sql-statique`).
create or replace function public.view_recipe_share(p_share_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_share public.recipe_shares%rowtype;
  v_recipe_title text;
  v_recipe_servings integer;
  v_recipe_prep integer;
  v_recipe_cook integer;
  v_recipe_cover text;
  v_category_name text;
  v_ingredients jsonb;
  v_steps jsonb;
  v_tags jsonb;
begin
  if p_share_hash is null or p_share_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'code invalide' using errcode = '22023';
  end if;

  -- Verrou pessimiste : deux lectures simultanees ne franchissent pas
  -- `use_count < max_uses` (motif 0017/0079/0118).
  select s.* into v_share
    from public.recipe_shares s
   where s.share_hash = p_share_hash
     and private.token_hash_matches(s.share_hash, p_share_hash)
    for update;
  if not found then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;
  if not v_share.is_active
     or (v_share.expires_at is not null and v_share.expires_at <= now())
     or v_share.use_count >= v_share.max_uses then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select r.title, r.servings, r.prep_minutes, r.cook_minutes, r.cover_photo
    into v_recipe_title, v_recipe_servings, v_recipe_prep, v_recipe_cook, v_recipe_cover
    from public.recipes r
   where r.id = v_share.recipe_id;
  -- Recette disparue entre-temps (cascade) : oracle uniforme.
  if v_recipe_title is null then
    raise exception 'code invalide' using errcode = 'P0002';
  end if;

  select c.name into v_category_name
    from public.recipes r
    left join public.recipe_categories c on c.id = r.category_id
   where r.id = v_share.recipe_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', i.id,
             'name', i.name,
             'quantity', i.quantity,
             'unit', i.unit,
             'position', i.position
           )
           order by i.position, i.id
         ), '[]'::jsonb)
    into v_ingredients
    from public.recipe_ingredients i
   where i.recipe_id = v_share.recipe_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', st.id,
             'content', st.content,
             'position', st.position,
             'photo_path', st.photo_path
           )
           order by st.position, st.id
         ), '[]'::jsonb)
    into v_steps
    from public.recipe_steps st
   where st.recipe_id = v_share.recipe_id;

  select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb)
    into v_tags
    from public.recipe_tag_links l
    join public.recipe_tags t on t.id = l.tag_id
   where l.recipe_id = v_share.recipe_id;

  update public.recipe_shares
     set use_count = use_count + 1,
         is_active = (use_count + 1 < max_uses)
   where id = v_share.id;

  return jsonb_build_object(
    'recipe_id', v_share.recipe_id,
    'title', v_recipe_title,
    'servings', v_recipe_servings,
    'prep_minutes', v_recipe_prep,
    'cook_minutes', v_recipe_cook,
    'cover_photo', v_recipe_cover,
    'category', v_category_name,
    'ingredients', v_ingredients,
    'steps', v_steps,
    'tags', v_tags
  );
end;
$$;

comment on function public.view_recipe_share(text) is
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une fiche par lien pour un visiteur sans compte (R11) : fiche + ingredients + etapes (photo_path brut) + tags, oracle `code invalide` unique, compteur consomme atomiquement.';

commit;
