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

reset role;

rollback;
