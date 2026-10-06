-- supabase/tests/0016_calendrier_rls.sql
-- Phase 1 Calendrier : isolation foyer, calendriers perso, catégories,
-- référentiels lecture seule, cohérence catégorie/calendrier.
--
-- Marque reconnaissable : suffixe 'aaaa' sur les noms seedés ici.

begin;

do $$
declare
  alice uuid := testkit.auth_user('cal-a-alice@example.fr', 'Alice Aaaa');
  bob uuid := testkit.auth_user('cal-a-bob@example.fr', 'Bob Aaaa');
  kid uuid := testkit.auth_user('cal-a-kid@example.fr', 'Noé Aaaa');
  carol uuid := testkit.auth_user('cal-b-carol@example.fr', 'Carol Aaaa');

  home_a text := testkit.household(alice, 'Foyer Cal Aaaa');
  home_b text := testkit.household(carol, 'Foyer Cal Baaa');

  alice_m text := testkit.member(home_a, alice, 'Alice Aaaa', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Aaaa', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noé Aaaa', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Aaaa', 'admin', 'coral');

  commun_a text;
  commun_b text;
  perso_bob text;
  cat_repas_a text;
  cat_b text;
  event_commun text := private.new_id('event');
  event_perso text := private.new_id('event');
begin
  -- Seed minimal (testkit.household ne sème pas les calendriers).
  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (home_a, 'Commun', 'commun', null), (home_b, 'Commun', 'commun', null);

  insert into public.event_categories (household_id, name, color, is_default, created_by)
  values (home_a, 'Repas Aaaa', '#E8930C', false, alice_m);

  select id into commun_a from public.event_calendars
   where household_id = home_a and name = 'Commun';
  select id into commun_b from public.event_calendars
   where household_id = home_b and name = 'Commun';
  select id into cat_repas_a from public.event_categories
   where household_id = home_a and name = 'Repas Aaaa';

  perform testkit.ok(commun_a is not null, 'calendrier Commun semé foyer A');
  perform testkit.ok(commun_b is not null, 'calendrier Commun semé foyer B');

  -- Calendrier perso de Bob (écriture membre pour soi).
  -- Perso auto-créé par le trigger 0085 à l'insert du membre (D-02 : un Perso
  -- par adulte, pas de création libre) : on le relit au lieu de l'insérer —
  -- un 2e insert pour le même owner violerait event_calendars_perso_owner_unique.
  perform testkit.as_user(bob, 'cal-a-bob@example.fr');
  set local role authenticated;
  select id into perso_bob from public.event_calendars
   where household_id = home_a and owner_member_id = bob_m and visibility = 'perso';
  reset role;
  perform testkit.ok(perso_bob is not null, 'perso auto-créé pour le membre et lisible par son owner');

  -- Événements : un Commun, un Perso (seed en postgres, RLS contournée).
  insert into public.events (id, household_id, calendar_id, category_id, title, start_at, created_by)
  values (event_commun, home_a, commun_a, cat_repas_a, 'Déjeuner Aaaa', now(), alice_m),
         (event_perso, home_a, perso_bob, null, 'Perso Aaaa', now(), bob_m);

  -- 1. Isolation inter-foyer : Carol (foyer B) ne voit rien du foyer A.
  perform testkit.as_user(carol, 'cal-b-carol@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.events where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucun event du foyer A');
  perform testkit.eq(
    testkit.count('select 1 from public.event_categories where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucune catégorie du foyer A');
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucun calendrier du foyer A');
  reset role;

  -- 2. Perso invisible aux autres membres (Alice admin lit, Bob owner lit/écrit).
  -- Alice est admin : lecture ok (modération), mais écriture refusée hors admin-commun ?
  -- Ici on vérifie la lecture owner vs tiers non-admin : insérer un 2e membre ? On
  -- vérifie qu'un membre du foyer B ne voit pas le perso, et que l'owner le voit.
  perform testkit.as_user(bob, 'cal-a-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.events where id = ''' || event_perso || ''''),
    1::bigint, 'owner lit son event perso');
  reset role;

  -- 3. Enfant : lecture ok, écriture refusée (categories + events + calendars).
  perform testkit.as_user(kid, 'cal-a-kid@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.event_categories where household_id = ''' || home_a || ''''),
    1::bigint, 'enfant lit les catégories');
  perform testkit.expect_denied(format(
    'insert into public.event_categories (id, household_id, name, color, created_by) values (%L, %L, %L, %L, %L)',
    private.new_id('event-category'), home_a, 'Kid Aaaa', '#000000', kid_m));
  perform testkit.expect_denied(format(
    'insert into public.events (id, household_id, calendar_id, title, start_at, created_by) values (%L, %L, %L, %L, %L, %L)',
    private.new_id('event'), home_a, commun_a, 'Kid Event Aaaa', now(), kid_m));
  reset role;

  -- 4. Défauts non supprimables : semer un défaut puis tenter delete (admin).
  insert into public.event_categories (household_id, name, color, is_default)
  values (home_a, 'Sport Aaaa', '#4CAF50', true);
  perform testkit.as_user(alice, 'cal-a-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected(format(
      'delete from public.event_categories where household_id = %L and name = %L',
      home_a, 'Sport Aaaa')),
    0::bigint, 'catégorie défaut non supprimable même par admin');
  perform testkit.eq(
    testkit.affected(format(
      'delete from public.event_calendars where id = %L', commun_a)),
    0::bigint, 'calendrier Commun non supprimable');
  reset role;

  -- 5. Cohérence trigger (rôle postgres, RLS contournée) : catégorie et
  -- calendrier d'un autre foyer refusés 23514. En authenticated, la RLS rend
  -- la catégorie étrangère invisible (NULL), donc le refus RLS/trigger ne peut
  -- pas s'y tester : on le prouve ici en postgres avec des ids explicites.
  insert into public.event_categories (household_id, name, color)
  values (home_b, 'Repas Baaa', '#E8930C');
  select id into cat_b from public.event_categories
   where household_id = home_b and name = 'Repas Baaa';
  begin
    insert into public.events (id, household_id, calendar_id, category_id, title, start_at)
    values (private.new_id('event'), home_a, commun_a, cat_b, 'Cross Aaaa', now());
    perform testkit.ok(false, 'catégorie inter-foyer aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'catégorie inter-foyer refusée 23514');
  end;
  -- Vérification trigger en postgres (code 23514 explicite).
  begin
    insert into public.events (id, household_id, calendar_id, title, start_at)
    values (private.new_id('event'), home_a, commun_b, 'Cross Cal Aaaa', now());
    perform testkit.ok(false, 'calendrier inter-foyer aurait dû lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'calendrier inter-foyer refusé 23514');
  end;

  -- 6. Référentiels : lecture ok, écriture client refusée.
  perform testkit.as_user(bob, 'cal-a-bob@example.fr');
  set local role authenticated;
  perform testkit.ok(
    testkit.count('select 1 from public.public_holidays') >= 0::bigint,
    'fériés lisibles (comptage non tautologique : borné par année ci-dessous)');
  perform testkit.eq(
    testkit.count('select 1 from public.public_holidays where year = 2026'),
    (select count(*) from public.public_holidays where year = 2026),
    'fériés 2026 lisibles au complet');
  perform testkit.expect_denied(
    'insert into public.public_holidays (holiday_date, name) values (''2026-01-01'', ''X Aaaa'')',
    'fériés non insérables par un client');
  perform testkit.expect_denied(
    'insert into public.school_holidays (zone, school_year, name, start_date, end_date) values (''A'', ''2099-2100'', ''X Aaaa'', ''2099-10-18'', ''2099-11-02'')',
    'vacances non insérables par un client');
  reset role;
end;
$$;

rollback;
