-- supabase/tests/0026_gift_invites.sql
-- Invitations à code des listes de cadeaux (0079) + vue masquée (0080).
--
-- Table `gift_list_invites` invisible et inscriptible pour anon/authenticated
-- (aucune politique, GRANT service_role seuls), quatre RPC service_role
-- seuls, bornes D-15 rejetées (hash 64-hex, max_uses 1-100, expiration
-- future ≤ 90j ; défauts max_uses 20, expires +90j), gestion réservée au
-- propriétaire OU à un admin du foyer, échange atomique et idempotent
-- (D-16, D-17) avec oracle uniforme `code invalide`, et vue
-- `gift_items_for_list` masquant `reserved_by` au propriétaire (T-05-03).
--
-- Les RPC sont appelés ici avec le rôle propriétaire (postgres), comme le
-- fait l'Edge Function avec la clé secrète : `authenticated` n'y a pas
-- accès, ce que la section 1 vérifie explicitement (motif 0003).
--
-- Scénario : foyer A (Alice admin, Bob membre et propriétaire des listes,
-- Erin admin, Dave membre), foyer B (Carol admin), Gwen sans foyer.

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  erin uuid := testkit.auth_user('erin@example.fr', 'Erin Petit');
  dave uuid := testkit.auth_user('dave@example.fr', 'Dave Durand');
  carol uuid := testkit.auth_user('carol@example.fr', 'Carol Durand');
  gwen uuid := testkit.auth_user('gwen@example.fr', 'Gwen Leconte');

  home_a text := testkit.household(alice, 'Foyer A');
  home_b text := testkit.household(carol, 'Foyer B');

  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Martin', 'membre', 'ink');
  erin_m text := testkit.member(home_a, erin, 'Erin Petit', 'admin', 'coral');
  dave_m text := testkit.member(home_a, dave, 'Dave Durand', 'membre', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Durand', 'admin', 'coral');
begin
  -- Liste privée (tests d'invitation) + liste partagée (test de la vue),
  -- toutes deux possédées par Bob, membre non admin : la gestion par Erin
  -- prouvera la branche admin-non-propriétaire.
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl_privee', home_a, bob_m, 'Noel Prive', 'privee');
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl_partagee', home_a, bob_m, 'Noel Partage', 'partagee');

  -- Article réservé par Erin sur la liste partagée (test de la vue 0080).
  insert into public.gift_items (id, list_id, household_id, name, reserved_by)
  values ('gitem_v', 'gl_partagee', home_a, 'Écharpe', erin_m);

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m),
    ('erin', erin, home_a, erin_m),
    ('dave', dave, home_a, dave_m),
    ('carol', carol, home_b, carol_m),
    ('gwen', gwen, null, null);
end;
$$;

-- Mêmes raisons que `testkit.fx` : lue après `set local role authenticated`,
-- une table temporaire serait en permission refusée (motif 0003).
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
-- 1. Un client ne voit ni ne touche la table, et n'appelle aucun RPC
-- ===========================================================================
select testkit.as_user(user_id, 'alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

select testkit.expect_denied('select * from public.gift_list_invites',
  'la table des codes est illisible par un client');
select testkit.expect_denied(format(
  'insert into public.gift_list_invites (list_id, token_hash, created_by) values (%L, %L, %L)',
  'gl_privee', (select h1 from testkit.hashes), (select user_id from testkit.fx where key = 'alice')),
  'la table des codes est inscriptible par aucun client');
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'alice'), 'gl_privee', (select h1 from testkit.hashes)),
  'un client n''appelle pas la creation');
select testkit.expect_denied(
  'select public.gift_list_invite_summary((select user_id from testkit.fx where key = ''alice''), ''gl_privee'')',
  'un client n''appelle pas le resume');
select testkit.expect_denied(
  'select public.revoke_gift_list_invite((select user_id from testkit.fx where key = ''alice''), ''gl_privee'')',
  'un client n''appelle pas la revocation');
select testkit.expect_denied(format(
  'select public.redeem_gift_list_invite(%L, %L)',
  (select h1 from testkit.hashes), (select user_id from testkit.fx where key = 'alice')),
  'un client n''echange pas un code en direct');

reset role;

-- ===========================================================================
-- 2. Bornes D-15 rejetées + gestion réservée (propriétaire ou admin)
-- ===========================================================================
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'bob'), 'gl_privee', 'pas-un-hash'),
  'une empreinte mal formee est refusee');
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L, p_max_uses => %s)',
  (select user_id from testkit.fx where key = 'bob'), 'gl_privee', (select h1 from testkit.hashes), '0'),
  'max_uses 0 est refuse');
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L, p_max_uses => %s)',
  (select user_id from testkit.fx where key = 'bob'), 'gl_privee', (select h1 from testkit.hashes), '101'),
  'max_uses 101 est refuse');
select testkit.expect_denied(
  'select public.create_gift_list_invite(p_actor_id => (select user_id from testkit.fx where key = ''bob''), p_list_id => ''gl_privee'', p_token_hash => (select h1 from testkit.hashes), p_expires_at => now() - interval ''1 hour'')',
  'une expiration passee est refusee');
select testkit.expect_denied(
  'select public.create_gift_list_invite(p_actor_id => (select user_id from testkit.fx where key = ''bob''), p_list_id => ''gl_privee'', p_token_hash => (select h1 from testkit.hashes), p_expires_at => now() + interval ''5 years'')',
  'une expiration au-dela de 90 jours est refusee');
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'dave'), 'gl_privee', (select h1 from testkit.hashes)),
  'un membre non proprietaire et non admin ne cree pas de code');
select testkit.expect_denied(format(
  'select public.create_gift_list_invite(p_actor_id => %L, p_list_id => %L, p_token_hash => %L)',
  (select user_id from testkit.fx where key = 'carol'), 'gl_privee', (select h1 from testkit.hashes)),
  'un admin d''un autre foyer ne cree pas de code');

-- ===========================================================================
-- 3. Cycle de vie : création (défauts D-15), résumé, régénération, révocation
-- ===========================================================================
-- Erin, admin non propriétaire : la gestion n'exige pas d'être propriétaire.
select testkit.eq(
  (public.create_gift_list_invite(
    p_actor_id => (select user_id from testkit.fx where key = 'erin'),
    p_list_id => 'gl_privee',
    p_token_hash => (select h1 from testkit.hashes)
  ) ->> 'max_uses')::int,
  20,
  'le defaut max_uses vaut 20 (D-15)');
select testkit.eq(
  ((public.gift_list_invite_summary(
    p_actor_id => (select user_id from testkit.fx where key = 'erin'),
    p_list_id => 'gl_privee'
  ) ->> 'expires_at')::timestamptz <= now() + interval '90 days'),
  true,
  'le defaut d''expiration ne depasse pas 90 jours (D-15)');
select testkit.eq(
  ((public.gift_list_invite_summary(
    p_actor_id => (select user_id from testkit.fx where key = 'erin'),
    p_list_id => 'gl_privee'
  ) ->> 'expires_at')::timestamptz >= now() + interval '89 days'),
  true,
  'le defaut d''expiration vise 90 jours, pas une valeur arbitraire');
select testkit.eq(
  (public.gift_list_invite_summary(
    p_actor_id => (select user_id from testkit.fx where key = 'erin'),
    p_list_id => 'gl_privee'
  ) ->> 'is_active')::boolean,
  true,
  'le code cree est actif');

-- Bob, propriétaire non admin : la gestion n'exige pas d'être admin. La
-- régénération désactive aussitôt le code d'Erin sur CETTE liste.
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl_privee',
  p_token_hash => (select h2 from testkit.hashes),
  p_max_uses => 10
);
select testkit.eq(
  (select count(*) from public.gift_list_invites where list_id = 'gl_privee' and is_active),
  1::bigint,
  'un seul code actif a la fois pour la liste');
select testkit.eq(
  (select is_active from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  false,
  'le code precedent est desactive par la regeneration');

-- Révocation par Alice (admin du foyer, non propriétaire), puis refus
-- d'échanger le code révoqué (message vérifié en section 6).
select testkit.eq(
  (public.revoke_gift_list_invite(
    p_actor_id => (select user_id from testkit.fx where key = 'alice'),
    p_list_id => 'gl_privee'
  ) ->> 'revoked')::int >= 1,
  true,
  'la revocation retourne le nombre de codes desactives');
select testkit.eq(
  (select count(*) from public.gift_list_invites where list_id = 'gl_privee' and is_active),
  0::bigint,
  'plus aucun code actif apres revocation');
select testkit.expect_denied(format(
  'select public.revoke_gift_list_invite(%L, %L)',
  (select user_id from testkit.fx where key = 'dave'), 'gl_privee'),
  'un membre non gestionnaire ne revoque pas');

-- ===========================================================================
-- 4. Échange membre (D-17) : partage `reservation`, idempotent sans consommer
-- ===========================================================================
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'bob'),
  p_list_id => 'gl_privee',
  p_token_hash => (select h3 from testkit.hashes),
  p_max_uses => 10
);

select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h3 from testkit.hashes),
    p_actor_id => (select user_id from testkit.fx where key = 'erin')
  ) ->> 'already_shared')::boolean,
  false,
  'le premier echange cree le partage');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl_privee'' and shared_with_member_id = (select row_id from testkit.fx where key = ''erin'') and permission = ''reservation'''),
  1::bigint,
  'le partage membre est en permission reservation (D-17)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h3 from testkit.hashes)),
  1,
  'le compteur est incremente');
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h3 from testkit.hashes),
    p_actor_id => (select user_id from testkit.fx where key = 'erin')
  ) ->> 'already_shared')::boolean,
  true,
  'un second echange du meme membre est idempotent');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h3 from testkit.hashes)),
  1,
  'l''echange idempotent ne consomme pas de jeton');

-- ===========================================================================
-- 5. Échange e-mail externe (D-17) : même idempotence, même compteur
-- ===========================================================================
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h3 from testkit.hashes),
    p_email => 'Externe@Exemple.fr'
  ) ->> 'already_shared')::boolean,
  false,
  'le premier echange e-mail cree le partage');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where list_id = ''gl_privee'' and shared_with_email = ''externe@exemple.fr'' and permission = ''reservation'''),
  1::bigint,
  'l''e-mail est normalise en minuscules, en permission reservation');
select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h3 from testkit.hashes),
    p_email => 'externe@exemple.fr'
  ) ->> 'already_shared')::boolean,
  true,
  'un second echange du meme e-mail est idempotent');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h3 from testkit.hashes)),
  2,
  'seuls les echanges nouveaux consomment (membre + e-mail)');
select testkit.expect_denied(format(
  'select public.redeem_gift_list_invite(%L, %L, %L)',
  (select h3 from testkit.hashes), null, 'pas-un-email'),
  'un e-mail mal forme est refuse');

-- ===========================================================================
-- 6. Oracle uniforme (T-05-04) : inconnu, malformé, expiré, épuisé, révoqué
-- ===========================================================================
-- Chaque cas doit lever le message unique `code invalide`, sans distinguer
-- les causes. Motif d'assertion 0018 (bloc begin/exception + sqlerrm).
do $$
declare
  h4 text := (select h4 from testkit.hashes);
  h5 text := (select h5 from testkit.hashes);
  dave_u uuid := (select user_id from testkit.fx where key = 'dave');
  bob_u uuid := (select user_id from testkit.fx where key = 'bob');
begin
  -- Épuisé : max_uses 1, consommé par Dave, refusé à un autre e-mail.
  perform public.create_gift_list_invite(bob_u, 'gl_privee', h4, null, 1);
  perform public.redeem_gift_list_invite(h4, dave_u);
  begin
    perform public.redeem_gift_list_invite(h4, null, 'autre@exemple.fr');
    perform testkit.ok(false, 'un code epuise aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code epuise refuse sans oracle : ' || sqlerrm);
  end;

  -- Expiré : créé valide, périmé par mise à jour (le refus tient à la date,
  -- rejouée à chaque échange, pas au drapeau — motif 0017).
  perform public.create_gift_list_invite(bob_u, 'gl_privee', h5, now() + interval '2 days', 10);
  update public.gift_list_invites set expires_at = now() - interval '1 second' where token_hash = h5;
  begin
    perform public.redeem_gift_list_invite(h5, dave_u);
    perform testkit.ok(false, 'un code expire aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code expire refuse sans oracle : ' || sqlerrm);
  end;

  -- Inconnu : empreinte bien formée, jamais créée.
  begin
    perform public.redeem_gift_list_invite(
      '0000000000000000000000000000000000000000000000000000000000000000', dave_u);
    perform testkit.ok(false, 'un code inconnu aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code inconnu refuse sans oracle : ' || sqlerrm);
  end;

  -- Malformé : le format ne distingue pas plus que l'absence.
  begin
    perform public.redeem_gift_list_invite('xyz', dave_u);
    perform testkit.ok(false, 'un code malforme aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code malforme refuse sans oracle : ' || sqlerrm);
  end;

  -- Révoqué : le code h2 de la section 3, révoqué par Alice.
  begin
    perform public.redeem_gift_list_invite((select h2 from testkit.hashes), dave_u);
    perform testkit.ok(false, 'un code revoque aurait du etre refuse');
  exception when others then
    perform testkit.ok(sqlerrm like '%code invalide%', 'code revoque refuse sans oracle : ' || sqlerrm);
  end;
end;
$$;

rollback;
