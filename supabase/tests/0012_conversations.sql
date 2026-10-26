-- supabase/tests/0012_conversations.sql
-- Cycle de vie des conversations (migration 0041) : création atomique avec
-- créateur inclus (enfants compris), ajout ultérieur par un participant,
-- messages non déplaçables, extérieurs refusés.
--
-- `testkit.fx` n'est inscriptible qu'en propriétaire : chaque bloc crée donc
-- sa propre conversation par RPC, sauf la cible de l'outsider (fixture).

begin;

do $$
declare
  alice uuid := testkit.auth_user('conv-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('conv-bob@example.fr', 'Bob Martin');
  kid uuid := testkit.auth_user('conv-kid@example.fr', 'Noé Martin');
  outsider uuid := testkit.auth_user('conv-outsider@example.fr', 'Olivier Fantome');
  home text := testkit.household(alice, 'Foyer Conversation');
  alice_m text;
  bob_m text;
  kid_m text;
  conv_out text := private.new_id('conversation');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  kid_m := testkit.member(home, kid, 'Noé Martin', 'enfant', 'amber');
  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('kid', kid), ('outsider', outsider);
  insert into testkit.fx (key, household_id) values ('home', home);
  insert into testkit.fx (key, row_id) values
    ('alice_m', alice_m),
    ('bob_m', bob_m),
    ('kid_m', kid_m),
    ('conv_out', conv_out);

  -- Cible de l'outsider : groupe Alice + Bob, posée en propriétaire.
  insert into public.conversations (id, household_id, type, title)
  values (conv_out, home, 'groupe', 'Cible');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv_out, alice_m), (conv_out, bob_m);
end;
$$;

-- Membre : groupe à deux, créateur inclus, règles titre/type.
select testkit.as_user(user_id, 'conv-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  bob_m text;
  v_out jsonb;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  v_out := public.create_conversation(home, 'groupe', 'Projet cabane',
    jsonb_build_array(bob_m, alice_m));
  perform testkit.ok((v_out ->> 'id') like 'conversation\_%', 'le RPC renvoie la conversation créée');
  perform testkit.eq(
    testkit.count(format('select 1 from public.conversation_members where conversation_id = %L', v_out ->> 'id')),
    2::bigint, 'les deux membres sont dedans, créateur compris');

  -- Sans le créateur : refusé, pas de fantôme.
  begin
    perform public.create_conversation(home, 'direct', null, jsonb_build_array(alice_m));
    perform testkit.ok(false, 'le créateur doit participer à sa conversation');
  exception when others then
    perform testkit.ok(sqlerrm like '%doit participer%', 'le refus dit le créateur : ' || sqlerrm);
  end;

  -- Groupe sans titre, direct avec titre : refusés comme la contrainte.
  begin
    perform public.create_conversation(home, 'groupe', null, jsonb_build_array(bob_m));
    perform testkit.ok(false, 'un groupe exige un titre');
  exception when others then
    perform testkit.ok(sqlerrm like '%exige un titre%', 'le refus dit le titre : ' || sqlerrm);
  end;
  begin
    perform public.create_conversation(home, 'direct', 'Titre', jsonb_build_array(bob_m));
    perform testkit.ok(false, 'un direct ne porte pas de titre');
  exception when others then
    perform testkit.ok(sqlerrm like '%ne porte pas de titre%', 'le refus dit le titre : ' || sqlerrm);
  end;

  -- Ajout ultérieur : un participant fait entrer un tiers (décision 3).
  -- Pour une ligne enfant gérée (0144/0146), la politique du fil exige le
  -- module `messages` : refusé tant que la fiche n'est pas activée, puis
  -- l'adulte l'active par la fiche et l'ajout passe.
  begin
    insert into public.conversation_members (conversation_id, member_id)
    values (v_out ->> 'id', (select row_id from testkit.fx where key = 'kid_m'));
    perform testkit.ok(false, 'l''ajout de l''enfant exige le module messages activé');
  exception when others then
    perform testkit.ok(sqlerrm like '%row-level security%',
      'l''ajout enfant est refusé tant que le module messages n''est pas activé : ' || sqlerrm);
  end;

  perform public.update_managed_child_profile(
    (select row_id from testkit.fx where key = 'kid_m'),
    'Noé Martin', 'amber', null, null,
    array['taches', 'routines', 'anniversaires', 'menu', 'messages']::text[]);

  insert into public.conversation_members (conversation_id, member_id)
  values (v_out ->> 'id', (select row_id from testkit.fx where key = 'kid_m'));
  perform testkit.eq(
    testkit.count(format('select 1 from public.conversation_members where conversation_id = %L', v_out ->> 'id')),
    3::bigint, 'le tiers a rejoint la conversation');
end;
$$;

reset role;

-- Enfant géré : depuis 0145, l'enfant n'a plus de compte ni de session — il
-- ne crée plus de conversation ni n'écrit de message. L'adulte crée le fil
-- qui le concerne (l'enfant inclus par member_id) et y écrit.
select testkit.as_user(user_id, 'conv-kid@example.fr') from testkit.fx where key = 'kid';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  kid_m text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into kid_m from testkit.fx where key = 'kid_m';

  perform testkit.eq(testkit.count(format(
    'select 1 from public.household_members where user_id = %L',
    (select user_id from testkit.fx where key = 'kid'))), 0::bigint,
    'l''enfant géré n''a plus de compte : son uid ne résout aucun membre (0145)');

  begin
    perform public.create_conversation(home, 'direct', null, jsonb_build_array(kid_m, alice_m));
    perform testkit.ok(false, 'un enfant sans session ne crée plus de conversation');
  exception when others then
    perform testkit.ok(sqlerrm like '%appartenez%',
      'le refus dit l''absence de session : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- L'adulte crée le fil incluant l'enfant et y écrit pour lui ; aucun message
-- n'est porté par la ligne enfant.
select testkit.as_user(user_id, 'conv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  kid_m text;
  v_out jsonb;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into kid_m from testkit.fx where key = 'kid_m';

  -- Le module messages est activé sur la fiche enfant (0146) : la conversation
  -- inclut l'enfant sans autre condition.
  perform public.update_managed_child_profile(
    kid_m, 'Noé Martin', 'amber', null, null,
    array['taches', 'routines', 'anniversaires', 'menu', 'messages']::text[]);

  v_out := public.create_conversation(home, 'direct', null, jsonb_build_array(alice_m, kid_m));
  perform testkit.ok((v_out ->> 'id') like 'conversation\_%', 'l''adulte crée un fil incluant l''enfant');

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (private.new_id('message'), v_out ->> 'id', home, alice_m, 'On joue à quatre heures ?');

  perform testkit.eq(testkit.count(format(
    'select 1 from public.messages where sender_id = %L', kid_m)), 0::bigint,
    'aucun message n''est porté par la ligne enfant (0145 : ciblé, jamais acteur)');
end;
$$;

reset role;

-- Messages non déplaçables : ni de conversation, ni d'auteur.
select testkit.as_user(user_id, 'conv-alice@example.fr') from testkit.fx where key = 'alice';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  bob_m text;
  v_groupe text;
  v_direct text;
  v_msg text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into bob_m from testkit.fx where key = 'bob_m';

  v_groupe := public.create_conversation(home, 'groupe', 'Salon', jsonb_build_array(alice_m, bob_m)) ->> 'id';
  v_direct := public.create_conversation(home, 'direct', null, jsonb_build_array(alice_m, bob_m)) ->> 'id';

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (private.new_id('message'), v_groupe, home, alice_m, 'Bonsoir')
  returning id into v_msg;

  begin
    update public.messages set conversation_id = v_direct where id = v_msg;
    perform testkit.ok(false, 'un message ne change pas de conversation');
  exception when others then
    perform testkit.ok(sqlerrm like '%ne change pas de conversation%', 'le refus dit le déménagement : ' || sqlerrm);
  end;

  begin
    update public.messages set sender_id = bob_m where id = v_msg;
    perform testkit.ok(false, 'un message ne change pas d''auteur');
  exception when others then
    perform testkit.ok(sqlerrm like '%ne change pas d''auteur%', 'le refus dit l''auteur : ' || sqlerrm);
  end;
end;
$$;

reset role;

-- Extérieur : création comme ajout refusés (cible posée en fixture).
select testkit.as_user(user_id, 'conv-outsider@example.fr') from testkit.fx where key = 'outsider';
set local role authenticated;

do $$
declare
  home text;
  alice_m text;
  v_conv text;
begin
  select household_id into home from testkit.fx where key = 'home';
  select row_id into alice_m from testkit.fx where key = 'alice_m';
  select row_id into v_conv from testkit.fx where key = 'conv_out';

  begin
    perform public.create_conversation(home, 'direct', null, jsonb_build_array(alice_m));
    perform testkit.ok(false, 'un extérieur ne crée pas dans le foyer');
  exception when others then
    perform testkit.ok(sqlerrm like '%appartenez%', 'le refus dit l''appartenance : ' || sqlerrm);
  end;

  perform testkit.expect_denied(format(
    'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
    v_conv, alice_m), 'un extérieur n''ajoute personne');
end;
$$;

reset role;

rollback;
