-- supabase/tests/0053_trip_workspace.sql
-- Phase 15 Espace voyage (plan 15-01, D-01/D-02/D-07/D-08) : fondation
-- serveur — isolation RLS par voyage et par foyer, anti-forge, ranges.
--
-- Etape 1 (tracer) : un membre fait transiter une ligne de voyage par la RLS ;
-- les lectures inter-voyages et inter-foyers sont refusees et prouvees, table
-- par table ; le trigger neutralise le trip_id forge ; l'admin voit sans
-- participer ; les lignes de foyer (trip_id NULL) gardent leur regime.
-- Etape 2 (meme fichier, suite) : atomicite, idempotence, leave, fermeture
-- douce, oracle uniforme, ticket invite.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage est borne au foyer, au voyage ou
-- a l'objet via testkit.fx — jamais de total nu. Role `postgres` (proprietaire)
-- pour les fixtures et les RPC service_role (comme l'Edge, motif 0026) ;
-- `authenticated` + testkit.as_user pour les preuves client.
--
-- Rouge→vert : avant 0118, la sonde `_sonde_red_1501` (transaction grattée,
-- jamais commise) prouvait que sans le conjonct `is_trip_member`, un membre
-- non participant lisait la ligne d'un autre voyage (1 ligne) ; avec 0118,
-- toute la suite est verte.

begin;

do $$
declare
  alice uuid := testkit.auth_user('t15-alice@example.fr', 'Alice Voyage');
  bob uuid := testkit.auth_user('t15-bob@example.fr', 'Bob Voyage');
  dave uuid := testkit.auth_user('t15-dave@example.fr', 'Dave Voyage');
  nina uuid := testkit.auth_user('t15-nina@example.fr', 'Nina Enfant');
  carol uuid := testkit.auth_user('t15-carol@example.fr', 'Carol Voisine');
  gwen uuid := testkit.auth_user('t15-gwen@example.fr', 'Gwen Fantome');
  home_a text := testkit.household(alice, 'Foyer Voyage A');
  home_b text := testkit.household(carol, 'Foyer Voyage B');
  alice_m text;
  bob_m text;
  dave_m text;
  nina_m text;
  carol_m text;
  trip_a1 text := private.new_id('trip');
  trip_a2 text := private.new_id('trip');
  list_a1 text := private.new_id('list');
  list_foyer text := private.new_id('list');
  list_a2 text := private.new_id('list');
  note_a1 text := private.new_id('note');
  task_a1 text := private.new_id('task');
  task_foyer text := private.new_id('task');
  place_a1 text := private.new_id('place');
  folder_a text := private.new_id('task-list');
  guest_a1 text := private.new_id('trip-guest');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Voyage', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Voyage', 'membre', 'ink');
  dave_m := testkit.member(home_a, dave, 'Dave Voyage', 'membre', 'amber');
  nina_m := testkit.member(home_a, nina, 'Nina Enfant', 'enfant', 'coral');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('dave', dave),
    ('nina', nina), ('carol', carol), ('gwen', gwen);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('bob_m', bob_m), ('dave_m', dave_m),
    ('nina_m', nina_m), ('carol_m', carol_m),
    ('trip_a1', trip_a1), ('trip_a2', trip_a2),
    ('list_a1', list_a1), ('list_foyer', list_foyer), ('list_a2', list_a2),
    ('note_a1', note_a1), ('task_a1', task_a1), ('task_foyer', task_foyer),
    ('place_a1', place_a1), ('folder_a', folder_a), ('guest_a1', guest_a1);

  -- Deux voyages du meme foyer : T1 (Bob seul participant, Alice admin non
  -- participante), T2 (Dave seul participant).
  insert into public.trips (id, household_id, name, destination, start_date, end_date, created_by)
  values (trip_a1, home_a, 'Lisbonne T1', 'Lisbonne', '2027-04-12', '2027-04-18', bob_m),
         (trip_a2, home_a, 'Rome T2', 'Rome', '2027-06-01', '2027-06-07', dave_m);
  insert into public.trip_members (trip_id, member_id)
  values (trip_a1, bob_m), (trip_a2, dave_m);

  -- Lignes de voyage (T1) + ligne de foyer + ligne de l'autre voyage (T2).
  insert into public.shopping_lists (id, household_id, name, created_by, trip_id)
  values (list_a1, home_a, 'Courses Lisbonne', bob_m, trip_a1),
         (list_foyer, home_a, 'Courses foyer', bob_m, null),
         (list_a2, home_a, 'Courses Rome', dave_m, trip_a2);
  insert into public.notes (id, household_id, title, created_by, trip_id)
  values (note_a1, home_a, 'Carnet Lisbonne', bob_m, trip_a1);
  insert into public.tasks (id, household_id, name, created_by, trip_id, folder_id)
  values (task_a1, home_a, 'Valises Lisbonne', bob_m, trip_a1, null),
         (task_foyer, home_a, 'Tache foyer', bob_m, null, null);
  insert into public.places (id, household_id, type, name, trip_id)
  values (place_a1, home_a, 'restaurant', 'Cantine Lisbonne', trip_a1);

  insert into public.task_lists (id, household_id, name, visibility, owner_member_id)
  values (folder_a, home_a, 'Dossier T1', 'foyer', bob_m);

  -- Un invite nomme sans acces sur T1 + un code actif (empreintes factices,
  -- jamais rendues aux clients).
  insert into public.trip_guests (id, trip_id, display_name, ticket_hash)
  values (guest_a1, trip_a1, 'Gaston Externe', null);
  insert into public.trip_invites (trip_id, token_hash, created_by)
  values (trip_a1, repeat('a', 64), alice);
end;
$$;

-- ===========================================================================
-- Tracer : un membre fait transiter une ligne de voyage par la RLS.
-- ===========================================================================
select testkit.as_user(user_id, 't15-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.shopping_lists (household_id, name, created_by, trip_id) values (%L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Boutiques Lisbonne',
  (select row_id from testkit.fx where key = 'bob_m'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant insere une ligne de son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 2::bigint,
  'un participant relit les lignes de son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant voit son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.notes where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant lit les notes de son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.tasks where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant lit les taches de son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.places where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant lit les adresses de son voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.trip_members where trip_id = %L',
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant lit la liste des participants');

select testkit.eq(testkit.count(format(
  'select 1 from public.trip_guests where trip_id = %L',
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'un participant lit les invites du voyage');

reset role;

-- ===========================================================================
-- Etancheite inter-voyages : un participant ne touche pas l'autre voyage.
-- ===========================================================================
select testkit.as_user(user_id, 't15-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a2'))), 0::bigint,
  'un participant ne lit pas les lignes d''un autre voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a2'))), 0::bigint,
  'un participant ne voit pas l''autre voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.trip_members where trip_id = %L',
  (select row_id from testkit.fx where key = 'trip_a2'))), 0::bigint,
  'un participant ne lit pas les participants d''un autre voyage');

select testkit.expect_denied(format(
  'insert into public.shopping_lists (household_id, name, created_by, trip_id) values (%L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Intrusion Rome',
  (select row_id from testkit.fx where key = 'bob_m'),
  (select row_id from testkit.fx where key = 'trip_a2')),
  'un participant n''ecrit pas dans un autre voyage');

select testkit.eq(testkit.affected(format(
  'update public.shopping_lists set name = %L where id = %L',
  'Rome piratee',
  (select row_id from testkit.fx where key = 'list_a2'))), 0::bigint,
  'un participant ne modifie pas la ligne d''un autre voyage');

select testkit.eq(testkit.affected(format(
  'delete from public.shopping_lists where id = %L',
  (select row_id from testkit.fx where key = 'list_a2'))), 0::bigint,
  'un participant ne supprime pas la ligne d''un autre voyage');

-- La lecture est elle-meme filtree par la RLS : l'integrite se verifie en
-- proprietaire (qui contourne la RLS comme la migration), pas en participant.
reset role;

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'list_a2'), 'Courses Rome')), 1::bigint,
  'la ligne de l''autre voyage est intacte');

select testkit.as_user(user_id, 't15-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.shopping_lists set trip_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'trip_a2'),
  (select row_id from testkit.fx where key = 'list_foyer')),
  'on ne bascule pas une ligne de foyer vers un voyage non rejoint');

reset role;

-- ===========================================================================
-- Negatifs par table : notes, taches, adresses refusent aussi l'autre voyage.
-- ===========================================================================
select testkit.as_user(user_id, 't15-dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.notes where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 0::bigint,
  'notes : un non-participant ne lit pas le voyage d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.tasks where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 0::bigint,
  'taches : un non-participant ne lit pas le voyage d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.places where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 0::bigint,
  'adresses : un non-participant ne lit pas le voyage d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 0::bigint,
  'un membre non participant ne voit pas le voyage');

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a2'))), 1::bigint,
  'un participant lit toujours son propre voyage');

reset role;

-- ===========================================================================
-- D-07 : l'admin voit tous les voyages sans y participer.
-- ===========================================================================
select testkit.as_user(user_id, 't15-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 2::bigint,
  'l''admin voit tous les voyages sans participer');

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and trip_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'trip_a1'))), 2::bigint,
  'l''admin lit les lignes du voyage sans participer');

select testkit.eq(testkit.count(format(
  'select 1 from public.trip_members where trip_id = %L',
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'l''admin lit les participants (moderation)');

reset role;

-- ===========================================================================
-- Inter-foyer + exterieur : aveugles, et la forge est neutralisee.
-- ===========================================================================
select testkit.as_user(user_id, 't15-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un membre d''un autre foyer ne lit pas les lignes du foyer');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un membre d''un autre foyer ne voit pas les voyages');

select testkit.expect_denied(format(
  'insert into public.shopping_lists (household_id, name, trip_id) values (%L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_b'),
  'Forge inter-foyers',
  (select row_id from testkit.fx where key = 'trip_a1')),
  'un trip_id forge vers un autre foyer est rejete, jamais reecrit');

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_b'), 'Forge inter-foyers')), 0::bigint,
  'la forge n''a rien ecrit dans le foyer de l''attaquant');

reset role;

select testkit.as_user(user_id, 't15-gwen@example.fr') from testkit.fx where key = 'gwen';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un exterieur ne voit pas les voyages');

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un exterieur ne lit pas les lignes du foyer');

reset role;

-- ===========================================================================
-- Regime foyer intact : trip_id NULL garde l'ancien comportement.
-- ===========================================================================
select testkit.as_user(user_id, 't15-dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.shopping_lists where household_id = %L and trip_id is null',
  (select household_id from testkit.fx where key = 'home_a'))), 1::bigint,
  'les lignes de foyer restent visibles a tout le foyer');

select testkit.eq(testkit.affected(format(
  'insert into public.shopping_lists (household_id, name, created_by) values (%L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Courses foyer Dave',
  (select row_id from testkit.fx where key = 'dave_m'))), 1::bigint,
  'les lignes de foyer restent inscriptibles');

reset role;

-- ===========================================================================
-- Enfant (D-01) : lecture foyer seule, aucune ecriture, aucun voyage.
-- ===========================================================================
select testkit.as_user(user_id, 't15-nina@example.fr') from testkit.fx where key = 'nina';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un enfant ne voit aucun voyage');

select testkit.expect_denied(format(
  'insert into public.shopping_lists (household_id, name, created_by, trip_id) values (%L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Intrusion enfant',
  (select row_id from testkit.fx where key = 'nina_m'),
  (select row_id from testkit.fx where key = 'trip_a1')),
  'un enfant n''ecrit pas dans un voyage');

select testkit.expect_denied(format(
  'insert into public.trips (household_id, name, destination, start_date, end_date) values (%L, %L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Voyage enfant', 'Ailleurs', '2027-01-01', '2027-01-02'),
  'un enfant ne cree pas de voyage');

reset role;

-- ===========================================================================
-- Codes invisibles : aucune lecture ni ecriture directe (motif 0079).
-- ===========================================================================
select testkit.as_user(user_id, 't15-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

-- Ni GRANT ni politique : la simple lecture echoue (motif 0079).
select testkit.expect_denied('select 1 from public.trip_invites',
  'les codes d''invitation sont invisibles aux clients');

select testkit.expect_denied(format(
  'insert into public.trip_invites (trip_id, token_hash, created_by) values (%L, %L, %L)',
  (select row_id from testkit.fx where key = 'trip_a1'),
  repeat('b', 64),
  (select user_id from testkit.fx where key = 'bob')),
  'les codes ne s''ecrivent pas en direct');

reset role;

-- ===========================================================================
-- Ranges structurelles : foyer du voyage fige, dossiers hors voyage,
-- assignes membres du voyage, lien ardoise meme foyer.
-- ===========================================================================
select testkit.as_user(user_id, 't15-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.trips set household_id = %L where id = %L',
  (select household_id from testkit.fx where key = 'home_b'),
  (select row_id from testkit.fx where key = 'trip_a1')),
  'le foyer d''un voyage ne change pas');

select testkit.expect_denied(format(
  'insert into public.tasks (household_id, name, trip_id, folder_id) values (%L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Tache dossier voyage',
  (select row_id from testkit.fx where key = 'trip_a1'),
  (select row_id from testkit.fx where key = 'folder_a')),
  'une ligne de voyage ne vit dans aucun dossier');

reset role;

select testkit.expect_denied(format(
  'insert into public.task_assignees (task_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'task_a1'),
  (select row_id from testkit.fx where key = 'dave_m')),
  'l''assigne d''une tache de voyage est membre du voyage');

select testkit.eq(testkit.affected(format(
  'insert into public.task_assignees (task_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'task_a1'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'un membre du voyage est assignable');

select testkit.eq(testkit.affected(format(
  'insert into public.task_assignees (task_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'task_foyer'),
  (select row_id from testkit.fx where key = 'dave_m'))), 1::bigint,
  'une tache de foyer garde son regime d''assignation');

select testkit.eq(testkit.affected(format(
  'insert into public.ardoises (household_id, name, trip_id) values (%L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_a'),
  'Ardoise liee T1',
  (select row_id from testkit.fx where key = 'trip_a1'))), 1::bigint,
  'une ardoise se lie a un voyage du meme foyer');

select testkit.expect_denied(format(
  'insert into public.ardoises (household_id, name, trip_id) values (%L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_b'),
  'Ardoise forge T1',
  (select row_id from testkit.fx where key = 'trip_a1')),
  'le lien ardoise-voyage est refuse quand les foyers different');

select testkit.eq(testkit.count(format(
  'select 1 from public.ardoises where household_id = %L and name = %L',
  (select household_id from testkit.fx where key = 'home_b'), 'Ardoise forge T1')), 0::bigint,
  'la forge ardoise n''a rien ecrit');

-- ===========================================================================
-- Etape 2 : RPC atomiques, inscriptions synchronisees, fermeture douce,
-- oracle uniforme, depense invite. Role proprietaire (comme l'Edge en
-- service_role, motif 0026), sauf mentions `authenticated` explicites.
-- ===========================================================================

do $$
declare
  henri uuid := testkit.auth_user('t15-henri@example.fr', 'Henri Voyage');
  irene uuid := testkit.auth_user('t15-irene@example.fr', 'Irene Voyage');
  marc uuid := testkit.auth_user('t15-marc@example.fr', 'Marc Voyage');
  kid uuid := testkit.auth_user('t15-kid@example.fr', 'Kidou Voyage');
  home_c text := testkit.household(henri, 'Foyer Voyage C');
  henri_m text;
  irene_m text;
  marc_m text;
  kid_m text;
  res jsonb;
  trip_c text;
  ardoise_c text;
begin
  henri_m := testkit.member(home_c, henri, 'Henri Voyage', 'admin', 'accent');
  irene_m := testkit.member(home_c, irene, 'Irene Voyage', 'membre', 'ink');
  marc_m := testkit.member(home_c, marc, 'Marc Voyage', 'membre', 'amber');
  kid_m := testkit.member(home_c, kid, 'Kidou Voyage', 'enfant', 'coral');
  insert into testkit.fx (key, user_id) values
    ('henri', henri), ('irene', irene), ('marc', marc), ('kid', kid);
  insert into testkit.fx (key, household_id) values ('home_c', home_c);
  insert into testkit.fx (key, row_id) values
    ('henri_m', henri_m), ('irene_m', irene_m), ('marc_m', marc_m), ('kid_m', kid_m);

  -- Creation atomique : voyage + 2 participants + ardoise liee + 2 inscrits.
  res := public.create_trip_atomic(
    henri, home_c, 'Corse C', 'Corse', '2027-07-01', '2027-07-10',
    'Notes Corse', array[henri_m, irene_m], null);
  trip_c := res ->> 'trip_id';
  ardoise_c := res ->> 'ardoise_id';
  insert into testkit.fx (key, row_id) values
    ('trip_c', trip_c), ('ardoise_c', ardoise_c);

  perform testkit.ok(trip_c is not null and ardoise_c is not null,
    'la creation atomique rend voyage + ardoise');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_c)), 2::bigint,
    'les deux participants sont inscrits au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoises where id = %L and trip_id = %L and household_id = %L',
    ardoise_c, trip_c, home_c)), 1::bigint,
    'l''ardoise liee pointe le voyage dans le meme foyer');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L', ardoise_c)), 2::bigint,
    'les inscriptions ardoise sont synchronisees');

  -- Enfant et hors-foyer dans la selection : ignores, jamais inscrits.
  res := public.create_trip_atomic(
    henri, home_c, 'Crete C', 'Crete', '2027-08-01', '2027-08-07',
    null, array[henri_m, kid_m, 'membre-fantome',
      (select row_id from testkit.fx where key = 'carol_m')], null);
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', res ->> 'trip_id')), 1::bigint,
    'enfant, inconnu et hors-foyer sont exclus de la selection');
end;
$$;

-- Atomicite : un nom qui passe le voyage (≤200) mais casse l'ardoise (>120)
-- annule TOUT — aucun voyage ne survit a l'echec tardif.
select testkit.expect_denied(format(
  'select public.create_trip_atomic(%L, %L, %L, %L, %L, %L)',
  (select user_id from testkit.fx where key = 'henri'),
  (select household_id from testkit.fx where key = 'home_c'),
  repeat('N', 150), 'Corse', '2027-07-01', '2027-07-10'),
  'l''echec tardif (ardoise) annule la creation');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where household_id = %L and char_length(name) > 120',
  (select household_id from testkit.fx where key = 'home_c'))), 0::bigint,
  'aucun voyage orphelin ne survit a l''echec');

-- Acteurs refuses : hors-foyer et enfant ne creent pas (RPC, pas RLS).
select testkit.expect_denied(format(
  'select public.create_trip_atomic(%L, %L, %L, %L, %L, %L)',
  (select user_id from testkit.fx where key = 'gwen'),
  (select household_id from testkit.fx where key = 'home_c'),
  'Intrusion', 'X', '2027-07-01', '2027-07-02'),
  'un hors-foyer ne cree pas de voyage');

select testkit.expect_denied(format(
  'select public.create_trip_atomic(%L, %L, %L, %L, %L, %L)',
  (select user_id from testkit.fx where key = 'kid'),
  (select household_id from testkit.fx where key = 'home_c'),
  'Voyage enfant', 'X', '2027-07-01', '2027-07-02'),
  'un enfant ne cree pas de voyage');

-- Les RPC serveur ne s'appellent pas en direct : ni creation, ni echange,
-- ni depense invite (seule l'Edge en service_role y touche).
select testkit.as_user(user_id, 't15-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied('select public.create_trip_atomic(null, null, null, null, null, null)',
  'la creation atomique n''est pas appelable en direct');

select testkit.expect_denied(format(
  'select public.redeem_trip_invite(%L)',
  repeat('a', 64)),
  'l''echange n''est pas appelable en direct');

select testkit.expect_denied(format(
  'select public.create_trip_guest_expense(%L, %L, %L)',
  repeat('a', 64), 'Repas', 10),
  'la depense invite n''est pas appelable en direct');

reset role;

-- ===========================================================================
-- Invitations : gestion, idempotence, oracle uniforme, ticket invite.
-- ===========================================================================
do $$
declare
  v_henri uuid; v_irene uuid; v_marc uuid; v_kid uuid; v_carol uuid;
  v_home_c text; v_trip_c text;
  v_h0 text := repeat('0', 64);
  v_h1 text := repeat('1', 64);
  v_h2 text := repeat('2', 64);
  v_h3 text := repeat('3', 64);
  v_h4 text := repeat('4', 64);
  v_h5 text := repeat('5', 64);
  v_hx text := repeat('f', 64);
  v_out jsonb;
  v_ticket text;
  v_thash text;
  v_guest text;
  m_unknown text; m_malformed text; m_expired text; m_revoked text;
  m_exhausted text; m_enfant text;
begin
  select user_id into v_henri from testkit.fx where key = 'henri';
  select user_id into v_irene from testkit.fx where key = 'irene';
  select user_id into v_marc from testkit.fx where key = 'marc';
  select user_id into v_kid from testkit.fx where key = 'kid';
  select user_id into v_carol from testkit.fx where key = 'carol';
  select household_id into v_home_c from testkit.fx where key = 'home_c';
  select row_id into v_trip_c from testkit.fx where key = 'trip_c';

  -- Gestion : participant ou admin ; un enfant ne gere pas les codes.
  perform public.create_trip_invite(v_henri, v_trip_c, v_h0);
  begin
    perform public.create_trip_invite(v_kid, v_trip_c, v_h1);
    raise exception 'ASSERTION ÉCHOUÉE : un enfant ne gere pas les codes';
  exception when others then
    if sqlerrm not like '%gestion du voyage réservée%' then raise; end if;
  end;

  -- Resume : actif, sans empreinte.
  v_out := public.trip_invite_summary(v_henri, v_trip_c);
  perform testkit.ok((v_out ->> 'is_active')::boolean, 'le code est actif');
  perform testkit.ok(not (v_out ? 'token_hash'), 'le resume ne rend jamais l''empreinte');

  -- Double inscription d'un nouveau venu : premier echange consomme, second
  -- rejoue sans consommer (already_member, compteur intact).
  v_out := public.redeem_trip_invite(v_h0, v_marc, null);
  perform testkit.ok(not (v_out ->> 'already_member')::boolean, 'premier echange inscrit');
  v_out := public.redeem_trip_invite(v_h0, v_marc, null);
  perform testkit.ok((v_out ->> 'already_member')::boolean, 'double echange = already_member');
  perform testkit.eq(
    (select use_count from public.trip_invites where token_hash = v_h0), 1,
    'le rejeu idempotent ne consomme pas le compteur');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where member_id = (select row_id from testkit.fx where key = %L)',
    'marc_m')), 1::bigint,
    'le nouveau venu est aussi inscrit a l''ardoise liee');

  -- Irene (inscrite a la creation) : depart puis double retour.
  perform public.trip_leave(v_irene, v_trip_c);
  perform public.create_trip_invite(v_henri, v_trip_c, v_h1);
  v_out := public.redeem_trip_invite(v_h1, v_irene, null);
  perform testkit.ok(not (v_out ->> 'already_member')::boolean, 'le retour re-inscrit');
  v_out := public.redeem_trip_invite(v_h1, v_irene, null);
  perform testkit.ok((v_out ->> 'already_member')::boolean, 'le retour est idempotent');

  v_out := public.revoke_trip_invite(v_henri, v_trip_c);
  perform testkit.eq((v_out ->> 'revoked')::integer, 1, 'la revocation coupe le code');

  -- Oracle uniforme : inconnu, malforme, expire, revoque, epuise, enfant —
  -- un seul message, jamais d'existence revelee.
  begin perform public.redeem_trip_invite(v_hx, null, 'Zoe'); exception when others then m_unknown := sqlerrm; end;
  begin perform public.redeem_trip_invite('zzz', null, 'Zoe'); exception when others then m_malformed := sqlerrm; end;

  perform public.create_trip_invite(v_henri, v_trip_c, v_h2);
  update public.trip_invites set expires_at = now() - interval '1 hour' where token_hash = v_h2;
  begin perform public.redeem_trip_invite(v_h2, null, 'Zoe'); exception when others then m_expired := sqlerrm; end;

  perform public.create_trip_invite(v_henri, v_trip_c, v_h3);
  perform public.revoke_trip_invite(v_henri, v_trip_c);
  begin perform public.redeem_trip_invite(v_h3, null, 'Zoe'); exception when others then m_revoked := sqlerrm; end;

  perform public.create_trip_invite(v_henri, v_trip_c, v_h4, null, 1);
  v_out := public.redeem_trip_invite(v_h4, null, 'Yanis Externe');
  v_ticket := v_out ->> 'guest_ticket';
  perform testkit.ok(v_ticket is not null and char_length(v_ticket) >= 20,
    'l''echange invite rend un ticket une seule fois');
  begin perform public.redeem_trip_invite(v_h4, null, 'Autre'); exception when others then m_exhausted := sqlerrm; end;

  -- Enfant sur code VALIDE : la branche enfant repond sous oracle (le code
  -- revoque v_h1 ne prouverait que la revocation, pas la branche).
  perform public.create_trip_invite(v_henri, v_trip_c, v_h5);
  begin perform public.redeem_trip_invite(v_h5, v_kid, null); exception when others then m_enfant := sqlerrm; end;

  perform testkit.eq(m_malformed, m_unknown, 'oracle : malforme = inconnu');
  perform testkit.eq(m_expired, m_unknown, 'oracle : expire = inconnu');
  perform testkit.eq(m_revoked, m_unknown, 'oracle : revoque = inconnu');
  perform testkit.eq(m_exhausted, m_unknown, 'oracle : epuise = inconnu');
  perform testkit.eq(m_enfant, m_unknown, 'oracle : enfant = inconnu');

  -- Ticket : verifiable, et le miroir payeur existe sur l'ardoise liee.
  v_thash := encode(extensions.digest(v_ticket, 'sha256'), 'hex');
  v_out := public.verify_trip_ticket(v_thash);
  v_guest := v_out ->> 'guest_id';
  perform testkit.eq(v_out ->> 'trip_id', v_trip_c, 'le ticket designe le voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_guests where id = %L and ticket_hash is null',
    v_guest)), 1::bigint,
    'le miroir payeur nomme existe sur l''ardoise liee (sans acces)');
  begin perform public.verify_trip_ticket(v_hx); exception when others then
    perform testkit.eq(sqlerrm, replace(m_unknown, 'code invalide', 'ticket invalide'),
      'ticket inconnu refuse');
  end;

  insert into testkit.fx (key, row_id) values ('guest_ticket_hash', v_thash);
end;
$$;

-- ===========================================================================
-- Depense invite : sous ticket valide sur l'ardoise liee, refusee sinon.
-- ===========================================================================
do $$
declare
  v_thash text;
  v_home_c text;
  v_ardoise_c text;
  v_henri_m text;
  v_guest text;
  v_out jsonb;
begin
  select row_id into v_thash from testkit.fx where key = 'guest_ticket_hash';
  select household_id into v_home_c from testkit.fx where key = 'home_c';
  select row_id into v_ardoise_c from testkit.fx where key = 'ardoise_c';
  select row_id into v_henri_m from testkit.fx where key = 'henri_m';
  select guest_id into v_guest from (select (public.verify_trip_ticket(v_thash) ->> 'guest_id') as guest_id) s;

  -- Invite + membre inscrit : perimetre ardoise respecte.
  v_out := public.create_trip_guest_expense(
    v_thash, 'Repas Corse', 42.50, '2027-07-03', 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'guest', 'guest_id', v_guest, 'share_amount', '20.00'),
      jsonb_build_object('participant_type', 'membre', 'member_id', v_henri_m, 'share_amount', '22.50')
    ));
  perform testkit.eq(testkit.count(format(
    'select 1 from public.expenses where id = %L and ardoise_id = %L and paid_by_guest = %L',
    v_out ->> 'id', v_ardoise_c, v_guest)), 1::bigint,
    'la depense invite vit sur l''ardoise liee, payee par l''invite');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.expense_participants where expense_id = %L', v_out ->> 'id')), 2::bigint,
    'les deux parts sont enregistrees');

  -- Part hors perimetre (membre fantome, jamais inscrit a l'ardoise) :
  -- refusee par la validation des parts.
  begin
    perform public.create_trip_guest_expense(
      v_thash, 'Intrusion', 10, '2027-07-03', 'egal',
      jsonb_build_array(jsonb_build_object(
        'participant_type', 'membre', 'member_id', 'membre-fantome', 'share_amount', '10.00')));
    raise exception 'ASSERTION ÉCHOUÉE : part hors ardoise acceptee';
  exception when others then
    if sqlerrm not like '%n''appartient pas à l''ardoise%' then raise; end if;
  end;

  begin perform public.create_trip_guest_expense(repeat('e', 64), 'X', 10);
  exception when others then
    perform testkit.ok(sqlerrm like '%ticket invalide%', 'ticket inconnu refuse');
  end;
end;
$$;

-- ===========================================================================
-- Depart : double desinscription, histoire intacte, oracle uniforme.
-- ===========================================================================
do $$
declare
  v_irene uuid;
  v_trip_c text;
  v_ardoise_c text;
  v_irene_m text;
  v_out jsonb;
begin
  select user_id into v_irene from testkit.fx where key = 'irene';
  select row_id into v_trip_c from testkit.fx where key = 'trip_c';
  select row_id into v_ardoise_c from testkit.fx where key = 'ardoise_c';
  select row_id into v_irene_m from testkit.fx where key = 'irene_m';

  v_out := public.trip_leave(v_irene, v_trip_c);
  perform testkit.ok((v_out ->> 'left')::boolean, 'le depart reussit');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L and member_id = %L',
    v_trip_c, v_irene_m)), 0::bigint,
    'le partant quitte le voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L and member_id = %L',
    v_ardoise_c, v_irene_m)), 0::bigint,
    'le partant quitte aussi l''ardoise liee');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trips where id = %L', v_trip_c)), 1::bigint,
    'le voyage survit au depart');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.expenses where ardoise_id = %L', v_ardoise_c)), 1::bigint,
    'l''histoire (depenses) survit au depart');

  begin perform public.trip_leave(v_irene, v_trip_c);
  exception when others then
    perform testkit.ok(sqlerrm like '%quitter impossible%', 'double depart refuse sous oracle');
  end;
end;
$$;

-- ===========================================================================
-- Fermeture douce : fige sans cascade, rouvrable admin seul.
-- ===========================================================================
do $$
declare
  v_henri uuid; v_irene uuid; v_marc uuid;
  v_trip_c text; v_home_c text; v_henri_m text;
begin
  select user_id into v_henri from testkit.fx where key = 'henri';
  select user_id into v_irene from testkit.fx where key = 'irene';
  select user_id into v_marc from testkit.fx where key = 'marc';
  select row_id into v_trip_c from testkit.fx where key = 'trip_c';
  select household_id into v_home_c from testkit.fx where key = 'home_c';
  select row_id into v_henri_m from testkit.fx where key = 'henri_m';

  -- Une ligne de voyage existe avant fermeture : elle doit survivre.
  insert into public.shopping_lists (household_id, name, created_by, trip_id)
  values (v_home_c, 'Courses Corse', v_henri_m, v_trip_c);

  -- Fermeture par un participant non admin (gestion du voyage, D-08).
  perform public.trip_close(v_marc, v_trip_c);
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trips where id = %L and is_closed', v_trip_c)), 1::bigint,
    'le voyage est fige');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.shopping_lists where trip_id = %L and name = %L',
    v_trip_c, 'Courses Corse')), 1::bigint,
    'la fermeture ne detruit rien : la ligne survit');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.expenses where ardoise_id = (select a.id from public.ardoises a where a.trip_id = %L)',
    v_trip_c)), 1::bigint,
    'les depenses de l''ardoise liee survivent a la fermeture');

  -- Fermee : l'invite ne depense plus.
  begin
    perform public.create_trip_guest_expense(
      (select row_id from testkit.fx where key = 'guest_ticket_hash'),
      'Apres fermeture', 5, '2027-07-04', 'egal',
      jsonb_build_array(jsonb_build_object(
        'participant_type', 'guest',
        'guest_id', (public.verify_trip_ticket(
          (select row_id from testkit.fx where key = 'guest_ticket_hash')) ->> 'guest_id'),
        'share_amount', '5.00')));
    raise exception 'ASSERTION ÉCHOUÉE : depense sur voyage fige acceptee';
  exception when others then
    if sqlerrm not like '%figé%' then raise; end if;
  end;

  -- Reouverture : non-admin refuse, admin restaure.
  begin perform public.trip_reopen(v_irene, v_trip_c);
  exception when others then
    perform testkit.ok(sqlerrm like '%réservée aux administrateurs%',
      'seul un admin reouvre');
  end;
  perform public.trip_reopen(v_henri, v_trip_c);
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trips where id = %L and not is_closed', v_trip_c)), 1::bigint,
    'l''admin reouvre le voyage');
end;
$$;

-- Flags serveur : is_closed ne bascule jamais en direct — meme quand la
-- RLS laisserait passer (participant ecrivain, voyage ouvert), le garde-fou
-- leve. Puis on refige par RPC pour les preuves d'etat fige.
select testkit.as_user(user_id, 't15-henri@example.fr') from testkit.fx where key = 'henri';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.trips set is_closed = true where id = %L',
  (select row_id from testkit.fx where key = 'trip_c')),
  'is_closed ne bascule pas en direct (garde-fou serveur)');

reset role;

-- Le bloc precedent a rouvert : on refige par RPC (proprietaire).
select public.trip_close(
  (select user_id from testkit.fx where key = 'henri'),
  (select row_id from testkit.fx where key = 'trip_c'));

select testkit.as_user(user_id, 't15-henri@example.fr') from testkit.fx where key = 'henri';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.shopping_lists (household_id, name, created_by, trip_id) values (%L, %L, %L, %L)',
  (select household_id from testkit.fx where key = 'home_c'),
  'Ecrit fige',
  (select row_id from testkit.fx where key = 'henri_m'),
  (select row_id from testkit.fx where key = 'trip_c')),
  'ferme : meme un participant n''ecrit plus en direct');

select testkit.eq(testkit.count(format(
  'select 1 from public.trips where id = %L',
  (select row_id from testkit.fx where key = 'trip_c'))), 1::bigint,
  'ferme : le voyage reste lisible');

reset role;

rollback;
