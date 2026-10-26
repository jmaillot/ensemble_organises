-- supabase/tests/0150_household_members_delete_durci.sql
-- CR-01 (relecture phase 25) : la politique `household_members_delete`
-- (0150) refuse le DELETE direct d'une ligne enfant gérée.
--
-- CE QUI EST VERIFIE :
-- (a) un admin ne supprime PAS une ligne role='enfant' par DELETE direct :
--     zéro ligne affectée, la ligne existe toujours (D-04 : l'historique ne
--     peut pas être purgé en cascade) ;
-- (b) la garde ne sur-bloque pas : un admin retire toujours un membre ADULTE
--     (chemin prouvé 0002:539, rejoué ici pour un enfant précisément exclu)
--     et le dernier administrateur reste protégé ;
-- (c) la politique porte bien la clause `role <> 'enfant'` (pg_policy).
--
-- PREUVE ROUGE : (a) sans la clause 0150, le DELETE de l'admin touche la
-- ligne enfant (1 ligne affectée) et les cascades purgent ses traces ; (c)
-- sans la migration, pg_policy ne montre pas la clause.
--
-- Bornes (AGENTS.md 2.7 D) : assertions portées par les ids du fixture
-- (clés t150-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- (c) Preuve structurelle : la politique en base contient bien la clause.
-- pg_get_expr sur la définition de la politique (qualdef du catalogue — la
-- source de vérité est la base, pas le fichier).
-- ---------------------------------------------------------------------------
select testkit.ok(
  (select pg_get_expr(polqual, polrelid)
     from pg_catalog.pg_policy pol
    where polrelid = 'public.household_members'::regclass
      and polname = 'household_members_delete'
      and polcmd = 'd') like '%enfant%',
  'la politique household_members_delete vise bien le rôle enfant (clause 0150 présente)');

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A, Bob membre adulte de A,
-- Léa enfant gérée de A (ligne directe, sans compte). Léa porte des traces
-- (tâche assignée, post auteur) que (a) doit laisser intactes.
-- ---------------------------------------------------------------------------
do $t150$
declare
  alice  uuid := testkit.auth_user('t150-alice@example.fr', 'Alice Cent Cinquante');
  bob    uuid := testkit.auth_user('t150-bob@example.fr', 'Bob Cent Cinquante');
  home_a text := testkit.household(alice, 'Foyer Cent Cinquante');
begin
  perform testkit.member(home_a, alice, 'Alice CQ', 'admin', 'accent');
  perform testkit.member(home_a, bob, 'Bob CQ', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Lea CQ', 'coral', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t150-alice', alice), ('t150-bob', bob);
  insert into testkit.fx (key, household_id) values ('t150-home-a', home_a);
end;
$t150$;

-- Résolution des lignes membres (postgres).
insert into testkit.fx (key, row_id)
select 't150-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't150-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't150-alice');

insert into testkit.fx (key, row_id)
select 't150-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't150-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't150-bob');

insert into testkit.fx (key, row_id)
select 't150-lea_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't150-home-a')
   and m.display_name = 'Lea CQ';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t150-alice_m','t150-bob_m','t150-lea_m')$q$),
  3::bigint,
  'les trois lignes membres du fixture sont résolues');

-- Semis des traces de Léa (postgres) : ce que le DELETE direct aurait purgé.
do $t150$
declare
  v_home text;
  v_lea text;
  v_alice_m text;
begin
  select household_id into v_home from testkit.fx where key = 't150-home-a';
  select row_id into v_lea from testkit.fx where key = 't150-lea_m';
  select row_id into v_alice_m from testkit.fx where key = 't150-alice_m';

  insert into public.tasks (id, household_id, name, status, created_by)
  values ('t150-task', v_home, 'Tache de Lea', 'a_faire', v_alice_m);
  insert into public.task_assignees (task_id, member_id) values ('t150-task', v_lea);

  insert into public.posts (id, household_id, author_id, text)
  values ('t150-post', v_home, v_lea, 'Message de Lea');
end;
$t150$;

-- ---------------------------------------------------------------------------
-- (a) Alice (admin) tente le DELETE direct de la ligne enfant : la RLS rend
-- la ligne invisible → zéro ligne affectée, sans erreur. Ligne ET traces
-- intacts (D-04).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't150-alice'),
                       't150-alice@example.fr');
set local role authenticated;

select testkit.eq(
  testkit.affected(format(
    'delete from public.household_members where id = %L',
    (select row_id from testkit.fx where key = 't150-lea_m'))),
  0::bigint,
  'le DELETE direct de la ligne enfant ne touche aucune ligne');

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t150$
begin
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = (select row_id from testkit.fx where key = 't150-lea_m')),
    1::bigint,
    'la ligne enfant existe toujours après le DELETE refusé');
  perform testkit.eq(
    (select count(*) from public.task_assignees
      where task_id = 't150-task'
        and member_id = (select row_id from testkit.fx where key = 't150-lea_m')),
    1::bigint,
    'l''assignation de Léa n''a pas été purgée (D-04)');
  perform testkit.eq(
    (select count(*) from public.posts
      where id = 't150-post'
        and author_id = (select row_id from testkit.fx where key = 't150-lea_m')),
    1::bigint,
    'le post de Léa n''a pas été purgé (D-04)');
end;
$t150$;

-- ---------------------------------------------------------------------------
-- (b) La garde ne sur-bloque pas : le retrait du membre adulte Bob passe
-- toujours (1 ligne affectée), dernier admin toujours protégé.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't150-alice'),
                       't150-alice@example.fr');
set local role authenticated;

select testkit.eq(
  testkit.affected(format(
    'delete from public.household_members where id = %L',
    (select row_id from testkit.fx where key = 't150-bob_m'))),
  1::bigint,
  'le retrait du membre adulte Bob passe toujours (0150 ne sur-bloque pas)');

select testkit.eq(
  testkit.affected(format(
    'delete from public.household_members where id = %L',
    (select row_id from testkit.fx where key = 't150-alice_m'))),
  0::bigint,
  'le dernier administrateur reste protégé (clause inchangée)');

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

rollback;
