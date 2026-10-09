-- supabase/tests/0043_member_rejoin.sql
-- Phase 08 Messages (plan 08-07, D-12) : réadhésion = effacement du `left_at`
-- (jamais supprimer+recréer) — un participant actif ou un admin ranime la
-- pierre tombale en une seule mise à jour, l'arrivée s'annonce comme tout
-- ajout ultérieur, les lectures se relèvent, le nouveau départ re-borne.
--
-- Rouge→vert : avant 0104, « Bob (participant non-admin) ranime Carol en
-- effaçant sa pierre » rendait 0 ligne touchée (aucune politique UPDATE sur
-- le registre — le deux-temps est, lui, bloqué : suppression refusée au
-- non-admin, ré-insertion en conflit de clé) — reproduit avant la migration,
-- qui l'inverse. Après 0104 : la mise à jour touche 1 ligne, annonce une
-- fois au nom figé, relève les lectures, et le re-départ re-borne.
--
-- Trois transactions comme 0042 (la voie historique delete+re-insert n'annonce
-- que dans une transaction neuve — même `xmin` que le fil = silence de
-- fondation). T1 fonde et prouve le silence puis VALIDE ; T2 prouve la
-- réadhésion, la fenêtre mobile et les négatifs puis ANNULE ; T3 nettoie puis
-- valide. Courriels suffixés d'un aléa, clés `fx` purgées et foyers repris par
-- nom en tête : une exécution interrompue (rouge y compris) ne bloque jamais
-- la suivante.
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.
--
-- Artefact d'horloge assumé (même famille que 0041) : le message du premier
-- creux porte un `created_at` explicite (pierre + 1 minute) pour naître après
-- elle dans une transaction unique au `now()` gelé. Il est donc postérieur
-- aussi à la seconde pierre (quelques secondes réelles plus tard) : après le
-- re-départ, la partante ne le relit plus — non parce que la fenêtre aurait
-- reculé, mais parce que cet horodatage de preuve est dans le futur. En
-- production, tout message posté avant le re-départ est naturellement sous la
-- borne neuve. Le déplacement de la fenêtre se prouve par : pierre neuve >
-- pierre snapshotée, message d'après (pierre2 + 1 minute) exclu, historique
-- d'avant inclus.

-- ===========================================================================
-- T1 : fondation (transaction fondatrice, validée).
-- ===========================================================================
begin;

-- Clés reprises + foyers d'une exécution antérieure interrompue après son
-- `commit` (le rouge s'arrête en T2, T3 ne tourne jamais).
delete from testkit.fx where key in (
  'radd_alice', 'radd_bob', 'radd_carol', 'radd_dan', 'radd_eve',
  'radd_ealice', 'radd_ebob', 'radd_ecarol', 'radd_edan', 'radd_eeve',
  'radd_home', 'radd_evehome',
  'radd_alice_m', 'radd_bob_m', 'radd_carol_m', 'radd_dan_m', 'radd_eve_m',
  'radd_conv', 'radd_msg_pre', 'radd_msg_gap', 'radd_msg_back', 'radd_msg_after2',
  'radd_stone1'
);
delete from public.households where name in ('Foyer Messages Readhesions', 'Foyer Dehors');

do $$
declare
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  alice uuid := testkit.auth_user('radd-alice-' || v_tag || '@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('radd-bob-' || v_tag || '@example.fr', 'Bob Martin');
  carol uuid := testkit.auth_user('radd-carol-' || v_tag || '@example.fr', 'Carol Martin');
  dan uuid := testkit.auth_user('radd-dan-' || v_tag || '@example.fr', 'Dan Martin');
  eve uuid := testkit.auth_user('radd-eve-' || v_tag || '@example.fr', 'Eve Dupont');
  home text := testkit.household(alice, 'Foyer Messages Readhesions');
  evehome text := testkit.household(eve, 'Foyer Dehors');
  alice_m text;
  bob_m text;
  carol_m text;
  dan_m text;
  eve_m text;
  conv text := private.new_id('conversation');
  msg_pre text := private.new_id('message');
  msg_gap text := private.new_id('message');
  msg_back text := private.new_id('message');
  msg_after2 text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  carol_m := testkit.member(home, carol, 'Carol Martin', 'membre', 'coral');
  dan_m := testkit.member(home, dan, 'Dan Martin', 'membre', 'amber');
  eve_m := testkit.member(evehome, eve, 'Eve Dupont', 'membre', 'violet');
  insert into testkit.fx (key, user_id) values
    ('radd_alice', alice), ('radd_bob', bob), ('radd_carol', carol),
    ('radd_dan', dan), ('radd_eve', eve);
  insert into testkit.fx (key, row_id) values
    ('radd_ealice', 'radd-alice-' || v_tag || '@example.fr'),
    ('radd_edan', 'radd-dan-' || v_tag || '@example.fr'),
    ('radd_eeve', 'radd-eve-' || v_tag || '@example.fr');
  insert into testkit.fx (key, household_id) values
    ('radd_home', home), ('radd_evehome', evehome);
  insert into testkit.fx (key, row_id) values
    ('radd_alice_m', alice_m),
    ('radd_bob_m', bob_m),
    ('radd_carol_m', carol_m),
    ('radd_dan_m', dan_m),
    ('radd_eve_m', eve_m),
    ('radd_conv', conv),
    ('radd_msg_pre', msg_pre),
    ('radd_msg_gap', msg_gap),
    ('radd_msg_back', msg_back),
    ('radd_msg_after2', msg_after2);

  -- Fil fondé en SQL direct : Alice + Bob + Carol dans la transaction
  -- fondatrice (Dan, du même foyer, n'en est pas — le non-membre du fil).
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon des retours');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, carol_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_pre, conv, home, alice_m, 'Bienvenue au salon des retours');
end;
$$;

-- ===========================================================================
-- T1 (suite) : la création est muette (silence 0103, contrôle).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 0::bigint,
  'les fondateurs n''annoncent rien (silence creation, controle)');

reset role;

commit;

-- ===========================================================================
-- T2 : départ, blocage du deux-temps, réadhésion en une mise à jour,
-- fenêtre mobile, négatifs, voie historique (transaction annulée).
-- ===========================================================================
begin;

-- Carol quitte : pierre + annonce de départ (0101, contrôle).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'Carol quitte son fil (premiere pierre)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'le depart annonce le fil une fois (controle 0101)');

-- Message du creux : explicite pierre + 1 minute (voir l'en-tête).
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)'
  ' select %L, %L, %L, %L, ''Pendant l''''absence de Carol'', cm.left_at + interval ''1 minute'''
  ' from public.conversation_members cm where cm.conversation_id = %L and cm.member_id = %L',
  (select row_id from testkit.fx where key = 'radd_msg_gap'),
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_alice_m'),
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m')));

reset role;

-- Fenêtre figée avant réadhésion (0102, contrôle) : la partante ne relit pas
-- le message du creux.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'la partante ne relit que l''avant-depart, pas le creux (controle 0102)');

reset role;

-- Snapshot de la première pierre (comparaison du déplacement, voir l'en-tête).
insert into testkit.fx (key, row_id)
select 'radd_stone1', cm.left_at::text
  from public.conversation_members cm
 where cm.conversation_id = (select row_id from testkit.fx where key = 'radd_conv')
   and cm.member_id = (select row_id from testkit.fx where key = 'radd_carol_m');

-- ===========================================================================
-- Blocage du deux-temps pour le non-admin (pièce du rapport UAT, verte avant
-- comme après 0104 : aucune politique touchée par ces deux verbes).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 0::bigint,
  'le participant non-admin ne supprime pas la pierre d''autrui (deux-temps bloque)');

select testkit.expect_denied(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m')),
  'la re-insertion se heurte a la cle (deux-temps bloque, sans le delete)');

-- ===========================================================================
-- D-12 (ROUGE avant 0104) : le participant ranime la pierre en une mise à
-- jour — 0 ligne touchée sans la politique, 1 avec.
-- ===========================================================================
select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 1::bigint,
  'le participant re-admet la partante en effacant sa pierre (ROUGE avant 0104)');

-- L'arrivée s'annonce comme tout ajout ultérieur (D-12), au nom figé.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'la readhesion annonce l''arrivee au nom fige, une fois');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 2::bigint,
  'le fil porte depart puis arrivee — et rien d''autre en systeme');

reset role;

-- Lectures relevées : la ré-admise relit tout, creux compris (D-12).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 2::bigint,
  'la re-admise relit l''avant-depart et le creux (borne levee)');

-- Sémantique 0100 intacte : la ré-admise écrit à nouveau.
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (%L, %L, %L, %L, ''De retour parmi vous'')',
  (select row_id from testkit.fx where key = 'radd_msg_back'),
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_carol_m')));

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 3::bigint,
  'l''historique normal survit a la readhesion, ecrit de la re-admise compris');

reset role;

-- ===========================================================================
-- Nouveau départ = borne neuve (D-10/D-12) : la fenêtre se déplace, l'après
-- est exclu, l'avant reste.
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'Carol requitte son fil (seconde pierre)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members'
  ' where conversation_id = %L and member_id = %L'
  ' and left_at > (select row_id::timestamptz from testkit.fx where key = ''radd_stone1'')',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 1::bigint,
  'la seconde pierre est posterieure a la premiere (fenetre deplacee)');

-- Message d'après : explicite pierre2 + 1 minute.
select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content, created_at)'
  ' select %L, %L, %L, %L, ''Apres le re-depart'', cm.left_at + interval ''1 minute'''
  ' from public.conversation_members cm where cm.conversation_id = %L and cm.member_id = %L',
  (select row_id from testkit.fx where key = 'radd_msg_after2'),
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_alice_m'),
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m')));

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Apres le re-depart''',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 0::bigint,
  'la re-partante ne relit pas l''apres (borne neuve)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Bienvenue au salon des retours''',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 1::bigint,
  'la re-partante relit toujours l''avant (fenetre, pas aveuglement)');

reset role;

-- ===========================================================================
-- Négatifs : hors habilitation, ni réadhésion ni faux départ (T-08-09).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_eve';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 0::bigint,
  'l''outsider ne re-admet personne');

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = now()'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_bob_m'))), 0::bigint,
  'l''outsider ne fait partir personne (faux depart refuse)');

select testkit.expect_denied(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_eve_m')),
  'l''outsider n''ajoute personne (insertion inchangee, refusee)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_dan';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 0::bigint,
  'le non-membre du fil ne re-admet personne');

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = now()'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_bob_m'))), 0::bigint,
  'le non-membre du fil ne fait partir personne (faux depart refuse)');

select testkit.expect_denied(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_dan_m')),
  'le non-membre du fil ne s''ajoute pas lui-meme (insertion inchangee, refusee)');

reset role;

-- Même habilité, mauvaise transition : un participant ne fait pas partir un
-- actif en lui posant une pierre (la politique n'ouvre que l'effacement).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = now()'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_alice_m'))), 0::bigint,
  'le participant ne fait pas partir un actif (seul l''effacement est ouvert)');

reset role;

-- ===========================================================================
-- Voie historique intacte : l'admin nettoie la pierre (muet) puis ré-insère —
-- l'arrivée annonce à nouveau (0103, transaction neuve).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 1::bigint,
  'l''admin supprime la seconde pierre (nettoyage historique)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 3::bigint,
  'le nettoyage de pierre reste muet (depart, arrivee, re-depart)');

select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'radd_conv'),
  (select row_id from testkit.fx where key = 'radd_carol_m'))), 1::bigint,
  'l''admin reinsere la partante (voie historique intacte)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Carol Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 2::bigint,
  'la voie historique annonce l''arrivee a nouveau, au nom fige');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 4::bigint,
  'le fil porte depart, arrivee, re-depart, re-arrivee — et rien d''autre');

reset role;

-- Active à nouveau : la réinsérée relit tout sans borne.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'radd_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 4::bigint,
  'la re-admise par la voie historique relit tout le fil');

reset role;

-- ===========================================================================
-- Silence : aucune ligne système en file push (contraposée : les quatre
-- lignes normales y sont).
-- ===========================================================================
select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is not null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 4::bigint,
  'les quatre lignes normales sont entrees en file push (controle)');

select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 0::bigint,
  'aucune ligne systeme (departs comme arrivees) n''entre en file push');

select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'radd_home'),
  (select row_id from testkit.fx where key = 'radd_conv'))), 0::bigint,
  'le ventilateur push ignore les lignes systeme de readhesion');

rollback;

-- ===========================================================================
-- T3 : nettoyage des lignes validées de T1 (cascades : fil, messages, file,
-- membres du foyer ; puis comptes, profils en cascade, et clés `fx`).
-- ===========================================================================
begin;

delete from public.households
 where id in (select household_id from testkit.fx where key in ('radd_home', 'radd_evehome'));

delete from auth.users
 where id in (select user_id from testkit.fx where key in ('radd_alice', 'radd_bob', 'radd_carol', 'radd_dan', 'radd_eve'));

delete from testkit.fx where key in (
  'radd_alice', 'radd_bob', 'radd_carol', 'radd_dan', 'radd_eve',
  'radd_ealice', 'radd_ebob', 'radd_ecarol', 'radd_edan', 'radd_eeve',
  'radd_home', 'radd_evehome',
  'radd_alice_m', 'radd_bob_m', 'radd_carol_m', 'radd_dan_m', 'radd_eve_m',
  'radd_conv', 'radd_msg_pre', 'radd_msg_gap', 'radd_msg_back', 'radd_msg_after2',
  'radd_stone1'
);

commit;
