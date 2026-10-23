-- supabase/tests/0143_documents.sql
-- Les documents du foyer (migration 0143, vague 3.2).
--
-- CE QUI EST VÉRIFIÉ. Deux tables d'un même module, un même motif :
--
-- (a) un membre du foyer crée un dossier et y dépose un document, puis les
--     relit tous les deux ;
-- (b) l'enfant est en lecture seule : l'INSERT de document et de dossier
--     lève une erreur (WITH CHECK), le DELETE filtre en silence ;
-- (c) un membre d'un AUTRE foyer n'y voit rien et n'y écrit rien ;
-- (d) l'auteur usurpé est refusé sur les deux tables : `created_by` doit
--     être nul ou le membre courant — on ne dépose pas un papier au nom
--     d'autrui ;
-- (e) les bornes de forme : mime hors liste (ni image ni PDF), taille nulle,
--     nom vide, teinte hors palette — chaque refus est une erreur de
--     contrainte ;
-- (f) l'alignement du foyer : un document déposé dans le dossier d'un AUTRE
--     foyer est refusé — le déclencheur copie le foyer du dossier, et la
--     politique INSERT de ce foyer étranger refuse ;
-- (g) supprimer un dossier ne détruit rien : le document retombe à la
--     racine (folder_id NULL) ;
-- (h) la lecture est bornée au foyer, dans les DEUX sens.
--
-- PREUVE ROUGE : (b) tombe sans le rôle enfant de can_write_household,
-- (d) sans la garde d'auteur dans les politiques, (e) sans les contraintes,
-- (f) sans le déclencheur d'alignement, (g) sans le on delete set null.
--
-- Bornes (AGENTS.md §2.7) : chaque comptage porte sur le foyer du test ou
-- sur une ligne nommée *_t143_*, jamais sur la table entière.
-- Fichier autonome, `rollback` final.

begin;

do $$
declare
  alice  uuid := testkit.auth_user('t143-alice@example.fr', 'Alice Papiers');
  bob    uuid := testkit.auth_user('t143-bob@example.fr', 'Bob Papiers');
  zoe    uuid := testkit.auth_user('t143-zoe@example.fr', 'Zoe Ailleurs');
  noe    uuid := testkit.auth_user('t143-noe@example.fr', 'Noe Enfant');
  home   text := testkit.household(alice, 'Foyer Papiers');
  home2  text := testkit.household(zoe, 'Foyer Ailleurs');
  alice_member text;
begin
  perform testkit.member(home, alice, 'Alice Papiers', 'admin');
  perform testkit.member(home, bob, 'Bob Papiers', 'membre');
  perform testkit.member(home, noe, 'Noe Enfant', 'enfant');
  perform testkit.member(home2, zoe, 'Zoe Ailleurs', 'admin');
  alice_member := (select id from public.household_members
                    where household_id = home and user_id = alice);

  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('zoe', zoe), ('noe', noe);
  insert into testkit.fx (key, household_id) values ('home', home), ('home2', home2);
  insert into testkit.fx (key, row_id) values ('alice_member', alice_member);
end;
$$;

-- ---------------------------------------------------------------------------
-- (a) Un membre crée un dossier et y dépose un document, puis les relit.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't143-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_ok(
  $q$insert into public.document_folders (id, household_id, name, color, created_by)
    values ('folder_t143_1', (select household_id from testkit.fx where key = 'home'),
            'Assurance', 'sage', (select row_id from testkit.fx where key = 'alice_member'))$q$);

select testkit.expect_ok(
  $q$insert into public.documents (id, household_id, folder_id, name, mime, size, storage_path, expires_on, notes, created_by)
    values ('doc_t143_1', (select household_id from testkit.fx where key = 'home'),
            'folder_t143_1', 'Attestation 2026', 'application/pdf', 48213,
            'home_a/documents/attestation-2026.pdf', current_date + 90,
            'Renouveler avant le 31 mars', (select row_id from testkit.fx where key = 'alice_member'))$q$);

-- Un document sans dossier, sans date, sans note : les défauts suffisent.
select testkit.expect_ok(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_2', (select household_id from testkit.fx where key = 'home'),
            'Carte vitale', 'image/jpeg', 120400, 'home_a/documents/carte-vitale.jpg')$q$);

select testkit.eq(
  testkit.count($q$select 1 from public.document_folders where id = 'folder_t143_1'$q$),
  1::bigint,
  'le dossier créé est relu par son auteure');

select testkit.eq(
  testkit.count($q$select 1 from public.documents where id in ('doc_t143_1', 'doc_t143_2')$q$),
  2::bigint,
  'les deux documents déposés sont relus par leur auteure');

-- Le déclencheur a copié le foyer du dossier sur le document.
select testkit.eq(
  (select household_id from public.documents where id = 'doc_t143_1'),
  (select household_id from testkit.fx where key = 'home'),
  'le document porte le foyer de son dossier, pas celui du formulaire');

-- ---------------------------------------------------------------------------
-- (b) L'enfant est en lecture seule : ni dépôt, ni classement, ni suppression.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't143-noe@example.fr') from testkit.fx where key = 'noe';

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_n', (select household_id from testkit.fx where key = 'home'),
            'Dessin', 'image/png', 2048, 'home_a/documents/dessin.png')$q$);

select testkit.expect_denied(
  $q$insert into public.document_folders (id, household_id, name)
    values ('folder_t143_n', (select household_id from testkit.fx where key = 'home'), 'École')$q$);

select testkit.eq(
  testkit.affected($q$delete from public.documents where id = 'doc_t143_1'$q$),
  0::bigint,
  'un enfant ne peut pas retirer un document du foyer');

select testkit.eq(
  testkit.affected($q$delete from public.document_folders where id = 'folder_t143_1'$q$),
  0::bigint,
  'un enfant ne peut pas supprimer un dossier');

-- ---------------------------------------------------------------------------
-- (c) Un membre d'un autre foyer n'y voit rien et n'y écrit rien.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't143-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(
  testkit.count($q$select 1 from public.documents where id = 'doc_t143_1'$q$),
  0::bigint,
  'le document du foyer d''Alice est invisible pour Zoe');

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_z', (select household_id from testkit.fx where key = 'home'),
            'Sous main', 'application/pdf', 1000, 'home_z/documents/secret.pdf')$q$);

-- ---------------------------------------------------------------------------
-- (d) L'auteur usurpé est refusé : Alice ne dépose pas au nom de Bob.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't143-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path, created_by)
    values ('doc_t143_f', (select household_id from testkit.fx where key = 'home'),
            'Justificatif', 'application/pdf', 2000, 'home_a/documents/justificatif.pdf',
            (select id from public.household_members
              where household_id = (select household_id from testkit.fx where key = 'home')
                and user_id = (select user_id from testkit.fx where key = 'bob')))$q$);

select testkit.expect_denied(
  $q$insert into public.document_folders (id, household_id, name, created_by)
    values ('folder_t143_f', (select household_id from testkit.fx where key = 'home'), 'Impôts',
            (select id from public.household_members
              where household_id = (select household_id from testkit.fx where key = 'home')
                and user_id = (select user_id from testkit.fx where key = 'bob')))$q$);

-- ---------------------------------------------------------------------------
-- (e) Les bornes de forme : chaque refus est une erreur de contrainte.
-- ---------------------------------------------------------------------------
-- Un mime ni image ni PDF : la colonne dit ce que l'écran sait afficher.
select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_m', (select household_id from testkit.fx where key = 'home'),
            'Zip mystère', 'application/zip', 1000, 'home_a/documents/archive.zip')$q$);

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_s', (select household_id from testkit.fx where key = 'home'),
            'Vide', 'application/pdf', 0, 'home_a/documents/vide.pdf')$q$);

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, name, mime, size, storage_path)
    values ('doc_t143_e', (select household_id from testkit.fx where key = 'home'),
            '   ', 'application/pdf', 1000, 'home_a/documents/rien.pdf')$q$);

-- Une teinte libre contredirait la palette de pastels de l'interface.
select testkit.expect_denied(
  $q$insert into public.document_folders (id, household_id, name, color)
    values ('folder_t143_c', (select household_id from testkit.fx where key = 'home'), 'Sport', 'fuchsia')$q$);

-- ---------------------------------------------------------------------------
-- (f) L'alignement : un document déposé dans le dossier d'un AUTRE foyer
--     est refusé par la politique INSERT du foyer étranger.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't143-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.expect_ok(
  $q$insert into public.document_folders (id, household_id, name)
    values ('folder_t143_2', (select household_id from testkit.fx where key = 'home2'), 'Personnel')$q$);

select testkit.as_user(user_id, 't143-alice@example.fr') from testkit.fx where key = 'alice';

select testkit.expect_denied(
  $q$insert into public.documents (id, household_id, folder_id, name, mime, size, storage_path)
    values ('doc_t143_x', (select household_id from testkit.fx where key = 'home'),
            'folder_t143_2', 'Fugue', 'application/pdf', 1000, 'home_a/documents/fugue.pdf')$q$);

-- ---------------------------------------------------------------------------
-- (g) Supprimer un dossier ne détruit rien : le document retombe à la racine.
-- ---------------------------------------------------------------------------
select testkit.expect_ok($q$delete from public.document_folders where id = 'folder_t143_1'$q$);

select testkit.eq(
  testkit.count($q$select 1 from public.documents where id = 'doc_t143_1' and folder_id is null$q$),
  1::bigint,
  'le document survit à la suppression de son dossier, retombé à la racine');

-- ---------------------------------------------------------------------------
-- (h) La lecture est bornée au foyer, dans les DEUX sens.
-- ---------------------------------------------------------------------------
select testkit.eq(
  testkit.count($q$select 1 from public.documents
                 where household_id = (select household_id from testkit.fx where key = 'home')$q$),
  2::bigint,
  'Alice voit exactement les deux documents de son foyer');

select testkit.eq(
  testkit.count($q$select 1 from public.documents
                 where household_id = (select household_id from testkit.fx where key = 'home2')$q$),
  0::bigint,
  'Alice ne voit aucune ligne du foyer de Zoe');

select testkit.eq(
  testkit.count($q$select 1 from public.document_folders
                 where household_id = (select household_id from testkit.fx where key = 'home2')$q$),
  0::bigint,
  'Alice ne voit aucun dossier du foyer de Zoe');

-- Le sens Zoe : elle relit son dossier depuis son foyer seul.
select testkit.as_user(user_id, 't143-zoe@example.fr') from testkit.fx where key = 'zoe';

select testkit.eq(
  testkit.count($q$select 1 from public.document_folders
                 where household_id = (select household_id from testkit.fx where key = 'home2')$q$),
  1::bigint,
  'Zoe relit son dossier depuis son foyer seul');

rollback;
