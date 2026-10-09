-- supabase/tests/0045_conversation_archive_all.sql
-- Phase 08 Messages (plan 08-09, D-14) : la suppression admin est un
-- archivage-pour-tous — un instant commun tombe tous les actifs, les
-- déjà-partis gardent leur borne à l'octet près, le fil figé reste lisible
-- en archives et inscriptible par personne, la destruction est retirée.
--
-- Rouge→vert : avant 0106, « l'admin supprime le fil » vaporisait
-- conversation + messages + appartenances pour tout le monde (prouvé en RED
-- jetable avant la migration : delete = 1 ligne, messages = 0, membres = 0).
-- Après 0106 : la même tentative ne touche aucune ligne, le RPC tombe les
-- actifs au même instant, les bornes préalables sont intactes, personne
-- n'écrit plus, les non-admins sont refusés, les périodes sont fermées.
--
-- Horloges : transactions validées comme en 0044 — chaque étape avance
-- `now()`/`clock_timestamp()` comme en production. Aucun horodatage
-- explicite, aucun `pg_sleep` : l'ordre vient des validations.
--
-- Structure : T1 fonde puis VALIDE ; T2 Bob part puis VALIDE (sa pierre est
-- capturée en texte pour la preuve d'intangibilité) ; T3 Alice archive puis
-- VALIDE (instant commun, bornes, lectures) ; T4 refuse toutes les écritures
-- puis VALIDE (idempotence, négatifs) ; T5 prouve la destruction retirée
-- puis VALIDE (périodes fermées) ; T6 nettoie puis valide. Les courriels sont
-- fixes et T1 purge foyers + clés : une exécution interrompue ne bloque
-- jamais la suivante — seul le nettoyage manuel des comptes Auth résiduels
-- est attendu (comme en 0043/0044).
--
-- Bornes (AGENTS.md §D.2) : chaque comptage est borné au foyer ou au fil via
-- testkit.fx — jamais de total nu sur une table entière.

-- ===========================================================================
-- T1 : fondation (transaction fondatrice, validée).
-- ===========================================================================
begin;

-- Clés reprises + foyer d'une exécution antérieure interrompue.
delete from testkit.fx where key in (
  'arc_alice', 'arc_bob', 'arc_carol', 'arc_dave', 'arc_mia',
  'arc_ealice', 'arc_ebob', 'arc_ecarol',
  'arc_home',
  'arc_alice_m', 'arc_bob_m', 'arc_carol_m',
  'arc_conv', 'arc_bob_stone'
);
delete from public.households where name in ('Foyer Messages Archive');

do $$
declare
  v_tag text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  alice uuid := testkit.auth_user('arc-alice-' || v_tag || '@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('arc-bob-' || v_tag || '@example.fr', 'Bob Martin');
  carol uuid := testkit.auth_user('arc-carol-' || v_tag || '@example.fr', 'Carol Martin');
  dave uuid := testkit.auth_user('arc-dave-' || v_tag || '@example.fr', 'Dave Martin');
  mia uuid := testkit.auth_user('arc-mia-' || v_tag || '@example.fr', 'Mia Exterieure');
  home text := testkit.household(alice, 'Foyer Messages Archive');
  alice_m text;
  bob_m text;
  carol_m text;
  dave_m text;
  conv text := private.new_id('conversation');
begin
  alice_m := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  carol_m := testkit.member(home, carol, 'Carol Martin', 'membre', 'coral');
  dave_m := testkit.member(home, dave, 'Dave Martin', 'membre', 'amber');
  insert into testkit.fx (key, user_id) values
    ('arc_alice', alice), ('arc_bob', bob),
    ('arc_carol', carol), ('arc_dave', dave), ('arc_mia', mia);
  insert into testkit.fx (key, row_id) values
    ('arc_ealice', 'arc-alice-' || v_tag || '@example.fr'),
    ('arc_ebob', 'arc-bob-' || v_tag || '@example.fr'),
    ('arc_ecarol', 'arc-carol-' || v_tag || '@example.fr');
  insert into testkit.fx (key, household_id) values ('arc_home', home);
  insert into testkit.fx (key, row_id) values
    ('arc_alice_m', alice_m),
    ('arc_bob_m', bob_m),
    ('arc_carol_m', carol_m),
    ('arc_conv', conv);

  -- Fil Alice + Bob + Carol (Dave, du même foyer, n'en est pas ; Mia est
  -- hors foyer) + un message d'avant.
  insert into public.conversations (id, household_id, type, title)
  values (conv, home, 'groupe', 'Salon a archiver');
  insert into public.conversation_members (conversation_id, member_id)
  values (conv, alice_m), (conv, bob_m), (conv, carol_m);

  insert into public.messages (id, conversation_id, household_id, sender_id, content)
  values (private.new_id('message'), conv, home, alice_m, 'Avant l''archivage');
end;
$$;

-- Contrôle : trois actifs, aucune tombe, aucune annonce système.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'arc_conv'))), 3::bigint,
  'trois actifs avant l''archive (controle)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 0::bigint,
  'aucune annonce systeme a la fondation (controle)');

reset role;

commit;

-- ===========================================================================
-- T2 : Bob part AVANT l'archive — sa pierre est la borne à préserver,
-- capturée en texte (transaction validée).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_bob';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'select public.leave_conversation(%L)',
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'Bob quitte avant l''archive (premiere pierre)');

reset role;

-- Capture propriétaire de la borne (les clients ne lisent pas les pierres
-- d'autrui en direct ; la comparaison texte prouve l'octet près en T3).
do $$
declare
  v_stone text;
begin
  select cm.left_at::text into v_stone
    from public.conversation_members cm
   where cm.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
     and cm.member_id = (select row_id from testkit.fx where key = 'arc_bob_m');
  insert into testkit.fx (key, row_id) values ('arc_bob_stone', v_stone);
end;
$$;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''Bob Martin a quitté la conversation''',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'le depart de Bob annonce le fil une fois (controle 0101)');

reset role;

commit;

-- ===========================================================================
-- T3 : Alice archive — instant commun, bornes intactes, lectures (validée).
-- ===========================================================================
begin;

select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

-- Le RPC tombe les deux actifs (Bob est déjà parti) : le retour le dit.
select testkit.eq(
  (select (r)->>'archived_members'
     from (select public.archive_conversation((select row_id from testkit.fx where key = 'arc_conv')) as r) s),
  '2',
  'l''archive tombe les deux actifs (Bob deja parti)');

-- Plus aucun actif, trois tombes, aucune ligne disparue.
select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is null',
  (select row_id from testkit.fx where key = 'arc_conv'))), 0::bigint,
  'aucun actif apres l''archive');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L and left_at is not null',
  (select row_id from testkit.fx where key = 'arc_conv'))), 3::bigint,
  'trois tombes apres l''archive, aucune ligne disparue');

-- Un seul instant commun pour les deux nouvellement tombés...
select testkit.eq(testkit.count(
  'select distinct cm.left_at from public.conversation_members cm'
  ' where cm.conversation_id = (select row_id from testkit.fx where key = ''arc_conv'')'
  ' and cm.member_id in (select row_id from testkit.fx where key in (''arc_alice_m'', ''arc_carol_m''))'), 1::bigint,
  'un seul instant commun pour les deux tombes de l''archive');

-- ...distinct de la borne préalable de Bob, elle intacte à l'octet près.
select testkit.eq(testkit.count(
  'select distinct cm.left_at from public.conversation_members cm'
  ' where cm.conversation_id = (select row_id from testkit.fx where key = ''arc_conv'')'), 2::bigint,
  'deux instants distincts : la borne de Bob et l''instant commun');

select testkit.eq(
  (select cm.left_at::text from public.conversation_members cm
    where cm.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and cm.member_id = (select row_id from testkit.fx where key = 'arc_bob_m')),
  (select row_id from testkit.fx where key = 'arc_bob_stone'),
  'la borne de Bob est inchangee a l''octet pres (jamais reecrite)');

-- Une seule annonce d'archive, née exactement à l'instant commun — pas de
-- N « X a quitté » mensongers pour un geste admin unique.
select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L'
  ' and sender_id is null and content = ''La conversation a été archivée''',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'une seule annonce d''archive (politique 0106)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 2::bigint,
  'exactement deux lignes systeme : depart de Bob + archive (pas de N tombes annoncees)');

select testkit.eq(
  (select m.created_at::text from public.messages m
    where m.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and m.content = 'La conversation a été archivée'),
  (select cm.left_at::text from public.conversation_members cm
    where cm.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and cm.member_id = (select row_id from testkit.fx where key = 'arc_alice_m')),
  'l''annonce d''archive nait a l''instant commun (incluse par <=, sans bidouille)');

-- Rien n'a été vaporisé : fil, histoire et registre intacts.
select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'le fil archive existe toujours (pas de vaporisation)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'l''histoire d''avant est intacte');

reset role;

-- Alice relit tout : l'avant, les deux annonces système.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'l''archivee relit l''avant');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 2::bigint,
  'l''archivee relit depart de Bob + annonce d''archive');

reset role;

-- Carol (tombée par l'archive) relit comme Alice.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_carol';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 3::bigint,
  'la tombee par l''archive relit tout le fil fige');

reset role;

-- Bob (parti avant) relit l'avant + sa propre annonce, jamais l'archive.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_bob';
set local role authenticated;

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is not null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'le deja-parti relit l''avant');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'le deja-parti ne relit que sa propre annonce (archive post-depart cachee)');

reset role;

commit;

-- ===========================================================================
-- T4 : personne n'écrit plus, pas même l'admin ; idempotence ; négatifs.
-- ===========================================================================
begin;

-- Alice (admin archivée) : envoi, édition et suppression refusés.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'arc-post-alice',
  (select row_id from testkit.fx where key = 'arc_conv'),
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_alice_m'),
  'Ecrit apres l''archive'),
  'l''admin archivee n''envoie plus dans le fil fige');

select testkit.expect_denied(format(
  'update public.messages set content = %L where conversation_id = %L and sender_id = %L',
  'Reecrit apres l''archive',
  (select row_id from testkit.fx where key = 'arc_conv'),
  (select row_id from testkit.fx where key = 'arc_alice_m')),
  'l''admin archivee ne reedite plus son propre message');

select testkit.eq(testkit.affected(format(
  'delete from public.messages where conversation_id = %L and sender_id = %L',
  (select row_id from testkit.fx where key = 'arc_conv'),
  (select row_id from testkit.fx where key = 'arc_alice_m'))), 0::bigint,
  'l''admin archivee ne supprime plus meme son propre message');

reset role;

-- Bob (déjà-parti) : toujours muet après l'archive des autres.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_bob';
set local role authenticated;

select testkit.expect_denied(format(
  'insert into public.messages (id, conversation_id, household_id, sender_id, content) values (%L, %L, %L, %L, %L)',
  'arc-post-bob',
  (select row_id from testkit.fx where key = 'arc_conv'),
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_bob_m'),
  'Ecrit du deja-parti apres l''archive'),
  'le deja-parti n''envoie toujours pas apres l''archive');

reset role;

-- Ré-archive idempotente : 0 tombé, aucune seconde annonce.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.eq(
  (select (r)->>'archived_members'
     from (select public.archive_conversation((select row_id from testkit.fx where key = 'arc_conv')) as r) s),
  '0',
  'la re-archive ne tombe personne (idempotente)');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L and sender_id is null',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 2::bigint,
  'la re-archive n''annonce rien de plus');

reset role;

-- Carol (membre non-admin du fil) : l'archive lui est refusée.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_carol';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.archive_conversation(%L)',
  (select row_id from testkit.fx where key = 'arc_conv')),
  'un membre non-admin n''archive rien');

reset role;

-- Dave (du foyer, hors du fil, non-admin) : refusé aussi.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_dave';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.archive_conversation(%L)',
  (select row_id from testkit.fx where key = 'arc_conv')),
  'un membre hors du fil n''archive rien');

reset role;

-- Mia (hors foyer) : refusée aussi.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_mia';
set local role authenticated;

select testkit.expect_denied(format(
  'select public.archive_conversation(%L)',
  (select row_id from testkit.fx where key = 'arc_conv')),
  'un exterieur n''archive rien');

reset role;

commit;

-- ===========================================================================
-- T5 : destruction retirée (aucune vaporisation possible) + périodes fermées.
-- ===========================================================================
begin;

-- L'admin tente le vieux geste : 0 ligne touchée, histoire intacte.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_alice';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversations where id = %L',
  (select row_id from testkit.fx where key = 'arc_conv'))), 0::bigint,
  'l''admin ne supprime plus le fil (destruction retiree, 0 ligne)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversations where household_id = %L and id = %L',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 1::bigint,
  'le fil survit a la tentative de destruction');

select testkit.eq(testkit.count(format(
  'select 1 from public.messages where household_id = %L and conversation_id = %L',
  (select household_id from testkit.fx where key = 'arc_home'),
  (select row_id from testkit.fx where key = 'arc_conv'))), 3::bigint,
  'l''histoire survit a la tentative de destruction (1 avant + 2 systeme)');

select testkit.eq(testkit.count(format(
  'select 1 from public.conversation_members where conversation_id = %L',
  (select row_id from testkit.fx where key = 'arc_conv'))), 3::bigint,
  'le registre survit a la tentative de destruction');

-- Un membre non-admin non plus, évidemment.
select testkit.as_user(user_id, row_id) from testkit.fx where key = 'arc_carol';
set local role authenticated;

select testkit.eq(testkit.affected(format(
  'delete from public.conversations where id = %L',
  (select row_id from testkit.fx where key = 'arc_conv'))), 0::bigint,
  'un membre ne supprime pas le fil non plus');

reset role;

-- Périodes 0105 : les trois fenêtres sont fermées (lecture propriétaire —
-- aucun client ne lit cette table en direct, prouvé en 0044).
select testkit.eq(
  (select count(*)::bigint from public.conversation_membership_periods pp
    where pp.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and pp.left_at is not null),
  3::bigint,
  'les trois fenetres de presence sont fermees');

select testkit.eq(
  (select count(*)::bigint from public.conversation_membership_periods pp
    where pp.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and pp.left_at is null),
  0::bigint,
  'aucune fenetre ouverte apres l''archive-pour-tous');

-- Chaque fermeture porte la pierre de son membre (pas de double-fermeture,
-- pas de fenêtre orpheline).
select testkit.eq(
  (select count(*)::bigint from public.conversation_membership_periods pp
    join public.conversation_members cm
      on cm.conversation_id = pp.conversation_id
     and cm.member_id = pp.member_id
    where pp.conversation_id = (select row_id from testkit.fx where key = 'arc_conv')
      and pp.left_at is distinct from cm.left_at),
  0::bigint,
  'chaque fenetre fermee porte exactement la pierre de son membre');

commit;

-- ===========================================================================
-- T6 : nettoyage puis validation.
-- ===========================================================================
begin;

delete from testkit.fx where key in (
  'arc_alice', 'arc_bob', 'arc_carol', 'arc_dave', 'arc_mia',
  'arc_ealice', 'arc_ebob', 'arc_ecarol',
  'arc_home',
  'arc_alice_m', 'arc_bob_m', 'arc_carol_m',
  'arc_conv', 'arc_bob_stone'
);
delete from public.households where name in ('Foyer Messages Archive');

commit;
