-- supabase/tests/0036_contact_mirror_privacy.sql
-- Phase 07 Contacts privés (plan 07-01, D-01/D-02/D-03) : le miroir
-- contacts→birthdays ne sert que les listes « Famille »
-- (`owner_member_id IS NULL`), et les membres sont aveugles aux contacts
-- personnels de bout en bout — y compris via Anniversaires.
--
-- Constat UAT 2026-10-08 : un contact personnel daté créait un miroir
-- `birthdays`, lisible par tout le foyer (SELECT = simple appartenance,
-- motif 0007) — nom + date + photo fuyaient vers les autres membres.
--
-- Exécution rouge→vert : avant la migration 0097, les assertions « aucun
-- miroir personnel » échouent (le miroir existe et B le lit : fuite
-- prouvée) ; après 0097, toute la suite est verte.
--
-- Scénario : foyer A (Alice admin + propriétaire d'une liste personnelle,
-- Bob membre non-admin non-propriétaire), foyer B (Dave membre, isolation
-- inter-foyer). Le seed 0077 crée Famille + persos via le trigger
-- ensure_default_contact_list : les fixtures ne créent aucune liste.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer (ou à la
-- liste) via testkit.fx — jamais de total nu sur une table entière.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(dave, 'Dave Foyer');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  dave_m text := testkit.member(home_b, dave, 'Dave Durand', 'membre', 'ink');
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('dave', dave, home_b, dave_m);

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
-- Fixtures miroir (postgres) : un daté en personnel, un daté en Famille, un
-- daté personnel réservé aux négatives de déplacement.
-- ===========================================================================
-- Noms et dates uniques dans le foyer : la garde anti-doublon D-10 ne peut
-- absorber aucun de ces miroirs — un miroir absent est donc un refus du
-- trigger, jamais un homonyme.
do $$
declare
  home_a text := (select household_id from testkit.fx where key = 'alice');
  famille_a text := (select row_id from testkit.fx where key = 'famille_a');
  alice_perso text := (select row_id from testkit.fx where key = 'alice_perso');
begin
  insert into public.contacts (id, list_id, household_id, name, birth_date, photo_url)
  values ('contact_perso_date', alice_perso, home_a, 'Temoin Perso Date', date '1990-04-04', 'https://exemple.fr/perso.jpg');
  insert into public.contacts (id, list_id, household_id, name, birth_date, photo_url)
  values ('contact_famille_date', famille_a, home_a, 'Temoin Famille Date', date '1985-07-07', 'https://exemple.fr/famille.jpg');
  insert into public.contacts (id, list_id, household_id, name, birth_date)
  values ('contact_perso_garde', alice_perso, home_a, 'Temoin Garde Privee', date '1992-02-02');
end;
$$;

-- ===========================================================================
-- D-01/D-03 : un contact daté d'une liste personnelle ne crée aucun miroir
-- (ROUGE avant 0097 : le miroir existe — c'est la fuite).
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_perso_date'''), 0::bigint,
  'aucun miroir pour un contact date d''une liste personnelle (D-01/D-02)');

reset role;

-- ===========================================================================
-- D-03 : Bob (membre, ni admin ni propriétaire) est aveugle au personnel de
-- bout en bout — ni via birthdays, ni via contacts directs.
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.birthdays where household_id = %L and contact_id = %L',
  (select household_id from testkit.fx where key = 'bob'), 'contact_perso_date')), 0::bigint,
  'Bob ne voit aucun miroir du contact personnel date, meme via Anniversaires (D-03)');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L and list_id = %L',
  (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'Bob ne lit aucune fiche de la liste personnelle d''Alice (OQ-2 intact)');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L',
  (select household_id from testkit.fx where key = 'bob'))), 2::bigint,
  'Bob voit Famille + sa perso, pas celle d''Alice');

reset role;

-- ===========================================================================
-- Miroir Famille intact : création fidèle, visible par tout le foyer.
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.birthdays where contact_id = %L and household_id = %L and name = %L and birth_date = %L and photo_url = %L',
  'contact_famille_date', (select household_id from testkit.fx where key = 'alice'),
  'Temoin Famille Date', '1985-07-07', 'https://exemple.fr/famille.jpg')), 1::bigint,
  'le miroir Famille reprend foyer, nom, date et photo du contact');

reset role;

select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_famille_date'''), 1::bigint,
  'Bob lit le miroir d''un contact Famille (partage legitime)');

reset role;

-- ===========================================================================
-- Déplacement personnel→Famille (D-04) : l'écriture client directe passe la
-- RLS pour la propriétaire, et le miroir naît du trigger.
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.contacts set list_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'famille_a'), 'contact_perso_date')), 1::bigint,
  'Alice deplace son contact personnel vers Famille (ecriture requise sur les deux listes)');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_perso_date'''), 1::bigint,
  'le deplacement personnel→Famille fait naitre le miroir via le trigger');

reset role;

select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_perso_date'''), 1::bigint,
  'apres deplacement vers Famille, Bob lit legitiment le miroir');

reset role;

-- ===========================================================================
-- Négatives : Bob ne déplace pas le personnel d'Alice (ni vers Famille, ni
-- depuis Famille vers une perso), et l'autre foyer ne voit rien.
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.contacts set list_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'famille_a'), 'contact_perso_garde')), 0::bigint,
  'Bob ne deplace pas le contact personnel d''Alice (USING refuse sur l''ancienne liste)');
-- WITH CHECK violé = refus dur (erreur), pas 0 ligne : la RLS interdit à Bob
-- d'écrire dans la liste personnelle d'Alice (D-05 : aucun Famille→perso).
select testkit.expect_denied(format(
  'update public.contacts set list_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'alice_perso'), 'contact_famille_date'),
  'Bob ne bascule pas un contact Famille vers une liste personnelle (WITH CHECK refuse)');

reset role;

select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where id = %L and list_id = %L',
  'contact_perso_garde', (select row_id from testkit.fx where key = 'alice_perso'))), 1::bigint,
  'le contact convoite est toujours dans la liste personnelle d''Alice');

reset role;

select testkit.as_user(user_id, 'dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L',
  (select household_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Dave (autre foyer) ne lit aucun contact du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.birthdays where household_id = %L',
  (select household_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Dave (autre foyer) ne lit aucun anniversaire du foyer A, miroirs inclus');

reset role;

-- ===========================================================================
-- D-14 intact : supprimer le contact Famille supprime son miroir en cascade.
-- (En fin de fichier : détruit la fixture Famille.)
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.contacts where id = ''contact_famille_date'''), 1::bigint,
  'Alice supprime le contact Famille date');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_famille_date'''), 0::bigint,
  'le miroir est supprime en cascade avec son contact (D-14)');

reset role;

rollback;
