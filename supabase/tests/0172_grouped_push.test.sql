-- supabase/tests/0172_grouped_push.test.sql
-- Push groupé sans contenu (0172, MSG-04 / D-06 / D-07) : trois messages dans
-- un cycle ne font qu'UNE notification, compteur au titre, marques de contenu
-- semées absentes du titre ET du corps, consommation du groupe par liste.

begin;

do $$
declare
  alice uuid := testkit.auth_user('grp-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('grp-bob@example.fr', 'Bob Dupont');
  home text := testkit.household(alice, 'Foyer Push Groupe');
  alice_m text;
  bob_m text;
  conv text := private.new_id('conversation');
  conv2 text := private.new_id('conversation');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Dupont', 'membre', 'ink');
  insert into testkit.fx (key, user_id) values ('alice', alice), ('bob', bob);
  insert into testkit.fx (key, row_id) values ('conv', conv), ('conv2', conv2);

  -- Directe : trois messages de Bob, chacun avec une marque de contenu
  -- distincte. Si l'une d'elles traverse le titre ou le corps, la règle
  -- verrouillée est violée et le test doit être rouge.
  insert into public.conversations (id, household_id, type, title)
    values (conv, home, 'direct', null);
  insert into public.conversation_members (conversation_id, member_id)
    values (conv, alice_m), (conv, bob_m);
  insert into public.messages (id, conversation_id, household_id, sender_id, content) values
    (private.new_id('message'), conv, home, bob_m, 'MARQUEUN panier de sciences'),
    (private.new_id('message'), conv, home, bob_m, 'MARQUEDEUX actus du foyer'),
    (private.new_id('message'), conv, home, bob_m, 'MARQUETROIS raid secret');

  -- Groupe : un seul message, titre du fil autorisé au push.
  insert into public.conversations (id, household_id, type, title)
    values (conv2, home, 'groupe', 'Cuisine');
  insert into public.conversation_members (conversation_id, member_id)
    values (conv2, alice_m), (conv2, bob_m);
  insert into public.messages (id, conversation_id, household_id, sender_id, content)
    values (private.new_id('message'), conv2, home, bob_m, 'MARQUEQUATRE confiture');
end;
$$;

-- D-06 : UNE notification par (destinataire, conversation), pas par message.
select testkit.eq(
  (select count(*) from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'user_id' = (select user_id::text from testkit.fx where key = 'alice')),
  2::bigint, 'trois messages + un message = deux notifications, pas quatre');

-- Le compteur est au titre, avec le prénom du dernier expéditeur (directe).
select testkit.ok(
  exists (
    select 1 from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-' || (select row_id from testkit.fx where key = 'conv')
      and n.value ->> 'title' = '3 nouveaux messages de Bob'
      and n.value ->> 'body' = 'Conversation avec Bob'),
  'directe : « 3 nouveaux messages de Bob » / « Conversation avec Bob »');

-- Le titre du fil est autorisé en groupe, avec le singulier correct.
select testkit.ok(
  exists (
    select 1 from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-' || (select row_id from testkit.fx where key = 'conv2')
      and n.value ->> 'title' = '1 nouveau message dans Cuisine'),
  'groupe : « 1 nouveau message dans Cuisine » (singulier)');

-- T-29-04 : AUCUNE marque de contenu semée ne traverse le titre ni le corps.
select testkit.ok(
  not exists (
    select 1 from jsonb_array_elements(public.due_push_notifications('messages')) n
    where (n.value ->> 'title' like '%MARQUE%'
        or n.value ->> 'body' like '%MARQUE%')),
  'aucune marque de contenu semée n''apparaît dans le push');

-- Le groupe porte la liste des ids de file : trois lignes à consommer d'un coup.
select testkit.eq(
  (select jsonb_array_length(n.value -> 'reminder_ids')
     from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-' || (select row_id from testkit.fx where key = 'conv')),
  3, 'reminder_ids compte les trois messages du groupe');

-- Le scalaire reminder_id reste rempli (compatibilité Edge antérieure) :
-- c'est le dernier id de file du groupe.
select testkit.ok(
  exists (
    select 1 from jsonb_array_elements(public.due_push_notifications('messages')) n
    where n.value ->> 'tag' = 'message-' || (select row_id from testkit.fx where key = 'conv')
      and n.value -> 'reminder_ids' ? (n.value ->> 'reminder_id')),
  'le scalaire reminder_id appartient à reminder_ids du groupe');

-- Consommation du groupe PAR LISTE : les trois lignes partent en un appel.
do $$
declare
  v_ids jsonb;
  v_conv text := (select row_id from testkit.fx where key = 'conv');
  v_conv2 text := (select row_id from testkit.fx where key = 'conv2');
begin
  select n.value -> 'reminder_ids' into v_ids
    from jsonb_array_elements(public.due_push_notifications('messages')) n
   where n.value ->> 'tag' = 'message-' || v_conv;

  perform testkit.eq(
    public.consume_push_reminders(
      jsonb_build_array(jsonb_build_object('kind', 'message', 'ids', v_ids))),
    3, 'la consommation par liste vide le groupe entier');

  perform testkit.eq(
    (select count(*) from public.message_notifications mn
      join public.messages msg on msg.id = mn.message_id
     where msg.conversation_id = v_conv),
    0::bigint, 'plus aucune ligne de file pour la directe');

  -- Un id absent de la file est un no-op compté, jamais une erreur.
  perform testkit.eq(
    public.consume_push_reminders(
      jsonb_build_array(jsonb_build_object('kind', 'message', 'ids', v_ids))),
    0, 're-consommer la même liste ne supprime rien et ne lève rien');

  -- Un kind inconnu porteur d''une liste est ignoré, pas consommé.
  perform testkit.eq(
    public.consume_push_reminders(
      jsonb_build_array(jsonb_build_object('kind', 'inconnu', 'ids', v_ids))),
    0, 'un kind inconnu avec liste n''est pas consommé');

  -- Le groupe de la conversation Cuisine reste intact.
  perform testkit.eq(
    (select count(*) from public.message_notifications mn
      join public.messages msg on msg.id = mn.message_id
     where msg.conversation_id = v_conv2),
    1::bigint, 'le groupe non visé reste dans la file');
end;
$$;

-- La forme scalaire {kind, id} reste valide (compatibilité 0013/0007).
select testkit.eq(
  public.consume_push_reminders(jsonb_build_array(
    jsonb_build_object('kind', 'message', 'id',
      (select mn.id from public.message_notifications mn
        join public.messages msg on msg.id = mn.message_id
       where msg.conversation_id = (select row_id from testkit.fx where key = 'conv2'))))),
  1, 'le scalaire {kind, id} consomme toujours une ligne de file');

rollback;
