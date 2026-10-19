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

-- Fenêtre de 24 h (`0100:233`) : au-delà, l'annonce s'éteint sans supprimer la
-- file. Le contrôle porte sur `private.push_message_notifications`, où vit la
-- fenêtre ; la préférence, elle, est filtrée plus loin dans
-- `due_push_notifications`, et reste coupée pour Alice à cet endroit du test.
-- Le contrôle positif vient d'abord : sans lui, l'assertion suivante serait
-- vraie pour n'importe quelle raison.
select testkit.eq(
  (select count(*) from private.push_message_notifications(now()) n
    where n.reminder_id = (select id from public.message_notifications
                            where message_id = (select row_id from testkit.fx where key = 'msg'))
      and n.user_id = (select user_id from testkit.fx where key = 'alice')),
  1::bigint, 'un message récent est annoncé');

-- 25 h plus tard : l'annonce s'éteint…
update public.message_notifications
   set created_at = now() - interval '25 hours'
 where message_id = (select row_id from testkit.fx where key = 'msg');
select testkit.eq(
  (select count(*) from private.push_message_notifications(now()) n
    where n.reminder_id = (select id from public.message_notifications
                            where message_id = (select row_id from testkit.fx where key = 'msg'))
      and n.user_id = (select user_id from testkit.fx where key = 'alice')),
  0::bigint, 'un message de plus de 24 h n''est plus annoncé');

-- …et rien n'est supprimé : c'est l'âge qui décide, pas la file.
select testkit.ok(
  exists (select 1 from public.message_notifications
           where message_id = (select row_id from testkit.fx where key = 'msg')),
  'la file garde la ligne : la fenêtre éteint l''annonce, elle ne supprime rien');

-- Remise à l'heure : la consommation qui suit vise l'identifiant de la file.
update public.message_notifications
   set created_at = now()
 where message_id = (select row_id from testkit.fx where key = 'msg');

-- Le dispatch EXÉCUTÉ. La forme fautive de `0042` — une liste de colonnes sur
-- `jsonb_array_elements`, interdite puisque `due_push_notifications` rend du
-- jsonb et non un record — ne se révélait qu'à l'appel, et aucun test ne
-- l'appelait : le job `eo-push-messages` échouait à chaque passage (prod,
-- 2026-10-19). Sans abonnement inscrit, `due` vaut 0 : la fonction rend son
-- objet sans toucher à pg_net, absent de la base de recette, et la ligne
-- fautive s'exécute pour de bon.
select testkit.eq(
  private.dispatch_message_notifications() ->> 'due', '0',
  'le dispatch de messages s''exécute et ne trouve rien à envoyer sans abonnement');
select testkit.eq(
  private.dispatch_message_notifications() ->> 'dispatched', 'false',
  'sans destinataire abonné, aucun envoi n''est tenté');

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
