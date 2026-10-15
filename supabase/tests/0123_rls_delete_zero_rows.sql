-- supabase/tests/0123_rls_delete_zero_rows.sql
-- Durcissement frontend (18-02, WR-01) : sous RLS, un `DELETE` refusé N'EST PAS
-- une erreur — il affecte zéro ligne, en silence. La politique
-- `tasks_delete_admin` (0118_trip_workspace.sql:349-351) réserve la suppression
-- à l'administrateur du foyer : un membre non admin qui tente le `DELETE`
-- obtient 0 ligne, sans exception, et l'application présentait autrefois ce
-- refus comme un succès (WR-01).
--
-- Ce fichier fige le comportement de la BASE, celui que le client ne peut plus
-- lire comme un succès : `SupabaseAdapter.remove` compte désormais les lignes
-- rendues par `.delete().select()` et lève un `DataError` sinon
-- (app/src/lib/data/supabase-adapter.ts, app/src/lib/data/adapter.ts). La base
-- est inchangée par le correctif client : la preuve rouge — 0 ligne, aucune
-- erreur — est donc exactement ce que ce fichier mesure, avant comme après.
--
-- Bornes (AGENTS.md §2.7D) : chaque assertion cible une ligne par identifiant,
-- via `testkit.affected` (jamais un comptage global). Le cas négatif porte sur
-- une ligne que le cas positif ne consomme pas. Fixtures en rôle
-- d'administration ; assertions sous `authenticated`, comme PostgREST.
-- Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice uuid := testkit.auth_user('t23-alice@example.fr', 'Alice Admin');
  bob uuid := testkit.auth_user('t23-bob@example.fr', 'Bob Membre');
  home text := testkit.household(alice, 'Foyer Suppression');
  alice_m text;
  bob_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Admin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Membre', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m), ('bob_m', bob_m);

  -- Deux tâches distinctes : la négative (non admin) et la positive (admin),
  -- pour que le succès de l'une ne consomme pas la ligne de l'autre.
  insert into public.tasks (id, household_id, name, created_by, status)
  values ('task_t23_non_admin', home, 'Tâche non admin', alice_m, 'a_faire'),
         ('task_t23_admin', home, 'Tâche admin', alice_m, 'a_faire');
end;
$$;

-- --- (a) Cas négatif : membre non admin → 0 ligne affectée, aucune erreur ---
-- C'est ce silence que le client transforme désormais en `DataError`.
select testkit.as_user(user_id, 't23-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  v_affected bigint;
begin
  v_affected := testkit.affected('delete from public.tasks where id = ''task_t23_non_admin''');
  perform testkit.eq(
    v_affected,
    0::bigint,
    'WR-01 : un DELETE non-admin affecte 0 ligne, sans lever');
  -- La ligne est toujours là : rien n'a fuité, aucun refus bruyant ne l'a signalée.
  perform testkit.eq(
    testkit.count('select 1 from public.tasks where id = ''task_t23_non_admin'''),
    1::bigint,
    'la ligne visée par le non-admin subsiste');
end;
$$;

reset role;

-- --- (b) Cas positif : l'admin du même foyer → exactement 1 ligne ---
select testkit.as_user(user_id, 't23-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  v_affected bigint;
begin
  v_affected := testkit.affected('delete from public.tasks where id = ''task_t23_admin''');
  perform testkit.eq(
    v_affected,
    1::bigint,
    'l''admin affecte exactement une ligne sur la même table');
end;
$$;

reset role;

rollback;
