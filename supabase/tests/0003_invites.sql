-- supabase/tests/0003_invites.sql
-- Cycle de vie des tokens d'invitation.
--
-- Les quatre opérations serveur sont appelées ici avec les privilèges du rôle
-- propriétaire (postgres), comme le fait l'Edge Function avec la clé secrète :
-- `authenticated` n'y a pas accès, ce que la section 1 vérifie explicitement.
--
-- Les empreintes ci-dessous sont des valeurs arbitraires : en production, le
-- token brut est tiré au hasard par la fonction et seul son HMAC arrive ici.

begin;


do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');
  erin uuid := testkit.auth_user('erin@example.fr', 'Erin Petit');
  frank uuid := testkit.auth_user('frank@example.fr', 'Frank Roux');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');
begin
  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('carol', carol, home_b, carol_m),
    ('dave', dave, null, null),
    ('erin', erin, null, null),
    ('frank', frank, null, null);
end;
$$;

-- Mêmes raisons que `testkit.fx` : lue après `set local role authenticated`,
-- une table temporaire serait en permission refusée.
create table testkit.hashes ("h1" text, "h2" text, "h3" text, "h4" text, "h5" text, "h6" text);
insert into testkit.hashes values
  ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
   'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
   'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
   'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
   'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
   'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
grant select on testkit.hashes to anon, authenticated;

-- ===========================================================================
-- 1. Un client ne peut pas appeler les opérations serveur
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.create_household_invite_token(p_actor_id => %L, p_household_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'alice'), (select household_id from testkit.fx where key = 'alice'),
  (select h1 from testkit.hashes)));
select testkit.expect_denied(format(
  'select public.household_invite_token_summary(%L, %L)',
  (select user_id from testkit.fx where key = 'alice'), (select household_id from testkit.fx where key = 'alice')));
select testkit.expect_denied(format(
  'select public.revoke_household_invite_tokens(%L, %L)',
  (select user_id from testkit.fx where key = 'alice'), (select household_id from testkit.fx where key = 'alice')));
select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h1 from testkit.hashes), (select user_id from testkit.fx where key = 'alice'), 'Alice'));
select testkit.expect_denied('select * from public.household_invite_tokens');

reset role;

-- ===========================================================================
-- 2. Génération d'un token
-- ===========================================================================
select testkit.eq(
  (public.create_household_invite_token(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_household_id => (select household_id from testkit.fx where key = 'alice'),
    p_token_hash => (select h1 from testkit.hashes),
    p_max_uses => 10
  ) ->> 'max_uses')::int,
  10,
  'la création renvoie le nombre d''utilisations maximal');

select testkit.eq(
  (select count(*) from public.household_invite_tokens
    where household_id = (select household_id from testkit.fx where key = 'alice')),
  1::bigint,
  'un token est créé pour le foyer');

select testkit.ok(
  (select token_hash from public.household_invite_tokens
    where household_id = (select household_id from testkit.fx where key = 'alice')) = (select h1 from testkit.hashes),
  'la base ne conserve que l''empreinte HMAC');

select testkit.ok(
  not exists (
    select 1 from public.household_invite_tokens
     where char_length(token_hash) <> 64 or token_hash !~ '^[0-9a-f]{64}$'
  ),
  'toute empreinte est un HMAC-SHA-256 hexadécimal de 64 caractères');

select testkit.eq(
  (select is_active from public.household_invite_tokens
    where household_id = (select household_id from testkit.fx where key = 'alice')),
  true,
  'le token créé est actif');

-- Un membre ordinaire ne peut pas gérer les invitations du foyer.
select testkit.expect_denied(format(
  'select public.create_household_invite_token(p_actor_id => %L, p_household_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'bob'), (select household_id from testkit.fx where key = 'alice'),
  (select h2 from testkit.hashes)));

-- Un administrateur d'un autre foyer non plus.
select testkit.expect_denied(format(
  'select public.create_household_invite_token(p_actor_id => %L, p_household_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'carol'), (select household_id from testkit.fx where key = 'alice'),
  (select h2 from testkit.hashes)));

-- Bornes de sécurité sur les paramètres.
-- `p_max_uses` n'est pas refusé mais ramené à 100, comme `p_expires_at` à
-- 90 jours : le contrat est « ne jamais accorder plus que la borne », testé
-- en section 11. On n'affirme donc rien ici.
select testkit.expect_denied(format(
  'select public.create_household_invite_token(p_actor_id => %L, p_household_id => %L, p_token_hash => %L, p_expires_at => now() - interval ''1 day'')',
  (select user_id from testkit.fx where key = 'alice'), (select household_id from testkit.fx where key = 'alice'),
  (select h2 from testkit.hashes)));
select testkit.expect_denied(format(
  'select public.create_household_invite_token(p_actor_id => %L, p_household_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'alice'), (select household_id from testkit.fx where key = 'alice'), 'pas-un-hmac'));

-- ===========================================================================
-- 3. Résumé : jamais d'empreinte dans la réponse
-- ===========================================================================
select testkit.eq(
  (public.household_invite_token_summary(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_household_id => (select household_id from testkit.fx where key = 'alice')
  ) ->> 'use_count')::int,
  0,
  'le résumé reflète le compteur d''utilisations');
select testkit.ok(
  not (public.household_invite_token_summary(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_household_id => (select household_id from testkit.fx where key = 'alice')
  ) ? 'token_hash'),
  'le résumé ne contient jamais l''empreinte');
select testkit.expect_denied(format(
  'select public.household_invite_token_summary(%L, %L)',
  (select user_id from testkit.fx where key = 'bob'), (select household_id from testkit.fx where key = 'alice')));

-- ===========================================================================
-- 4. Régénération : le token précédent est immédiatement invalidé
-- ===========================================================================
select public.create_household_invite_token(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_household_id => (select household_id from testkit.fx where key = 'alice'),
  p_token_hash => (select h2 from testkit.hashes),
  p_max_uses => 5
);

select testkit.eq(
  (select count(*) from public.household_invite_tokens where is_active), 1::bigint,
  'un seul token actif à la fois');
select testkit.eq(
  (select is_active from public.household_invite_tokens where token_hash = (select h1 from testkit.hashes)), false,
  'le token précédent est désactivé');
select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h1 from testkit.hashes), (select user_id from testkit.fx where key = 'dave'), 'Dave'),
  'un token régénéré ne fonctionne plus');

-- ===========================================================================
-- 5. Utilisation du token
-- ===========================================================================
select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h3 from testkit.hashes), (select user_id from testkit.fx where key = 'dave'), 'Dave'),
  'une empreinte inconnue est refusée');

select testkit.eq(
  (public.redeem_household_invite_token(
    p_token_hash => (select h2 from testkit.hashes),
    p_user_id => (select user_id from testkit.fx where key = 'dave'),
    p_display_name => 'Dave Durand',
    p_role => 'admin'
  ) ->> 'already_member')::boolean,
  false,
  'la première utilisation crée l''appartenance');

select testkit.eq(
  (public.redeem_household_invite_token(
    p_token_hash => (select h2 from testkit.hashes),
    p_user_id => (select user_id from testkit.fx where key = 'dave'),
    p_display_name => 'Dave Durand'
  ) ->> 'already_member')::boolean,
  true,
  'une seconde utilisation par le même utilisateur est idempotente');

select testkit.eq(
  (select use_count from public.household_invite_tokens where token_hash = (select h2 from testkit.hashes)), 1,
  'une utilisation idempotente ne consomme pas de jeton');

-- Un token d'invitation n'attribue jamais le rôle admin.
select testkit.eq(
  (select role from public.household_members
    where user_id = (select user_id from testkit.fx where key = 'dave')), 'membre',
  'le rôle transmis par le client est ignoré : seul membre ou enfant est accepté');
select testkit.eq(
  (select display_name from public.household_members
    where user_id = (select user_id from testkit.fx where key = 'dave')), 'Dave Durand',
  'le nom du membre provient du profil');
select testkit.eq(
  (select household_id from public.household_members
    where user_id = (select user_id from testkit.fx where key = 'dave')), (select household_id from testkit.fx where key = 'alice'),
  'le membre rejoint le bon foyer');

-- Le nouveau membre ne peut pas s'attribuer les privilèges du foyer rejoint.
select testkit.as_user(user_id, 'dave@example.fr') from testkit.fx where key = 'dave';
set local role authenticated;
select testkit.eq(testkit.count('select 1 from public.household_members'), 3::bigint,
  'Dave voit désormais les membres du foyer A');
select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from testkit.fx where key = 'alice'))), 0::bigint,
  'Dave ne peut pas devenir administrateur');
reset role;

-- ===========================================================================
-- 6. Nombre maximal d'utilisations
-- ===========================================================================
select public.create_household_invite_token(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_household_id => (select household_id from testkit.fx where key = 'alice'),
  p_token_hash => (select h4 from testkit.hashes),
  p_max_uses => 1
);

select testkit.eq(
  (public.redeem_household_invite_token(
    p_token_hash => (select h4 from testkit.hashes),
    p_user_id => (select user_id from testkit.fx where key = 'erin'),
    p_display_name => 'Erin Petit'
  ) ->> 'already_member')::boolean,
  false,
  'le premier usage réussit');
select testkit.eq(
  (select use_count from public.household_invite_tokens where token_hash = (select h4 from testkit.hashes)), 1,
  'le compteur est incrémenté');
select testkit.eq(
  (select is_active from public.household_invite_tokens where token_hash = (select h4 from testkit.hashes)), false,
  'un token épuisé est désactivé');
select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h4 from testkit.hashes), (select user_id from testkit.fx where key = 'frank'), 'Frank'),
  'un token épuisé est refusé à un autre membre');

-- ===========================================================================
-- 7. Expiration
-- ===========================================================================
select public.create_household_invite_token(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_household_id => (select household_id from testkit.fx where key = 'alice'),
  p_token_hash => (select h5 from testkit.hashes),
  p_expires_at => now() + interval '2 days',
  p_max_uses => 10
);

update public.household_invite_tokens
   set expires_at = now() - interval '1 second'
 where token_hash = (select h5 from testkit.hashes);

select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h5 from testkit.hashes), (select user_id from testkit.fx where key = 'frank'), 'Frank'),
  'un token expiré est refusé');
-- Le refus est bien définitif, mais le token reste marqué actif jusqu'à la
-- purge quotidienne. `redeem_household_invite_token` ne peut pas le
-- désactiver : l'UPDATE et le `raise` seraient dans la même instruction, et
-- l'exception annulerait l'UPDATE (migration 0017). Le nettoyage appartient à
-- `private.prune_expired_invite_tokens` — vérifié en section 9.
select testkit.eq(
  (select is_active from public.household_invite_tokens where token_hash = (select h5 from testkit.hashes)), true,
  'le token expiré reste actif jusqu''à la purge, sans être réutilisable');

-- Et surtout : le refus ne tient pas au drapeau `is_active`, mais à la
-- comparaison de date, rejouée à chaque échange.
select testkit.expect_denied(format(
  'select public.redeem_household_invite_token(%L, %L, %L)',
  (select h5 from testkit.hashes), (select user_id from testkit.fx where key = 'erin'), 'Erin Petit'),
  'un second échange sur le même token expiré est refusé lui aussi');

-- La date d'expiration est plafonnée à 90 jours.
select testkit.eq(
  (public.create_household_invite_token(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_household_id => (select household_id from testkit.fx where key = 'alice'),
    p_token_hash => (select h6 from testkit.hashes),
    p_expires_at => now() + interval '5 years'
  ) ->> 'expires_at')::timestamptz <= now() + interval '90 days',
  true,
  'l''expiration est plafonnée à 90 jours');

-- ===========================================================================
-- 8. Révocation
-- ===========================================================================
select testkit.eq(
  (public.revoke_household_invite_tokens(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_household_id => (select household_id from testkit.fx where key = 'alice')
  ) ->> 'revoked')::int >= 1,
  true,
  'la révocation retourne le nombre de tokens désactivés');
select testkit.eq(
  (select count(*) from public.household_invite_tokens
    where household_id = (select household_id from testkit.fx where key = 'alice') and is_active), 0::bigint,
  'plus aucun token actif après révocation');
select testkit.expect_denied(format(
  'select public.revoke_household_invite_tokens(%L, %L)',
  (select user_id from testkit.fx where key = 'bob'), (select household_id from testkit.fx where key = 'alice')),
  'un membre ordinaire ne peut pas révoquer les invitations');

-- ===========================================================================
-- 9. Purge automatique
-- ===========================================================================
update public.household_invite_tokens
   set is_active = true, expires_at = now() - interval '1 day'
 where token_hash = (select h6 from testkit.hashes);

select testkit.eq(private.prune_expired_invite_tokens() >= 1, true,
  'la purge désactive les tokens expirés');
select testkit.eq(
  (select is_active from public.household_invite_tokens where token_hash = (select h6 from testkit.hashes)), false,
  'le token expiré a bien été purgé');

-- ===========================================================================
-- 10. Comparaison à temps constant
-- ===========================================================================
select testkit.eq(private.token_hash_matches(repeat('a', 64), repeat('a', 64)), true,
  'deux empreintes identiques correspondent');
select testkit.eq(private.token_hash_matches(repeat('a', 64), repeat('b', 64)), false,
  'deux empreintes différentes ne correspondent pas');
select testkit.eq(private.token_hash_matches(repeat('a', 64), repeat('a', 63)), false,
  'une longueur différente ne correspond pas');
select testkit.eq(private.token_hash_matches(null, repeat('a', 64)), false,
  'une empreinte nulle ne correspond pas');

-- ===========================================================================
-- 11. Bornes : les valeurs excessives sont ramenées, pas refusées
-- ===========================================================================
-- Le contrat n'est pas « refuser la requête » mais « ne jamais accorder plus
-- que la borne » : une expiration au-delà de 90 jours revient à 90 jours, un
-- nombre d'utilisations au-delà de 100 revient à 100. Un appelant hostile ou
-- erroné obtient donc une valeur sûre — et la fonction la lui renvoie, pour
-- qu'il ne croie pas avoir obtenu ce qu'il demandait. Refuser l'appel aurait
-- été une entrave sans gain de sécurité.
--
-- Foyer distinct : chaque appel désactive le token actif du foyer, on ne peut
-- donc pas enchaîner ces vérifications au milieu du récit.
do $$
declare
  erin uuid := testkit.auth_user('bornes@example.fr', 'Erin Petit');
  home text := testkit.household(erin, 'Foyer Bornes');
  -- `testkit.household` ne crée que la ligne `households` : sans ce membre
  -- administrateur, `assert_household_admin` refuserait l'appel.
  erin_m text := testkit.member(home, erin, 'Erin Petit', 'admin', 'accent');
  v_result jsonb;
begin
  v_result := public.create_household_invite_token(
    p_actor_id => erin,
    p_household_id => home,
    p_token_hash => (select h1 from testkit.hashes),
    p_expires_at => now() + interval '400 days',
    p_max_uses => 5000
  );

  perform testkit.eq((v_result ->> 'max_uses')::int, 100,
    'un nombre d''utilisations excessif est ramené à 100');
  perform testkit.ok(
    (v_result ->> 'expires_at')::timestamptz <= now() + interval '90 days',
    'une expiration lointaine est ramenée à 90 jours');
end;
$$;

rollback;
