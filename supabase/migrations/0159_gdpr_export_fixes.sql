-- 0159_gdpr_export_fixes.sql
-- Corrections vers l'avant de 0158_gdpr_export.sql (§2.7A : jamais de réécriture).
--
-- POURQUOI CETTE MIGRATION
--   Les tests de contrat 0001_schema_contract.sql et 0004_cron.sql ont révélé
--   deux non-conformités dans 0158 :
--
--   1. `gdpr_export_purge_log` a RLS activée mais ZÉRO politique : le test
--      0001 détecte cette incohérence. La table est une preuve RGEX-04 lisible
--      par la base et l'opérateur, jamais par le navigateur — la correction
--      ajoute l'exemption au test (motif existant : household_invite_tokens,
--      push_subscriptions, message_notifications… tables serveur uniquement).
--
--   2. Les jobs cron `eo-gdpr-export-run` et `eo-gdpr-export-purge` appellent
--      `private.post_gdpr_export_http('run')` et `post_gdpr_export_http('purge')`
--      avec un paramètre de chaîne — le test 0004 lignes 182-189 impose que les
--      jobs n'appellent QUE des fonctions privées SANS paramètre (regex
--      `^select private\.[a-z_]+\(\)$`), garantie qu'aucune valeur n'est
--      recopiée dans le catalogue. La correction crée deux fonctions wrapper
--      sans paramètre (`private.dispatch_gdpr_export_run()` et
--      `private.dispatch_gdpr_export_purge()`) qui délèguent à
--      `post_gdpr_export_http`, puis réinstalle les jobs avec ces wrappers.
--
-- Corrections vers l'avant uniquement (§2.7A), search_path vide, noms qualifiés.

begin;

-- ---------------------------------------------------------------------------
-- 1. Wrappers sans paramètre pour les jobs cron (conformité test 0004)
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_gdpr_export_run()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent boolean;
begin
  v_sent := private.post_gdpr_export_http('run');
  return jsonb_build_object('action', 'run', 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_gdpr_export_run() is
  'Wrapper sans paramètre pour eo-gdpr-export-run : délègue à post_gdpr_export_http(''run'').';

create or replace function private.dispatch_gdpr_export_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent boolean;
begin
  v_sent := private.post_gdpr_export_http('purge');
  return jsonb_build_object('action', 'purge', 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_gdpr_export_purge() is
  'Wrapper sans paramètre pour eo-gdpr-export-purge : délègue à post_gdpr_export_http(''purge'').';

-- Privilèges : fonctions privées réservées à service_role (conformité test 0001).
revoke all on function private.post_gdpr_export_http(text) from public, anon, authenticated;
grant execute on function private.post_gdpr_export_http(text) to service_role;

revoke all on function private.dispatch_gdpr_export_run() from public, anon, authenticated;
grant execute on function private.dispatch_gdpr_export_run() to service_role;

revoke all on function private.dispatch_gdpr_export_purge() from public, anon, authenticated;
grant execute on function private.dispatch_gdpr_export_purge() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Réinstallation des jobs cron avec les wrappers sans paramètre
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobs text[][] := array[
    array['eo-gdpr-export-run', '* * * * *', 'select private.dispatch_gdpr_export_run()'],
    array['eo-gdpr-export-purge', '27 4 * * *', 'select private.dispatch_gdpr_export_purge()']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs GDPR non réinstallés.';
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

commit;
