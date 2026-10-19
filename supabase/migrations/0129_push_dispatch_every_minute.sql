-- supabase/migrations/0129_push_dispatch_every_minute.sql
-- Phase 09 — l'envoi des rappels passe d'un rythme de quinze minutes à la
-- minute (décision produit du 2026-10-19 : un rappel posé à 16:28 doit partir
-- à 16:29, pas à 16:30).
--
-- `0019` n'est pas réécrite : elle reste le récit de la planification
-- initiale, et sa section de planification est idempotente — elle réinstalle
-- `*/15` à chaque application. Cette migration rejoue donc le même geste dans
-- le sens nouveau, plutôt que de modifier une ligne existante.
--
-- Coût d'un passage : `private.dispatch_push_notifications()` compte d'abord
-- les rappels dus et n'appelle l'Edge Function que si au moins un
-- destinataire existe (`0019:519-541`). Sans rappel dû, c'est une lecture
-- d'index ; la fonction d'envoi n'est pas réveillée.
--
-- Répétition : un rappel n'est consommé que si un appareil l'a réellement
-- reçu (`push-notify/index.ts:292-296`). Un foyer dont les téléphones sont
-- éteints voit donc son rappel retenté à chaque passage, pendant la fenêtre
-- de 24 h ; un endpoint qui échoue dix fois de suite est supprimé par
-- `record_push_deliveries`, ce qui borne la répétition.

begin;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : cadence d''envoi des rappels non modifiée.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'eo-push-dispatch') then
    perform cron.unschedule('eo-push-dispatch');
  end if;

  perform cron.schedule_in_database(
    'eo-push-dispatch', '* * * * *',
    'select private.dispatch_push_notifications()',
    current_database()
  );
end;
$$;

commit;
