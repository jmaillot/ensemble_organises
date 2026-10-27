-- supabase/tests/0166_account_deletion_tables.test.sql
-- Tests du socle de suppression de compte RGPD (phase 27, plan 27-01).
--
-- Ce qui est prouvé ici (§2.7 D : un cas négatif par garde, comptages bornés) :
--   1. `request_account_deletion` : instantané D-04 posé AVANT déshumanisation
--      (profil ET ligne membre, D-01/D-02/D-03), demande créée avec horloge
--      J+30 ; un seul appel transactionnel.
--   2. Garde D-06 EN BASE : une deuxième demande active viole l'index unique
--      partiel — le remplacement passe par le RPC (annule l'active, repose,
--      horloge rejouée).
--   3. `cancel_account_deletion` : restauration depuis l'instantané, demande
--      « annulee », reposable immédiatement.
--   4. Négatifs d'acteur : un utilisateur ne peut ni demander ni annuler pour
--      un autre (même foyer ou autre foyer) ; sans session, refus 28000.
--
-- Comptages bornés au semis (en `postgres` la RLS est court-circuitée, tout
-- comptage est borné à la main — ici par `user_id` ou `household_id`).

begin;

-- ---------------------------------------------------------------
-- Semis : un foyer, deux membres adultes (alice, bob) + carol
-- dans un second foyer (cas négatif « acteur d'un autre foyer »).
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := testkit.auth_user('t166-alice@example.fr', 'Alice 166');
  bob uuid := testkit.auth_user('t166-bob@example.fr', 'Bob 166');
  carol uuid := testkit.auth_user('t166-carol@example.fr', 'Carol 166');
  h1 text := testkit.household(alice, 'Foyer 166 A');
  h2 text := testkit.household(carol, 'Foyer 166 B');
begin
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('alice', alice, h1, testkit.member(h1, alice, 'Membre Alice 166', 'admin'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('bob', bob, h1, testkit.member(h1, bob, 'Membre Bob 166'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('carol', carol, h2, testkit.member(h2, carol, 'Membre Carol 166', 'admin'));
end;
$$;

-- ---------------------------------------------------------------
-- 1. Demande : instantané PUIS déshumanisation PUIS demande (D-04/D-01/D-02/D-03).
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  v_request_id uuid;
begin
  perform testkit.as_user(alice, 't166-alice@example.fr');
  set local role authenticated;
  select public.request_account_deletion(alice) into v_request_id;
  perform testkit.ok(v_request_id is not null, 'la demande renvoie son identifiant');
end;
$$;

do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  v_member text := (select row_id from testkit.fx where key = 'alice');
begin
  -- Instantané : l'ancien nom de la ligne membre est copié AVANT déshumanisation.
  perform testkit.ok(exists (
      select 1 from public.account_deletion_restorations r
       where r.user_id = alice
         and r.former_display_name = 'Alice 166'
         and r.former_member_display_name = 'Membre Alice 166'
         and r.former_member_row_id = v_member
     ),
    'l''instantané D-04 porte l''ancien nom du profil ET de la ligne membre');

  -- Déshumanisation de la surface publique (D-01/D-02).
  perform testkit.ok(exists (
      select 1 from public.profiles p where p.id = alice
        and p.display_name = 'Ancien membre' and p.avatar_url is null),
    'le profil est déshumanisé (Ancien membre, sans avatar)');

  -- La ligne membre RESTE en base, marquée « ancien membre » (D-03).
  perform testkit.ok(exists (
      select 1 from public.household_members m where m.id = (select row_id from testkit.fx where key = 'alice')
        and m.user_id = alice
        and m.account_deleted_at is not null
        and m.display_name = 'Ancien membre'),
    'la ligne membre survit, marquée « ancien membre » (D-03)');

  -- La demande est active avec une horloge J+30.
  perform testkit.ok(exists (
      select 1 from public.account_deletion_requests q
       where q.user_id = alice and q.status = 'demandee'
         and q.purge_due_at > now() + interval '29 days'),
    'la demande est « demandee » avec une horloge de 30 jours');

  -- L'autre membre n'est pas touché.
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.household_members m where m.household_id = %L and m.user_id = %L and m.account_deleted_at is not null',
      (select household_id from testkit.fx where key = 'alice'), alice)),
    1::bigint,
    'un seul état « ancien membre » dans le foyer');
end;
$$;

-- ---------------------------------------------------------------
-- 2. Garde D-06 EN BASE : une deuxième ligne active viole l'index unique
--    partiel (même depuis postgres, donc sans le RPC).
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.expect_denied(
    format('insert into public.account_deletion_requests (user_id, status) values (%L::uuid, ''demandee'')', alice),
    'garde D-06 : la deuxième demande active est refusée par l''index unique partiel EN BASE');
end;
$$;

-- Remplacement D-06 : le RPC annule l'active existante puis repose.
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.as_user(alice, 't166-alice@example.fr');
  set local role authenticated;
  perform public.request_account_deletion(alice);
end;
$$;

do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.account_deletion_requests q where q.user_id = %L and q.status in (''demandee'',''rappellee'')', alice)),
    1::bigint,
    'D-06 : une seule demande active reste après remplacement');
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.account_deletion_requests q where q.user_id = %L and q.status = ''annulee''', alice)),
    1::bigint,
    'D-06 : la demande remplacée est passée à « annulee »');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Annulation : restauration depuis l'instantané, reposable immédiatement.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.as_user(alice, 't166-alice@example.fr');
  set local role authenticated;
  perform public.cancel_account_deletion(alice);
end;
$$;

do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  v_member text := (select row_id from testkit.fx where key = 'alice');
begin
  perform testkit.ok(exists (
      select 1 from public.profiles p where p.id = alice
        and p.display_name = 'Alice 166' and p.avatar_url is null),
    'annulation : le profil retrouve son nom depuis l''instantané');
  perform testkit.ok(exists (
      select 1 from public.household_members m where m.id = v_member
        and m.account_deleted_at is null
        and m.display_name = 'Membre Alice 166'),
    'annulation : la ligne membre retrouve son nom et son état vivant');
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.account_deletion_requests q where q.user_id = %L and q.status in (''demandee'',''rappellee'')', alice)),
    0::bigint,
    'annulation : aucune demande active restante');

  -- D-06 : une demande annulée peut être reposée immédiatement.
  perform testkit.as_user(alice, 't166-alice@example.fr');
  set local role authenticated;
  perform public.request_account_deletion(alice);
end;
$$;

do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.account_deletion_requests q where q.user_id = %L and q.status = ''demandee''', alice)),
    1::bigint,
    'une demande annulée peut être reposée immédiatement (D-06)');
end;
$$;

-- ---------------------------------------------------------------
-- 4. Négatifs d'acteur (T-27-01) : un utilisateur ne peut agir que sur sa
--    propre demande — même foyer, autre foyer, ou sans session.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  -- Bob, membre du MÊME foyer, ne peut pas demander pour alice.
  perform testkit.as_user((select user_id from testkit.fx where key = 'bob'));
  set local role authenticated;
  perform testkit.expect_denied(
    format('select public.request_account_deletion(%L::uuid)', alice),
    'un membre du même foyer ne peut pas demander la suppression d''un autre');
  perform testkit.expect_denied(
    format('select public.cancel_account_deletion(%L::uuid)', alice),
    'un membre du même foyer ne peut pas annuler la demande d''un autre');

  -- Carol, d'un AUTRE foyer, de même.
  perform testkit.as_user((select user_id from testkit.fx where key = 'carol'));
  set local role authenticated;
  perform testkit.expect_denied(
    format('select public.request_account_deletion(%L::uuid)', alice),
    'un utilisateur d''un autre foyer ne peut pas demander pour un autre');

  -- Sans session : refus 28000.
  perform testkit.as_anon();
  set local role anon;
  perform testkit.expect_denied(
    format('select public.request_account_deletion(%L::uuid)', alice),
    'sans session, la demande est refusée (28000)');
end;
$$;

-- La tentative d'autrui n'a rien écrit.
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.account_deletion_requests q where q.user_id = %L', alice)),
    2::bigint,
    'les tentatives d''autrui n''ont rien écrit (2 demandes légitimes : remplacée + reposée)');
end;
$$;

rollback;
