-- supabase/tests/0133_replace_sets.sql
-- Remplacement atomique des ensembles (migration 0133).
--
-- CE QUI ÉTAIT CASSÉ, ET QUI NE SE VOYAIT PAS. Le client remplaçait un
-- ensemble par `delete` puis `insert` (deux requêtes PostgREST, aucune
-- transaction). Côté RLS, la suppression des lignes enfants d'une tâche ou
-- d'une routine est réservée aux ADMINISTRATEURS (`*_delete` : `can_admin_*`),
-- alors que l'insertion est ouverte aux membres depuis 0026. Un membre qui
-- enregistrait des assignataires ne supprimait donc rien et se heurtait à la
-- clé primaire sur les lignes restantes — l'enregistrement échouait, ou pire,
-- le retrait d'un assigné était un succès muet.
--
-- Les assertions ci-dessous passent par le rôle `authenticated`, avec Bob
-- MEMBRE et non administrateur : c'est le cas qui échouait.
--
-- PREUVE ROUGE : les sections (a) et (b) utilisent exactement la séquence
-- d'avant 0133 (delete + insert) ; elles échouent alors sur 23505 pour Bob.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur `task_t133` /
-- `routine_t133` / `recipe_t133`, jamais sur la table entière. Fichier
-- autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t133-alice@example.fr', 'Alice Remplace');
  bob    uuid := testkit.auth_user('t133-bob@example.fr', 'Bob Remplace');
  zoe    uuid := testkit.auth_user('t133-zoe@example.fr', 'Zoe Ailleurs');
  home   text := testkit.household(alice, 'Foyer Remplace');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
  alice_m text;
  bob_m   text;
  zoe_m   text;
begin
  alice_m := testkit.member(home, alice, 'Alice Remplace', 'admin');
  bob_m   := testkit.member(home, bob, 'Bob Remplace', 'membre');
  zoe_m   := testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');

  insert into public.tasks (id, household_id, name, created_by)
  values ('task_t133', home, 'Tâche remplacement', alice_m);

  insert into public.routines (id, household_id, name, created_by)
  values ('routine_t133', home, 'Routine remplacement', alice_m);

  insert into public.recipes (id, household_id, title)
  values ('recipe_t133', home, 'Recette remplacement');

  insert into public.recipe_tags (id, household_id, name)
  values ('tag_t133_a', home, 'Étiquette A'),
         ('tag_t133_b', home, 'Étiquette B'),
         ('tag_t133_z', home2, 'Étiquette Z');

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
  insert into testkit.fx (key, row_id)
  values ('alice_m', alice_m), ('bob_m', bob_m), ('zoe_m', zoe_m);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bob est MEMBRE du foyer : le cas que l'ancienne séquence ne savait pas servir.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't133-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  alice_m text;
  bob_m   text;
  zoe_m   text;
  inserted integer;
begin
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';
  select row_id into zoe_m from testkit.fx where key = 'zoe_m';

  -- (a) Deux assignataires, puis un seul : le RETRAIT réussit pour un membre.
  inserted := public.replace_task_assignees('task_t133', array[alice_m, bob_m]);
  perform testkit.eq(inserted, 2, 'deux assignataires posés');
  inserted := public.replace_task_assignees('task_t133', array[bob_m]);
  perform testkit.eq(inserted, 1, 'un assignataire après remplacement');
  perform testkit.eq(
    testkit.count('select 1 from public.task_assignees where task_id = ''task_t133'''),
    1::bigint,
    'il ne reste qu''une ligne d''assignation');
  perform testkit.ok(
    not exists (
      select 1 from public.task_assignees
       where task_id = 'task_t133' and member_id = alice_m
    ),
    'l''assignataire retiré a bien disparu — c''est le symptôme d''avant 0133');

  -- (b) Un ensemble n'a pas de doublon : la répétition ne lève pas 23505.
  inserted := public.replace_task_assignees('task_t133', array[bob_m, bob_m]);
  perform testkit.eq(inserted, 1, 'doublon replié');
  perform testkit.eq(
    testkit.count('select 1 from public.task_assignees where task_id = ''task_t133'''),
    1::bigint,
    'toujours une seule ligne');

  -- (c) Atomicité : un membre d'un autre foyer est refusé, et l'ensemble
  --     précédent reste intact — la suppression est annulée avec l'insertion.
  begin
    perform public.replace_task_assignees('task_t133', array[zoe_m]);
    perform testkit.ok(false, 'un membre d''un autre foyer aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'membre hors foyer refusé (42501)');
  end;
  perform testkit.eq(
    testkit.count('select 1 from public.task_assignees where task_id = ''task_t133'''),
    1::bigint,
    'l''ensemble précédent survit à l''échec');

  -- (d) Rappels de tâche : deux, puis un, puis zéro.
  inserted := public.replace_task_reminders(
    'task_t133',
    array[now() + interval '1 hour', now() + interval '2 hours']
  );
  perform testkit.eq(inserted, 2, 'deux rappels de tâche posés');
  inserted := public.replace_task_reminders('task_t133', array[now() + interval '3 hours']);
  perform testkit.eq(inserted, 1, 'un rappel après remplacement');
  inserted := public.replace_task_reminders('task_t133', array[]::timestamptz[]);
  perform testkit.eq(inserted, 0, 'remplacement par zéro rappel');
  perform testkit.eq(
    testkit.count('select 1 from public.task_reminders where task_id = ''task_t133'''),
    0::bigint,
    'aucun rappel ne subsiste');

  -- (e) Routine : mêmes deux moitiés, un membre y a droit aussi.
  inserted := public.replace_routine_assignees('routine_t133', array[alice_m, bob_m]);
  perform testkit.eq(inserted, 2, 'deux assignataires de routine posés');
  inserted := public.replace_routine_assignees('routine_t133', array[bob_m]);
  perform testkit.eq(inserted, 1, 'un assignataire de routine après remplacement');
  inserted := public.replace_routine_reminders(
    'routine_t133',
    array[now() + interval '1 day', now() + interval '2 days']
  );
  perform testkit.eq(inserted, 2, 'deux rappels de routine posés');
  inserted := public.replace_routine_reminders('routine_t133', array[]::timestamptz[]);
  perform testkit.eq(inserted, 0, 'rappels de routine vidés');

  -- (f) Étiquettes de recette : le foyer est DÉRIVÉ de la recette.
  inserted := public.replace_recipe_tag_links('recipe_t133', array['tag_t133_a', 'tag_t133_b']);
  perform testkit.eq(inserted, 2, 'deux étiquettes liées');
  perform testkit.ok(
    (select count(*)
       from public.recipe_tag_links l
      where l.recipe_id = 'recipe_t133'
        and l.household_id = (select household_id from testkit.fx where key = 'home')) = 2,
    'les liens portent le foyer de la recette, jamais un foyer fourni');

  -- Une étiquette d'un autre foyer est refusée par le trigger de portée, et
  -- les liens précédents restent en place.
  begin
    perform public.replace_recipe_tag_links('recipe_t133', array['tag_t133_z']);
    perform testkit.ok(false, 'une étiquette d''un autre foyer aurait dû être refusée');
  exception when check_violation then
    perform testkit.ok(true, 'étiquette d''un autre foyer refusée (23514)');
  end;
  perform testkit.eq(
    testkit.count('select 1 from public.recipe_tag_links where recipe_id = ''recipe_t133'''),
    2::bigint,
    'les liens précédents survivent au refus');

  inserted := public.replace_recipe_tag_links('recipe_t133', array[]::text[]);
  perform testkit.eq(inserted, 0, 'étiquettes retirées');
  perform testkit.eq(
    testkit.count('select 1 from public.recipe_tag_links where recipe_id = ''recipe_t133'''),
    0::bigint,
    'aucun lien ne subsiste');

  -- On repose un assignataire : il servira de témoin au refus du foyer voisin.
  perform public.replace_task_assignees('task_t133', array[bob_m]);
end;
$$;

-- ---------------------------------------------------------------------------
-- Un foyer voisin ne remplace rien, et ne voit rien.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't133-zoe@example.fr') from testkit.fx where key = 'zoe';

do $$
begin
  begin
    perform public.replace_task_assignees('task_t133', array[]::text[]);
    perform testkit.ok(false, 'un autre foyer aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'tâche d''un autre foyer refusée (42501)');
  end;

  perform testkit.eq(
    testkit.count('select 1 from public.task_assignees where task_id = ''task_t133'''),
    0::bigint,
    'zoe ne voit aucune assignation de ce foyer (RLS)');
end;
$$;

-- Le témoin est toujours là pour Bob : le refus de zoe n'a rien supprimé.
select testkit.as_user(user_id, 't133-bob@example.fr') from testkit.fx where key = 'bob';

do $$
begin
  perform testkit.eq(
    testkit.count('select 1 from public.task_assignees where task_id = ''task_t133'''),
    1::bigint,
    'l''ensemble de Bob est intact après le refus du foyer voisin');
end;
$$;

-- ---------------------------------------------------------------------------
-- Les fonctions ne sont pas exécutables hors session (revoke de 0133).
-- ---------------------------------------------------------------------------
reset role;
select testkit.as_anon();
set local role anon;

do $$
begin
  begin
    perform public.replace_task_assignees('task_t133', array[]::text[]);
    perform testkit.ok(false, 'un visiteur anonyme aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'EXECUTE refusé à anon');
  end;
end;
$$;

reset role;

rollback;
