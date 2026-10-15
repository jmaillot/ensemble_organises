-- supabase/tests/0124_media_path_backfill.sql
-- Rattrapage des médias hérités (migration 0124, WR-08 / D-01 / D-02).
--
-- Le défaut réparé : cinq modules persistaient une URL signée de 30 j au lieu
-- du chemin durable de l'objet ; une fois le jeton expiré, la photo était
-- morte. 0124 extrait le chemin d'une URL signée du bucket `household-media`
-- et le réécrit dans dix colonnes média, en laissant toute valeur non
-- analysable intacte (et en la comptant dans le rapport de migration).
--
-- PREUVE ROUGE : exécuté contre le schéma d'AVANT 0124, ce fichier échoue sur
-- sa première assertion (3(a)) parce que `private.media_path_from_signed_url`
-- n'existe pas — c'est ce qui montre que le test regarde bien quelque chose.
-- Ce défaut a échappé à la CI parce que les tests Vitest tournent en mode démo
-- (Dexie/IndexedDB) : il n'y a ni Storage ni URL signée à y observer.
--
-- Bornes (AGENTS.md §2.7D.2) : chaque lecture d'assertion est bornée par un
-- identifiant (ou par le foyer de la fixture), jamais un comptage global.
-- Fixtures et matrice en rôle d'administration (la fonction interne n'est PAS
-- exécutable par `authenticated`, vérifié au point 5) ; la lecture finale
-- passe sous `authenticated`, comme PostgREST l'exécuterait. Fichier autonome,
-- `rollback` final : la base est laissée intacte.

begin;

-- ---------------------------------------------------------------------------
-- 1. Fixtures (rôle d'administration), sur le modèle de 0122.
-- ---------------------------------------------------------------------------
do $$
declare
  alice uuid := testkit.auth_user('t24-alice@example.fr', 'Alice Médias');
  home text := testkit.household(alice, 'Foyer Médias');
  alice_m text;
begin
  alice_m := testkit.member(home, alice, 'Alice Médias', 'admin', 'accent');
  insert into testkit.fx (key, user_id) values ('alice', alice);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values ('alice_m', alice_m);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Matrice d'extraction — sur la fonction seule, en rôle d'administration.
--    Les cas (b)(c)(d) sont la contrepartie directe de « les valeurs non
--    analysables sont laissées telles quelles » : sans eux, on ne prouverait
--    que le cas qui marche.
-- ---------------------------------------------------------------------------
do $$
declare
  home text;
begin
  select household_id into home from testkit.fx where key = 'home';

  -- (a) URL signée complète du bucket : rend le chemin.
  perform testkit.eq(
    private.media_path_from_signed_url(
      'https://api.exemple.fr/storage/v1/object/sign/household-media/'
        || home || '/notes/file_abc.jpg?token=xyz'),
    (home || '/notes/file_abc.jpg')::text,
    '(a) une URL signée du bucket household-media rend le chemin');

  -- (b) URL signée d'un AUTRE bucket : le bucket n'est pas un joker, rendue
  --     inchangée.
  perform testkit.eq(
    private.media_path_from_signed_url(
      'https://api.exemple.fr/storage/v1/object/sign/autre-bucket/'
        || home || '/x.jpg?token=t'),
    ('https://api.exemple.fr/storage/v1/object/sign/autre-bucket/'
        || home || '/x.jpg?token=t')::text,
    '(b) une URL signée d''un autre bucket est rendue inchangée');

  -- (c) chemin déjà nu : idempotence du rattrapage, rendu inchangé.
  perform testkit.eq(
    private.media_path_from_signed_url(home || '/pets/file_def.png'),
    (home || '/pets/file_def.png')::text,
    '(c) un chemin nu est rendu inchangé');

  -- (d) URL externe saisie à la main : rendue inchangée.
  perform testkit.eq(
    private.media_path_from_signed_url('https://exemple.fr/photo.jpg'),
    'https://exemple.fr/photo.jpg'::text,
    '(d) une URL externe est rendue inchangée');

  -- (e) valeur absente : rend `null`.
  perform testkit.ok(
    private.media_path_from_signed_url(null) is null,
    '(e) null rend null');
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rattrapage effectif sur des lignes réelles (rôle d'administration).
--
--    Une migration de données ne peut pas être observée sur des lignes créées
--    APRÈS elle : le test sème donc ses lignes puis REJOUE l'instruction de
--    0124 — même garde, même expression. Ce rejeu prouve que la garde
--    sélectionne exactement les lignes réparables et laisse les autres. Il ne
--    prouve PAS que le fichier de migration a été appliqué : cela, c'est
--    `sh scripts/migrate.sh` qui l'atteste.
-- ---------------------------------------------------------------------------
do $$
declare
  home text;
begin
  select household_id into home from testkit.fx where key = 'home';

  -- Quatre lignes, toutes du même foyer : une URL signée construite à partir
  -- du `household_id`, une URL externe, un chemin nu, une valeur absente.
  insert into public.birthdays (id, household_id, name, birth_date, photo_url)
  values
    ('bday_t24_signee',  home, 'Signée',  '1990-01-01',
       'https://api.exemple.fr/storage/v1/object/sign/household-media/'
         || home || '/birthdays/file_signee.jpg?token=abc'),
    ('bday_t24_externe', home, 'Externe', '1990-02-02',
       'https://exemple.fr/photo.jpg'),
    ('bday_t24_chemin',  home, 'Chemin',  '1990-03-03',
       home || '/birthdays/file_def.png'),
    ('bday_t24_nulle',   home, 'Nulle',   '1990-04-04', null);

  -- Rejeu de l'instruction de 0124.
  update public.birthdays
     set photo_url = private.media_path_from_signed_url(photo_url)
   where photo_url is distinct from private.media_path_from_signed_url(photo_url);

  -- Seule la ligne signée est réécrite : elle porte le chemin extrait.
  perform testkit.eq(
    (select photo_url from public.birthdays where id = 'bday_t24_signee'),
    home || '/birthdays/file_signee.jpg',
    'la ligne signée porte le chemin extrait');
  -- Les trois autres restent IDENTIQUES à ce qui a été semé.
  perform testkit.eq(
    (select photo_url from public.birthdays where id = 'bday_t24_externe'),
    'https://exemple.fr/photo.jpg',
    'l''URL externe est laissée telle quelle');
  perform testkit.eq(
    (select photo_url from public.birthdays where id = 'bday_t24_chemin'),
    home || '/birthdays/file_def.png',
    'le chemin nu est laissé tel quel');
  perform testkit.ok(
    (select photo_url from public.birthdays where id = 'bday_t24_nulle') is null,
    'la valeur absente reste absente');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Non-dépassement de périmètre : la réécriture ne change que la VALEUR
--    d'une colonne média, jamais l'appartenance. Trois des quatre lignes du
--    foyer portent une photo non nulle — ni créée ni supprimée par le rejeu.
-- ---------------------------------------------------------------------------
do $$
declare
  home text;
begin
  select household_id into home from testkit.fx where key = 'home';

  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.birthdays where household_id = %L and photo_url is not null',
      home)),
    3::bigint,
    'le rattrapage ne crée ni ne supprime de photo : trois photos non nulles');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Lecture sous RLS, comme PostgREST l'exécuterait : un membre lit le
--    CHEMIN réparé (borné par `id`), donc aucune URL signée éphémère ne
--    remonte au client. Et la fonction interne n'est PAS exécutable par
--    `authenticated` : le rattrapage est une opération d'exploitation, jamais
--    une surface d'appel client.
-- ---------------------------------------------------------------------------
select testkit.as_user(user_id, 't24-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.eq(
  (select photo_url from public.birthdays where id = 'bday_t24_signee'),
  (select household_id from testkit.fx where key = 'home') || '/birthdays/file_signee.jpg',
  'un membre lit le chemin réparé, jamais une URL signée');

select testkit.expect_denied(
  'select private.media_path_from_signed_url(''x'')',
  'la fonction interne n''est pas exécutable par authenticated');

reset role;

rollback;
