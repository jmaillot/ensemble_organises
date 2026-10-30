-- 0173_routine_cron_fix.sql
-- Correction vers l'avant de la cause racine tranchée par le diagnostic
-- DET-01 (phase 30, plan 30-01) — hypothèse H2 : fuseau.
--
--    Le job `eo-routine-maintenance` était planifié `5 6 * * *` SANS fuseau :
--    pg_cron interprète un horaire nu en UTC, si bien que la maintenance
--    tournait à 06:05 UTC = 08:05 heure de Paris. Les occurrences du jour
--    n'existaient donc qu'à partir de 08 h 05 — un usage matinal avant cette
--    heure voyait « les routines ne s'alimentent pas au quotidien ». Les
--    mesures le prouvent : cron.job_run_details montre start_time
--    2026-10-30 06:05:00+00 sur une base en UTC.
--
--    Le job est re-planifié avec le fuseau explicite `Europe/Paris`, supporté
--    dans la chaîne de l'horaire depuis pg_cron 1.5 (instance en 1.6.4,
--    vérifié par sonde : cron.schedule accepte et conserve
--    `5 6 * * * Europe/Paris`). Ni 0011 ni aucune migration appliquée n'est
--    réécrite (§2.7-A) : on désinstalle puis réinstalle le job, gabarit
--    idempotent de 0011:375-385.
--
-- Le périmètre reste le job des routines (DET-01). Les autres jobs quotidiens
-- en horaire nu sont hors scope de cette phase.

begin;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : job non re-planifié.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'eo-routine-maintenance') then
    perform cron.unschedule('eo-routine-maintenance');
  end if;
  perform cron.schedule_in_database(
    'eo-routine-maintenance',
    '5 6 * * * Europe/Paris',
    'select private.run_daily_routine_maintenance()',
    current_database()
  );
end;
$$;
