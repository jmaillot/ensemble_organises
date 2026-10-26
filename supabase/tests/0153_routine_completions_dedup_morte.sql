-- supabase/tests/0153_routine_completions_dedup_morte.sql
-- Suppression du self-join de déduplication mort sur routine_completions
-- (migration 0153, finding WR-03 de la revue de phase 25).
--
-- CE QUI EST VERIFIE :
-- (a) la contrainte routine_completions_unique_occurrence — c'est ELLE qui
--     rend le bloc mort : elle interdit deux lignes de même
--     (routine_id, occurrence_date), donc le self-join de 0149 ne pouvait
--     jamais matcher. L'assertion documente la cause, elle n'est pas une
--     tautologie : si la contrainte disparaissait, le commentaire de 0153
--     serait faux et ce test tomberait rouge ;
-- (b) preuve comportementale : la fusion d'un enfant porteur d'une
--     completion réussit SANS le bloc supprimé et la trace est bien
--     réattribuée au compte (completed_by ET actor_member_id).
--
-- PREUVE ROUGE : (b) échouait si la suppression du bloc avait cassé le
-- chemin de réattribution (23505 ou trace non déplacée). Une assertion qui
-- « exercerait » le bloc supprimé serait une tautologie (AGENTS §2.7-D.3) :
-- il ne pouvait de toute façon jamais rien supprimer.
--
-- Bornes (AGENTS.md 2.7 D) : assertions portées par les ids du fixture
-- (clés t153-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- ---------------------------------------------------------------------------
-- (a) La contrainte porte la raison de la suppression.
-- ---------------------------------------------------------------------------
select testkit.eq(
  (select count(*) from pg_catalog.pg_constraint
    where conname = 'routine_completions_unique_occurrence'
      and conrelid = 'public.routine_completions'::regclass),
  1::bigint,
  'la contrainte routine_completions_unique_occurrence est appliquée (0003)');

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A, Bob membre de A ; Noe, enfant géré.
-- ---------------------------------------------------------------------------
do $t153$
declare
  alice uuid := testkit.auth_user('t153-alice@example.fr', 'Alice Cent Cinquante Trois');
  bob   uuid := testkit.auth_user('t153-bob@example.fr', 'Bob Cent Cinquante Trois');
  home  text := testkit.household(alice, 'Foyer Cent Cinquante Trois');
begin
  perform testkit.member(home, alice, 'Alice CCT', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob CCT', 'membre', 'ink');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home, null, 'Noe CCT', 'amber', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t153-alice', alice), ('t153-bob', bob);
  insert into testkit.fx (key, household_id) values ('t153-home', home);
end;
$t153$;

insert into testkit.fx (key, row_id)
select 't153-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't153-home')
   and m.user_id = (select user_id from testkit.fx where key = 't153-alice');

insert into testkit.fx (key, row_id)
select 't153-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't153-home')
   and m.user_id = (select user_id from testkit.fx where key = 't153-bob');

insert into testkit.fx (key, row_id)
select 't153-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't153-home')
   and m.display_name = 'Noe CCT';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t153-alice_m','t153-bob_m','t153-noe_m')$q$),
  3::bigint,
  'les trois lignes membres du fixture sont résolues');

-- ---------------------------------------------------------------------------
-- Semis : une routine dont Noe a coché l'occurrence du jour (completed_by ET
-- actor_member_id = Noe, forme déléguée D-08). Le compte n'a PAS de
-- completion ce jour-là — et ne peut pas en avoir : la contrainte 0003
-- l'interdirait, c'est précisément pourquoi le bloc supprimé était mort.
-- ---------------------------------------------------------------------------
do $t153$
declare
  v_home text;
  v_bob_m text;
  v_noe_m text;
begin
  select household_id into v_home from testkit.fx where key = 't153-home';
  select row_id into v_bob_m from testkit.fx where key = 't153-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't153-noe_m';

  insert into public.routines (id, household_id, name, recurrence_rule, created_by)
  values ('t153-routine', v_home, 'Routine CCT', 'FREQ=DAILY', v_bob_m);
  insert into public.routine_completions (id, routine_id, household_id, occurrence_date, completed_by, actor_member_id)
  values ('t153-completion', 't153-routine', v_home, current_date, v_noe_m, v_noe_m);
end;
$t153$;

-- ---------------------------------------------------------------------------
-- (b) Fusion Noe -> Bob sans le bloc supprimé : la réattribution passe et
--     la trace suit le compte.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't153-bob'),
                       't153-bob@example.fr');
set local role authenticated;

do $t153$
declare
  v_report jsonb;
  v_bob_m text;
  v_noe_m text;
  v_state text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't153-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't153-noe_m';

  begin
    v_report := public.link_managed_child(v_noe_m, v_bob_m);
    v_state := v_report ->> 'merged';
  exception
    when others then
      v_state := sqlstate || ':' || sqlerrm;
  end;

  perform testkit.eq(v_state, 'true',
    'fusion avec completion déléguée : merged true, sans le bloc supprimé');
  perform testkit.eq((v_report ->> 'routine_completions'), '1',
    'le rapport compte 1 completion d''origine');
end;
$t153$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t153$
declare
  v_bob_m text;
  v_noe_m text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't153-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't153-noe_m';

  perform testkit.eq(
    (select count(*) from public.routine_completions
      where id = 't153-completion' and completed_by = v_bob_m
        and actor_member_id = v_bob_m),
    1::bigint,
    'la completion porte completed_by et actor_member_id du compte');
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where routine_id = 't153-routine' and occurrence_date = current_date),
    1::bigint,
    'une seule occurrence reste pour (routine, jour) — la contrainte est respectée');
  perform testkit.eq(
    (select count(*) from public.household_members where id = v_noe_m),
    0::bigint,
    'la ligne enfant Noe est supprimée');
end;
$t153$;

rollback;
