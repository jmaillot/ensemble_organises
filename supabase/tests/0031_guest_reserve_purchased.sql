-- supabase/tests/0031_guest_reserve_purchased.sql
-- Tenue anonyme + `purchased` (0091, suivi serveur de CR-01/06-REVIEW.md) :
-- la réserve invitée pose `purchased = true` en même temps que
-- `reserved_by_name`, donc le propriétaire — qui lit la vue masquée
-- (`purchased` exposé, auteurs à NULL) — voit le badge Réservé et le contrôle
-- Libérer. Preuves : signal posé atomiquement, idempotence inchangée, vue
-- invitée toujours booléenne, vue masquée propriétaire, libération
-- gestionnaire des trois colonnes, article libéré réservable à nouveau, et
-- non-régression de la tenue membre (qui posait déjà `purchased`).
--
-- Voie serveur (sans identité JWT, rôle propriétaire) D'ABORD, comme en
-- 0029 : les claims posées par testkit.as_user persistent jusqu'à la fin de
-- la transaction et feraient passer la voie serveur pour une voie cliente.
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire de la liste,
-- Dave membre avec partage `reservation`), foyer B (Carol admin, ne voit
-- rien).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice31@example.fr', 'Alice Trente-Et-Un');
  bob uuid := testkit.auth_user('bob31@example.fr', 'Bob Trente-Et-Un');
  dave uuid := testkit.auth_user('dave31@example.fr', 'Dave Trente-Et-Un');
  carol uuid := testkit.auth_user('carol31@example.fr', 'Carol Trente-Et-Un');

  home_a text := testkit.household(alice, 'Foyer 31');
  home_b text := testkit.household(carol, 'Foyer 31 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Trente-Et-Un', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Trente-Et-Un', 'membre', 'ink');
  dave_m text := testkit.member(home_a, dave, 'Dave Trente-Et-Un', 'membre', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Trente-Et-Un', 'admin', 'coral');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl31_privee', home_a, bob_m, 'Noel 31 Prive', 'privee');

  -- gitem31_a : tenue anonyme (voie invitée). gitem31_b : tenue membre
  -- (non-régression, voie UPDATE garde).
  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem31_a', 'gl31_privee', home_a, 'Puzzle', 25),
         ('gitem31_b', 'gl31_privee', home_a, 'Livre', 15);

  -- Dave : partage `reservation` membre sur la privée (voie garde 42501).
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh31_dave', 'gl31_privee', dave_m, 'reservation');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('dave', dave, home_a, dave_m),
    ('carol', carol, home_b, carol_m);
end;
$$;

-- Mêmes raisons que `testkit.fx` : lue après `set local role authenticated`,
-- une table temporaire serait en permission refusée (motif 0003).
create table testkit.hashes ("h1" text);
insert into testkit.hashes values
  ('7777777777777777777777777777777777777777777777777777777777777777');
grant select on testkit.hashes to anon, authenticated;

select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl31_privee',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);

-- ===========================================================================
-- 1. Signal propriétaire posé atomiquement (CR-01) : une réserve anonyme
--    porte `purchased = true` ET `reserved_by_name`, jamais `reserved_by`.
-- ===========================================================================
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem31_a', 'Mamie'
  ) ->> 'already_reserved')::boolean,
  false,
  'la première réserve anonyme réussit');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem31_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by_name = ''Mamie'' and reserved_by is null'),
  1::bigint,
  'la réserve anonyme pose purchased ET le nom déclaré, sans FK membre');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'la réserve ne consomme pas use_count');

-- ===========================================================================
-- 2. Idempotence à nom égal inchangée : la ligne porte déjà purchased depuis
--    la première réserve ; conflit à nom différent toujours 409.
-- ===========================================================================
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem31_a', 'mamie  '
  ) ->> 'already_reserved')::boolean,
  true,
  'même nom normalisé : succès rejoué, sans erreur');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem31_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by_name = ''Mamie'''),
  1::bigint,
  'le rejeu idempotent ne change ni purchased ni l''auteur');
do $$
declare
  h1 text := (select h1 from testkit.hashes);
begin
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem31_a', 'Papi');
    perform testkit.ok(false, 'un autre nom sur un article réservé aurait du être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'autre nom en conflit 409 : ' || sqlerrm);
  end;
end;
$$;

-- ===========================================================================
-- 3. Charge invitée inchangée : booléen `reserved`, jamais d'auteur.
-- ===========================================================================
select testkit.eq(
  (public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') @> '[{"reserved": true}]'::jsonb,
  true,
  'la vue invitée marque l''article anonyme par un booléen (sans ordre supposé)');
select testkit.eq(
  ((public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items' -> 0) ? 'reserved_by_name'),
  false,
  'la charge invitée ne porte toujours aucune clé reserved_by_name');

-- ===========================================================================
-- 4. Vue masquée propriétaire (D-07 + CR-01) : `purchased` vrai — le signal
--    qui allume le badge Réservé et le contrôle Libérer — auteurs à NULL.
-- ===========================================================================
select testkit.as_user(user_id, 'bob31@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem31_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire voit purchased vrai, auteurs masqués (CR-01 : badge + Libérer)');

reset role;

select testkit.as_user(user_id, 'carol31@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem31_a'''),
  0::bigint,
  'un autre foyer ne voit rien via la vue');

reset role;

-- ===========================================================================
-- 5. Non-régression membre : la tenue membre pose toujours purchased +
--    reserved_by, et le propriétaire la voit de la même forme masquée.
-- ===========================================================================
select testkit.as_user(user_id, 'dave31@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.expect_ok(format(
  'update public.gift_items set reserved_by = %L, purchased = true where id = ''gitem31_b''',
  (select row_id from testkit.fx where key = 'dave')));
select testkit.eq(testkit.count(format(
  'select 1 from public.gift_items where id = %L'
  ' and household_id = (select household_id from testkit.fx where key = ''dave'')'
  ' and purchased = true and reserved_by = %L and reserved_by_name is null',
  'gitem31_b', (select row_id from testkit.fx where key = 'dave'))),
  1::bigint,
  'la tenue membre porte purchased + FK membre, sans nom anonyme');

reset role;

select testkit.as_user(user_id, 'bob31@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem31_b'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire voit la tenue membre : purchased vrai, auteur masqué');

-- ===========================================================================
-- 6. Libération gestionnaire (D-08) : efface les TROIS colonnes d'un coup —
--    la forme anonyme comme la forme membre — et l'article redevient libre.
-- ===========================================================================
select testkit.expect_ok(
  'update public.gift_items set reserved_by = null, purchased = false, reserved_by_name = null where id = ''gitem31_a''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem31_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = false and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire libère une réserve anonyme : trois colonnes effacées');

select testkit.expect_ok(
  'update public.gift_items set reserved_by = null, purchased = false, reserved_by_name = null where id = ''gitem31_b''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem31_b'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = false and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire libère une réserve membre : trois colonnes effacées');

reset role;

-- Article libéré : réservable à nouveau par la voie invitée, signal reposé.
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem31_a', 'Papi'
  ) ->> 'already_reserved')::boolean,
  false,
  'un article libéré est réservable à nouveau');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem31_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by_name = ''Papi'' and reserved_by is null'),
  1::bigint,
  'la nouvelle réserve repose purchased + nom déclaré');

rollback;
