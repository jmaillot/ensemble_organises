-- supabase/tests/0148_link_managed_child.sql
-- Fusion d'un enfant gere dans son compte (migration 0148, plan 25-04).
--
-- CE QUI EST VERIFIE :
-- (a) fusion nominale : traces reattribuees au compte (tache assignee,
--     completion avec actor, post auteur, message envoyeur, depense payeur,
--     anniversaire lie), ligne enfant supprimee, invariant 0145 applique ;
-- (b) collision : le compte deja assigne a la meme tache -> la fusion
--     reussit sans violation d'unicite (backstop A6), la trace du compte
--     est unique ;
-- (c) refus : D-18bis (ligne adulte 22023), D-22 (foyers differents 22023),
--     acteur hors foyer (42501), enfant archive (22023) ;
-- (d) rapport jsonb : compteurs d'origine, mesures avant ecriture.
--
-- PREUVE ROUGE : (a) sans le RPC (l'appel echoue) ; (b) sans la deduplication
-- A6 (23505) ; (c) sans les gardes (la fusion reussit la ou elle doit
-- refuser).
--
-- Bornes (AGENTS.md 2.7 D) : assertions portees par les ids du fixture
-- (cles t148-), jamais de total de table. Fichier autonome, rollback final.

begin;

-- L'invariant 0145 est applique avant la campagne (le dire plutot qu'echouer
-- plus bas sans cause).
select testkit.eq(
  (select count(*) from pg_catalog.pg_constraint
    where conname = 'chk_members_managed_child'
      and conrelid = 'public.household_members'::regclass),
  1::bigint,
  'l''invariant chk_members_managed_child de 0145 est applique');

-- ---------------------------------------------------------------------------
-- Semis (postgres) : Alice admin de A, Bob membre de A, Carol admin de B.
-- Noe, Paule, Sixtine : enfants geres de A (lignes directes, sans compte).
-- Victor : adulte de B, acteur du cas 42501.
-- ---------------------------------------------------------------------------
do $t148$
declare
  alice  uuid := testkit.auth_user('t148-alice@example.fr', 'Alice Cent Quarante Huit');
  bob    uuid := testkit.auth_user('t148-bob@example.fr', 'Bob Cent Quarante Huit');
  carol  uuid := testkit.auth_user('t148-carol@example.fr', 'Carol Cent Quarante Huit');
  victor uuid := testkit.auth_user('t148-victor@example.fr', 'Victor Cent Quarante Huit');
  home_a text := testkit.household(alice, 'Foyer Cent Quarante Huit A');
  home_b text := testkit.household(carol, 'Foyer Cent Quarante Huit B');
begin
  perform testkit.member(home_a, alice, 'Alice CQH', 'admin', 'accent');
  perform testkit.member(home_a, bob, 'Bob CQH', 'membre', 'ink');
  perform testkit.member(home_b, carol, 'Carol CQH', 'admin', 'violet');
  perform testkit.member(home_b, victor, 'Victor CQH', 'membre', 'coral');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Noe CQH', 'amber', 'enfant');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Paule CQH', 'coral', 'enfant');
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Sixtine CQH', 'ink', 'enfant');

  insert into testkit.fx (key, user_id) values
    ('t148-alice', alice), ('t148-bob', bob),
    ('t148-carol', carol), ('t148-victor', victor);
  insert into testkit.fx (key, household_id) values
    ('t148-home-a', home_a), ('t148-home-b', home_b);
end;
$t148$;

-- Resolution des lignes membres (postgres) : les enfants n'ont pas d'user_id.
insert into testkit.fx (key, row_id)
select 't148-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't148-alice');

insert into testkit.fx (key, row_id)
select 't148-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't148-bob');

insert into testkit.fx (key, row_id)
select 't148-carol_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-b')
   and m.user_id = (select user_id from testkit.fx where key = 't148-carol');

insert into testkit.fx (key, row_id)
select 't148-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-a')
   and m.display_name = 'Noe CQH';

insert into testkit.fx (key, row_id)
select 't148-paule_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-a')
   and m.display_name = 'Paule CQH';

insert into testkit.fx (key, row_id)
select 't148-sixtine_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't148-home-a')
   and m.display_name = 'Sixtine CQH';

select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t148-alice_m','t148-bob_m','t148-carol_m',
                               't148-noe_m','t148-paule_m','t148-sixtine_m')$q$),
  6::bigint,
  'les six lignes membres du fixture sont resolues');

-- ---------------------------------------------------------------------------
-- Semis des traces de Noe (postgres) : tache assignee, completion deleguee
-- (completed_by = actor = Noe), post auteur-Noe, message envoyeur-Noe,
-- depense payeur-Noe, anniversaire lie.
-- ---------------------------------------------------------------------------
do $t148$
declare
  v_home text;
  v_noe text;
  v_alice_m text;
begin
  select household_id into v_home from testkit.fx where key = 't148-home-a';
  select row_id into v_noe from testkit.fx where key = 't148-noe_m';
  select row_id into v_alice_m from testkit.fx where key = 't148-alice_m';

  insert into public.tasks (id, household_id, name, status, created_by)
  values ('t148-task', v_home, 'Tache de Noe', 'a_faire', v_alice_m);
  insert into public.task_assignees (task_id, member_id) values ('t148-task', v_noe);

  insert into public.routines (id, household_id, name, recurrence_rule, created_by)
  values ('t148-routine', v_home, 'Routine t148', 'FREQ=DAILY', v_alice_m);
  insert into public.routine_completions (id, routine_id, household_id, occurrence_date, completed_by, actor_member_id)
  values ('t148-completion', 't148-routine', v_home, current_date, v_noe, v_noe);

  insert into public.posts (id, household_id, author_id, text)
  values ('t148-post', v_home, v_noe, 'Message de Noe');

  insert into public.conversations (id, household_id, type, title)
  values ('t148-conv', v_home, 'groupe', 'Cercle t148');
  insert into public.conversation_members (conversation_id, member_id)
  values ('t148-conv', v_noe), ('t148-conv', v_alice_m);
  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values ('t148-msg', 't148-conv', v_home, v_noe, 'Coucou');

  -- Le monde 0055+ : toute dépense vit dans une ardoise ; le payeur doit en
  -- être membre (trigger validate_expense_payer, 0056).
  insert into public.ardoises (id, household_id, name, created_by)
  values ('t148-ardoise', v_home, 'Ardoise t148', v_alice_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('t148-ardoise', v_alice_m), ('t148-ardoise', v_noe);
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date, split_type)
  values ('t148-expense', v_home, 't148-ardoise', 'Glaces', 12.50, v_noe, current_date, 'egal');
  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values (private.new_id('expense-participant'), 't148-expense', 'membre', v_noe, 12.50);

  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
  values ('t148-bd', v_home, 'Noe CQH', date '2016-03-15', v_noe);
end;
$t148$;

-- ---------------------------------------------------------------------------
-- (d)+(a) Fusion nominale : Alice fusionne Noe dans sa propre ligne. Le
-- rapport rend les compteurs d'ORIGINE (mesures avant ecriture) ; les
-- assertions suivantes verifient le deplacement effectif des traces.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't148-alice'),
                       't148-alice@example.fr');
set local role authenticated;

do $t148$
declare
  v_report jsonb;
  v_alice_m text;
  v_noe_m text;
begin
  select row_id into v_alice_m from testkit.fx where key = 't148-alice_m';
  select row_id into v_noe_m from testkit.fx where key = 't148-noe_m';

  v_report := public.link_managed_child(v_noe_m, v_alice_m);

  perform testkit.eq((v_report ->> 'merged'), 'true',
    'le rapport annonce merged true');
  perform testkit.eq((v_report ->> 'child'), v_noe_m,
    'le rapport porte la ligne enfant fusionnee');
  perform testkit.eq((v_report ->> 'account'), v_alice_m,
    'le rapport porte la ligne compte');
  perform testkit.eq((v_report ->> 'task_assignees'), '1',
    'le rapport compte 1 assignation d''origine');
  perform testkit.eq((v_report ->> 'routine_completions'), '1',
    'le rapport compte 1 completion d''origine');
  perform testkit.eq((v_report ->> 'posts_author'), '1',
    'le rapport compte 1 post d''origine');
  perform testkit.eq((v_report ->> 'messages_sender'), '1',
    'le rapport compte 1 message d''origine');
  perform testkit.eq((v_report ->> 'expenses_paid_by'), '1',
    'le rapport compte 1 depense d''origine');
  perform testkit.eq((v_report ->> 'birthdays_linked'), '1',
    'le rapport compte 1 anniversaire d''origine');
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t148$
declare
  v_alice_m text;
  v_noe_m text;
begin
  select row_id into v_alice_m from testkit.fx where key = 't148-alice_m';
  select row_id into v_noe_m from testkit.fx where key = 't148-noe_m';

  perform testkit.eq(
    (select count(*) from public.task_assignees
      where task_id = 't148-task' and member_id = v_alice_m),
    1::bigint,
    'la tache de Noe est desormais assignee au compte Alice');
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where id = 't148-completion' and completed_by = v_alice_m
        and actor_member_id = v_alice_m),
    1::bigint,
    'la completion porte completed_by et actor_member_id du compte');
  perform testkit.eq(
    (select count(*) from public.posts where id = 't148-post' and author_id = v_alice_m),
    1::bigint,
    'le post de Noe est desormais signe du compte');
  perform testkit.eq(
    (select count(*) from public.messages where id = 't148-msg' and sender_id = v_alice_m),
    1::bigint,
    'le message de Noe est desormais envoye par le compte');
  perform testkit.eq(
    (select count(*) from public.expenses where id = 't148-expense' and paid_by = v_alice_m),
    1::bigint,
    'la depense de Noe est desormais payee par le compte');
  perform testkit.eq(
    (select count(*) from public.birthdays where id = 't148-bd' and linked_member_id = v_alice_m),
    1::bigint,
    'l''anniversaire lie pointe desormais vers le compte');
  perform testkit.eq(
    (select count(*) from public.conversation_members
      where conversation_id = 't148-conv' and member_id = v_alice_m),
    1::bigint,
    'la participation conversation est reattribuee au compte');
  perform testkit.eq(
    (select count(*) from public.household_members where id = v_noe_m),
    0::bigint,
    'la ligne enfant n''existe plus');
  perform testkit.eq(
    (select count(*) from pg_catalog.pg_constraint
      where conname = 'chk_members_managed_child'
        and conrelid = 'public.household_members'::regclass),
    1::bigint,
    'l''invariant 0145 reste applique apres la fusion');
end;
$t148$;

-- ---------------------------------------------------------------------------
-- (b) Collision : Paule (enfant) et Bob (compte) deja tous deux assignes a
--     la meme tache. Fusionner Paule dans Bob doit reussir sans 23505
--     (backstop A6) et laisser une seule trace, celle du compte.
-- ---------------------------------------------------------------------------
do $t148$
declare
  v_home text;
  v_bob_m text;
  v_paule_m text;
begin
  select household_id into v_home from testkit.fx where key = 't148-home-a';
  select row_id into v_bob_m from testkit.fx where key = 't148-bob_m';
  select row_id into v_paule_m from testkit.fx where key = 't148-paule_m';

  insert into public.tasks (id, household_id, name, status, created_by)
  values ('t148-task2', v_home, 'Tache collision', 'a_faire', v_bob_m);
  insert into public.task_assignees (task_id, member_id)
  values ('t148-task2', v_paule_m), ('t148-task2', v_bob_m);
end;
$t148$;

select testkit.as_user((select user_id from testkit.fx where key = 't148-bob'),
                       't148-bob@example.fr');
set local role authenticated;

do $t148$
declare
  v_bob_m text;
  v_paule_m text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't148-bob_m';
  select row_id into v_paule_m from testkit.fx where key = 't148-paule_m';

  perform public.link_managed_child(v_paule_m, v_bob_m);
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $t148$
declare
  v_bob_m text;
  v_paule_m text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't148-bob_m';
  select row_id into v_paule_m from testkit.fx where key = 't148-paule_m';

  perform testkit.eq(
    (select count(*) from public.task_assignees where task_id = 't148-task2'),
    1::bigint,
    'collision : une seule assignation reste (l''unique est preservee)');
  perform testkit.eq(
    (select count(*) from public.task_assignees
      where task_id = 't148-task2' and member_id = v_bob_m),
    1::bigint,
    'collision : la trace restante est celle du compte');
  perform testkit.eq(
    (select count(*) from public.household_members where id = v_paule_m),
    0::bigint,
    'collision : la ligne enfant Paule est supprimee');
end;
$t148$;

-- ---------------------------------------------------------------------------
-- (c) Refus, oracles SQLSTATE (forme 0051).
-- (c.1) D-18bis : cible adulte (Alice) fusionnee dans Bob -> 22023.
-- (c.2) D-22 : Sixtine (A) vers Carol (B), actrice Alice -> 22023.
-- (c.3) Acteur hors foyer : Victor (B) fusionne Sixtine (A) vers Bob (A)
--       -> 42501 (meme foyer : D-22 passe, can_write echoue).
-- (c.4) Enfant archive : deleted_at pose sur Sixtine -> 22023.
-- ---------------------------------------------------------------------------

-- (c.1)
select testkit.as_user((select user_id from testkit.fx where key = 't148-bob'),
                       't148-bob@example.fr');
set local role authenticated;

do $t148$
declare
  v_alice_m text;
  v_bob_m text;
  v_state text;
  v_msg text;
begin
  select row_id into v_alice_m from testkit.fx where key = 't148-alice_m';
  select row_id into v_bob_m from testkit.fx where key = 't148-bob_m';

  begin
    perform public.link_managed_child(v_alice_m, v_bob_m);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'ligne cible adulte : 22023 attendu (D-18bis), obtenu ' || v_state
    || ' — ' || coalesce(v_msg, 'aucune'));
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- (c.2)
select testkit.as_user((select user_id from testkit.fx where key = 't148-alice'),
                       't148-alice@example.fr');
set local role authenticated;

do $t148$
declare
  v_carol_m text;
  v_sixtine_m text;
  v_state text;
  v_msg text;
begin
  select row_id into v_carol_m from testkit.fx where key = 't148-carol_m';
  select row_id into v_sixtine_m from testkit.fx where key = 't148-sixtine_m';

  begin
    perform public.link_managed_child(v_sixtine_m, v_carol_m);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'compte hors du foyer de l''enfant : 22023 attendu (D-22), obtenu ' || v_state
    || ' — ' || coalesce(v_msg, 'aucune'));
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- (c.3)
select testkit.as_user((select user_id from testkit.fx where key = 't148-victor'),
                       't148-victor@example.fr');
set local role authenticated;

do $t148$
declare
  v_bob_m text;
  v_sixtine_m text;
  v_state text;
  v_msg text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't148-bob_m';
  select row_id into v_sixtine_m from testkit.fx where key = 't148-sixtine_m';

  begin
    perform public.link_managed_child(v_sixtine_m, v_bob_m);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '42501',
    'acteur hors du foyer de la ligne enfant : 42501 attendu, obtenu ' || v_state
    || ' — ' || coalesce(v_msg, 'aucune'));
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- (c.4) Sixtine est encore la (les fusions refusees ne suppriment pas la
-- ligne). On l'archive (postgres), puis Alice tente la fusion : 22023.
update public.household_members set deleted_at = now()
 where id = (select row_id from testkit.fx where key = 't148-sixtine_m');

select testkit.as_user((select user_id from testkit.fx where key = 't148-alice'),
                       't148-alice@example.fr');
set local role authenticated;

do $t148$
declare
  v_alice_m text;
  v_sixtine_m text;
  v_state text;
  v_msg text;
begin
  select row_id into v_alice_m from testkit.fx where key = 't148-alice_m';
  select row_id into v_sixtine_m from testkit.fx where key = 't148-sixtine_m';

  begin
    perform public.link_managed_child(v_sixtine_m, v_alice_m);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'enfant archive : 22023 attendu (is_managed_child faux), obtenu ' || v_state
    || ' — ' || coalesce(v_msg, 'aucune'));
end;
$t148$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

rollback;
