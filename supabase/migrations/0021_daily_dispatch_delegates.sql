-- 0021_daily_dispatch_delegates.sql
-- `private.dispatch_daily_notifications()` délègue au dispatch des rappels.
--
-- POURQUOI UNE NOUVELLE MIGRATION
--   0011 est appliquée et ne sera plus modifiée ; c'est en exécutant la base
--   que le défaut est apparu.
--
-- LE DÉFAUT : UNE FONCTION MORTE QUI APPELLE UN ENDPOINT FANTÔME
--   La migration 0011 a créé `private.dispatch_daily_notifications()`, dont le
--   corps fait un `net.http_post` vers `functions/v1/daily-briefing`. Cette
--   fonction Edge n'a jamais existé. Aucun job ne l'appelle — 0011 l'a créée
--   sans programmer le job, et 0019 désinstalle un éventuel
--   `eo-daily-notifications` — mais elle reste dans le catalogue, et
--   `0004_cron.sql` affirmait à tort qu'elle ne référençait plus cet endpoint.
--   C'est cette affirmation, et non la fonction, qui a menti : le test
--   échouait sur un état que le code n'a jamais atteint.
--
--   Trois issues étaient possibles, une seule est défendable :
--     * laisser la fonction — un nom qui promet une distribution, pointé vers
--       un endpoint inexistant, que le prochain lecteur prendra pour vivant ;
--     * la supprimer — possible, mais nous n'avons pas su énumérer tous ses
--       appelants, et la retirer ferait échouer le premier venu ;
--     * la faire déléguer au dispatch des rappels, qui est le même travail sous
--       son nom actuel. Le corps n'est alors écrit qu'une fois, l'ancien nom
--       continue de fonctionner, et l'endpoint fantôme disparaît du dépôt.
--
-- LE `DROP` N'EST PAS UN DÉTAIL, C'EST LA SEULE FAÇON
--   0011 déclare cette fonction `returns integer`. Or `create or replace`
--   refuse de changer le type de retour d'une fonction existante :
--   « cannot change return type of existing function ». Écrire le `create or
--   replace` sans ce `drop` ferait échouer la migration entière, en
--   transaction, sur une base déjà peuplée.
--
--   Le `drop` est sans risque ici, et vérifiable : la fonction est
--   `service_role` seule, aucun job pg_cron ne l'appelle, aucune Edge Function
--   ni script du dépôt ne la mentionne. Seuls sa définition, `0004_cron.sql` et
--   la documentation en parlent. Le `drop` et le `create` sont dans la même
--   transaction : il n'existe aucun instant où la fonction est absente.
--
-- Le contrat de retour change donc avec le corps : `{due, dispatched,
-- generated_at}`, comme les deux autres dispatchs. `0006_birthdays.sql` est
-- aligné sur le nouveau contrat dans le même commit.

begin;

drop function private.dispatch_daily_notifications();

create function private.dispatch_daily_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.dispatch_push_notifications();
end;
$$;

comment on function private.dispatch_daily_notifications() is
  'Ancien nom du dispatch des notifications. Délègue à private.dispatch_push_notifications().';

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- `security definer` : la fonction n'est atteignable que par `service_role`,
-- c'est-à-dire par les jobs pg_cron et les Edge Functions. Le client ne l'a
-- jamais appelée directement, et ne le doit pas.
--
-- Le `revoke` sur `public` n'est pas symbolique : une fonction créée sans
-- `revoke` accorde EXECUTE à PUBLIC, c'est-à-dire à `anon` et `authenticated`.
-- ---------------------------------------------------------------------------
revoke all on function private.dispatch_daily_notifications() from public, anon, authenticated;
grant execute on function private.dispatch_daily_notifications() to service_role;

commit;
