-- supabase/tests/0017_calendrier_phase.sql
-- Phase 01 calendrier : preuves du nouveau monde (0084/0085/0086/0087).
--
-- Ce que prouve chaque section (decisions D-01, D-02, D-05, D-08, D-14) :
-- - D-01 (Option B, gate 01-01) : l'admin ne LIT ni ne MODIFIE le Perso
--   d'autrui (select/update a zero ligne), ne peut pas y ECRIRE
--   (with check refuse), et ne peut pas non plus le SUPPRIMER en pratique :
--   PostgreSQL conditionne UPDATE/DELETE au passage des politiques SELECT
--   (filtre observe au plan : USING du delete + SELECT giclés en AND), donc
--   une ligne invisible n'est ni modifiable ni supprimable. Les politiques
--   `events_delete_admin` / `event_calendars_delete` autorisent encore
--   l'admin sur le papier (filet de moderation voulu par 0084), mais ce
--   filet est INERTE pour les lignes invisibles : prouve par des 0 affectes,
--   pas par des +1. Rendre la moderation reelle demanderait un RPC
--   SECURITY DEFINER dedie (hors plan, a trancher en phase suivante).
-- - D-02/D-05 : le trigger 0085 cree un Perso par adulte (admin comme
--   membre), jamais pour un enfant ; prouve sur l'existant ET en dynamique
--   (insertion d'un adulte puis d'un enfant).
-- - D-08 : renommer ou supprimer une categorie utilisee leve 23514
--   (garde 0086), prouve par le code d'erreur explicite, pas par un refus
--   quelconque ; une categorie libre reste modifiable.
-- - D-14 : les deux jobs sont installes sur la base courante avec leurs
--   planifications GMT reelles (janvier `0 3 1 1 *`, septembre `0 2 1 9 *`,
--   soit 04h00 Europe/Paris), sans secret en clair, et le dispatch lit
--   Vault a l'execution avec la cle en en-tete `apikey`.
--
-- Marque reconnaissable : suffixe 'Zzzz' (0016 utilise 'Aaaa' et reste
-- l'histoire fige du monde admin-read : ne pas la reecrire, forward-only).
-- Chaque assertion du role postgres est bornee par foyer (la RLS y est
-- contournee) ; en `authenticated`, la RLS borne deja au foyer de l'acteur.
-- Les controles positifs (l'owner voit son event) precedent les zeros :
-- un zero sans temoin serait une absence, pas une preuve d'invisibilite.

begin;

do $$
declare
  alice uuid := testkit.auth_user('cal-c-alice@example.fr', 'Alice Zzzz');
  bob uuid := testkit.auth_user('cal-c-bob@example.fr', 'Bob Zzzz');
  kid uuid := testkit.auth_user('cal-c-kid@example.fr', 'Noe Zzzz');
  carol uuid := testkit.auth_user('cal-d-carol@example.fr', 'Carol Zzzz');

  home_a text := testkit.household(alice, 'Foyer Cal Zzzz');
  home_b text := testkit.household(carol, 'Foyer Cal Wzzz');

  alice_m text := testkit.member(home_a, alice, 'Alice Zzzz', 'admin', 'accent');
  bob_m text := testkit.member(home_a, bob, 'Bob Zzzz', 'membre', 'ink');
  kid_m text := testkit.member(home_a, kid, 'Noe Zzzz', 'enfant', 'amber');
  carol_m text := testkit.member(home_b, carol, 'Carol Zzzz', 'admin', 'coral');

  eve_m text;
  leo_m text;
  commun_a text;
  perso_alice text;
  perso_bob text;
  perso_carol text;
  cat_used_a text;
  cat_free_a text;
  event_commun_a text := private.new_id('event');
  event_perso_bob text := private.new_id('event');
begin
  -- Seed minimal (testkit.household ne seme pas les calendriers).
  insert into public.event_calendars (household_id, name, visibility, owner_member_id)
  values (home_a, 'Commun', 'commun', null), (home_b, 'Commun', 'commun', null);
  select id into commun_a from public.event_calendars
   where household_id = home_a and name = 'Commun';
  perform testkit.ok(commun_a is not null, 'calendrier Commun seme foyer A');

  -- 1. D-02/D-05 : Perso auto par adulte, aucun pour l'enfant (trigger 0085,
  -- declenche sur les insertions testkit.member ci-dessus).
  select id into perso_bob from public.event_calendars
   where household_id = home_a and visibility = 'perso' and owner_member_id = bob_m;
  select id into perso_alice from public.event_calendars
   where household_id = home_a and visibility = 'perso' and owner_member_id = alice_m;
  select id into perso_carol from public.event_calendars
   where household_id = home_b and visibility = 'perso' and owner_member_id = carol_m;
  perform testkit.ok(perso_bob is not null, 'le membre adulte possede un Perso auto');
  perform testkit.ok(perso_alice is not null, 'l''admin possede un Perso auto');
  perform testkit.ok(perso_carol is not null, 'l''admin du second foyer possede un Perso auto');
  perform testkit.eq(
    (select count(*) from public.event_calendars
      where household_id = home_a and visibility = 'perso' and owner_member_id = kid_m),
    0::bigint, 'l''enfant ne recoit aucun Perso auto');

  -- 1b. D-02/D-05 en dynamique : inserer un adulte cree son Perso, inserer
  -- un enfant n'en cree pas.
  eve_m := testkit.member(home_a, testkit.auth_user('cal-c-eve@example.fr', 'Eve Zzzz'), 'Eve Zzzz', 'membre', 'coral');
  perform testkit.eq(
    (select count(*) from public.event_calendars
      where household_id = home_a and visibility = 'perso' and owner_member_id = eve_m),
    1::bigint, 'inserer un membre adulte cree son Perso');
  leo_m := testkit.member(home_a, testkit.auth_user('cal-c-leo@example.fr', 'Leo Zzzz'), 'Leo Zzzz', 'enfant', 'violet');
  perform testkit.eq(
    (select count(*) from public.event_calendars
      where household_id = home_a and visibility = 'perso' and owner_member_id = leo_m),
    0::bigint, 'inserer un enfant ne cree aucun Perso');

  -- Categories et evenements semes en postgres (RLS contournee).
  insert into public.event_categories (household_id, name, color, created_by)
  values (home_a, 'Repas Zzzz', '#E8930C', alice_m),
         (home_a, 'Libre Zzzz', '#3E7CB1', alice_m);
  select id into cat_used_a from public.event_categories
   where household_id = home_a and name = 'Repas Zzzz';
  select id into cat_free_a from public.event_categories
   where household_id = home_a and name = 'Libre Zzzz';
  insert into public.events (id, household_id, calendar_id, category_id, title, start_at, created_by)
  values (event_commun_a, home_a, commun_a, null, 'Dejeuner Zzzz', now(), alice_m),
         (event_perso_bob, home_a, perso_bob, cat_used_a, 'Secret Zzzz', now(), bob_m);

  -- 2. Temoin positif : l'owner lit son event Perso (l'event existe bien ;
  -- les zeros qui suivent prouvent une invisibilite, pas une absence).
  perform testkit.as_user(bob, 'cal-c-bob@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.events where id = ''' || event_perso_bob || ''''),
    1::bigint, 'l''owner lit son event perso');
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where id = ''' || perso_bob || ''''),
    1::bigint, 'l''owner lit son calendrier perso');
  reset role;

  -- 3. D-01 : l'admin ne lit ni ne modifie le Perso d'autrui.
  perform testkit.as_user(alice, 'cal-c-alice@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where id = ''' || perso_bob || ''''),
    0::bigint, 'l''admin ne lit pas le calendrier perso d''un membre');
  perform testkit.eq(
    testkit.count('select 1 from public.events where id = ''' || event_perso_bob || ''''),
    0::bigint, 'l''admin ne lit pas les events du perso d''autrui');
  perform testkit.eq(
    testkit.affected('update public.event_calendars set name = ''Renomme Zzzz'' where id = ''' || perso_bob || ''''),
    0::bigint, 'l''admin ne renomme pas le perso d''autrui');
  perform testkit.eq(
    testkit.affected('update public.events set title = ''Modifie Zzzz'' where id = ''' || event_perso_bob || ''''),
    0::bigint, 'l''admin ne modifie pas un event du perso d''autrui');
  perform testkit.expect_denied(format(
    'insert into public.events (id, household_id, calendar_id, title, start_at, created_by) values (%L, %L, %L, %L, %L, %L)',
    private.new_id('event'), home_a, perso_bob, 'Intrus Zzzz', now(), alice_m),
    'l''admin ne cree pas dans le perso d''autrui');
  -- Filet de moderation 0084 INERTE en pratique (voir entete) : PostgreSQL
  -- exige le passage des politiques SELECT pour tout UPDATE/DELETE, donc
  -- une ligne invisible ne se supprime pas. Prouve par des zeros, pas des +1.
  perform testkit.eq(
    testkit.affected('delete from public.events where id = ''' || event_perso_bob || ''''),
    0::bigint, 'l''admin ne supprime pas un event du perso d''autrui (invisible au select)');
  perform testkit.eq(
    testkit.affected('delete from public.event_calendars where id = ''' || perso_bob || ''''),
    0::bigint, 'l''admin ne supprime pas le calendrier perso d''autrui (invisible au select)');
  reset role;

  -- 4. Second foyer : Carol ne voit rien du foyer A (ni Commun ni Perso).
  perform testkit.as_user(carol, 'cal-d-carol@example.fr');
  set local role authenticated;
  perform testkit.eq(
    testkit.count('select 1 from public.event_calendars where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucun calendrier du foyer A');
  perform testkit.eq(
    testkit.count('select 1 from public.events where household_id = ''' || home_a || ''''),
    0::bigint, 'foyer B ne lit aucun event du foyer A');
  reset role;

  -- 5. D-08 : renommer ou supprimer une categorie utilisee leve 23514.
  -- Le code est affirme explicitement : un refus quelconque ne suffirait pas.
  perform testkit.as_user(alice, 'cal-c-alice@example.fr');
  set local role authenticated;
  begin
    update public.event_categories set name = 'Renomme Zzzz' where id = cat_used_a;
    perform testkit.ok(false, 'renommer une categorie utilisee aurait du lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'renommer une categorie utilisee refuse 23514');
  end;
  begin
    delete from public.event_categories where id = cat_used_a;
    perform testkit.ok(false, 'supprimer une categorie utilisee aurait du lever 23514');
  exception when check_violation then
    perform testkit.ok(true, 'supprimer une categorie utilisee refuse 23514');
  end;
  -- Une categorie libre reste modifiable par un adulte (garde bornee a l'usage).
  perform testkit.eq(
    testkit.affected('update public.event_categories set name = ''Libre Bis Zzzz'' where id = ''' || cat_free_a || ''''),
    1::bigint, 'une categorie libre reste renommable');
  perform testkit.eq(
    testkit.affected('delete from public.event_categories where id = ''' || cat_free_a || ''''),
    1::bigint, 'une categorie libre reste supprimable');
  reset role;
end;
$$;

-- 6. D-14 : catalogue cron (motifs 0004 section 4 : base courante, aucun
-- secret, commandes nues) + dispatch Vault avec cle en `apikey`.
-- Planifications reelles de 0087, decalees GMT pour viser 04h00 Paris :
-- janvier `0 3 1 1 *` (CET), septembre `0 2 1 9 *` (CEST).
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent sur cette instance : assertions calendrier ignorees.';
    return;
  end if;

  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-calendrier-refresh-jan' and schedule = '0 3 1 1 *'),
    'le job de janvier est installe pour 04h00 Paris (03h00 GMT)');
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-calendrier-refresh-sept' and schedule = '0 2 1 9 *'),
    'le job de septembre est installe pour 04h00 Paris (02h00 GMT)');

  perform testkit.ok(
    not exists (select 1 from cron.job
      where jobname like 'eo-calendrier-refresh-%'
        and database is distinct from current_database()),
    'chaque job calendrier vise explicitement la base courante');

  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where jobname like 'eo-calendrier-refresh-%'
         and command ~* '(secret|token_hash|password|passwd|api[_-]?key|sb_secret|service_role|vapid)'),
    'aucun secret ni valeur sensible dans les commandes calendrier');

  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where jobname like 'eo-calendrier-refresh-%'
         and command !~ '^select private\.[a-z_]+\(\)$'),
    'les jobs calendrier appellent uniquement des fonctions privees sans parametre');

  perform testkit.ok(
    pg_get_functiondef('private.dispatch_calendrier_refresh()'::regprocedure) like '%vault.decrypted_secrets%',
    'le dispatch calendrier lit ses secrets dans Vault au moment de l''execution');
  perform testkit.ok(
    pg_get_functiondef('private.dispatch_calendrier_refresh()'::regprocedure) like '%to_regproc(%net.http_post%',
    'le dispatch calendrier teste net.http_post comme une fonction, pas comme une relation');
  perform testkit.ok(
    pg_get_functiondef('private.dispatch_calendrier_refresh()'::regprocedure) like '%''apikey'', v_key%',
    'le dispatch calendrier envoie la cle en en-tete apikey, jamais en Bearer');
end;
$$;

rollback;
