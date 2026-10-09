-- supabase/tests/0041_archive_frozen_window.sql
-- Phase 08 Messages (plan 08-05, D-10) : archives figées au départ — le
-- partant relit jusqu'à son `left_at`, jamais au-delà, borne serveur.
--
-- Rouge→vert : avant 0102, « B part, A écrit après, B relit le nouveau
-- message » rendait 1 ligne (archives vivantes, la surprise UAT) — reproduit
-- avant la migration, qui l'inverse. Après 0102 : le message post-départ est
-- invisible au partant, l'historique + sa propre annonce restent, la
-- réadhésion puis le nouveau départ déplacent la fenêtre, le retrait des
-- archives reste aveugle, les restants/push/écritures sont intacts.
--
-- Horloges : tout le fichier est UNE transaction, `now()` y est donc gelé au
-- départ. Le départ horodate `left_at` à l'heure d'instruction (0102) ; les
-- messages post-départ portent un `created_at` EXPLICITE (pierre + décalage),
-- sinon ils naîtraient avant la pierre et aucune borne ne les distinguerait.
-- En production chaque instruction a sa transaction et `now()` avance seul :
-- le décalage explicite ne sert qu'à la preuve.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.

begin;

do $$
declare
  alice uuid := testkit.auth_user('frozen-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('frozen-bob@example.fr', 'Bob Martin');
  home text := testkit.household(alice, 'Foyer Messages Archives Figees');
  alice_m text;
  bob_m text;
  conv text := private.new_id('conversation');
  msg_pre text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('conv', conv),
    ('msg_pre', msg_pre);

  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m);

  -- Avant le départ, une heure avant : sûrement sous la future borne.
  insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)
  values (msg_pre, conv, home, alice_m, 'Avant le depart', now() - interval '1 hour');
end;
$$;

-- ===========================================================================
-- D-10 (ROUGE avant 0102) : B part, A écrit après, B ne relit pas le nouveau.
-- ===========================================================================
select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob quitte son fil (premiere pierre)');

reset role;

-- Message post-départ, une minute après la pierre (voir l'en-tête).
select testkit.as_user(user_id, 'frozen-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- Alice écrit après le départ de Bob.
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)'
  ' select ''frozen-post1'', %L, %L, %L, ''Apres le depart'', cm.left_at + interval ''1 minute'''
  ' from public.conversation_members cm where cm.conversation_id = %L and cm.member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'alice_m'),
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m')));

reset role;

select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'), 'Apres le depart')), 0::bigint,
  'le partant ne relit pas le message posterieur a son depart (ROUGE avant 0102)');

-- L'historique reste : le message d'avant et sa propre annonce, rien d'autre.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'), 'Avant le depart')), 1::bigint,
  'le partant relit le message d''avant son depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le partant relit l''annonce de son propre depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'l''annonce de son depart est dans sa fenetre, pas au-dela');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'le partant ne voit qu''un seul message normal (fenetre bornee)');

reset role;

-- ===========================================================================
-- Les restants voient tout, comme avant (D-10 ne change rien pour eux).
-- ===========================================================================
select testkit.as_user(user_id, 'frozen-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'les restants voient l''historique complet, message d''apres-depart compris');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'les restants voient l''annonce unique');

reset role;

-- ===========================================================================
-- Silence intact : le ventilateur n'a rien pour Bob sur le post-départ, et
-- la borne ne se déplace pas à la main (aucune politique UPDATE).
-- ===========================================================================
select testkit.eq(testkit.count(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.id = ''frozen-post1'''
  ' and n.user_id = (select user_id from testkit.fx where key = ''bob'')'), 0::bigint,
  'le ventilateur push ignore toujours le partant (inchange)');

select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 0::bigint,
  'le partant seul ne deplace pas sa borne (aucune politique UPDATE)');

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'frozen-intrus',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'bob_m'),
  'Ecrit apres le depart'),
  'le partant n''ecrit plus dans son fil fige');

reset role;

-- ===========================================================================
-- Fenêtre mobile : réadhésion admin (muette), message entre-deux, nouveau
-- départ. Le message entre les deux pierres doit entrer dans la neuve.
-- ===========================================================================
select testkit.as_user(user_id, 'frozen-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- Alice écrit entre les deux départs (après la première pierre).
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)'
  ' select ''frozen-entre'', %L, %L, %L, ''Entre les deux departs'', cm.left_at + interval ''500 milliseconds'''
  ' from public.conversation_members cm where cm.conversation_id = %L and cm.member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'alice_m'),
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m')));

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin supprime la premiere pierre (readhesion)');

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'l''admin reinsere Bob (readhesion)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'la readhesion n''annonce rien');

reset role;

-- L'horloge avance : la seconde pierre tombera après l'entre-deux (+500 ms).
select pg_sleep(2);

select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Bob quitte a nouveau son fil (fenetre neuve)');

reset role;

select testkit.as_user(user_id, 'frozen-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

-- Alice écrit après le second départ de Bob.
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)'
  ' select ''frozen-post2'', %L, %L, %L, ''Apres le second depart'', cm.left_at + interval ''1 minute'''
  ' from public.conversation_members cm where cm.conversation_id = %L and cm.member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'alice_m'),
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m')));

reset role;

-- Fenêtre 2 côté partant : avant + entre-deux + deux annonces, rien de plus.
select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'), 'Entre les deux departs')), 1::bigint,
  'la fenetre neuve couvre le message poste entre les deux departs (elle a bouge)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'), 'Apres le depart')), 0::bigint,
  'la premiere ombre reste hors fenetre apres le second depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'), 'Apres le second depart')), 0::bigint,
  'le second message d''apres-depart est hors fenetre lui aussi');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'le partant relit ses deux annonces de depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'le partant voit deux normaux (avant + entre-deux), pas un de plus');

reset role;

-- Restants après les deux départs : 4 normaux + 2 annonces.
select testkit.as_user(user_id, 'frozen-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 4::bigint,
  'les restants voient les quatre normaux apres les deux departs');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'les restants voient les deux annonces');

reset role;

-- ===========================================================================
-- D-08 intact : le retrait des archives rend pleinement aveugle.
-- ===========================================================================
select testkit.as_user(user_id, 'frozen-bob@example.fr') from testkit.fx where key = 'bob';
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

rollback;
