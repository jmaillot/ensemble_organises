-- supabase/tests/0013_media_attachments.sql
-- Pièces jointes des animaux et des notes (migration 0043) : isolation par
-- foyer, écriture réservée aux rôles écrivains, suppression aux admins,
-- alignement du foyer sur le parent, cascade depuis le parent, PDF admis.

begin;

do $$
declare
  alice uuid := testkit.auth_user('pj-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('pj-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('pj-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('pj-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Pièces jointes');
  other text := testkit.household(outsider, 'Foyer Voisin');
  alice_m text;
  bob_m text;
  kid_m text;
  pet text;
  note text;
  other_pet text;
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  kid_m := testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');

  insert into public.pets (id, household_id, name, species)
  values ('pj-pet-a', home, 'Nala', 'Chien'), ('pj-pet-b', other, 'Félix', 'Chat');
  -- Identifiants figés : pas de `returning` sur une insertion multi-lignes.
  pet := 'pj-pet-a';
  other_pet := 'pj-pet-b';

  insert into public.notes (id, household_id, title, content, category, created_by)
  values ('pj-note-a', home, 'Ordonnances', 'À classer.', 'Maison', bob_m);
  note := 'pj-note-a';

  insert into public.pet_attachments (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes)
  values ('pj-pa-other', other_pet, other, 'https://stockage/pj-pa-other.pdf', 'voisin.pdf', 'application/pdf', 100);

  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home), ('other', other);
  insert into testkit.fx (key, row_id) values
    ('pet', pet), ('note', note), ('other_pet', other_pet);
end;
$$;

-- Membre : dépose, lit, renomme, mais ne supprime pas (admin uniquement).
select testkit.as_user(user_id, 'pj-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.pet_attachments (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pj-pa-1', (select row_id from testkit.fx where key = 'pet'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pj-pa-1.pdf', 'ordonnance.pdf', 'application/pdf', 48212)), 1::bigint,
  'un membre dépose une pièce jointe sur le carnet de son foyer');

select testkit.eq(testkit.affected(format(
  'insert into public.note_attachments (id, note_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pj-na-1', (select row_id from testkit.fx where key = 'note'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pj-na-1.jpg', 'facture.jpg', 'image/jpeg', 210432)), 1::bigint,
  'un membre dépose une pièce jointe sur une note de son foyer');

select testkit.eq(
  (select count(*) from public.pet_attachments where id = 'pj-pa-1'),
  1::bigint, 'le membre lit la pièce jointe de son foyer');
select testkit.eq(
  (select count(*) from public.note_attachments where id = 'pj-na-1'),
  1::bigint, 'le membre lit la pièce jointe de sa note');
select testkit.eq(
  (select count(*) from public.pet_attachments where id = 'pj-pa-other'),
  0::bigint, 'le membre ne voit pas les pièces jointes du foyer voisin');

select testkit.eq(testkit.affected(
  'update public.pet_attachments set file_name = ''ordonnance-v2.pdf'' where id = ''pj-pa-1'''),
  1::bigint, 'un membre renomme la pièce jointe de son foyer');

-- Un DELETE filtré par la RLS ne lève pas d'erreur : il ne touche rien.
select testkit.eq(testkit.affected(
  'delete from public.pet_attachments where id = ''pj-pa-1'''),
  0::bigint, 'un membre ne supprime pas : la suppression exige un admin');

-- Le foyer ne peut pas diverger du parent : le déclencheur refuse avant tout.
select testkit.expect_denied(format(
  'insert into public.pet_attachments (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pj-pa-x', (select row_id from testkit.fx where key = 'pet'),
  (select household_id from testkit.fx where key = 'other'),
  'https://stockage/pj-pa-x.pdf', 'intruse.pdf', 'application/pdf', 10),
  'le foyer d''une pièce jointe suit son animal');

reset role;

-- Extérieur : ni lecture ni dépôt, dans aucun foyer.
select testkit.as_user(user_id, 'pj-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(
  (select count(*) from public.pet_attachments),
  0::bigint, 'un extérieur ne lit aucune pièce jointe animale');
select testkit.eq(
  (select count(*) from public.note_attachments),
  0::bigint, 'un extérieur ne lit aucune pièce jointe de note');

select testkit.expect_denied(format(
  'insert into public.pet_attachments (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pj-pa-y', (select row_id from testkit.fx where key = 'pet'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pj-pa-y.pdf', 'pirate.pdf', 'application/pdf', 10),
  'un extérieur ne dépose rien dans un autre foyer');

reset role;

-- Enfant : lecture seule, comme sur le reste du foyer.
select testkit.as_user(user_id, 'pj-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

select testkit.eq(
  (select count(*) from public.pet_attachments where id = 'pj-pa-1'),
  1::bigint, 'un enfant lit les pièces jointes de son foyer');

select testkit.expect_denied(format(
  'insert into public.note_attachments (id, note_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pj-na-kid', (select row_id from testkit.fx where key = 'note'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pj-na-kid.jpg', 'dessin.jpg', 'image/jpeg', 1000),
  'un enfant ne dépose pas de pièce jointe');

reset role;

-- Admin : supprime, et la suppression du parent emporte ses pièces jointes.
select testkit.as_user(user_id, 'pj-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.note_attachments where id = ''pj-na-1'''),
  1::bigint, 'un admin supprime une pièce jointe de note');

select testkit.eq(testkit.affected(format(
  'delete from public.pets where id = %L',
  (select row_id from testkit.fx where key = 'pet'))),
  1::bigint, 'un admin supprime la fiche animale');

select testkit.eq(
  (select count(*) from public.pet_attachments where pet_id = (select row_id from testkit.fx where key = 'pet')),
  0::bigint, 'la fiche emporte ses pièces jointes en cascade');

reset role;

-- Le bucket accepte les PDF sans cesser d'être privé.
select testkit.eq(
  (select allowed_mime_types @> array['application/pdf'] from storage.buckets where id = 'household-media'),
  true, 'le bucket des médias accepte les PDF');
select testkit.eq(
  (select public from storage.buckets where id = 'household-media'),
  false, 'le bucket des médias reste privé');

rollback;
