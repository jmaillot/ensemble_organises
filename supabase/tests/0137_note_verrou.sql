-- supabase/tests/0137_note_verrou.sql
-- Verrou d'une note (migration 0137).
--
-- CE QUE LE VERROU PROMET, ET CE QU'IL NE PROMET PAS. La note reste lisible par
-- tout le foyer : le verrou porte sur l'écriture, pas sur la visibilité. Il
-- fige le contenu pour tous, auteur compris — c'est un verrou, pas un
-- brouillon. Seuls son auteur et un administrateur peuvent le lever.
--
-- POURQUOI LE DÉCLENCHEUR EST INDISPENSABLE. Les politiques RLS autorisent
-- l'`update` d'une note ; elles ne peuvent pas distinguer « lever le verrou »
-- de « réécrire le titre » — les deux sont des `update`. Le test (a) échoue
-- sans le déclencheur, et le test (b) le prouve dans l'autre sens : un membre
-- ne peut pas défaire le verrou d'un autre.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur les identifiants
-- `*_t137*`, jamais sur une table entière. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice   uuid := testkit.auth_user('t137-alice@example.fr', 'Alice Verrou');
  bob     uuid := testkit.auth_user('t137-bob@example.fr', 'Bob Verrou');
  home    text := testkit.household(alice, 'Foyer Verrou');
  alice_m text;
  bob_m   text;
begin
  alice_m := testkit.member(home, alice, 'Alice Verrou', 'admin');
  bob_m   := testkit.member(home, bob, 'Bob Verrou', 'membre');

  -- Deux notes verrouillées : l'une d'Alice, l'autre de Bob ; plus une note
  -- libre qui sert de témoin.
  insert into public.notes (id, household_id, title, content, color, created_by, is_locked)
  values ('note_t137_alice', home, 'Note verrouillée d''Alice', 'Texte figé', 'accent', alice_m, true),
         ('note_t137_bob', home, 'Note verrouillée de Bob', 'Texte figé', 'accent', bob_m, true),
         ('note_t137_libre', home, 'Note libre', 'Texte libre', 'accent', bob_m, false);

  insert into testkit.fx (key, row_id)
  values ('alice_m', alice_m), ('bob_m', bob_m);
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, household_id) values ('home', home);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Un membre ne peut pas réécrire une note verrouillée d'un autre, mais
--     continue de la lire.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't137-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t137_alice'$q$),
    1::bigint,
    'la note verrouillée reste lisible par le foyer');

  perform testkit.expect_denied(
    $q$update public.notes set content = 'réécrit par Bob' where id = 'note_t137_alice'$q$,
    'un membre ne peut pas modifier le contenu d''une note verrouillée');

  perform testkit.expect_denied(
    $q$update public.notes set title = 'Renommée' where id = 'note_t137_bob'$q$,
    'le verrou fige aussi la note de son propre auteur');

  -- Aucune des deux tentatives n'a touché la ligne.
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t137_alice' and content = 'Texte figé'$q$),
    1::bigint,
    'le refus laisse le contenu intact');
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Un membre ne peut pas lever le verrou d'un autre.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$update public.notes set is_locked = false where id = 'note_t137_alice'$q$,
  'seul l''auteur ou un administrateur lève le verrou');

-- ---------------------------------------------------------------------------
-- (c) L'auteur lève le verrou, puis le contenu redevient modifiable.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't137-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_ok(
  $q$update public.notes set is_locked = false where id = 'note_t137_alice'$q$);

select testkit.as_user(user_id, 't137-bob@example.fr') from testkit.fx where key = 'bob';

select testkit.expect_ok(
  $q$update public.notes set content = 'Texte révisé' where id = 'note_t137_alice'$q$);

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t137_alice' and content = 'Texte révisé'$q$),
    1::bigint,
    'après la levée du verrou, un membre peut de nouveau écrire');
end;
$$;

-- ---------------------------------------------------------------------------
-- (d) L'auteur verrouille sa propre note, et la levée est permise.
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $q$update public.notes set is_locked = true where id = 'note_t137_libre'$q$);

select testkit.expect_denied(
  $q$update public.notes set content = 'Verrouillé dans la même foulée' where id = 'note_t137_libre'$q$,
  'le verrou s''applique dès la même transaction');

select testkit.expect_ok(
  $q$update public.notes set is_locked = false where id = 'note_t137_libre'$q$);

-- ---------------------------------------------------------------------------
-- (e) Une note verrouillée n'accepte pas de pièce jointe nouvelle.
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $q$update public.notes set is_locked = true where id = 'note_t137_libre'$q$);

select testkit.expect_denied(
  $q$insert into public.note_attachments (id, note_id, household_id, file_url, file_name, mime_type, size_bytes) values ('attach_t137', 'note_t137_libre', (select household_id from testkit.fx where key = 'home'), 'foyer/notes/a.jpg', 'a.jpg', 'image/jpeg', 12)$q$,
  'pas de pièce jointe sur une note verrouillée');

-- Une fois le verrou levé, la même insertion passe.
do $$
begin
  perform testkit.expect_ok(
    $q$update public.notes set is_locked = false where id = 'note_t137_libre'$q$);
  perform testkit.expect_ok(
    $q$insert into public.note_attachments (id, note_id, household_id, file_url, file_name, mime_type, size_bytes) values ('attach_t137', 'note_t137_libre', (select household_id from testkit.fx where key = 'home'), 'foyer/notes/a.jpg', 'a.jpg', 'image/jpeg', 12)$q$);
  perform testkit.eq(
    testkit.count($q$select 1 from public.note_attachments where id = 'attach_t137'$q$),
    1::bigint,
    'la pièce jointe est acceptée après la levée du verrou');
end;
$$;

rollback;
