-- supabase/tests/0054_recettes_full.sql
-- Phase 16 Recettes du foyer (plan 16-01, tracer serveur) : socle serveur —
-- isolation RLS par foyer, enfant lecture seule, categories + reassignment,
-- tags seeds + volee, oracle invite unique, max-uses atomique.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage est borne au foyer, a la recette
-- ou au lien via testkit.fx — jamais de total nu. Role `postgres`
-- (proprietaire) pour les fixtures et les RPC service_role (comme l'Edge,
-- motif 0026) ; `authenticated` + testkit.as_user pour les preuves client.
--
-- Rouge→vert : avant 0122, les tables recipe_* n'existent pas et toute la
-- suite echoue ; avec 0122, toute la suite est verte.

begin;

do $$
declare
  alice uuid := testkit.auth_user('r16-alice@example.fr', 'Alice Recettes');
  bob uuid := testkit.auth_user('r16-bob@example.fr', 'Bob Recettes');
  nina uuid := testkit.auth_user('r16-nina@example.fr', 'Nina Enfant');
  carol uuid := testkit.auth_user('r16-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Recettes A');
  home_b text := testkit.household(carol, 'Foyer Recettes B');
  alice_m text;
  bob_m text;
  nina_m text;
  carol_m text;
  default_a text;
  recipe_r1 text := private.new_id('recipe');
  recipe_r2 text := private.new_id('recipe');
  recipe_b1 text := private.new_id('recipe');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Recettes', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Recettes', 'membre', 'ink');
  nina_m := testkit.member(home_a, nina, 'Nina Enfant', 'enfant', 'coral');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('nina', nina), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('bob_m', bob_m), ('nina_m', nina_m),
    ('carol_m', carol_m),
    ('recipe_r1', recipe_r1), ('recipe_r2', recipe_r2), ('recipe_b1', recipe_b1);

  -- Le trigger seed_recipe_defaults (0122) a cree le defaut + 14 tags a la
  -- creation des foyers : on lit le defaut pour les fixtures.
  select c.id into default_a
    from public.recipe_categories c
   where c.household_id = home_a
     and c.name = 'Recettes du foyer';
  insert into testkit.fx (key, row_id) values ('default_a', default_a);

  insert into public.recipes (id, household_id, title, category_id, servings, prep_minutes, cook_minutes, created_by)
  values (recipe_r1, home_a, 'Gratin dauphinois', default_a, 4, 30, 45, alice_m),
         (recipe_r2, home_a, 'Soupe du soir', default_a, 2, 10, 20, bob_m),
         (recipe_b1, home_b, 'Tarte voisine', null, 6, 20, 30, carol_m);

  -- Farine 500 g + Sel NULL « au gout » (R6).
  insert into public.recipe_ingredients (recipe_id, household_id, name, quantity, unit, position)
  values (recipe_r1, home_a, 'Farine', 500, 'g', 1),
         (recipe_r1, home_a, 'Sel', null, 'au goût', 2);
  insert into public.recipe_steps (recipe_id, household_id, content, position)
  values (recipe_r1, home_a, 'Melanger la farine et le sel.', 1),
         (recipe_r1, home_a, 'Cuire au four.', 2);

  -- Tag seed lie a la recette (Plat).
  insert into public.recipe_tag_links (recipe_id, tag_id, household_id)
  select recipe_r1, t.id, home_a
    from public.recipe_tags t
   where t.household_id = home_a
     and t.name = 'Plat';
end;
$$;

-- ===========================================================================
-- 1. Seeds : defaut + 14 tags par foyer (R2/R4).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_categories where household_id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  'Recettes du foyer')), 1::bigint,
  'chaque foyer a sa categorie par defaut');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_tags where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 14::bigint,
  '14 tags seed par foyer');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_tags where household_id = %L and name in (%L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_b'),
  'Pâtes', 'Végétarien', 'Petit-déj')), 3::bigint,
  'les tags accentues sont seeds dans chaque foyer');

-- ===========================================================================
-- 2. Tracer : un membre cree une categorie, y assigne une recette, supprime
--    une categorie vide ; la suppression d'une categorie pleine reassigne
--    vers le defaut (R2).
-- ===========================================================================
select testkit.as_user(user_id, 'r16-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.recipe_categories (household_id, name) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Desserts')), 1::bigint,
  'un membre cree une categorie');

select testkit.eq(testkit.affected(format(
  'update public.recipes set category_id = (select c.id from public.recipe_categories c where c.household_id = %L and c.name = %L) where id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  'Desserts',
  (select row_id from testkit.fx where key = 'recipe_r1'))), 1::bigint,
  'un membre assigne une recette a sa categorie');

select testkit.eq(testkit.affected(format(
  'insert into public.recipe_categories (household_id, name) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Vide')), 1::bigint,
  'une categorie vide se cree');

select testkit.eq(testkit.affected(format(
  'delete from public.recipe_categories where household_id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  'Vide')), 1::bigint,
  'la suppression d''une categorie vide est possible');

-- Suppression pleine : la recette rejoint le defaut du foyer.
select testkit.eq(testkit.affected(format(
  'delete from public.recipe_categories where household_id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  'Desserts')), 1::bigint,
  'la suppression d''une categorie pleine passe');

reset role;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where id = %L and category_id = %L',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select row_id from testkit.fx where key = 'default_a'))), 1::bigint,
  'la recette d''une categorie supprimee est reassignee vers Recettes du foyer');

-- ===========================================================================
-- 3. Tags a la volee + renommage propage (R4).
-- ===========================================================================
select testkit.as_user(user_id, 'r16-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.recipe_tags (household_id, name) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Thermomix')), 1::bigint,
  'saisir un tag inconnu le cree');

select testkit.eq(testkit.affected(format(
  'insert into public.recipe_tag_links (recipe_id, tag_id, household_id) select %L, t.id, %L from public.recipe_tags t where t.household_id = %L and t.name = %L',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select household_id from testkit.fx where key = 'home_a'),
  'Thermomix')), 1::bigint,
  'le tag cree a la volee s''assigne a la recette');

select testkit.eq(testkit.affected(format(
  'update public.recipe_tags set name = %L where household_id = %L and name = %L',
  'Robot',
  (select household_id from testkit.fx where key = 'home_a'),
  'Thermomix')), 1::bigint,
  'renommer un tag en parametres passe');

reset role;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_tag_links l join public.recipe_tags t on t.id = l.tag_id where l.recipe_id = %L and t.name = %L',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  'Robot')), 1::bigint,
  'le renommage se repercute sur les recettes liees');

-- ===========================================================================
-- 4. Ingredients structures : Farine 500 g + Sel NULL (R6).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_ingredients where recipe_id = %L and name = %L and quantity = 500 and unit = %L',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  'Farine', 'g')), 1::bigint,
  'Farine 500 g s''enregistre');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_ingredients where recipe_id = %L and name = %L and quantity is null',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  'Sel')), 1::bigint,
  'Sel sans nombre (NULL, au gout) s''enregistre');

-- ===========================================================================
-- 5. Lecture des recettes : adulte OK ; depuis 0145 l'enfant gere n'a plus de
--    compte (ni session) : l'uid enfant ne resout aucun membre et ne lit plus
--    rien ; toute ecriture directe refusee (R10, T-16-02).
-- ===========================================================================
select testkit.as_user(user_id, 'r16-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 2::bigint,
  'un adulte du foyer lit les recettes de son foyer');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_ingredients where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 2::bigint,
  'un adulte du foyer lit les ingredients');

reset role;

select testkit.as_user(user_id, 'r16-nina@example.fr') from testkit.fx where key = 'nina';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus les recettes');

select testkit.eq(testkit.count(format(
  'select 1 from public.recipe_ingredients where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un uid sans membre resolu ne lit plus les ingredients');

select testkit.expect_denied(format(
  'insert into public.recipes (household_id, title) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Gateau interdit'),
  'un enfant n''insere pas de recette');

select testkit.expect_denied(format(
  'insert into public.recipe_ingredients (recipe_id, household_id, name) values (%L, %L, %L)',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  'Sucre interdit'),
  'un enfant n''insere pas d''ingredient');

select testkit.eq(testkit.affected(format(
  'update public.recipes set title = %L where id = %L',
  'Titre pirate',
  (select row_id from testkit.fx where key = 'recipe_r1'))), 0::bigint,
  'un enfant ne modifie pas de recette');

select testkit.eq(testkit.affected(format(
  'delete from public.recipe_categories where id = %L',
  (select row_id from testkit.fx where key = 'default_a'))), 0::bigint,
  'un enfant ne supprime pas de categorie');

reset role;

-- ===========================================================================
-- 6. Isolation inter-foyers (2 foyers) + anti-forge.
-- ===========================================================================
select testkit.as_user(user_id, 'r16-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un autre foyer ne lit rien des recettes');

select testkit.expect_denied(format(
  'insert into public.recipes (household_id, title) values (%L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Intrusion'),
  'un autre foyer n''ecrit pas dans le foyer');

select testkit.expect_denied(format(
  'insert into public.recipe_tag_links (recipe_id, tag_id, household_id) select %L, t.id, %L from public.recipe_tags t where t.household_id = %L limit 1',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_b'),
  (select household_id from testkit.fx where key = 'home_b')),
  'un lien inter-foyers est refuse');

reset role;

-- ===========================================================================
-- 7. Partages : invisibles et inscriptibles en direct (R11, T-16-05).
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_recipe text;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select row_id into v_recipe from testkit.fx where key = 'recipe_r1';
  perform public.create_recipe_share(v_alice, v_recipe, repeat('c', 64), null, 5);
end;
$$;

select testkit.as_user(user_id, 'r16-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(
  'select 1 from public.recipe_shares',
  'aucune lecture invitee en PostgREST direct');

select testkit.expect_denied(format(
  'insert into public.recipe_shares (recipe_id, household_id, share_hash, created_by) values (%L, %L, %L, %L)',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  repeat('z', 64),
  (select user_id from testkit.fx where key = 'bob')),
  'aucune ecriture invitee en direct');

select testkit.expect_denied(
  'select public.create_recipe_share((select user_id from testkit.fx where key = ''bob''), (select row_id from testkit.fx where key = ''recipe_r1''), repeat(''c'', 64))',
  'authenticated ne peut pas appeler le RPC en direct');

reset role;

-- ===========================================================================
-- 8. Cycle de vie du lien : creation, lecture, compteur, revocation,
--    expiration, oracle uniforme, hash seul persiste (R11).
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_recipe_r1 text;
  v_recipe_r2 text;
  v_view jsonb;
begin
  select user_id into v_alice from testkit.fx where key = 'alice';
  select row_id into v_recipe_r1 from testkit.fx where key = 'recipe_r1';
  select row_id into v_recipe_r2 from testkit.fx where key = 'recipe_r2';

  -- Resume sans empreinte, compteur a zero.
  perform testkit.eq(
    (select (public.recipe_share_summary(v_alice, v_recipe_r1) ->> 'use_count')),
    '0',
    'le compteur demarre a zero');

  -- Lecture : fiche + enfants + tags, compteur consomme.
  v_view := public.view_recipe_share(repeat('c', 64));
  perform testkit.eq(v_view ->> 'title', 'Gratin dauphinois', 'la fiche rend le bon titre');
  perform testkit.eq(jsonb_array_length(v_view -> 'ingredients')::bigint, 2::bigint, 'la fiche rend 2 ingredients');
  perform testkit.eq(jsonb_array_length(v_view -> 'steps')::bigint, 2::bigint, 'la fiche rend 2 etapes');
  perform testkit.ok(v_view -> 'tags' ? 'Plat', 'la fiche rend le tag Plat');
  perform testkit.eq(
    (select (public.recipe_share_summary(v_alice, v_recipe_r1) ->> 'use_count')),
    '1',
    'la lecture consomme une utilisation');

  -- Oracle uniforme : hash inconnu, revoque, expire, epuise rendent pareil.
  begin
    perform public.view_recipe_share(repeat('0', 64));
    raise exception 'ASSERTION ÉCHOUÉE : hash inconnu accepte';
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'hash inconnu : oracle unique');
  end;

  -- max-uses = 1 : une lecture passe, la suivante est invalide.
  perform public.create_recipe_share(v_alice, v_recipe_r2, repeat('d', 64), null, 1);
  perform public.view_recipe_share(repeat('d', 64));
  begin
    perform public.view_recipe_share(repeat('d', 64));
    raise exception 'ASSERTION ÉCHOUÉE : seconde lecture max-uses=1 acceptee';
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'max-uses=1 epuise : oracle unique');
  end;

  -- Revocation : le lien devient invalide.
  perform public.create_recipe_share(v_alice, v_recipe_r2, repeat('e', 64), null, 5);
  perform public.revoke_recipe_share(v_alice, v_recipe_r2);
  begin
    perform public.view_recipe_share(repeat('e', 64));
    raise exception 'ASSERTION ÉCHOUÉE : lien revoque accepte';
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'lien revoque : oracle unique');
  end;

  -- Expiration : le lien devient invalide.
  perform public.create_recipe_share(v_alice, v_recipe_r2, repeat('f', 64), null, 5);
  update public.recipe_shares
     set expires_at = now() - interval '1 day'
   where share_hash = repeat('f', 64);
  begin
    perform public.view_recipe_share(repeat('f', 64));
    raise exception 'ASSERTION ÉCHOUÉE : lien expire accepte';
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'lien expire : oracle unique');
  end;

  -- Seul le hash persiste : format hex64, jamais de brut.
  perform testkit.eq(testkit.count(format(
    'select 1 from public.recipe_shares where recipe_id = %L and share_hash !~ %L',
    v_recipe_r2, '^[0-9a-f]{64}$')), 0::bigint,
    'seul le hash HMAC hex64 persiste en base');

  -- Regeneration : un nouveau lien desactive le precedent de la recette.
  perform public.create_recipe_share(v_alice, v_recipe_r2, repeat('a', 64), null, 5);
  perform public.create_recipe_share(v_alice, v_recipe_r2, repeat('b', 64), null, 5);
  begin
    perform public.view_recipe_share(repeat('a', 64));
    raise exception 'ASSERTION ÉCHOUÉE : lien regenere encore actif';
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'regeneration : precedent desactive');
  end;
  perform public.view_recipe_share(repeat('b', 64));
end;
$$;

rollback;
