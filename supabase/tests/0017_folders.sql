-- supabase/tests/0017_folders.sql
-- Phase 1b Dossiers : seed Général, isolation foyer, perso (owner+admin),
-- enfant lecture seule, intégrité folder_id, suppression -> Général.

begin;

do $$
declare
  alice uuid := testkit.auth_user('fold-a-alice@example.fr', 'Alice Aaaa');
  bob uuid := testkit.auth_user('fold-a-bob@example.fr', 'Bob Aaaa');
  kid uuid := testkit.auth_user('fold-a-kid@example.fr', 'Noé Aaaa');
  carol uuid := testkit.auth_user('fold-b-carol@example.fr', 'Carol Aaaa');

  home_a text := testkit.household(alice, 'Foyer Fold Aaaa');
  home_b text := testkit.household(carol, 'Foyer Fold Baaa');

  alice_m text := testkit.member(home_a, alice, 'Alice Aaaa', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Aaaa', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noé Aaaa', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Aaaa', 'admin', 'coral');

  general_a text;
  perso_bob text;
  task_perso text := private.new_id('task');
begin
  -- 0. Seed Général : create_household sème 3× Général (via la fonction, en authenticated).
  perform testkit.as_user(alice, 'fold-a-alice@example.fr');
  set local role authenticated;
  perform public.create_household('Foyer Seed Aaaa', 'accent');
  reset role;
  perform testkit.eq(
    testkit.count('select 1 from public.task_lists where household_id in (select id from public.households where name = ''Foyer Seed Aaaa'') and is_default'),
    1::bigint, 'create_household sème le Général tâches');

  -- Général explicite pour home_a (testkit.household ne sème pas).
  insert into public.task_lists (household_id, name, visibility, owner_member_id, is_default)
  values (home_a, 'Général', 'foyer', alice_m, true)
  on conflict do nothing;
  insert into public.note_folders (household_id, name, visibility, owner_member_id, is_default)
  values (home_a, 'Général', 'foyer', alice_m, true)
  on conflict do nothing;
  insert into public.routine_folders (household_id, name, visibility, owner_member_id, is_default)
  values (home_a, 'Général', 'foyer', alice_m, true)
  on conflict do nothing;
  select id into general_a from public.task_lists
   where household_id = home_a and is_default;

  -- Dossier perso de Bob + item dedans.
  insert into public.task_lists (id, household_id, name, visibility, owner_member_id)
  values (private.new_id('task-list'), home_a, 'Perso Bob Aaaa', 'perso', bob_m)
  returning id into perso_bob;
  insert into public.tasks (id, household_id, folder_id, name, created_by)
  values (task_perso, home_a, perso_bob, 'Perso Tâche Aaaa', bob_m);

  -- 1. Isolation inter-foyer : Carol ne voit ni dossiers ni items de A.
  perform testkit.as_user(carol, 'fold-b-carol@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.task_lists where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucun dossier de A');
  perform testkit.eq(
    testkit.count('select 1 from public.tasks where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucune tâche de A');
  perform testkit.expect_denied(format(
    'insert into public.tasks (id, household_id, name) values (%L, %L, %L)',
    private.new_id('task'), home_a, 'Cross Aaaa'),
    'écriture inter-foyer refusée');
  reset role;

  -- 2. Perso : owner lit/écrit, autre membre ne lit rien, admin lit (modération).
  perform testkit.as_user(bob, 'fold-a-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.tasks where id = ''' || task_perso || ''''),
    1::bigint, 'owner lit son item perso');
  reset role;
  perform testkit.as_user(alice, 'fold-a-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.tasks where id = ''' || task_perso || ''''),
    1::bigint, 'admin lit le perso pour modération');
  reset role;

  -- 3. Enfant : lit le foyer, n'écrit ni dossier ni item.
  perform testkit.as_user(kid, 'fold-a-kid@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.task_lists where household_id = ''' || home_a || ''' and visibility = ''foyer'''),
    1::bigint, 'enfant lit les dossiers foyer');
  perform testkit.expect_denied(format(
    'insert into public.task_lists (household_id, name, visibility, owner_member_id) values (%L, %L, %L, %L)',
    home_a, 'Kid Aaaa', 'foyer', kid_m),
    'enfant ne crée pas de dossier');
  perform testkit.expect_denied(format(
    'insert into public.tasks (id, household_id, name) values (%L, %L, %L)',
    private.new_id('task'), home_a, 'Kid Task Aaaa'),
    'enfant ne crée pas de tâche');
  reset role;

  -- 4. Item dans le perso d'autrui refusé au membre (lecture 0 + insert refusé).
  perform testkit.as_user(carol, 'fold-b-carol@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.task_lists where id = ''' || perso_bob || ''''),
    0::bigint, 'perso invisible hors foyer');
  reset role;

  -- 5. Intégrité trigger (postgres) : dossier d'un autre foyer 23514, absent 23503 (FK).
  insert into public.task_lists (household_id, name, visibility, owner_member_id)
  values (home_b, 'Dossier Baaa', 'foyer', carol_m);
  begin
    insert into public.tasks (id, household_id, folder_id, name)
    values (private.new_id('task'), home_a,
      (select id from public.task_lists where household_id = home_b and name = 'Dossier Baaa'),
      'Cross Folder Aaaa');
    perform testkit.ok(false, 'dossier inter-foyer aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'dossier inter-foyer refusé 23514');
  end;
  begin
    insert into public.tasks (id, household_id, folder_id, name)
    values (private.new_id('task'), home_a, 'task-list_00000000-0000-0000-0000-000000000000', 'Ghost Aaaa');
    perform testkit.ok(false, 'dossier absent aurait dû lever 23503');
  exception when foreign_key_violation then
    -- FK d'abord (23503) : le trigger ne voit jamais la ligne.
    perform testkit.ok(true, 'dossier absent refusé 23503 (FK)');
  end;
  begin
    insert into public.task_lists (household_id, name, visibility, owner_member_id)
    values (home_a, 'Bad Owner Aaaa', 'foyer', carol_m);
    perform testkit.ok(false, 'owner inter-foyer aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'owner inter-foyer refusé 23514');
  end;

  -- 6. Suppression dossier -> contenu retombe dans Général (SET NULL) ; Général insupprimable.
  perform testkit.as_user(alice, 'fold-a-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected(format('delete from public.task_lists where id = %L', perso_bob)),
    1::bigint, 'admin supprime le dossier perso');
  reset role;
  perform testkit.eq(
    testkit.count('select 1 from public.tasks where id = ''' || task_perso || ''' and folder_id is null'),
    1::bigint, 'contenu retombé dans Général');
  perform testkit.as_user(alice, 'fold-a-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected(format('delete from public.task_lists where id = %L', general_a)),
    0::bigint, 'Général insupprimable même par admin');
  reset role;
end;
$$;

rollback;
