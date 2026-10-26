-- supabase/tests/0051_enfant_perimeter.sql
-- Phase 14 perimetre enfants (D-01…D-04, plan 14-01) : fermeture serveur des
-- 5 modules au role `enfant` — ardoises (+members/guests), expenses
-- (+participants), gift_lists/items/shares/ideas/invites, loyalty_cards,
-- provider_types/providers (+attachments), pets/records (+attachments).
--
-- Methode : cette suite a d'abord tourne SANS la migration 0113 (rouge
-- prouve : l'enfant lisait chaque table, rejoignait l'ardoise par code,
-- reservait, et l'enfant proprietaire gerait ses invitations). Apres 0113,
-- elle est entierement verte : lectures refusees, ecritures verifiees,
-- actions Edge (via leurs RPC service_role, identite resolue cote serveur
-- depuis la session, jamais un claim client) refusees a l'enfant, parcours
-- anonymes a code intacts, chemins heureux membre/admin byte-identiques,
-- lignes enfant preexistantes masquees jamais effacees.
--
-- Forme 0048/0050 : acteurs par role (Alice admin A, Bob membre A,
-- Noe enfant A, Carol admin B), assertions bornees par objet via testkit.fx
-- (jamais de total nu), `affected = 0` pour les UPDATE/DELETE filtres par la
-- RLS, `expect_denied` pour les INSERT dont le WITH CHECK echoue,
-- SQLSTATE + message pour les refus RPC (42501 gestion/ecriture,
-- P0002 oracles `code invalide`/`ardoise introuvable`), rollback final.
--
-- Cles `e14-*` : testkit.fx survit a tout le run test-db.sh (teardown final
-- seulement) — aucun libelle partage avec les autres suites.

begin;

do $$
declare
  alice uuid := testkit.auth_user('e14-alice@example.fr', 'Alice Quatorze');
  bob uuid := testkit.auth_user('e14-bob@example.fr', 'Bob Quatorze');
  kid uuid := testkit.auth_user('e14-kid@example.fr', 'Noe Quatorze');
  carol uuid := testkit.auth_user('e14-carol@example.fr', 'Carol Quatorze');

  home_a text := testkit.household(alice, 'Foyer Quatorze A');
  home_b text := testkit.household(carol, 'Foyer Quatorze B');

  alice_m text := testkit.member(home_a, alice, 'Alice Quatorze', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Quatorze', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Quatorze', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Quatorze', 'admin', 'violet');
begin
  -- Ardoises : `a` echangeable (code actif), `a2` gestion, `a3` creee par
  -- l'enfant (branche createur), `b` autre foyer. L'enfant est inscrit a
  -- `a` et `a3` (lignes preexistantes, masquees jamais effacees).
  insert into public.ardoises (id, household_id, name, invite_hash, max_uses, created_by)
  values ('e14-ardoise-a', home_a, 'Ardoise A', repeat('a', 64), 10, alice_m),
         ('e14-ardoise-a2', home_a, 'Ardoise A2', null, 10, alice_m),
         ('e14-ardoise-a3', home_a, 'Ardoise A3', null, 10, kid_m),
         ('e14-ardoise-b', home_b, 'Ardoise B', repeat('b', 64), 10, carol_m);
  insert into public.ardoise_members (ardoise_id, member_id)
  values ('e14-ardoise-a', alice_m),
         ('e14-ardoise-a', bob_m),
         ('e14-ardoise-a', kid_m),
         ('e14-ardoise-a2', alice_m),
         ('e14-ardoise-a2', bob_m),
         ('e14-ardoise-a3', kid_m),
         ('e14-ardoise-b', carol_m);
  insert into public.ardoise_guests (id, ardoise_id, display_name, ticket_hash)
  values ('e14-guest-a', 'e14-ardoise-a', 'Invite A', repeat('c', 64));

  -- Depenses soldees (20 + 10 = 30) + part enfant preexistante.
  insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date)
  values ('e14-exp-a', home_a, 'e14-ardoise-a', 'Courses', 30.00, alice_m, current_date),
         ('e14-exp-b', home_b, 'e14-ardoise-b', 'Sortie', 15.00, carol_m, current_date);
  insert into public.expense_participants (id, expense_id, participant_type, member_id, share_amount)
  values ('e14-ep-a1', 'e14-exp-a', 'membre', alice_m, 20.00),
         ('e14-ep-a2', 'e14-exp-a', 'membre', kid_m, 10.00),
         ('e14-ep-b1', 'e14-exp-b', 'membre', carol_m, 15.00);

  -- Cadeaux : `gl-a` foyer (Bob proprietaire), `gl-a2` foyer (Alice),
  -- `gl-kid` privee possedee par l'enfant (branche proprietaire), `gl-b`.
  -- Part `reservation` enfant preexistante sur `gl-a`.
  insert into public.gift_lists (id, household_id, owner_member_id, name, visibility)
  values ('e14-gl-a', home_a, bob_m, 'Liste Bob', 'foyer'),
         ('e14-gl-a2', home_a, alice_m, 'Liste Alice', 'foyer'),
         ('e14-gl-kid', home_a, kid_m, 'Liste Noe', 'privee'),
         ('e14-gl-b', home_b, carol_m, 'Liste Carol', 'foyer');
  insert into public.gift_items (id, list_id, household_id, name, price)
  values ('e14-gi-a', 'e14-gl-a', home_a, 'Train', 25.00),
         ('e14-gi-free', 'e14-gl-a', home_a, 'Livre', 10.00),
         ('e14-gi-kid', 'e14-gl-kid', home_a, 'Ballon', 5.00),
         ('e14-gi-b', 'e14-gl-b', home_b, 'Velo', 50.00);
  insert into public.gift_list_shares (id, list_id, shared_with_member_id, permission)
  values ('e14-sh-bob', 'e14-gl-a', bob_m, 'reservation'),
         ('e14-sh-kid', 'e14-gl-a', kid_m, 'reservation');
  insert into public.gift_list_invites (id, list_id, token_hash, created_by, max_uses)
  values ('e14-inv-a', 'e14-gl-a', repeat('d', 64), alice, 10);

  -- Contacts (restent visibles a l'enfant, D-07) + idee offerte a Bob
  -- (surprise : invisible pour Bob, visible pour Alice).
  insert into public.contact_lists (id, household_id, name, owner_member_id, is_default)
  values ('e14-cl-fam', home_a, 'E14 Famille', null, false);
  insert into public.contacts (id, list_id, household_id, name, linked_member_id)
  values ('e14-contact-tante', 'e14-cl-fam', home_a, 'Tante Zoe', null),
         ('e14-contact-bob', 'e14-cl-fam', home_a, 'Bob Quatorze', bob_m);
  insert into public.gift_ideas (id, household_id, name, created_by, giftee_contact_id)
  values ('e14-idea-a', home_a, 'Puzzle', bob_m, 'e14-contact-bob');

  -- Fidelite / prestataires / animaux (+ pieces jointes, carte enfant).
  insert into public.loyalty_cards (id, household_id, member_id, name, code_type, code_value)
  values ('e14-card-a', home_a, bob_m, 'Boulangerie', 'qr', '111'),
         ('e14-card-kid', home_a, kid_m, 'Jouets', 'barcode', '222'),
         ('e14-card-b', home_b, carol_m, 'Librairie', 'qr', '333');
  insert into public.provider_types (id, household_id, name)
  values ('e14-type-a', home_a, 'Plombier'),
         ('e14-type-b', home_b, 'Jardinier');
  insert into public.providers (id, household_id, provider_type_id, name)
  values ('e14-prov-a', home_a, 'e14-type-a', 'Dupont'),
         ('e14-prov-b', home_b, 'e14-type-b', 'Martin');
  insert into public.provider_attachments (id, provider_id, household_id, file_url, file_name, mime_type, size_bytes)
  values ('e14-pa-a', 'e14-prov-a', home_a, 'https://stockage/e14-devis.pdf', 'devis.pdf', 'application/pdf', 1000);
  insert into public.pets (id, household_id, name, species)
  values ('e14-pet-a', home_a, 'Medor', 'chien'),
         ('e14-pet-b', home_b, 'Felix', 'chat');
  insert into public.pet_records (id, pet_id, household_id, type, name)
  values ('e14-pr-a', 'e14-pet-a', home_a, 'vaccin', 'Rage'),
         ('e14-pr-b', 'e14-pet-b', home_b, 'vaccin', 'Typhus');
  insert into public.pet_attachments (id, pet_id, household_id, file_url, file_name, mime_type, size_bytes)
  values ('e14-pja-a', 'e14-pet-a', home_a, 'https://stockage/e14-ordonnance.pdf', 'ordonnance.pdf', 'application/pdf', 2000);

  -- Hors perimetre, intact pour l'enfant : anniversaires, widgets.
  insert into public.birthdays (id, household_id, name, birth_date)
  values ('e14-bd-a', home_a, 'Mamie', '1950-05-05');
  insert into public.dashboard_widgets (id, member_id, household_id, widget_type)
  values ('e14-w-kid', kid_m, home_a, 'taches'),
         ('e14-w-alice', alice_m, home_a, 'calendrier');

  insert into testkit.fx (key, user_id, household_id, row_id) values
    ('e14-alice', alice, home_a, alice_m),
    ('e14-bob', bob, home_a, bob_m),
    ('e14-enfant', kid, home_a, kid_m),
    ('e14-carol', carol, home_b, carol_m);
end;
$$;

-- ===========================================================================
-- Alice, administratrice du foyer A — chemins heureux intacts
-- ===========================================================================
select testkit.as_user(user_id, 'e14-alice@example.fr') from testkit.fx where key = 'e14-alice';
set local role authenticated;

-- --- Lecture : son foyer oui (idee offerte a Bob visible pour Alice),
-- --- privee d'autrui et autre foyer non ------------------------------------
select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-a'''), 1::bigint,
  'Alice lit l''animal de son foyer');
select testkit.eq(testkit.count('select 1 from public.pet_records where id = ''e14-pr-a'''), 1::bigint,
  'Alice lit le suivi de son foyer');
select testkit.eq(testkit.count('select 1 from public.pet_attachments where id = ''e14-pja-a'''), 1::bigint,
  'Alice lit la piece jointe animale de son foyer');
select testkit.eq(testkit.count('select 1 from public.provider_types where id = ''e14-type-a'''), 1::bigint,
  'Alice lit le type de son foyer');
select testkit.eq(testkit.count('select 1 from public.providers where id = ''e14-prov-a'''), 1::bigint,
  'Alice lit le prestataire de son foyer');
select testkit.eq(testkit.count('select 1 from public.provider_attachments where id = ''e14-pa-a'''), 1::bigint,
  'Alice lit la piece jointe prestataire de son foyer');
select testkit.eq(testkit.count('select 1 from public.loyalty_cards where id = ''e14-card-a'''), 1::bigint,
  'Alice lit la carte de son foyer');
select testkit.eq(testkit.count('select 1 from public.ardoises where id = ''e14-ardoise-a'''), 1::bigint,
  'Alice lit l''ardoise de son foyer');
select testkit.eq(testkit.count('select 1 from public.ardoise_members where ardoise_id = ''e14-ardoise-a'''), 3::bigint,
  'Alice lit les inscrits de l''ardoise (admin + membre + enfant preexistant)');
select testkit.eq(testkit.count('select 1 from public.ardoise_guests where id = ''e14-guest-a'''), 1::bigint,
  'Alice lit l''invite de l''ardoise');
select testkit.eq(testkit.count('select 1 from public.expenses where id = ''e14-exp-a'''), 1::bigint,
  'Alice lit la depense de son foyer');
select testkit.eq(testkit.count('select 1 from public.expense_participants where expense_id = ''e14-exp-a'''), 2::bigint,
  'Alice lit les parts de la depense (dont la part enfant preexistante)');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-a'''), 1::bigint,
  'Alice lit la liste foyer de son foyer');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-kid'''), 0::bigint,
  'Alice ne lit pas la privee d''autrui (D-08 foyer intact)');
select testkit.eq(testkit.count('select 1 from public.gift_items where list_id = ''e14-gl-a'''), 2::bigint,
  'Alice lit les articles de la liste foyer');
select testkit.eq(testkit.count('select 1 from public.gift_list_shares where list_id = ''e14-gl-a'''), 2::bigint,
  'Alice lit les parts de la liste foyer');
select testkit.eq(testkit.count('select 1 from public.gift_ideas where id = ''e14-idea-a'''), 1::bigint,
  'Alice lit l''idee offerte a Bob (surprise : pas pour lui, oui pour elle)');
select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-b'''), 0::bigint,
  'Alice ne voit pas l''animal du foyer B');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-b'''), 0::bigint,
  'Alice ne voit pas la liste du foyer B');

-- --- Ecriture admin : chemins heureux ----------------------------------------
select testkit.eq(testkit.affected(
  'update public.pets set name = ''Medor Quatorze'' where id = ''e14-pet-a'''), 1::bigint,
  'une administratrice modifie un animal de son foyer');
select testkit.eq(testkit.affected(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'e14-pr-alice', 'e14-pet-a', (select household_id from testkit.fx where key = 'e14-alice'), 'info', 'Puce')), 1::bigint,
  'une administratrice ajoute un suivi dans son foyer');
select testkit.eq(testkit.affected(format(
  'insert into public.loyalty_cards (id, household_id, name, code_type, code_value) values (%L, %L, %L, %L, %L)',
  'e14-card-alice', (select household_id from testkit.fx where key = 'e14-alice'), 'Pressing', 'qr', '999')), 1::bigint,
  'une administratrice cree une carte dans son foyer');
select testkit.eq(testkit.affected(
  'delete from public.loyalty_cards where id = ''e14-card-alice'''), 1::bigint,
  'une administratrice supprime une carte de son foyer');
select testkit.eq(testkit.affected(
  'update public.gift_lists set name = ''Liste Alice bis'' where id = ''e14-gl-a2'''), 1::bigint,
  'une administratrice proprietaire modifie sa liste');

reset role;

-- ===========================================================================
-- Bob, membre du foyer A — lit et ecrit, ne supprime pas
-- ===========================================================================
select testkit.as_user(user_id, 'e14-bob@example.fr') from testkit.fx where key = 'e14-bob';
set local role authenticated;

-- Ancre : Bob voit son foyer, donc les refus qui suivent sont significatifs.
select testkit.eq(testkit.count('select 1 from public.providers where id = ''e14-prov-a'''), 1::bigint,
  'Bob est bien membre lisant du foyer A au moment de ces verifications');

-- --- Lecture : tout son foyer sauf l'idee dont il est le destinataire -------
select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-a'''), 1::bigint,
  'Bob lit l''animal de son foyer');
select testkit.eq(testkit.count('select 1 from public.loyalty_cards where id = ''e14-card-a'''), 1::bigint,
  'Bob lit la carte de son foyer');
select testkit.eq(testkit.count('select 1 from public.ardoises where id = ''e14-ardoise-a'''), 1::bigint,
  'Bob lit l''ardoise (inscrit)');
select testkit.eq(testkit.count('select 1 from public.expenses where id = ''e14-exp-a'''), 1::bigint,
  'Bob lit la depense (inscrit a l''ardoise)');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-a'''), 1::bigint,
  'Bob lit sa liste foyer');
select testkit.eq(testkit.count('select 1 from public.gift_ideas where id = ''e14-idea-a'''), 0::bigint,
  'Bob ne lit pas l''idee dont il est le destinataire (surprise intacte)');

-- --- Ecriture membre : chemins heureux ----------------------------------------
select testkit.eq(testkit.affected(format(
  'insert into public.pet_records (id, pet_id, household_id, type, name) values (%L, %L, %L, %L, %L)',
  'e14-pr-bob', 'e14-pet-a', (select household_id from testkit.fx where key = 'e14-bob'), 'info', 'Carnet')), 1::bigint,
  'un membre ajoute un suivi dans son foyer');
select testkit.eq(testkit.affected(
  'update public.providers set name = ''Dupont Quatorze'' where id = ''e14-prov-a'''), 1::bigint,
  'un membre modifie un prestataire de son foyer');
select testkit.eq(testkit.affected(format(
  'insert into public.gift_ideas (id, household_id, name, created_by) values (%L, %L, %L, %L)',
  'e14-idea-bob', (select household_id from testkit.fx where key = 'e14-bob'), 'Fleurs',
  (select row_id from testkit.fx where key = 'e14-bob'))), 1::bigint,
  'un membre cree une idee dans son foyer');
select testkit.eq(testkit.affected(
  'update public.gift_items set comment = ''Emballe'' where id = ''e14-gi-a'''), 1::bigint,
  'un membre proprietaire modifie un article de sa liste');
select testkit.eq(testkit.affected(
  'delete from public.providers where id = ''e14-prov-a'''), 0::bigint,
  'la suppression reste reservee aux admins, meme son contenu');

-- --- RPC ecritures : membre ecrit, issue byte-identique -----------------------
do $$
declare
  home text;
  ard text;
  alice_m text;
  bob_m text;
  v_id text;
begin
  select household_id into home from testkit.fx where key = 'e14-bob';
  select row_id into alice_m from testkit.fx where key = 'e14-alice';
  select row_id into bob_m from testkit.fx where key = 'e14-bob';
  ard := 'e14-ardoise-a';

  v_id := (public.create_expense(home, ard, 'Fromage', 30.00, alice_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 20),
      jsonb_build_object('participant_type', 'membre', 'member_id', bob_m, 'share_amount', 10)))::jsonb ->> 'id');
  perform testkit.ok(v_id is not null, 'un membre cree une depense par RPC');

  perform public.update_expense('e14-exp-a', 'Courses bis', 30.00, alice_m, null, current_date, 'egal',
    jsonb_build_array(
      jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 20),
      jsonb_build_object('participant_type', 'membre', 'member_id', (select row_id from testkit.fx where key = 'e14-enfant'), 'share_amount', 10)));
  perform testkit.ok(true, 'un membre modifie une depense par RPC (part enfant conservee)');
end;
$$;

reset role;

-- Preuve 0145 : l'uid du fixture enfant ne resout AUCUN membre du foyer —
-- c'est la cause racine de tous les refus ci-dessous (assertion en role postgres,
-- avant toute session de test ; sans elle, le reste de la section serait un
-- refus de cause faible, un uid inconnu, et non une isolation par role).
select testkit.eq(testkit.count('select 1 from public.household_members where household_id = ''' ||
  (select household_id::text from testkit.fx where key = 'e14-enfant') || ''' and user_id = ''' ||
  (select user_id::text from testkit.fx where key = 'e14-enfant') || ''''), 0::bigint,
  'l''uid enfant du fixture ne resout aucun membre du foyer (0145)');

-- ===========================================================================
-- Noe, role `enfant` — rien des 5 modules, ni en lecture ni en ecriture
-- (D-01/D-02 : apres 0113, chaque comptage vaut 0 et chaque ecriture echoue)
-- ===========================================================================
select testkit.as_user(user_id, 'e14-kid@example.fr') from testkit.fx where key = 'e14-enfant';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-a'''), 0::bigint,
  'un enfant ne lit plus les animaux de son foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.pet_records where id = ''e14-pr-a'''), 0::bigint,
  'un enfant ne lit plus les suivis de son foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.pet_attachments where id = ''e14-pja-a'''), 0::bigint,
  'un enfant ne lit plus les pieces jointes animales (0113)');
select testkit.eq(testkit.count('select 1 from public.provider_types where id = ''e14-type-a'''), 0::bigint,
  'un enfant ne lit plus les types de son foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.providers where id = ''e14-prov-a'''), 0::bigint,
  'un enfant ne lit plus les prestataires de son foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.provider_attachments where id = ''e14-pa-a'''), 0::bigint,
  'un enfant ne lit plus les pieces jointes prestataires (0113)');
select testkit.eq(testkit.count('select 1 from public.loyalty_cards where id = ''e14-card-a'''), 0::bigint,
  'un enfant ne lit plus les cartes de son foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.loyalty_cards where id = ''e14-card-kid'''), 0::bigint,
  'un enfant ne lit plus meme la carte a son nom (0113)');
select testkit.eq(testkit.count('select 1 from public.ardoises where id = ''e14-ardoise-a'''), 0::bigint,
  'un enfant ne lit plus l''ardoise, meme inscrit (0113)');
select testkit.eq(testkit.count('select 1 from public.ardoise_members where ardoise_id = ''e14-ardoise-a'''), 0::bigint,
  'un enfant ne lit plus les inscrits de l''ardoise (0113)');
select testkit.eq(testkit.count('select 1 from public.ardoise_guests where id = ''e14-guest-a'''), 0::bigint,
  'un enfant ne lit plus les invites de l''ardoise (0113)');
select testkit.eq(testkit.count('select 1 from public.expenses where id = ''e14-exp-a'''), 0::bigint,
  'un enfant ne lit plus les depenses, meme inscrit (0113)');
select testkit.eq(testkit.count('select 1 from public.expense_participants where expense_id = ''e14-exp-a'''), 0::bigint,
  'un enfant ne lit plus les parts, meme la sienne (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-a'''), 0::bigint,
  'un enfant ne lit plus les listes foyer (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-kid'''), 0::bigint,
  'un enfant ne lit plus meme sa propre liste privee (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_items where list_id = ''e14-gl-a'''), 0::bigint,
  'un enfant ne lit plus les articles (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_list_shares where list_id = ''e14-gl-a'''), 0::bigint,
  'un enfant ne lit plus les parts, meme la sienne (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_ideas where id = ''e14-idea-a'''), 0::bigint,
  'un enfant ne lit plus les idees (0113)');
select testkit.eq(testkit.count('select 1 from public.gift_items_for_list where list_id = ''e14-gl-a'''), 0::bigint,
  'un enfant ne lit rien via la vue masquee non plus (0113)');

-- --- Ecriture directe : refusee -------------------------------------------------
select testkit.expect_denied(format(
  'insert into public.pets (id, household_id, name, species) values (%L, %L, %L, %L)',
  'e14-pet-kid', (select household_id from testkit.fx where key = 'e14-enfant'), 'Toutou', 'chien'),
  'un enfant ne declare pas d''animal');
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, name) values (%L, %L, %L)',
  'e14-prov-kid', (select household_id from testkit.fx where key = 'e14-enfant'), 'Jardinier'),
  'un enfant ne cree pas de prestataire');
select testkit.expect_denied(format(
  'insert into public.loyalty_cards (id, household_id, name, code_type, code_value) values (%L, %L, %L, %L, %L)',
  'e14-card-kidx', (select household_id from testkit.fx where key = 'e14-enfant'), 'Jouets', 'qr', '444'),
  'un enfant ne cree pas de carte');
select testkit.expect_denied(format(
  'insert into public.gift_ideas (id, household_id, name) values (%L, %L, %L)',
  'e14-idea-kid', (select household_id from testkit.fx where key = 'e14-enfant'), 'Bonbons'),
  'un enfant ne cree pas d''idee');
select testkit.expect_denied(format(
  'insert into public.gift_lists (id, household_id, owner_member_id, name) values (%L, %L, %L, %L)',
  'e14-gl-kidx', (select household_id from testkit.fx where key = 'e14-enfant'),
  (select row_id from testkit.fx where key = 'e14-enfant'), 'Sienne'),
  'un enfant ne cree pas de liste');
select testkit.expect_denied(format(
  'insert into public.expenses (id, household_id, ardoise_id, title, amount, paid_by, expense_date) values (%L, %L, %L, %L, 10, %L, current_date)',
  'e14-exp-kid', (select household_id from testkit.fx where key = 'e14-enfant'), 'e14-ardoise-a', 'Gouter',
  (select row_id from testkit.fx where key = 'e14-enfant')),
  'un enfant ne cree pas de depense');
select testkit.eq(testkit.affected(
  'update public.pets set name = ''Pirate'' where id = ''e14-pet-a'''), 0::bigint,
  'un enfant ne modifie pas les animaux du foyer');
select testkit.eq(testkit.affected(
  'update public.gift_items set comment = ''Pirate'' where id = ''e14-gi-a'''), 0::bigint,
  'un enfant ne modifie pas les articles');
select testkit.eq(testkit.affected(
  'update public.expenses set title = ''Pirate'' where id = ''e14-exp-a'''), 0::bigint,
  'un enfant ne modifie pas les depenses');
select testkit.eq(testkit.affected(
  'delete from public.pets where id = ''e14-pet-a'''), 0::bigint,
  'un enfant ne supprime pas les animaux du foyer');
select testkit.eq(testkit.affected(
  'delete from public.gift_lists where id = ''e14-gl-kid'''), 0::bigint,
  'un enfant ne supprime pas meme sa propre liste');

-- --- RPC ecritures : refusees (0037 intact) --------------------------------------
do $$
declare
  home text;
  alice_m text;
begin
  select household_id into home from testkit.fx where key = 'e14-enfant';
  select row_id into alice_m from testkit.fx where key = 'e14-alice';

  begin
    perform public.create_expense(home, 'e14-ardoise-a', 'Gouter', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un enfant ne cree pas de depense par RPC');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501' and sqlerrm like '%appartenez%',
      'le refus RPC dit l''appartenance : ' || sqlerrm);
  end;

  begin
    perform public.update_expense('e14-exp-a', 'Gouter detourne', 10.00, alice_m, null, current_date, 'egal',
      jsonb_build_array(
        jsonb_build_object('participant_type', 'membre', 'member_id', alice_m, 'share_amount', 10)));
    perform testkit.ok(false, 'un enfant ne modifie pas de depense par RPC');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501' and sqlerrm like '%appartenez%',
      'le refus RPC dit l''appartenance : ' || sqlerrm);
  end;
end;
$$;

-- --- Escalade : auto-promotion refusee, lecture toujours close --------------------
select testkit.eq(testkit.affected(format(
  'update public.household_members set role = %L where id = %L', 'admin', (select row_id from testkit.fx where key = 'e14-enfant'))), 0::bigint,
  'un enfant ne peut pas s''attribuer le role admin');
select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-a'''), 0::bigint,
  'apres tentative d''escalade, un enfant ne lit toujours rien (0113)');

reset role;

-- ===========================================================================
-- Carol, administratrice du foyer B — la fuite ne joue pas dans l'autre sens
-- ===========================================================================
select testkit.as_user(user_id, 'e14-carol@example.fr') from testkit.fx where key = 'e14-carol';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-b'''), 1::bigint,
  'Carol lit l''animal de son foyer');
select testkit.eq(testkit.count('select 1 from public.pets where id = ''e14-pet-a'''), 0::bigint,
  'Carol ne voit pas l''animal du foyer A');
select testkit.eq(testkit.count('select 1 from public.providers where id = ''e14-prov-a'''), 0::bigint,
  'Carol ne voit pas le prestataire du foyer A');
select testkit.eq(testkit.count('select 1 from public.gift_lists where id = ''e14-gl-a'''), 0::bigint,
  'Carol ne voit pas la liste du foyer A');
select testkit.eq(testkit.count('select 1 from public.expenses where id = ''e14-exp-a'''), 0::bigint,
  'Carol ne voit pas la depense du foyer A (non inscrite)');
select testkit.eq(testkit.count('select 1 from public.loyalty_cards where id = ''e14-card-a'''), 0::bigint,
  'Carol ne voit pas la carte du foyer A');
select testkit.expect_denied(format(
  'insert into public.providers (id, household_id, name) values (%L, %L, %L)',
  'e14-prov-carol', (select household_id from testkit.fx where key = 'e14-alice'), 'Intrus'),
  'Carol ne cree pas un prestataire dans le foyer A');

reset role;

-- ===========================================================================
-- Contexte serveur : matrice RPC par role + parcours anonymes + survie
-- des lignes preexistantes. Les RPC service_role resolvent l'identite
-- depuis p_actor_id (session verifiee par l'Edge, jamais un claim client).
-- ===========================================================================

-- --- Lignes preexistantes : masquees, jamais effacees (D-04) --------------------
select testkit.eq(testkit.count(
  'select 1 from public.ardoise_members where ardoise_id = ''e14-ardoise-a'''), 3::bigint,
  'l''inscription enfant preexistante survit, invisible pour lui (D-04)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_lists where id = ''e14-gl-kid'''), 1::bigint,
  'la liste privee de l''enfant survit, invisible pour lui (D-04)');
select testkit.eq(testkit.count(
  'select 1 from public.gift_list_shares where id = ''e14-sh-kid'''), 1::bigint,
  'la part enfant preexistante survit, invisible pour lui (D-04)');
select testkit.eq(testkit.count(format(
  'select 1 from public.expense_participants where expense_id = ''e14-exp-a'' and member_id = %L',
  (select row_id from testkit.fx where key = 'e14-enfant'))), 1::bigint,
  'la part de depense enfant survit (recreee par l''update membre), invisible pour lui (D-04)');
select testkit.eq(testkit.count(
  'select 1 from public.loyalty_cards where id = ''e14-card-kid'''), 1::bigint,
  'la carte a son nom survit, invisible pour lui (D-04)');

-- --- Cadeaux : gestion ecrivain, echange oracle, reserve attribuee ------------
-- Retour au contexte serveur (motif 0029/0033 §3) : l'Edge appelle en
-- service_role sans identite JWT — les claims posees par testkit.as_user
-- persistent sinon jusqu'a la fin de la transaction et le garde verrait un
-- uid la ou la voie serveur exige NULL.
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;
reset role;

do $$
declare
  alice uuid; bob uuid; kid uuid;
  v_out jsonb;
begin
  select user_id into alice from testkit.fx where key = 'e14-alice';
  select user_id into bob from testkit.fx where key = 'e14-bob';
  select user_id into kid from testkit.fx where key = 'e14-enfant';

  -- Creation / resume / revocation : admin oui, enfant proprietaire non.
  -- (Le resume d'une liste sans code rend NULL par construction : on cree
  -- d'abord, comme l'Edge — create, summary, revoke.)
  v_out := public.create_gift_list_invite(alice, 'e14-gl-a2', repeat('e', 64), null, 10);
  perform testkit.ok(v_out ->> 'list_id' = 'e14-gl-a2', 'une admin regenere un code');
  v_out := public.gift_list_invite_summary(alice, 'e14-gl-a2');
  perform testkit.ok(v_out ->> 'list_id' = 'e14-gl-a2', 'une admin lit le resume du code');
  begin
    perform public.gift_list_invite_summary(bob, 'e14-gl-a2');
    perform testkit.ok(false, 'un non gestionnaire ne lit pas le resume');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'le resume refuse les non gestionnaires : ' || SQLSTATE);
  end;
  begin
    perform public.gift_list_invite_summary(kid, 'e14-gl-kid');
    perform testkit.ok(false, 'un enfant proprietaire ne lit plus le resume (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'le resume refuse l''enfant proprietaire : ' || SQLSTATE);
  end;
  v_out := public.revoke_gift_list_invite(alice, 'e14-gl-a2');
  perform testkit.ok((v_out ->> 'revoked')::integer >= 1, 'une admin revoque les codes');
  begin
    perform public.create_gift_list_invite(kid, 'e14-gl-kid', repeat('f', 64), null, 10);
    perform testkit.ok(false, 'un enfant proprietaire ne regenere plus de code (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'la creation refuse l''enfant proprietaire : ' || SQLSTATE);
  end;

  -- Echange : membre avec part rejoue sans consommer (intact), enfant
  -- membre refuse sous oracle `code invalide` (0113).
  v_out := public.redeem_gift_list_invite(repeat('d', 64), bob, null);
  perform testkit.ok((v_out ->> 'already_shared')::boolean is true, 'un membre rejoue son echange sans consommer');
  begin
    perform public.redeem_gift_list_invite(repeat('d', 64), kid, null);
    perform testkit.ok(false, 'un enfant membre n''echange plus le code (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = 'P0002' and sqlerrm like '%code invalide%',
      'l''echange enfant rend l''oracle, rien de plus : ' || sqlerrm);
  end;

  -- Reserve attribuee : membre oui + idempotence (intact), enfant non (0113).
  -- Contexte serveur (claims NULL) : le garde n'attribue la colonne
  -- reservee serveur qu'a la voie sans identite JWT (motif 0089/0094).
  v_out := public.member_reserve_gift_item(bob, 'e14-gi-a');
  perform testkit.ok((v_out ->> 'already_reserved')::boolean is false, 'un membre reserve sur sa part');
  -- Rejouer sa tenue la LIBERE (0096, G-06-23 — la simple idempotence 0094
  -- n'est plus le contrat effectif), puis on retient pour la suite.
  v_out := public.member_reserve_gift_item(bob, 'e14-gi-a');
  perform testkit.ok((v_out ->> 'released')::boolean is true, 'rejouer sa tenue la libere (0096)');
  v_out := public.member_reserve_gift_item(bob, 'e14-gi-a');
  perform testkit.ok((v_out ->> 'already_reserved')::boolean is false, 'l''article libere se retient');
  begin
    perform public.member_reserve_gift_item(kid, 'e14-gi-free');
    perform testkit.ok(false, 'un enfant ne reserve plus, meme avec part (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501' and sqlerrm like '%réservation non autorisée%',
      'la reserve enfant est refusee sans donnee : ' || sqlerrm);
  end;
end;
$$;

-- --- Ardoises : gestion ecrivain, resume membre, soldes inscrits, echange ----
do $$
declare
  alice uuid; bob uuid; kid uuid;
  v_out jsonb;
begin
  select user_id into alice from testkit.fx where key = 'e14-alice';
  select user_id into bob from testkit.fx where key = 'e14-bob';
  select user_id into kid from testkit.fx where key = 'e14-enfant';

  -- Creation d'ardoise : admin oui (intact), enfant non (ecrivain, intact).
  v_out := public.create_ardoise(alice, (select household_id from testkit.fx where key = 'e14-alice'), 'E14 Test', null, null, null, null);
  perform testkit.ok(v_out ->> 'name' = 'E14 Test', 'une admin cree une ardoise');
  begin
    perform public.create_ardoise(kid, (select household_id from testkit.fx where key = 'e14-enfant'), 'Ardoise Noe', null, null, null, null);
    perform testkit.ok(false, 'un enfant ne cree pas d''ardoise');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501' and sqlerrm like '%rôle insuffisant%',
      'la creation d''ardoise dit le role : ' || sqlerrm);
  end;

  -- Invitations : admin oui, membre non gestionnaire non (intact), enfant
  -- createur non (0113 ajoute l'exigence ecrivain).
  v_out := public.create_ardoise_invite(alice, 'e14-ardoise-a2', repeat('1', 64), null, 10);
  perform testkit.ok(v_out ->> 'ardoise_id' = 'e14-ardoise-a2', 'une admin regenere un code d''ardoise');
  v_out := public.revoke_ardoise_invite(alice, 'e14-ardoise-a2');
  perform testkit.ok((v_out ->> 'revoked')::boolean is true, 'une admin revoque le code d''ardoise');
  begin
    perform public.create_ardoise_invite(bob, 'e14-ardoise-a2', repeat('2', 64), null, 10);
    perform testkit.ok(false, 'un membre non gestionnaire ne regenere pas de code');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'la gestion d''ardoise refuse les non gestionnaires : ' || SQLSTATE);
  end;
  begin
    perform public.create_ardoise_invite(kid, 'e14-ardoise-a3', repeat('3', 64), null, 10);
    perform testkit.ok(false, 'un enfant createur ne regenere plus de code (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'la gestion d''ardoise refuse l''enfant createur : ' || SQLSTATE);
  end;

  -- Resume : membre oui (intact), enfant non (0113, meme oracle que l'exterieur).
  v_out := public.ardoise_invite_summary(bob, 'e14-ardoise-a');
  perform testkit.ok(v_out ->> 'ardoise_id' = 'e14-ardoise-a', 'un membre lit le resume');
  begin
    perform public.ardoise_invite_summary(kid, 'e14-ardoise-a');
    perform testkit.ok(false, 'un enfant ne lit plus le resume (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = 'P0002' and sqlerrm like '%ardoise introuvable%',
      'le resume enfant rend l''oracle, rien de plus : ' || sqlerrm);
  end;

  -- Soldes : membre inscrit oui (intact), enfant inscrit non (0113).
  v_out := public.ardoise_settlement(bob, 'e14-ardoise-a');
  perform testkit.ok(v_out is not null, 'un membre inscrit lit les soldes');
  begin
    perform public.ardoise_settlement(kid, 'e14-ardoise-a');
    perform testkit.ok(false, 'un enfant inscrit ne lit plus les soldes (0113)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501', 'les soldes refusent l''enfant inscrit : ' || SQLSTATE);
  end;

  -- Echange : membre inscrit rejoue (intact). Depuis 0145, l'uid enfant ne
  -- resout plus aucun membre : la branche « enfant membre » de 0113 est
  -- inatteignable, l'echange chute dans la branche invitee externe et rend
  -- son oracle `pseudonyme invalide` — sans inscription ni part a zero.
  v_out := public.redeem_ardoise_invite(repeat('a', 64), bob, null);
  perform testkit.ok((v_out ->> 'already_member')::boolean is true, 'un membre rejoue son inscription');
  begin
    perform public.redeem_ardoise_invite(repeat('a', 64), kid, null);
    perform testkit.ok(false, 'un enfant ne rejoint plus par code (0113, via uid sans membre 0145)');
  exception when others then
    perform testkit.ok(SQLSTATE = '22023' and sqlerrm like '%pseudonyme invalid%',
      'l''echange enfant chute dans la branche invitee sans pseudonyme : ' || sqlerrm);
  end;
  -- Le fixture a semé 3 inscriptions (alice, bob, enfant) et 1 invite sur
  -- `a` : un total inchangé prouve que l'échange refusé n'a rien ajouté.
  perform testkit.eq(testkit.count('select 1 from public.ardoise_members where ardoise_id = ''e14-ardoise-a'''), 3::bigint,
    'l''echange refuse n''ajoute aucune inscription (les 3 semées restent)');
  perform testkit.eq(testkit.count('select 1 from public.ardoise_guests where ardoise_id = ''e14-ardoise-a'''), 1::bigint,
    'l''echange refuse n''ajoute aucun invite (le seul reste celui semé)');
end;
$$;

-- --- Soldes foyer : ecrivain oui (intact), enfant non (0115) --------------------
do $$
declare
  bob uuid; kid uuid; home text;
  v_out jsonb;
begin
  select user_id into bob from testkit.fx where key = 'e14-bob';
  select user_id into kid from testkit.fx where key = 'e14-enfant';
  select household_id into home from testkit.fx where key = 'e14-bob';

  v_out := public.expense_settlement(bob, home);
  perform testkit.ok(v_out ->> 'household_id' = home, 'un membre lit les soldes du foyer');
  begin
    perform public.expense_settlement(kid, home);
    perform testkit.ok(false, 'un enfant ne lit plus les soldes du foyer (0115)');
  exception when others then
    perform testkit.ok(SQLSTATE = '42501' and sqlerrm like '%appartenez%',
      'les soldes foyer disent l''appartenance : ' || sqlerrm);
  end;
end;
$$;

-- --- Parcours anonymes a code : byte-identiques, sans identite -------------------
do $$
declare
  v_view jsonb;
  v_res jsonb;
  v_ticket text;
  v_verified jsonb;
begin
  -- Vue invitee cadeaux : liste + 2 articles, sans auteur (D-07 intact).
  v_view := public.guest_view_gift_list(repeat('d', 64));
  perform testkit.ok(v_view ->> 'list_id' = 'e14-gl-a', 'la vue invitee rend la liste');
  perform testkit.ok(jsonb_array_length(v_view -> 'items') = 2, 'la vue invitee rend les 2 articles');

  -- Reserve invitee : nom declare, article libre, sans compte.
  v_res := public.guest_reserve_gift_item(repeat('d', 64), 'e14-gi-free', 'Visiteur Anonyme');
  perform testkit.ok(v_res ->> 'item_id' = 'e14-gi-free', 'la reserve invitee tient l''article libre');

  -- Echange invite ardoise : ticket rendu une fois, verifiable, sans compte.
  v_res := public.redeem_ardoise_invite(repeat('a', 64), null, 'Gustave Exterieur');
  v_ticket := v_res ->> 'guest_ticket';
  perform testkit.ok(v_ticket is not null, 'l''echange invite rend un ticket');
  v_verified := public.verify_ardoise_ticket(encode(extensions.digest(v_ticket, 'sha256'), 'hex'));
  perform testkit.ok(v_verified ->> 'ardoise_id' = 'e14-ardoise-a', 'le ticket invite se verifie');
end;
$$;

-- ===========================================================================
-- Tache 3 : audit inter-modules — rien des 5 modules ne fuit par un autre
-- chemin (D-07). L'enfant garde contacts, anniversaires et widgets.
-- ===========================================================================
-- Lecture positive : alice (adulte) voit toujours les espaces hors
-- perimetre 5 modules — contacts, anniversaires, widgets.
select testkit.as_user(user_id, 'e14-alice@example.fr') from testkit.fx where key = 'e14-alice';
set local role authenticated;

select testkit.eq(testkit.count('select 1 from public.contacts where id = ''e14-contact-tante'''), 1::bigint,
  'un adulte lit les contacts (hors perimetre, intact)');
select testkit.eq(testkit.count('select 1 from public.contact_lists where id = ''e14-cl-fam'''), 1::bigint,
  'un adulte lit la liste famille (hors perimetre, intacte)');
select testkit.eq(testkit.count('select 1 from public.birthdays where id = ''e14-bd-a'''), 1::bigint,
  'un adulte lit les anniversaires (hors perimetre, intacts)');
select testkit.eq(testkit.count('select 1 from public.dashboard_widgets where id = ''e14-w-alice'''), 1::bigint,
  'un adulte lit son propre widget (hors perimetre, intact)');

-- Depuis 0145, l'uid enfant ne resout plus aucun membre : ces lectures
-- passent toutes par l'appartenance au foyer (contacts/anniversaires) ou
-- par current_member_id (widgets) et rendent donc 0 — l'enfant sans
-- compte ne lit plus rien, meme ce qui etait « son propre » widget.
select testkit.as_user(user_id, 'e14-kid@example.fr') from testkit.fx where key = 'e14-enfant';

select testkit.eq(testkit.count('select 1 from public.contacts where id = ''e14-contact-tante'''), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus les contacts');
select testkit.eq(testkit.count('select 1 from public.contact_lists where id = ''e14-cl-fam'''), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus la liste famille');
select testkit.eq(testkit.count('select 1 from public.birthdays where id = ''e14-bd-a'''), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus les anniversaires');
select testkit.eq(testkit.count('select 1 from public.dashboard_widgets where id = ''e14-w-kid'''), 0::bigint,
  'un uid sans membre resolu (enfant gere 0145) ne lit plus son propre widget');
-- Ecriture widget : can_write_household faux pour un uid sans membre (0007).
-- Un enfant gere n'a de toute facon pas de session ; ces attentes negatives
-- prouvent qu'un uid orphelin ne peut pas creer ni regler un widget.
select testkit.expect_denied(format(
  'insert into public.dashboard_widgets (id, member_id, household_id, widget_type) values (%L, %L, %L, %L)',
  'e14-w-kid-2', (select row_id from testkit.fx where key = 'e14-enfant'),
  (select household_id from testkit.fx where key = 'e14-enfant'), 'meteo'),
  'un uid sans membre resolu ne cree pas de widget');
select testkit.eq(testkit.affected(
  'update public.dashboard_widgets set position_x = 2 where id = ''e14-w-kid'''), 0::bigint,
  'un uid sans membre resolu ne regle plus le widget seme pour lui');
select testkit.eq(testkit.count('select 1 from public.dashboard_widgets where id = ''e14-w-alice'''), 0::bigint,
  'un uid sans membre resolu ne lit pas le widget d''autrui');

reset role;

rollback;
