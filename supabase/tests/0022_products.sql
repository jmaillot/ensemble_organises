-- supabase/tests/0022_products.sql
-- Catalogue de produits du foyer (0071) : isolation inter-foyer, ecriture
-- reservee aux roles ecrivains, lien item-produit avec survie a la
-- suppression, unicite de l'EAN par foyer.
--
-- Scenario repris de 0002 : foyer A (Alice admin, Bob membre, Noe enfant),
-- foyer B (Carol admin, Dave membre).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('enfant@example.fr', 'Noe Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Martin', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');

  list_a text := private.new_id('list');
  prod_a text := private.new_id('product');
  item_a text := private.new_id('item');
begin
  insert into public.shopping_lists (id, household_id, name, created_by)
  values (list_a, home_a, 'Fresque', alice_m);

  insert into public.products (id, household_id, ean, name, brand, created_by)
  values (prod_a, home_a, '3017620422003', 'Nutella', 'Ferrero', alice_m);

  insert into public.shopping_list_items (id, list_id, household_id, name, product_id, added_by)
  values (item_a, list_a, home_a, 'Nutella', prod_a, alice_m);

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('list_a', null, home_a, list_a),
    ('prod_a', null, home_a, prod_a),
    ('item_a', null, home_a, item_a);
end;
$$;

-- Produit témoin du foyer B (superuser, hors RLS) pour les tests de lien
-- inter-foyer ci-dessous. Supprimé avant la section Carol, qui exige un
-- foyer B vide de produits.
insert into public.products (id, household_id, ean, name)
select 'prod_b_0022', household_id, '5000159515154', 'Confiture de Carol'
  from testkit.fx where key = 'carol';

-- ===========================================================================
-- Alice, administratrice du foyer A
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.products'), 1::bigint,
  'Alice voit le produit de son foyer');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name) values (%L, %L, %L, %L)',
  'prod_x', (select household_id from testkit.fx where key = 'carol'), '3017620422003', 'Intrus'),
  'impossible de creer un produit dans un autre foyer');
select testkit.eq(testkit.affected(format(
  'update public.products set name = %L where id = %L', 'Pate a tartiner', (select row_id from testkit.fx where key = 'prod_a'))), 1::bigint,
  'Alice modifie un produit de son foyer');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name, created_by) values (%L, %L, %L, %L, %L)',
  'prod_spoof', (select household_id from testkit.fx where key = 'alice'), '5000159461122', 'Au nom de Bob',
  (select row_id from testkit.fx where key = 'bob')),
  'impossible d''ecrire un produit au nom d''un autre membre');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name) values (%L, %L, %L, %L)',
  'prod_dup', (select household_id from testkit.fx where key = 'alice'), '3017620422003', 'Doublon'),
  'le meme EAN ne peut pas exister deux fois dans le meme foyer');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name) values (%L, %L, %L, %L)',
  'prod_b', (select household_id from testkit.fx where key = 'carol'), '3017620422003', 'Nutella de Carol'),
  'Alice ne peut pas ecrire dans le foyer B meme avec un EAN partage');
select testkit.expect_denied(format(
  'insert into public.shopping_list_items (id, list_id, household_id, name, product_id, added_by) values (%L, %L, %L, %L, %L, %L)',
  'item_piege', (select row_id from testkit.fx where key = 'list_a'),
  (select household_id from testkit.fx where key = 'alice'), 'Piege', 'prod_b_0022',
  (select row_id from testkit.fx where key = 'alice')),
  'impossible de lier un article au produit d''un autre foyer');
select testkit.expect_denied(format(
  'update public.shopping_list_items set product_id = %L where id = %L',
  'prod_b_0022', (select row_id from testkit.fx where key = 'item_a')),
  'impossible de re-pointer un article vers un autre foyer');

reset role;

-- Nettoyage du témoin : la section Carol compte les produits du foyer B.
delete from public.products where id = 'prod_b_0022';

-- ===========================================================================
-- Carol, administratrice du foyer B : meme EAN, autre foyer
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.products'), 0::bigint,
  'Carol ne voit pas les produits du foyer A');
select testkit.eq(testkit.affected(format(
  'insert into public.products (id, household_id, ean, name, created_by) values (%L, %L, %L, %L, %L)',
  'prod_b', (select household_id from testkit.fx where key = 'carol'), '3017620422003', 'Nutella', (select row_id from testkit.fx where key = 'carol'))), 1::bigint,
  'le meme EAN peut exister dans un autre foyer');
select testkit.eq(testkit.affected(format(
  'update public.products set name = %L where id = %L', 'Pirate', (select row_id from testkit.fx where key = 'prod_a'))), 0::bigint,
  'Carol ne peut pas modifier un produit du foyer A');
select testkit.eq(testkit.affected(format(
  'delete from public.products where id = %L', (select row_id from testkit.fx where key = 'prod_a'))), 0::bigint,
  'Carol ne peut pas supprimer un produit du foyer A');

reset role;

-- ===========================================================================
-- Noe, role `enfant` : lecture seule
-- ===========================================================================
select testkit.as_user(user_id, 'enfant@example.fr') from testkit.fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.products'), 1::bigint,
  'un enfant lit les produits de son foyer');
select testkit.expect_denied(format(
  'insert into public.products (id, household_id, ean, name) values (%L, %L, %L, %L)',
  'prod_kid', (select household_id from testkit.fx where key = 'enfant'), '5000159461122', 'Bonbons'),
  'un enfant ne cree pas de produit');

reset role;

-- ===========================================================================
-- Bob, membre non-créateur : édition partagée (0088)
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.products set name = %L where id = %L', 'Pate a tartiner Bob', (select row_id from testkit.fx where key = 'prod_a'))), 1::bigint,
  'un membre modifie le produit d''un autre membre de son foyer');
select testkit.expect_denied(format(
  'update public.products set created_by = %L where id = %L',
  (select row_id from testkit.fx where key = 'bob'), (select row_id from testkit.fx where key = 'prod_a')),
  'l''auteur d''un produit ne peut pas etre reattribue');

reset role;

-- ===========================================================================
-- Suppression : l'article survit avec product_id NULL (en FIN de fichier)
-- ===========================================================================
-- Le produit `prod_a` est reference par `item_a` : le supprimer prouve le
-- `on delete set null`. Ce bloc detruit la fixture, il est donc dernier.
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.products where id = %L', (select row_id from testkit.fx where key = 'prod_a'))), 1::bigint,
  'une administratrice peut supprimer un produit de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_list_items where id = %L', (select row_id from testkit.fx where key = 'item_a'))), 1::bigint,
  'l''article survit a la suppression de son produit');
select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_list_items where id = %L and product_id is null',
  (select row_id from testkit.fx where key = 'item_a'))), 1::bigint,
  'l''article supprime garde product_id a NULL');

reset role;

rollback;
