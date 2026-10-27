-- 0168_account_deletion_purge_cron.sql
-- Purge effective J+30 de la suppression de compte (phase 27, plan 27-02).
--
-- Trois pièces, dans cet ordre (la task 2 étend CE FICHIER avec le wrapper
-- HTTP et les jobs cron — jamais de réécriture, AGENTS §2.7 A) :
--
--   1. Table `private.account_deletion_media_manifest` — le manifest de
--      médias construit À LA DEMANDE par le SQL de purge (D-07, hypothèse
--      F6) : les chemins `<household_id>/…` des foyers ORPHELINS uniquement.
--      Schéma `private` : jamais exposé au client PostgREST (le manifest
--      porte la liste des fichiers à supprimer — surface serveur seule).
--   2. Fonction `private.purge_expired_account_deletions()` — 100 % SQL,
--      zéro HTTP (RGDP-04 : la purge de données ne traverse JAMAIS la
--      frontière HTTP non couverte par test-db.sh). Exécutée chaque jour par
--      pg_cron (job de la task 2). Pour chaque demande active dont
--      `purge_due_at` est dépassé, DANS UNE SOUS-TRANSACTION par demande :
--        a. D-08 : dans chaque foyer où l'ancien compte était membre, si des
--           adultes RESTENT, les profils enfants restent gérés par eux —
--           ils ne sont PAS touchés (aucune ligne supprimée, comptés
--           « transferred ») ;
--        b. D-07/D-09 : si AUCUN adulte ne reste (foyer orphelin), les
--           chemins Storage du foyer sont d'abord consignés dans le
--           manifest (les objets eux-mêmes ne peuvent pas être supprimés
--           par le SQL — c'est le rôle de l'Edge unifiée, plan 03, bornée
--           au manifest), puis le foyer est supprimé avec les enfants qui
--           y vivaient (RGDP-06) en réutilisant `public.delete_household`
--           (0074, dépenses d'abord, cascades ensuite) — JAMAIS réimplémentée.
--        c. Purge du compte : `delete from auth.users` (précédent 0145:143)
--           — les cascades auditées en 0166 ne peuvent plus emporter de
--           donnée partagée. La demande est marquée `purgee` AVANT le delete
--           : la ligne meurt ensuite avec le compte (cascade 0166), ce qui
--           est la preuve RGPD que la trace de la demande a disparu. La
--           ligne d'instantané est purgée explicitement (restauration
--           impossible au-delà de J+30).
--   3. Privilèges : service_role seul (T-27-07/T-27-08), avec preuve en
--      migration (motif 0074).
--
-- Préjugés hérités du plan 01 (lire 27-01-SUMMARY.md avant ce fichier) :
--   - `households.id` / `household_members.id` sont `text`, pas uuid ;
--   - `household_members.user_id` est `on delete set null` (0166) — la ligne
--     « ancien membre » des foyers conservés survit avec user_id NULL,
--     admis par le `chk_members_managed_child` assoupli (0166).

begin;

-- ---------------------------------------------------------------------------
-- 1. Manifest de médias (D-07, F6) — table serveur, hors PostgREST
-- ---------------------------------------------------------------------------
create table private.account_deletion_media_manifest (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  storage_path text not null,
  purged boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, storage_path)
);

comment on table private.account_deletion_media_manifest is
  'Manifest de médias construit à la demande par la purge J+30 (D-07) : un chemin `<household_id>/…` par objet Storage d''un foyer ORPHELIN. Les foyers conservés n''y génèrent AUCUNE ligne — leurs médias restent. La suppression des objets est opérée par l''Edge unifiée (plan 03), bornée aux chemins présents ici ; `purged` est posé par elle.';

revoke all on private.account_deletion_media_manifest
  from public, anon, authenticated;
grant select, insert, update on private.account_deletion_media_manifest
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. La purge J+30 — SQL pur, zéro HTTP (RGDP-04)
-- ---------------------------------------------------------------------------
create or replace function private.purge_expired_account_deletions()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_hh record;
  v_inserted integer;
  v_children_transferred integer := 0;
  v_children_purged integer := 0;
  v_households_deleted integer := 0;
  v_manifest_rows integer := 0;
  v_purged integer := 0;
begin
  for r in
    select q.id, q.user_id
      from public.account_deletion_requests q
     where q.status in ('demandee', 'rappellee')
       and q.purge_due_at <= now()
     order by q.created_at asc
  loop
    begin
      -- Sous-transaction par demande : un échec (donnée imprévue, cascade
      -- restrict…) n'arrête pas les demandes suivantes — le redrive du cron
      -- journalier est le retry (motif savepoint ; le job J+30 rappelle
      -- cette fonction chaque jour tant que la demande reste active).
      for v_hh in
        select m.household_id,
               (select count(*) from public.household_members am
                 where am.household_id = m.household_id
                   and am.role <> 'enfant'
                   and am.user_id is not null
                   and am.account_deleted_at is null
                   and am.deleted_at is null
                   and am.user_id <> r.user_id) as adults_left,
               (select count(*) from public.household_members cm
                 where cm.household_id = m.household_id
                   and cm.role = 'enfant'
                   and cm.user_id is null
                   and cm.deleted_at is null) as children_count
          from public.household_members m
         where m.user_id = r.user_id
           and m.account_deleted_at is not null
         group by m.household_id
      loop
        if v_hh.adults_left > 0 then
          -- D-08 : les profils enfants RESTENT, gérés par les adultes
          -- restants. Aucune ligne n'est écrite : un enfant géré est une
          -- ligne du foyer sans gestionnaire nommé — le seul effet de la
          -- purge est que l'ancien compte ne le gérera plus. JAMAIS de
          -- DELETE brut de la ligne enfant (les cascades 0150 purgeraient
          -- son historique, pitfall du research).
          v_children_transferred := v_children_transferred + v_hh.children_count;
        else
          -- D-07 : manifest AVANT toute suppression — foyers orphelins
          -- UNIQUEMENT. Les objets Storage restent en place : le SQL ne
          -- peut pas les supprimer (pas de client Storage en base), l'Edge
          -- unifiée du plan 03 le fera, bornée à ce manifest.
          insert into private.account_deletion_media_manifest
            (household_id, storage_path)
          select v_hh.household_id, o.name
            from storage.objects o
           where o.name like v_hh.household_id || '/%'
          on conflict (household_id, storage_path) do nothing;
          get diagnostics v_inserted = row_count;
          v_manifest_rows := v_manifest_rows + v_inserted;

          -- RGDP-06 : les enfants du foyer orphelin partent avec lui.
          v_children_purged := v_children_purged + v_hh.children_count;

          -- D-09 : la suppression du foyer réutilise 0074 (dépenses d'abord
          -- — `expenses.paid_by … restrict` — puis le foyer, cascades
          -- ensuite). L'acteur est l'ancien compte lui-même : sa ligne
          -- membre porte encore son user_id (le set null ne vient qu'avec
          -- la cascade du `delete from auth.users`, plus bas).
          if exists (
            select 1 from public.household_members fm
             where fm.household_id = v_hh.household_id
               and fm.user_id = r.user_id
               and fm.role = 'admin'
          ) then
            perform public.delete_household(r.user_id, v_hh.household_id);
          else
            -- Repli documenté (Rule 2) : le compte n'était pas admin du
            -- foyer orphelin — `delete_household` refuserait (42501,
            -- assert_household_admin) et le demandeur suivant ne serait
            -- jamais purgé. Même ordre que 0074, en une transaction : les
            -- dépenses d'abord, le foyer (et ses cascades) ensuite.
            delete from public.expenses e
             where e.household_id = v_hh.household_id;
            delete from public.households h
             where h.id = v_hh.household_id;
          end if;
          v_households_deleted := v_households_deleted + 1;
        end if;
      end loop;

      -- Purge du compte : les cascades auditées en 0166 ne peuvent plus
      -- emporter de donnée partagée (set null sur les lignes survivantes).
      -- La demande est marquée `purgee` AVANT le delete : la ligne meurt
      -- ensuite avec le compte (cascade 0166) — trace RGPD disparue. Le
      -- flag `rappel_envoye` n'est PAS touché ici (rôle du J-7).
      update public.account_deletion_requests
         set status = 'purgee',
             updated_at = now()
       where id = r.id;

      -- L'instantané de restauration est purgé explicitement : au-delà de
      -- J+30, la restauration n'est plus possible (c'est le RGPD demandé).
      delete from public.account_deletion_restorations
       where user_id = r.user_id;

      delete from auth.users where id = r.user_id;

      v_purged := v_purged + 1;
    exception when others then
      raise warning 'purge J+30 : la demande % a échoué : %', r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'purged', v_purged,
    'children_transferred', v_children_transferred,
    'children_purged', v_children_purged,
    'households_deleted', v_households_deleted,
    'manifest_rows', v_manifest_rows
  );
end;
$$;

comment on function private.purge_expired_account_deletions() is
  'Purge J+30 des demandes de suppression de compte arrivées à échéance (RGDP-04 : 100 % SQL, zéro HTTP). Foyers conservés : données partagées intactes, enfants transférés (D-08). Foyers orphelins : manifest de médias puis suppression (D-07/D-09), enfants purgés avec le foyer (RGDP-06). Compte purgé par delete from auth.users, demande marquée purgee puis emportée par la cascade.';

-- ---------------------------------------------------------------------------
-- 3. Privilèges (T-27-07/T-27-08) : service_role seul, preuve en migration
-- ---------------------------------------------------------------------------
revoke all on function private.purge_expired_account_deletions()
  from public, anon, authenticated;
grant execute on function private.purge_expired_account_deletions()
  to service_role;

do $$
begin
  if has_function_privilege('anon', 'private.purge_expired_account_deletions()', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir déclencher la purge J+30';
  end if;
  if has_function_privilege('authenticated', 'private.purge_expired_account_deletions()', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir déclencher la purge J+30';
  end if;
  if not has_function_privilege('service_role', 'private.purge_expired_account_deletions()', 'EXECUTE') then
    raise exception 'service_role doit pouvoir exécuter la purge J+30 (cron)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Wrapper HTTP (task 2) — éveil de l'Edge unifiée `household-delete`
--    (motif exact 0158:340-405 / 0025) : secrets lus dans Vault, clé secrète
--    dans l'en-tête `apikey` (JAMAIS Bearer — mode `secret` du framework),
--    corps `{action}` — aucune donnée utilisateur ne traverse la frontière
--    cron→Edge (RGDP-04, T-27-05).
--
--    Actions :
--      'reminder'    — alerte J-7 (RGDP-03) : ne POSTe que s'il existe des
--                      demandes actives dont `purge_due_at - now()` tombe
--                      sous 7 jours avec `rappel_envoye = false`. Le flag —
--                      et le statut `rappellee` de la machine à états 0166 —
--                      sont posés DANS la transaction AVANT l'appel HTTP
--                      (motif notified_push 0164, T-27-06) : le redrive du
--                      cron EST le retry, jamais un double email.
--      'purge-medias'— instruction de suppression Storage (F6) : ne POSTe
--                      que s'il reste des chemins non purgés au manifest.
--                      L'Edge ne supprime QUE les chemins présents.
-- ---------------------------------------------------------------------------
create or replace function private.post_account_deletion_http(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_due_count integer;
begin
  -- Comptage conditionnel d'abord (forme 0158/0019) : ne rien faire ni
  -- marquer tant qu'il n'y a rien à traiter.
  if p_action = 'reminder' then
    select count(*)::integer into v_due_count
      from public.account_deletion_requests
     where status in ('demandee', 'rappellee')
       and rappel_envoye = false
       and purge_due_at - now() <= interval '7 days';

    if v_due_count = 0 then
      return false;
    end if;
  elsif p_action = 'purge-medias' then
    select count(*)::integer into v_due_count
      from private.account_deletion_media_manifest
     where purged = false;

    if v_due_count = 0 then
      return false;
    end if;
  else
    raise warning 'Action inconnue : %', p_action;
    return false;
  end if;

  -- Gardes (motif 0025) : une FONCTION se demande avec to_regproc, la VUE
  -- Vault avec to_regclass. Le flag n'est posé qu'APRÈS les gardes : un
  -- flag posé sans envoi possible serait un rappel perdu, jamais renvoyé.
  if to_regproc('net.http_post') is null then
    raise warning 'pg_net absent (net.http_post introuvable) : aucun envoi ne partira.';
    return false;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise warning 'Vault absent (vault.decrypted_secrets introuvable) : aucun envoi ne partira.';
    return false;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : envoi ignoré.';
    return false;
  end if;

  -- RGDP-03 / T-27-06 : le flag est posé DANS la transaction AVANT l'appel
  -- HTTP — le redrive du cron est le retry, jamais un doublon. Le statut
  -- passe à `rappellee` dans la même écriture (machine à états 0166).
  if p_action = 'reminder' then
    update public.account_deletion_requests
       set rappel_envoye = true,
           status = 'rappellee',
           updated_at = now()
     where status in ('demandee', 'rappellee')
       and rappel_envoye = false
       and purge_due_at - now() <= interval '7 days';
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/household-delete',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', v_key
    ),
    body := jsonb_build_object('action', p_action),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;

comment on function private.post_account_deletion_http(text) is
  'POST /functions/v1/household-delete (Edge unifiée du plan 03), clé secrète lue dans Vault, en-tête apikey. reminder : flag rappel_envoye posé dans la transaction AVANT le POST (jamais de doublon, RGDP-03) ; purge-medias : POSTe seulement s''il reste des chemins non purgés au manifest. Aucune donnée utilisateur dans le corps (RGDP-04).';

revoke all on function private.post_account_deletion_http(text)
  from public, anon, authenticated;
grant execute on function private.post_account_deletion_http(text)
  to service_role;

-- Deux dispatch sans paramètre (motif 0011/0158 : le job cron n'appelle que
-- des fonctions privées sans paramètre — contrat test 0004) : la valeur de
-- l'action vit dans le code, jamais recopiée dans cron.job.command.
create or replace function private.dispatch_account_deletion_reminder()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.post_account_deletion_http('reminder');
end;
$$;

create or replace function private.dispatch_account_deletion_purge_medias()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.post_account_deletion_http('purge-medias');
end;
$$;

comment on function private.dispatch_account_deletion_reminder() is
  'Point d''entrée cron de l''alerte J-7 : délègue à post_account_deletion_http(''reminder''). Sans paramètre — aucune valeur recopiée dans cron.job.command.';
comment on function private.dispatch_account_deletion_purge_medias() is
  'Point d''entrée cron de la purge de médias : délègue à post_account_deletion_http(''purge-medias''). Sans paramètre.';

revoke all on function private.dispatch_account_deletion_reminder()
  from public, anon, authenticated;
grant execute on function private.dispatch_account_deletion_reminder()
  to service_role;
revoke all on function private.dispatch_account_deletion_purge_medias()
  from public, anon, authenticated;
grant execute on function private.dispatch_account_deletion_purge_medias()
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Jobs pg_cron (motif 0158:409-430) — trois jobs quotidiens, fenêtres
--    Europe/Paris disjointes des jobs existants (birthday 40 6, gdpr purge
--    27 4, prune 20 6) et ordonnées pour que l'alerte J-7 parte AVANT la
--    purge du même matin : reminder 05:07 < purge 05:17. Aucun secret dans
--    cron.job.command : les commands sont des appels private.*() sans
--    paramètre de secret (motif 0158/0162).
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobs text[][] := array[
    array['eo-account-deletion-purge-medias', '57 4 * * *',
          'select private.dispatch_account_deletion_purge_medias()'],
    array['eo-account-deletion-reminder', '7 5 * * *',
          'select private.dispatch_account_deletion_reminder()'],
    array['eo-account-deletion-purge', '17 5 * * *',
          'select private.purge_expired_account_deletions()']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs de suppression de compte non installés.';
    return;
  end if;

  foreach v_job slice 1 in array v_jobs loop
    if exists (select 1 from cron.job where jobname = v_job[1]) then
      perform cron.unschedule(v_job[1]);
    end if;
    perform cron.schedule_in_database(
      v_job[1],
      v_job[2],
      v_job[3],
      current_database()
    );
  end loop;
end;
$$;

-- Preuve des privilèges du wrapper (motif 0074).
do $$
begin
  if has_function_privilege('anon', 'private.post_account_deletion_http(text)', 'EXECUTE') then
    raise exception 'anon ne doit pas pouvoir déclencher les appels HTTP de suppression';
  end if;
  if has_function_privilege('authenticated', 'private.post_account_deletion_http(text)', 'EXECUTE') then
    raise exception 'authenticated ne doit pas pouvoir déclencher les appels HTTP de suppression';
  end if;
  if not has_function_privilege('service_role', 'private.post_account_deletion_http(text)', 'EXECUTE') then
    raise exception 'service_role doit pouvoir exécuter le wrapper HTTP (cron)';
  end if;
end;
$$;

commit;
