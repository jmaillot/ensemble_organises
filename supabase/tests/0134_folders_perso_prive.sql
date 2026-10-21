-- supabase/tests/0134_folders_perso_prive.sql
-- Dossiers perso privés, et suppression qui efface leur contenu (migration 0134).
--
-- CE QUI ÉTAIT FAUX. `0051` laissait l'admin voir les dossiers perso des autres
-- (`folder_visible` : foyer OU propriétaire OU admin), et réservait la
-- suppression à l'admin. Un membre ne pouvait donc pas supprimer le dossier
-- qu'il avait créé, et son « perso » était lisible par l'admin.
--
-- CE QUE LA SUPPRESSION DOIT FAIRE, ET POURQUOI DEUX CHEMINS. La FK `folder_id`
-- est `on delete set null` : un dossier `foyer` supprimé range ses items dans
-- Général, visible de tous — c'est voulu. Un dossier `perso` doit au contraire
-- emporter son contenu, sinon supprimer « mes tâches privées » les publierait.
-- La règle dépend de la visibilité de la ligne, donc elle vit dans
-- `public.delete_folder`, pas dans la FK.
--
-- PREUVE ROUGE : avant 0134, la section (b) échoue (Alice voit le dossier perso
-- de Bob), la section (c) aussi (Bob ne peut pas supprimer), et la section (d)
-- échoue autrement (les tâches restent, rangées dans Général).
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur les identifiants
-- `*_t134*`, jamais sur une table entière. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice   uuid := testkit.auth_user('t134-alice@example.fr', 'Alice Dossiers');
  bob     uuid := testkit.auth_user('t134-bob@example.fr', 'Bob Dossiers');
  zoe     uuid := testkit.auth_user('t134-zoe@example.fr', 'Zoe Ailleurs');
  home    text := testkit.household(alice, 'Foyer Dossiers');
  home2   text := testkit.household(zoe, 'Foyer Ailleurs');
  alice_m text;
  bob_m   text;
  zoe_m   text;
  v_default text;
begin
  alice_m := testkit.member(home, alice, 'Alice Dossiers', 'admin');
  bob_m   := testkit.member(home, bob, 'Bob Dossiers', 'membre');
  zoe_m   := testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');

  -- Trois dossiers perso de Bob, un par module, et un dossier foyer d'Alice.
  insert into public.task_lists (id, household_id, name, visibility, owner_member_id)
  values ('list_t134_perso', home, 'Perso de Bob', 'perso', bob_m),
         ('list_t134_foyer', home, 'Foyer partagé', 'foyer', alice_m);

  insert into public.note_folders (id, household_id, name, visibility, owner_member_id)
  values ('nfolder_t134_perso', home, 'Notes de Bob', 'perso', bob_m);

  insert into public.routine_folders (id, household_id, name, visibility, owner_member_id)
  values ('rfolder_t134_perso', home, 'Routines de Bob', 'perso', bob_m);

  insert into public.tasks (id, household_id, name, created_by, folder_id)
  values ('task_t134_a', home, 'Tâche privée A', bob_m, 'list_t134_perso'),
         ('task_t134_b', home, 'Tâche privée B', bob_m, 'list_t134_perso'),
         ('task_t134_foyer', home, 'Tâche du foyer', alice_m, 'list_t134_foyer');

  insert into public.notes (id, household_id, title, created_by, folder_id)
  values ('note_t134', home, 'Note privée', bob_m, 'nfolder_t134_perso');

  insert into public.routines (id, household_id, name, created_by, folder_id)
  values ('routine_t134', home, 'Routine privée', bob_m, 'rfolder_t134_perso');

  -- Les dossiers Général naissent avec le foyer par `create_household` (0052),
  -- pas par un trigger : la fixture les pose elle-même, comme le fait le RPC.
  insert into public.task_lists (id, household_id, name, visibility, owner_member_id, is_default)
  values ('list_t134_general', home, 'Général', 'foyer', alice_m, true);
  insert into public.note_folders (id, household_id, name, visibility, owner_member_id, is_default)
  values ('nfolder_t134_general', home, 'Général', 'foyer', alice_m, true);
  insert into public.routine_folders (id, household_id, name, visibility, owner_member_id, is_default)
  values ('rfolder_t134_general', home, 'Général', 'foyer', alice_m, true);

  select id into v_default
    from public.task_lists
   where household_id = home and is_default;

  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob), ('zoe', zoe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
  insert into testkit.fx (key, row_id)
  values ('alice_m', alice_m), ('bob_m', bob_m), ('zoe_m', zoe_m),
         ('list_default', v_default);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Bob, propriétaire : il voit ses dossiers perso et leur contenu.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't134-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.task_lists where id = 'list_t134_perso'$q$),
    1::bigint,
    'le propriétaire voit son dossier perso');
  perform testkit.eq(
    testkit.count($q$select 1 from public.tasks where folder_id = 'list_t134_perso'$q$),
    2::bigint,
    'le propriétaire voit les deux tâches de son dossier');
  perform testkit.eq(
    testkit.count($q$select 1 from public.note_folders where id = 'nfolder_t134_perso'$q$),
    1::bigint,
    'dossier de notes perso visible du propriétaire');
  perform testkit.eq(
    testkit.count($q$select 1 from public.routine_folders where id = 'rfolder_t134_perso'$q$),
    1::bigint,
    'dossier de routines perso visible du propriétaire');
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Alice, admin : elle ne voit ni le dossier perso de Bob, ni son contenu.
--     C'est le renversement de 0051, et le cœur de la décision du 2026-10-21.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't134-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.task_lists where id = 'list_t134_perso'$q$),
    0::bigint,
    'un admin ne voit plus le dossier perso d''un membre');
  perform testkit.eq(
    testkit.count($q$select 1 from public.tasks where folder_id = 'list_t134_perso'$q$),
    0::bigint,
    'ni les tâches qu''il contient');
  perform testkit.eq(
    testkit.count($q$select 1 from public.note_folders where id = 'nfolder_t134_perso'$q$),
    0::bigint,
    'ni le dossier de notes perso');
  perform testkit.eq(
    testkit.count($q$select 1 from public.routine_folders where id = 'rfolder_t134_perso'$q$),
    0::bigint,
    'ni le dossier de routines perso');

  begin
    perform public.delete_folder('taches', 'list_t134_perso');
    perform testkit.ok(false, 'un admin aurait dû être refusé sur le dossier perso d''autrui');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'suppression du perso d''autrui refusée (42501)');
  end;

  -- Le dossier foyer, lui, reste administrable.
  perform testkit.eq(
    testkit.count($q$select 1 from public.task_lists where id = 'list_t134_foyer'$q$),
    1::bigint,
    'le dossier foyer reste visible de l''admin');
end;
$$;

-- ---------------------------------------------------------------------------
-- (c) Bob supprime ses trois dossiers perso : le contenu part avec eux.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't134-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  v_deleted integer;
  v_default text;
begin
  select row_id into v_default from testkit.fx where key = 'list_default';

  v_deleted := public.delete_folder('taches', 'list_t134_perso');
  perform testkit.eq(v_deleted, 2, 'les deux tâches privées ont été supprimées avec le dossier');
  perform testkit.eq(
    testkit.count($q$select 1 from public.task_lists where id = 'list_t134_perso'$q$),
    0::bigint,
    'le dossier perso a disparu');
  perform testkit.eq(
    testkit.count($q$select 1 from public.tasks where id in ('task_t134_a', 'task_t134_b')$q$),
    0::bigint,
    'le contenu ne retombe pas dans Général — il est effacé');

  v_deleted := public.delete_folder('notes', 'nfolder_t134_perso');
  perform testkit.eq(v_deleted, 1, 'la note privée a été supprimée avec son dossier');
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t134'$q$),
    0::bigint,
    'la note n''existe plus');

  v_deleted := public.delete_folder('routines', 'rfolder_t134_perso');
  perform testkit.eq(v_deleted, 1, 'la routine privée a été supprimée avec son dossier');
  perform testkit.eq(
    testkit.count($q$select 1 from public.routines where id = 'routine_t134'$q$),
    0::bigint,
    'la routine n''existe plus');

  -- Général reste indestructible, même pour qui le voit.
  begin
    perform public.delete_folder('taches', v_default);
    perform testkit.ok(false, 'le dossier Général aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'Général refusé (42501)');
  end;

  -- Un dossier foyer n'appartient pas au membre, même pour le supprimer.
  begin
    perform public.delete_folder('taches', 'list_t134_foyer');
    perform testkit.ok(false, 'un membre aurait dû être refusé sur un dossier foyer');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'dossier foyer refusé à un membre (42501)');
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- (d) Alice supprime le dossier foyer : son contenu retombe dans Général,
--     visible de tous — le comportement de 0050, inchangé pour le foyer.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't134-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
begin
  perform public.delete_folder('taches', 'list_t134_foyer');
  perform testkit.eq(
    testkit.count($q$select 1 from public.task_lists where id = 'list_t134_foyer'$q$),
    0::bigint,
    'le dossier foyer a disparu');
  perform testkit.eq(
    testkit.count($q$select 1 from public.tasks where id = 'task_t134_foyer' and folder_id is null$q$),
    1::bigint,
    'la tâche du foyer est rangée dans Général, pas supprimée');
end;
$$;

-- ---------------------------------------------------------------------------
-- (e) Un autre foyer ne voit ni ne supprime rien, et `anon` n'exécute pas.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't134-zoe@example.fr') from testkit.fx where key = 'zoe';
set local role authenticated;

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.tasks where id = 'task_t134_foyer'$q$),
    0::bigint,
    'un foyer voisin ne voit pas la tâche');
  begin
    perform public.delete_folder('taches', 'list_t134_foyer');
    perform testkit.ok(false, 'un foyer voisin aurait dû être refusé');
  exception when insufficient_privilege then
    perform testkit.ok(true, 'foyer voisin refusé (42501)');
  end;
end;
$$;

reset role;

do $$
begin
  perform testkit.ok(
    not has_function_privilege('anon', 'public.delete_folder(text,text)', 'execute'),
    'anon ne peut pas exécuter delete_folder');
  perform testkit.ok(
    has_function_privilege('authenticated', 'public.delete_folder(text,text)', 'execute'),
    'authenticated peut exécuter delete_folder');
end;
$$;

rollback;
