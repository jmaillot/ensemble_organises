-- supabase/tests/0044_membership_periods.sql
-- Phase 08 Messages (plan 08-08, D-13 amendant D-12) : les absences sont
-- mémorisées (périodes) — le ré-ajouté ne relit PAS les messages parus
-- pendant ses absences, ni les annonces système de la période.
--
-- Rouge→vert : avant 0105, « Bob part, Alice écrit pendant l'absence, Bob
-- est ré-ajouté, Bob relit le message du creux » rendait 1 ligne (le ré-ajouté
-- relit tout, D-12) — reproduit avant la migration, qui l'inverse. Après
-- 0105 : le creux (normal comme système) est invisible au ré-ajouté,
-- l'avant-départ + ses propres annonces restent, le second creux s'accumule,
-- le retrait des archives reste aveugle, les restants sont entiers, toute
-- écriture cliente des périodes est refusée.
--
-- Horloges : les transactions validées font avancer `now()` — chaque creux
-- est posté dans une transaction POSTÉRIEURE au départ (donc après la
-- pierre) et chaque retour ouvre sa fenêtre dans une transaction POSTÉRIEURE
-- au creux (donc après lui). Aucun `pg_sleep`, aucun horodatage explicite :
-- l'ordre vient des validations, comme en production. (Les horodatages
-- explicites futuristes de 0043 — pierre + 1 minute — tomberaient APRÈS la
-- fenêtre rouverte et resteraient visibles : artefact de preuve documenté
-- en 08-07-SUMMARY, pas une faille.)
--
-- Structure : T1 fonde et prouve le silence puis VALIDE ; T2 départ puis
-- VALIDE ; T3 creux + ajout Dan puis VALIDE ; T4 réadhésion + creux caché
-- (ROUGE avant 0105) puis VALIDE ; T5 second départ puis VALIDE ; T6 second
-- creux puis VALIDE ; T7 seconde réadhésion + accumulation puis VALIDE ;
-- T8 négatifs + push + non-lus + invariant puis VALIDE ; T9 retrait des
-- archives aveugle puis VALIDE ; T10 nettoie puis valide. Les courriels sont
-- suffixés d'un aléa et T1 purge foyers + clés : une exécution interrompue
-- (rouge y compris) ne bloque jamais la suivante — seul le nettoyage manuel
-- des comptes Auth résiduels du rouge est attendu (comme en 0043).
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.
--
-- Côté non-lus : aucun état serveur de lecture n'existe (suivi local,
-- cf. useReadConversations) ; le SQL prouve le marqueur d'exclusion
-- (`sender_id IS NULL`, jamais d'auteur) et l'intégrité des lignes
-- normales — la preuve du sélecteur est côté Vitest (08-04/08-06).

-- ===========================================================================
-- T1 : fondation (transaction fondatrice, validée).
-- ===========================================================================
begin;

-- Clés reprises + foyer d'une exécution antérieure interrompue après son
-- `commit` (le rouge s'arrête en T4, T10 ne tourne jamais).
delete from testkit.fx where key in (
  'gap_alice', 'gap_bob', 'gap_carol', 'gap_dan',
  'gap_ealice', 'gap_edan',
  'gap_home',
  'gap_alice_m', 'gap_bob_m', 'gap_carol_m', 'gap_dan_m',
  'gap_conv', 'gap_msg_pre', 'gap_msg_gap1', 'gap_msg_gap2', 'gap_msg_after'
);
delete from public.households where name in ('Foyer Messages Absences');

do $$
declare
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  alice uuid := testkit.auth_user('gap-alice-' || v_tag || '@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('gap-bob-' || v_tag || '@example.fr', 'Bob Martin');
  carol uuid := testkit.auth_user('gap-carol-' || v_tag || '@example.fr', 'Carol Martin');
  dan uuid := testkit.auth_user('gap-dan-' || v_tag || '@example.fr', 'Dan Martin');
  home text := testkit.household(alice, 'Foyer Messages Absences');
  alice_m text;
  bob_m text;
  carol_m text;
  dan_m text;
  conv text := private.new_id('conversation');
  msg_pre text := private.new_id('message');
  msg_gap1 text := private.new_id('message');
  msg_gap2 text := private.new_id('message');
  msg_after text := private.new_id('message');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  carol_m := testkit.member(home, carol, 'Carol Martin', 'membre', 'coral');
  dan_m := testkit.member(home, dan, 'Dan Martin', 'membre', 'amber');
  insert into testkit.fx (key, user_id) values
    ('gap_alice', alice), ('gap_bob', bob),
    ('gap_carol', carol), ('gap_dan', dan);
  insert into testkit.fx (key, row_id) values
    ('gap_ealice', 'gap-alice-' || v_tag || '@example.fr'),
    ('gap_edan', 'gap-dan-' || v_tag || '@example.fr');
  insert into testkit.fx (key, household_id) values ('gap_home', home);
  insert into testkit.fx (key, row_id) values
    ('gap_alice_m', alice_m),
    ('gap_bob_m', bob_m),
    ('gap_carol_m', carol_m),
    ('gap_dan_m', dan_m),
    ('gap_conv', conv),
    ('gap_msg_pre', msg_pre),
    ('gap_msg_gap1', msg_gap1),
    ('gap_msg_gap2', msg_gap2),
    ('gap_msg_after', msg_after);

  -- Fil fondé en SQL direct : Alice + Bob + Carol dans la transaction
  -- fondatrice (Dan, du même foyer, n'en est pas encore).
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon des absences');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, carol_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (msg_pre, conv, home, alice_m, 'Avant la premiere absence');
end;
$$;

-- ===========================================================================
-- T1 (suite) : la création est muette (silence 0103, contrôle).
-- ===========================================================================
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'les fondateurs n''annoncent rien (silence creation, controle)');

reset role;

commit;

-- ===========================================================================
-- T2 : Bob quitte — pierre + annonce, fenêtre figée (transaction validée).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'Bob quitte son fil (premiere pierre)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le depart annonce le fil une fois (controle 0101)');

reset role;

-- Le partant relit l'avant-départ et sa propre annonce, rien d'autre.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Avant la premiere absence''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le partant relit l''avant-depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le partant relit l''annonce de son propre depart');

reset role;

commit;

-- ===========================================================================
-- T3 : creux — Alice écrit pendant l'absence, Dan est ajouté (annonce
-- système intérimaire). Le tombé ne voit rien du creux (0102, contrôle vert
-- avant comme après 0105) ; les présents voient tout.
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (%L, %L, %L, %L, ''Pendant absence Bob un'')',
  (select row_id from testkit.fx where key = 'gap_msg_gap1'),
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_alice_m')));

-- Ajout tardif pendant l'absence : l'arrivée de Dan annonce le fil (0103) —
-- cette annonce système est elle aussi du creux pour Bob.
select testkit.eq(testkit.affected(format(
  'insert into public.conversation_members (conversation_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select row_id from testkit.fx where key = 'gap_dan_m'))), 1::bigint,
  'Dan est ajoute pendant l''absence (annonce interimaire)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Dan Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'l''arrivee de Dan annonce le fil une fois (controle 0103)');

reset role;

-- Tombé : aveugle au creux normal comme système (0102, vert avant/après).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Pendant absence Bob un''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le tombe ne relit pas le normal du creux (controle 0102)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Dan Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le tombe ne relit pas le systeme du creux (controle 0102)');

reset role;

-- Présents : tout, creux compris. Dan relit même l'avant (ajout tardif,
-- comportement 0103 conservé).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'la restante voit l''avant et le creux');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'la restante voit depart et arrivee interimaire');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_dan';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Avant la premiere absence''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'l''ajoute tardif relit l''avant (comportement 0103 conserve)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Pendant absence Bob un''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'l''ajoute pendant le creux lit le creux');

reset role;

-- Ventilateur : le tombé n'est pas notifié du creux (0100, contrôle).
select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' where mn.message_id = %L'
  ' and n.user_id = (select user_id from testkit.fx where key = ''gap_bob'')',
  (select row_id from testkit.fx where key = 'gap_msg_gap1'))), 0::bigint,
  'le ventilateur push ignore le tombe pour le creux (inchange)');

select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' where mn.message_id = %L',
  (select row_id from testkit.fx where key = 'gap_msg_gap1'))), 2::bigint,
  'le ventilateur vise les deux presentes pour le creux (controle)');

commit;

-- ===========================================================================
-- T4 : réadhésion — le creux reste caché au ré-ajouté (ROUGE avant 0105 :
-- le ré-ajouté relit tout, D-12), l'avant et ses annonces restent.
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select row_id from testkit.fx where key = 'gap_bob_m'))), 1::bigint,
  'Alice re-admet Bob en effacant sa pierre (voie 0104)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'la readhesion annonce l''arrivee au nom fige, une fois (controle 0104)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

-- D-13 (ROUGE avant 0105) : le ré-ajouté ne relit ni le normal ni le
-- système du creux.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Pendant absence Bob un''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le re-ajoute ne relit pas le normal du creux (ROUGE avant 0105)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Dan Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le re-ajoute ne relit pas le systeme du creux (ROUGE avant 0105)');

-- ... mais relit l'avant-départ, son départ et son arrivée.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Avant la premiere absence''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le re-ajoute relit l''avant-depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le re-ajoute relit l''annonce de son depart');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le re-ajoute relit l''annonce de sa propre arrivee');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le re-ajoute ne voit qu''un seul normal (avant, pas le creux)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'le re-ajoute voit deux systemes (depart + arrivee, pas l''interimaire)');

reset role;

-- Restante entière : tout, creux compris.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'la restante voit les deux normaux apres la readhesion');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 3::bigint,
  'la restante voit les trois systemes (depart, interimaire, arrivee)');

reset role;

commit;

-- ===========================================================================
-- T5 : Bob requitte — seconde pierre + annonce (transaction validée).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'Bob requitte son fil (seconde pierre)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'le second depart annonce une fois de plus');

reset role;

commit;

-- ===========================================================================
-- T6 : second creux (transaction validée).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (%L, %L, %L, %L, ''Pendant absence Bob deux'')',
  (select row_id from testkit.fx where key = 'gap_msg_gap2'),
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_alice_m')));

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Pendant absence Bob deux''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le second creux est poste pendant l''absence');

reset role;

commit;

-- ===========================================================================
-- T7 : seconde réadhésion — les deux creux restent cachés (accumulation),
-- puis le fil post-retour est lisible et notifié.
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'update public.conversation_members set left_at = null'
  ' where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select row_id from testkit.fx where key = 'gap_bob_m'))), 1::bigint,
  'Alice re-admet Bob une seconde fois (voie 0104)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a rejoint la conversation''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'la seconde readhesion annonce a nouveau');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

-- Accumulation : les deux creux cachés, l'avant et les quatre annonces
-- propres visibles (départ 1, arrivée 1, départ 2, arrivée 2 — pas
-- l'interimaire de Dan).
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Pendant absence Bob un''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le premier creux reste cache apres la seconde absence');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and content = ''Pendant absence Bob deux''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le second creux est cache lui aussi (fenetres cumulees)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''Avant la premiere absence''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'l''avant-depart survit aux deux absences');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 4::bigint,
  'le re-ajoute voit ses quatre annonces propres, pas l''interimaire');

reset role;

-- Fil post-retour : Alice écrit après le retour, Bob le lit et le reçoit.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.expect_ok(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content)'
  ' values (%L, %L, %L, %L, ''De retour pour de bon'')',
  (select row_id from testkit.fx where key = 'gap_msg_after'),
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_alice_m')));

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is not null and content = ''De retour pour de bon''',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'le re-ajoute lit le fil poste apres son retour');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 2::bigint,
  'le re-ajoute voit deux normaux (avant + apres, jamais les creux)');

reset role;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 4::bigint,
  'la restante voit les quatre normaux');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 5::bigint,
  'la restante voit les cinq systemes');

reset role;

commit;

-- ===========================================================================
-- T8 : négatifs (périodes infalsifiables), push, non-lus, invariant de
-- couverture (transaction validée).
-- ===========================================================================
begin;

-- Forgé refusé : aucune écriture ni lecture cliente des périodes (T-08-10).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';
set local role authenticated;

select testkit.expect_denied(
  'insert into public.conversation_membership_periods (conversation_id, member_id, joined_at)'
  ' values (''x'', ''y'', now())',
  'un client ne forge pas de periode (insertion refusee)');

select testkit.expect_denied(
  'update public.conversation_membership_periods set left_at = null',
  'un client ne rouvre pas une periode (mise a jour refusee)');

select testkit.expect_denied(
  'delete from public.conversation_membership_periods',
  'un client n''efface pas l''historique de presence (suppression refusee)');

select testkit.expect_denied(
  'select 1 from public.conversation_membership_periods',
  'un client ne lit pas les periodes en direct (lecture refusee)');

reset role;

-- Silence : les quatre normaux en file, aucun système (contraposée).
select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is not null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 4::bigint,
  'les quatre normaux sont entres en file push (controle)');

select testkit.eq(testkit.count(format(
  'select 1 from public.message_notifications mn'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'aucun systeme (departs comme arrivees) n''entre en file push');

-- Le ré-ajouté est entier pour le push : notifié du post-retour...
select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' where mn.message_id = %L'
  ' and n.user_id = (select user_id from testkit.fx where key = ''gap_bob'')',
  (select row_id from testkit.fx where key = 'gap_msg_after'))), 1::bigint,
  'le ventilateur vise le re-ajoute pour le post-retour');

-- ... et toujours sourd aux systèmes.
select testkit.eq(testkit.count(format(
  'select 1 from private.push_message_notifications(now()) n'
  ' join public.message_notifications mn on mn.id = n.reminder_id'
  ' join public.messages m on m.id = mn.message_id'
  ' where m.household_id = %L and m.conversation_id = %L and m.sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'le ventilateur ignore tous les systemes, interimaires compris');

-- Non-lus : cinq systèmes sans auteur, quatre normaux avec auteur.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 5::bigint,
  'les systemes gardent leur marqueur d''exclusion (predicat non-lus intact)');

-- Invariant de couverture : la fenêtre la plus ancienne d'un membre sans
-- absence couvre le contenu le plus ancien — l'historique complet par
-- construction (même promesse que le remblai 0105 pour les ré-ajoutés
-- d'avant le changement, dont le creux est inconnaissable). Lecture directe
-- des périodes : après `reset role` (rôle propriétaire — aucun client ne les
-- lit, prouvé ci-dessus par les quatre refus).
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_alice';

reset role;

select testkit.eq((
  select min(pp.joined_at) <= min(m.created_at)
    from public.conversation_membership_periods pp
    join public.messages m on m.conversation_id = pp.conversation_id
   where pp.conversation_id = (select row_id from testkit.fx where key = 'gap_conv')
     and pp.member_id = (select row_id from testkit.fx where key = 'gap_alice_m')
), true,
  'la premiere fenetre d''Alice couvre le premier contenu (historique complet)');

commit;

-- ===========================================================================
-- T9 : retrait des archives — pleinement aveugle, comme avant (D-08 intact).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'gap_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'gap_conv'))), 1::bigint,
  'Bob quitte une troisieme fois (troisieme pierre)');

select testkit.eq(testkit.affected(format(
  'delete from public.conversation_members where conversation_id = %L and member_id = %L',
  (select row_id from testkit.fx where key = 'gap_conv'),
  (select row_id from testkit.fx where key = 'gap_bob_m'))), 1::bigint,
  'Bob retire le fil de ses archives (sa propre pierre)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'apres retrait des archives, le fil est invisible en messages');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'gap_home'),
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'apres retrait des archives, le fil est invisible en conversations');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'gap_conv'))), 0::bigint,
  'apres retrait des archives, le registre est invisible');

reset role;

commit;

-- ===========================================================================
-- T10 : nettoyage des lignes validées (cascades : fil, messages, file,
-- périodes ; puis comptes, et clés `fx`).
-- ===========================================================================
begin;

delete from public.households
 where id in (select household_id from testkit.fx where key in ('gap_home'));

delete from auth.users
 where id in (select user_id from testkit.fx where key in ('gap_alice', 'gap_bob', 'gap_carol', 'gap_dan'));

delete from testkit.fx where key in (
  'gap_alice', 'gap_bob', 'gap_carol', 'gap_dan',
  'gap_ealice', 'gap_edan',
  'gap_home',
  'gap_alice_m', 'gap_bob_m', 'gap_carol_m', 'gap_dan_m',
  'gap_conv', 'gap_msg_pre', 'gap_msg_gap1', 'gap_msg_gap2', 'gap_msg_after'
);

commit;
