-- supabase/tests/0147_child_push_adults.sql
-- Redirection push D-23 (migration 0147, plan 25-04).
--
-- CE QUI EST VERIFIE :
-- (a) ancres litterales des definitions effectives : is_managed_child appele
--     sur la cible (attributed.member_id / a.linked_member_id), branches
--     role in (adultes), user_id is not null conserve globalement ;
-- (b) tache attribuee a un enfant gere -> TOUS les adultes du foyer
--     (comptage = nombre d'adultes avec compte, non archives), et eux seuls ;
-- (c) non-regression : tache attribuee a un adulte -> l'assignataire seul
--     (comportement 0019 inchangé) ;
-- (d) anniversaire lie a un enfant gere (days_until = 0) -> les adultes du
--     foyer ; non-regression : anniversaire lie a un adulte -> lui seul.
--
-- PREUVE ROUGE : (b)(d) sans les branches D-23 de 0147 - avant 0147, la tache
-- enfant ne produisait qu'une ligne (createur via coalesce), pas plusieurs ;
-- l'anniversaire lie a un enfant ne produisait AUCUNE ligne. (c) protege
-- contre une redirection trop large.
--
-- Les moities D-23 : la redirection (b)(d) et le zero destinataire enfant
-- (structurel : user_id is not null, prouve par le comptage + l'appartenance
-- des destinataires a l'ensemble des adultes).
--
-- Bornes (AGENTS.md 2.7 D) : assertions portees par les ids du fixture
-- (cles t147-), jamais de total de table. Fichier autonome, rollback final.
-- Ancres litterales : formes resistantes au deparse (2.7 D - jamais les
-- valeurs 'admin'/'membre' citees, que pg_get_functiondef peut recaster).

begin;

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin + Bob membre du foyer A (deux adultes, pour
-- prouver la pluralite des destinataires), Carol admin du foyer B (temoin
-- hors foyer). Noe : enfant gere du foyer A (role enfant, sans compte).
-- ---------------------------------------------------------------------------
do $t147$
declare
  alice uuid := testkit.auth_user('t147-alice@example.fr', 'Alice Cent Quarante Sept');
  bob   uuid := testkit.auth_user('t147-bob@example.fr', 'Bob Cent Quarante Sept');
  carol uuid := testkit.auth_user('t147-carol@example.fr', 'Carol Cent Quarante Sept');
  home_a text := testkit.household(alice, 'Foyer Cent Quarante Sept A');
  home_b text := testkit.household(carol, 'Foyer Cent Quarante Sept B');
begin
  perform testkit.member(home_a, alice, 'Alice CQS', 'admin', 'accent');
  perform testkit.member(home_a, bob, 'Bob CQS', 'membre', 'ink');
  perform testkit.member(home_b, carol, 'Carol CQS', 'admin', 'violet');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Noe CQS', 'amber', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t147-alice', alice), ('t147-bob', bob), ('t147-carol', carol);
  insert into testkit.fx (key, household_id) values
    ('t147-home-a', home_a), ('t147-home-b', home_b);
end;
$t147$;

-- Resolution des lignes membres (postgres) : les enfants n'ont pas d'user_id.
insert into testkit.fx (key, row_id)
select 't147-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't147-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't147-alice');

insert into testkit.fx (key, row_id)
select 't147-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't147-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't147-bob');

insert into testkit.fx (key, row_id)
select 't147-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't147-home-a')
   and m.display_name = 'Noe CQS';

-- Pre-assertions : les trois lignes membres sont resolues, Noe est un enfant gere.
select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t147-alice_m','t147-bob_m','t147-noe_m')$q$),
  3::bigint,
  'les trois lignes membres du fixture sont resolues');

do $t147$
declare
  v_noe text;
begin
  select row_id into v_noe from testkit.fx where key = 't147-noe_m';
  perform testkit.eq(private.is_managed_child(v_noe), true,
    'Noe est un enfant gere (precondition des scenarios D-23)');
end;
$t147$;

-- ---------------------------------------------------------------------------
-- (a) Ancres litterales des definitions effectives (2.7 D : on ancre sur les
--     formes du fichier de migration ; le deparse peut recaster, on evite les
--     fragments trop faibles).
-- ---------------------------------------------------------------------------
do $t147$
declare
  v_def_reminders text;
  v_def_birthdays text;
begin
  select pg_get_functiondef('private.push_reminder_notifications(timestamptz)'::regprocedure)
    into v_def_reminders;
  select pg_get_functiondef('private.push_birthday_notifications(timestamptz)'::regprocedure)
    into v_def_birthdays;

  perform testkit.ok(v_def_reminders like '%private.is_managed_child(attributed.member_id) is true%',
    'rappels de tache : la redirection D-23 teste le premier assignataire sans filtre de compte');
  perform testkit.ok(v_def_reminders like '%private.is_managed_child(e.created_by) is true%',
    'rappels d''evenement : la redirection D-23 teste le createur');
  perform testkit.ok(v_def_reminders like '%private.is_managed_child(r.created_by) is true%',
    'rappels de routine : la redirection D-23 teste le createur');
  perform testkit.ok(v_def_birthdays like '%private.is_managed_child(a.linked_member_id) is true%',
    'anniversaires : la redirection D-23 teste linked_member_id');
  perform testkit.ok(v_def_reminders like '%m.user_id is not null%'
                     and v_def_birthdays like '%m.user_id is not null%',
    'user_id is not null conserve globalement (zero destinataire enfant)');
end;
$t147$;

-- ---------------------------------------------------------------------------
-- (b) Tache attribuee a un enfant gere -> tous les adultes du foyer A.
-- ---------------------------------------------------------------------------
do $t147$
declare
  v_home text;
  v_noe text;
  v_alice_m text;
  v_task text := private.new_id('task');
begin
  select household_id into v_home from testkit.fx where key = 't147-home-a';
  select row_id into v_noe from testkit.fx where key = 't147-noe_m';
  select row_id into v_alice_m from testkit.fx where key = 't147-alice_m';

  insert into public.tasks (id, household_id, name, status, created_by)
  values (v_task, v_home, 'Tache enfant t147', 'a_faire', v_alice_m);
  insert into public.task_assignees (task_id, member_id) values (v_task, v_noe);
  insert into public.task_reminders (id, task_id, remind_at)
  values (private.new_id('task-reminder'), v_task, now() - interval '10 minutes');

  insert into testkit.fx (key, row_id) values ('t147-task-child', v_task);
end;
$t147$;

-- Les destinataires du rappel de CETTE tache : exactement les adultes du foyer A.
do $t147$
declare
  v_task_id text;
  v_adultes int;
  v_recus int;
begin
  select row_id into v_task_id from testkit.fx where key = 't147-task-child';

  select count(*)::int into v_adultes
    from public.household_members m
   where m.household_id = (select household_id from testkit.fx where key = 't147-home-a')
     and m.role in ('admin', 'membre')
     and m.user_id is not null
     and m.deleted_at is null;

  select count(*)::int into v_recus
    from private.push_reminder_notifications(now()) n
   where n.url = '/taches'
     and n.reminder_id in (select id from public.task_reminders where task_id = v_task_id);

  perform testkit.eq(v_recus, v_adultes,
    'tache enfant : un couple (destinataire, rappel) par adulte du foyer');

  perform testkit.eq(
    (select count(distinct n.user_id) from private.push_reminder_notifications(now()) n
      where n.url = '/taches'
        and n.reminder_id in (select id from public.task_reminders where task_id = v_task_id)
        and n.user_id not in (
          select m.user_id from public.household_members m
           where m.household_id = (select household_id from testkit.fx where key = 't147-home-a')
             and m.role in ('admin','membre') and m.user_id is not null)),
    0::bigint,
    'tache enfant : aucun destinataire hors adultes du foyer A (Carol exclue, enfant exclu)');
end;
$t147$;

-- ---------------------------------------------------------------------------
-- (c) Non-regression : tache attribuee a un adulte (Bob) -> l'assignataire
--     seul, pas le createur ni le foyer entier (comportement 0019).
-- ---------------------------------------------------------------------------
do $t147$
declare
  v_home text;
  v_bob_m text;
  v_alice_m text;
  v_task2 text := private.new_id('task');
begin
  select household_id into v_home from testkit.fx where key = 't147-home-a';
  select row_id into v_bob_m from testkit.fx where key = 't147-bob_m';
  select row_id into v_alice_m from testkit.fx where key = 't147-alice_m';

  insert into public.tasks (id, household_id, name, status, created_by)
  values (v_task2, v_home, 'Tache adulte t147', 'a_faire', v_alice_m);
  insert into public.task_assignees (task_id, member_id) values (v_task2, v_bob_m);
  insert into public.task_reminders (id, task_id, remind_at)
  values (private.new_id('task-reminder'), v_task2, now() - interval '5 minutes');

  perform testkit.eq(
    (select count(*) from private.push_reminder_notifications(now()) n
      where n.url = '/taches'
        and n.reminder_id in (select id from public.task_reminders where task_id = v_task2)),
    1::bigint,
    'tache adulte : un seul destinataire (comportement 0019 inchangé)');

  perform testkit.eq(
    (select n.user_id from private.push_reminder_notifications(now()) n
      where n.url = '/taches'
        and n.reminder_id in (select id from public.task_reminders where task_id = v_task2)
      limit 1),
    (select user_id from testkit.fx where key = 't147-bob'),
    'tache adulte : le destinataire est l''assignataire Bob');
end;
$t147$;

-- ---------------------------------------------------------------------------
-- (d) Anniversaire du jour lie a un enfant gere -> les adultes du foyer.
--     Anniversaire lie a un adulte -> lui seul (non-regression 0019).
-- ---------------------------------------------------------------------------
do $t147$
declare
  v_home text;
  v_noe_m text;
  v_bob_m text;
  v_alice uuid;
  v_bob uuid;
  v_carol uuid;
begin
  select household_id into v_home from testkit.fx where key = 't147-home-a';
  select row_id into v_noe_m from testkit.fx where key = 't147-noe_m';
  select row_id into v_bob_m from testkit.fx where key = 't147-bob_m';
  select user_id into v_alice from testkit.fx where key = 't147-alice';
  select user_id into v_bob from testkit.fx where key = 't147-bob';
  select user_id into v_carol from testkit.fx where key = 't147-carol';

  -- Anniversaire du jour : Noe (enfant gere). Le patron 0006 (make_date avec
  -- least(day, 28) pour les mois courts) — construction directe du jour J.
  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
  values ('t147-bd-noe', v_home, 'Noe CQS',
    make_date(extract(year from now() at time zone 'Europe/Paris')::int - 8,
              extract(month from now() at time zone 'Europe/Paris')::int,
              least(extract(day from now() at time zone 'Europe/Paris')::int, 28)),
    v_noe_m);

  -- Anniversaire du jour : Bob (adulte), temoin de non-regression.
  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
  values ('t147-bd-bob', v_home, 'Bob CQS',
    make_date(extract(year from now() at time zone 'Europe/Paris')::int - 36,
              extract(month from now() at time zone 'Europe/Paris')::int,
              least(extract(day from now() at time zone 'Europe/Paris')::int, 28)),
    v_bob_m);

  -- L'anniversaire de l'enfant produit exactement une ligne par adulte du foyer.
  perform testkit.eq(
    (select count(*) from private.push_birthday_notifications(now()) n
      where n.tag = 'anniversaire-t147-bd-noe'),
    (select count(*)::bigint from public.household_members m
      where m.household_id = v_home
        and m.role in ('admin','membre') and m.user_id is not null
        and m.deleted_at is null),
    'anniversaire enfant : annonce a chaque adulte du foyer');

  perform testkit.ok(
    exists (select 1 from private.push_birthday_notifications(now()) n
             where n.tag = 'anniversaire-t147-bd-noe' and n.user_id = v_alice)
    and exists (select 1 from private.push_birthday_notifications(now()) n
             where n.tag = 'anniversaire-t147-bd-noe' and n.user_id = v_bob),
    'anniversaire enfant : Alice ET Bob recoivent');
  perform testkit.ok(
    not exists (select 1 from private.push_birthday_notifications(now()) n
             where n.tag = 'anniversaire-t147-bd-noe' and n.user_id = v_carol),
    'anniversaire enfant : Carol (autre foyer) ne recoit pas');

  -- L'anniversaire de l'adulte reste adressé à l'adulte seul.
  perform testkit.eq(
    (select count(*) from private.push_birthday_notifications(now()) n
      where n.tag = 'anniversaire-t147-bd-bob' and n.user_id = v_bob),
    1::bigint,
    'anniversaire adulte : Bob recoit son annonce (non-regression 0019)');
  perform testkit.ok(
    not exists (select 1 from private.push_birthday_notifications(now()) n
             where n.tag = 'anniversaire-t147-bd-bob' and n.user_id = v_alice),
    'anniversaire adulte : Alice ne recoit pas celle de Bob');
end;
$t147$;

rollback;
