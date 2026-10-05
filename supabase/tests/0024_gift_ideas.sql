-- supabase/tests/0024_gift_ideas.sql
-- Idées cadeau du foyer (0076) : isolation inter-foyer, écriture réservée aux
-- rôles écrivains, masquage surprise (D-08 : une idée destinée à un membre est
-- invisible de ce membre, visible du reste du foyer), lien gift_items.idea_id
-- avec survie à la suppression, littéraux de statut verrouillés (D-05).
--
-- Scénario repris de 0022 : foyer A (Alice admin, Bob membre, Noé enfant),
-- foyer B (Carol admin, Dave membre).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('enfant@example.fr', 'Noe Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Martin', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');
  dave_m text := testkit.member(home_b, dave, 'Dave Durand', 'membre', 'ink');

  list_contact_a text := private.new_id('contact-list');
  contact_bob text := private.new_id('contact');
  idea_a text := private.new_id('gift-idea');
  glist_a text := private.new_id('gift-list');
  gitem_a text := private.new_id('gift-item');
begin
  -- Liste de contacts explicite (indépendante du seed 0077) + contact lié à
  -- Bob : c'est ce lien qui déclenche le masquage surprise sur l'idée.
  insert into public.contact_lists (id, household_id, name, owner_member_id, is_default)
  values (list_contact_a, home_a, 'Liste Test 0024', null, false);

  insert into public.contacts (id, list_id, household_id, name, linked_member_id)
  values (contact_bob, list_contact_a, home_a, 'Bob Martin', bob_m);

  -- Idée d'Alice destinée à Bob.
  insert into public.gift_ideas (id, household_id, name, price, created_by, giftee_contact_id)
  values (idea_a, home_a, 'Vélo pour Bob', 299.99, alice_m, contact_bob);

  -- Liste de cadeaux + article lié à l'idée (preuve du ON DELETE SET NULL).
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values (glist_a, home_a, alice_m, 'Noël', 'privee');

  insert into public.gift_items (id, list_id, household_id, name, idea_id)
  values (gitem_a, glist_a, home_a, 'Vélo', idea_a);

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('dave', dave, home_b, dave_m),
    ('idea_a', null, home_a, idea_a),
    ('gitem_a', null, home_a, gitem_a);
end;
$$;

-- ===========================================================================
-- Alice, créatrice et administratrice du foyer A
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.gift_ideas'), 1::bigint,
  'Alice voit l''idee qu''elle a creee pour Bob');
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name) values (%L, %L, %L)',
  'idea_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus'),
  'impossible de creer une idee dans un autre foyer');
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name, created_by) values (%L, %L, %L, %L)',
  'idea_spoof', (select household_id from testkit.fx where key = 'alice'), 'Au nom de Bob',
  (select row_id from testkit.fx where key = 'bob')),
  'impossible d''ecrire une idee au nom d''un autre membre');
-- Le statut verrouille les literaux D-05 : toute autre valeur est refusee.
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name, status) values (%L, %L, %L, %L)',
  'idea_bad_status', (select household_id from testkit.fx where key = 'alice'), 'Statut inconnu', 'reservee'),
  'un statut hors (a_offrir, offert) est refuse');
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name, price) values (%L, %L, %L, %s)',
  'idea_bad_price', (select household_id from testkit.fx where key = 'alice'), 'Prix negatif', '-5'),
  'un prix negatif est refuse');
select testkit.eq(testkit.affected(format(
  'update public.gift_ideas set comment = %L where id = %L', 'Taille M',
  (select row_id from testkit.fx where key = 'idea_a'))), 1::bigint,
  'Alice modifie une idee de son foyer');

reset role;

-- ===========================================================================
-- Bob, destinataire de l'idée : la surprise le rend aveugle à sa propre idée
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.gift_ideas'), 0::bigint,
  'Bob ne voit pas l''idee qui lui est destinee (surprise D-08)');
select testkit.eq(testkit.affected(format(
  'update public.gift_ideas set name = %L where id = %L', 'Pirate',
  (select row_id from testkit.fx where key = 'idea_a'))), 0::bigint,
  'Bob ne peut pas modifier l''idee qui lui est destinee');
select testkit.eq(testkit.affected(format(
  'delete from public.gift_ideas where id = %L', (select row_id from testkit.fx where key = 'idea_a'))), 0::bigint,
  'Bob (non admin) ne peut pas supprimer une idee');

reset role;

-- ===========================================================================
-- Noé, rôle `enfant` : lecture seule
-- ===========================================================================
select testkit.as_user(user_id, 'enfant@example.fr') from testkit.fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.gift_ideas'), 1::bigint,
  'un enfant lit l''idee de son foyer (il n''en est pas le destinataire)');
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name) values (%L, %L, %L)',
  'idea_kid', (select household_id from testkit.fx where key = 'enfant'), 'Bonbons'),
  'un enfant ne cree pas d''idee');

reset role;

-- ===========================================================================
-- Carol et Dave, foyer B : isolation inter-foyer
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.gift_ideas'), 0::bigint,
  'Carol ne voit pas les idees du foyer A');
select testkit.eq(testkit.affected(format(
  'update public.gift_ideas set name = %L where id = %L', 'Pirate',
  (select row_id from testkit.fx where key = 'idea_a'))), 0::bigint,
  'Carol ne peut pas modifier une idee du foyer A');
select testkit.eq(testkit.affected(format(
  'delete from public.gift_ideas where id = %L', (select row_id from testkit.fx where key = 'idea_a'))), 0::bigint,
  'Carol ne peut pas supprimer une idee du foyer A');

reset role;

select testkit.as_user(user_id, 'dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.gift_ideas'), 0::bigint,
  'Dave ne voit pas les idees du foyer A');

reset role;

-- ===========================================================================
-- Suppression : l'article survit avec idea_id NULL (en FIN de fichier)
-- ===========================================================================
-- L'idée `idea_a` est référencée par `gitem_a` : la supprimer prouve le
-- `on delete set null`. Ce bloc détruit la fixture, il est donc dernier.
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.gift_ideas where id = %L', (select row_id from testkit.fx where key = 'idea_a'))), 1::bigint,
  'une administratrice peut supprimer une idee de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.gift_items where id = %L', (select row_id from testkit.fx where key = 'gitem_a'))), 1::bigint,
  'l''article survit a la suppression de son idee');
select testkit.eq(testkit.count(format(
  'select 1 from public.gift_items where id = %L and idea_id is null',
  (select row_id from testkit.fx where key = 'gitem_a'))), 1::bigint,
  'l''article supprime garde idea_id a NULL');

reset role;

rollback;
