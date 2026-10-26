-- supabase/tests/0157_voyages_d06.sql
-- 0157 : D-06 sur les voyages. Un enfant géré n'est inscriptible qu'avec
-- 'voyages' dans sa fiche (42501) ; l'adulte passe sans garde ; l'ardoise
-- liée reste aux adultes (0119 inchangé). `update_managed_child_profile`
-- accepte 'voyages' (périmètre élargi).
--
-- Bornes (AGENTS.md §2.7D) : comptages bornés au voyage/foyer ; `postgres`
-- pour les RPC service_role (motif 0120) ; `authenticated` + testkit.as_user
-- pour les RPC client. Fichier autonome, `rollback` final.

begin;

-- ---------------------------------------------------------------
-- Semis (postgres) : foyer, membres adultes, voyage.
-- ---------------------------------------------------------------
do $$
declare
  adam uuid := testkit.auth_user('t157-adam@example.fr', 'Adam 157');
  kim uuid := testkit.auth_user('t157-kim@example.fr', 'Kim 157');
  eve uuid := testkit.auth_user('t157-eve@example.fr', 'Eve 157');
  home text := testkit.household(adam, 'Foyer 157');
  home_e text := testkit.household(eve, 'Foyer Voisin 157');
  adam_m text;
  kim_m text;
  eve_m text;
  res jsonb;
  trip_id text;
  ardoise_id text;
begin
  adam_m := testkit.member(home, adam, 'Adam 157', 'admin', 'accent');
  kim_m := testkit.member(home, kim, 'Kim 157', 'membre', 'ink');
  eve_m := testkit.member(home_e, eve, 'Eve 157', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('adam', adam), ('kim', kim), ('eve', eve);
  insert into testkit.fx (key, household_id) values
    ('home', home), ('home_e', home_e);
  insert into testkit.fx (key, row_id) values
    ('adam_m', adam_m), ('kim_m', kim_m), ('eve_m', eve_m);

  res := public.create_trip_atomic(
    adam, home, 'Voyage 157', 'Jura', date '2027-10-01', date '2027-10-07',
    null, array[adam_m], null);
  trip_id := res ->> 'trip_id';
  ardoise_id := res ->> 'ardoise_id';
  insert into testkit.fx (key, row_id) values
    ('trip', trip_id), ('ardoise', ardoise_id);
end;
$$;

-- ---------------------------------------------------------------
-- 1. Création de la fiche enfant (socle D-06 : sans 'voyages').
-- ---------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'adam'), 't157-adam@example.fr');
set local role authenticated;
do $$
declare
  res jsonb;
begin
  res := public.create_managed_child_profile(
    (select household_id from testkit.fx where key = 'home'),
    'Noé 157', 'coral', date '2016-05-01', null);
  insert into testkit.fx (key, row_id) values ('noe_m', res ->> 'id');
end;
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------
-- 2. Enfant géré SANS 'voyages' → 42501.
-- ---------------------------------------------------------------
do $$
declare
  v_state text;
  v_msg text;
begin
  begin
    perform public.trip_add_member(
      (select user_id from testkit.fx where key = 'adam'),
      (select row_id from testkit.fx where key = 'trip'),
      (select row_id from testkit.fx where key = 'noe_m'));
    v_state := 'AUCUNE_ERREUR';
    v_msg := 'ajout réussi sans ''voyages''';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '42501',
    'enfant sans voyages : 42501 attendu, obtenu ' || v_state || ' — ' || coalesce(v_msg, 'aucune'));

  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L',
    (select row_id from testkit.fx where key = 'trip'))), 1::bigint,
    'un seul participant (le refus n''a rien inscrit)');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Activation 'voyages' sur la fiche (périmètre élargi 0157).
-- ---------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'adam'), 't157-adam@example.fr');
set local role authenticated;
do $$
begin
  perform public.update_managed_child_profile(
    (select row_id from testkit.fx where key = 'noe_m'),
    null, null, null, null, false,
    array['taches','routines','anniversaires','menu','voyages']);
end;
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

do $$
begin
  perform testkit.eq(
    (select count(*) from public.household_members
      where id = (select row_id from testkit.fx where key = 'noe_m')
        and managed_modules = array['taches','routines','anniversaires','menu','voyages']::text[]),
    1::bigint,
    'la fiche porte ''voyages'' après activation');
end;
$$;

-- ---------------------------------------------------------------
-- 4. Enfant géré AVEC 'voyages' → succès, pas d'ardoise.
-- ---------------------------------------------------------------
do $$
declare
  res jsonb;
begin
  res := public.trip_add_member(
    (select user_id from testkit.fx where key = 'adam'),
    (select row_id from testkit.fx where key = 'trip'),
    (select row_id from testkit.fx where key = 'noe_m'));
  perform testkit.ok(not (res ->> 'already_member')::boolean, 'l''enfant est inscrit au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L',
    (select row_id from testkit.fx where key = 'trip'))), 2::bigint,
    'deux participants au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L and member_id = %L',
    (select row_id from testkit.fx where key = 'ardoise'),
    (select row_id from testkit.fx where key = 'noe_m'))), 0::bigint,
    'l''enfant voyageur n''entre jamais a l''ardoise (0119)');

  -- Idempotence.
  res := public.trip_add_member(
    (select user_id from testkit.fx where key = 'adam'),
    (select row_id from testkit.fx where key = 'trip'),
    (select row_id from testkit.fx where key = 'noe_m'));
  perform testkit.ok((res ->> 'already_member')::boolean, 're-ajout = already_member');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L',
    (select row_id from testkit.fx where key = 'trip'))), 2::bigint,
    'le rejeu idempotent ne duplique rien');
end;
$$;

-- ---------------------------------------------------------------
-- 5. Adulte : inchangé (passe sans garde).
-- ---------------------------------------------------------------
do $$
declare
  res jsonb;
begin
  res := public.trip_add_member(
    (select user_id from testkit.fx where key = 'adam'),
    (select row_id from testkit.fx where key = 'trip'),
    (select row_id from testkit.fx where key = 'kim_m'));
  perform testkit.ok(not (res ->> 'already_member')::boolean, 'l''adulte est inscrit');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L',
    (select row_id from testkit.fx where key = 'trip'))), 3::bigint,
    'trois participants au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L and member_id = %L',
    (select row_id from testkit.fx where key = 'ardoise'),
    (select row_id from testkit.fx where key = 'kim_m'))), 1::bigint,
    'l''adulte rejoint l''ardoise liee (0119 inchangé)');
end;
$$;

-- ---------------------------------------------------------------
-- 6. Périmètre : 'cadeaux' reste refusé (refus-par-défaut).
-- ---------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'adam'), 't157-adam@example.fr');
set local role authenticated;
do $$
declare
  v_state text;
  v_msg text;
begin
  begin
    perform public.update_managed_child_profile(
      (select row_id from testkit.fx where key = 'noe_m'),
      null, null, null, null, false, array['cadeaux']);
    v_state := 'AUCUNE_ERREUR';
    v_msg := 'cadeaux accepté';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'cadeaux hors périmètre : 22023 attendu, obtenu ' || v_state || ' — ' || coalesce(v_msg, 'aucune'));
end;
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

-- ---------------------------------------------------------------
-- 7. Autre foyer : refusé (oracle P0002, invariant).
-- ---------------------------------------------------------------
do $$
begin
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    (select user_id from testkit.fx where key = 'adam'),
    (select row_id from testkit.fx where key = 'trip'),
    (select row_id from testkit.fx where key = 'eve_m')),
    'un membre d''un autre foyer n''entre pas dans le voyage');
end;
$$;

-- ---------------------------------------------------------------
-- 8. `update_managed_child_profile` : adulte → 22023 (invariant).
-- ---------------------------------------------------------------
select testkit.as_user((select user_id from testkit.fx where key = 'adam'), 't157-adam@example.fr');
set local role authenticated;
do $$
declare
  v_state text;
  v_msg text;
begin
  begin
    perform public.update_managed_child_profile(
      (select row_id from testkit.fx where key = 'adam_m'),
      null, null, null, null, false, array['voyages']);
    v_state := 'AUCUNE_ERREUR';
    v_msg := 'fiche adulte acceptée';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'fiche adulte : 22023 attendu, obtenu ' || v_state || ' — ' || coalesce(v_msg, 'aucune'));
end;
$$;
reset role;
reset request.jwt.claim.sub;
reset request.jwt.claims;
reset request.jwt.claim.role;
reset request.jwt.claim.email;

rollback;
