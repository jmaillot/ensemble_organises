-- supabase/tests/0132_member_archive_purge.sql
-- Purge du fil mort (migration 0132) : quand la dernière appartenance part, la
-- conversation et ses messages s'en vont. La garde compte autant que la purge :
-- une pierre tombale garde l'accès à l'historique pour le membre parti, donc
-- tant qu'il en reste une, le fil survit à la suppression du dernier actif.

begin;

do $$
declare
  alice uuid := testkit.auth_user('purge-alice@example.fr', 'Alice Purge');
  bob uuid := testkit.auth_user('purge-bob@example.fr', 'Bob Purge');
  home text := testkit.household(alice, 'Foyer Purge');
  alice_m text;
  bob_m text;
  solo text := private.new_id('conversation');
  partage text := private.new_id('conversation');
begin
  alice_m := testkit.member(home, alice, 'Alice Purge', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Purge', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m), ('bob_m', bob_m), ('solo', solo), ('partage', partage);

  -- Fil solo : Alice seule, avec un message à emporter.
  insert into public.conversations (id, household_id, type, title)
  values (solo, home, 'groupe', 'Solo'), (partage, home, 'groupe', 'Partagé');
  insert into public.conversation_members (conversation_id, member_id)
  values (solo, alice_m), (partage, alice_m), (partage, bob_m);

  with inserted as (
    insert into public.messages (conversation_id, household_id, sender_id, content)
    values (solo, home, alice_m, 'Message à purger')
    returning id
  )
  insert into testkit.fx (key, row_id) select 'msg_solo', id from inserted;

  with inserted as (
    insert into public.messages (conversation_id, household_id, sender_id, content)
    values (partage, home, alice_m, 'Message qui reste')
    returning id
  )
  insert into testkit.fx (key, row_id) select 'msg_partage', id from inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Dernière appartenance retirée : le fil et son message disparaissent.
--    Les comptes portent sur les identifiants gardés, pas sur le fil entier :
--    une conversation porte aussi les annonces système de sa création.
-- ---------------------------------------------------------------------------
select testkit.eq(
  (select count(*) from public.messages where id = (select row_id from testkit.fx where key = 'msg_solo')),
  1::bigint, 'le fil solo porte bien son message avant la suppression');

select testkit.as_user((select user_id from testkit.fx where key = 'alice'), 'purge-alice@example.fr');
set local role authenticated;
select testkit.eq(
  ((public.delete_conversation_for_me((select row_id from testkit.fx where key = 'solo'))) ->> 'purged')::boolean,
  true, 'le dernier membre purge le fil');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversations
    where id = (select row_id from testkit.fx where key = 'solo')),
  0::bigint, 'la conversation n''existe plus');
select testkit.eq(
  (select count(*) from public.messages where id = (select row_id from testkit.fx where key = 'msg_solo')),
  0::bigint, 'et son message est parti avec elle (cascade)');
select testkit.eq(
  (select count(*) from public.messages where id = (select row_id from testkit.fx where key = 'msg_partage')),
  1::bigint, 'le message du fil voisin est intact');

-- ---------------------------------------------------------------------------
-- 2. Garde : une pierre tombale restante conserve le fil.
--    Bob part (left_at), Alice supprime sa ligne — il reste celle de Bob, et
--    l'historique qu'il peut lire en lecture seule.
-- ---------------------------------------------------------------------------
update public.conversation_members
   set left_at = now()
 where conversation_id = (select row_id from testkit.fx where key = 'partage')
   and member_id = (select row_id from testkit.fx where key = 'bob_m');

select testkit.as_user((select user_id from testkit.fx where key = 'alice'), 'purge-alice@example.fr');
set local role authenticated;
select testkit.eq(
  ((public.delete_conversation_for_me((select row_id from testkit.fx where key = 'partage'))) ->> 'purged')::boolean,
  false, 'le fil survit à la suppression du dernier membre actif');
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

select testkit.eq(
  (select count(*) from public.conversations
    where id = (select row_id from testkit.fx where key = 'partage')),
  1::bigint, 'la conversation reste en base pour le membre parti');
select testkit.eq(
  (select count(*) from public.messages where id = (select row_id from testkit.fx where key = 'msg_partage')),
  1::bigint, 'son historique aussi');

rollback;
