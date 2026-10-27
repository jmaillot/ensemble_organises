-- supabase/tests/0168_account_deletion_purge.test.sql
-- Tests de la purge J+30 (phase 27, plan 27-02, task 1 — étendu par la task 2).
--
-- Ce qui est prouvé ici (§2.7 D : comptages bornés au semis, un cas négatif
-- par garde) :
--   1. Foyer CONSERVÉ : la purge d'un compte laisse le foyer intact — les
--      données partagées survivent, les autres adultes survivent, les profils
--      enfants restent gérés par eux (D-08 : aucun enfant purgé quand un
--      adulte reste), la ligne « ancien membre » reste avec user_id NULL.
--   2. Foyer ORPHELIN : supprimé avec ses enfants (RGDP-06/D-09), ses chemins
--      Storage consignés dans le manifest AVANT suppression (D-07) — et
--      AUCUNE ligne de manifest pour les foyers conservés, dont les objets
--      Storage restent en place.
--   3. Négatifs : une demande `annulee` due n'est PAS purgée (compte vivant),
--      une demande active pas encore due n'est PAS purgée.
--   4. Privilèges : execute réservé à service_role (T-27-08, motif 0074).
--
-- Fixture : la déshumanisation (0167) est semée à la main (le RPC exige une
-- session — le cron n'en a pas) : profils « Ancien membre », lignes membres
-- marquées account_deleted_at, demandes dues posées directement.

begin;

-- ---------------------------------------------------------------
-- Semis.
--   h1 (conservé)  : dave (admin, purgé), eve (adulte restant), gina (enfant)
--   h2 (orphelin)  : frank (admin, purgé, seul adulte), henri (enfant)
--   hank : demande annulee due — non purgée
--   mia  : demande active PAS due — non purgée
-- ---------------------------------------------------------------
do $$
declare
  dave uuid := testkit.auth_user('t168-dave@example.fr', 'Dave 168');
  eve  uuid := testkit.auth_user('t168-eve@example.fr', 'Eve 168');
  frank uuid := testkit.auth_user('t168-frank@example.fr', 'Frank 168');
  hank uuid := testkit.auth_user('t168-hank@example.fr', 'Hank 168');
  mia  uuid := testkit.auth_user('t168-mia@example.fr', 'Mia 168');
  h1 text := testkit.household(dave, 'Foyer 168 A');
  h2 text := testkit.household(frank, 'Foyer 168 B');
  v_dave_member text;
begin
  v_dave_member := testkit.member(h1, dave, 'Membre Dave 168', 'admin');
  insert into testkit.fx (key, user_id, household_id, row_id) values ('dave', dave, h1, v_dave_member);
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('eve', eve, h1, testkit.member(h1, eve, 'Membre Eve 168'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('gina', null, h1, testkit.member(h1, null, 'Gina (enfant 168)', 'enfant'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('frank', frank, h2, testkit.member(h2, frank, 'Membre Frank 168', 'admin'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('henri', null, h2, testkit.member(h2, null, 'Henri (enfant 168)', 'enfant'));
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('hank', hank, null, null);
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('mia', mia, null, null);

  -- Donnée PARTAGÉE du foyer conservé : doit survivre à la purge de dave.
  insert into public.birthdays (household_id, name, birth_date)
    values (h1, 'Anniversaire partagé 168', date '2000-01-01');

  -- Objets Storage : un côté chaque foyer (le SQL ne peut pas les supprimer —
  -- D-07 : seuls les chemins de l'orphelin vont au manifest).
  insert into storage.objects (bucket_id, name)
    values ('household-media', h1 || '/recettes/photo-h1.jpg');
  insert into storage.objects (bucket_id, name)
    values ('household-media', h2 || '/recettes/photo-h2.jpg');
  insert into storage.objects (bucket_id, name)
    values ('household-media', h2 || '/notes/carnet-h2.png');

  -- Déshumanisation semée à la main (état produit par 0167 à la demande).
  update public.profiles
     set display_name = 'Ancien membre', avatar_url = null
   where id in (dave, frank);
  update public.household_members
     set account_deleted_at = now(),
         display_name = 'Ancien membre',
         avatar_url = null
   where user_id in (dave, frank);

  -- Demandes : dave et frank DUES ; hank annulée (due) ; mia pas due.
  insert into public.account_deletion_requests (user_id, purge_due_at)
    values (dave, now() - interval '1 day');
  insert into public.account_deletion_requests (user_id, purge_due_at)
    values (frank, now() - interval '2 hours');
  insert into public.account_deletion_requests
    (user_id, purge_due_at, status)
    values (hank, now() - interval '1 day', 'annulee');
  insert into public.account_deletion_requests (user_id, purge_due_at)
    values (mia, now() + interval '20 days');
end;
$$;

-- ---------------------------------------------------------------
-- 1+2. La purge : deux demandes dues, deux issues différentes.
-- ---------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_h1 text := (select household_id from testkit.fx where key = 'dave');
  v_h2 text := (select household_id from testkit.fx where key = 'frank');
begin
  select private.purge_expired_account_deletions() into v_result;

  perform testkit.eq((v_result ->> 'purged')::integer, 2,
    'exactement les deux demandes dues sont purgées');
  perform testkit.eq((v_result ->> 'households_deleted')::integer, 1,
    'un seul foyer orphelin supprimé');
  perform testkit.eq((v_result ->> 'children_transferred')::integer, 1,
    'un enfant transféré aux adultes restants (D-08)');
  perform testkit.eq((v_result ->> 'children_purged')::integer, 1,
    'un enfant purgé avec le foyer orphelin (RGDP-06)');
  perform testkit.eq((v_result ->> 'manifest_rows')::integer, 2,
    'les deux chemins Storage de l''orphelin sont au manifest (D-07)');
end;
$$;

-- Foyer conservé : foyer, adulte restant, enfant, donnée partagée, ligne
-- « ancien membre » — RIEN ne manque.
do $$
declare
  v_h1 text := (select household_id from testkit.fx where key = 'dave');
  v_dave uuid := (select user_id from testkit.fx where key = 'dave');
begin
  perform testkit.ok(exists (select 1 from public.households where id = v_h1),
    'le foyer conservé existe toujours');
  perform testkit.ok(exists (
    select 1 from public.household_members
     where household_id = v_h1 and role = 'enfant' and deleted_at is null),
    'l''enfant du foyer conservé a été transféré, pas purgé (D-08)');
  perform testkit.ok(exists (
    select 1 from public.birthdays
     where household_id = v_h1 and name = 'Anniversaire partagé 168'),
    'la donnée partagée du foyer conservé survit à la purge');
  perform testkit.ok(exists (
    select 1 from public.household_members
     where household_id = v_h1 and user_id is null
       and account_deleted_at is not null),
    'la ligne « ancien membre » du foyer conservé reste, user_id NULL (D-03)');
  perform testkit.ok(exists (
    select 1 from public.household_members
     where household_id = v_h1 and user_id = (select user_id from testkit.fx where key = 'eve')),
    'l''adulte restant du foyer conservé survit');
  perform testkit.ok(not exists (
    select 1 from public.account_deletion_requests where user_id = v_dave),
    'la demande purgée meurt avec le compte (cascade 0166) — trace RGPD disparue');
  perform testkit.ok(not exists (
    select 1 from public.account_deletion_restorations where user_id = v_dave),
    'l''instantané de restauration est purgé avec le compte');
  perform testkit.ok(not exists (
    select 1 from public.profiles where id = v_dave),
    'le profil est purgé avec le compte');
  perform testkit.ok(not exists (
    select 1 from auth.users where id = v_dave),
    'le compte auth.users est purgé (précédent 0145:143)');
end;
$$;

-- Foyer orphelin : supprimé avec son enfant ; manifest ; objets Storage
-- intacts (c'est l'Edge du plan 03 qui les supprimera, bornée au manifest).
do $$
declare
  v_h2 text := (select household_id from testkit.fx where key = 'frank');
  v_h1 text := (select household_id from testkit.fx where key = 'dave');
  v_frank uuid := (select user_id from testkit.fx where key = 'frank');
begin
  perform testkit.ok(not exists (select 1 from public.households where id = v_h2),
    'le foyer orphelin est supprimé (D-09, réutilisation 0074)');
  perform testkit.ok(not exists (
    select 1 from public.household_members where household_id = v_h2),
    'l''orphelin n''a plus de membres (enfant purgé avec le foyer, RGDP-06)');
  perform testkit.eq((
    select count(*) from private.account_deletion_media_manifest
     where household_id = v_h2), 2::bigint,
    'les deux chemins Storage de l''orphelin sont au manifest (D-07)');
  perform testkit.eq((
    select count(*) from private.account_deletion_media_manifest
     where household_id = v_h1), 0::bigint,
    'AUCUNE ligne de manifest pour le foyer conservé — ses médias restent');
  perform testkit.eq((
    select count(*) from storage.objects
     where name like v_h2 || '/%'), 2::bigint,
    'les objets Storage restent en base : le SQL ne les supprime pas (F6)');
  perform testkit.eq((
    select count(*) from storage.objects
     where name like v_h1 || '/%'), 1::bigint,
    'les objets Storage du foyer conservé ne sont jamais touchés');
  perform testkit.ok(not exists (
    select 1 from public.account_deletion_requests where user_id = v_frank),
    'la demande de frank meurt avec son compte');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Négatifs : une demande annulee due et une demande pas due restent.
-- ---------------------------------------------------------------
do $$
declare
  v_hank uuid := (select user_id from testkit.fx where key = 'hank');
  v_mia uuid := (select user_id from testkit.fx where key = 'mia');
begin
  perform testkit.ok(exists (
    select 1 from public.account_deletion_requests
     where user_id = v_hank and status = 'annulee'),
    'la demande annulee due n''est pas purgée (T-27-07)');
  perform testkit.ok(exists (
    select 1 from public.profiles where id = v_hank),
    'le compte derrière une demande annulee reste vivant');
  perform testkit.ok(exists (
    select 1 from public.account_deletion_requests
     where user_id = v_mia and status = 'demandee'),
    'la demande pas encore due n''est pas purgée (T-27-07)');
  perform testkit.ok(exists (
    select 1 from auth.users where id = v_mia),
    'le compte pas encore dû reste vivant');
end;
$$;

-- ---------------------------------------------------------------
-- 4. Privilèges : execute réservé à service_role (T-27-08, motif 0074).
-- ---------------------------------------------------------------
do $$
begin
  perform testkit.ok(
    not has_function_privilege('anon', 'private.purge_expired_account_deletions()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.purge_expired_account_deletions()', 'EXECUTE'),
    'anon et authenticated ne peuvent pas déclencher la purge');
  perform testkit.ok(
    has_function_privilege('service_role', 'private.purge_expired_account_deletions()', 'EXECUTE'),
    'service_role peut déclencher la purge (cron)');
end;
$$;

commit;
