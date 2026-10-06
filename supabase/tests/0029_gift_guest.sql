-- supabase/tests/0029_gift_guest.sql
-- Réserve anonyme invitée (0089, D-05/D-06/D-07/D-08) : colonne
-- `reserved_by_name` + exclusion mutuelle, RPC invités service_role seuls
-- (oracle unique `code invalide`, nom 1-80, compteur intact), vue masquée
-- étendue au nom anonyme, libération gestionnaire des deux formes d'auteur
-- avec refus non-gestionnaire, et confusion documentée de deux visiteurs de
-- même nom (D-09, limite acceptée).
--
-- Les RPC sont appelés ici sans identité JWT (rôle propriétaire), comme le
-- fait l'Edge Function avec la clé secrète : c'est la voie serveur réelle
-- (auth.uid() NULL), qui traverse le garde sans être contrainte. Les sections
-- avec identité (as_user + set local role authenticated) viennent APRÈS :
-- les claims posées par testkit.as_user persistent jusqu'à la fin de la
-- transaction et feraient passer la voie serveur pour une voie cliente.
--
-- Scénario : foyer A (Alice admin, Bob membre propriétaire des listes, Dave
-- membre avec partage reservation), foyer B (Carol admin), Gwen sans foyer.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice29@example.fr', 'Alice Vingt-Neuf');
  bob uuid := testkit.auth_user('bob29@example.fr', 'Bob Vingt-Neuf');
  dave uuid := testkit.auth_user('dave29@example.fr', 'Dave Vingt-Neuf');
  carol uuid := testkit.auth_user('carol29@example.fr', 'Carol Vingt-Neuf');
  gwen uuid := testkit.auth_user('gwen29@example.fr', 'Gwen Vingt-Neuf');

  home_a text := testkit.household(alice, 'Foyer 29');
  home_b text := testkit.household(carol, 'Foyer 29 B');

  alice_m text := testkit.member(home_a, alice, 'Alice Vingt-Neuf', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Vingt-Neuf', 'membre', 'ink');
  dave_m text := testkit.member(home_a, dave, 'Dave Vingt-Neuf', 'membre', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Vingt-Neuf', 'admin', 'coral');
begin
  -- Liste privée (réserve/oracle/libération propriétaire) + liste foyer
  -- (libération admin-non-propriétaire : un admin ne lit pas la privée
  -- d'autrui — la SELECT policy s'applique aussi aux UPDATE — mais lit la
  -- foyer) + liste partagée (vue masquée), toutes possédées par Bob, membre
  -- non admin.
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl29_privee', home_a, bob_m, 'Noel 29 Prive', 'privee');
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl29_foyer', home_a, bob_m, 'Noel 29 Foyer', 'foyer');
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl29_part', home_a, bob_m, 'Noel 29 Partage', 'partagee');

  -- Article tenu par un membre (conflit + libération forme membre).
  insert into public.gift_items (id, list_id, household_id, name, price, reserved_by)
  values ('gitem29_c', 'gl29_privee', home_a, 'Montre', 80, dave_m);
  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('gitem29_a', 'gl29_privee', home_a, 'Puzzle', 25),
         ('gitem29_b', 'gl29_privee', home_a, 'Livre', 15),
         ('gitem29_f', 'gl29_foyer', home_a, 'Vase', 40),
         ('gitem29_x', 'gl29_part', home_a, 'Foulard', 30);

  -- Dave : partage `reservation` membre sur la privée (voie garde 42501).
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh29_dave', 'gl29_privee', dave_m, 'reservation');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('dave', dave, home_a, dave_m),
    ('carol', carol, home_b, carol_m),
    ('gwen', gwen, null, null);
end;
$$;

-- Mêmes raisons que `testkit.fx` : lue après `set local role authenticated`,
-- une table temporaire serait en permission refusée (motif 0003).
create table testkit.hashes ("h1" text, "h2" text, "h3" text, "h4" text, "h5" text, "h6" text);
insert into testkit.hashes values
  ('1111111111111111111111111111111111111111111111111111111111111111',
   '2222222222222222222222222222222222222222222222222222222222222222',
   '3333333333333333333333333333333333333333333333333333333333333333',
   '4444444444444444444444444444444444444444444444444444444444444444',
   '5555555555555555555555555555555555555555555555555555555555555555',
   '6666666666666666666666666666666666666666666666666666666666666666');
grant select on testkit.hashes to anon, authenticated;

-- Codes d'essai (voie serveur, sans identité) : h2 épuisé (max_uses 1 consommé
-- par Dave membre), h3 expiré, h4 révoqué, h5 valide sur la partagée (preuves
-- de vue). h1 est créé APRÈS la révocation (la révocation désactive tous les
-- codes actifs de la liste ; recréer le même hash violerait son unicité).
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl29_privee',
  p_token_hash => (select h2 from testkit.hashes),
  p_max_uses => 1
);
select public.redeem_gift_list_invite(
  p_token_hash => (select h2 from testkit.hashes),
  p_actor_id => (select user_id from testkit.fx where key = 'dave')
);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl29_privee',
  p_token_hash => (select h3 from testkit.hashes),
  p_max_uses => 10,
  p_expires_at => now() + interval '2 days'
);
update public.gift_list_invites set expires_at = now() - interval '1 second'
 where token_hash = (select h3 from testkit.hashes);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl29_privee',
  p_token_hash => (select h4 from testkit.hashes),
  p_max_uses => 10
);
select public.revoke_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_list_id => 'gl29_privee'
);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl29_part',
  p_token_hash => (select h5 from testkit.hashes),
  p_max_uses => 10
);
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl29_foyer',
  p_token_hash => (select h6 from testkit.hashes),
  p_max_uses => 10
);

-- ===========================================================================
-- 1. Oracle uniforme (T-06-03) : inconnu, malformé, expiré, épuisé, révoqué
--    sur LES DEUX RPC invités — un seul message, sans distinguer les causes.
-- ===========================================================================
do $$
declare
  h1 text := (select h1 from testkit.hashes);
  h2 text := (select h2 from testkit.hashes);
  h3 text := (select h3 from testkit.hashes);
  h4 text := (select h4 from testkit.hashes);
  h0 text := '0000000000000000000000000000000000000000000000000000000000000000';
begin
  -- guest_view : les cinq états.
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
    perform public.guest_view_gift_list(h3);
    perform testkit.ok(false, 'vue : un code expire aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'vue : code expire sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_view_gift_list(h2);
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

  -- guest_reserve : les cinq mêmes états, sur l'article libre gitem29_a.
  begin
    perform public.guest_reserve_gift_item(h0, 'gitem29_a', 'Mamie');
    perform testkit.ok(false, 'reserve : un code inconnu aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'reserve : code inconnu sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item('xyz', 'gitem29_a', 'Mamie');
    perform testkit.ok(false, 'reserve : un code malforme aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'reserve : code malforme sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h3, 'gitem29_a', 'Mamie');
    perform testkit.ok(false, 'reserve : un code expire aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'reserve : code expire sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h2, 'gitem29_a', 'Mamie');
    perform testkit.ok(false, 'reserve : un code epuise aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'reserve : code epuise sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h4, 'gitem29_a', 'Mamie');
    perform testkit.ok(false, 'reserve : un code revoque aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'reserve : code revoque sans oracle : ' || sqlerrm);
  end;

  -- Le code h1 (valide pour la suite) est créé APRÈS la révocation : un seul
  -- code actif par liste, sans conflit d'unicité sur l'empreinte.
  perform public.create_gift_list_invite(
    (select user_id from testkit.fx where key = 'bob'),
    'gl29_privee', h1, null, 10);
end;
$$;

-- ===========================================================================
-- 2. Nom déclaré borné 1-80 (D-06) : messages NON-oracle distincts.
-- ===========================================================================
do $$
declare
  h1 text := (select h1 from testkit.hashes);
begin
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem29_a', '   ');
    perform testkit.ok(false, 'un nom vide aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%nom invalide%', 'nom vide refuse : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem29_a', repeat('n', 81));
    perform testkit.ok(false, 'un nom de 81 caracteres aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%nom invalide%', 'nom de 81 caracteres refuse : ' || sqlerrm);
  end;
end;
$$;

-- ===========================================================================
-- 3. Pas de fuite inter-listes : article d'une autre liste ou inconnu vaut
--    code inconnu (oracle uniforme, pas de 404 distinct).
-- ===========================================================================
do $$
declare
  h1 text := (select h1 from testkit.hashes);
begin
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem29_x', 'Mamie');
    perform testkit.ok(false, 'un article d''une autre liste aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'article d''une autre liste sans oracle : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem_inexistant', 'Mamie');
    perform testkit.ok(false, 'un article inconnu aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'article inconnu sans oracle : ' || sqlerrm);
  end;
end;
$$;

-- ===========================================================================
-- 4. Chemin heureux (D-05) : vue bornée + réserve, compteur intact.
-- ===========================================================================
select testkit.eq(
  (public.guest_view_gift_list((select h1 from testkit.hashes)) ->> 'list_name'),
  'Noel 29 Prive',
  'la vue invitée rend le nom de la liste');
select testkit.eq(
  jsonb_array_length(public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items'),
  3,
  'la vue invitée rend les trois articles de la liste, sans plus');
select testkit.eq(
  ((public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items' -> 0) ? 'reserved_by'),
  false,
  'la charge invitée ne porte aucune clé reserved_by');
select testkit.eq(
  ((public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items' -> 0) ? 'reserved_by_name'),
  false,
  'la charge invitée ne porte aucune clé reserved_by_name');
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem29_a', 'Mamie'
  ) ->> 'already_reserved')::boolean,
  false,
  'la première réserve anonyme réussit');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where list_id = ''gl29_privee'' and id = ''gitem29_a'' and reserved_by_name = ''Mamie'' and reserved_by is null'),
  1::bigint,
  'la réserve porte le nom déclaré, jamais un FK membre');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'la réserve ne consomme pas use_count (choix verrouillé 2)');
select testkit.eq(
  (public.guest_view_gift_list((select h1 from testkit.hashes)) -> 'items') @> '[{"reserved": true}]'::jsonb,
  true,
  'la vue invitée marque un article réservé par un booléen (sans ordre supposé)');

-- ===========================================================================
-- 5. Idempotence à nom égal, conflit à nom différent, article tenu par un
--    membre : 409 distinct de l'oracle. La confusion de deux visiteurs de
--    même nom est la limite acceptée D-09, documentée ici par le comportement.
-- ===========================================================================
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem29_a', 'mamie  '
  ) ->> 'already_reserved')::boolean,
  true,
  'même nom normalisé (casse/espaces) : succès rejoué, sans erreur (D-09)');
do $$
declare
  h1 text := (select h1 from testkit.hashes);
begin
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem29_a', 'Papi');
    perform testkit.ok(false, 'un autre nom sur un article réservé aurait du être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'autre nom en conflit 409 : ' || sqlerrm);
  end;
  begin
    perform public.guest_reserve_gift_item(h1, 'gitem29_c', 'Papi');
    perform testkit.ok(false, 'réserver un article tenu par un membre aurait du être refusé');
  exception when others then
    perform testkit.ok(sqlerrm like '%article déjà réservé%', 'article tenu par un membre en conflit : ' || sqlerrm);
  end;
end;
$$;
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'ni l''idempotence ni les conflits ne consomment use_count');

-- Réserve anonyme sur la partagée (preuves de vue §7) : voie serveur, compteur h5 intact.
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h5 from testkit.hashes), 'gitem29_x', 'Tonton'
  ) ->> 'already_reserved')::boolean,
  false,
  'réserve anonyme sur la liste partagée');

-- Réserve anonyme sur la foyer (libération admin §8) : voie serveur, compteur h6 intact.
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h6 from testkit.hashes), 'gitem29_f', 'Mamie'
  ) ->> 'already_reserved')::boolean,
  false,
  'réserve anonyme sur la liste foyer');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h6 from testkit.hashes)),
  0,
  'la réserve sur la foyer ne consomme pas use_count');

-- ===========================================================================
-- 6. Un client ne voit ni ne touche les codes, n'appelle aucun RPC invité,
--    et ne touche pas à reserved_by_name (garde 42501 même avec un partage).
-- ===========================================================================
select testkit.as_user(user_id, 'dave29@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.expect_denied('select * from public.gift_list_invites',
  'la table des codes est illisible par un client');
select testkit.expect_denied(
  'select public.guest_view_gift_list((select h1 from testkit.hashes))',
  'un client n''appelle pas la lecture invitée en direct');
select testkit.expect_denied(format(
  'select public.guest_reserve_gift_item(%L, %L, %L)',
  (select h1 from testkit.hashes), 'gitem29_b', 'Dave'),
  'un client n''appelle pas la réserve invitée en direct');
select testkit.expect_denied(
  'update public.gift_items set reserved_by_name = ''Pirate'' where id = ''gitem29_b''',
  'l''invité avec partage ne touche pas à reserved_by_name (garde 42501)');
select testkit.expect_denied(
  'update public.gift_items set reserved_by_name = null where id = ''gitem29_a''',
  'l''invité non-gestionnaire ne libère pas une réserve anonyme (D-08)');

reset role;

-- Utilisatrice sans foyer : même refus, sans rien apprendre.
select testkit.as_user(user_id, 'gwen29@example.fr') from testkit.fx where key = 'gwen';
set local role authenticated;

select testkit.expect_denied('select * from public.gift_list_invites',
  'un compte sans foyer ne lit pas la table des codes');

reset role;

-- ===========================================================================
-- 7. Vue masquée étendue (D-07) : sur une ligne réservée-anonyme, le
--    propriétaire lit NULL, un membre voit le nom, un autre foyer ne voit rien.
-- ===========================================================================
select testkit.as_user(user_id, 'bob29@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem29_x'' and reserved_by_name is null and reserved_by is null'),
  1::bigint,
  'le propriétaire lisant via la vue ne voit pas le nom anonyme (D-07)');

reset role;

select testkit.as_user(user_id, 'dave29@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.gift_items_for_list where id = %L and reserved_by_name = %L',
  'gitem29_x', 'Tonton')),
  1::bigint,
  'un membre non-propriétaire voit le nom anonyme via la vue');

reset role;

select testkit.as_user(user_id, 'carol29@example.fr') from testkit.fx where key = 'carol';
set local role authenticated;

select testkit.eq(testkit.count(
  'select 1 from public.gift_items_for_list where id = ''gitem29_x'''),
  0::bigint,
  'un autre foyer ne voit rien via la vue');

reset role;

-- ===========================================================================
-- 8. Libération gestionnaire des deux formes d'auteur (D-08, choix 4 : simple
--    UPDATE, sans RPC) + article libéré réservable à nouveau.
-- ===========================================================================
-- Alice, admin non propriétaire : libère la forme anonyme sur la liste foyer
-- (qu'elle lit : visibility foyer ; la privée d'autrui lui est illisible,
--  y compris en UPDATE — la SELECT policy filtre aussi les lignes modifiées).
select testkit.as_user(user_id, 'alice29@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_ok(
  'update public.gift_items set reserved_by_name = null where id = ''gitem29_f''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem29_f'' and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'l''admin libère une réserve anonyme sur une liste lisible');

reset role;

-- Bob, propriétaire non admin : libère les deux formes sur sa liste privée.
select testkit.as_user(user_id, 'bob29@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

select testkit.expect_ok(
  'update public.gift_items set reserved_by = null where id = ''gitem29_c''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem29_c'' and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire libère une réserve membre');

select testkit.expect_ok(
  'update public.gift_items set reserved_by_name = null where id = ''gitem29_a''');
select testkit.eq(testkit.count(
  'select 1 from public.gift_items where id = ''gitem29_a'' and reserved_by is null and reserved_by_name is null'),
  1::bigint,
  'le propriétaire libère une réserve anonyme');

reset role;

-- Article libéré : réservable à nouveau par la voie invitée.
select testkit.eq(
  (public.guest_reserve_gift_item(
    (select h1 from testkit.hashes), 'gitem29_a', 'Papi'
  ) ->> 'already_reserved')::boolean,
  false,
  'un article libéré est réservable à nouveau');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'le compteur reste intact après libération et nouvelle réserve');

rollback;
