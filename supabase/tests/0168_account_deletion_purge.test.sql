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

-- ---------------------------------------------------------------
-- 5. Le wrapper HTTP (task 2) : J-7 — le flag ne bouge que derrière un POST
--    partant, et une demande déjà rappelée ne repart jamais (T-27-06).
--    Sur une stack sans secrets Vault, le wrapper refuse de partir AVANT de
--    marquer : le test le nomme honnêtement au lieu de le simuler.
-- ---------------------------------------------------------------
do $$
declare
  noa uuid := testkit.auth_user('t168-noa@example.fr', 'Noa 168');
  hh3 text := testkit.household(noa, 'Foyer 168 C');
  v_posted boolean;
  v_posted2 boolean;
begin
  insert into testkit.fx (key, user_id, household_id, row_id)
    values ('noa', noa, hh3, testkit.member(hh3, noa, 'Membre Noa 168', 'admin'));
  update public.profiles set display_name = 'Ancien membre', avatar_url = null where id = noa;
  update public.household_members
     set account_deleted_at = now(), display_name = 'Ancien membre', avatar_url = null
   where user_id = noa;
  -- Alerte J-7 due dans 3 jours (fenêtre 7 jours), pas encore envoyée.
  insert into public.account_deletion_requests (user_id, purge_due_at)
    values (noa, now() + interval '3 days');
end;
$$;

do $$
declare
  v_noa uuid := (select user_id from testkit.fx where key = 'noa');
  v_posted boolean;
  v_posted2 boolean;
  v_was_flagged boolean;
begin
  -- La sélection bornée du wrapper : exactement la demande de Noa est due.
  perform testkit.eq((
    select count(*) from public.account_deletion_requests
     where status in ('demandee', 'rappellee')
       and rappel_envoye = false
       and purge_due_at - now() <= interval '7 days'
       and user_id = v_noa), 1::bigint,
    'la demande J-7 est dans la fenêtre, non rappelée');

  select private.post_account_deletion_http('reminder') into v_posted;
  v_was_flagged := exists (
    select 1 from public.account_deletion_requests
     where user_id = v_noa and rappel_envoye = true);

  -- T-27-06 : le flag ne bouge QUE si un POST est parti — posé dans la
  -- transaction AVANT l'appel HTTP, jamais sans envoi possible.
  perform testkit.ok(v_posted = v_was_flagged,
    'le flag rappel_envoye ne bouge que derrière un POST partant (T-27-06)');

  if v_posted then
    -- Idempotence : la seconde exécution ne POSTe plus (aucun doublon).
    select private.post_account_deletion_http('reminder') into v_posted2;
    perform testkit.ok(v_posted2 = false,
      'la seconde exécution du rappel J-7 ne reposte pas (T-27-06)');
  else
    raise notice 'Stack sans secrets Vault : la pose du flag n''est pas observée, le refus l''est.';
    perform testkit.ok(v_was_flagged = false,
      'sans envoi possible, la demande n''est pas marquée rappelée');
  end if;
end;
$$;

-- Purge-medias : sans ligne non purgée au manifest, rien ne part.
do $$
declare
  v_h1 text := (select household_id from testkit.fx where key = 'dave');
  v_posted boolean;
begin
  update private.account_deletion_media_manifest set purged = true
   where household_id <> v_h1;

  select private.post_account_deletion_http('purge-medias') into v_posted;
  perform testkit.ok(v_posted = false,
    'purge-medias sans chemin non purgé ne poste pas');

  update private.account_deletion_media_manifest set purged = false
   where household_id <> v_h1;
end;
$$;

-- ---------------------------------------------------------------
-- 6. Jobs cron : trois jobs, commands réduits à des appels private.*() sans
--    secret (contrat test 0004), alerte J-7 AVANT la purge du même matin.
-- ---------------------------------------------------------------
do $$
begin
  perform testkit.ok(
    exists (select 1 from cron.job
             where jobname = 'eo-account-deletion-reminder'
               and command = 'select private.dispatch_account_deletion_reminder()'),
    'le job J-7 appelle un dispatch privé sans paramètre (contrat test 0004)');
  perform testkit.ok(
    exists (select 1 from cron.job
             where jobname = 'eo-account-deletion-purge'
               and command = 'select private.purge_expired_account_deletions()'),
    'le job J+30 appelle la purge SQL pure, jamais de HTTP (RGDP-04)');
  perform testkit.ok(
    exists (select 1 from cron.job
             where jobname = 'eo-account-deletion-purge-medias'
               and command = 'select private.dispatch_account_deletion_purge_medias()'),
    'le job purge-medias appelle un dispatch privé sans paramètre');

  -- Les deux dispatch délèguent au wrapper avec l'action DANS LE CODE.
  perform testkit.ok(
    pg_get_functiondef('private.dispatch_account_deletion_reminder()'::regprocedure)
      like '%post_account_deletion_http(''reminder'')%',
    'le dispatch J-7 délègue au wrapper avec l''action reminder');
  perform testkit.ok(
    pg_get_functiondef('private.dispatch_account_deletion_purge_medias()'::regprocedure)
      like '%post_account_deletion_http(''purge-medias'')%',
    'le dispatch purge-medias délègue au wrapper avec l''action purge-medias');

  perform testkit.ok(
    (select split_part(schedule, ' ', 1)::int from cron.job where jobname = 'eo-account-deletion-reminder')
      < (select split_part(schedule, ' ', 1)::int from cron.job where jobname = 'eo-account-deletion-purge'),
    'l''alerte J-7 part avant la purge J+30 du même matin');
end;
$$;

-- Aucun secret dans les commands des trois jobs (lecture vérifiée).
select testkit.ok(
  (select count(*) from cron.job
    where jobname in ('eo-account-deletion-reminder',
                      'eo-account-deletion-purge',
                      'eo-account-deletion-purge-medias')
      and (command like '%key%' or command like '%secret%')) = 0,
  'aucun secret dans cron.job.command');

-- La lecture des secrets est centralisée dans le wrapper, comme le dispatch push.
select testkit.ok(
  pg_get_functiondef('private.post_account_deletion_http(text)'::regprocedure) like '%vault.decrypted_secrets%',
  'le wrapper lit ses secrets dans Vault au moment de l''exécution');
select testkit.ok(
  pg_get_functiondef('private.post_account_deletion_http(text)'::regprocedure) like '%''apikey'', v_key%'
  and pg_get_functiondef('private.post_account_deletion_http(text)'::regprocedure) not like '%''authorization''%',
  'le wrapper envoie la clé secrète dans l''en-tête apikey, pas comme un Bearer');

-- Le purge-medias lit bien le manifest ; le corps ne porte qu'un nom d'action.
select testkit.ok(
  pg_get_functiondef('private.post_account_deletion_http(text)'::regprocedure)
    like '%account_deletion_media_manifest%',
  'le wrapper purge-medias interroge le manifest de médias');

-- PAS de commit : la transaction reste ouverte, la sortie du session psql
-- l'annule (motif 0166 — les fixtures ne doivent rien laisser en base).
