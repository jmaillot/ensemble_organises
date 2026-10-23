-- supabase/tests/0136_note_couverture.sql
-- Photo de couverture d'une note (migration 0136).
--
-- CE QUI EST VÉRIFIÉ, ET POURQUOI LE FK NE SUFFIT PAS. La couverture est une
-- pièce jointe **désignée**, pas copiée. Le FK garantit que la pièce existe ;
-- il ne dit rien du propriétaire. Sans le déclencheur, un `update` pouvait
-- désigner la photo d'une autre note — y compris celle d'une note privée — et
-- l'afficher en bandeau sur une note partagée. C'est l'assertion (a).
--
-- L'assertion (b) prouve que la désignation légitime passe, et (c) que la
-- suppression de la photo ramène la couverture à NULL : la carte retombe alors
-- sur la première image restante, jamais sur une image morte.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage porte sur les identifiants
-- `*_t136*`, jamais sur une table entière. Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice   uuid := testkit.auth_user('t136-alice@example.fr', 'Alice Couverture');
  home    text := testkit.household(alice, 'Foyer Couverture');
  alice_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Couverture', 'admin');

  insert into public.notes (id, household_id, title, created_by)
  values ('note_t136_a', home, 'Note avec photo', alice_m),
         ('note_t136_b', home, 'Autre note', alice_m);

  insert into public.note_attachments (id, note_id, household_id, file_url, file_name, mime_type, size_bytes)
  values ('attach_t136_a', 'note_t136_a', home, 'notes/note_t136_a/photo.jpg', 'photo.jpg', 'image/jpeg', 1024),
         ('attach_t136_b', 'note_t136_b', home, 'notes/note_t136_b/autre.jpg', 'autre.jpg', 'image/jpeg', 2048);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Une couverture empruntée à une autre note est refusée.
-- ---------------------------------------------------------------------------
select testkit.expect_denied(
  $q$update public.notes set cover_attachment_id = 'attach_t136_b' where id = 'note_t136_a'$q$,
  'la couverture ne peut pas être la pièce jointe d''une autre note');

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t136_a' and cover_attachment_id is null$q$),
    1::bigint,
    'le refus laisse la couverture inchangée');
end;
$$;

-- ---------------------------------------------------------------------------
-- (b) Sa propre pièce jointe est acceptée.
-- ---------------------------------------------------------------------------
select testkit.expect_ok(
  $q$update public.notes set cover_attachment_id = 'attach_t136_a' where id = 'note_t136_a'$q$);

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t136_a' and cover_attachment_id = 'attach_t136_a'$q$),
    1::bigint,
    'la note porte la couverture choisie');
end;
$$;

-- ---------------------------------------------------------------------------
-- (c) Supprimer la photo ramène la couverture à NULL.
-- ---------------------------------------------------------------------------
select testkit.expect_ok($q$delete from public.note_attachments where id = 'attach_t136_a'$q$);

do $$
begin
  perform testkit.eq(
    testkit.count($q$select 1 from public.notes where id = 'note_t136_a' and cover_attachment_id is null$q$),
    1::bigint,
    'la couverture tombe avec la photo supprimée');
end;
$$;

rollback;
