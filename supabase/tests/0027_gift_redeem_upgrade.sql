-- supabase/tests/0027_gift_redeem_upgrade.sql
-- Surclassement `lecture` → `reservation` à l'échange d'un code (0082,
-- D-17) : un partage pré-existant en lecture seule (dialogue) ne bloque
-- plus le droit de réservation de l'invité. Idempotence conservée
-- (compteur intact, `already_shared: true`).

begin;

do $$
declare
  alice uuid := testkit.auth_user('alice27@example.fr', 'Alice Vingt');
  bob uuid := testkit.auth_user('bob27@example.fr', 'Bob Vingt');

  home_a text := testkit.household(alice, 'Foyer 27');
  alice_m text := testkit.member(home_a, alice, 'Alice Vingt', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Vingt', 'membre', 'ink');
begin
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('gl27_privee', home_a, alice_m, 'Noel 27', 'privee');

  -- Partage membre pré-existant en `lecture` (dialogue) + partage e-mail
  -- pré-existant en `lecture`.
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('sh27_membre', 'gl27_privee', bob_m, 'lecture');
  insert into public.gift_list_shares (id, list_id, shared_with_email, permission)
  values ('sh27_email', 'gl27_privee', 'externe27@exemple.fr', 'lecture');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('alice', alice, home_a, alice_m),
    ('bob', bob, home_a, bob_m);
end;
$$;

create table testkit.hashes ("h1" text, "h2" text);
insert into testkit.hashes values
  ('1111111111111111111111111111111111111111111111111111111111111111',
   '2222222222222222222222222222222222222222222222222222222222222222');
grant select on testkit.hashes to anon, authenticated;

-- ===========================================================================
-- 1. Échange membre surclasse `lecture` → `reservation`, sans consommer
-- ===========================================================================
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_list_id => 'gl27_privee',
  p_token_hash => (select h1 from testkit.hashes),
  p_max_uses => 10
);

select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h1 from testkit.hashes),
    p_actor_id => (select user_id from testkit.fx where key = 'bob')
  ) ->> 'already_shared')::boolean,
  true,
  'le partage membre pre-existant reste idempotent');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where id = ''sh27_membre'' and permission = ''reservation'''),
  1::bigint,
  'le partage membre lecture est surclasse en reservation (D-17)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h1 from testkit.hashes)),
  0,
  'le surclassement ne consomme pas de jeton');

-- ===========================================================================
-- 2. Échange e-mail surclasse `lecture` → `reservation`, sans consommer
-- ===========================================================================
select public.create_gift_list_invite(
  p_actor_id => (select user_id from testkit.fx where key = 'alice'),
  p_list_id => 'gl27_privee',
  p_token_hash => (select h2 from testkit.hashes),
  p_max_uses => 10
);

select testkit.eq(
  (public.redeem_gift_list_invite(
    p_token_hash => (select h2 from testkit.hashes),
    p_email => 'Externe27@Exemple.fr'
  ) ->> 'already_shared')::boolean,
  true,
  'le partage e-mail pre-existant reste idempotent');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where id = ''sh27_email'' and shared_with_email = ''externe27@exemple.fr'' and permission = ''reservation'''),
  1::bigint,
  'le partage e-mail lecture est surclasse en reservation (D-17)');
select testkit.eq(
  (select use_count from public.gift_list_invites where token_hash = (select h2 from testkit.hashes)),
  0,
  'le surclassement e-mail ne consomme pas de jeton');

rollback;
