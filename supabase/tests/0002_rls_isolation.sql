-- supabase/tests/0002_rls_isolation.sql
-- Isolation entre foyers, escalade de privilèges, accès dérivés du parent et
-- garde-fous d'intégrité.
--
-- Scénario :
--   Foyer A (Alice admin, Bob membre, Noé enfant) — Foyer B (Carol admin, Dave membre)
--
-- Rappel : une ligne filtrée par la RLS ne provoque pas d'erreur, elle n'est
-- simplement pas visible ni modifiable. Les contrôles d'écriture utilisent donc
-- `testkit.affected` (= 0) pour UPDATE/DELETE, et `testkit.expect_denied` pour
-- les INSERT dont la politique `WITH CHECK` rejette la ligne.

begin;

create temporary table fx (
  key text primary key,
  user_id uuid,
  household_id text,
  row_id text
) on commit drop;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('enfant@example.fr', 'Noé Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noé Martin', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');
  dave_m text := testkit.member(home_b, dave, 'Dave Durand', 'membre', 'violet');

  list_a text := private.new_id('list');
  list_b text := private.new_id('list');
  task_a text := private.new_id('task');
  task_b text := private.new_id('task');
  event_a text := private.new_id('event');
  event_b text := private.new_id('event');
  conv_a text := private.new_id('conversation');
  conv_b text := private.new_id('conversation');
  expense_a text := private.new_id('expense');
  expense_b text := private.new_id('expense');
  private_list text := private.new_id('gift-list');
  shared_list text := private.new_id('gift-list');
begin
  insert into public.shopping_lists (id, household_id, name, created_by)
  values (list_a, home_a, 'Fresque', alice_m), (list_b, home_b, 'Fresque', carol_m);

  insert into public.shopping_list_items (id, list_id, household_id, name, added_by)
  values (private.new_id('item'), list_a, home_a, 'Yaourts', alice_m),
         (private.new_id('item'), list_b, home_b, 'Papier toilette', carol_m);

  insert into public.tasks (id, household_id, name, due_date, status, created_by)
  values (task_a, home_a, 'Valider le carnet', current_date, 'a_faire', alice_m),
         (task_b, home_b, 'Acheter du pain', current_date, 'a_faire', carol_m);

  insert into public.events (id, household_id, title, start_at, created_by)
  values (event_a, home_a, 'Rendez-vous médecin', current_date + time '19:30', alice_m),
         (event_b, home_b, 'École', current_date + time '18:00', carol_m);

  insert into public.expenses (id, household_id, title, amount, paid_by, expense_date)
  values (expense_a, home_a, 'Courses', 30.00, alice_m, current_date),
         (expense_b, home_b, 'Essence', 40.00, carol_m, current_date);

  insert into public.conversations (id, household_id, type, title)
  values (conv_a, home_a, 'groupe', 'Foyer A'), (conv_b, home_b, 'direct', null);

  insert into public.conversation_members (conversation_id, member_id)
  values (conv_a, alice_m), (conv_a, bob_m), (conv_b, carol_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (private.new_id('message'), conv_a, home_a, alice_m, 'Bonjour'),
         (private.new_id('message'), conv_b, home_b, carol_m, 'Secret');

  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values (private_list, home_a, alice_m, 'Idées pour Maya', 'privee'),
         (shared_list, home_a, alice_m, 'Anniversaire de Noé', 'foyer');

  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values (private.new_id('gift-share'), private_list, 'dave@example.fr', 'lecture');

  insert into public.dashboard_widgets (id, member_id, household_id, widget_type, position_x, position_y)
  values (private.new_id('widget'), alice_m, home_a, 'taches', 0, 0),
         (private.new_id('widget'), carol_m, home_b, 'taches', 0, 0);

  insert into fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('enfant', kid, home_a, kid_m),
    ('carol', carol, home_b, carol_m),
    ('dave', dave, home_b, dave_m),
    ('task_a', null, home_a, task_a),
    ('task_b', null, home_b, task_b),
    ('event_a', null, home_a, event_a),
    ('event_b', null, home_b, event_b),
    ('list_a', null, home_a, list_a),
    ('list_b', null, home_b, list_b),
    ('conv_a', null, home_a, conv_a),
    ('conv_b', null, home_b, conv_b),
    ('expense_a', null, home_a, expense_a),
    ('expense_b', null, home_b, expense_b),
    ('private_list', null, home_a, private_list),
    ('shared_list', null, home_a, shared_list);
end;
$$;

-- ===========================================================================
-- Alice, administratrice du foyer A
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from fx where key = 'alice';
set local role authenticated;

-- --- Lecture : uniquement son foyer -----------------------------------------
select testkit.eq(testkit.count('select 1 from public.household_members'), 3::bigint,
  'Alice voit les 3 membres de son foyer');
select testkit.eq(testkit.count('select 1 from public.households'), 1::bigint,
  'Alice ne voit que son foyer');
select testkit.eq(testkit.count('select 1 from public.tasks'), 1::bigint,
  'Alice ne voit pas les tâches du foyer B');
select testkit.eq(testkit.count('select 1 from public.events'), 1::bigint,
  'Alice ne voit pas les événements du foyer B');
select testkit.eq(testkit.count('select 1 from public.shopping_lists'), 1::bigint,
  'Alice ne voit pas les listes du foyer B');
select testkit.eq(testkit.count('select 1 from public.shopping_list_items'), 1::bigint,
  'les articles enfants suivent le parent');
select testkit.eq(testkit.count('select 1 from public.expenses'), 1::bigint,
  'Alice ne voit pas les dépenses du foyer B');
select testkit.eq(testkit.count('select 1 from public.conversations'), 1::bigint,
  'Alice ne voit pas les conversations du foyer B');
select testkit.eq(testkit.count('select 1 from public.messages'), 1::bigint,
  'Alice ne voit pas les messages du foyer B');
select testkit.eq(testkit.count('select 1 from public.dashboard_widgets'), 1::bigint,
  'Alice ne voit que ses propres widgets');

-- --- Écriture inter-foyer : refusée -----------------------------------------
select testkit.expect_denied(format(
  'insert into public.tasks (id, household_id, name) values (%L, %L, %L)',
  'task_x', (select household_id from fx where key = 'carol'), 'Intruse'));
select testkit.eq(testkit.affected(format(
  'update public.tasks set name = %L where id = %L', 'Détournée', (select row_id from fx where key = 'task_b'))), 0::bigint,
  'Alice ne peut pas modifier une tâche du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.tasks where id = %L', (select row_id from fx where key = 'task_b'))), 0::bigint,
  'Alice ne peut pas supprimer une tâche du foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.shopping_list_items where list_id = %L', (select row_id from fx where key = 'list_b'))), 0::bigint,
  'Alice ne peut pas supprimer un objet du foyer B');
select testkit.eq(testkit.affected(format(
  'update public.households set name = %L where id = %L', 'Piraté', (select household_id from fx where key = 'carol'))), 0::bigint,
  'Alice ne peut pas renommer le foyer B');
select testkit.eq(testkit.affected(format(
  'delete from public.households where id = %L', (select household_id from fx where key = 'carol'))), 0::bigint,
  'Alice ne peut pas supprimer le foyer B');

-- Un foyer ne peut être créé qu'au nom de son auteur.
select testkit.expect_denied(format(
  'insert into public.households (id, name, created_by) values (%L, %L, %L)',
  'household_x', 'Foyer usurpé', (select user_id from fx where key = 'bob')));
select testkit.ok(
  testkit.affected(format(
    'insert into public.households (id, name, created_by) values (%L, %L, %L)',
    'household_own', 'Mon nouveau foyer', (select user_id from fx where key = 'alice'))) = 1,
  'un utilisateur connecté crée son propre foyer');
select testkit.expect_denied(format(
  'insert into public.household_members (id, household_id, user_id, display_name, role)'
  ' values (%L, %L, %L, %L, %L)',
  'member_own', 'household_own', (select user_id from fx where key = 'alice'), 'Alice', 'membre'),
  'le premier membre d''un foyer doit être administrateur');
select testkit.ok(
  testkit.affected(format(
    'insert into public.household_members (id, household_id, user_id, display_name, role)'
    ' values (%L, %L, %L, %L, %L)',
    'member_own2', 'household_own', (select user_id from fx where key = 'alice'), 'Alice', 'admin')) = 1,
  'le créateur peut devenir administrateur de son foyer');

-- --- Tables enfants : accès dérivé du parent ---------------------------------
select testkit.expect_denied(format(
  'insert into public.task_assignees (task_id, member_id) values (%L, %L)',
  (select row_id from fx where key = 'task_b'), (select row_id from fx where key = 'alice')));
select testkit.expect_denied(format(
  'insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)'
  ' values (%L, %L, ''membre'', %L, 1)',
  'ep_x', (select row_id from fx where key = 'expense_b'), (select row_id from fx where key = 'alice')));
select testkit.expect_denied(format(
  'insert into public.task_assignees (task_id, member_id) values (%L, %L)',
  (select row_id from fx where key = 'task_a'), (select row_id from fx where key = 'carol')),
  'un assignataire doit appartenir au foyer de la tâche');

-- --- Intégrité des colonnes dénormalisées et références ---------------------
select testkit.expect_denied(format(
  'insert into public.shopping_list_items (id, list_id, household_id, name) values (%L, %L, %L, %L)',
  'item_x', (select row_id from fx where key = 'list_a'), (select household_id from fx where key = 'carol'), 'Yaourt'));
select testkit.expect_denied(format(
  'insert into public.expenses (id, household_id, title, amount, paid_by, expense_date)'
  ' values (%L, %L, %L, 10, %L, current_date)',
  'expense_x', (select household_id from fx where key = 'alice'), 'Interfoyer', (select row_id from fx where key = 'carol')));
select testkit.expect_denied(format(
  'insert into public.tasks (id, household_id, name, created_by) values (%L, %L, %L, %L)',
  'task_y', (select household_id from fx where key = 'alice'), 'Au nom de Bob', (select row_id from fx where key = 'bob')),
  'impossible d''écrire au nom d''un autre membre');

-- --- Listes de cadeaux : visibilité ------------------------------------------
select testkit.eq(testkit.count(format(
  'select 1 from public.gift_lists where id = %L', (select row_id from fx where key = 'private_list'))), 1::bigint,
  'Alice voit sa propre liste privée');
select testkit.eq(testkit.count('select 1 from public.gift_lists'), 2::bigint,
  'Alice voit les deux listes de son foyer');
select testkit.eq(testkit.affected(format(
  'update public.gift_lists set owner_member_id = %L where id = %L',
  (select row_id from fx where key = 'bob'), (select row_id from fx where key = 'private_list'))), 0::bigint,
  'un membre non propriétaire ne peut pas s''attribuer une liste privée');

-- --- Widgets : préférences personnelles -------------------------------------
select testkit.eq(testkit.affected(format(
  'update public.dashboard_widgets set position_x = 9 where member_id = %L', (select row_id from fx where key = 'carol'))), 0::bigint,
  'on ne touche pas aux widgets d''un autre membre');
select testkit.expect_denied(format(
  'insert into public.dashboard_widgets (id, member_id, household_id, widget_type)'
  ' values (%L, %L, %L, ''meteo'')',
  'widget_x', (select row_id from fx where key = 'bob'), (select household_id from fx where key = 'alice')));

-- --- Gestion des membres : le dernier administrateur est protégé --------------
select testkit.eq(testkit.affected(format(
  'delete from public.household_members where id = %L', (select row_id from fx where key = 'alice'))), 0::bigint,
  'le dernier administrateur ne peut pas être supprimé');
select testkit.eq(testkit.affected(format(
  'delete from public.household_members where id = %L', (select row_id from fx where key = 'bob'))), 1::bigint,
  'un administrateur peut retirer un membre ordinaire');

reset role;

-- ===========================================================================
-- Bob, membre ordinaire du foyer A — pas d'escalade de privilèges
-- ===========================================================================
select testkit.as_user(user_id, 'bob@example.fr') from fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from fx where key = 'bob'))), 0::bigint,
  'un membre ne peut pas s''attribuer le rôle admin');
select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from fx where key = 'alice'))), 0::bigint,
  'un membre ne peut pas promouvoir un autre membre');
select testkit.expect_denied(format(
  'insert into public.household_members (id, household_id, user_id, display_name, role)'
  ' values (%L, %L, %L, %L, %L)',
  'member_x', (select household_id from fx where key = 'alice'), (select user_id from fx where key = 'bob'), 'Bob', 'admin'));
select testkit.expect_denied(format(
  'insert into public.household_members (id, household_id, user_id, display_name, role)'
  ' values (%L, %L, %L, %L, %L)',
  'member_y', (select household_id from fx where key = 'carol'), (select user_id from fx where key = 'bob'), 'Bob', 'membre'),
  'on ne peut pas s''inscrire dans un autre foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.household_members where id = %L', (select row_id from fx where key = 'alice'))), 0::bigint,
  'un membre ne peut pas retirer un administrateur');
select testkit.eq(testkit.affected(format(
  'update public.households set name = %L where id = %L', 'Renommé', (select household_id from fx where key = 'alice'))), 0::bigint,
  'un membre ne peut pas renommer le foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.tasks where id = %L', (select row_id from fx where key = 'task_a'))), 0::bigint,
  'la suppression d''une tâche est réservée aux administrateurs');

-- En revanche il écrit dans le contenu de son foyer.
select testkit.ok(
  testkit.affected(format(
    'insert into public.notes (id, household_id, title, content, created_by) values (%L, %L, %L, %L, %L)',
    'note_bob', (select household_id from fx where key = 'alice'), 'Note de Bob', 'contenu', (select row_id from fx where key = 'bob'))) = 1,
  'un membre peut créer une note dans son foyer');

reset role;

-- ===========================================================================
-- Noé, rôle `enfant` — lecture seule
-- ===========================================================================
select testkit.as_user(user_id, 'enfant@example.fr') from fx where key = 'enfant';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.tasks'), 1::bigint,
  'un enfant lit les tâches de son foyer');
select testkit.expect_denied(format(
  'insert into public.tasks (id, household_id, name) values (%L, %L, %L)',
  'task_kid', (select household_id from fx where key = 'alice'), 'Tâche d''enfant'));
select testkit.eq(testkit.affected(format(
  'update public.notes set title = %L where title = %L', 'Piraté', 'Note de Bob')), 0::bigint,
  'un enfant ne modifie pas les notes du foyer');
select testkit.eq(testkit.affected(format(
  'delete from public.tasks where id = %L', (select row_id from fx where key = 'task_a'))), 0::bigint,
  'un enfant ne supprime pas les tâches du foyer');

reset role;

-- ===========================================================================
-- Carol, administratrice du foyer B — la fuite ne joue pas dans l'autre sens
-- ===========================================================================
select testkit.as_user(user_id, 'carol@example.fr') from fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.household_members'), 2::bigint,
  'Carol voit les 2 membres de son foyer');
select testkit.eq(testkit.count('select 1 from public.tasks'), 1::bigint,
  'Carol ne voit pas les tâches du foyer A');
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L', (select row_id from fx where key = 'conv_a'))), 0::bigint,
  'Carol ne voit pas les messages du foyer A');
select testkit.expect_denied(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from fx where key = 'conv_a'), (select row_id from fx where key = 'carol')));
select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'message_x', (select row_id from fx where key = 'conv_a'),
  (select household_id from fx where key = 'carol'), (select row_id from fx where key = 'carol'), 'Bonjour'),
  'on ne peut pas écrire dans une conversation d''un autre foyer');

reset role;

-- ===========================================================================
-- Listes de cadeaux partagées par email
-- ===========================================================================
select testkit.as_user(user_id, 'dave@example.fr') from fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.gift_lists where id = %L', (select row_id from fx where key = 'private_list'))), 1::bigint,
  'Dave accède à la liste privée partagée avec son email');
select testkit.eq(testkit.affected(format(
  'update public.gift_lists set visibility = %L where id = %L', 'privee', (select row_id from fx where key = 'private_list'))), 0::bigint,
  'un simple destinataire ne peut pas modifier la liste partagée');

reset role;

-- ===========================================================================
-- Profils : pas de liste globale d'emails
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.profiles'), 3::bigint,
  'Alice voit son profil et ceux de son foyer uniquement');
select testkit.eq(testkit.affected(format(
  'update public.profiles set display_name = %L where email = %L', 'Détournée', 'carol@example.fr')), 0::bigint,
  'on ne peut pas modifier le profil d''un foyer tiers');
select testkit.eq(testkit.affected(format(
  'update public.profiles set display_name = %L where email = %L', 'Alice B.', 'alice@example.fr')), 1::bigint,
  'on peut modifier son propre profil');

reset role;

-- ===========================================================================
-- Anonyme : aucun accès
-- ===========================================================================
select testkit.as_anon();
set local role anon;

select testkit.eq(testkit.count('select 1 from public.profiles'), 0::bigint, 'anon ne lit aucun profil');
select testkit.eq(testkit.count('select 1 from public.tasks'), 0::bigint, 'anon ne lit aucune tâche');
select testkit.expect_denied('select 1 from public.household_invite_tokens');
select testkit.expect_denied('select 1 from public.household_members');

reset role;

rollback;
