-- supabase/tests/0120_trip_members_manage.sql
-- Rubrique Membres (0120) : les admins du foyer cochent/décochent les
-- participants — ajout idempotent (+ ardoise adultes seuls), retrait avec
-- miroir ardoise et garde du dernier participant.
--
-- Bornes (AGENTS.md §2.7D) : chaque comptage est borné au voyage via
-- testkit.fx. Rôle `postgres` pour les fixtures et les RPC service_role
-- (comme l'Edge, motif 0026) ; `authenticated` + testkit.as_user pour les
-- preuves client. Fichier autonome, `rollback` final (motif 0053).

begin;

do $$
declare
  adam uuid := testkit.auth_user('t20-adam@example.fr', 'Adam Gestion');
  bea uuid := testkit.auth_user('t20-bea@example.fr', 'Bea Voyage');
  kim uuid := testkit.auth_user('t20-kim@example.fr', 'Kim Enfant');
  eve uuid := testkit.auth_user('t20-eve@example.fr', 'Eve Voisine');
  home_d text := testkit.household(adam, 'Foyer Gestion D');
  home_e text := testkit.household(eve, 'Foyer Voisin E');
  adam_m text;
  bea_m text;
  kim_m text;
  eve_m text;
  res jsonb;
  trip_d text;
  ardoise_d text;
begin
  adam_m := testkit.member(home_d, adam, 'Adam Gestion', 'admin', 'accent');
  bea_m := testkit.member(home_d, bea, 'Bea Voyage', 'membre', 'ink');
  kim_m := testkit.member(home_d, kim, 'Kim Enfant', 'enfant', 'coral');
  eve_m := testkit.member(home_e, eve, 'Eve Voisine', 'admin', 'violet');
  insert into testkit.fx (key, user_id) values
    ('adam', adam), ('bea', bea), ('kim', kim), ('eve', eve);
  insert into testkit.fx (key, household_id) values
    ('home_d', home_d), ('home_e', home_e);
  insert into testkit.fx (key, row_id) values
    ('adam_m', adam_m), ('bea_m', bea_m), ('kim_m', kim_m), ('eve_m', eve_m);

  -- Voyage + ardoise liée, Adam seul participant.
  res := public.create_trip_atomic(
    adam, home_d, 'Jura D', 'Jura', '2027-10-01', '2027-10-07',
    null, array[adam_m], null);
  trip_d := res ->> 'trip_id';
  ardoise_d := res ->> 'ardoise_id';
  insert into testkit.fx (key, row_id) values
    ('trip_d', trip_d), ('ardoise_d', ardoise_d);

  -- Ajout d'un adulte : voyage + ardoise, puis idempotence.
  res := public.trip_add_member(adam, trip_d, bea_m);
  perform testkit.ok(not (res ->> 'already_member')::boolean, 'premier ajout inscrit');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_d)), 2::bigint,
    'deux participants au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L', ardoise_d)), 2::bigint,
    'l''adulte rejoint aussi l''ardoise liee');
  res := public.trip_add_member(adam, trip_d, bea_m);
  perform testkit.ok((res ->> 'already_member')::boolean, 're-ajout = already_member');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_d)), 2::bigint,
    'le rejeu idempotent ne duplique rien');

  -- Ajout d'un enfant : voyageur sans budget (0119). 0157 : D-06 exige
  -- 'voyages' dans la fiche (l'activation est faite par l'adulte, cf. 0157).
  update public.household_members
     set managed_modules = '{taches,routines,anniversaires,menu,voyages}'::text[]
   where id = kim_m;
  res := public.trip_add_member(adam, trip_d, kim_m);
  perform testkit.ok(not (res ->> 'already_member')::boolean, 'l''enfant est inscrit au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_d)), 3::bigint,
    'trois participants au voyage');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L and member_id = %L',
    ardoise_d, kim_m)), 0::bigint,
    'l''enfant voyageur n''entre jamais a l''ardoise');

  -- Cibles hors foyer : inconnue et autre foyer refusés, oracle P0002.
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    adam, trip_d, 'membre-fantome'),
    'un inconnu n''entre pas dans le voyage');
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    adam, trip_d, eve_m),
    'un membre d''un autre foyer n''entre pas dans le voyage');

  -- Acteurs non-admin : membre et enfant refusés (42501), voyage inconnu : P0002.
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    bea, trip_d, bea_m),
    'un membre ne gere pas les participants');
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    kim, trip_d, bea_m),
    'un enfant ne gere pas les participants');
  perform testkit.expect_denied(format(
    'select public.trip_add_member(%L, %L, %L)',
    adam, 'trip-fantome', bea_m),
    'ajout sur voyage inconnu refuse');

  -- Retrait d'un adulte : voyage ET ardoise, puis introuvable au rejeu.
  res := public.trip_remove_member(adam, trip_d, bea_m);
  perform testkit.ok((res ->> 'removed')::boolean, 'retrait confirme');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_d)), 2::bigint,
    'deux participants restants');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.ardoise_members where ardoise_id = %L and member_id = %L',
    ardoise_d, bea_m)), 0::bigint,
    'le membre quitte aussi l''ardoise liee');
  perform testkit.expect_denied(format(
    'select public.trip_remove_member(%L, %L, %L)',
    adam, trip_d, bea_m),
    're-retrait = participation introuvable');

  -- Retrait par un non-admin refusé.
  perform testkit.expect_denied(format(
    'select public.trip_remove_member(%L, %L, %L)',
    bea, trip_d, kim_m),
    'un membre ne retire personne');

  -- Garde du dernier : Adam part (reste Kim), puis Kim est intouchable.
  perform public.trip_remove_member(adam, trip_d, adam_m);
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L', trip_d)), 1::bigint,
    'un seul participant restant');
  perform testkit.expect_denied(format(
    'select public.trip_remove_member(%L, %L, %L)',
    adam, trip_d, kim_m),
    'jamais de voyage sans participant');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.trip_members where trip_id = %L and member_id = %L',
    trip_d, kim_m)), 1::bigint,
    'le dernier participant est toujours la');
end;
$$;

-- Les RPC serveur ne s'appellent pas en direct (motif 0053).
select testkit.as_user(user_id, 't20-bea@example.fr') from testkit.fx where key = 'bea';
set local role authenticated;

select testkit.expect_denied('select public.trip_add_member(null, null, null)',
  'l''ajout n''est pas appelable en direct');
select testkit.expect_denied('select public.trip_remove_member(null, null, null)',
  'le retrait n''est pas appelable en direct');

-- Aucune écriture directe : trip_members n'a pas de politique d'écriture.
-- L'INSERT lève (pas de WITH CHECK), le DELETE silencieux ne retire rien.
select testkit.expect_denied(format(
  'insert into public.trip_members (trip_id, member_id) values (%L, %L)',
  (select row_id from testkit.fx where key = 'trip_d'),
  (select row_id from testkit.fx where key = 'bea_m')),
  'aucune inscription en PostgREST direct');

delete from public.trip_members
 where trip_id = (select row_id from testkit.fx where key = 'trip_d');

reset role;

select testkit.eq(testkit.count(format(
  'select 1 from public.trip_members where trip_id = %L',
  (select row_id from testkit.fx where key = 'trip_d'))), 1::bigint,
  'aucun retrait en PostgREST direct : le dernier participant survit');

rollback;
