-- supabase/tests/0127_guest_media_household.sql
-- Phase 22 — Une reference media rendue a un invite est bornee a son foyer
-- (plan 22-01 ; ferme AR-21-01 et AR-21-02 de `21-SECURITY.md`).
--
-- Prouve, sur la base ENTIEREMENT MIGREE :
--   (a) l'ECRITURE refuse un chemin d'un autre foyer ET un chemin qui remonte
--       par un segment `..` apres un prefixe de foyer valide — le contournement
--       que la contrainte 0126 laissait passer ;
--   (b) le RPC ne rend plus une couverture d'un autre foyer ni une forme
--       `http(s)` : c'est le SEUL chemin par lequel l'Edge obtient une valeur a
--       signer, donc le verdict ferme la fuite inter-foyers (AR-21-01) ;
--   (c) le meme verdict s'applique a `photo_path`. La contrainte d'ecriture
--       rend cet etat inatteignable AUJOURD'HUI : le test retire donc la
--       contrainte le temps d'ecrire la LIGNE HERITEE, et la restaure a
--       l'identique depuis le catalogue (`pg_get_constraintdef`, jamais
--       recopiee a la main). Tout est annule en sortie (`rollback`).
--
-- Bornes (AGENTS.md §2.7D) : chaque assertion porte sur une VALEUR rendue ou
-- sur une ligne designee par `testkit.fx`, jamais sur un total nu. Role
-- `postgres` pour les fixtures et le RPC service_role (comme l'Edge, motif
-- 0026) ; `authenticated` pour la preuve d'ecriture cliente.
--
-- Rouge→vert : avant 0127, (a) `..` est ACCEPTE et (b) la couverture sort
-- TELLE QUELLE — les deux assertions tombent.

begin;

do $$
declare
  alice uuid := testkit.auth_user('r22-alice@example.fr', 'Alice Bornee');
  carol uuid := testkit.auth_user('r22-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Borne A');
  home_b text := testkit.household(carol, 'Foyer Borne B');
  alice_m text;
  carol_m text;
  recipe_r1 text := private.new_id('recipe');
  step_r1 text := private.new_id('recipe-step');
  step_r2 text := private.new_id('recipe-step');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Bornee', 'admin', 'accent');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('carol_m', carol_m),
    ('recipe_r1', recipe_r1), ('step_r1', step_r1), ('step_r2', step_r2);

  insert into public.recipes (id, household_id, title, servings, created_by)
  values (recipe_r1, home_a, 'Gratin borne', 4, alice_m);

  insert into public.recipe_steps (id, recipe_id, household_id, content, position)
  values (step_r1, recipe_r1, home_a, 'Eplucher les pommes de terre.', 1),
         (step_r2, recipe_r1, home_a, 'Enfourner 45 minutes.', 2);
end;
$$;

-- ===========================================================================
-- (a) La contrainte d'ECRITURE. Trois cas, dont deux qui doivent etre refus.
-- ===========================================================================
select testkit.as_user(user_id, 'r22-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- (a1) Chemin LEGITIME : accepte (la contrainte ne refuse pas tout).
select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r1'))), 1::bigint,
  'un chemin du foyer de la ligne est accepte');

-- (a2) Segment `..` APRES un prefixe de foyer valide : refuse. C'est le
--      contournement de 0126 — `starts_with` seul le laissait passer.
select testkit.expect_denied(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_a') || '/../'
    || (select household_id from testkit.fx where key = 'home_b') || '/recipes/x/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r1')),
  'un chemin qui remonte par `..` est refuse');

-- (a3) Chemin d'un AUTRE foyer : refuse (borne posee par 0126, non regressee).
select testkit.expect_denied(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_b') || '/recipes/x/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r1')),
  'un chemin d''un autre foyer est refuse');

reset role;

-- ===========================================================================
-- (b) La COUVERTURE : le RPC ne rend que ce qui appartient au foyer de la
--     recette. `recipes.cover_photo` n'a pas de contrainte d'ecriture (forme
--     `http(s)` heritee toleree) : c'est donc ici, et ici seulement, que le
--     verdict est prononce.
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_recipe text;
  v_home_a text;
  v_home_b text;
  v_cover text;
  v_view jsonb;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select row_id into v_recipe from testkit.fx where key = 'recipe_r1';
  select household_id into v_home_a from testkit.fx where key = 'home_a';
  select household_id into v_home_b from testkit.fx where key = 'home_b';

  -- (b1) Couverture LEGITIME : traverse le RPC inchangee.
  v_cover := v_home_a || '/recipes/' || v_recipe || '/cover.jpg';
  update public.recipes set cover_photo = v_cover where id = v_recipe;
  perform public.create_recipe_share(v_alice, v_recipe, repeat('7', 64), null, 5);
  v_view := public.view_recipe_share(repeat('7', 64));
  perform testkit.eq(v_view ->> 'cover_photo', v_cover,
    'une couverture du foyer de la recette traverse le RPC');

  -- (b2) Couverture d'un AUTRE foyer : ne sort pas (AR-21-01).
  update public.recipes set cover_photo = v_home_b || '/recipes/x/cover.jpg' where id = v_recipe;
  perform public.create_recipe_share(v_alice, v_recipe, repeat('8', 64), null, 5);
  v_view := public.view_recipe_share(repeat('8', 64));
  perform testkit.ok(v_view -> 'cover_photo' = 'null'::jsonb,
    'une couverture d''un autre foyer ne sort pas du RPC');

  -- (b3) Couverture `http(s)` : ne sort pas — l'invite ne charge jamais une
  --      image tierce (forme que le formulaire de recette ne produit pas).
  update public.recipes set cover_photo = 'https://externe.example/pixel.jpg' where id = v_recipe;
  perform public.create_recipe_share(v_alice, v_recipe, repeat('9', 64), null, 5);
  v_view := public.view_recipe_share(repeat('9', 64));
  perform testkit.ok(v_view -> 'cover_photo' = 'null'::jsonb,
    'une couverture http(s) ne sort pas du RPC');

  -- (b4) Couverture portant un segment `..` : ne sort pas non plus.
  update public.recipes
     set cover_photo = v_home_a || '/../' || v_home_b || '/recipes/x/cover.jpg'
   where id = v_recipe;
  perform public.create_recipe_share(v_alice, v_recipe, repeat('a', 64), null, 5);
  v_view := public.view_recipe_share(repeat('a', 64));
  perform testkit.ok(v_view -> 'cover_photo' = 'null'::jsonb,
    'une couverture qui remonte par `..` ne sort pas du RPC');
end;
$$;

-- ===========================================================================
-- (c) Le meme verdict sur `photo_path`, exerce sur une LIGNE HERITEE.
--
--     La contrainte 0127 interdit aujourd'hui cette valeur : on la retire le
--     temps de l'ecriture, puis on la restaure TELLE QUELLE, lue depuis le
--     catalogue. Sans cette mise de cote, l'assertion serait inatteignable —
--     donc incapable d'echouer, donc inutile (AGENTS.md §2.7D).
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_recipe text;
  v_step2 text;
  v_home_a text;
  v_home_b text;
  v_def text;
  v_view jsonb;
  v_step jsonb;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select row_id into v_recipe from testkit.fx where key = 'recipe_r1';
  select row_id into v_step2 from testkit.fx where key = 'step_r2';
  select household_id into v_home_a from testkit.fx where key = 'home_a';
  select household_id into v_home_b from testkit.fx where key = 'home_b';

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conname = 'recipe_steps_photo_path_household'
     and c.conrelid = 'public.recipe_steps'::regclass;
  perform testkit.ok(v_def is not null,
    'la contrainte d''ecriture existe avant d''etre mise de cote');

  alter table public.recipe_steps drop constraint recipe_steps_photo_path_household;
  update public.recipe_steps set photo_path = v_home_b || '/recipes/x/steps/y/photo.jpg'
   where id = v_step2;

  perform testkit.eq(testkit.count(format(
    'select 1 from public.recipe_steps where id = %L and photo_path like %L',
    v_step2, '%/recipes/x/steps/y/photo.jpg')), 1::bigint,
    'la ligne heritee porte bien un chemin d''un autre foyer');

  perform public.create_recipe_share(v_alice, v_recipe, repeat('b', 64), null, 5);
  v_view := public.view_recipe_share(repeat('b', 64));
  select e into v_step
    from jsonb_array_elements(v_view -> 'steps') e
   where e ->> 'id' = v_step2;
  perform testkit.ok(v_step -> 'photo_path' = 'null'::jsonb,
    'une photo d''etape d''un autre foyer ne sort pas du RPC');

  -- (c2) Segment `..` APRES un prefixe de foyer VALIDE : cette ligne heritee
  --      satisfait `starts_with`, donc seule la clause `strpos(...) = 0` la
  --      retient. Sans elle, le RPC rendrait le chemin et l'Edge signerait
  --      l'objet d'un autre foyer : AR-21-02 rouvert par le chemin de LECTURE,
  --      exactement ce que (a2) ferme cote ecriture.
  update public.recipe_steps
     set photo_path = v_home_a || '/../' || v_home_b || '/recipes/x/steps/y/photo.jpg'
   where id = v_step2;

  perform public.create_recipe_share(v_alice, v_recipe, repeat('c', 64), null, 5);
  v_view := public.view_recipe_share(repeat('c', 64));
  select e into v_step
    from jsonb_array_elements(v_view -> 'steps') e
   where e ->> 'id' = v_step2;
  perform testkit.ok(v_step -> 'photo_path' = 'null'::jsonb,
    'une photo d''etape qui remonte par `..` ne sort pas du RPC');

  -- Le pendant positif : l'etape (a1), du bon foyer, traverse toujours.
  select e into v_step
    from jsonb_array_elements(v_view -> 'steps') e
   where e ->> 'id' = (select row_id from testkit.fx where key = 'step_r1');
  perform testkit.ok(v_step ->> 'photo_path' like '%/photo.jpg',
    'une photo d''etape du foyer de la recette traverse le RPC');

  -- La ligne heritee est reposee a `null` AVANT de restaurer la contrainte :
  -- elle ne doit pas rester dans un etat que la contrainte refuserait.
  update public.recipe_steps set photo_path = null where id = v_step2;
  execute format('alter table public.recipe_steps add constraint recipe_steps_photo_path_household %s', v_def);
end;
$$;

rollback;
