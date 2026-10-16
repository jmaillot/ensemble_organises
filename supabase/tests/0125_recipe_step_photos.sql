-- supabase/tests/0125_recipe_step_photos.sql
-- Phase 21 — Photo d'une étape de recette (plan 21-01, tracer serveur).
--
-- Prouve : la colonne `photo_path`, l'écriture RLS (membre oui / enfant non,
-- T-21-01), le dépôt Storage sous RLS (membre oui / enfant non), et le RPC
-- qui rend la référence BRUTE — jamais une URL.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage est borné par `testkit.fx`,
-- jamais de total nu. Rôle `postgres` pour les fixtures et les RPC
-- service_role (comme l'Edge, motif 0026) ; `authenticated` + `testkit.as_user`
-- pour les preuves client.
--
-- Rouge→vert : avant 0125, `photo_path` n'existe pas et l'insert d'étape
-- portant la colonne échoue, ainsi que le test d'existence de la colonne.

begin;

do $$
declare
  alice uuid := testkit.auth_user('r21-alice@example.fr', 'Alice Photo');
  bob uuid := testkit.auth_user('r21-bob@example.fr', 'Bob Photo');
  nina uuid := testkit.auth_user('r21-nina@example.fr', 'Nina Enfant');
  carol uuid := testkit.auth_user('r21-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Photo A');
  home_b text := testkit.household(carol, 'Foyer Photo B');
  alice_m text;
  bob_m text;
  nina_m text;
  carol_m text;
  recipe_r1 text := private.new_id('recipe');
  step_r1 text := private.new_id('recipe-step');
  step_r2 text := private.new_id('recipe-step');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Photo', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Photo', 'membre', 'ink');
  nina_m := testkit.member(home_a, nina, 'Nina Enfant', 'enfant', 'coral');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('nina', nina), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('bob_m', bob_m), ('nina_m', nina_m), ('carol_m', carol_m),
    ('recipe_r1', recipe_r1), ('step_r1', step_r1), ('step_r2', step_r2);

  insert into public.recipes (id, household_id, title, servings, created_by)
  values (recipe_r1, home_a, 'Gratin photographie', 4, alice_m);

  insert into public.recipe_steps (id, recipe_id, household_id, content, position)
  values (step_r1, recipe_r1, home_a, 'Eplucher les pommes de terre.', 1),
         (step_r2, recipe_r1, home_a, 'Enfourner 45 minutes.', 2);
end;
$$;

-- ===========================================================================
-- 0. La colonne existe (rouge avant 0125).
-- ===========================================================================
select testkit.eq(testkit.count(
  'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''recipe_steps'' and column_name = ''photo_path'''),
  1::bigint,
  'la colonne recipe_steps.photo_path existe');

-- ===========================================================================
-- (a) Un membre met `photo_path` sur une etape → 1 ligne affectee ; le chemin
--     persiste tel quel (valeur brute, jamais une URL).
-- ===========================================================================
select testkit.as_user(user_id, 'r21-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r1'))), 1::bigint,
  'un membre pose une photo sur une etape');

reset role;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_steps where id = %L and photo_path = %L',
  (select row_id from testkit.fx where key = 'step_r1'),
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg')), 1::bigint,
  'la colonne porte le chemin brut, jamais une URL');

-- ===========================================================================
-- (b) Le cas QUI DOIT ECHOUER — l'enfant (hors `can_write_household`) :
--     0 ligne affectee, insert refuse (R2, T-21-01).
-- ===========================================================================
select testkit.as_user(user_id, 'r21-nina@example.fr') from testkit.fx where key = 'nina';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.recipe_steps set photo_path = %L where id = %L',
  'foyer-x/recipes/r/steps/s/photo.jpg',
  (select row_id from testkit.fx where key = 'step_r2'))), 0::bigint,
  'un enfant ne pose pas de photo sur une etape');

select testkit.expect_denied(format(
  'insert into public.recipe_steps (recipe_id, household_id, content, position, photo_path) values (%L, %L, %L, %L, %L)',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  'Etape interdite', 3,
  'foyer-x/recipes/r/steps/s/photo.jpg'),
  'un enfant n''insere pas d''etape portant une photo');

reset role;

-- ===========================================================================
-- (c) Depot Storage sous RLS (forme 0038) : membre oui, enfant non.
-- ===========================================================================
select testkit.as_user(user_id, 'r21-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg',
  (select user_id from testkit.fx where key = 'bob'))), 1::bigint,
  'un membre depose la photo d''etape dans le seau');

reset role;

select testkit.as_user(user_id, 'r21-nina@example.fr') from testkit.fx where key = 'nina';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
    || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
    || (select row_id from testkit.fx where key = 'step_r1') || '/photo-2.jpg',
  (select user_id from testkit.fx where key = 'nina')),
  'un enfant ne depose pas de photo d''etape');

reset role;

-- ===========================================================================
-- (d) Le RPC rend la reference BRUTE : chemin, jamais une forme http (D-16,
--     prohibition R1).
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_recipe text;
  v_view jsonb;
  v_step jsonb;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select row_id into v_recipe from testkit.fx where key = 'recipe_r1';

  perform public.create_recipe_share(v_alice, v_recipe, repeat('c', 64), null, 5);
  v_view := public.view_recipe_share(repeat('c', 64));

  -- Chaque etape rendue porte une cle `photo_path`.
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(v_view -> 'steps') e where e ? 'photo_path')::bigint,
    jsonb_array_length(v_view -> 'steps')::bigint,
    'chaque etape rendue porte une cle photo_path');

  -- La reference est BRUTE : le chemin pose par le membre, jamais une URL.
  select e into v_step
    from jsonb_array_elements(v_view -> 'steps') e
   where e ->> 'id' = (select row_id from testkit.fx where key = 'step_r1');
  perform testkit.eq(v_step ->> 'photo_path',
    (select household_id from testkit.fx where key = 'home_a') || '/recipes/'
      || (select row_id from testkit.fx where key = 'recipe_r1') || '/steps/'
      || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg',
    'le RPC rend le chemin brut de la photo');
  perform testkit.ok((v_step ->> 'photo_path') !~ '^https?://',
    'le RPC ne rend jamais une URL signee');

  -- L'etape sans photo rend `photo_path` null (pas de trou).
  select e into v_step
    from jsonb_array_elements(v_view -> 'steps') e
   where e ->> 'id' = (select row_id from testkit.fx where key = 'step_r2');
  perform testkit.ok(v_step -> 'photo_path' = 'null'::jsonb,
    'une etape sans photo rend photo_path null');
end;
$$;

rollback;
