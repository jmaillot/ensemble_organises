-- supabase/tests/0165_gdpr_purge_cloture.sql
-- Tests pour la CLÔTURE DE PURGE (CR-01, phase 26 — correction vers l'avant).
--
-- Le défaut : les lignes `gdpr_export_jobs` n'étaient jamais supprimées après
-- purge ; les jobs déjà purgés (zéro chemin restant) réoccupaient à vie la
-- fenêtre des 50 candidats de `fetchCandidates` (tri ascendant = les plus
-- vieux d'abord) — au 51ᵉ export expiré, la purge cessait définitivement de
-- fonctionner (RGEX-04 violée en silence). La correction vit dans l'Edge
-- `gdpr-export-purge` : un job sans chemin restant est CLÔTURÉ (ligne
-- supprimée). Ce fichier prouve en SQL le mécanisme qui rend la correction
-- juste, sur le cas qui doit échouer avant elle (§2.7) :
--   1. 50 jobs expirés déjà purgés (audit `removed=true`) + un 51ᵉ plus
--      récent : la fenêtre des 50 candidats EXCLUT le 51ᵉ (l'état du bug).
--   2. La clôture (delete des jobs entièrement purgés, tel que le fait
--      désormais l'Edge) est possible malgré la FK de `gdpr_export_purge_log`
--      — l'audit survit (`on delete set null`, preuve RGEX-04 conservée).
--   3. Après clôture, la fenêtre des 50 candidats contient le 51ᵉ job.
--
-- Comptages bornés au semis (§2.7D : en postgres, la RLS est court-circuitée,
-- tout comptage est borné à la main — ici par `user_id` du semis).

begin;

-- ---------------------------------------------------------------
-- Semis : 50 jobs expirés déjà purgés + un 51ᵉ expiré plus récent.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := testkit.auth_user('t165-alice@example.fr', 'Alice 165');
  purged_id uuid;
  new_job uuid;
  i int;
begin
  for i in 1..50 loop
    insert into public.gdpr_export_jobs (user_id, status, expires_at)
    values (alice, 'pret', now() - interval '10 days')
    returning id into purged_id;
    -- Le passage de purge a prouvé la suppression de l'archive (audit RGEX-04).
    insert into public.gdpr_export_purge_log (job_id, storage_path, removed)
    values (purged_id, alice::text || '/' || purged_id || '.zip', true);
  end loop;

  -- Le 51ᵉ export expiré : plus récent, donc ÉJECTÉ de la fenêtre des 50
  -- candidats tant que les jobs déjà purgés occupent le plafond.
  insert into public.gdpr_export_jobs (user_id, status, expires_at)
  values (alice, 'pret', now() - interval '1 day')
  returning id into new_job;

  insert into testkit.fx (key, user_id, row_id)
  values ('alice', alice, new_job::text);
end;
$$;

-- ---------------------------------------------------------------
-- 1. ÉTAT DU BUG : la fenêtre des 50 candidats (requête de fetchCandidates,
--    bornée au semis) exclut le 51ᵉ job expiré.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  new_job uuid := (select row_id from testkit.fx where key = 'alice')::uuid;
  v_in_window int;
begin
  perform testkit.eq(testkit.count(format(
    'select 1 from public.gdpr_export_jobs j where j.user_id = %L'
    || ' and j.status in (''pret'', ''echec'') and j.expires_at < now()'
    || ' order by j.expires_at asc limit 50', alice)), 50::bigint,
    'avant clôture : la fenêtre des 50 candidats est pleine (jobs déjà purgés)');
  select count(*)::int into v_in_window
    from (select j.id from public.gdpr_export_jobs j
           where j.user_id = alice
             and j.status in ('pret', 'echec') and j.expires_at < now()
           order by j.expires_at asc limit 50) w
   where w.id = new_job;
  perform testkit.eq(v_in_window, 0,
    'avant clôture : le 51ᵉ job expiré est EXCLU de la fenêtre (CR-01 reproduit)');
end;
$$;

-- ---------------------------------------------------------------
-- 2. CLÔTURE (ce que fait désormais l'Edge pour chaque job sans chemin
--    restant) : le delete passe malgré la FK d'audit, et l'audit SURVIT
--    (job_id nullifié, storage_path conservé — preuve RGEX-04).
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
begin
  -- Les 50 jobs dont expires_at < now() - 5 jours sont les jobs déjà purgés
  -- du semis (le 51ᵉ est à now() - 1 jour) : l'Edge les clôture un à un.
  delete from public.gdpr_export_jobs
   where user_id = alice and expires_at < now() - interval '5 days';
  perform testkit.eq(testkit.count(format(
    'select 1 from public.gdpr_export_jobs j where j.user_id = %L'
    || ' and j.expires_at < now() - interval ''5 days''', alice)), 0::bigint,
    'clôture : les 50 jobs purgés sont supprimés');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.gdpr_export_purge_log l where l.storage_path like %L'
    || ' and l.removed = true', alice::text || '/%')), 50::bigint,
    'l''audit de purge SURVIT à la clôture (50 lignes removed=true)');
  perform testkit.eq(testkit.count(format(
    'select 1 from public.gdpr_export_purge_log l where l.storage_path like %L'
    || ' and l.job_id is not null', alice::text || '/%')), 0::bigint,
    'l''audit survit avec job_id nullifié (on delete set null, 0158)');
end;
$$;

-- ---------------------------------------------------------------
-- 3. APRÈS clôture : la fenêtre des 50 candidats contient le 51ᵉ job —
--    la purge fonctionne à nouveau (RGEX-04 respecté au-delà de 50 exports).
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  new_job uuid := (select row_id from testkit.fx where key = 'alice')::uuid;
  v_in_window int;
begin
  select count(*)::int into v_in_window
    from (select j.id from public.gdpr_export_jobs j
           where j.user_id = alice
             and j.status in ('pret', 'echec') and j.expires_at < now()
           order by j.expires_at asc limit 50) w
   where w.id = new_job;
  perform testkit.eq(v_in_window, 1,
    'après clôture : le 51ᵉ job expiré EST candidat (la purge ne cale plus)');
end;
$$;

rollback;
