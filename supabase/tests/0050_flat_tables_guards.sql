-- supabase/tests/0050_flat_tables_guards.sql
-- Phase 13 hygiene donnees (D-01/D-02, plan 13-01) : preuves d'isolation des
-- quatre tables plates prestataires/fidelite/adresses — provider_types,
-- providers, loyalty_cards, places — plus la garde foyer du type (D-02).
--
-- Forme 0048 : acteurs par role (Alice admin A, Bob membre A, Noe enfant A,
-- Carol admin B), assertions bornees par objet via testkit.fx (jamais de
-- total nu), `affected = 0` pour les UPDATE/DELETE filtres par la RLS,
-- `expect_denied` pour les INSERT dont le WITH CHECK echoue, rollback final.
--
-- Rappel du motif prouve (0007) : SELECT membre du foyer, INSERT/UPDATE si
-- `can_write_household` (admin/membre — enfant exclu), DELETE admin-only.
-- `loyalty_cards.member_id` porte en plus la liaison auteur (nulle ou soi).
--
-- Rouge→vert : avant 0112, « Bob rattache son prestataire au type du foyer
-- B » inserait 1 ligne (D-02 ouvert) — reproduit par la sonde initiale,
-- refuse apres la migration (23514, meme forme que validate_member_refs).
-- Apres 0112, toute la suite est verte : matrice inter-foyer close, enfant
-- en lecture seule, suppression reservee aux admins (y compris son propre
-- contenu), escalade refusee, garde de type prouvee avec chemins heureux
-- (type du foyer, NULL) intacts.
--
-- Orphelins : aucune reparation de donnees dans 0112 ; la base dev controlee
-- le 2026-10-12 ne contenait aucune reference inter-foyer (0 ligne).

begin;

do $$
declare
  alice uuid := testkit.auth_user('plate13-alice@example.fr', 'Alice Plateau');
  bob uuid := testkit.auth_user('plate13-bob@example.fr', 'Bob Plateau');
  kid uuid := testkit.auth_user('plate13-kid@example.fr', 'Noe Plateau');
  carol uuid := testkit.auth_user('plate13-carol@example.fr', 'Carol Voisine');

  home_a text := testkit.household(alice, 'Foyer Plateau Treize A');
  home_b text := testkit.household(carol, 'Foyer Plateau Treize B');

  alice_m text := testkit.member(home_a, alice, 'Alice Plateau', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Plateau', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Plateau', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');

  type_a text := private.new_id('provider-type');
  type_del text := private.new_id('provider-type');
  type_b text := private.new_id('provider-type');
  prov_a text := private.new_id('provider');
  prov_del text := private.new_id('provider');
  prov_b text := private.new_id('provider');
  card_a text := private.new_id('loyalty');
  card_del text := private.new_id('loyalty');
  card_b text := private.new_id('loyalty');
  place_a text := private.new_id('place');
  place_del text := private.new_id('place');
  place_b text := private.new_id('place');
begin
  insert into public.provider_types (id, household_id, name)
  values (type_a, home_a, 'Plombier'),
         (type_del, home_a, 'A supprimer'),
         (type_b, home_b, 'Electricien');

  insert into public.providers (id, household_id, provider_type_id, name)
  values (prov_a, home_a, type_a, 'Dupont'),
         (prov_del, home_a, type_a, 'A supprimer'),
         (prov_b, home_b, type_b, 'Martin');

  insert into public.loyalty_cards (id, household_id, member_id, name, code_type, code_value)
  values (card_a, home_a, bob_m, 'Carrefour', 'barcode', '123'),
         (card_del, home_a, null, 'A supprimer', 'qr', '456'),
         (card_b, home_b, carol_m, 'Leclerc', 'barcode', '789');

  insert into public.places (id, household_id, type, name)
  values (place_a, home_a, 'restaurant', 'Bistrot'),
         (place_del, home_a, 'cafe', 'A supprimer'),
         (place_b, home_b, 'parc', 'Square');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('type_a', null, home_a, type_a),
    ('type_del', null, home_a, type_del),
    ('type_b', null, home_b, type_b),
    ('prov_a', null, home_a, prov_a),
    ('prov_del', null, home_a, prov_del),
    ('prov_b', null, home_b, prov_b),
    ('card_a', null, home_a, card_a),
    ('card_del', null, home_a, card_del),
    ('card_b', null, home_b, card_b),
    ('place_a', null, home_a, place_a),
    ('place_del', null, home_a, place_del),
    ('place_b', null, home_b, place_b);
end;
$$;

-- ===========================================================================
-- Alice, administratrice du foyer A
-- ===========================================================================
select testkit.as_user(user_id, 'plate13-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- --- Lecture : son foyer oui, l'autre non (bornes par objet) ----------------
select testkit.eq(testkit.count(format(
  'select 1 from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_a'))), 1::bigint,
  'Alice lit le type de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_b'))), 0::bigint,
  'Alice ne voit pas le type du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_a'))), 1::bigint,
  'Alice lit le prestataire de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_b'))), 0::bigint,
  'Alice ne voit pas le prestataire du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_a'))), 1::bigint,
  'Alice lit la carte de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_b'))), 0::bigint,
  'Alice ne voit pas la carte du foyer B');
select testkit.eq(testkit.count(format(
  'select 1 from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 1::bigint,
  'Alice lit le lieu de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.places where id = %L', (select row_id from testkit.fx where key = 'place_b'))), 0::bigint,
  'Alice ne voit pas le lieu du foyer B');

-- --- Ecriture inter-foyer : refusee -----------------------------------------
select testkit.expect_denied(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'type_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus'),
  'Alice ne cree pas un type dans le foyer B');
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, name) values (%L, %L, %L)',
  'prov_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus'),
  'Alice ne cree pas un prestataire dans le foyer B');
select testkit.expect_denied(format(
  'insert into public.loyalty_cards (id, household_id, name, code_type, code_value) values (%L, %L, %L, %L, %L)',
  'card_x', (select household_id from testkit.fx where key = 'carol'), 'Intrus', 'barcode', '000'),
  'Alice ne cree pas une carte dans le foyer B');
select testkit.expect_denied(format(
  'insert into public.places (id, household_id, type, name) values (%L, %L, %L, %L)',
  'place_x', (select household_id from testkit.fx where key = 'carol'), 'cafe', 'Intrus'),
  'Alice ne cree pas un lieu dans le foyer B');
select testkit.eq(testkit.affected(format(
  'update public.providers set name = %L where id = %L', 'Detourne', (select row_id from testkit.fx where key = 'prov_b'))), 0::bigint,
  'Alice ne modifie pas le prestataire du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_b'))), 0::bigint,
  'Alice ne supprime pas le type du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_b'))), 0::bigint,
  'Alice ne supprime pas la carte du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.places where id = %L', (select row_id from testkit.fx where key = 'place_b'))), 0::bigint,
  'Alice ne supprime pas le lieu du foyer B');

-- --- Suppression admin : chemin heureux --------------------------------------
select testkit.eq(testkit.affected(format(
  'delete from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_del'))), 1::bigint,
  'une administratrice supprime un prestataire de son foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_del'))), 1::bigint,
  'une administratrice supprime un type de son foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_del'))), 1::bigint,
  'une administratrice supprime une carte de son foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.places where id = %L', (select row_id from testkit.fx where key = 'place_del'))), 1::bigint,
  'une administratrice supprime un lieu de son foyer');

reset role;

-- ===========================================================================
-- Bob, membre ordinaire du foyer A — ecrit, ne supprime pas
-- ===========================================================================
select testkit.as_user(user_id, 'plate13-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

-- Ancre : Bob voit son foyer, donc les refus qui suivent sont significatifs.
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_a'))), 1::bigint,
  'Bob est bien membre lisant du foyer A au moment de ces verifications');

-- --- Types : insert/update autorises, delete admin-only ----------------------
select testkit.eq(testkit.affected(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'type_bob', (select household_id from testkit.fx where key = 'bob'), 'Serrurier')), 1::bigint,
  'un membre cree un type dans son foyer');
select testkit.eq(testkit.affected(format(
  'update public.provider_types set name = %L where id = %L', 'Plombier bis', (select row_id from testkit.fx where key = 'type_a'))), 1::bigint,
  'un membre modifie un type de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.provider_types where id = ''type_bob'''), 0::bigint,
  'la suppression d''un type est reservee aux administrateurs');

-- --- Prestataires : meme motif, plus la garde de type (D-02) -----------------
select testkit.eq(testkit.affected(format(
  'insert into public.providers (id, household_id, provider_type_id, name) values (%L, %L, %L, %L)',
  'prov_bob', (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'type_a'), 'Garagiste')), 1::bigint,
  'un membre rattache son prestataire a un type de son foyer');
select testkit.eq(testkit.affected(format(
  'insert into public.providers (id, household_id, provider_type_id, name) values (%L, %L, null, %L)',
  'prov_bob_sans_type', (select household_id from testkit.fx where key = 'bob'), 'Independant')), 1::bigint,
  'un membre cree un prestataire sans type');
select testkit.eq(testkit.affected(format(
  'update public.providers set name = %L where id = %L', 'Dupont bis', (select row_id from testkit.fx where key = 'prov_a'))), 1::bigint,
  'un membre modifie un prestataire de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.providers where id = ''prov_bob'''), 0::bigint,
  'la suppression d''un prestataire est reservee aux administrateurs, meme le sien');
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, provider_type_id, name) values (%L, %L, %L, %L)',
  'prov_greffe', (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'type_b'), 'Fantome'),
  'on ne rattache pas un prestataire au type d''un autre foyer (0112)');
select testkit.expect_denied(format(
  'update public.providers set provider_type_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'type_b'), (select row_id from testkit.fx where key = 'prov_a')),
  'on ne bascule pas un prestataire vers le type d''un autre foyer (0112)');
select testkit.expect_denied(
  'insert into public.providers (id, household_id, provider_type_id, name)'
  ' values (''prov_inconnu'', (select household_id from testkit.fx where key = ''bob''), ''type-inexistant'', ''Fantome'')',
  'on ne rattache pas un prestataire a un type inexistant');

-- --- Cartes : meme motif, liaison auteur nulle ou soi -------------------------
select testkit.eq(testkit.affected(format(
  'insert into public.loyalty_cards (id, household_id, member_id, name, code_type, code_value) values (%L, %L, %L, %L, %L, %L)',
  'card_bob', (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'bob'), 'Boulangerie', 'qr', '111')), 1::bigint,
  'un membre cree une carte a son nom dans son foyer');
select testkit.eq(testkit.affected(format(
  'insert into public.loyalty_cards (id, household_id, name, code_type, code_value) values (%L, %L, %L, %L, %L)',
  'card_bob_foyer', (select household_id from testkit.fx where key = 'bob'), 'Pharmacie', 'barcode', '222')), 1::bigint,
  'un membre cree une carte de foyer sans rattachement');
select testkit.eq(testkit.affected(format(
  'update public.loyalty_cards set name = %L where id = %L', 'Carrefour bis', (select row_id from testkit.fx where key = 'card_a'))), 1::bigint,
  'un membre modifie une carte de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.loyalty_cards where id = ''card_bob'''), 0::bigint,
  'la suppression d''une carte est reservee aux administrateurs, meme la sienne');
select testkit.expect_denied(format(
  'insert into public.loyalty_cards (id, household_id, member_id, name, code_type, code_value) values (%L, %L, %L, %L, %L, %L)',
  'card_usurpe', (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'alice'), 'Usurpee', 'qr', '333'),
  'un membre ne cree pas une carte au nom d''un autre membre');

-- --- Lieux : meme motif --------------------------------------------------------
select testkit.eq(testkit.affected(format(
  'insert into public.places (id, household_id, type, name) values (%L, %L, %L, %L)',
  'place_bob', (select household_id from testkit.fx where key = 'bob'), 'musee', 'Expo')), 1::bigint,
  'un membre cree un lieu dans son foyer');
select testkit.eq(testkit.affected(format(
  'update public.places set name = %L where id = %L', 'Bistrot bis', (select row_id from testkit.fx where key = 'place_a'))), 1::bigint,
  'un membre modifie un lieu de son foyer');
select testkit.eq(testkit.affected(
  'delete from public.places where id = ''place_bob'''), 0::bigint,
  'la suppression d''un lieu est reservee aux administrateurs, meme le sien');
select testkit.eq(testkit.count(format(
  'select 1 from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 1::bigint,
  'un membre lit les lieux de son foyer');

reset role;

-- ===========================================================================
-- Noe, role `enfant` — depuis 0145 l'enfant gere n'a pas de compte ni de
-- session : son uid ne resout aucun membre du foyer, donc il ne lit plus rien
-- (les anciennes lectures positives sont devenues adultes) et n'ecrit rien.
-- ===========================================================================
select testkit.as_user(user_id, 'plate13-enfant@example.fr') from testkit.fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_a'))), 0::bigint,
  'un enfant ne lit plus les types de son foyer (0113, phase 14)');
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_a'))), 0::bigint,
  'un enfant ne lit plus les prestataires de son foyer (0113, phase 14)');
select testkit.eq(testkit.count(format(
  'select 1 from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_a'))), 0::bigint,
  'un enfant ne lit plus les cartes de son foyer (0113, phase 14)');
select testkit.eq(testkit.count(format(
  'select 1 from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus les lieux');
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_b'))), 0::bigint,
  'un enfant ne voit pas le prestataire du foyer B');

select testkit.expect_denied(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'type_kid', (select household_id from testkit.fx where key = 'enfant'), 'Brico'),
  'un enfant ne cree pas de type');
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, name) values (%L, %L, %L)',
  'prov_kid', (select household_id from testkit.fx where key = 'enfant'), 'Jardinier'),
  'un enfant ne cree pas de prestataire');
select testkit.expect_denied(format(
  'insert into public.loyalty_cards (id, household_id, name, code_type, code_value) values (%L, %L, %L, %L, %L)',
  'card_kid', (select household_id from testkit.fx where key = 'enfant'), 'Jouets', 'qr', '444'),
  'un enfant ne cree pas de carte');
select testkit.expect_denied(format(
  'insert into public.places (id, household_id, type, name) values (%L, %L, %L, %L)',
  'place_kid', (select household_id from testkit.fx where key = 'enfant'), 'parc', 'Bac a sable'),
  'un enfant ne cree pas de lieu');
select testkit.eq(testkit.affected(format(
  'update public.providers set name = %L where id = %L', 'Pirate', (select row_id from testkit.fx where key = 'prov_a'))), 0::bigint,
  'un enfant ne modifie pas les prestataires du foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_a'))), 0::bigint,
  'un enfant ne supprime pas les prestataires du foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 0::bigint,
  'un enfant ne supprime pas les lieux du foyer');

reset role;

-- ===========================================================================
-- Carol, administratrice du foyer B — la fuite ne joue pas dans l'autre sens
-- ===========================================================================
select testkit.as_user(user_id, 'plate13-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.provider_types where id = %L', (select row_id from testkit.fx where key = 'type_b'))), 1::bigint,
  'Carol lit le type de son foyer');
select testkit.eq(testkit.count(format(
  'select 1 from public.providers where id = %L', (select row_id from testkit.fx where key = 'prov_a'))), 0::bigint,
  'Carol ne voit pas le prestataire du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.loyalty_cards where id = %L', (select row_id from testkit.fx where key = 'card_a'))), 0::bigint,
  'Carol ne voit pas la carte du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 0::bigint,
  'Carol ne voit pas le lieu du foyer A');

select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, name) values (%L, %L, %L)',
  'prov_carol', (select household_id from testkit.fx where key = 'alice'), 'Intrus'),
  'Carol ne cree pas un prestataire dans le foyer A');
select testkit.eq(testkit.affected(format(
  'update public.providers set name = %L where id = %L', 'Detourne', (select row_id from testkit.fx where key = 'prov_a'))), 0::bigint,
  'Carol ne modifie pas le prestataire du foyer A');
select testkit.eq(testkit.affected(format(
  'delete from public.places where id = %L', (select row_id from testkit.fx where key = 'place_a'))), 0::bigint,
  'Carol ne supprime pas le lieu du foyer A');

-- Greffe inverse : un prestataire du foyer B sur un type du foyer A, meme en
-- declarant le foyer B, est refuse par la garde 0112.
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, provider_type_id, name) values (%L, %L, %L, %L)',
  'prov_carol_greffe', (select household_id from testkit.fx where key = 'carol'),
  (select row_id from testkit.fx where key = 'type_a'), 'Greffe'),
  'on ne greffe pas un prestataire sur le type d''un autre foyer');
select testkit.expect_denied(format(
  'update public.providers set provider_type_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'type_a'), (select row_id from testkit.fx where key = 'prov_b')),
  'on ne bascule pas un prestataire du foyer B vers un type du foyer A');

reset role;

-- ===========================================================================
-- Escalade — Bob ne s'eleve pas et ne deplace rien hors de son foyer
-- ===========================================================================
select testkit.as_user(user_id, 'plate13-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from testkit.fx where key = 'bob'))), 0::bigint,
  'un membre ne peut pas s''attribuer le role admin');
select testkit.expect_denied(format(
  'insert into public.provider_types (id, household_id, name) values (%L, %L, %L)',
  'type_escal', (select household_id from testkit.fx where key = 'carol'), 'Transfert'),
  'un membre ne cree pas un type dans un autre foyer');
select testkit.expect_denied(format(
  'update public.providers set household_id = %L where id = %L',
  (select household_id from testkit.fx where key = 'carol'), (select row_id from testkit.fx where key = 'prov_a')),
  'un membre ne deplace pas un prestataire vers un autre foyer');

reset role;

rollback;
