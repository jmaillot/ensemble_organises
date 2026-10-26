-- supabase/tests/0146_child_behavior_guards.sql
-- Gardes de comportement des enfants gérés (migration 0146, plan 25-03).
--
-- CE QUI EST VÉRIFIÉ :
-- (a)  helpers : is_managed_child vrai sur un enfant géré actif, faux sur un
--      adulte et sur un enfant ARCHIVÉ ; managed_child_module_allowed lit le
--      socle de la ligne (vrai 'taches', faux 'messages') ;
-- (b)  RPC de fiche D-01 : création par un membre simple non-admin (D-03 :
--      tout adulte), ligne role='enfant' user_id null socle D-06 ; archivage
--      par un membre simple : deleted_at posé, ligne et invariant 0145
--      intacts ; update sur ligne ADULTE refusé 22023 ; clés hors périmètre
--      ('ardoise', 'cadeaux') refusées 22023 ; activation 'messages' puis
--      retour socle ;
-- (c)  garde d'assignation : replace_task_assignees / replace_routine_assignees
--      refusent (42501) un enfant hors de SES modules, admin inclus (T-25-07) ;
--      succès sur le socle ;
-- (d)  assigned_by_member_id posé depuis la session ;
-- (e)  complete_routine_occurrence : délégation adulte→enfant (completed_by =
--      l'enfant, actor_member_id = l'adulte), re-complétion sans duplication
--      (upsert sur (routine_id, occurrence_date)), D-13 adulte→adulte 42501,
--      hors-module 'routines' 42501 (T-25-08) ;
-- (f)  Cercle D-12 : un membre simple non-auteur ET l'admin suppriment un
--      contenu d'enfant ; le contenu d'un adulte n'est pas couvert par la
--      3e branche (T-25-09) ;
-- (g)  D-06 conversations : create_conversation refuse 22023 un enfant
--      hors-module 'messages', succès après activation, l'ajout direct hors
--      RPC est refusé par la politique (T-25-16) ;
-- (h)  D-06 birthdays : lier un enfant hors-module 'anniversaires' refusé
--      22023, l'enfant socle se lie ;
-- (i)  meal_entries : un enfant hors-module 'menu' est retiré silencieusement
--      de member_ids, l'enfant socle est conservé ;
-- (j)  colonnes d'acteur en text (information_schema).
--
-- PREUVE ROUGE : (a) sans les helpers 0146 ; (b) sans les RPC de fiche ;
-- (c) sans les gardes de module des replace_* ; (d) sans la colonne ni son
-- écriture ; (e) sans le RPC D-08/D-13 ; (f) sans la 3e branche DELETE ;
-- (g) sans les clauses conversation ; (h) sans le déclencheur birthdays ;
-- (i) sans le déclencheur meal_entries.
--
-- Bornes (AGENTS.md §2.7 D) : assertions portées par les ids du fixture
-- (clés t146-), jamais de total de table. Oracles SQLSTATE forme 0145
-- (begin/exception + testkit.ok sur SQLSTATE). Fichier autonome, rollback
-- final.

begin;

-- ---------------------------------------------------------------------------
-- Sémis (postgres) : Alice admin de A, Bob membre de A (non-admin : D-03
-- « tout adulte » est PROUVÉ, pas supposé), Carol admin du foyer B (témoin
-- hors foyer). Enfants gérés semés comme lignes directes (role='enfant',
-- user_id null — l'invariant 0145 l'exige) :
--   Noé : socle D-06 complet ;
--   Lila : socle privé de 'menu' (scénario meal_entries et refus divers).
-- ---------------------------------------------------------------------------
do $t146$
declare
  alice uuid := testkit.auth_user('t146-alice@example.fr', 'Alice Cent Quarante Six');
  bob   uuid := testkit.auth_user('t146-bob@example.fr', 'Bob Cent Quarante Six');
  carol uuid := testkit.auth_user('t146-carol@example.fr', 'Carol Cent Quarante Six');
  home_a text := testkit.household(alice, 'Foyer Cent Quarante Six A');
  home_b text := testkit.household(carol, 'Foyer Cent Quarante Six B');
begin
  perform testkit.member(home_a, alice, 'Alice CQS', 'admin', 'accent');
  perform testkit.member(home_a, bob, 'Bob CQS', 'membre', 'ink');
  perform testkit.member(home_b, carol, 'Carol CQS', 'admin', 'violet');

  -- Enfant géré n°1 : socle D-06 par défaut.
  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role)
  values (private.new_id('member'), home_a, null, 'Noé CQS', 'amber', 'enfant');

  insert into public.household_members (id, household_id, user_id, display_name, color_tag, role, managed_modules)
  values (
    private.new_id('member'), home_a, null, 'Lila CQS', 'coral', 'enfant',
    '{taches,routines,anniversaires}'::text[]
  );

  insert into testkit.fx (key, user_id) values
    ('t146-alice', alice), ('t146-bob', bob), ('t146-carol', carol);
  insert into testkit.fx (key, household_id) values
    ('t146-home-a', home_a), ('t146-home-b', home_b);
end;
$t146$;

-- Résolution des lignes membres (postgres) : les enfants n'ont pas d'user_id.
insert into testkit.fx (key, row_id)
select 't146-alice_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't146-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't146-alice');

insert into testkit.fx (key, row_id)
select 't146-bob_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't146-home-a')
   and m.user_id = (select user_id from testkit.fx where key = 't146-bob');

insert into testkit.fx (key, row_id)
select 't146-noe_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't146-home-a')
   and m.display_name = 'Noé CQS';

insert into testkit.fx (key, row_id)
select 't146-lila_m', m.id from public.household_members m
 where m.household_id = (select household_id from testkit.fx where key = 't146-home-a')
   and m.display_name = 'Lila CQS';

-- Pré-assertions : les quatre lignes membres sont résolues.
select testkit.eq(
  testkit.count($q$select 1 from testkit.fx
                 where key in ('t146-alice_m','t146-bob_m','t146-noe_m','t146-lila_m')$q$),
  4::bigint,
  'les quatre lignes membres du fixture sont résolues');

-- ---------------------------------------------------------------------------
-- (j) Colonnes d'acteur en text (information_schema, sous postgres).
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_tasks text;
  v_rc text;
begin
  select data_type into v_tasks
    from information_schema.columns
   where table_schema = 'public' and table_name = 'tasks'
     and column_name = 'assigned_by_member_id';
  select data_type into v_rc
    from information_schema.columns
   where table_schema = 'public' and table_name = 'routine_completions'
     and column_name = 'actor_member_id';

  perform testkit.ok(v_tasks = 'text',
    'tasks.assigned_by_member_id est en text, obtenu ' || coalesce(v_tasks, '<null>'));
  perform testkit.ok(v_rc = 'text',
    'routine_completions.actor_member_id est en text, obtenu ' || coalesce(v_rc, '<null>'));
end;
$t146$;

-- ---------------------------------------------------------------------------
-- (a) Helpers observés sous postgres (security definer : vérité de table).
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_noe text;
  v_lila text;
  v_alice_m text;
begin
  select row_id into v_noe from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila from testkit.fx where key = 't146-lila_m';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  perform testkit.eq(private.is_managed_child(v_noe), true,
    'Noé (role enfant, sans compte, non archivé) est un enfant géré');
  perform testkit.eq(private.is_managed_child(v_alice_m), false,
    'Alice (admin) n''est pas un enfant géré');

  -- Enfant ARCHIVÉ : la marque deleted_at le sort de toutes les gardes (D-04).
  update public.household_members set deleted_at = now() where id = v_lila;
  perform testkit.eq(private.is_managed_child(v_lila), false,
    'Lila archivée n''est plus un enfant géré');
  perform testkit.eq(private.managed_child_module_allowed(v_lila, 'taches'), false,
    'Lila archivée : aucun module ouvert (hors gardes)');

  -- Réactivation pour la suite.
  update public.household_members set deleted_at = null where id = v_lila;

  perform testkit.eq(private.managed_child_module_allowed(v_noe, 'taches'), true,
    'Noé : le socle inclut taches');
  perform testkit.eq(private.managed_child_module_allowed(v_noe, 'messages'), false,
    'Noé : messages hors socle → faux');
end;
$t146$;

-- ---------------------------------------------------------------------------
-- (b) RPC de fiche D-01 — sous Bob (membre simple, non-admin) : la D-03
-- « tout adulte du foyer » est prouvée, pas supposée.
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;

do $t146$
declare
  v_out jsonb;
  v_new_m text;
  v_noe_m text;
  v_alice_m text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  -- Création par un membre simple (D-03).
  v_out := public.create_managed_child_profile(
    (select household_id from testkit.fx where key = 't146-home-a'),
    'Théo CQS',
    'amber'
  );
  v_new_m := v_out ->> 'id';
  insert into testkit.fx (key, row_id) values ('t146-theo_m', v_new_m);

  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_new_m
        and role = 'enfant'
        and user_id is null
        and managed_modules = '{taches,routines,anniversaires,menu}'::text[]),
    1::bigint,
    'la fiche créée par un membre simple porte role enfant, sans compte, socle D-06');

  -- Archivage par un membre simple (D-04 : marque, pas delete).
  perform public.archive_managed_child_profile(v_new_m);

  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_new_m
        and deleted_at is not null
        and role = 'enfant'
        and user_id is null),
    1::bigint,
    'l''archivage par un membre simple pose deleted_at sans supprimer la ligne');

  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_new_m
        and (user_id is null) = (role = 'enfant')),
    1::bigint,
    'l''invariant 0145 reste vrai sur la fiche archivée');

  -- Oracles 22023 : fiche adulte ; clés hors périmètre gardé.
  begin
    perform public.update_managed_child_profile(v_alice_m, 'Nouveau Nom', null, null, null, false, null);
    perform testkit.ok(false, 'la fiche d''un adulte n''est pas éditable par ce RPC');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023',
      'fiche adulte : 22023 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;

  begin
    perform public.update_managed_child_profile(v_noe_m, null, null, null, null, false, array['ardoise']);
    perform testkit.ok(false, 'ardoise n''est pas activable sur une fiche enfant');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023',
      'module hors périmètre (ardoise) : 22023 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;

  begin
    perform public.update_managed_child_profile(v_noe_m, null, null, null, null, false, array['cadeaux']);
    perform testkit.ok(false, 'cadeaux n''est pas activable sur une fiche enfant');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023',
      'cadeaux hors périmètre : 22023 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;

  -- Activation 'messages' (succès), puis retour au socle.
  perform public.update_managed_child_profile(v_noe_m, null, null, null, null, false, array['taches','messages']);
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_noe_m and managed_modules = array['taches','messages']::text[]),
    1::bigint,
    'après activation explicite, la fiche porte taches + messages');

  -- Retour socle : le tableau null remet managed_modules inchangé — on pose
  -- le socle explicitement (le RPC refuse les clés hors périmètre, pas le
  -- socle lui-même).
  perform public.update_managed_child_profile(v_noe_m, null, null, null, null, false,
    array['taches','routines','anniversaires','menu']);
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_noe_m
        and managed_modules = '{taches,routines,anniversaires,menu}'::text[]),
    1::bigint,
    'retour au socle D-06');
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (c)+(d) Garde d'assignation + assigned_by_member_id. Semis (postgres) des
-- objets parents, puis oracles sous les acteurs.
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_home_a text;
  v_alice_m text;
begin
  select household_id into v_home_a from testkit.fx where key = 't146-home-a';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  insert into public.tasks (id, household_id, name, created_by)
  values ('t146-task', v_home_a, 'Tâche t146', v_alice_m);
  insert into public.routines (id, household_id, name, created_by)
  values ('t146-routine', v_home_a, 'Routine t146', v_alice_m);
end;
$t146$;

-- L'admin retire 'taches' à Lila (socle Lila : taches, routines,
-- anniversaires — sans menu).
select testkit.as_user((select user_id from testkit.fx where key = 't146-alice'), 't146-alice@example.fr');
set local role authenticated;
do $t146$
declare
  v_lila_m text;
begin
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';
  perform public.update_managed_child_profile(v_lila_m, null, null, null, null, false,
    array['routines','anniversaires']);
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = v_lila_m and managed_modules = array['routines','anniversaires']::text[]),
    1::bigint,
    'Lila : taches retiré de sa fiche (préparation du scénario de refus)');
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- Bob (membre simple) : succès socle tâche + colonne d'acteur, refus
-- hors-module.
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;

do $t146$
declare
  v_noe_m text;
  v_lila_m text;
  v_count integer;
begin
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';

  -- Succès : Noé (socle) est assignable sur taches.
  v_count := public.replace_task_assignees('t146-task', array[v_noe_m]);
  perform testkit.eq(v_count, 1, 'assignation tâche du socle acceptée');

  -- (d) assigned_by_member_id porte la ligne membre de Bob.
  perform testkit.eq(
    (select count(*) from public.tasks
      where id = 't146-task'
        and assigned_by_member_id = (select row_id from testkit.fx where key = 't146-bob_m')),
    1::bigint,
    'assigned_by_member_id porte la ligne membre de Bob (acteur résolu depuis la session)');

  -- Refus : Lila sans 'taches' → 42501 (T-25-07).
  begin
    perform public.replace_task_assignees('t146-task', array[v_lila_m]);
    perform testkit.ok(false, 'Lila sans taches n''est pas assignable');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'tâche hors-module (membre) : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- L'admin lui-même est refusé : un admin ne contourne pas le choix de la
-- fiche (T-25-07).
select testkit.as_user((select user_id from testkit.fx where key = 't146-alice'), 't146-alice@example.fr');
set local role authenticated;
do $t146$
declare
  v_lila_m text;
  v_noe_m text;
  v_count integer;
begin
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';

  begin
    perform public.replace_task_assignees('t146-task', array[v_lila_m]);
    perform testkit.ok(false, 'un admin ne contourne pas le choix de la fiche');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'tâche hors-module (admin inclus) : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;

  -- Succès routines : Noé socle est assignable.
  v_count := public.replace_routine_assignees('t146-routine', array[v_noe_m]);
  perform testkit.eq(v_count, 1, 'assignation routine du socle acceptée');

  -- Refus routines : Lila garde encore 'routines' — on la prive d'abord
  -- (l'admin peut : fiche oblige), puis le refus est prouvé.
  perform public.update_managed_child_profile(v_lila_m, null, null, null, null, false,
    array['anniversaires']);
  begin
    perform public.replace_routine_assignees('t146-routine', array[v_lila_m]);
    perform testkit.ok(false, 'Lila sans routines n''est pas assignable');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'routine hors-module : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (e) complete_routine_occurrence : D-08/D-13/ENF-03. Bob (membre simple)
-- coche pour Noé (socle 'routines').
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;

do $t146$
declare
  v_out jsonb;
  v_noe_m text;
  v_lila_m text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';

  -- Délégation adulte→enfant (D-08) : Noé socle est cochable.
  v_out := public.complete_routine_occurrence('t146-routine', date '2026-10-25', v_noe_m);

  perform testkit.eq(
    (select count(*) from public.routine_completions
      where routine_id = 't146-routine'
        and occurrence_date = date '2026-10-25'
        and completed_by = v_noe_m
        and actor_member_id = (select row_id from testkit.fx where key = 't146-bob_m')
        and status = 'fait'),
    1::bigint,
    'délégation adulte→enfant : completed_by = l''enfant, actor_member_id = l''adulte (ENF-03)');

  -- Re-complétion : pas de duplication (upsert sur la contrainte réelle).
  v_out := public.complete_routine_occurrence('t146-routine', date '2026-10-25', v_noe_m);
  perform testkit.eq(
    testkit.count($q$select 1 from public.routine_completions
                   where routine_id = 't146-routine'
                     and occurrence_date = date '2026-10-25'$q$),
    1::bigint,
    'la re-complétion ne duplique pas (upsert sur (routine_id, occurrence_date))');

  -- D-13 : adulte → autre adulte refusé 42501.
  begin
    perform public.complete_routine_occurrence('t146-routine', date '2026-10-26', (select row_id from testkit.fx where key = 't146-alice_m'));
    perform testkit.ok(false, 'on ne coche pas au nom d''un autre adulte (D-13)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'D-13 adulte→adulte : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;

  -- Enfant hors-module 'routines' refusé : Lila (fiche réduite à
  -- 'anniversaires').
  begin
    perform public.complete_routine_occurrence('t146-routine', date '2026-10-27', v_lila_m);
    perform testkit.ok(false, 'un enfant hors routines n''est pas cochable');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'complétion hors-module : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (f) Cercle D-12 : modération adulte du contenu enfant. Semis sous postgres
-- — un enfant ne publie jamais (pas de session), les lignes d'enfant sont
-- donc semées directement (forme 0051).
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_home_a text;
  v_noe_m text;
  v_bob_m text;
  v_alice_m text;
begin
  select household_id into v_home_a from testkit.fx where key = 't146-home-a';
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_bob_m from testkit.fx where key = 't146-bob_m';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  insert into public.posts (id, household_id, author_id, text)
  values ('t146-post-enfant', v_home_a, v_noe_m, 'Post de l''enfant t146'),
         ('t146-post-adulte', v_home_a, v_alice_m, 'Post d''Alice t146');
  insert into public.post_comments (id, post_id, household_id, author_id, content)
  values ('t146-comment-enfant', 't146-post-adulte', v_home_a, v_noe_m, 'Commentaire enfant t146');
  insert into public.post_reactions (id, post_id, household_id, author_id)
  values ('t146-reaction-enfant', 't146-post-adulte', v_home_a, v_noe_m);
end;
$t146$;

-- Bob (membre simple, non-auteur du post enfant) supprime le post de
-- l'enfant — la 3e branche est pour les MEMBRES aussi (D-12).
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;
do $t146$
begin
  delete from public.posts where id = 't146-post-enfant';
  perform testkit.eq(
    testkit.count($q$select 1 from public.posts where id = 't146-post-enfant'$q$),
    0::bigint,
    'un membre simple modère le post d''un enfant (D-12, branche 3)');

  -- Le contenu ADULTE (post d'Alice) n'est pas couvert par la 3e branche :
  -- Bob n'est ni l'auteur, ni l'admin, et Alice n'est pas un enfant — le
  -- DELETE filtré par la RLS ne lève pas : il ne touche aucune ligne
  -- (affected = 0, forme 0051/0144 ; une erreur prouverait autre chose).
  perform testkit.eq(
    testkit.affected($q$delete from public.posts where id = 't146-post-adulte'$q$),
    0::bigint,
    'le post d''un adulte n''est pas modérable par un membre non-auteur (0 ligne, filtré par la RLS)');
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- L'admin modère aussi le commentaire et la réaction de l'enfant.
select testkit.as_user((select user_id from testkit.fx where key = 't146-alice'), 't146-alice@example.fr');
set local role authenticated;
do $t146$
begin
  delete from public.post_comments where id = 't146-comment-enfant';
  perform testkit.eq(
    testkit.count($q$select 1 from public.post_comments where id = 't146-comment-enfant'$q$),
    0::bigint,
    'l''admin modère le commentaire d''un enfant (D-12)');

  delete from public.post_reactions where id = 't146-reaction-enfant';
  perform testkit.eq(
    testkit.count($q$select 1 from public.post_reactions where id = 't146-reaction-enfant'$q$),
    0::bigint,
    'l''admin modère la réaction d''un enfant (D-12)');

  -- L'admin supprime le contenu adulte (branche admin inchangée) :
  -- preuve symétrique de la modération (l'admin passe par la 2e branche).
  perform testkit.eq(
    testkit.affected($q$delete from public.posts where id = 't146-post-adulte'$q$),
    1::bigint,
    'l''admin supprime le contenu adulte (branche admin inchangée)');
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (g) D-06 conversations : create_conversation refuse un enfant hors-module
-- 'messages'. Noé est revenu au socle (sans 'messages') en (b).
-- ---------------------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;
do $t146$
declare
  v_noe_m text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';

  begin
    perform public.create_conversation(
      (select household_id from testkit.fx where key = 't146-home-a'),
      'direct', null, to_jsonb(array[v_noe_m]));
    perform testkit.ok(false, 'un enfant hors messages n''entre pas dans une conversation');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023',
      'conversation hors messages : 22023 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- L'admin ouvre 'messages' sur Noé.
select testkit.as_user((select user_id from testkit.fx where key = 't146-alice'), 't146-alice@example.fr');
set local role authenticated;
do $t146$
declare
  v_noe_m text;
begin
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  perform public.update_managed_child_profile(v_noe_m, null, null, null, null, false,
    array['taches','routines','messages','anniversaires','menu']);
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- Création de conversation incluant Noé : succès. L'ajout direct hors RPC
-- d'un enfant hors-module (Lila) est refusé par la politique
-- conversation_members_insert.
select testkit.as_user((select user_id from testkit.fx where key = 't146-bob'), 't146-bob@example.fr');
set local role authenticated;
do $t146$
declare
  v_bob_m text;
  v_noe_m text;
  v_lila_m text;
  v_conv text;
begin
  select row_id into v_bob_m from testkit.fx where key = 't146-bob_m';
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';

  v_conv := (public.create_conversation(
    (select household_id from testkit.fx where key = 't146-home-a'),
    'direct', null, to_jsonb(array[v_bob_m, v_noe_m]))) ->> 'id';

  perform testkit.eq(
    testkit.count(
      format('select 1 from public.conversation_members where conversation_id = %L', v_conv)),
    2::bigint,
    'la conversation créée compte 2 participants (Bob + Noé)');

  perform testkit.eq(
    testkit.count(
      format('select 1 from public.conversation_members where conversation_id = %L and member_id = %L',
             v_conv, v_noe_m)),
    1::bigint,
    'l''enfant activé messages est bien participant');

  -- Ajout direct hors RPC : Lila (sans 'messages') → le WITH CHECK de la
  -- politique refuse (RLS : erreur, pas filtre, sur INSERT).
  begin
    insert into public.conversation_members (conversation_id, member_id)
    values (v_conv, v_lila_m);
    perform testkit.ok(false, 'l''ajout direct d''un enfant hors-module est refusé par la RLS');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501',
      'insert conversation_member hors-module : 42501 attendu, obtenu ' || SQLSTATE || ' — ' || SQLERRM);
  end;
end;
$t146$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------------------
-- (h) D-06 birthdays : lier un enfant hors-module 'anniversaires' refusé
-- 22023 par le déclencheur ; l'enfant socle se lie.
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_home_a text;
  v_noe_m text;
  v_lila_m text;
  v_alice_m text;
  v_state text;
  v_msg text;
begin
  select household_id into v_home_a from testkit.fx where key = 't146-home-a';
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  -- Lila a été réduite à array['anniversaires'] en (c) : pour prouver le
  -- refus, la priver aussi d''anniversaires' (postgres, update borné).
  update public.household_members
     set managed_modules = array['taches']::text[]
   where id = v_lila_m;

  -- Refus : Lila sans 'anniversaires'.
  begin
    insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
    values ('t146-bd-lila', v_home_a, 'Lila CQS', date '2015-04-02', v_lila_m);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'birthday lié à un enfant hors-module : 22023 attendu, obtenu ' || v_state || ' — ' || coalesce(v_msg, 'aucune'));

  -- Succès : Noé (socle, 'anniversaires' inclus) se lie.
  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
  values ('t146-bd-noe', v_home_a, 'Noé CQS', date '2016-03-15', v_noe_m);
  perform testkit.eq(
    (select count(*) from public.birthdays where id = 't146-bd-noe' and linked_member_id = v_noe_m),
    1::bigint,
    'l''enfant socle se lie à une fiche anniversaire');
end;
$t146$;

-- ---------------------------------------------------------------------------
-- (i) meal_entries : normalisation silencieuse (A3). L'enfant hors-module
-- 'menu' est retiré de member_ids ; l'enfant socle est conservé.
-- ---------------------------------------------------------------------------
do $t146$
declare
  v_home_a text;
  v_noe_m text;
  v_lila_m text;
  v_alice_m text;
begin
  select household_id into v_home_a from testkit.fx where key = 't146-home-a';
  select row_id into v_noe_m from testkit.fx where key = 't146-noe_m';
  select row_id into v_lila_m from testkit.fx where key = 't146-lila_m';
  select row_id into v_alice_m from testkit.fx where key = 't146-alice_m';

  insert into public.meal_entries (id, household_id, entry_date, slot, free_text, member_ids, created_by)
  values ('t146-meal', v_home_a, date '2026-10-25', 'soir', 'Pâtes t146',
          array[v_noe_m, v_lila_m, v_alice_m], v_alice_m);

  perform testkit.eq(
    (select member_ids from public.meal_entries where id = 't146-meal'),
    array[v_noe_m, v_alice_m]::text[],
    'Lila (hors menu) retirée silencieusement, Noé et Alice conservés');
end;
$t146$;

rollback;
