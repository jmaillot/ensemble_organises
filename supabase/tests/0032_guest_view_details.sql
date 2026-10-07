-- supabase/tests/0032_guest_view_details.sql
-- Contenu invité (0092, gap G-06-1a, D-05/D-07) : la charge invitée porte le
-- lien `url` et la valeur brute `photo_url` de chaque article, en plus du
-- nom/prix/commentaire/booléen `reserved` — sans aucun identifiant d'auteur.
--
-- Preuves : exposition exacte des valeurs semées (égalité stricte, jamais de
-- tautologie), article sans photo ni lien (clés présentes, valeurs nulles,
-- sans erreur — échec fermé), oracle uniforme intact sur les cinq états de
-- code invalide, absence d'auteurs prouvée À L'EXÉCUTION sur le jsonb rendu
-- (aucune clé reserved_by/reserved_by_name dans AUCUN objet article), vue
-- masquée propriétaire inchangée, privilèges directs toujours refusés.
--
-- Voie serveur (sans identité JWT, rôle propriétaire) D'ABORD, comme en
-- 0029/0031 : les claims posées par testkit.as_user persistent jusqu'à la
-- fin de la transaction et feraient passer la voie serveur pour une voie
-- cliente.
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire de la liste),
-- foyer B (Carol admin, ne voit rien).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice32@example.fr', 'Alice Trente-Deux');
  bob uuid := testkit.auth_user('bob32@example.fr', 'Bob Trente-Deux');
  carol uuid := testkit.auth_user('carol32@example.fr', 'Carol Trente-Deux');

  home_a text := testkit.household(alice, 'Foyer 32');
  home_b text := testkit.household(carol, 'Foyer 32 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Trente-Deux', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Trente-Deux', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Trente-Deux', 'admin', 'coral');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl32_part', home_a, bob_m, 'Noel 32 Partage', 'partagee'),
         ('gl32_exp', home_a, bob_m, 'Noel 32 Expiree', 'partagee'),
         ('gl32_exh', home_a, bob_m, 'Noel 32 Epuisee', 'partagee'),
         ('gl32_aux', home_a, bob_m, 'Noel 32 Auxiliaire', 'partagee');

  -- gitem32_a : contenu complet (lien + chemin bucket relatif, forme
  -- actuelle des dépôts `depositHouseholdFile`).
  -- gitem32_b : nu (ni lien ni photo — dégradation vers null, sans erreur).
  -- gitem32_c : contenu complet, forme URL http(s) héritée (l'Edge la laisse
  -- passer telle quelle, la base la rend telle que stockée).
  insert into public.gift_items (id, list_id, household_id, name, price, comment, url, photo_url)
  values ('gitem32_a', 'gl32_part', home_a, 'Puzzle Lumineux 32-aaaa', 25, 'Bois naturel',
          'https://boutique32.example.fr/puzzle-lumineux-32-aaaa',
          'maison32/cadeaux/puzzle32-aaaa.jpg'),
         ('gitem32_b', 'gl32_part', home_a, 'Chaussettes 32-bbbb', 9, null, null, null),
         ('gitem32_c', 'gl32_part', home_a, 'Livre 32-cccc', 15, 'Dédicacé',
          'https://boutique32.example.fr/livre-32-cccc',
          'https://cdn32.example.fr/photos/livre32-cccc.jpg');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('carol', carol, home_b, carol_m);
end;
$$;

-- Mêmes raisons que `testkit.fx` : lue après `set local role authenticated`,
-- une table temporaire serait en permission refusée (motif 0003).
create table testkit.hashes ("h1" text, "h2" text, "h3" text, "h4" text);
insert into testkit.hashes values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
   'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
grant select on testkit.hashes to anon, authenticated;

-- h1 : valide sur la partagée (preuves de contenu). h2/h3/h4 : un par liste
-- dédiée — `create_gift_list_invite` désactive le code précédent DE LA MÊME
-- LISTE à chaque création (régénération), donc des codes d'états différents
-- sur une seule liste se neutraliseraient entre eux (h1 deviendrait
-- inactif). h2 : expiré, h3 : épuisé (compteur poussé au plafond, sans
-- échange), h4 : révoqué (la révocation désactive tous les codes actifs DE
-- CETTE LISTE : h1, sur une autre liste, reste valide).
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl32_part',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl32_exp',
  p_token_hash => (select h2 from testkit.hashes),
  p_max_uses => 10,
  p_expires_at => now() + interval '2 days'
);
update public.gift_list_invites set expires_at = now() - interval '1 second'
 where token_hash = (select h2 from testkit.hashes);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl32_exh',
  p_token_hash => (select h3 from testkit.hashes),
  p_max_uses => 10
);
update public.gift_list_invites set use_count = max_uses
 where token_hash = (select h3 from testkit.hashes);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl32_aux',
  p_token_hash => (select h4 from testkit.hashes),
  p_max_uses => 10
);
select public.revoke_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_list_id => 'gl32_aux'
);

-- ===========================================================================
-- 0. États réellement exercés (AGENTS.md §2.7.D) : chaque code d'oracle est
--    dans l'état qu'il prétend — un refus `code invalide` sur un code
--    incidemment inactif prouverait l'oracle sans exercer l'état.
-- ===========================================================================
select testkit.eq(
  (select is_active and use_count = 0 and expires_at > now()
     from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  true,
  'h1 est actif, intact et non expiré');
select testkit.eq(
  (select is_active and expires_at < now()
     from public.gift_list_invites where token_hash = (select h2 from testkit.hashes)),
  true,
  'h2 est actif mais expiré (seule l''expiration le refuse)');
select testkit.eq(
  (select is_active and use_count >= max_uses
     from public.gift_list_invites where token_hash = (select h3 from testkit.hashes)),
  true,
  'h3 est actif mais épuisé (seul le compteur le refuse)');
select testkit.eq(
  (select not is_active
     from public.gift_list_invites where token_hash = (select h4 from testkit.hashes)),
  true,
  'h4 est révoqué (seule la révocation le refuse)');

-- ===========================================================================
-- 1. Oracle uniforme intact (T-06-03) : inconnu, malformé, expiré, épuisé,
--    révoqué — un seul message, sans distinguer les causes.
-- ===========================================================================
do $$
declare
  h1 text := (select h1 from testkit.hashes);
  h2 text := (select h2 from testkit.hashes);
  h3 text := (select h3 from testkit.hashes);
  h4 text := (select h4 from testkit.hashes);
  h0 text := '0000000000000000000000000000000000000000000000000000000000000000';
begin
  begin
    perform public.guest_view_gift_list(h0);
    perform testkit.ok(false, 'vue : un code inconnu aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code inconnu sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_view_gift_list('xyz');
    perform testkit.ok(false, 'vue : un code malforme aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code malforme sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_view_gift_list(h2);
    perform testkit.ok(false, 'vue : un code expire aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code expire sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_view_gift_list(h3);
    perform testkit.ok(false, 'vue : un code epuise aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code epuise sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_view_gift_list(h4);
    perform testkit.ok(false, 'vue : un code revoque aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code revoque sans oracle : ' || sqlerrm);
  end;

  -- Le code valide survit aux états ci-dessus : la preuve de contenu porte
  -- sur une charge réelle, pas sur un oracle.
  perform testkit.ok(
    (public.guest_view_gift_list(h1) ->> 'list_name') = 'Noel 32 Partage',
    'le code valide rend toujours la liste après les cinq refus');
end;
$$;

-- ===========================================================================
-- 2. Exposition exacte du lien (G-06-1a) : égalité stricte sur la valeur
--    semée, par article (jamais de comptage sur table entière).
-- ===========================================================================
select testkit.eq(
  (select e ->> 'url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_a'),
  'https://boutique32.example.fr/puzzle-lumineux-32-aaaa',
  'la vue invitée expose le lien exact de l''article avec contenu');
select testkit.eq(
  (select e ->> 'url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_c'),
  'https://boutique32.example.fr/livre-32-cccc',
  'la vue invitée expose le lien exact de l''article forme héritée');

-- ===========================================================================
-- 3. Exposition exacte de la valeur brute photo (G-06-1a) : la base rend tel
--    que stocké (chemin bucket OU url héritée) ; l'article nu porte les clés
--    avec des valeurs nulles — présent, jamais d'erreur (échec fermé).
-- ===========================================================================
select testkit.eq(
  (select e ->> 'photo_url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_a'),
  'maison32/cadeaux/puzzle32-aaaa.jpg',
  'la vue invitée expose la valeur brute du chemin bucket');
select testkit.eq(
  (select e ->> 'photo_url'
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_c'),
  'https://cdn32.example.fr/photos/livre32-cccc.jpg',
  'la vue invitée expose la valeur brute de la forme héritée');
select testkit.ok(
  (select (e ? 'url') and (e ? 'photo_url')
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_b'),
  'l''article nu porte quand même les clés url et photo_url');
select testkit.ok(
  (select (e ->> 'url') is null and (e ->> 'photo_url') is null
     from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') e
    where e ->> 'id' = 'gitem32_b'),
  'l''article nu rend des valeurs nulles, sans erreur');

-- ===========================================================================
-- 4. Aucun auteur à l'exécution (D-07) : AUCUN objet article de la charge ne
--    porte reserved_by, reserved_by_name ni author — compté sur le jsonb
--    rendu, pas sur le texte source (AGENTS.md §2.7.D.6).
-- ===========================================================================
select testkit.eq(testkit.count(
  'select 1 from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> ''items'') e'
  ' where (e ? ''reserved_by'') or (e ? ''reserved_by_name'') or (e ? ''author'')'),
  0::bigint,
  'aucun objet article de la charge invitée ne porte d''identifiant d''auteur');
select testkit.eq(
  jsonb_array_length(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items'),
  3,
  'la vue rend les trois articles de la liste, sans plus');

-- ===========================================================================
-- 5. Booléen `reserved` inchangé : après une réserve anonyme, l'article tenu
--    est vrai, les libres sont faux — compteur intact.
-- ===========================================================================
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem32_a', 'Mamie'
  ) ->> 'already_reserved')::boolean,
  false,
  'la réserve anonyme réussit sur l''article avec contenu');
select testkit.eq(testkit.count(
  'select 1 from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> ''items'') e'
  ' where (e ->> ''id'') = ''gitem32_a'' and (e ->> ''reserved'')::boolean = true'),
  1::bigint,
  'l''article réservé est marqué vrai, par id (sans ordre supposé)');
select testkit.eq(testkit.count(
  'select 1 from jsonb_array_elements(public.guest_view_gift_list((select h1 from testkit.hashes)) -> ''items'') e'
  ' where (e ->> ''id'') = ''gitem32_b'' and (e ->> ''reserved'')::boolean = false'),
  1::bigint,
  'l''article libre reste marqué faux, par id');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'la réserve ne consomme pas use_count');

-- ===========================================================================
-- 6. Un client n'appelle pas la lecture invitée en direct (privilèges
--    ré-émis par 0092, prouvés à nouveau).
-- ===========================================================================
select testkit.as_user(user_id, 'bob32@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_denied(
  'select public.guest_view_gift_list((select h1 from testkit.hashes))',
  'un client n''appelle pas la lecture invitée en direct');

reset role;

-- ===========================================================================
-- 7. Vue masquée propriétaire inchangée (D-07) : sur la ligne réservée-anonyme,
--    le propriétaire lit purchased vrai et les auteurs à NULL ; un autre
--    foyer ne voit rien.
-- ===========================================================================
select testkit.as_user(user_id, 'bob32@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem32_a'''
  ' and household_id = (select household_id from testkit.fx where key = ''bob'')'
  ' and purchased = true and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire voit purchased vrai, auteurs masqués (0092 n''a rien changé à la vue)');

reset role;

select testkit.as_user(user_id, 'carol32@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem32_a'''),
  0::bigint,
  'un autre foyer ne voit rien via la vue');

reset role;

rollback;
