-- supabase/tests/0040_message_system_leave.sql
-- Phase 08 Messages (plan 08-04, D-09) : le départ annonce le fil par une
-- ligne système figée serveur, infalsifiable, sans push ni non-lus.
--
-- Rouge→vert : avant 0101, « le départ annonce le fil » rendait 0 ligne (le
-- départ 0100 est muet) — reproduit avant la migration, qui l'inverse. Après
-- 0101, toute la suite est verte : annonce unique au départ volontaire comme
-- au retrait admin, nom figé au départ (le renommage ne réécrit pas
-- l'histoire), faux système refusé à chaque entrée, aucune file push,
-- historique conservé dans l'ordre.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.
--
-- Côté non-lus : il n'existe aucun état serveur de lecture pour les messages
-- (suivi local, cf. useReadConversations) ; le SQL prouve ici le marqueur
-- d'exclusion (`sender_id IS NULL`, jamais d'auteur) et l'intégrité des lignes
-- normales — la preuve du sélecteur est côté Vitest (08-04, Tasks 2/3).

begin;

do $$
declare
  alice uuid := testkit.auth_user('msys-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('msys-bob@example.fr', 'Bob Martin');
  home text := testkit.household(alice, 'Foyer Messages Systeme');
  alice_m text;
  bob_m text;
  conv text := private.new_id('conversation');
  msg_a text := private.new_id('message');
  msg_b text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('conv', conv),
    ('msg_a', msg_a),
    ('msg_b', msg_b);

  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_a, conv, home, alice_m, 'Bonsoir'),
         (msg_b, conv, home, bob_m, 'Salut');
end;
$$;

-- Contrôle positif du ventilateur : le message de Bob vise Alice (active).
select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.id = %L'
  ' and n.user_id = (select user_id from testkit.fx where key = ''alice'')',
  (select row_id from testkit.fx where key = 'msg_b'))), 1::bigint,
  'le ventilateur push vise un membre actif (controle)');

-- ===========================================================================
-- D-09 (ROUGE avant 0101) : le départ volontaire annonce le fil, une fois.
-- ===========================================================================
select testkit.as_user(user_id, 'msys-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob quitte son fil (pierre tombale)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le depart annonce le fil par une ligne systeme unique (ROUGE avant 0101)');

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob re-quitte son fil (idempotent, sans effet)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le re-depart n''annonce pas deux fois');

reset role;

-- ===========================================================================
-- Visible des deux côtés, texte figé exact, dernière en ordre.
-- ===========================================================================
select testkit.as_user(user_id, 'msys-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'les restants voient la ligne systeme');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le texte fige le nom du partant au depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages s where s.household_id = %L and s.conversation_id = %L'
  ' and s.sender_id is null'
  ' and not exists (select 1 from public.messages m where m.conversation_id = s.conversation_id'
  ' and (m.created_at, m.id) > (s.created_at, s.id))',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'la ligne systeme ferme l''historique dans l''ordre');

reset role;

select testkit.as_user(user_id, 'msys-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le partant archive voit l''annonce de son propre depart');

reset role;

-- ===========================================================================
-- Faux système refusé à chaque entrée (forme réservée au déclencheur).
-- ===========================================================================
select testkit.as_user(user_id, 'msys-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (''msys-faux'', %L, %L, null, ''Faux depart'')',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home')),
  'un client ne forge pas de ligne systeme (insertion refusee)');

select testkit.eq(testkit.affected(format(
  'update public.messages set content = ''Pirate'' where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un client ne reedite pas une ligne systeme');

select testkit.eq(testkit.affected(format(
  'update public.messages set sender_id = %L where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'alice_m'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un client n''adopte pas une ligne systeme en auteur');

select testkit.eq(testkit.affected(format(
  'delete from public.messages where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un client ne supprime pas une ligne systeme');

reset role;

select testkit.as_user(user_id, 'msys-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (''msys-faux-bob'', %L, %L, null, ''Faux depart du partant'')',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home')),
  'le partant ne forge pas de ligne systeme non plus');

reset role;

-- ===========================================================================
-- Silence : aucune file push pour la ligne système (contraposée : les lignes
-- normales du fil y sont, elles, bien entrées à l'insertion).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'les deux lignes normales du fil sont entrees en file push');

select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'la ligne systeme n''entre jamais en file push');

select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'le ventilateur push ignore la ligne systeme');

-- ===========================================================================
-- Marqueur non-lus : le SQL expose l'exclusion (aucun état serveur de lecture
-- n'existe — la preuve du sélecteur est côté Vitest).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'les lignes normales gardent leur auteur (predicat non-lus intact)');

-- ===========================================================================
-- Nom figé : le renommage du partant ne réécrit pas l'histoire.
-- ===========================================================================
do $$
begin
  update public.household_members
     set display_name = 'Robert Martin'
   where id = (select row_id from testkit.fx where key = 'bob_m');
end;
$$;

select testkit.as_user(user_id, 'msys-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le renommage du partant ne reecrit pas l''annonce figee');

-- ===========================================================================
-- Réadhésion admin : le nettoyage de la pierre est muet, puis le retrait dur
-- d'un membre actif annonce une fois, au nom renommé.
-- ===========================================================================
select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin supprime la pierre tombale du partant');

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin reinsere le partant (readhesion)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le nettoyage de la pierre n''annonce rien');

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin retire le membre reactif (dur)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'le retrait admin annonce le fil exactement une fois');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Robert Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le retrait admin fige le nom courant, pas l''ancien');

-- L'histoire normale survit aux deux annonces (bornée au fil).
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'l''historique normal survit aux annonces');

reset role;

rollback;
