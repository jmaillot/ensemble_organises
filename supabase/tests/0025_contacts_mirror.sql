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
-- Miroir contacts→birthdays (plan 05-02) : fixtures comme postgres
-- ===========================================================================
-- Les insertions ci-dessous déclenchent `mirror_contact_birthday` (0078) :
-- un contact daté crée son miroir, sauf garde homonyme (D-10). Les
-- anniversaires manuels ne créent aucun contact (D-03).
do $$
declare
  home_a text := (select household_id from testkit.fx where key = 'alice');
  alice_m text := (select row_id from testkit.fx where key = 'alice');
  famille_a text := (select row_id from testkit.fx where key = 'famille_a');
  idee_miroir text := private.new_id('gift-idea');
  liste_miroir text := private.new_id('gift-list');
begin
  -- Tante Agathe : contact daté, sans homonyme → exactement 1 miroir.
  insert into public.contacts (id, list_id, household_id, name, birth_date, photo_url)
  values ('contact_agathe', famille_a, home_a, 'Tante Agathe', date '1960-05-06', 'https://exemple.fr/agathe.jpg');

  -- Flux D-10 (anniversaire d'abord) : l'anniversaire manuel existe avant le
  -- contact homonyme (casse volontairement différente : la garde normalise).
  insert into public.birthdays (id, household_id, name, birth_date)
  values ('birthday_manu', home_a, 'Oncle Gaston', date '1955-02-14');
  insert into public.contacts (id, list_id, household_id, name, birth_date)
  values ('contact_gaston', famille_a, home_a, 'oncle gaston', date '1955-02-14');

  -- D-03 : un anniversaire manuel isolé, sans aucun contact homonyme.
  insert into public.birthdays (id, household_id, name, birth_date)
  values ('birthday_zoe', home_a, 'Zoe Lointaine', date '2001-09-09');

  -- Contact daté modifiable (synchronisation) + contact non daté.
  insert into public.contacts (id, list_id, household_id, name, birth_date)
  values ('contact_sync', famille_a, home_a, 'Cousin Sync', date '1999-12-31');
  insert into public.contacts (id, list_id, household_id, name)
  values ('contact_sans_date', famille_a, home_a, 'Voisin Flou');

  -- Idée + articles (propagation « offert », D-06).
  insert into public.gift_ideas (id, household_id, name, status, created_by)
  values (idee_miroir, home_a, 'Montre pour Gaston', 'a_offrir', alice_m);
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values (liste_miroir, home_a, alice_m, 'Noel Miroir', 'privee');
  insert into public.gift_items (id, list_id, household_id, name, idea_id, purchased)
  values ('gitem_lie', liste_miroir, home_a, 'Montre', idee_miroir, false);
  insert into public.gift_items (id, list_id, household_id, name, purchased)
  values ('gitem_libre', liste_miroir, home_a, 'Chaussettes', false);

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('idee_miroir', null, home_a, idee_miroir);
end;
$$;

-- ===========================================================================
-- Alice : un contact daté vaut exactement un miroir fidèle
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_agathe'''), 1::bigint,
  'un contact date cree exactement 1 miroir');
select testkit.eq(testkit.count(format(
  'select 1 from public.birthdays where contact_id = %L and household_id = %L and name = %L and birth_date = %L and photo_url = %L',
  'contact_agathe', (select household_id from testkit.fx where key = 'alice'),
  'Tante Agathe', '1960-05-06', 'https://exemple.fr/agathe.jpg')), 1::bigint,
  'le miroir reprend foyer, nom, date et photo du contact');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_sans_date'''), 0::bigint,
  'un contact sans date n''a aucun miroir');

reset role;

-- ===========================================================================
-- D-10 : le flux anniversaire-d'abord ne crée aucun doublon
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_gaston'''), 0::bigint,
  'le contact homonyme d''un anniversaire existant ne cree pas de miroir');
select testkit.eq(testkit.count(format(
  'select 1 from public.birthdays where household_id = %L and birth_date = %L',
  (select household_id from testkit.fx where key = 'alice'), '1955-02-14')), 1::bigint,
  'une seule ligne subsiste pour la personne (pas de doublon D-10)');

reset role;

-- ===========================================================================
-- D-03 : les anniversaires existants n'ont généré aucun contact
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.contacts where name = ''Zoe Lointaine'''), 0::bigint,
  'un anniversaire manuel ne genere aucun contact (D-03)');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where id = ''birthday_zoe'' and contact_id is null'), 1::bigint,
  'l''anniversaire manuel reste orphelin de contact, contact_id NULL');

reset role;

-- ===========================================================================
-- Synchronisation : le miroir suit son contact, puis disparaît avec sa date
-- ===========================================================================
-- Écritures RLS en tant qu'Alice (admin : suppression autorisée sur contacts).
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'update public.contacts set birth_date = date ''2000-01-02'', name = ''Cousin Resync'' where id = ''contact_sync'''), 1::bigint,
  'Alice modifie le contact synchronise');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_sync'' and birth_date = date ''2000-01-02'' and name = ''Cousin Resync'''), 1::bigint,
  'le miroir suit la date et le nom du contact');
select testkit.eq(testkit.affected(
  'update public.contacts set birth_date = null where id = ''contact_sync'''), 1::bigint,
  'Alice retire la date du contact');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_sync'''), 0::bigint,
  'sans date, le miroir disparait');

reset role;

-- ===========================================================================
-- D-06 : marquer l'idée « offert » marque l'article lié acheté
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.gift_ideas set status = %L where id = %L', 'offert',
  (select row_id from testkit.fx where key = 'idee_miroir'))), 1::bigint,
  'Alice marque l''idee offerte');

reset role;

select testkit.eq(
  (select purchased from public.gift_items where id = 'gitem_lie'), true,
  'l''article lie a l''idee est marque achete (D-06)');
select testkit.eq(
  (select purchased from public.gift_items where id = 'gitem_libre'), false,
  'l''article sans lien reste non achete');

-- ===========================================================================
-- D-14 : supprimer le contact supprime son miroir (en FIN de fichier miroir)
-- ===========================================================================
-- Ce bloc détruit la fixture Agathe : il est donc dernier avant les
-- suppressions de listes.
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.contacts where id = ''contact_agathe'''), 1::bigint,
  'Alice supprime le contact date');
select testkit.eq(testkit.count(
  'select 1 from public.birthdays where contact_id = ''contact_agathe'''), 0::bigint,
  'le miroir est supprime en cascade avec son contact (D-14)');

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
