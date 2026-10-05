-- supabase/tests/0025_contacts_mirror.sql
-- Listes et contacts du foyer, PARTIE LISTES (plan 05-01 ; la partie miroir
-- birthdays sera complétée par le plan 05-02).
--
-- Défauts D-01 (Famille partagée + une perso par adulte), pré-remplissage
-- D-02 (un contact lié par adulte, zéro pour l'enfant), RLS perso
-- propriétaire + admins (OQ-2), enfant bloqué en écriture, isolation
-- inter-foyer, suppression non-défaut OK, suppression dernière-défaut
-- refusée.
--
-- Le seed est déclenché par les insertions de membres ci-dessous (trigger
-- ensure_default_contact_list de 0077) : les fixtures n'insèrent aucune
-- liste à la main.
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
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('dave', dave, home_b, dave_m);

  -- Identifiants seedés par le trigger (membres insérés ci-dessus) : lus ici
  -- en superuser pour des assertions RLS franches (une sous-requête RLS qui
  -- rend NULL prouverait une violation NOT NULL, pas un refus RLS).
  insert into testkit.fx (key, user_id, household_id, row_id)
  select 'famille_a', null, home_a, l.id
    from public.contact_lists l
   where l.household_id = home_a and l.owner_member_id is null and l.is_default
   limit 1;
  insert into testkit.fx (key, user_id, household_id, row_id)
  select 'alice_perso', null, home_a, l.id
    from public.contact_lists l
   where l.household_id = home_a and l.owner_member_id = alice_m and l.is_default
   limit 1;
end;
$$;

-- ===========================================================================
-- Alice, administratrice du foyer A : défauts et pré-remplissage
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contact_lists'), 3::bigint,
  'Alice (admin) voit Famille + 2 persos adultes');
select testkit.eq(testkit.count(
  'select 1 from public.contact_lists where owner_member_id is null and is_default and name = ''Famille'''), 1::bigint,
  'la liste Famille partagee existe');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where owner_member_id = %L and is_default',
  (select row_id from testkit.fx where key = 'alice'))), 1::bigint,
  'Alice a sa liste personnelle par defaut');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where owner_member_id = %L and is_default',
  (select row_id from testkit.fx where key = 'bob'))), 1::bigint,
  'Bob a sa liste personnelle par defaut');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where owner_member_id = %L',
  (select row_id from testkit.fx where key = 'enfant'))), 0::bigint,
  'l''enfant n''a aucune liste personnelle');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where linked_member_id = %L',
  (select row_id from testkit.fx where key = 'alice'))), 1::bigint,
  'un contact pre-rempli lie Alice');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where linked_member_id = %L',
  (select row_id from testkit.fx where key = 'bob'))), 1::bigint,
  'un contact pre-rempli lie Bob');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where linked_member_id = %L',
  (select row_id from testkit.fx where key = 'enfant'))), 0::bigint,
  'aucun contact pre-rempli pour l''enfant');

reset role;

-- ===========================================================================
-- Bob, membre : il voit Famille + sa perso, pas celle d'Alice (OQ-2)
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contact_lists'), 2::bigint,
  'Bob voit Famille + sa perso, pas celle d''Alice');
select testkit.expect_denied(format(
  'insert into public.contacts (list_id, household_id, name) values (%L, %L, %L)',
  (select row_id from testkit.fx where key = 'alice_perso'),
  (select household_id from testkit.fx where key = 'bob'), 'Intrus'),
  'Bob n''ecrit pas dans la liste personnelle d''Alice');
select testkit.eq(testkit.affected(format(
  'delete from public.contact_lists where id = %L',
  (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'Bob (non admin) ne supprime pas la liste d''Alice');
select testkit.eq(testkit.affected(format(
  'insert into public.contact_lists (id, household_id, name, owner_member_id) values (%L, %L, %L, %L)',
  'list_bob_extra', (select household_id from testkit.fx where key = 'bob'),
  'Bob Extra', (select row_id from testkit.fx where key = 'bob'))), 1::bigint,
  'Bob cree une liste non-defaut a son nom');

reset role;

-- ===========================================================================
-- Noé, rôle `enfant` : lecture de Famille seule, aucune écriture
-- ===========================================================================
select testkit.as_user(user_id, 'enfant@example.fr') from testkit.fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contact_lists'), 1::bigint,
  'l''enfant ne voit que Famille');
select testkit.expect_denied(format(
  'insert into public.contact_lists (id, household_id, name) values (%L, %L, %L)',
  'list_kid', (select household_id from testkit.fx where key = 'enfant'), 'Copains'),
  'un enfant ne cree pas de liste de contacts');
select testkit.expect_denied(format(
  'insert into public.contacts (list_id, household_id, name) values (%L, %L, %L)',
  (select id from public.contact_lists where owner_member_id is null limit 1),
  (select household_id from testkit.fx where key = 'enfant'), 'Copain'),
  'un enfant ne cree pas de contact');

reset role;

-- ===========================================================================
-- Carol (admin) et Dave (membre), foyer B : isolation inter-foyer
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contact_lists'), 3::bigint,
  'Carol voit les 3 listes de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L',
  (select household_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Carol ne voit aucune liste du foyer A');
select testkit.expect_denied(format(
  'insert into public.contact_lists (id, household_id, name) values (%L, %L, %L)',
  'list_piege', (select household_id from testkit.fx where key = 'alice'), 'Piege'),
  'Carol ne cree pas de liste dans le foyer A');
select testkit.expect_denied(format(
  'insert into public.contacts (list_id, household_id, name) values (%L, %L, %L)',
  (select row_id from testkit.fx where key = 'famille_a'),
  (select household_id from testkit.fx where key = 'alice'), 'Piege'),
  'Carol ne cree pas de contact dans le foyer A');

reset role;

select testkit.as_user(user_id, 'dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contact_lists'), 2::bigint,
  'Dave voit Famille + sa perso, pas celle de Carol');

reset role;

-- ===========================================================================
-- Suppressions (en FIN de fichier) : non-défaut OK, dernière-défaut refusée
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.contact_lists where id = ''list_bob_extra'''), 1::bigint,
  'une liste non-defaut se supprime');
select testkit.eq(testkit.affected(format(
  'delete from public.contact_lists where owner_member_id = %L',
  (select row_id from testkit.fx where key = 'bob'))), 1::bigint,
  'une liste perso non-derniere se supprime (admin)');
select testkit.eq(testkit.affected(format(
  'delete from public.contact_lists where owner_member_id = %L',
  (select row_id from testkit.fx where key = 'alice'))), 1::bigint,
  'la deuxieme perso se supprime tant que Famille reste');
select testkit.expect_denied(
  'delete from public.contact_lists where owner_member_id is null and is_default',
  'la derniere liste par defaut (Famille) ne se supprime pas');
select testkit.eq(testkit.count(
  'select 1 from public.contact_lists where owner_member_id is null and is_default and name = ''Famille'''), 1::bigint,
  'Famille est toujours la apres le refus');

reset role;

rollback;
