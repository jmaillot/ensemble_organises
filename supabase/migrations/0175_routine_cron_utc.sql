-- 0175_routine_cron_utc.sql
-- Correction vers l'avant de 0173 : le suffixe de fuseau n'est pas honoré.
--
--    0173 a re-planifié `eo-routine-maintenance` avec l'horaire
--    `5 6 * * * Europe/Paris`, supporté par l'EXTENSION pg_cron 1.6.4
--    (cron.schedule l'enregistre et le conserve — vérifié par sonde).
--    La mesure du 2026-11-02 sur prod le réfute à l'exécution : le run
--    quotidien est parti à 06:05:00 UTC, soit 07:05 Paris en heure d'hiver
--    (cron.job_run_details jobid=24, start_time at time zone 'Europe/Paris').
--    L'extension enregistre le suffixe, le bgworker de la stack l'ignore :
--    il ordonnance sur l'horaire nu, en UTC (le G de la base est UTC).
--
--    Ni 0011 ni 0173 ne sont réécrites (§2.7-A). Le job repasse en horaire
--    nu décalé : `5 4 * * *` = 06:05 Paris en heure d'été, 05:05 en hiver.
--    La dérive saisonnière d'une heure est le compromis assumé — l'objectif
--    de DET-01 est que l'occurrence du jour existe AVANT l'usage matinal
--    (le défaut d'origine était 08:05 Paris, constaté trop tard) ; 05-06 h
--    le satisfait toute l'année. Le fuseau d'affichage de l'app reste celui
--    du navigateur : rien côté données ne change, seul l'instant de
--    génération avance.
--
-- Le périmètre reste le job des routines. Les autres jobs quotidiens en
-- horaire nu sont hors scope (0173, même remarque).

begin;

do $$
begin
  if to_regclass('cron.job') is null then
    -- Garde durci après l'incident 0173 (§2.7-B) : pg_cron absent n'est pas
    -- une dégradation documentée ici, c'est une base qui n'a pas la pile
    -- attendue — on lève, on ne notifie pas.
    raise exception 'pg_cron absent : impossible de re-planifier eo-routine-maintenance';
  end if;

  if exists (select 1 from cron.job where jobname = 'eo-routine-maintenance') then
    perform cron.unschedule('eo-routine-maintenance');
  end if;
  perform cron.schedule_in_database(
    'eo-routine-maintenance',
    '5 4 * * *',
    'select private.run_daily_routine_maintenance()',
    current_database()
  );
end;
$$;

commit;
