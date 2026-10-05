-- supabase/tests/0013_message_notifications.sql
-- Notifications push des messages (migration 0042) : file remplie par
-- trigger, lecture `messages` ventilée aux participants sauf l'auteur,
-- préférence respectée, consommation par genre `message`.

begin;

do $$
declare
  alice uuid := testkit.auth_user('msg-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('msg-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('msg-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('msg-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Messages');
  alice_m text;
  bob_m text;
  kid_m text;
  conv text := private.new_id('conversation');
  msg text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  kid_m := testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid), ('outsider', outsider);
  insert into testkit.fx (key, row_id) values
    ('conv', conv), ('msg', msg);

  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, kid_m);

  -- Bob écrit : la file se remplit par trigger, sans appel explicite.
  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg, conv, home, bob_m, 'Bonsoir tout le monde');
end;
$$;

-- Destinataires : Alice et Noé (enfant compris, décision produit), pas Bob
-- l'auteur, pas l'outsider ; tag groupé par conversation.
select testkit.eq(
  (select count(*) from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'user_id' = (select user_id::text from testkit.fx where key = 'alice')),
  1::bigint, 'Alice reçoit le message de Bob');
select testkit.eq(
  (select count(*) from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'user_id' = (select user_id::text from testkit.fx where key = 'kid')),
  1::bigint, 'Noé reçoit le message bien qu''enfant');
select testkit.eq(
  (select count(*) from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'user_id' in (
      select user_id::text from testkit.fx where key in ('bob', 'outsider'))),
  0::bigint, 'ni l''auteur ni l''extérieur ne sont annoncés');
select testkit.ok(
  exists (select 1 from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-' || (select row_id from testkit.fx where key = 'conv')),
  'le tag regroupe par conversation');

-- Préférence coupée : Alice sort de la distribution.
update public.profiles set message_notifications_enabled = false
 where id = (select user_id from testkit.fx where key = 'alice');
select testkit.eq(
  (select count(*) from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'user_id' = (select user_id::text from testkit.fx where key = 'alice')),
  0::bigint, 'la préférence coupe la distribution');

-- Consommation par genre `message` : la file se vide (l'identifiant distribué
-- est celui de la file, pas celui du message).
select testkit.eq(
  public.consume_push_reminders(jsonb_build_array(
    jsonb_build_object('kind', 'message', 'id',
      (select id from public.message_notifications
        where message_id = (select row_id from testkit.fx where key = 'msg'))))),
  1, 'la file est consommée');
select testkit.eq(
  (select count(*) from public.message_notifications
    where message_id = (select row_id from testkit.fx where key = 'msg')),
  0::bigint, 'plus rien à distribuer');

rollback;
