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

rollback;
