-- supabase/tests/0128_guest_media_household.sql
-- Phase 23 — Un média référence par une surface invitée est borné à son foyer
-- (plan 23-01 ; ferme le résidu R3 de `21-SECURITY.md`, surface cadeaux).
--
-- Prouve, sur la base ENTIEREMENT MIGREE, le verdict du RPC
-- `public.guest_view_gift_list(text)` :
--   (a) un `photo_url` du foyer de la LISTE traverse inchangé ;
--   (b) un `photo_url` d'un AUTRE foyer, un chemin qui remonte par un segment
--       `..` après un préfixe de foyer valide, et une forme `http(s)` héritée
--       rendent `null` — l'Edge ne reçoit rien à signer (AC 1, AC 2) ;
--   (c) le foyer n'est JAMAIS rendu : aucune clé de foyer, aucune valeur égale
--       à l'identifiant du foyer (AC 3).
--
-- Bornes (AGENTS.md §2.7 D) : chaque assertion porte sur une VALEUR rendue ou
-- sur un article designe par son id — jamais sur un total nu. `testkit.eq`
-- exige deux valeurs de MÊME type, et `testkit.count('…')` s'exécute dans une
-- fonction SEPAREE ou les variables plpgsql du bloc appelant n'existent pas :
-- la charge et le foyer passent donc par des sous-requetes sur `testkit.fx`,
-- jamais par un nom de variable.
--
-- Rouge→vert : avant 0128, (a) survit et (b) (c) (d) rendent la valeur BRUTE —
-- les trois assertions `null` tombent.

begin;

do $$
declare
  alice uuid := testkit.auth_user('r23-alice@example.fr', 'Alice Vingt-Trois');
  carol uuid := testkit.auth_user('r23-carol@example.fr', 'Carol Vingt-Trois');
  home_a text := testkit.household(alice, 'Foyer Vingt-Trois A');
  home_b text := testkit.household(carol, 'Foyer Vingt-Trois B');
  alice_m text;
  carol_m text;
begin
  alice_m := testkit.member(home_a, alice, 'Alice Vingt-Trois', 'admin', 'accent');
  carol_m := testkit.member(home_b, carol, 'Carol Vingt-Trois', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('carol', carol);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('carol_m', carol_m);

  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl23_part', home_a, alice_m, 'Noel 23 Partage', 'partagee');

  -- Quatre articles de la liste de `home_a`, un par verdict :
  --   (a) chemin du foyer de la liste ;
  --   (b) chemin d'un AUTRE foyer ;
  --   (c) prefixe du foyer de la liste, puis un segment `..` vers l'autre foyer ;
  --   (d) forme `http(s)` heritee.
  insert into public.gift_items (id, list_id, household_id, name, price, comment, url, photo_url)
  values
    ('gitem23_a', 'gl23_part', home_a, 'Puzzle 23-a', 20, null, null,
     home_a || '/cadeaux/puzzle.webp'),
    ('gitem23_b', 'gl23_part', home_a, 'Livre 23-b', 12, null, null,
     home_b || '/cadeaux/livre.webp'),
    ('gitem23_c', 'gl23_part', home_a, 'Jeu 23-c', 8, null, null,
     home_a || '/../' || home_b || '/cadeaux/x.webp'),
    ('gitem23_d', 'gl23_part', home_a, 'Mug 23-d', 6, null, null,
     'https://externe.example/x.jpg');

  perform public.create_gift_list_invite(
    p_actor_id => alice,
    p_list_id => 'gl23_part',
    p_token_hash => repeat('3', 64),
    p_max_uses => 10
  );
  insert into testkit.fx (key, row_id) values ('code23', repeat('3', 64));
end;
$$;

-- ===========================================================================
-- 1. Le foyer de la LISTE traverse le RPC : chemin légitime, valeur exacte.
-- ===========================================================================
select testkit.eq(
  (select e ->> 'photo_url'
     from jsonb_array_elements(public.guest_view_gift_list(
       (select row_id from testkit.fx where key = 'code23')) -> 'items') e
    where e ->> 'id' = 'gitem23_a'),
  (select household_id from testkit.fx where key = 'home_a') || '/cadeaux/puzzle.webp',
  'un photo_url du foyer de la liste traverse le RPC inchangé');

-- ===========================================================================
-- 2. Les trois refus : l'Edge ne reçoit rien à signer (AC 1, AC 2).
-- ===========================================================================
select testkit.ok(
  (select e -> 'photo_url' = 'null'::jsonb
     from jsonb_array_elements(public.guest_view_gift_list(
       (select row_id from testkit.fx where key = 'code23')) -> 'items') e
    where e ->> 'id' = 'gitem23_b'),
  'un photo_url d''un autre foyer ne sort pas du RPC');
select testkit.ok(
  (select e -> 'photo_url' = 'null'::jsonb
     from jsonb_array_elements(public.guest_view_gift_list(
       (select row_id from testkit.fx where key = 'code23')) -> 'items') e
    where e ->> 'id' = 'gitem23_c'),
  'un photo_url qui remonte par un segment `..` ne sort pas du RPC');
select testkit.ok(
  (select e -> 'photo_url' = 'null'::jsonb
     from jsonb_array_elements(public.guest_view_gift_list(
       (select row_id from testkit.fx where key = 'code23')) -> 'items') e
    where e ->> 'id' = 'gitem23_d'),
  'une forme http(s) héritée ne sort pas du RPC');

-- ===========================================================================
-- 3. Le foyer n'est jamais rendu (AC 3, T-23-03).
-- ===========================================================================
-- 3.i Clés de premier niveau EXACTEMENT `items`, `list_id`, `list_name`.
select testkit.eq(
  (select array_agg(k order by k)
     from jsonb_object_keys(public.guest_view_gift_list(
       (select row_id from testkit.fx where key = 'code23'))) k),
  array['items', 'list_id', 'list_name'],
  'la charge invitee ne porte que ses trois cles, aucune cle de foyer');

-- 3.ii Aucun objet article ne porte de cle de foyer.
select testkit.eq(testkit.count(
  'select 1 from jsonb_array_elements(public.guest_view_gift_list('
  '  (select row_id from testkit.fx where key = ''code23'')'
  ') -> ''items'') e'
  ' where (e ? ''household_id'') or (e ? ''household'')'),
  0::bigint,
  'aucun objet article ne porte de cle de foyer');

-- 3.iii Aucune VALEUR de la charge n'est EGALE a l'identifiant du foyer.
--
-- POURQUOI ce test n'est PAS une recherche de sous-chaine : un chemin borne
-- legitime COMMENCE par l'identifiant du foyer (c'est l'objet rendu, pas le
-- foyer). Chercher la sous-chaine du foyer sur toute la charge contredirait
-- l'assertion (a) et serait donc une assertion fausse. On exige l'EGALITE
-- stricte d'une valeur entiere — le foyer ne peut pas etre confondu avec un
-- chemin qu'il prefixe.
select testkit.ok(
  not jsonb_path_exists(
    public.guest_view_gift_list((select row_id from testkit.fx where key = 'code23')),
    '$.** ? (@ == $h)',
    jsonb_build_object('h', to_jsonb((select household_id from testkit.fx where key = 'home_a')))
  ),
  'aucune valeur de la charge invitee n''egale l''identifiant du foyer');

-- ===========================================================================
-- 4. Un client n'appelle pas la lecture invitée en direct (privilèges
--    ré-émis par 0128, prouvés à nouveau).
-- ===========================================================================
select testkit.as_user(user_id, 'r23-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied(
  'select public.guest_view_gift_list((select row_id from testkit.fx where key = ''code23''))',
  'un client n''appelle pas la lecture invitée en direct');

reset role;

rollback;
