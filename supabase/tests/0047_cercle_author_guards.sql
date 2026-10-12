-- supabase/tests/0047_cercle_author_guards.sql
-- Phase 11 Cercle (plan 11-01, D-01/D-03) : l'auteur (ou un admin) seul
-- modifie/supprime le contenu ; la bascule des reactions, la cascade de fil,
-- les chemins medias et la relaxation 0081 (tasks/notes) sont intacts.
--
-- Rouge→vert : avant 0109, « Bob reecrit le texte du post d'Alice » rendait
-- 1 ligne (D-01 ouvert) et « Bob supprime son propre post » rendait 0 ligne
-- (D-03 ferme) — les deux reproduits par la sonde initiale, qui les a
-- inverses apres la migration. Apres 0109, toute la suite est verte :
-- contenu etranger refuse (trigger 42501, auteur fige), contenu propre et
-- moderation admin autorises, suppression auteur-ou-admin sur les trois
-- tables, cascade de fil intacte, exterieur aveugle, inter-foyer clos,
-- 0081 tasks/notes intact.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borne au foyer ou a l'objet
-- via testkit.fx — jamais de total nu sur une table entiere.

begin;

do $$
declare
  alice uuid := testkit.auth_user('cercle-alice@example.fr', 'Alice Cercle');
  bob uuid := testkit.auth_user('cercle-bob@example.fr', 'Bob Cercle');
  kid uuid := testkit.auth_user('cercle-kid@example.fr', 'Noe Cercle');
  outsider uuid := testkit.auth_user('cercle-outsider@example.fr', 'Olivier Fantome');
  carol uuid := testkit.auth_user('cercle-carol@example.fr', 'Carol Voisine');
  home_a text := testkit.household(alice, 'Foyer Cercle Auteur');
  home_b text := testkit.household(carol, 'Foyer Cercle Voisin');
  alice_m text;
  bob_m text;
  kid_m text;
  carol_m text;
  post_a text := private.new_id('post');
  post_b text := private.new_id('post');
  post_c text := private.new_id('post');
  comment_a1 text := private.new_id('post-comment');
  comment_b1 text := private.new_id('post-comment');
  comment_b2 text := private.new_id('post-comment');
  react_b1 text := private.new_id('post-reaction');
  react_b3 text := private.new_id('post-reaction');
  media_a1 text := private.new_id('post-media');
  task_a text := private.new_id('task');
  note_a text := private.new_id('note');
begin
  alice_m := testkit.member(home_a, alice, 'Alice Cercle', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob Cercle', 'membre', 'ink');
  kid_m := testkit.member(home_a, kid, 'Noe Cercle', 'enfant', 'amber');
  carol_m := testkit.member(home_b, carol, 'Carol Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid),
    ('outsider', outsider), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('kid_m', kid_m),
    ('carol_m', carol_m),
    ('post_a', post_a),
    ('post_b', post_b),
    ('post_c', post_c),
    ('comment_a1', comment_a1),
    ('comment_b1', comment_b1),
    ('comment_b2', comment_b2),
    ('react_b1', react_b1),
    ('react_b3', react_b3),
    ('media_a1', media_a1),
    ('task_a', task_a),
    ('note_a', note_a);

  insert into public.posts (id, household_id, author_id, text)
  values (post_a, home_a, alice_m, 'Post Alice Auteur'),
         (post_b, home_a, bob_m, 'Post Bob Auteur'),
         (post_c, home_a, bob_m, 'Post Bob Moderation');
  insert into public.post_comments (id, post_id, household_id, author_id, content)
  values (comment_a1, post_a, home_a, alice_m, 'Commentaire Alice Auteur'),
         (comment_b1, post_a, home_a, bob_m, 'Commentaire Bob Auteur'),
         (comment_b2, post_a, home_a, bob_m, 'Commentaire Bob Cascade');
  insert into public.post_reactions (id, post_id, household_id, author_id, reaction_type)
  values (react_b1, post_a, home_a, bob_m, 'coeur'),
         (react_b3, post_a, home_a, alice_m, 'coeur');
  insert into public.post_media (id, post_id, household_id, media_type, url)
  values (media_a1, post_a, home_a, 'photo', 'https://example.fr/auteur.jpg');
  insert into public.tasks (id, household_id, name, status, created_by)
  values (task_a, home_a, 'Tache Alice Auteur', 'a_faire', alice_m);
  insert into public.notes (id, household_id, title, content, created_by)
  values (note_a, home_a, 'Note Alice Auteur', 'contenu', alice_m);
end;
$$;

-- ===========================================================================
-- D-01 : un membre ne reecrit pas le contenu d'autrui (trigger 42501).
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.posts set text = %L where id = %L',
  'Reecrit par Bob Auteur',
  (select row_id from testkit.fx where key = 'post_a')),
  'un membre ne reecrit pas le texte du post d''autrui');

select testkit.expect_denied(format(
  'update public.post_comments set content = %L where id = %L',
  'Reecrit par Bob Auteur',
  (select row_id from testkit.fx where key = 'comment_a1')),
  'un membre ne reecrit pas le commentaire d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L and text = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_a'), 'Post Alice Auteur')), 1::bigint,
  'le post d''autrui est intact apres la tentative');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_comments where household_id = %L and id = %L and content = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'comment_a1'), 'Commentaire Alice Auteur')), 1::bigint,
  'le commentaire d''autrui est intact apres la tentative');

reset role;

-- ===========================================================================
-- D-01 : l'auteur modifie son propre contenu.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.posts set text = %L where id = %L',
  'Post Bob Retouche',
  (select row_id from testkit.fx where key = 'post_b'))), 1::bigint,
  'l''auteur retouche son propre post');

select testkit.eq(testkit.affected(format(
  'update public.post_comments set content = %L where id = %L',
  'Commentaire Bob Retouche',
  (select row_id from testkit.fx where key = 'comment_b1'))), 1::bigint,
  'l''auteur retouche son propre commentaire');

reset role;

-- ===========================================================================
-- D-01 : l'admin modere le contenu d'autrui.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.posts set text = %L where id = %L',
  'Post Bob Modere',
  (select row_id from testkit.fx where key = 'post_b'))), 1::bigint,
  'l''admin modere le post d''autrui');

reset role;

-- ===========================================================================
-- 0081 intact : la colonne d'auteur reste fige, meme pour son propre post.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(format(
  'update public.posts set author_id = %L where id = %L',
  (select row_id from testkit.fx where key = 'alice_m'),
  (select row_id from testkit.fx where key = 'post_b')),
  'la colonne author_id n''est pas modifiable par le client');

reset role;

-- ===========================================================================
-- Un enfant ne modifie pas le contenu du foyer (lecture seule).
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.posts set text = %L where id = %L',
  'Reecrit par Noe Auteur',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'un enfant ne modifie pas les posts du foyer');

reset role;

-- ===========================================================================
-- D-02 : bascule des reactions inchangee (insert soi, unicite, retrait soi).
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.post_reactions (id, post_id, household_id, author_id, reaction_type) values (%L, %L, %L, %L, %L)',
  private.new_id('post-reaction'),
  (select row_id from testkit.fx where key = 'post_b'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'bob_m'), 'coeur')), 1::bigint,
  'un membre pose sa reaction (bascule aller)');

select testkit.expect_denied(format(
  'insert into public.post_reactions (id, post_id, household_id, author_id, reaction_type) values (%L, %L, %L, %L, %L)',
  private.new_id('post-reaction'),
  (select row_id from testkit.fx where key = 'post_b'),
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'bob_m'), 'coeur'),
  'la double reaction reste refusee (unicite auteur)');

select testkit.eq(testkit.affected(format(
  'delete from public.post_reactions where household_id = %L and post_id = %L and author_id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'),
  (select row_id from testkit.fx where key = 'bob_m'))), 1::bigint,
  'un membre retire sa reaction (bascule retour)');

reset role;

-- ===========================================================================
-- D-03 : l'auteur supprime son propre contenu.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.post_comments where id = %L',
  (select row_id from testkit.fx where key = 'comment_b1'))), 1::bigint,
  'l''auteur supprime son propre commentaire');

reset role;

-- ===========================================================================
-- D-03 : un membre ne supprime pas le contenu d'autrui.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'un membre ne supprime pas le post d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_comments where id = %L',
  (select row_id from testkit.fx where key = 'comment_a1'))), 0::bigint,
  'un membre ne supprime pas le commentaire d''autrui');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_a'))), 1::bigint,
  'le post d''autrui survit a la tentative de suppression');

reset role;

-- ===========================================================================
-- D-03 : l'admin modere (supprime le contenu d'autrui, reactions comprises).
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_c'))), 1::bigint,
  'l''admin supprime le post d''autrui');

select testkit.eq(testkit.affected(format(
  'delete from public.post_reactions where id = %L',
  (select row_id from testkit.fx where key = 'react_b1'))), 1::bigint,
  'l''admin supprime la reaction d''autrui');

reset role;

-- ===========================================================================
-- Medias : chemins inchanges — un membre ne supprime pas un media seul,
-- la cascade de fil reste le chemin de retrait.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.post_media where id = %L',
  (select row_id from testkit.fx where key = 'media_a1'))), 0::bigint,
  'un membre ne supprime pas un media seul (politique inchangee)');

reset role;

-- ===========================================================================
-- Cascade de fil intacte : supprimer le post aspire commentaires, medias,
-- reactions — sans elargissement (l'autre post survit).
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 1::bigint,
  'l''admin supprime le fil entier');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_comments where post_id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'les commentaires suivent le fil supprime');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_media where post_id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'les medias suivent le fil supprime');

select testkit.eq(testkit.count(format(
  'select 1 from public.post_reactions where post_id = %L',
  (select row_id from testkit.fx where key = 'post_a'))), 0::bigint,
  'les reactions suivent le fil supprime');

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'))), 1::bigint,
  'l''autre post du foyer survit a la suppression du fil');

reset role;

-- ===========================================================================
-- Negatives : exterieur aveugle, inter-foyer clos.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L',
  (select household_id from testkit.fx where key = 'home_a'))), 0::bigint,
  'un exterieur ne lit pas les posts du foyer');

select testkit.eq(testkit.affected(format(
  'update public.posts set text = %L where id = %L',
  'Reecrit par Fantome Auteur',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un exterieur ne modifie pas les posts du foyer');

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un exterieur ne supprime pas les posts du foyer');

reset role;

select testkit.as_user(user_id, 'cercle-carol@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un membre d''un autre foyer ne lit pas le post');

select testkit.eq(testkit.affected(format(
  'update public.posts set text = %L where id = %L',
  'Reecrit par Voisine Auteur',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un membre d''un autre foyer ne modifie pas le post');

select testkit.eq(testkit.affected(format(
  'delete from public.posts where id = %L',
  (select row_id from testkit.fx where key = 'post_b'))), 0::bigint,
  'un membre d''un autre foyer ne supprime pas le post');

reset role;

select testkit.as_user(user_id, 'cercle-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.posts where household_id = %L and id = %L and text = %L',
  (select household_id from testkit.fx where key = 'home_a'),
  (select row_id from testkit.fx where key = 'post_b'), 'Post Bob Modere')), 1::bigint,
  'le post survit aux tentatives inter-foyers');

reset role;

-- ===========================================================================
-- 0081 intact : un membre modifie toujours la tache/note creee par autrui.
-- ===========================================================================
select testkit.as_user(user_id, 'cercle-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.tasks set name = %L where id = %L',
  'Tache renommee Auteur',
  (select row_id from testkit.fx where key = 'task_a'))), 1::bigint,
  'un membre renomme la tache creee par un autre membre (0081 intact)');

select testkit.eq(testkit.affected(format(
  'update public.notes set title = %L where id = %L',
  'Note retitree Auteur',
  (select row_id from testkit.fx where key = 'note_a'))), 1::bigint,
  'un membre modifie la note creee par un autre membre (0081 intact)');

reset role;

rollback;
