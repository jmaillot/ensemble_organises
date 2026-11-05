-- supabase/tests/0177_client_key.test.sql
-- Migration 0177 (WRQ-01, D-14/D-15) — idempotence du rejeu par client_key.
--
--   Test A — backfill/NOT NULL : une insertion SANS client_key est refusée
--            (violation NOT NULL, en postgres donc hors RLS) ; les lignes de
--            fixture créées à l'exécution portent bien un uuid.
--   Test B — doublon refusé : deux lignes du MÊME foyer avec le même
--            client_key lèvent unique_violation (SQLSTATE 23505) sur les 5
--            tables ; sur task_assignees, le même client_key est refusé quoi
--            qu'il arrive (unicité globale, jointure sans household_id).
--   Test C — foyers distincts : le MÊME client_key dans deux foyers
--            DISTINCTS est accepté sur les 4 tables à household_id (unicité
--            par foyer, pas globale).
--   Test D — RLS (§2.6) : un utilisateur non membre du foyer ne peut pas
--            insérer une ligne tasks portant un client_key (refus
--            inter-foyer, preuve de T-34-01).
--   Test E — upsert de rejeu : un insert … on conflict (household_id,
--            client_key) do update rejoué deux fois laisse le compte
--            inchangé et applique la seconde écriture (exactement une fois).
--
-- Toutes les assertions sont bornées par le household_id de la fixture (rôle
-- postgres : la RLS est court-circuitée, chaque count est borné à la main —
-- AGENTS §2.7 D.2) ; les assertions en authenticated s'appuient sur la RLS.

begin;

do $$
declare
  alice uuid := testkit.auth_user('ck-alice@example.fr', 'Alice Clé');
  bob   uuid := testkit.auth_user('ck-bob@example.fr', 'Bob Clé');
  carol uuid := testkit.auth_user('ck-carol@example.fr', 'Carol Ailleurs');
  home  text := testkit.household(alice, 'Foyer Clé');
  home2 text := testkit.household(carol, 'Foyer Ailleurs Clé');
begin
  perform testkit.member(home, alice, 'Alice Clé', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob Clé', 'membre', 'coral');
  perform testkit.member(home2, carol, 'Carol Ailleurs', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, user_id) values ('bob', bob);
  insert into testkit.fx (key, user_id) values ('carol', carol);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, household_id) values ('home2', home2);
end;
$$;

-- Semis (rôle postgres, chaque ligne porte son client_key) -------------------
insert into public.shopping_lists (id, household_id, name, created_by)
values ('ck-liste', (select household_id from testkit.fx where key = 'home'),
        'Liste Clé', null);

insert into public.shopping_list_items (id, list_id, household_id, name, client_key)
values ('ck-item', 'ck-liste',
        (select household_id from testkit.fx where key = 'home'),
        'Pain', '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, household_id, name, client_key)
values ('ck-task', (select household_id from testkit.fx where key = 'home'),
        'Tâche Clé', '22222222-2222-4222-8222-222222222222');

insert into public.routines (id, household_id, name, client_key)
values ('ck-routine', (select household_id from testkit.fx where key = 'home'),
        'Routine Clé', '33333333-3333-4333-8333-333333333333');

insert into public.routine_completions (id, routine_id, household_id,
                                        occurrence_date, client_key)
values ('ck-completion', 'ck-routine',
        (select household_id from testkit.fx where key = 'home'),
        date '2026-11-05', '44444444-4444-4444-8444-444444444444');

-- Assignataire : member_id d'Alice, résolu par une requête (le do-block de
-- fixture n'enregistre pas les household_members dans fx).
do $$
declare
  v_member text;
begin
  select id into v_member
    from public.household_members
   where household_id = (select household_id from testkit.fx where key = 'home')
     and user_id = (select user_id from testkit.fx where key = 'alice');
  insert into public.task_assignees (task_id, member_id, client_key)
  values ('ck-task', v_member, '55555555-5555-4555-8555-555555555555');
end;
$$;

-- ---------------------------------------------------------------------------
-- Test A — backfill/NOT NULL
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.tasks (id, household_id, name)
    values ('ck-task-nonulle', (select household_id from testkit.fx where key = 'home'),
            'Tâche sans clé');
    raise exception 'ASSERTION ÉCHOUÉE : insertion sans client_key acceptée sur tasks (NOT NULL attendu)';
  exception
    when not_null_violation then null; -- refus attendu (23502)
  end;
end;
$$;

select testkit.eq(
  testkit.count($t$select 1 from public.tasks
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and client_key is not null$t$),
  1::bigint, 'Test A : la ligne de fixture tasks porte un client_key non null');

-- ---------------------------------------------------------------------------
-- Test B — doublon dans le même foyer refusé (23505) sur les 5 tables
-- ---------------------------------------------------------------------------

-- shopping_list_items
do $$
begin
  begin
    insert into public.shopping_list_items (id, list_id, household_id, name, client_key)
    values ('ck-item-dup', 'ck-liste',
            (select household_id from testkit.fx where key = 'home'),
            'Doublon', '11111111-1111-4111-8111-111111111111');
    raise exception 'ASSERTION ÉCHOUÉE : doublon client_key accepté sur shopping_list_items';
  exception
    when unique_violation then null; -- 23505 attendu
  end;
end;
$$;

-- tasks
do $$
begin
  begin
    insert into public.tasks (id, household_id, name, client_key)
    values ('ck-task-dup', (select household_id from testkit.fx where key = 'home'),
            'Doublon', '22222222-2222-4222-8222-222222222222');
    raise exception 'ASSERTION ÉCHOUÉE : doublon client_key accepté sur tasks';
  exception
    when unique_violation then null; -- 23505 attendu
  end;
end;
$$;

-- routines
do $$
begin
  begin
    insert into public.routines (id, household_id, name, client_key)
    values ('ck-routine-dup', (select household_id from testkit.fx where key = 'home'),
            'Doublon', '33333333-3333-4333-8333-333333333333');
    raise exception 'ASSERTION ÉCHOUÉE : doublon client_key accepté sur routines';
  exception
    when unique_violation then null; -- 23505 attendu
  end;
end;
$$;

-- routine_completions
do $$
begin
  begin
    insert into public.routine_completions (id, routine_id, household_id,
                                            occurrence_date, client_key)
    values ('ck-completion-dup', 'ck-routine',
            (select household_id from testkit.fx where key = 'home'),
            date '2026-11-06', '44444444-4444-4444-8444-444444444444');
    raise exception 'ASSERTION ÉCHOUÉE : doublon client_key accepté sur routine_completions';
  exception
    when unique_violation then null; -- 23505 attendu
  end;
end;
$$;

-- task_assignees : unicité sur client_key SEUL — le même client_key est
-- refusé quoi qu'il arrive, même sur une autre tâche / un autre membre.
do $$
declare
  v_member text;
begin
  select id into v_member
    from public.household_members
   where household_id = (select household_id from testkit.fx where key = 'home')
     and user_id = (select user_id from testkit.fx where key = 'bob');
  begin
    insert into public.task_assignees (task_id, member_id, client_key)
    values ('ck-task', v_member, '55555555-5555-4555-8555-555555555555');
    raise exception 'ASSERTION ÉCHOUÉE : même client_key accepté deux fois sur task_assignees';
  exception
    when unique_violation then null; -- 23505 attendu (unicité globale)
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Test C — le même client_key dans deux foyers distincts est accepté
-- (4 tables à household_id) : l'unicité est PAR FOYER, pas globale.
-- ---------------------------------------------------------------------------
insert into public.shopping_lists (id, household_id, name)
values ('ck-liste-2', (select household_id from testkit.fx where key = 'home2'),
        'Liste Ailleurs');

insert into public.shopping_list_items (id, list_id, household_id, name, client_key)
values ('ck-item-2', 'ck-liste-2',
        (select household_id from testkit.fx where key = 'home2'),
        'Pain ailleurs', '11111111-1111-4111-8111-111111111111');

insert into public.tasks (id, household_id, name, client_key)
values ('ck-task-2', (select household_id from testkit.fx where key = 'home2'),
        'Tâche ailleurs', '22222222-2222-4222-8222-222222222222');

insert into public.routines (id, household_id, name, client_key)
values ('ck-routine-2', (select household_id from testkit.fx where key = 'home2'),
        'Routine ailleurs', '33333333-3333-4333-8333-333333333333');

insert into public.routine_completions (id, routine_id, household_id,
                                        occurrence_date, client_key)
values ('ck-completion-2', 'ck-routine-2',
        (select household_id from testkit.fx where key = 'home2'),
        date '2026-11-05', '44444444-4444-4444-8444-444444444444');

select testkit.eq(
  testkit.count($t$select 1 from public.tasks
                 where client_key = '22222222-2222-4222-8222-222222222222'
                   and household_id in (
                     (select household_id from testkit.fx where key = 'home'),
                     (select household_id from testkit.fx where key = 'home2'))$t$),
  2::bigint, 'Test C : le même client_key existe dans les deux foyers (tasks)');

select testkit.eq(
  testkit.count($t$select 1 from public.shopping_list_items
                 where client_key = '11111111-1111-4111-8111-111111111111'
                   and household_id in (
                     (select household_id from testkit.fx where key = 'home'),
                     (select household_id from testkit.fx where key = 'home2'))$t$),
  2::bigint, 'Test C : le même client_key existe dans les deux foyers (shopping_list_items)');

-- ---------------------------------------------------------------------------
-- Test D — RLS (§2.6, T-34-01) : Carol n'est PAS membre de home ; son insert
-- d'une ligne tasks portant un client_key du foyer home est refusée.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'carol'));
set local role authenticated;

select testkit.expect_denied(
  $q$insert into public.tasks (id, household_id, name, client_key)
  values ('ck-task-fuite', (select household_id from testkit.fx where key = 'home'),
          'Fuite inter-foyer', '66666666-6666-4666-8666-666666666666')$q$,
  'Test D : un non-membre ne peut pas insérer une tâche (client_key) dans un foyer étranger');

-- Le refus inter-foyer ne doit rien avoir créé : toujours 1 ligne tasks
-- dans home (rôle postgres redevenu courant, compte borné par foyer).
reset role;

select testkit.eq(
  testkit.count($t$select 1 from public.tasks
                 where household_id = (select household_id from testkit.fx where key = 'home')$t$),
  1::bigint, 'Test D : aucune fuite — une seule tâche dans home après le refus');

-- ---------------------------------------------------------------------------
-- Test E — upsert de rejeu : deux rejeux du même on conflict
-- (household_id, client_key) do update → le compte est inchangé et la
-- seconde écriture gagne (exactement une fois).
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $u$insert into public.tasks (id, household_id, name, client_key)
  values ('ck-task-rejeu', (select household_id from testkit.fx where key = 'home'),
          'Rejeu 1', '77777777-7777-4777-8777-777777777777')
  on conflict (household_id, client_key) do update
    set name = excluded.name$u$);

select testkit.expect_ok(
  $u$insert into public.tasks (id, household_id, name, client_key)
  values ('ck-task-rejeu', (select household_id from testkit.fx where key = 'home'),
          'Rejeu 2', '77777777-7777-4777-8777-777777777777')
  on conflict (household_id, client_key) do update
    set name = excluded.name$u$);

select testkit.eq(
  testkit.count($t$select 1 from public.tasks
                 where household_id = (select household_id from testkit.fx where key = 'home')
                   and client_key = '77777777-7777-4777-8777-777777777777'$t$),
  1::bigint, 'Test E : deux rejeux → toujours UNE seule ligne');

select testkit.eq(
  (select name from public.tasks
    where household_id = (select household_id from testkit.fx where key = 'home')
      and client_key = '77777777-7777-4777-8777-777777777777'),
  'Rejeu 2', 'Test E : la seconde écriture du rejeu a gagné');

rollback;
