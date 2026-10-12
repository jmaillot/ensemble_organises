-- supabase/tests/0048_flat_tables_isolation.sql
-- Phase 12 (D-02, plan 12-01) : preuves d'isolation des tables plates
-- voyages/animaux — trips, pets, pet_records — plus recipes en
-- future-proofing (table sans client, memes politiques plates).
--
-- Forme 0002 : acteurs par role (Alice admin A, Bob membre A, Noe enfant A,
-- Carol admin B), assertions bornees par objet via testkit.fx (jamais de
-- total nu), `affected = 0` pour les UPDATE/DELETE filtres par la RLS,
-- `expect_denied` pour les INSERT dont le WITH CHECK echoue, rollback final.
--
-- Rappel du motif prouve (0007) : SELECT membre du foyer, INSERT/UPDATE si
-- `can_write_household` (admin/membre — enfant exclu), DELETE admin-only.
-- `pet_records` porte en plus le trigger `align_household` (foyer impose
-- depuis `pets`, ecart refuse en 23514).
--
-- Section 0 prouve D-01 au catalogue : sans 0110, `trips` (abonne par
-- use-voyages) et les trois autres sont absents de `supabase_realtime` et
-- cette section est rouge ; avec 0110, elle est verte.

begin;

-- ===========================================================================
-- Section 0 — Publication Realtime (D-01), lue au catalogue
-- ===========================================================================
-- Forme positive : les quatre noms exacts doivent etre membres. Un compte
-- borne a la liste ne suppose aucune base vide et ne peut pas etre vert par
-- accident (un `count(*) >= 0` serait une tautologie).
select testkit.eq(
  (select count(*)
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename in ('trips', 'pets', 'pet_records', 'recipes')),
  4::bigint,
  'trips, pets, pet_records et recipes sont publies dans supabase_realtime (0110)');

do $$
declare
  alice uuid := testkit.auth_user('plate-alice@example.fr', 'Alice Plateau');
  bob uuid := testkit.auth_user('plate-bob@example.fr', 'Bob Plateau');
  kid uuid := testkit.auth_user('plate-kid@example.fr', 'Noe Plateau');
  carol uuid := testkit.auth_user('plate-carol@example.fr', 'Carol Voisine');

  home_a text := testkit.household(alice, 'Foyer Plateau A');
  home_b text := testkit.household(carol, 'Foyer Plateau B');

  alice_m text := testkit.member(home_a, alice, 'Alice Plateau', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Plateau', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Plateau', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');

  trip_a text := private.new_id('trip');
  trip_del text := private.new_id('trip');
  trip_b text := private.new_id('trip');
  pet_a text := private.new_id('pet');
  pet_del text := private.new_id('pet');
  pet_b text := private.new_id('pet');
  rec_a1 text := private.new_id('pet-record');
  rec_del text := private.new_id('pet-record');
  rec_b1 text := private.new_id('pet-record');
  recipe_a text := private.new_id('recipe');
  recipe_del text := private.new_id('recipe');
  recipe_b text := private.new_id('recipe');
begin
  insert into public.trips (id, household_id, name, destination, start_date, end_date)
  values (trip_a, home_a, 'Bretagne', 'Brest', current_date, current_date + 7),
         (trip_del, home_a, 'A supprimer', 'Nantes', current_date, current_date + 2),
         (trip_b, home_b, 'Corse', 'Ajaccio', current_date, current_date + 7);

  insert into public.pets (id, household_id, name, species)
  values (pet_a, home_a, 'Medor', 'chien'),
         (pet_del, home_a, 'A supprimer', 'chat'),
         (pet_b, home_b, 'Felix', 'chat');

  insert into public.pet_records (id, pet_id, household_id, type, name)
  values (rec_a1, pet_a, home_a, 'vaccin', 'Rappel'),
         (rec_del, pet_del, home_a, 'info', 'A supprimer'),
         (rec_b1, pet_b, home_b, 'vaccin', 'Primo');

  insert into public.recipes (id, household_id, title)
  values (recipe_a, home_a, 'Soupe'),
         (recipe_del, home_a, 'A supprimer'),
         (recipe_b, home_b, 'Tarte');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('trip_a', null, home_a, trip_a),
    ('trip_del', null, home_a, trip_del),
    ('trip_b', null, home_b, trip_b),
    ('pet_a', null, home_a, pet_a),
    ('pet_del', null, home_a, pet_del),
    ('pet_b', null, home_b, pet_b),
    ('rec_a1', null, home_a, rec_a1),
    ('rec_del', null, home_a, rec_del),
    ('rec_b1', null, home_b, rec_b1),
    ('recipe_a', null, home_a, recipe_a),
    ('recipe_del', null, home_a, recipe_del),
    ('recipe_b', null, home_b, recipe_b);
end;
$$;

-- ===========================================================================
-- Alice, administratrice du foyer A
-- ===========================================================================
select testkit.as_user(user_id, 'plate-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- --- Lecture : son foyer oui, l'autre non (bornes par objet) ----------------
select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_a'))), 1::bigint,
  'Alice lit le voyage de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_b'))), 0::bigint,
  'Alice ne voit pas le voyage du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_a'))), 1::bigint,
  'Alice lit l''animal de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_b'))), 0::bigint,
  'Alice ne voit pas l''animal du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_a1'))), 1::bigint,
  'Alice lit le suivi de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_b1'))), 0::bigint,
  'Alice ne voit pas le suivi du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where id = %L', (select row_id from testkit.fx where key = 'recipe_a'))), 1::bigint,
  'Alice lit la recette de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where id = %L', (select row_id from testkit.fx where key = 'recipe_b'))), 0::bigint,
  'Alice ne voit pas la recette du foyer B');

-- --- Ecriture inter-foyer : refusee -----------------------------------------
select testkit.expect_denied(format(
  'insert into public.trips (id, household_id, name, destination, start_date, end_date)'
  ' values (%L, %L, %L, %L, current_date, current_date + 1)',
  'trip_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus', 'Ailleurs'),
  'Alice ne cree pas un voyage dans le foyer B');
select testkit.expect_denied(format(
  'insert into public.pets (id, household_id, name, species) values (%L, %L, %L, %L)',
  'pet_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus', 'chien'),
  'Alice ne cree pas un animal dans le foyer B');
select testkit.eq(testkit.affected(format(
  'update public.trips set name = %L where id = %L', 'Detourne', (select row_id from testkit.fx where key = 'trip_b'))), 0::bigint,
  'Alice ne modifie pas le voyage du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_b'))), 0::bigint,
  'Alice ne supprime pas l''animal du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_b1'))), 0::bigint,
  'Alice ne supprime pas le suivi du foyer B');

-- --- Suppression admin : chemin heureux --------------------------------------
select testkit.eq(testkit.affected(format(
  'delete from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_del'))), 1::bigint,
  'une administratrice supprime un voyage de son foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.recipes where id = %L', (select row_id from testkit.fx where key = 'recipe_del'))), 1::bigint,
  'une administratrice supprime une recette de son foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_del'))), 1::bigint,
  'une administratrice supprime un animal de son foyer (suivis en cascade)');

reset role;

-- ===========================================================================
-- Bob, membre ordinaire du foyer A — ecrit, ne supprime pas
-- ===========================================================================
select testkit.as_user(user_id, 'plate-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

-- Ancre : Bob voit son foyer, donc les refus qui suivent sont significatifs.
select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_a'))), 1::bigint,
  'Bob est bien membre lisant du foyer A au moment de ces verifications');

-- --- Voyages : insert/update autorises, delete admin-only --------------------
select testkit.eq(testkit.affected(format(
  'insert into public.trips (id, household_id, name, destination, start_date, end_date)'
  ' values (%L, %L, %L, %L, current_date, current_date + 3)',
  'trip_bob', (select household_id from testkit.fx where key = 'bob'), 'Week-end', 'Lyon')), 1::bigint,
  'un membre cree un voyage dans son foyer');
select testkit.eq(testkit.affected(format(
  'update public.trips set name = %L where id = %L', 'Bretagne bis', (select row_id from testkit.fx where key = 'trip_a'))), 1::bigint,
  'un membre modifie un voyage de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.trips where id = ''trip_bob'''), 0::bigint,
  'la suppression d''un voyage est reservee aux administrateurs');

-- --- Animaux : meme motif -----------------------------------------------------
select testkit.eq(testkit.affected(format(
  'insert into public.pets (id, household_id, name, species) values (%L, %L, %L, %L)',
  'pet_bob', (select household_id from testkit.fx where key = 'bob'), 'Pioupiou', 'oiseau')), 1::bigint,
  'un membre declare un animal dans son foyer');
select testkit.eq(testkit.affected(format(
  'update public.pets set name = %L where id = %L', 'Medor bis', (select row_id from testkit.fx where key = 'pet_a'))), 1::bigint,
  'un membre modifie un animal de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.pets where id = ''pet_bob'''), 0::bigint,
  'la suppression d''un animal est reservee aux administrateurs');

-- --- Suivis : insert/update autorises, delete admin-only ----------------------
select testkit.eq(testkit.affected(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'rec_bob', (select row_id from testkit.fx where key = 'pet_a'),
  (select household_id from testkit.fx where key = 'bob'), 'traitement', 'Antipuce')), 1::bigint,
  'un membre ajoute un suivi a un animal de son foyer');
select testkit.eq(testkit.affected(format(
  'update public.pet_records set notes = %L where id = %L', 'Note de Bob', (select row_id from testkit.fx where key = 'rec_a1'))), 1::bigint,
  'un membre annote un suivi de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.pet_records where id = ''rec_bob'''), 0::bigint,
  'la suppression d''un suivi est reservee aux administrateurs');

-- --- Recettes : meme motif ------------------------------------------------------
select testkit.eq(testkit.affected(format(
  'insert into public.recipes (id, household_id, title) values (%L, %L, %L)',
  'recipe_bob', (select household_id from testkit.fx where key = 'bob'), 'Cake')), 1::bigint,
  'un membre cree une recette dans son foyer');
select testkit.eq(testkit.affected(format(
  'update public.recipes set title = %L where id = %L', 'Soupe bis', (select row_id from testkit.fx where key = 'recipe_a'))), 1::bigint,
  'un membre modifie une recette de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.recipes where id = ''recipe_bob'''), 0::bigint,
  'la suppression d''une recette est reservee aux administrateurs');

reset role;

-- ===========================================================================
-- Noe, role `enfant` — lecture seule
-- ===========================================================================
select testkit.as_user(user_id, 'plate-enfant@example.fr') from testkit.fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_a'))), 1::bigint,
  'un enfant lit les voyages de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_a'))), 0::bigint,
  'un enfant ne lit plus les animaux de son foyer (0113, phase 14)');
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_a1'))), 0::bigint,
  'un enfant ne lit plus les suivis de son foyer (0113, phase 14)');
select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where id = %L', (select row_id from testkit.fx where key = 'recipe_a'))), 1::bigint,
  'un enfant lit les recettes de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_b'))), 0::bigint,
  'un enfant ne voit pas le voyage du foyer B');

select testkit.expect_denied(format(
  'insert into public.trips (id, household_id, name, destination, start_date, end_date)'
  ' values (%L, %L, %L, %L, current_date, current_date + 1)',
  'trip_kid', (select household_id from testkit.fx where key = 'enfant'), 'Sortie', 'Parc'),
  'un enfant ne cree pas de voyage');
select testkit.expect_denied(format(
  'insert into public.pets (id, household_id, name, species) values (%L, %L, %L, %L)',
  'pet_kid', (select household_id from testkit.fx where key = 'enfant'), 'Toutou', 'chien'),
  'un enfant ne declare pas d''animal');
select testkit.expect_denied(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'rec_kid', (select row_id from testkit.fx where key = 'pet_a'),
  (select household_id from testkit.fx where key = 'enfant'), 'info', 'Note'),
  'un enfant n''ajoute pas de suivi');
select testkit.expect_denied(format(
  'insert into public.recipes (id, household_id, title) values (%L, %L, %L)',
  'recipe_kid', (select household_id from testkit.fx where key = 'enfant'), 'Gateau'),
  'un enfant ne cree pas de recette');
select testkit.eq(testkit.affected(format(
  'update public.trips set name = %L where id = %L', 'Pirate', (select row_id from testkit.fx where key = 'trip_a'))), 0::bigint,
  'un enfant ne modifie pas les voyages du foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_a'))), 0::bigint,
  'un enfant ne supprime pas les voyages du foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_a'))), 0::bigint,
  'un enfant ne supprime pas les animaux du foyer');

reset role;

-- ===========================================================================
-- Carol, administratrice du foyer B — la fuite ne joue pas dans l'autre sens
-- ===========================================================================
select testkit.as_user(user_id, 'plate-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_b'))), 1::bigint,
  'Carol lit le voyage de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L', (select row_id from testkit.fx where key = 'trip_a'))), 0::bigint,
  'Carol ne voit pas le voyage du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_a'))), 0::bigint,
  'Carol ne voit pas l''animal du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_a1'))), 0::bigint,
  'Carol ne voit pas le suivi du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.recipes where id = %L', (select row_id from testkit.fx where key = 'recipe_a'))), 0::bigint,
  'Carol ne voit pas la recette du foyer A');

select testkit.expect_denied(format(
  'insert into public.trips (id, household_id, name, destination, start_date, end_date)'
  ' values (%L, %L, %L, %L, current_date, current_date + 1)',
  'trip_carol', (select household_id from testkit.fx where key = 'alice'), 'Intrus', 'Ailleurs'),
  'Carol ne cree pas un voyage dans le foyer A');
select testkit.eq(testkit.affected(format(
  'update public.trips set name = %L where id = %L', 'Detourne', (select row_id from testkit.fx where key = 'trip_a'))), 0::bigint,
  'Carol ne modifie pas le voyage du foyer A');
select testkit.eq(testkit.affected(format(
  'delete from public.pets where id = %L', (select row_id from testkit.fx where key = 'pet_a'))), 0::bigint,
  'Carol ne supprime pas l''animal du foyer A');
select testkit.eq(testkit.affected(format(
  'delete from public.pet_records where id = %L', (select row_id from testkit.fx where key = 'rec_a1'))), 0::bigint,
  'Carol ne supprime pas le suivi du foyer A');

-- Reference etrangere : un suivi greffe sur l'animal d'un autre foyer, meme
-- en declarant le foyer B, est refuse (le trigger impose le foyer du parent,
-- la RLS refuse l'ecriture dans le foyer A).
select testkit.expect_denied(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'rec_carol', (select row_id from testkit.fx where key = 'pet_a'),
  (select household_id from testkit.fx where key = 'carol'), 'info', 'Greffe'),
  'on ne greffe pas un suivi sur l''animal d''un autre foyer');

reset role;

-- ===========================================================================
-- Escalade — Bob ne s'eleve pas et ne deplace rien hors de son foyer
-- ===========================================================================
select testkit.as_user(user_id, 'plate-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from testkit.fx where key = 'bob'))), 0::bigint,
  'un membre ne peut pas s''attribuer le role admin');
select testkit.expect_denied(format(
  'insert into public.trips (id, household_id, name, destination, start_date, end_date)'
  ' values (%L, %L, %L, %L, current_date, current_date + 1)',
  'trip_escal', (select household_id from testkit.fx where key = 'carol'), 'Transfert', 'Ailleurs'),
  'un membre ne cree pas un voyage dans un autre foyer');
select testkit.expect_denied(format(
  'update public.trips set household_id = %L where id = %L',
  (select household_id from testkit.fx where key = 'carol'), (select row_id from testkit.fx where key = 'trip_a')),
  'un membre ne deplace pas un voyage vers un autre foyer');
select testkit.expect_denied(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'rec_escal', (select row_id from testkit.fx where key = 'pet_b'),
  (select household_id from testkit.fx where key = 'bob'), 'info', 'Greffe'),
  'un membre ne greffe pas un suivi sur l''animal d''un autre foyer');

reset role;

rollback;
