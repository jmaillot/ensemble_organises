-- supabase/tests/0014_provider_attachments.sql
-- Pièces jointes des prestataires (migration 0045) : isolation par foyer,
-- écriture réservée aux rôles écrivains, suppression aux admins, alignement
-- du foyer sur le prestataire, cascade depuis la fiche.

begin;

do $$
declare
  alice uuid := testkit.auth_user('pp-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('pp-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('pp-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('pp-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Prestataires');
  other text := testkit.household(outsider, 'Foyer Voisin');
begin
  perform testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  perform testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  perform testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');

  insert into public.providers (id, household_id, name, email)
  values ('pp-provider-a', home, 'Cabinet du Dr Morel', 'secretariat@cabinet-morel.fr'),
         ('pp-provider-b', other, 'Plombier Voisin', null);

  insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)
  values ('pp-pa-other', 'pp-provider-b', other, 'https://stockage/pp-pa-other.pdf', 'voisin.pdf', 'application/pdf', 100);

  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home), ('other', other);
  insert into testkit.fx (key, row_id) values ('provider', 'pp-provider-a');
end;
$$;

-- Membre : dépose, lit, renomme, mais ne supprime pas (admin uniquement).
select testkit.as_user(user_id, 'pp-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pp-pa-1', (select row_id from testkit.fx where key = 'provider'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pp-pa-1.pdf', 'devis.pdf', 'application/pdf', 120400)), 1::bigint,
  'un membre dépose une pièce jointe sur un prestataire de son foyer');

select testkit.eq(
  (select count(*) from public.provider_attachments where id = 'pp-pa-1'),
  1::bigint, 'le membre lit la pièce jointe de son foyer');
select testkit.eq(
  (select count(*) from public.provider_attachments where id = 'pp-pa-other'),
  0::bigint, 'le membre ne voit pas les pièces jointes du foyer voisin');

select testkit.eq(testkit.affected(
  'update public.provider_attachments set file_name = ''devis-v2.pdf'' where id = ''pp-pa-1'''),
  1::bigint, 'un membre renomme la pièce jointe de son foyer');

-- Un DELETE filtré par la RLS ne lève pas d'erreur : il ne touche rien.
select testkit.eq(testkit.affected(
  'delete from public.provider_attachments where id = ''pp-pa-1'''),
  0::bigint, 'un membre ne supprime pas : la suppression exige un admin');

-- Le foyer ne peut pas diverger du prestataire : le déclencheur refuse avant tout.
select testkit.expect_denied(format(
  'insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pp-pa-x', (select row_id from testkit.fx where key = 'provider'),
  (select household_id from testkit.fx where key = 'other'),
  'https://stockage/pp-pa-x.pdf', 'intruse.pdf', 'application/pdf', 10),
  'le foyer d''une pièce jointe suit son prestataire');

reset role;

-- Extérieur : ni lecture ni dépôt.
select testkit.as_user(user_id, 'pp-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

select testkit.eq(
  (select count(*) from public.provider_attachments),
  0::bigint, 'un extérieur ne lit aucune pièce jointe de prestataire');

select testkit.expect_denied(format(
  'insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pp-pa-y', (select row_id from testkit.fx where key = 'provider'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pp-pa-y.pdf', 'pirate.pdf', 'application/pdf', 10),
  'un extérieur ne dépose rien dans un autre foyer');

reset role;

-- Enfant : lecture seule, comme sur le reste du foyer.
select testkit.as_user(user_id, 'pp-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

select testkit.eq(
  (select count(*) from public.provider_attachments where id = 'pp-pa-1'),
  1::bigint, 'un enfant lit les pièces jointes de son foyer');

select testkit.expect_denied(format(
  'insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)'
  ' values (%L, %L, %L, %L, %L, %L, %L)',
  'pp-pa-kid', (select row_id from testkit.fx where key = 'provider'),
  (select household_id from testkit.fx where key = 'home'),
  'https://stockage/pp-pa-kid.jpg', 'dessin.jpg', 'image/jpeg', 1000),
  'un enfant ne dépose pas de pièce jointe');

reset role;

-- Admin : supprime, et la suppression de la fiche emporte ses pièces jointes.
select testkit.as_user(user_id, 'pp-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(testkit.affected(
  'delete from public.provider_attachments where id = ''pp-pa-1'''),
  1::bigint, 'un admin supprime une pièce jointe de prestataire');

select testkit.eq(testkit.affected(format(
  'delete from public.providers where id = %L',
  (select row_id from testkit.fx where key = 'provider'))),
  1::bigint, 'un admin supprime la fiche prestataire');

select testkit.eq(
  (select count(*) from public.provider_attachments where provider_id = (select row_id from testkit.fx where key = 'provider')),
  0::bigint, 'la fiche emporte ses pièces jointes en cascade');

reset role;

rollback;
