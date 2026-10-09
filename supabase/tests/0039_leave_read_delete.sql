-- supabase/tests/0039_leave_read_delete.sql
-- Phase 08 Messages (plan 08-03, D-07/D-08) : suppression d'un message par
-- son auteur seul + départ en pierre tombale (`left_at`).
--
-- Rouge→vert : avant 0100, « l'admin supprime le message d'autrui » rendait
-- 1 ligne (D-07 refusé) et « le partant relit l'historique » rendait 0
-- (D-08 aveugle) — les deux reproduits avant la migration, qui les inverse.
-- Après 0100, toute la suite est verte : suppression auteur seul, fil entier
-- supprimable par un admin (levier de modération, cascade intacte — régime
-- retiré en 0106 au profit de l'archivage-pour-tous D-14, voir l'amendement
-- ci-dessous et la preuve canonique 0045), retrait dur d'autrui conservé,
-- départ tombé idempotent, histoire relue en lecture seule, écritures du
-- partant refusées, registre et ventilateur push en actifs seuls, retrait des
-- archives par sa propre pierre, réadhésion par un admin. Le partant seul ne
-- se ré-ajoute pas (aucune politique UPDATE).
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer, au fil ou à
-- l'objet via testkit.fx — jamais de total nu sur une table entière.

begin;

do $$
declare
  alice uuid := testkit.auth_user('mleave-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('mleave-bob@example.fr', 'Bob Martin');
  outsider uuid := testkit.auth_user('mleave-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Messages Depart');
  alice_m text;
  bob_m text;
  conv text := private.new_id('conversation');
  conv_mod text := private.new_id('conversation');
  msg_alice text := private.new_id('message');
  msg_bob text := private.new_id('message');
  msg_bob2 text := private.new_id('message');
  msg_mod text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('conv', conv),
    ('conv_mod', conv_mod),
    ('msg_alice', msg_alice),
    ('msg_bob', msg_bob),
    ('msg_bob2', msg_bob2),
    ('msg_mod', msg_mod);

  -- Fil principal Alice + Bob (départ, archives, réadhésion) ; fil témoin
  -- Alice + Bob (suppression admin du fil entier).
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon'), (conv_mod, home, 'groupe', 'Salon moderation');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m),
         (conv_mod, alice_m), (conv_mod, bob_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_alice, conv, home, alice_m, 'Bonsoir'),
         (msg_bob, conv, home, bob_m, 'Salut'),
         (msg_bob2, conv, home, bob_m, 'A demain'),
         (msg_mod, conv_mod, home, bob_m, 'Fil a moderer');
end;
$$;

-- ===========================================================================
-- D-07 : l'auteur supprime son propre message.
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob'))), 1::bigint,
  'l''auteur supprime son propre message');

reset role;

-- ===========================================================================
-- D-07 : l'admin ne supprime plus le message d'autrui (branche retirée).
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob2'))), 0::bigint,
  'l''admin ne supprime plus un message seul d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L and id = %L and content = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'msg_bob2'), 'A demain')), 1::bigint,
  'le message d''autrui est intact apres la tentative admin');

reset role;

-- ===========================================================================
-- D-14 (0106, amende le levier ci-dessus) : destruction retirée — l'admin ne
-- vaporise plus le fil, il l'archive-pour-tous via `archive_conversation`
-- (preuve canonique en 0045). La tentative directe ne touche aucune ligne.
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversations where id = %L',
  (select row_id from testkit.fx where key = 'conv_mod'))), 0::bigint,
  'l''admin ne supprime plus le fil (destruction retiree D-14, 0 ligne)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv_mod'))), 1::bigint,
  'l''histoire du fil survit a la tentative (retrait 0106)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv_mod'))), 2::bigint,
  'les appartenances du fil survivent a la tentative (retrait 0106)');

reset role;

-- ===========================================================================
-- Sémantique conservée : l'admin retire autrui (dur), puis le ré-insère.
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin retire un membre actif du fil (dur, semantique conservee)');

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin reinsere le membre retire');

reset role;

-- Un message témoin d'Alice avant le départ : contrôle positif du ventilateur.
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'mleave-pre',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'alice_m'),
  'Avant le depart'));

reset role;

-- Ventilateur push : le message d'avant-départ vise bien Bob (actif alors).
select testkit.eq(testkit.count(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.id = ''mleave-pre'''
  ' and n.user_id = (select user_id from testkit.fx where key = ''bob'')'), 1::bigint,
  'le ventilateur push vise un membre actif');

-- ===========================================================================
-- D-08 : départ en pierre tombale, idempotent (re-départ sans effet).
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob quitte son fil (pierre tombale)');

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob re-quitte son fil (idempotent, sans effet)');

reset role;

-- Le partant relit l'historique : messages, fil et registre (bornés au fil).
select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 3::bigint,
  'le partant relit l''historique de son fil quitte');

-- D-09 (0101) : les deux départs survenus (retrait admin puis départ
-- volontaire) ont chacun annoncé le fil — l'histoire lue comprend les lignes
-- système, preuve en 0040.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'le partant relit aussi les deux annonces de depart (D-09)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le partant voit encore son fil quitte');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'le partant lit encore le registre du fil');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le registre ne compte qu''un actif apres le depart');

reset role;

-- ===========================================================================
-- D-08 : le partant ne réécrit plus (envoi, édition, suppression, retour).
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'mleave-intrus',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'bob_m'),
  'Ecrit apres le depart'),
  'le partant n''envoie plus dans son fil quitte');

select testkit.expect_denied(format(
  'update public.messages set content = %L where id = %L',
  'Reecrit apres le depart',
  (select row_id from testkit.fx where key = 'msg_bob2')),
  'le partant ne reedite plus meme son propre message');

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob2'))), 0::bigint,
  'le partant ne supprime plus meme son propre message');

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 0::bigint,
  'le partant seul ne se re-ajoute pas (aucune politique UPDATE)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and member_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 0::bigint,
  'la pierre du partant est inchangee apres sa tentative de retour');

reset role;

-- Registre côté restants : le partant n'y figure plus en actif (borné au fil).
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'les restants ne comptent plus le partant en actif');

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'mleave-post',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'alice_m'),
  'Apres le depart'));

reset role;

-- Ventilateur push : le message d'après-départ ne vise plus Bob.
select testkit.eq(testkit.count(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.id = ''mleave-post'''
  ' and n.user_id = (select user_id from testkit.fx where key = ''bob'')'), 0::bigint,
  'le ventilateur push exclut le partant');

-- ===========================================================================
-- D-08 : réadhésion par un admin (suppression de la pierre + ré-insertion),
-- puis activité normale, puis nouveau départ.
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

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

reset role;

select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'mleave-back',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'bob_m'),
  'De retour')), 1::bigint,
  'le membre readmis ecrit a nouveau');

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob quitte a nouveau son fil');

reset role;

-- ===========================================================================
-- D-08 : retrait des archives — le partant supprime sa propre pierre, puis
-- est pleinement aveugle (fil, messages, registre).
-- ===========================================================================
select testkit.as_user(user_id, 'mleave-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'le partant retire le fil de ses archives (sa propre pierre)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'apres retrait des archives, le fil est invisible en messages');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'apres retrait des archives, le fil est invisible en conversations');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'apres retrait des archives, le registre est invisible');

reset role;

-- Un extérieur ne quitte pas un fil qui n'est pas le sien.
select testkit.as_user(user_id, 'mleave-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv')),
  'un exterieur ne quitte pas le fil d''un foyer');

reset role;

rollback;
