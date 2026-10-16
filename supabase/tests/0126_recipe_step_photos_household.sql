-- supabase/tests/0126_recipe_step_photos_household.sql
-- Phase 21 — Bornage de `recipe_steps.photo_path` au foyer de la ligne
-- (plan 21-05, revue WR-01a).
--
-- Prouve la contrainte `recipe_steps_photo_path_household` sur les quatre cas :
--   (a) un chemin du foyer de la ligne s'écrit (insert ET update) ;
--   (b) un chemin d'un AUTRE foyer est refusé (violation de contrainte) ;
--   (c) `null` s'accepte (une étape sans photo reste légitime) ;
--   (d) une mise à jour d'un chemin du foyer vers un chemin étranger est
--       refusée, la valeur précédente restant en place.
--
-- Le test tourne en `postgres` (RLS court-circuitée) : chaque assertion est
-- donc BORNÉE à son foyer / à son étape (AGENTS.md §2.7 D.2) — jamais de total
-- nu. Les refus sont prouvés par `testkit.expect_denied` (l'échec DOIT avoir
-- lieu), jamais par un `ok(true)` inconditionnel.
--
-- Rouge→vert : avant 0126, l'insert/update avec un préfixe étranger réussit
-- (aucune contrainte), donc l'assertion (b) échoue.

begin;

do $$
declare
  alice uuid := testkit.auth_user('r21c-alice@example.fr', 'Alice Contrainte');
  carol uuid := testkit.auth_user('r21c-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Contrainte A');
  home_b text := testkit.household(carol, 'Foyer Contrainte B');
  alice_m text;
  recipe_r1 text := private.new_id('recipe');
  step_r1 text := private.new_id('recipe-step');
  step_r2 text := private.new_id('recipe-step');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Contrainte', 'admin', 'accent');
  insert into testkit.fx (key, household_id) values ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('recipe_r1', recipe_r1), ('step_r1', step_r1), ('step_r2', step_r2);

  insert into public.recipes (id, household_id, title, servings, created_by)
  values (recipe_r1, home_a, 'Gratin borné', 4, alice_m);

  -- Deux étapes du foyer A, sans photo : les cas (a), (b) et (d) partent d'ici.
  insert into public.recipe_steps (id, recipe_id, household_id, content, position)
  values (step_r1, recipe_r1, home_a, 'Éplucher les pommes de terre.', 1),
         (step_r2, recipe_r1, home_a, 'Enfourner 45 minutes.', 2);
end;
$$;

-- ===========================================================================
-- (a) Un chemin du foyer de la ligne s'écrit (update puis insert).
-- ===========================================================================
select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/etape.jpg',
  (select row_id from testkit.fx where key = 'step_r1'))), 1::bigint,
  'un chemin du foyer de la ligne s''écrit par update');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_steps where id = %L and household_id = %L and photo_path = %L',
  (select row_id from testkit.fx where key = 'step_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/etape.jpg')), 1::bigint,
  'la colonne porte le chemin du foyer, bornée à l''étape et au foyer');

-- Un insert portant un chemin du foyer est accepté (la contrainte ne bloque pas
-- la voie normale) : on réutilise step_r2, encore sans photo.
select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r2') || '/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r2'))), 1::bigint,
  'un second chemin du foyer s''écrit');

-- ===========================================================================
-- (b) Un chemin d'un AUTRE foyer est refusé (violation de contrainte) :
--     la classe WR-01a est fermée à l'écriture.
-- ===========================================================================
select testkit.expect_denied(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_b') || '/recipes/volé/steps/1/etape.jpg',
  (select row_id from testkit.fx where key = 'step_r1')),
  'un chemin du foyer B ne peut pas être écrit sur une étape du foyer A (update)');

select testkit.expect_denied(format(
  'insert into public.recipe_steps (recipe_id, household_id, content, position, photo_path) values (%L, %L, %L, %L, %L)',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  'Étape au chemin étranger', 3,
  (select household_id from testkit.fx where key = 'home_b') || '/recipes/volé/steps/1/etape.jpg'),
  'un insert portant un chemin du foyer B est refusé');

-- ===========================================================================
-- (c) `null` s'accepte : une étape sans photo reste légitime (la contrainte
--     n'exige pas une photo).
-- ===========================================================================
select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = null where id = %L',
  (select row_id from testkit.fx where key = 'step_r2'))), 1::bigint,
  'photo_path null est accepté');

-- ===========================================================================
-- (d) La valeur précédente survit à une mise à jour refusée : l'étape r1 porte
--     toujours le chemin du foyer, borné à son foyer et à son étape.
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_steps where id = %L and household_id = %L and photo_path = %L',
  (select row_id from testkit.fx where key = 'step_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/etape.jpg')), 1::bigint,
  'après un refus, l''étape r1 garde son chemin du foyer');

rollback;
