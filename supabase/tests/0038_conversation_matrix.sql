-- supabase/tests/0038_conversation_matrix.sql
-- Phase 08 Messages (plan 08-01) : dépôt d'images messages par les enfants
-- (D-01) + matrice RLS des conversations (D-06).
--
-- Constat (audit, 08-CONTEXT D-01) : un enfant converse en texte (0041) mais
-- son dépôt d'image dans `household-media/<foyer>/messages/<fil>/<fichier>`
-- est refusé (403) — `household_media_insert` (0010) exige
-- `can_write_household` (admin/membre). La migration 0099 ouvre le dépôt aux
-- membres du fil, enfant inclus, sur le seul préfixe messages/ — conversation
-- dérivée du chemin côté serveur, jamais d'un identifiant fourni par le
-- client sans revérification d'appartenance.
--
-- Exécution rouge→vert : avant 0099, « l'enfant membre du fil dépose » échoue
-- (403 prouvé, pas de correction aveugle) ; après 0099, toute la suite est
-- verte. D-06 vit dans le même fichier : un seul foyer de preuve
-- « conversations + médias messages », pas de suite fourre-tout.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer, au fil ou à
-- l'objet via testkit.fx — jamais de total nu sur une table entière.

begin;

do $$
declare
  alice uuid := testkit.auth_user('mconv-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('mconv-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('mconv-kid@example.fr', 'Noé Martin');
  kid_out uuid := testkit.auth_user('mconv-kid-out@example.fr', 'Léa Martin');
  outsider uuid := testkit.auth_user('mconv-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Messages Matrice');
  alice_m text;
  bob_m text;
  kid_m text;
  kid_out_m text;
  conv text := private.new_id('conversation');
  conv_other text := private.new_id('conversation');
  msg_alice text := private.new_id('message');
  msg_bob text := private.new_id('message');
  msg_bob2 text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  kid_m := testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');
  kid_out_m := testkit.member(home, kid_out, 'Léa Martin', 'enfant', 'coral');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid),
    ('kid_out', kid_out), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('kid_m', kid_m),
    ('kid_out_m', kid_out_m),
    ('conv', conv),
    ('conv_other', conv_other),
    ('msg_alice', msg_alice),
    ('msg_bob', msg_bob),
    ('msg_bob2', msg_bob2);

  -- Fil principal Alice + Bob + Noé ; fil témoin Alice + Bob (Noé hors fil).
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon'), (conv_other, home, 'groupe', 'Salon bis');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, kid_m),
         (conv_other, alice_m), (conv_other, bob_m);

  -- Trois messages témoins dans le fil principal : Alice, puis Bob deux fois.
  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_alice, conv, home, alice_m, 'Bonsoir'),
         (msg_bob, conv, home, bob_m, 'Salut'),
         (msg_bob2, conv, home, bob_m, 'À demain');
end;
$$;

-- ===========================================================================
-- D-01 : l'enfant membre du fil dépose son image.
-- (ROUGE avant 0099 — 403 prouvé par l'échec de la première assertion sans
-- la migration ; VERT après.)
-- ===========================================================================
select testkit.as_user(user_id, 'mconv-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

-- Le chemin reproduit le dépôt client à l'octet près (api.ts
-- depositMessageImage) : `<foyer>/messages/<fil>/<média>.<ext>`.
select testkit.eq(testkit.affected(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/messages/'
    || (select row_id from testkit.fx where key = 'conv') || '/photo-noe.jpg',
  (select user_id from testkit.fx where key = 'kid'))), 1::bigint,
  'l''enfant membre du fil depose son image messages (D-01)');

-- Membre du fil, mais préfixe hors messages/ : refusé — le dépôt reste
-- confiné au préfixe messages/, sans élargissement du seau.
select testkit.expect_denied(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/cercle/photo-noe.jpg',
  (select user_id from testkit.fx where key = 'kid')),
  'le depot enfant reste confine au prefixe messages/');

-- Membre du fil principal, autre fil du même foyer : refusé — la porte est
-- l'appartenance à CE fil, pas au foyer.
select testkit.expect_denied(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/messages/'
    || (select row_id from testkit.fx where key = 'conv_other') || '/photo-noe.jpg',
  (select user_id from testkit.fx where key = 'kid')),
  'pas de depot dans un fil dont on n''est pas membre');

reset role;

-- Enfant du foyer mais hors fil : refusé — même rôle, pas le même fil.
select testkit.as_user(user_id, 'mconv-kid-out@example.fr') from testkit.fx where key = 'kid_out';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/messages/'
    || (select row_id from testkit.fx where key = 'conv') || '/photo-lea.jpg',
  (select user_id from testkit.fx where key = 'kid_out')),
  'l''enfant hors fil ne depose pas dans un fil qui n''est pas le sien');

reset role;

-- Extérieur au foyer : refusé.
select testkit.as_user(user_id, 'mconv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home') || '/messages/'
    || (select row_id from testkit.fx where key = 'conv') || '/photo-intrus.jpg',
  (select user_id from testkit.fx where key = 'outsider')),
  'un exterieur ne depose aucune image messages');

-- ===========================================================================
-- D-06 : matrice RLS des conversations (preuves avec négatifs).
-- ===========================================================================

-- Extérieur : aucun SELECT sur le fil existant — ni la conversation, ni ses
-- membres, ni ses messages.
select testkit.as_user(user_id, 'mconv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un exterieur ne lit pas la conversation');
select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un exterieur ne lit pas les membres du fil');
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un exterieur ne lit pas les messages du fil');

reset role;

-- Membre du foyer mais hors fil (Léa, enfant) : le fil reste invisible —
-- l'isolation est au fil, pas au foyer.
select testkit.as_user(user_id, 'mconv-kid-out@example.fr') from testkit.fx where key = 'kid_out';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'home'),
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'un membre hors fil ne lit pas les messages du fil');

reset role;

-- messages_update : l'auteur modifie son contenu (D-02 RLS-prête).
select testkit.as_user(user_id, 'mconv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.messages set content = %L where id = %L',
  'Bonsoir (precise)',
  (select row_id from testkit.fx where key = 'msg_alice'))), 1::bigint,
  'l''auteur modifie son propre message');

reset role;

-- Autrui (membre du fil, non auteur) : 0 ligne, sans erreur.
select testkit.as_user(user_id, 'mconv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.messages set content = %L where id = %L',
  'Reecrit par Bob',
  (select row_id from testkit.fx where key = 'msg_alice'))), 0::bigint,
  'un autre membre ne modifie pas le message d''autrui');

reset role;

-- Extérieur : 0 ligne, sans erreur.
select testkit.as_user(user_id, 'mconv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.messages set content = %L where id = %L',
  'Reecrit par l''exterieur',
  (select row_id from testkit.fx where key = 'msg_alice'))), 0::bigint,
  'un exterieur ne modifie aucun message');

reset role;

-- Le message d'Alice est intact après les deux tentatives.
select testkit.as_user(user_id, 'mconv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L and id = %L and content = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'msg_alice'), 'Bonsoir (precise)')), 1::bigint,
  'le message de l''auteur est intact apres les tentatives d''autrui');

reset role;

-- messages_delete : non-auteur non-admin (Bob sur le message d'Alice) : 0.
select testkit.as_user(user_id, 'mconv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_alice'))), 0::bigint,
  'un membre non auteur et non admin ne supprime pas le message d''autrui');

reset role;

-- Extérieur : 0 ligne, sans erreur.
select testkit.as_user(user_id, 'mconv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_alice'))), 0::bigint,
  'un exterieur ne supprime aucun message');

reset role;

-- Auteur (Bob, son deuxième message) : 1 ligne (D-03 RLS-prête).
select testkit.as_user(user_id, 'mconv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob2'))), 1::bigint,
  'l''auteur supprime son propre message');

reset role;

-- Admin (Alice, message restant de Bob) : 1 ligne (D-03 RLS-prête).
select testkit.as_user(user_id, 'mconv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob'))), 1::bigint,
  'l''admin supprime un message du fil');

-- Le fil ne contient plus que le message d'Alice (borné au fil).
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'apres suppressions legitimes, seul le message de l''auteur reste');

reset role;

-- conversation_members_delete : non-admin (Bob) retirant autrui (Alice) : 0.
select testkit.as_user(user_id, 'mconv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'alice_m'))), 0::bigint,
  'un membre non admin ne retire pas autrui du fil');

reset role;

-- Non-membre du fil (Léa) : 0 ligne, sans erreur.
select testkit.as_user(user_id, 'mconv-kid-out@example.fr') from testkit.fx where key = 'kid_out';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 0::bigint,
  'un non-membre du fil n''en retire personne');

reset role;

-- Extérieur : 0 ligne, sans erreur.
select testkit.as_user(user_id, 'mconv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'bob_m'))), 0::bigint,
  'un exterieur n''en retire personne');

reset role;

-- Self-leave (Noé quitte son fil, D-04 RLS-prête) : 1 ligne. En dernier :
-- Noé n'est plus membre après, aucun test ultérieur n'en dépend.
select testkit.as_user(user_id, 'mconv-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'conv'),
  (select row_id from testkit.fx where key = 'kid_m'))), 1::bigint,
  'un membre quitte lui-meme son fil');

reset role;

-- ===========================================================================
-- D-06 (fin) : isolation notification_reads sur portée conversation réelle —
-- Alice marque le fil lu ; Bob ne voit rien de sa ligne et ne peut l'écrire
-- à sa place (0015 prouve le mécanisme ; ici la portée est le fil du foyer).
-- ===========================================================================
select testkit.as_user(user_id, 'mconv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id) values (%L, %L, %L, %L)',
  'mconv-nr-alice', (select user_id from testkit.fx where key = 'alice'),
  'conversation', (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'Alice marque le fil lu dans son propre registre');

reset role;

select testkit.as_user(user_id, 'mconv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.notification_reads where scope = %L and scope_id = %L',
  'conversation', (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'Bob ne lit pas la ligne de lecture d''Alice sur le fil');
select testkit.expect_denied(format(
  'insert into public.notification_reads (id, user_id, scope, scope_id) values (%L, %L, %L, %L)',
  'mconv-nr-intrus', (select user_id from testkit.fx where key = 'alice'),
  'conversation', (select row_id from testkit.fx where key = 'conv')),
  'Bob ne peut pas ecrire une ligne de lecture au nom d''Alice');
select testkit.eq(testkit.affected(
  'update public.notification_reads set read_at = now() where id = ''mconv-nr-alice'''), 0::bigint,
  'Bob ne touche pas l''horodatage de lecture d''Alice');
select testkit.eq(testkit.affected(
  'delete from public.notification_reads where id = ''mconv-nr-alice'''), 0::bigint,
  'Bob ne supprime pas la ligne de lecture d''Alice');

reset role;

-- La ligne d'Alice a survécu aux tentatives de Bob (bornée à l'objet).
select testkit.eq(testkit.count(
  'select 1 from public.notification_reads where id = ''mconv-nr-alice'''), 1::bigint,
  'la ligne de lecture d''Alice est intacte');

rollback;
