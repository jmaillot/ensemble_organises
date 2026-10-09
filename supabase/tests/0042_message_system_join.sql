-- supabase/tests/0042_message_system_join.sql
-- Phase 08 Messages (plan 08-06, D-11) : l'arrivée annonce le fil comme le
-- départ — ligne système figée serveur, infalsifiable, sans push ni non-lus —
-- sauf les membres présents à la création (pas de spam initial).
--
-- Rouge→vert : avant 0103, « ajouter Carol après coup annonce le fil »
-- rendait 0 ligne (l'ajout est muet) — reproduit avant la migration, qui
-- l'inverse. Après 0103 : l'ajout tardif annonce une fois au nom figé, la
-- réadhésion après départ annonce à nouveau, la création reste muette des
-- deux côtés, le faux est refusé à chaque entrée, aucune file push.
--
-- Règle de silence à la création (choix documenté de l'exécutant) : les
-- membres fondateurs partagent la transaction fondatrice de la conversation
-- (même `xmin` que la ligne `conversations`) — le RPC `create_conversation`
-- comme les ensemencés directs insèrent fil + membres dans une seule
-- transaction, donc muets par construction ; tout ajout ultérieur vit dans
-- une transaction neuve (`xmin` distinct) et annonce. Ni horloge, ni marquage :
-- la distinction est la transaction elle-même. Cas limite honnête : un fil
-- créé en SQL brut en deux transactions annoncerait ses seconds membres —
-- ils n'étaient pas dans l'instant fondateur.
--
-- Deux transactions, donc trois blocs : la preuve de l'ajout tardif EXIGE un
-- `xmin` distinct de celui du fil, impossible dans la transaction unique des
-- autres suites (c'est précisément pourquoi 0040/0041 restent vertes sans
-- retouche : leurs ré-insertions partagent la transaction fondatrice). T1
-- fonde et prouve le silence puis VALIDE (`commit`) ; T2 prouve l'annonce, la
-- réadhésion et les négatifs puis ANNULE (`rollback`) ; T3 nettoie les lignes
-- validées de T1 puis valide. Les courriels sont suffixés d'un aléa par
-- exécution et les clés `fx` purgées en tête : une exécution interrompue
-- (rouge y compris) ne bloque jamais la suivante.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.
--
-- Côté non-lus : aucun état serveur de lecture n'existe (suivi local,
-- cf. useReadConversations) ; le SQL prouve le marqueur d'exclusion
-- (`sender_id IS NULL`, même forme que 0101) — la preuve du sélecteur est
-- côté Vitest (08-06, Tasks 2/3).

-- ===========================================================================
-- T1 : fondation (transaction fondatrice, validée).
-- ===========================================================================
begin;

-- Clés reprises, jamais dupliquées : une exécution antérieure interrompue
-- après son `commit` a pu les laisser.
delete from testkit.fx where key in (
  'jarr_alice', 'jarr_bob', 'jarr_carol',
  'jarr_ealice', 'jarr_ebob', 'jarr_ecarol',
  'jarr_home', 'jarr_alice_m', 'jarr_bob_m', 'jarr_carol_m',
  'jarr_conv', 'jarr_conv2', 'jarr_msg1'
);

do $$
declare
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  alice uuid := testkit.auth_user('jarr-alice-' || v_tag || '@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('jarr-bob-' || v_tag || '@example.fr', 'Bob Martin');
  carol uuid := testkit.auth_user('jarr-carol-' || v_tag || '@example.fr', 'Carol Martin');
  home text := testkit.household(alice, 'Foyer Messages Arrivees');
  alice_m text;
  bob_m text;
  carol_m text;
  conv text := private.new_id('conversation');
  msg1 text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  carol_m := testkit.member(home, carol, 'Carol Martin', 'membre', 'coral');
  insert into testkit.fx (key, user_id) values
    ('jarr_alice', alice), ('jarr_bob', bob), ('jarr_carol', carol);
  insert into testkit.fx (key, row_id) values
    ('jarr_ealice', 'jarr-alice-' || v_tag || '@example.fr'),
    ('jarr_ebob', 'jarr-bob-' || v_tag || '@example.fr'),
    ('jarr_ecarol', 'jarr-carol-' || v_tag || '@example.fr');
  insert into testkit.fx (key, household_id) values ('jarr_home', home);
  insert into testkit.fx (key, row_id) values
    ('jarr_alice_m', alice_m),
    ('jarr_bob_m', bob_m),
    ('jarr_carol_m', carol_m),
    ('jarr_conv', conv),
    ('jarr_msg1', msg1);

  -- Fil fondé en SQL direct : Alice + Bob dans la transaction fondatrice.
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon des arrivees');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg1, conv, home, alice_m, 'Bienvenue au salon');
end;
$$;

-- Second fil fondé par le vrai chemin applicatif (RPC atomique) : muet aussi.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
-- Par porté du `as_user` : la revendication courriel ne sert qu'à imiter
-- PostgREST, `auth.uid()` ne lit que le `sub` sur cet instantané.
set local role authenticated;

select public.create_conversation(
  (select household_id from testkit.fx where key = 'jarr_home'),
  'groupe', 'Salon bis',
  (select jsonb_build_array(
    (select row_id from testkit.fx where key = 'jarr_alice_m'),
    (select row_id from testkit.fx where key = 'jarr_bob_m')))
);

reset role;

insert into testkit.fx (key, row_id)
select 'jarr_conv2', c.id from public.conversations c
 where c.household_id = (select household_id from testkit.fx where key = 'jarr_home')
   and c.title = 'Salon bis';

-- ===========================================================================
-- T1 (suite) : la création est muette des deux côtés, fil direct comme RPC.
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'les fondateurs directs n''annoncent rien (silence creation, fil brut)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv2'))), 0::bigint,
  'les fondateurs par RPC n''annoncent rien (silence creation, vrai chemin)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'le message de fondation reste lisible (controle)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'le second fondateur ne voit aucune annonce non plus');

reset role;

-- La transaction fondatrice se ferme : tout ajout ultérieur aura un `xmin`
-- distinct et annoncera. Voir l'en-tête.
commit;

-- ===========================================================================
-- T2 : vie tardive — ajout, réadhésion, négatifs (transaction annulée).
-- ===========================================================================
begin;

-- L'ajout tardif : Carol n'était pas dans l'instant fondateur.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select row_id from testkit.fx where key = 'jarr_carol_m'))), 1::bigint,
  'l''admin ajoute Carol apres coup');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content like ''%%a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'l''ajout tardif annonce le fil par une ligne d''arrivee unique (ROUGE avant 0103)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'l''arrivee fige le nom de la jointe au moment de l''ajout');

reset role;

-- Visible des deux côtés : restants comme jointe.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'la jointe lit l''annonce de sa propre arrivee');

reset role;

-- ===========================================================================
-- Faux système refusé à chaque entrée (même forme que 0101, prouvé pour
-- l'espèce arrivée).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (''jarr-faux'', %L, %L, null, ''Fausse arrivee'')',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select household_id from testkit.fx where key = 'jarr_home')),
  'un client ne forge pas de ligne d''arrivee (insertion refusee)');

select testkit.eq(testkit.affected(format(
  'update public.messages set content = ''Pirate'' where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'un client ne reedite pas une ligne d''arrivee');

select testkit.eq(testkit.affected(format(
  'update public.messages set sender_id = %L where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'jarr_alice_m'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'un client n''adopte pas une ligne d''arrivee en auteur');

select testkit.eq(testkit.affected(format(
  'delete from public.messages where conversation_id = %L and sender_id is null',
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'un client ne supprime pas une ligne d''arrivee');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_carol';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (''jarr-faux-carol'', %L, %L, null, ''Fausse arrivee de la jointe'')',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select household_id from testkit.fx where key = 'jarr_home')),
  'la jointe ne forge pas de ligne d''arrivee non plus');

reset role;

-- ===========================================================================
-- Silence : aucune file push pour l'espèce arrivée (contraposée : la ligne
-- normale de fondation y est, elle, bien entrée à l'insertion).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is not null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'la ligne normale de fondation est entree en file push (controle)');

select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'la ligne d''arrivee n''entre jamais en file push');

select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 0::bigint,
  'le ventilateur push ignore la ligne d''arrivee');

-- ===========================================================================
-- Nom figé : le renommage de la jointe ne réécrit pas l'histoire.
-- ===========================================================================
do $$
begin
  update public.household_members
     set display_name = 'Caroline Martin'
   where id = (select row_id from testkit.fx where key = 'jarr_carol_m');
end;
$$;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'le renommage de la jointe ne reecrit pas l''annonce figee');

reset role;

-- ===========================================================================
-- Réadhésion : Carol part (annonce de départ au nom renommé), l'admin
-- nettoie la pierre (muet) puis la ré-insère — l'arrivée annonce à nouveau.
-- La partante tombée relit sa fenêtre (historique + ses deux annonces).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_carol';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'Carol quitte son fil (pierre tombale)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Caroline Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'le depart fige le nom courant, pas l''ancien');

-- Fenêtre du partant (0102) : l'arrivée (née avant la pierre) et l'annonce
-- de départ (née à la pierre) sont dedans, rien d'autre.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 2::bigint,
  'la partante relit son arrivee et son depart, rien de plus');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select row_id from testkit.fx where key = 'jarr_carol_m'))), 1::bigint,
  'l''admin supprime la pierre tombale de la partante');

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select row_id from testkit.fx where key = 'jarr_carol_m'))), 1::bigint,
  'l''admin reinsere la partante (readhesion)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content like ''%%a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 2::bigint,
  'la readhesion annonce l''arrivee a nouveau');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Caroline Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 1::bigint,
  'la seconde arrivee fige le nom renomme');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 3::bigint,
  'le fil porte arrivee, depart, arrivee — et rien d''autre en systeme');

reset role;

-- Sémantique 0100 intacte : la réadmise écrit à nouveau.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_carol';
set local role authenticated;

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (%L, %L, %L, %L, ''De retour parmi vous'')',
  (select row_id from testkit.fx where key = 'jarr_msg1') || '-retour',
  (select row_id from testkit.fx where key = 'jarr_conv'),
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_carol_m')));

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'jarr_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'jarr_home'),
  (select row_id from testkit.fx where key = 'jarr_conv'))), 2::bigint,
  'l''historique normal survit aux trois annonces, ecrit de la readmise compris');

reset role;

rollback;

-- ===========================================================================
-- T3 : nettoyage des lignes validées de T1 (cascades : fil, messages, file,
-- membres du foyer ; puis comptes, profils en cascade, et clés `fx`).
-- ===========================================================================
begin;

delete from public.households
 where id = (select household_id from testkit.fx where key = 'jarr_home');

delete from auth.users
 where id in (select user_id from testkit.fx where key in ('jarr_alice', 'jarr_bob', 'jarr_carol'));

delete from testkit.fx where key in (
  'jarr_alice', 'jarr_bob', 'jarr_carol',
  'jarr_ealice', 'jarr_ebob', 'jarr_ecarol',
  'jarr_home', 'jarr_alice_m', 'jarr_bob_m', 'jarr_carol_m',
  'jarr_conv', 'jarr_conv2', 'jarr_msg1'
);

commit;
