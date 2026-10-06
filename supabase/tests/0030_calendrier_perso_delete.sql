-- supabase/tests/0030_calendrier_perso_delete.sql
-- 0090 : l'owner supprime son Perso, le Commun reste protégé, l'admin ne
-- supprime toujours pas le Perso d'autrui (invisible au SELECT, 0017).
--
-- Marque reconnaissable : suffixe 'Wwww'.
-- En `authenticated`, la RLS borne déjà au foyer de l'acteur ; chaque
-- assertion du rôle postgres est bornée par foyer (RLS contournée).
-- Les contrôles positifs (l'owner voit son Perso) précèdent les zéros :
-- un zéro sans témoin serait une absence, pas une preuve d'invisibilité.

begin;

do $$
declare
  alice uuid := testkit.auth_user('cal-e-alice@example.fr', 'Alice Wwww');
  bob uuid := testkit.auth_user('cal-e-bob@example.fr', 'Bob Wwww');

  home_a text := testkit.household(alice, 'Foyer Cal Wwww');

  alice_m text := testkit.member(home_a, alice, 'Alice Wwww', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Wwww', 'membre', 'ink');

  commun_a text;
  perso_alice text;
  perso_bob text;
  eve uuid;
  eve_m text;
  perso_eve text;
begin
  -- Seed minimal (testkit.household ne sème pas les calendriers).
  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (home_a, 'Commun', 'commun', null);
  select id into commun_a from public.event_calendars
   where household_id = home_a and name = 'Commun';
  perform testkit.ok(commun_a is not null, 'calendrier Commun semé');

  -- Persos auto-créés par le trigger 0085 pour les deux adultes.
  select id into perso_bob from public.event_calendars
   where household_id = home_a and visibility = 'perso' and owner_member_id = bob_m;
  select id into perso_alice from public.event_calendars
   where household_id = home_a and visibility = 'perso' and owner_member_id = alice_m;
  perform testkit.ok(perso_bob is not null, 'le membre possède un Perso auto');
  perform testkit.ok(perso_alice is not null, 'l''admin possède un Perso auto');

  -- Témoin positif : l'owner lit son Perso avant toute suppression.
  perform testkit.as_user(bob, 'cal-e-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where id = ''' || perso_bob || ''''),
    1::bigint, 'l''owner lit son calendrier perso');
  reset role;

  -- 1. L'owner membre supprime son Perso vide (0090) : 1 ligne affectée,
  -- puis le calendrier a disparu pour lui.
  eve := testkit.auth_user('cal-e-eve@example.fr', 'Eve Wwww');
  eve_m := testkit.member(home_a, eve, 'Eve Wwww', 'membre', 'coral');
  select id into perso_eve from public.event_calendars
   where household_id = home_a and visibility = 'perso' and owner_member_id = eve_m;
  perform testkit.ok(perso_eve is not null, 'la nouvelle adulte possède un Perso auto vide');
  perform testkit.as_user(eve, 'cal-e-eve@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected('delete from public.event_calendars where id = ''' || perso_eve || ''''),
    1::bigint, 'l''owner supprime son Perso vide');
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where id = ''' || perso_eve || ''''),
    0::bigint, 'le Perso supprimé ne se lit plus');
  reset role;

  -- 2. Le Commun reste non supprimable, même par l'admin.
  perform testkit.as_user(alice, 'cal-e-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.affected('delete from public.event_calendars where id = ''' || commun_a || ''''),
    0::bigint, 'le Commun ne se supprime pas');
  -- 3. L'admin ne supprime pas le Perso d'autrui (invisible au SELECT,
  -- filet de modération inerte, même régime que 0017).
  perform testkit.eq(
    testkit.affected('delete from public.event_calendars where id = ''' || perso_bob || ''''),
    0::bigint, 'l''admin ne supprime pas le Perso d''un membre');
  reset role;

  -- 4. Un membre ne supprime pas le Perso d'un autre membre (invisible).
  perform testkit.as_user(bob, 'cal-e-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where id = ''' || perso_alice || ''''),
    0::bigint, 'le Perso d''autrui est invisible au membre');
  perform testkit.eq(
    testkit.affected('delete from public.event_calendars where id = ''' || perso_alice || ''''),
    0::bigint, 'le membre ne supprime pas le Perso d''autrui');
  reset role;
end;
$$;

-- 5. Dispatch 0090 : le corps envoie la clé `year` du contrat Edge
-- (littéral positif, même style que les assertions 0017 sur `apikey`).
do $$
begin
  perform testkit.ok(
    pg_get_functiondef('private.dispatch_calendrier_refresh()'::regprocedure) like '%''year''%',
    'le dispatch calendrier envoie l''année sous la clé year du contrat Edge');
end;
$$;

rollback;
