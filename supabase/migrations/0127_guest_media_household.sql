-- supabase/migrations/0127_guest_media_household.sql
-- Phase 22 — Une référence média rendue à un invité est bornée à son foyer
-- (plan 22-01 ; ferme AR-21-01 et AR-21-02 de `21-SECURITY.md`).
--
-- Deux trous restaient ouverts après 0126, tous deux sur le MÊME chemin :
-- l'Edge `recipe-invite` signe avec le client service-role, donc hors de la
-- politique du bucket `(storage.foldername(name))[1]`, et l'invité n'a pas de
-- compte — la RLS ne le protège pas, l'Edge est la seule barrière.
--
--   1. AR-21-02 : la contrainte 0126 est un contrôle de préfixe LITTÉRAL
--      (`starts_with`). `<homeA>/../<homeB>/x.jpg` la satisfait, puisque la
--      valeur commence bien par `<homeA>/`. Un segment relatif suffisait donc à
--      viser l'objet d'un autre foyer. Ici, l'écriture refuse tout `..`.
--
--   2. AR-21-01 : `recipes.cover_photo` n'a AUCUNE borne, et le RPC rend la
--      valeur brute telle quelle. Un membre pouvait pointer la couverture vers
--      le chemin d'un objet d'un autre foyer — ou vers une image distante
--      arbitraire, la forme `http(s)` que le signeur invité relaie verbatim
--      (`guest-steps.ts:65`). Le RPC est le SEUL chemin par lequel l'Edge
--      obtient une valeur à signer (`index.ts:442` → `:481` et
--      `toGuestSteps`) : c'est donc là que le verdict est prononcé, contre le
--      foyer de la recette, que la fonction connaît par construction.
--
-- Pourquoi pas une contrainte d'écriture sur `recipes.cover_photo` : la colonne
-- est ANTÉRIEURE à toute borne, sa forme `http(s)` est tolérée (motif
-- couverture 0118/voyages, 12-03 : « le CHEMIN pour les nouveaux dépôts, et
-- l'URL »), et le client réécrit la valeur existante à chaque édition
-- (`use-recettes.ts:202`, `coverPhoto: recipe.coverPhoto`). Une contrainte
-- refuserait l'édition d'une ligne héritée, et `not valid` la rendrait presque
-- inerte. Le trou n'est pas l'écriture, c'est la SIGNATURE service-role d'un
-- objet d'un autre foyer : le filtre de lecture le ferme, y compris sur une
-- ligne héritée.
--
-- Conséquence assumée sur la surface invitée : une couverture `http(s)`
-- (forme que le formulaire de recette ne produit pas — il n'expose qu'un
-- sélecteur de fichier) n'est plus relayée. La fiche invitée montre alors
-- l'absence de couverture, jamais une image tierce.
--
-- Correction VERS L'AVANT : `0125` et `0126` sont APPLIQUÉES, elles ne sont
-- jamais réécrites (AGENTS.md §2.7 A.1).
--
-- Le segment relatif se teste par `strpos(valeur, '..') = 0`, jamais par un
-- motif `like` : les noms de fichier déposés sont `file_<uuid>.<ext>`
-- (`randomId('file')` → `file_` + UUID, `storage.ts`) et ne contiennent jamais
-- deux points consécutifs, donc le refus ne touche aucune valeur légitime. La
-- normalisation d'un `..` par Storage n'est pas observable sur cet hôte
-- (`deno` absent) et n'est PAS supposée : le verdict tombe avant la signature.

begin;

-- ---------------------------------------------------------------------------
-- 1. Le contrôle d'écriture cesse d'être contournable par un segment relatif.
--    `drop` puis `add` : le nom de la contrainte est conservé, la définition
--    effective est la dernière (AGENTS.md §2.7 A.2).
-- ---------------------------------------------------------------------------
alter table public.recipe_steps
  drop constraint if exists recipe_steps_photo_path_household;

alter table public.recipe_steps
  add constraint recipe_steps_photo_path_household
  check (
    photo_path is null
    or (starts_with(photo_path, household_id || '/') and strpos(photo_path, '..') = 0)
  );

comment on constraint recipe_steps_photo_path_household on public.recipe_steps is
  'Borne `photo_path` au foyer de la ligne ET refuse tout segment `..` : un chemin d''un autre foyer, ou un chemin relatif qui remonterait hors du foyer, est refusé à l''écriture. L''Edge `recipe-invite` (service-role) ne peut donc plus signer qu''un objet du foyer de la recette (AR-21-02).';

-- ---------------------------------------------------------------------------
-- 2. Le RPC ne rend plus qu'une référence bornée à SON foyer. Recopie de
--    `0125:26-130` avec une seule addition : `case` sur `cover_photo` et sur
--    chaque `photo_path` d'étape. La fonction reste `security definer` avec
--    `set search_path = ''` : chaque table s'écrit `public.` (contrôles 1 et 2
--    de `check-sql-statique`).
-- ---------------------------------------------------------------------------
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
  v_recipe_household text;
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

  -- `household_id` est lu ici, et n'est JAMAIS rendu au visiteur : l'Edge
  -- construit sa réponse champ par champ (`index.ts:478-489`), il ne recopie
  -- pas le jsonb du RPC. Le foyer sert uniquement à prononcer le verdict
  -- ci-dessous, contre le foyer de la RECETTE — celui dont l'invité lit la
  -- fiche, pas celui de l'étape.
  select r.title, r.servings, r.prep_minutes, r.cook_minutes, r.cover_photo, r.household_id
    into v_recipe_title, v_recipe_servings, v_recipe_prep, v_recipe_cook, v_recipe_cover, v_recipe_household
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

  -- Une étape dont le `photo_path` n'appartient pas au foyer de la recette, ou
  -- contient un segment relatif, rend `null` : l'Edge ne reçoit rien à signer.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', st.id,
             'content', st.content,
             'position', st.position,
             'photo_path', case
               when st.photo_path is null then null
               when starts_with(st.photo_path, v_recipe_household || '/')
                and strpos(st.photo_path, '..') = 0
                 then st.photo_path
               else null
             end
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
    -- Même verdict que sur les étapes : une couverture d'un autre foyer, ou une
    -- forme `http(s)`, ne sort pas d'ici (AR-21-01).
    'cover_photo', case
      when v_recipe_cover is null then null
      when starts_with(v_recipe_cover, v_recipe_household || '/')
       and strpos(v_recipe_cover, '..') = 0
        then v_recipe_cover
      else null
    end,
    'category', v_category_name,
    'ingredients', v_ingredients,
    'steps', v_steps,
    'tags', v_tags
  );
end;
$$;

comment on function public.view_recipe_share(text) is
  'USAGE SERVEUR UNIQUEMENT. Lecture d''une fiche par lien pour un visiteur sans compte (R11) : fiche + ingredients + etapes (photo_path brut) + tags, oracle `code invalide` unique, compteur consomme atomiquement. Les references media rendues sont bornees au foyer de la recette (AR-21-01/AR-21-02).';

commit;
