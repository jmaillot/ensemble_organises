-- 0019_push_dispatch.sql
-- Rappels dus, rapport de livraison et planification de l'envoi Web Push.
--
-- CE QUE CETTE MIGRATION REMPLACE
--   `private.dispatch_daily_notifications()` (migration 0011) pointait vers une
--   fonction `daily-briefing` qui n'a jamais existé, et
--   `private.dispatch_birthday_alerts()` (0012) comptait les anniversaires sans
--   les distribuer. Les deux passent ici par un point d'entrée unique,
--   `push-notify`, appelé avec un `scope`. Une seule Edge Function à écrire, à
--   déployer et à surveiller, et un seul jeu de secrets.
--
--   Les deux fonctions sont remplacées à signature identique : les jobs
--   `eo-birthday-alerts` déjà installé par 0012 les appellent par leur nom, et
--   continue donc de fonctionner sans être redéployé.
--
-- UNE NOTIFICATION, UNE FOIS
--   Un rappel est une ligne de `task_reminders`, `event_reminders` ou
--   `routine_reminders`. Deux questions se posent : jusqu'à quand un rappel est-il
--   encore pertinent, et qu'est-ce qui empêche de le renvoyer ?
--
--   * La fenêtre : (maintenant − 24 h, maintenant]. Au-delà, le rappel est caduc
--     et le foyer ne doit pas être réveillé pour lui. Vingt-quatre heures
--     suffisent à faire rattraper un job raté.
--   * L'unicité : la ligne du rappel est SUPPRIMÉE dès qu'un envoi a réussi
--     (fonction `consume_push_reminders`). C'est ce qui empêche le doublon, et
--     non la fenêtre : deux passages consécutifs du job se recouvrent
--     volontairement, pour rattraper un envoi en retard. Un rappel dont aucun
--     appareil n'a pu le recevoir reste en place, et sera tenté au passage
--     suivant.
--
-- QUI REÇOIT QUOI
--   * tâche : chaque assignataire, et à défaut son créateur ;
--   * événement et routine : le créateur, et à défaut tous les membres du foyer.
--     Ces deux tables de rappel ne portent pas de destinataire, notifier tout le
--     foyer plutôt que la seule personne qui a saisi l'événement ;
--   * anniversaire : le membre concerné le jour même, et à défaut tous les
--     membres du foyer.
--   Un membre `enfant` sans compte n'est jamais destinataire : sans `user_id`,
--   il n'y a personne à notifier.
--
-- AUCUN SECRET EN CLAIR
--   `project_url` et `service_role_key` sont lus dans Vault au moment de
--   l'exécution, jamais inscrits dans `cron.job.command` — contrainte vérifiée
--   par `supabase/tests/0004_cron.sql`.

begin;

-- ---------------------------------------------------------------------------
-- Fenêtre de rappel
-- ---------------------------------------------------------------------------
create or replace function private.push_reminder_window(p_now timestamptz)
returns tstzrange
language sql
immutable
set search_path = ''
as $$
  -- Bornes (lower, upper] : un rappel dû exactement maintenant est retenu, un
  -- rappel plus vieux de vingt-quatre heures ne l'est plus.
  select tstzrange(coalesce(p_now, now()) - interval '24 hours', coalesce(p_now, now()), '(]');
$$;

comment on function private.push_reminder_window(timestamptz) is
  'Fenêtre des rappels encore pertinents : (maintenant − 24 h, maintenant].';

-- ---------------------------------------------------------------------------
-- Anniversaires du jour
--
-- Le jour même, et non la fenêtre d'aperçu : AGENTS.md §6 demande une alerte
-- VISUELLE sur le mois, ce qui est l'état d'interface du module
-- `/anniversaires`. La push, elle, n'a pas à répéter sept fois le même
-- anniversaire. Il n'existe d'ailleurs aucun rappel d'anniversaire en base :
-- cette source est recalculée à chaque job.
-- ---------------------------------------------------------------------------
create or replace function private.push_birthday_notifications(p_now timestamptz)
returns table (
  user_id uuid,
  reminder_id text,
  household_id text,
  title text,
  body text,
  url text,
  tag text,
  preference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (coalesce(p_now, now()) at time zone 'Europe/Paris')::date;
begin
  return query
  select
    m.user_id,
    a.birthday_id,
    a.household_id,
    'Anniversaire',
    case
      when a.member_name is null then a.name
      else a.name || ' fête son anniversaire'
    end,
    '/anniversaires',
    'anniversaire-' || a.birthday_id,
    -- Aucun interrupteur dédié : la date du jour n'est pas un rappel, et
    -- couper les notifications doit aussi couper l'annonce du jour.
    null::text
  from private.household_birthday_alerts(null, v_today) a
  join public.household_members m
    on m.household_id = a.household_id
   and m.user_id is not null
   and ((a.linked_member_id is not null and m.id = a.linked_member_id) or a.linked_member_id is null)
  where a.days_until = 0;
end;
$$;

comment on function private.push_birthday_notifications(timestamptz) is
  'Anniversaires du jour, destinataires résolus, tous foyers confondus.';

-- ---------------------------------------------------------------------------
-- Rappels de tâche, d'événement et de routine
-- ---------------------------------------------------------------------------
create or replace function private.push_reminder_notifications(p_now timestamptz)
returns table (
  user_id uuid,
  reminder_id text,
  household_id text,
  title text,
  body text,
  url text,
  tag text,
  preference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  -- Le CTE s'appelle `bounds` et non `window` : `window` est un MOT RÉSERVÉ de
  -- PostgreSQL (la clause des fonctions fenêtrées), et `with window as (…)`
  -- est refusé à l'analyse. Le premier jet employait ce nom, et l'erreur
  -- n'apparaissait qu'à l'exécution — 0018 étant déjà appliquée et 0019 seule
  -- en échec, la reprise ne rejoue que 0019.
  with bounds as (
    select private.push_reminder_window(p_now) as slot
  ), tasks as (
    select
      m.user_id,
      tr.id as reminder_id,
      t.household_id,
      'Tâche : ' || t.name as title,
      case
        when t.due_date is not null and nullif(btrim(coalesce(t.description, '')), '') is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM') || ' — ' || btrim(t.description)
        when t.due_date is not null
          then 'Échéance le ' || to_char(t.due_date, 'DD/MM')
        else btrim(coalesce(t.description, 'Sans date d''échéance.'))
      end as body,
      '/taches'::text as url,
      'tache-' || t.id as tag,
      'task'::text as preference
    from task_reminders tr
    join tasks t on t.id = tr.task_id
    cross join bounds w
    -- `lateral … on true` : zéro ligne si la tâche n'a aucun assignataire
    -- doté d'un compte, et le `coalesce` bascule alors sur le créateur.
    left join lateral (
      select ta.member_id
        from task_assignees ta
        join household_members assignee on assignee.id = ta.member_id
       where ta.task_id = t.id
         and assignee.user_id is not null
      order by ta.member_id
      limit 1
    ) assigned on true
    join household_members m on m.id = coalesce(assigned.member_id, t.created_by)
    where tr.remind_at <@ w.slot
      and t.status <> 'fait'
      and m.user_id is not null
  ), events as (
    select
      m.user_id,
      er.id as reminder_id,
      e.household_id,
      'Événement : ' || e.title as title,
      (case
         when e.all_day then 'Toute la journée'
         else to_char(e.start_at at time zone 'Europe/Paris', 'DD/MM à HH24:MI')
       end)
      || case
           when nullif(btrim(coalesce(e.location, '')), '') is null then ''
           else ' — ' || btrim(e.location)
         end as body,
      '/calendrier'::text as url,
      'evenement-' || e.id as tag,
      'event'::text as preference
    from event_reminders er
    join events e on e.id = er.event_id
    cross join bounds w
    join household_members m on m.household_id = e.household_id and m.user_id is not null
    where er.remind_at <@ w.slot
      -- Un événement déjà commencé n'a plus rien à annoncer.
      and e.start_at > coalesce(p_now, now())
      and (e.created_by is null or m.id = e.created_by)
  ), routines as (
    select
      m.user_id,
      rr.id as reminder_id,
      r.household_id,
      'Routine : ' || r.name as title,
      nullif(btrim(coalesce(r.description, '')), '') as body,
      '/routines'::text as url,
      'routine-' || r.id as tag,
      'routine'::text as preference
    from routine_reminders rr
    join routines r on r.id = rr.routine_id
    cross join bounds w
    join household_members m on m.household_id = r.household_id and m.user_id is not null
    where rr.remind_at <@ w.slot
      and (r.created_by is null or m.id = r.created_by)
  )
  select user_id, reminder_id, household_id, title, body, url, tag, preference from tasks
  union all
  select user_id, reminder_id, household_id, title, body, url, tag, preference from events
  union all
  select user_id, reminder_id, household_id, title, body, url, tag, preference from routines;
end;
$$;

comment on function private.push_reminder_notifications(timestamptz) is
  'Rappels dus dans la fenêtre, un couple (destinataire, rappel) par ligne.';

-- ---------------------------------------------------------------------------
-- Ce que la fonction d'envoi doit distribuer
--
-- Le `scope` sépare deux rythmes : un job toutes les quinze minutes pour les
-- rappels, un job quotidien au matin pour les anniversaires. Les mélanger
-- ferait quatre-vingt-seize envois par jour pour sept anniversaire.
-- ---------------------------------------------------------------------------
create or replace function public.due_push_notifications(
  p_scope text,
  p_now timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_notifications jsonb;
begin
  if p_scope is null or p_scope not in ('rappels', 'anniversaires', 'test') then
    raise exception 'portée inconnue : %', p_scope using errcode = '22023';
  end if;

  if p_scope = 'test' then
    -- Le message de test est ÉCRIT ICI, et non reçu du client. Un test
    -- construit à partir d'une requête aurait un contenu et un destinataire
    -- choisis par l'appelant : la fonction d'envoi deviendrait un service de
    -- messagerie, ouvert à quiconque possède une session. Les clés
    -- d'abonnement ne quittent de toute façon pas la base.
    if p_user_id is null then
      raise exception 'utilisateur obligatoire pour un test' using errcode = '22023';
    end if;
    v_notifications := jsonb_build_array(
      jsonb_build_object(
        'user_id', p_user_id,
        'reminder_id', null,
        'household_id', null,
        'title', 'Notifications activées',
        'body', 'Voici un rappel de test. Les rappels du foyer arriveront ici.',
        'url', '/parametres',
        'tag', 'test-' || left(p_user_id::text, 8),
        'preference', null
      )
    );
  elsif p_scope = 'anniversaires' then
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_birthday_notifications(v_now) n;
  else
    select coalesce(jsonb_agg(n), '[]'::jsonb) into v_notifications
      from private.push_reminder_notifications(v_now) n;
  end if;

  -- Les préférences sont appliquées ICI, et non dans chaque source : une liste
  -- préparée puis filtrée se lit, alors que trois conditions dispersées dans
  -- trois requêtes finissent par diverger.
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'user_id', n.user_id,
          'reminder_id', n.reminder_id,
          'household_id', n.household_id,
          'title', n.title,
          'body', n.body,
          'url', n.url,
          'tag', n.tag,
          'subscriptions', coalesce(
            (select jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'endpoint', s.endpoint,
                'p256dh', s.p256dh,
                'auth_secret', s.auth_secret
              ) order by s.created_at
            )
             from public.push_subscriptions s
             where s.user_id = n.user_id),
            '[]'::jsonb
          )
        ) order by n.title
      )
      from jsonb_to_recordset(v_notifications)
        as n(
          user_id uuid, reminder_id text, household_id text,
          title text, body text, url text, tag text, preference text
        )
      join public.profiles p on p.id = n.user_id
      where coalesce(
        case n.preference
          when 'task' then p.task_reminders_enabled
          when 'event' then p.event_reminders_enabled
          when 'routine' then p.routine_reminders_enabled
        end,
        true
      )
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.due_push_notifications(text, timestamptz, uuid) is
  'USAGE SERVEUR UNIQUEMENT. Notifications à distribuer et abonnements correspondants.';

-- ---------------------------------------------------------------------------
-- Consommation des rappels effectivement distribués
-- ---------------------------------------------------------------------------
create or replace function public.consume_push_reminders(p_reminders jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_row jsonb;
  v_kind text;
  v_id text;
  v_affected integer;
begin
  if p_reminders is null or jsonb_typeof(p_reminders) <> 'array' then
    return 0;
  end if;

  for v_row in select value from jsonb_array_elements(p_reminders) loop
    v_kind := v_row ->> 'kind';
    v_id := v_row ->> 'id';

    -- Un `kind` inconnu ne supprime rien : mieux vaut un rappel envoyé deux
    -- fois qu'un rappel d'une autre famille effacé par une faute de nommage.
    if v_id is null or v_kind is null then
      continue;
    end if;

    v_affected := 0;
    if v_kind = 'tache' then
      delete from public.task_reminders where id = v_id;
    elsif v_kind = 'evenement' then
      delete from public.event_reminders where id = v_id;
    elsif v_kind = 'routine' then
      delete from public.routine_reminders where id = v_id;
    else
      continue;
    end if;
    get diagnostics v_affected = row_count;
    v_deleted := v_deleted + v_affected;
  end loop;

  return v_deleted;
end;
$$;

comment on function public.consume_push_reminders(jsonb) is
  'USAGE SERVEUR UNIQUEMENT. Retire les rappels effectivement distribués.';

-- ---------------------------------------------------------------------------
-- Rapport de livraison
-- ---------------------------------------------------------------------------
create or replace function public.record_push_deliveries(
  p_results jsonb,
  p_failure_threshold integer default 10
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivered integer := 0;
  v_dropped integer := 0;
  v_failed integer := 0;
  v_row jsonb;
  v_id text;
  v_ok boolean;
  v_status integer;
  v_permanent boolean;
  v_threshold integer := greatest(coalesce(p_failure_threshold, 10), 1);
begin
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    return jsonb_build_object('delivered', 0, 'dropped', 0, 'failed', 0);
  end if;

  for v_row in select value from jsonb_array_elements(p_results) loop
    v_id := v_row ->> 'id';
    v_ok := coalesce((v_row ->> 'delivered')::boolean, false);
    v_status := nullif(v_row ->> 'status', '')::integer;
    -- 404 et 410 sont les deux réponses par lesquelles un service Push déclare
    -- un endpoint définitivement mort. La décision vient du service : la
    -- fonction ne devine pas, elle n'interprète que ces deux codes.
    v_permanent := coalesce((v_row ->> 'permanent')::boolean, v_status in (404, 410));

    if v_id is null then
      continue;
    end if;

    if v_permanent then
      delete from public.push_subscriptions where id = v_id;
      v_dropped := v_dropped + 1;
    elsif v_ok then
      update public.push_subscriptions
         set last_success_at = now(),
             failure_count = 0,
             last_status = v_status,
             updated_at = now()
       where id = v_id;
      v_delivered := v_delivered + 1;
    else
      -- Un endpoint qui échoue dix fois de suite n'est pas un incident isolé :
      -- c'est un appareil deserté. Le garder conduirait à le réessayer
      -- quatre fois par heure, pour rien.
      update public.push_subscriptions
         set failure_count = failure_count + 1,
             last_status = v_status,
             updated_at = now()
       where id = v_id;
      v_failed := v_failed + 1;

      if (select failure_count from public.push_subscriptions where id = v_id) >= v_threshold then
        delete from public.push_subscriptions where id = v_id;
        v_dropped := v_dropped + 1;
        v_failed := v_failed - 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('delivered', v_delivered, 'dropped', v_dropped, 'failed', v_failed);
end;
$$;

comment on function public.record_push_deliveries(jsonb, integer) is
  'USAGE SERVEUR UNIQUEMENT. Consigne les envois et supprime les endpoints morts.';

-- ---------------------------------------------------------------------------
-- Envoi
-- ---------------------------------------------------------------------------
create or replace function private.post_push_dispatch(p_scope text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net ou Vault absent : envoi des notifications désactivé.';
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

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/push-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('scope', p_scope),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;

comment on function private.post_push_dispatch(text) is
  'POST /functions/v1/push-notify, clé secrète lue dans Vault.';

-- Le job n'appelle la fonction d'envoi que s'il a quelque chose à distribuer :
-- sans quoi la stack se réveille quatre fois par heure pour rien.
create or replace function private.dispatch_push_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('rappels')) as n(notification jsonb)
   where jsonb_array_length(n.notification -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('rappels');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_push_notifications() is
  'Rappels dus : n''appelle la fonction d''envoi que s''il y a des destinataires.';

-- Remplace la version de 0012 : même signature, même job, mais la fonction
-- d'envoi existe et l'anniversaire n'est annoncé que le jour même.
create or replace function private.dispatch_birthday_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due integer;
  v_sent boolean;
begin
  select count(*)::integer into v_due
    from jsonb_array_elements(public.due_push_notifications('anniversaires')) as n(notification jsonb)
   where jsonb_array_length(n.notification -> 'subscriptions') > 0;

  if v_due = 0 then
    return jsonb_build_object('due', 0, 'dispatched', false, 'generated_at', now());
  end if;

  v_sent := private.post_push_dispatch('anniversaires');

  return jsonb_build_object('due', v_due, 'dispatched', v_sent, 'generated_at', now());
end;
$$;

comment on function private.dispatch_birthday_alerts() is
  'Anniversaires du jour : distribués si des membres sont abonnés.';

-- ---------------------------------------------------------------------------
-- Nettoyage des abonnements inactifs
--
-- `eo-daily-notifications` n'a jamais été installé — 0011 créait la fonction
-- sans programmer le job. Il est désinstallé ici par précaution : un runbook
-- ne doit pas décrire un job inexistant, et une installation manuelle ne doit
-- pas survivre à la migration.
-- ---------------------------------------------------------------------------
create or replace function private.prune_inactive_push_subscriptions(p_older_than interval default interval '180 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
  v_limit interval := coalesce(p_older_than, interval '180 days');
begin
  -- Six mois sans envoi réussi : l'appareil a été révoqué, ou le navigateur a
  -- rendu les siens. Le service Push ne le signale pas dans ce cas — seule la
  -- date le montre.
  delete from public.push_subscriptions
   where created_at < now() - v_limit
     and (last_success_at is null or last_success_at < now() - v_limit);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function private.prune_inactive_push_subscriptions(interval) is
  'Supprime les abonnements sans envoi réussi depuis six mois par défaut.';

-- ---------------------------------------------------------------------------
-- Planification (idempotente)
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobname text;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : job d''envoi des notifications non installé.';
    return;
  end if;

  foreach v_jobname in array array['eo-daily-notifications', 'eo-birthday-alerts', 'eo-push-dispatch', 'eo-push-prune'] loop
    if exists (select 1 from cron.job where jobname = v_jobname) then
      perform cron.unschedule(v_jobname);
    end if;
  end loop;

  perform cron.schedule_in_database(
    'eo-birthday-alerts', '40 6 * * *',
    'select private.dispatch_birthday_alerts()',
    current_database()
  );

  -- Quinze minutes : la granularité d'un rappel est de l'ordre de la minute, et
  -- la fenêtre de 24 h rend automatique la reprise d'un job raté.
  perform cron.schedule_in_database(
    'eo-push-dispatch', '*/15 * * * *',
    'select private.dispatch_push_notifications()',
    current_database()
  );

  perform cron.schedule_in_database(
    'eo-push-prune', '30 6 * * *',
    'select private.prune_inactive_push_subscriptions()',
    current_database()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges
--
-- `create or replace` recrée les ACL : l'EXECUTE par défaut de `PUBLIC` est
-- explicitement retiré, comme pour les fonctions serveur de 0009.
-- ---------------------------------------------------------------------------
revoke all on function private.push_reminder_window(timestamptz) from public, anon, authenticated;
revoke all on function private.push_birthday_notifications(timestamptz) from public, anon, authenticated;
revoke all on function private.push_reminder_notifications(timestamptz) from public, anon, authenticated;
revoke all on function private.post_push_dispatch(text) from public, anon, authenticated;
revoke all on function private.dispatch_push_notifications() from public, anon, authenticated;
revoke all on function private.dispatch_birthday_alerts() from public, anon, authenticated;
revoke all on function private.prune_inactive_push_subscriptions(interval) from public, anon, authenticated;
revoke all on function public.due_push_notifications(text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.consume_push_reminders(jsonb) from public, anon, authenticated;
revoke all on function public.record_push_deliveries(jsonb, integer) from public, anon, authenticated;

grant execute on function private.push_reminder_window(timestamptz) to service_role;
grant execute on function private.push_birthday_notifications(timestamptz) to service_role;
grant execute on function private.push_reminder_notifications(timestamptz) to service_role;
grant execute on function private.post_push_dispatch(text) to service_role;
grant execute on function private.dispatch_push_notifications() to service_role;
grant execute on function private.dispatch_birthday_alerts() to service_role;
grant execute on function private.prune_inactive_push_subscriptions(interval) to service_role;
grant execute on function public.due_push_notifications(text, timestamptz, uuid) to service_role;
grant execute on function public.consume_push_reminders(jsonb) to service_role;
grant execute on function public.record_push_deliveries(jsonb, integer) to service_role;

commit;
