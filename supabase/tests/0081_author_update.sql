-- supabase/tests/0081_author_update.sql
-- Non-régression 0081 : un membre peut cocher / modifier une tâche créée par
-- un autre membre du même foyer ; l'auteur reste figé et l'usurpation à
-- l'INSERT reste refusée.

begin;

do $$
declare
  alice uuid := testkit.auth_user('upd-alice@example.fr', 'Alice Uuuu');
  bob uuid := testkit.auth_user('upd-bob@example.fr', 'Bob Uuuu');
  kid uuid := testkit.auth_user('upd-kid@example.fr', 'Noe Uuuu');
  home_a text := testkit.household(alice, 'Foyer Update Uuuu');
  alice_m text := testkit.member(home_a, alice, 'Alice Uuuu', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Uuuu', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Uuuu', 'enfant', 'amber');
  task_a text := private.new_id('task');
  note_a text := private.new_id('note');
begin
  insert into public.tasks (id, household_id, name, status, created_by)
  values (task_a, home_a, 'Tache Alice Uuuu', 'a_faire', alice_m);
  insert into public.notes (id, household_id, title, content, created_by)
  values (note_a, home_a, 'Note Alice Uuuu', 'contenu', alice_m);

  -- Bob, membre : bascule le statut de la tâche d'Alice.
  perform testkit.as_user(bob, 'upd-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected(format(
      'update public.tasks set status = %L where id = %L', 'fait', task_a)),
    1::bigint,
    'un membre coche la tache creee par un autre membre');
  perform testkit.eq(
    testkit.affected(format(
      'update public.tasks set name = %L where id = %L', 'Tache renommee Uuuu', task_a)),
    1::bigint,
    'un membre renomme la tache creee par un autre membre');
  perform testkit.eq(
    testkit.affected(format(
      'update public.notes set title = %L where id = %L', 'Note retitree Uuuu', note_a)),
    1::bigint,
    'un membre modifie la note creee par un autre membre');
  reset role;

  -- L'auteur ne change pas : ni vers soi, ni vers un tiers.
  perform testkit.as_user(bob, 'upd-bob@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(format(
    'update public.tasks set created_by = %L where id = %L', bob_m, task_a),
    'la colonne created_by n''est pas modifiable par le client');
  reset role;

  -- L'usurpation à l'INSERT reste refusée.
  perform testkit.as_user(bob, 'upd-bob@example.fr');
  set local role authenticated;
  perform testkit.expect_denied(format(
    'insert into public.tasks (id, household_id, name, created_by) values (%L, %L, %L, %L)',
    private.new_id('task'), home_a, 'Au nom d''Alice Uuuu', alice_m),
    'impossible d''ecrire au nom d''un autre membre');
  reset role;

  -- Enfant : toujours lecture seule, même sur la tâche d'autrui.
  perform testkit.as_user(kid, 'upd-kid@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected(format(
      'update public.tasks set status = %L where id = %L', 'a_faire', task_a)),
    0::bigint,
    'un enfant ne modifie pas les taches du foyer');
  reset role;
end;
$$;

rollback;
