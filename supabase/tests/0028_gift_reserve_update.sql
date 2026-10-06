-- supabase/tests/0028_gift_reserve_update.sql
-- Réservation par un invité `reservation` sur liste privée (0083, D-17) :
-- l'invité (membre coché ou e-mail) peut poser/libérer sa réservation et
-- cocher acheté, mais ne touche à aucune autre colonne ni au nom d'autrui.
-- Un partage `lecture` ne modifie rien.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice28@example.fr', 'Alice Vingt-Huit');
  bob uuid := testkit.auth_user('bob28@example.fr', 'Bob Vingt-Huit');
  dave uuid := testkit.auth_user('dave28@example.fr', 'Dave Vingt-Huit');

  home_a text := testkit.household(alice, 'Foyer 28');
  alice_m text := testkit.member(home_a, alice, 'Alice Vingt-Huit', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Vingt-Huit', 'membre', 'ink');
  dave_m text := testkit.member(home_a, dave, 'Dave Vingt-Huit', 'membre', 'amber');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl28_privee', home_a, alice_m, 'Noel 28', 'privee');
  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem28', 'gl28_privee', home_a, 'Casque', 50);

  -- Bob : partage `reservation` membre. Dave : e-mail externe `reservation`.
  -- Gwen : e-mail externe `lecture` (ne doit rien modifier).
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh28_bob', 'gl28_privee', bob_m, 'reservation');
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh28_dave', 'gl28_privee', dave_m, 'lecture');
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh28_ext', 'gl28_privee', 'ext28@exemple.fr', 'reservation'),
         ('sh28_lec', 'gl28_privee', 'lec28@exemple.fr', 'lecture');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('dave', dave, home_a, dave_m);
end;
$$;

-- ===========================================================================
-- 1. L'invité membre réserve à son nom + coche acheté (D-17)
-- ===========================================================================
select testkit.as_user(user_id, 'bob28@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_ok(
  format('update public.gift_items set reserved_by = %L, purchased = true where id = %L',
    (select row_id from testkit.fx where key = 'bob'), 'gitem28'));
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem28'' and purchased = true'),
  1::bigint,
  'l''achat est enregistre');

-- ===========================================================================
-- 2. … mais ne touche ni au nom, ni au prix, ni à autrui
-- ===========================================================================
select testkit.expect_denied(
  'update public.gift_items set name = ''Pirate'' where id = ''gitem28''',
  'l''invite ne renomme pas l''article');
select testkit.expect_denied(
  'update public.gift_items set price = 1 where id = ''gitem28''',
  'l''invite ne touche pas au prix');
select testkit.expect_denied(format(
  'update public.gift_items set reserved_by = %L where id = ''gitem28''',
  (select row_id from testkit.fx where key = 'alice')),
  'l''invite ne reserve pas au nom d''un autre membre');

-- ===========================================================================
-- 3. Libération : reserved_by NULL redevient possible
-- ===========================================================================
select testkit.expect_ok(
  'update public.gift_items set reserved_by = null, purchased = false where id = ''gitem28''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem28'' and reserved_by is null and purchased = false'),
  1::bigint,
  'l''invite libere sa reservation');

-- ===========================================================================
-- 4. Partage `lecture` : aucune modification (membre Dave)
-- ===========================================================================
reset role;

select testkit.as_user(user_id, 'dave28@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.expect_denied(
  'update public.gift_items set purchased = true where id = ''gitem28''',
  'un partage lecture ne coche pas achete');
select testkit.expect_denied(format(
  'update public.gift_items set reserved_by = %L where id = ''gitem28''',
  (select row_id from testkit.fx where key = 'dave')),
  'un partage lecture ne reserve pas');

reset role;

rollback;
