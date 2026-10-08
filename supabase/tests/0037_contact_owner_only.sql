-- supabase/tests/0037_contact_owner_only.sql
-- Phase 07 Contacts privés (plan 07-02, amendement OQ-2 UAT 2026-10-08) : les
-- listes personnelles sont strictement propriétaire-only en lecture ET en
-- écriture — les admins du foyer perdent l'accès, seule l'hygiène aveugle
-- (suppression de liste et de contacts, admin-only) est conservée.
--
-- Exécution rouge→vert : avant la migration 0098, les assertions « admin
-- refusé » échouent (l'admin lit et écrit le personnel d'autrui : accès
-- prouvé) ; après 0098, toute la suite est verte.
--
-- Scénario : foyer A (Alice propriétaire non-admin d'une liste personnelle,
-- Carol admin non-propriétaire, Bob membre simple), foyer B (Dave membre,
-- isolation inter-foyer). Le seed 0077 crée Famille + persos via le trigger
-- ensure_default_contact_list : les fixtures ne créent aucune liste.
-- Alice est volontairement NON-admin : son accès prouve le propriétaire seul,
-- pas un résidu de branche admin.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer (ou à la
-- liste) via testkit.fx — jamais de total nu sur une table entière.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Petit');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(dave, 'Dave Foyer');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'membre', 'accent');
  carol_m text := testkit.member(home_a, carol, 'Carol Petit', 'admin', 'violet');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  dave_m text := testkit.member(home_b, dave, 'Dave Durand', 'membre', 'amber');
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('carol', carol, home_a, carol_m),
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
-- Fixtures (postgres) : deux fiches personnelles d'Alice (une datée, une
-- datée réservée au déplacement), une fiche Famille témoin.
-- ===========================================================================
-- Noms et dates uniques dans le foyer : la garde anti-doublon D-10 ne peut
-- absorber aucun miroir — un miroir absent est donc un refus du trigger,
-- jamais un homonyme.
do $$
declare
  home_a text := (select household_id from testkit.fx where key = 'alice');
  famille_a text := (select row_id from testkit.fx where key = 'famille_a');
  alice_perso text := (select row_id from testkit.fx where key = 'alice_perso');
begin
  insert into public.contacts (id, list_id, household_id, name, birth_date, photo_url)
  values ('contact_own_alice', alice_perso, home_a, 'Temoin Privee Alice', date '1993-03-03', 'https://exemple.fr/privee.jpg');
  insert into public.contacts (id, list_id, household_id, name, birth_date)
  values ('contact_own_move', alice_perso, home_a, 'Temoin Deplacement', date '1994-04-04');
  insert into public.contacts (id, list_id, household_id, name, birth_date)
  values ('contact_famille_tem', famille_a, home_a, 'Temoin Famille Partagee', date '1995-05-05');
end;
$$;

-- ===========================================================================
-- OQ-2 amendée : Carol (admin, non-propriétaire) ne lit RIEN du personnel
-- d'Alice — ni la liste, ni ses fiches.
-- (ROUGE avant 0098 : les deux comptages valent 1 — l'accès admin est prouvé.)
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'carol'),
  (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'l''admin ne voit pas la liste personnelle d''un autre membre (OQ-2 amendee)');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L and list_id = %L',
  (select household_id from testkit.fx where key = 'carol'),
  (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'l''admin ne lit aucune fiche de la liste personnelle d''un autre membre');

reset role;

-- ===========================================================================
-- OQ-2 amendée : Carol ne peut ni créer, ni modifier dans le personnel
-- d'Alice — ni les fiches (portes), ni la liste elle-même (politiques
-- contact_lists_insert/update resserrées, branche admin personnelle retirée).
-- (ROUGE avant 0098 : insert passe, updates affectent 1 ligne.)
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

-- WITH CHECK violé = refus dur (erreur), pas 0 ligne : la RLS interdit à
-- l'admin d'écrire dans la liste personnelle d'autrui.
select testkit.expect_denied(format(
  'insert into public.contacts (id, list_id, household_id, name) values (%L, %L, %L, %L)',
  'contact_intrus', (select row_id from testkit.fx where key = 'alice_perso'),
  (select household_id from testkit.fx where key = 'carol'), 'Fiche Intruse'),
  'l''admin ne cree pas de fiche dans la liste personnelle d''un autre membre');
select testkit.eq(testkit.affected(
  'update public.contacts set name = ''Renommee Par Admin'' where id = ''contact_own_alice'''), 0::bigint,
  'l''admin ne modifie pas une fiche de la liste personnelle d''un autre membre (USING refuse)');
select testkit.eq(testkit.affected(format(
  'update public.contact_lists set name = %L where id = %L',
  'Liste Renommee', (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'l''admin ne renomme pas la liste personnelle d''un autre membre');
select testkit.expect_denied(format(
  'insert into public.contact_lists (id, household_id, name, owner_member_id, is_default) values (%L, %L, %L, %L, false)',
  'contact-list-intruse', (select household_id from testkit.fx where key = 'carol'),
  'Liste Intruse', (select row_id from testkit.fx where key = 'alice')),
  'l''admin ne cree pas de liste personnelle pour un autre membre');

reset role;

-- La fiche convoitée est intacte après les tentatives de l'admin.
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.contacts where id = ''contact_own_alice'' and name = ''Temoin Privee Alice'''), 1::bigint,
  'la fiche personnelle est intacte apres les tentatives de l''admin');

reset role;

-- ===========================================================================
-- Propriétaire non-admin : Alice lit et écrit son personnel sans aucun
-- privilège admin — l'accès prouvé ici ne doit rien à la branche admin.
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'alice'),
  (select row_id from testkit.fx where key = 'alice_perso'))), 1::bigint,
  'la proprietaire lit sa liste personnelle sans etre admin');
-- La liste personnelle contient la fiche pré-remplie du seed 0077 + les 2 fixtures.
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L and list_id = %L',
  (select household_id from testkit.fx where key = 'alice'),
  (select row_id from testkit.fx where key = 'alice_perso'))), 3::bigint,
  'la proprietaire lit ses fiches personnelles sans etre admin');
select testkit.eq(testkit.affected(format(
  'insert into public.contacts (id, list_id, household_id, name) values (%L, %L, %L, %L)',
  'contact_own_nouveau', (select row_id from testkit.fx where key = 'alice_perso'),
  (select household_id from testkit.fx where key = 'alice'), 'Fiche Nouvelle')), 1::bigint,
  'la proprietaire cree une fiche dans sa liste personnelle');
select testkit.eq(testkit.affected(
  'update public.contacts set name = ''Temoin Privee Alice'' where id = ''contact_own_alice'''), 1::bigint,
  'la proprietaire modifie une fiche de sa liste personnelle');
select testkit.eq(testkit.affected(format(
  'update public.contact_lists set name = %L where id = %L',
  'Alice Martin', (select row_id from testkit.fx where key = 'alice_perso'))), 1::bigint,
  'la proprietaire renomme sa liste personnelle');

reset role;

-- ===========================================================================
-- Famille intacte : lecture membre et admin, écriture admin — branche
-- `owner_member_id IS NULL` à l'octet près.
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L and list_id = %L',
  (select household_id from testkit.fx where key = 'bob'),
  (select row_id from testkit.fx where key = 'famille_a'))), 1::bigint,
  'Bob lit les fiches de la liste Famille (partage legitime)');

reset role;

select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'carol'),
  (select row_id from testkit.fx where key = 'famille_a'))), 1::bigint,
  'l''admin lit toujours la liste Famille');
select testkit.eq(testkit.affected(format(
  'insert into public.contacts (id, list_id, household_id, name) values (%L, %L, %L, %L)',
  'contact_famille_admin', (select row_id from testkit.fx where key = 'famille_a'),
  (select household_id from testkit.fx where key = 'carol'), 'Ajout Admin')), 1::bigint,
  'l''admin ecrit toujours dans la liste Famille');

reset role;

-- ===========================================================================
-- Déplacement personnel→Famille intact (07-01) : la propriétaire non-admin
-- déplace sa fiche, le miroir naît du trigger, Bob le lit légitimement.
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.contacts set list_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'famille_a'), 'contact_own_move')), 1::bigint,
  'Alice deplace sa fiche personnelle vers Famille (ecriture requise sur les deux listes)');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_own_move'''), 1::bigint,
  'le deplacement personnel→Famille fait naitre le miroir via le trigger');

reset role;

select testkit.as_user(user_id, 'bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_own_move'''), 1::bigint,
  'apres deplacement vers Famille, Bob lit legitiment le miroir');

reset role;

-- ===========================================================================
-- Isolation inter-foyer : Dave ne voit rien du foyer A.
-- ===========================================================================
select testkit.as_user(user_id, 'dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.contacts where household_id = %L',
  (select household_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Dave (autre foyer) ne lit aucun contact du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L',
  (select household_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Dave (autre foyer) ne lit aucune liste du foyer A');

reset role;

-- ===========================================================================
-- Hygiène : ce que l'amendement change vraiment, prouvé sans fard.
--
-- Constat mécanique (prouvé par EXPLAIN sur cette stack : le plan du DELETE
-- filtre `is_household_admin AND is_household_member AND
-- can_read_contact_list`) : PostgreSQL exige la visibilité SELECT pour
-- supprimer une ligne. Une fois la lecture propriétaire-only, l'admin ne peut
-- plus supprimer ce qu'il ne voit plus — QUELLE QUE SOIT la politique DELETE
-- (restée admin-only, inchangée, ce n'est pas un oubli). Les suppressions
-- aveugles retournent 0 ligne, sans erreur : ni silencieusement élargies, ni
-- bruyamment cassées.
--
-- Reste vrai : suppression admin sur les lignes lisibles (Famille), et
-- hygiène des départs par cascade structurelle (retirer un membre efface ses
-- listes personnelles — FK ON DELETE CASCADE de 0077, prouvée ci-dessous).
-- Perte réelle : modération par l'admin du personnel d'un membre ACTIF —
-- décision produit différée (purge serveur dédiée ou acceptation).
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.contacts where id = ''contact_famille_tem'''), 1::bigint,
  'l''admin supprime une fiche Famille lisible (hygiene partagee intacte)');
select testkit.eq(testkit.affected(
  'delete from public.contacts where id = ''contact_own_alice'''), 0::bigint,
  'l''admin ne supprime plus une fiche personnelle illisible (0 ligne, sans erreur)');
select testkit.eq(testkit.affected(format(
  'delete from public.contact_lists where id = %L',
  (select row_id from testkit.fx where key = 'alice_perso'))), 0::bigint,
  'l''admin ne supprime plus la liste personnelle illisible (0 ligne, sans erreur)');

reset role;

-- ===========================================================================
-- Hygiène des départs (rôle propriétaire, contourne la RLS comme tout seed)
-- : l'arrivée d'Eve crée sa liste personnelle + fiche, son retrait les
-- efface en cascade — sans RLS, sans admin, sans lecture préalable.
-- ===========================================================================
do $$
declare
  eve uuid := testkit.auth_user('eve@example.fr', 'Eve Moreau');
  home_a text := (select household_id from testkit.fx where key = 'alice');
  eve_m text := testkit.member(home_a, eve, 'Eve Moreau', 'membre', 'coral');
begin
  insert into testkit.fx (key, user_id, household_id, row_id)
  values ('eve', eve, home_a, eve_m);
end;
$$;

select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and owner_member_id = %L',
  (select household_id from testkit.fx where key = 'eve'),
  (select row_id from testkit.fx where key = 'eve'))), 1::bigint,
  'le seed dote Eve de sa liste personnelle a son arrivee');
select testkit.eq(testkit.affected(format(
  'delete from public.household_members where id = %L',
  (select row_id from testkit.fx where key = 'eve'))), 1::bigint,
  'le retrait d''Eve passe');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and owner_member_id = %L',
  (select household_id from testkit.fx where key = 'eve'),
  (select row_id from testkit.fx where key = 'eve'))), 0::bigint,
  'le retrait d''un membre efface ses listes personnelles en cascade');
select testkit.eq(testkit.count(format(
  'select 1 from public.contacts c join public.contact_lists l on l.id = c.list_id where c.household_id = %L and l.owner_member_id = %L',
  (select household_id from testkit.fx where key = 'eve'),
  (select row_id from testkit.fx where key = 'eve'))), 0::bigint,
  'le retrait d''un membre efface ses fiches personnelles en cascade');
select testkit.eq(testkit.count(format(
  'select 1 from public.contact_lists where household_id = %L and owner_member_id is null',
  (select household_id from testkit.fx where key = 'alice'))), 1::bigint,
  'la cascade des departs ne touche pas la liste Famille');

rollback;
