-- supabase/tests/0052_sender_only_delete.sql
-- Phase 11 Cercle (plan 11-04, D-07) : la suppression unitaire est
-- strictement auteur sur posts/commentaires/reactions comme sur messages ;
-- l'archivage admin du fil reste intact (fige, ne detruit pas).
--
-- Rouge→vert : avant 0117, la sonde `_sonde_red_1104` prouvait que l'admin
-- supprimait le post, le commentaire et la reaction d'autrui (1 ligne par
-- table) ; les messages rendaient deja 0 (0100, pre-securise). Apres 0117,
-- toute la suite est verte : auteur supprime le sien (dont bascule retour
-- des reactions), membre et admin ne suppriment plus autrui, exterieur
-- aveugle, inter-foyer clos, cascade auteur intacte, messages toujours
-- auteur-seul, archive RPC intacte (refus non-admin, tombe collective,
-- histoire relue, ecritures figees).
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borne au foyer, au fil ou a
-- l'objet via testkit.fx — jamais de total nu sur une table entiere.

begin;

do $$
declare
  alice uuid := testkit.auth_user('snd-alice@example.fr', 'Alice Cercle');
  bob uuid := testkit.auth_user('snd-bob@example.fr', 'Bob Cercle');
  outsider uuid := testkit.auth_user('snd-outsider@example.fr', 'Olivier Fantome');
  carol uuid := testkit.auth_user('snd-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Cercle Auteur-Seul');
  home_b text := testkit.household(carol, 'Foyer Cercle Voisin');
  alice_m text;
  bob_m text;
  carol_m text;
  post_a text := private.new_id('post');
  post_b text := private.new_id('post');
  post_c text := private.new_id('post');
  comment_a1 text := private.new_id('post-comment');
  comment_b1 text := private.new_id('post-comment');
  comment_b2 text := private.new_id('post-comment');
  comment_c1 text := private.new_id('post-comment');
  react_a1 text := private.new_id('post-reaction');
  react_b1 text := private.new_id('post-reaction');
  react_b2 text := private.new_id('post-reaction');
  react_c1 text := private.new_id('post-reaction');
  media_c1 text := private.new_id('post-media');
  conv text := private.new_id('conversation');
  msg_alice text := private.new_id('message');
  msg_bob text := private.new_id('message');
  msg_bob2 text := private.new_id('message');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Cercle', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Cercle', 'membre', 'ink');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob),
    ('outsider', outsider), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('carol_m', carol_m),
    ('post_a', post_a),
    ('post_b', post_b),
    ('post_c', post_c),
    ('comment_a1', comment_a1),
    ('comment_b1', comment_b1),
    ('comment_b2', comment_b2),
    ('comment_c1', comment_c1),
    ('react_a1', react_a1),
    ('react_b1', react_b1),
    ('react_b2', react_b2),
    ('react_c1', react_c1),
    ('media_c1', media_c1),
    ('conv', conv),
    ('msg_alice', msg_alice),
    ('msg_bob', msg_bob),
    ('msg_bob2', msg_bob2);

  insert into public.posts (id, household_id, author_id, text)
  values (post_a, home_a, alice_m, 'Post Alice Auteur'),
         (post_b, home_a, bob_m, 'Post Bob Auteur'),
         (post_c, home_a, bob_m, 'Post Bob Cascade');
  insert into public.post_comments (id, post_id, household_id, author_id, content)
  values (comment_a1, post_a, home_a, alice_m, 'Commentaire Alice Auteur'),
         (comment_b1, post_a, home_a, bob_m, 'Commentaire Bob Auteur'),
         (comment_b2, post_b, home_a, bob_m, 'Commentaire Bob Second'),
         (comment_c1, post_c, home_a, bob_m, 'Commentaire Bob Cascade');
  insert into public.post_reactions (id, post_id, household_id, author_id, reaction_type)
  values (react_a1, post_a, home_a, alice_m, 'coeur'),
         (react_b1, post_a, home_a, bob_m, 'coeur'),
         (react_b2, post_b, home_a, bob_m, 'coeur'),
         (react_c1, post_c, home_a, bob_m, 'coeur');
  insert into public.post_media (id, post_id, household_id, media_type, url)
  values (media_c1, post_c, home_a, 'photo', 'https://example.fr/cascade.jpg');

  insert into public.conversations (id, household_id, type, title)
  values (conv, home_a, 'groupe', 'Salon Auteur-Seul');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m);
  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_alice, conv, home_a, alice_m, 'Bonsoir'),
         (msg_bob, conv, home_a, bob_m, 'Salut'),
         (msg_bob2, conv, home_a, bob_m, 'A demain');
end;
$$;

-- ===========================================================================
-- D-07 : l'auteur supprime son propre contenu (dont bascule retour).
-- ===========================================================================
select testkit.as_user(user_id, 'snd-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.post_comments where id = %L',
  (select row_id from testkit.fx where key = 'comment_b1'))), 1::bigint,
  'l''auteur supprime son propre commentaire');

select testkit.eq(testkit.affected(format(
  'delete from public.post_reactions where id = %L',
  (select row_id from testkit.fx where key = 'react_b1'))), 1::bigint,
  'l''auteur retire sa propre reaction (bascule retour)');

reset role;

-- ===========================================================================
-- D-07 : un membre ne supprime pas le contenu d'autrui.
-- ===========================================================================
select testkit.as_user(user_id, 'snd-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'un membre ne supprime pas le post d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_comments where id = %L',
  (select row_id from testkit.fx where key = 'comment_a1'))), 0::bigint,
  'un membre ne supprime pas le commentaire d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_reactions where id = %L',
  (select row_id from testkit.fx where key = 'react_a1'))), 0::bigint,
  'un membre ne supprime pas la reaction d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_a'))), 1::bigint,
  'le post d''autrui survit a la tentative de suppression');

reset role;

-- ===========================================================================
-- D-07 : l'admin ne supprime plus le contenu unitaire d'autrui (branche
-- retiree — rouge avant 0117, 1 ligne par table dans la sonde).
-- ===========================================================================
select testkit.as_user(user_id, 'snd-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'l''admin ne supprime plus le post d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_comments where id = %L',
  (select row_id from testkit.fx where key = 'comment_b2'))), 0::bigint,
  'l''admin ne supprime plus le commentaire d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_reactions where id = %L',
  (select row_id from testkit.fx where key = 'react_b2'))), 0::bigint,
  'l''admin ne supprime plus la reaction d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'))), 1::bigint,
  'le post d''autrui survit a la tentative admin');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_comments where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'comment_b2'))), 1::bigint,
  'le commentaire d''autrui survit a la tentative admin');

reset role;

-- ===========================================================================
-- Negatives : exterieur aveugle, inter-foyer clos.
-- ===========================================================================
select testkit.as_user(user_id, 'snd-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un exterieur ne lit pas les posts du foyer');

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un exterieur ne supprime pas les posts du foyer');

reset role;

select testkit.as_user(user_id, 'snd-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un membre d''un autre foyer ne lit pas le post');

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un membre d''un autre foyer ne supprime pas le post');

reset role;

-- ===========================================================================
-- Cascade auteur inchangee : supprimer SON post aspire enfants par FK,
-- l'autre post du foyer survit.
-- ===========================================================================
select testkit.as_user(user_id, 'snd-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_c'))), 1::bigint,
  'l''auteur supprime son propre fil');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_comments where post_id = %L',
  (select row_id from testkit.fx where key = 'post_c'))), 0::bigint,
  'les commentaires suivent le fil supprime par son auteur');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_media where post_id = %L',
  (select row_id from testkit.fx where key = 'post_c'))), 0::bigint,
  'les medias suivent le fil supprime par son auteur');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_reactions where post_id = %L',
  (select row_id from testkit.fx where key = 'post_c'))), 0::bigint,
  'les reactions suivent le fil supprime par son auteur');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'))), 1::bigint,
  'l''autre post du foyer survit a la suppression du fil');

reset role;

-- ===========================================================================
-- Messages (0100, pre-securise) : auteur seul, sans reconstruction.
-- ===========================================================================
select testkit.as_user(user_id, 'snd-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_bob'))), 1::bigint,
  'l''auteur supprime son propre message');

reset role;

select testkit.as_user(user_id, 'snd-alice@example.fr') from testkit.fx where key = 'alice';
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
-- Archive RPC intacte (0106, prouvee non rescopee) : refus non-admin, tombe
-- collective admin, histoire relue, ecritures figees pour chacun.
-- ===========================================================================
select testkit.as_user(user_id, 'snd-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.archive_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv')),
  'un non-admin n''archive pas le fil');

reset role;

select testkit.as_user(user_id, 'snd-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.archive_conversation(%L)',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'l''admin archive le fil (tombe collective)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'conv'))), 0::bigint,
  'l''archive ne laisse aucun actif dans le fil');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'l''archive conserve les appartenances (fige, ne detruit pas)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L and sender_id is not null',
  (select row_id from testkit.fx where key = 'conv'))), 2::bigint,
  'l''histoire utile reste lisible apres l''archive');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'conv'))), 1::bigint,
  'l''annonce d''archive est la seule ligne systeme du fil');

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  private.new_id('message'),
  (select row_id from testkit.fx where key = 'conv'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'alice_m'),
  'Ecrit apres l''archive'),
  'l''admin n''ecrit plus dans le fil archive');

select testkit.eq(testkit.affected(format(
  'delete from public.messages where id = %L',
  (select row_id from testkit.fx where key = 'msg_alice'))), 0::bigint,
  'l''admin ne supprime plus meme son message dans le fil archive');

reset role;

rollback;
