-- supabase/tests/0135_calendrier_perso_admin_retire.sql
-- Calendrier : « perso » veut dire privé, y compris de l'administrateur (0135).
--
-- `0084` avait retiré l'admin de la lecture et de l'écriture des calendriers
-- perso, mais laissait deux autorisations de suppression en place, mortes en
-- pratique parce que la ligne est invisible : `events_delete_admin` et
-- `private.can_admin_event`, qui porte `event_reminders_delete`. `0135` les
-- ramène à « admin du Commun, propriétaire du perso ».
--
-- Ce que ce fichier prouve, et comment :
-- - le PRÉDICAT lui-même (`private.can_admin_event`), appelable en
--   `authenticated` : sur `0047` il rend `true` pour l'admin sur un événement
--   perso d'autrui, sur `0135` il rend `false`. C'est le rouge d'avant, et il
--   porte sur la décision réelle, pas sur le texte de la politique ;
-- - les SUPPRESSIONS restent à 0 pour l'admin (elles l'étaient déjà : une
--   ligne invisible ne se supprime pas). Ces zéros sont ici une garde de
--   non-régression, pas la preuve du changement ;
-- - le propriétaire supprime toujours son événement et son rappel, et l'admin
--   conserve la modération du Commun : sans ces témoins positifs, les zéros
--   ne distingueraient pas « refusé » de « absent ».

begin;

do $$
declare
  alice uuid := testkit.auth_user('cal-135-alice@example.fr', 'Alice Zzzz');
  bob uuid := testkit.auth_user('cal-135-bob@example.fr', 'Bob Zzzz');

  home_a text := testkit.household(alice, 'Foyer 0135 Zzzz');
  alice_m text := testkit.member(home_a, alice, 'Alice Zzzz', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Zzzz', 'membre', 'ink');

  commun_a text;
  perso_bob text;
  event_commun text := private.new_id('event');
  event_perso text := private.new_id('event');
  reminder_perso text := private.new_id('event-reminder');

  v_admin_perso boolean;
  v_admin_commun boolean;
  v_bob_perso boolean;
  v_bob_commun boolean;
begin
  -- `testkit.household` ne sème pas le calendrier Commun ; le Perso de Bob est
  -- créé par le trigger `0085` au moment de `testkit.member`.
  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (home_a, 'Commun', 'commun', null);
  select id into commun_a
    from public.event_calendars
   where household_id = home_a and name = 'Commun';
  select id into perso_bob
    from public.event_calendars
   where household_id = home_a
     and visibility = 'perso'
     and owner_member_id = bob_m;
  perform testkit.ok(perso_bob is not null, 'Bob possède son calendrier perso');

  insert into public.events (id, household_id, calendar_id, title, start_at, created_by)
  values (event_commun, home_a, commun_a, 'Réunion Zzzz', now(), alice_m),
         (event_perso, home_a, perso_bob, 'Secret Zzzz', now(), bob_m);
  insert into public.event_reminders (id, event_id, remind_at)
  values (reminder_perso, event_perso, now() + interval '1 hour');

  -- 1. Le prédicat, tel que l'admin l'obtient : `false` sur le perso d'autrui
  -- (c'était `true` sur 0047), `true` sur le Commun qu'il administre.
  perform testkit.as_user(alice, 'cal-135-alice@example.fr');
  set local role authenticated;
  select private.can_admin_event(event_perso) into v_admin_perso;
  select private.can_admin_event(event_commun) into v_admin_commun;
  reset role;
  perform testkit.eq(v_admin_perso, false,
    'l''admin n''obtient plus la suppression d''un événement perso d''autrui');
  perform testkit.eq(v_admin_commun, true,
    'l''admin garde la suppression d''un événement du Commun');

  -- 2. Le prédicat pour le membre : `true` sur son perso, `false` sur le Commun.
  perform testkit.as_user(bob, 'cal-135-bob@example.fr');
  set local role authenticated;
  select private.can_admin_event(event_perso) into v_bob_perso;
  select private.can_admin_event(event_commun) into v_bob_commun;
  reset role;
  perform testkit.eq(v_bob_perso, true,
    'le propriétaire obtient la suppression de son propre perso');
  perform testkit.eq(v_bob_commun, false,
    'un membre n''obtient pas la suppression dans le Commun');

  -- 3. Suppressions par l'admin : zéro sur le perso (rappel puis événement),
  -- un sur le Commun.
  perform testkit.as_user(alice, 'cal-135-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected('delete from public.event_reminders where id = ''' || reminder_perso || ''''),
    0::bigint, 'l''admin ne supprime pas le rappel d''un événement perso d''autrui');
  perform testkit.eq(
    testkit.affected('delete from public.events where id = ''' || event_perso || ''''),
    0::bigint, 'l''admin ne supprime pas l''événement perso d''autrui');
  perform testkit.eq(
    testkit.affected('delete from public.events where id = ''' || event_commun || ''''),
    1::bigint, 'l''admin supprime un événement du Commun');
  reset role;

  -- 4. Le propriétaire supprime les siens : la tentative de l'admin n'a rien
  -- emporté, et les deux lignes existent encore pour lui.
  perform testkit.as_user(bob, 'cal-135-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected('delete from public.event_reminders where id = ''' || reminder_perso || ''''),
    1::bigint, 'le propriétaire supprime le rappel de son événement perso');
  perform testkit.eq(
    testkit.affected('delete from public.events where id = ''' || event_perso || ''''),
    1::bigint, 'le propriétaire supprime son événement perso');
  reset role;
end;
$$;

rollback;
