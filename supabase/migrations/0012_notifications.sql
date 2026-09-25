-- 0012_notifications.sql
-- Alertes d'anniversaire : calcul des anniversaires du mois courant et des
-- sept prochains jours, et job quotidien correspondant.
--
-- AGENTS.md §5 (Anniversaires) et §6 (« alerte visuelle sur les anniversaires du
-- mois ») imposent une alerte. Le job calcule et RETOURNE les alertes à traiter ;
-- il n'émet aucun push tant que l'Edge Function d'envoi (`birthday-alerts`) et
-- la table d'abonnements Web Push n'existent pas. La fonction de dispatch lit
-- `push_endpoint` et `service_role_key` dans Vault au moment de l'exécution :
-- tant que `push_endpoint` est absent de Vault, rien n'est envoyé.
--
-- Aucun secret n'est inscrit dans `cron.job.command`, qui n'appelle qu'une
-- fonction du schéma privé sans paramètre — contrainte vérifiée par
-- `supabase/tests/0004_cron.sql`.
--
-- Installation idempotente : `cron.unschedule` puis
-- `cron.schedule_in_database(..., current_database())`, comme le bloc
-- équivalent de la migration 0011.

begin;

-- ---------------------------------------------------------------------------
-- Prochaine occurrence d'un anniversaire
--
-- Cas particulier du 29 février hors année bissextile : l'anniversaire est
-- ramené au 28 février, usage retenu par la plupart des applications de
-- calendrier. La fonction ne lit pas `now()` : la date de référence est
-- fournie par l'appelant, ce qui la rend testable et immuable.
-- ---------------------------------------------------------------------------
create or replace function private.next_birthday_date(
  p_birth_date date,
  p_from date
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month integer;
  v_day integer;
  v_year integer;
  v_last_day integer;
  v_candidate date;
begin
  if p_birth_date is null or p_from is null then
    return null;
  end if;

  v_month := extract(month from p_birth_date)::integer;
  v_day := extract(day from p_birth_date)::integer;
  v_year := extract(year from p_from)::integer;

  v_last_day := extract(
    day from (date_trunc('month', make_date(v_year, v_month, 1)) + interval '1 month - 1 day')
  )::integer;
  v_candidate := make_date(v_year, v_month, least(v_day, v_last_day));

  if v_candidate < p_from then
    v_year := v_year + 1;
    v_last_day := extract(
      day from (date_trunc('month', make_date(v_year, v_month, 1)) + interval '1 month - 1 day')
    )::integer;
    v_candidate := make_date(v_year, v_month, least(v_day, v_last_day));
  end if;

  return v_candidate;
end;
$$;

comment on function private.next_birthday_date(date, date) is
  'Prochaine occurrence d''un anniversaire, au plus tard p_from inclus.';

-- ---------------------------------------------------------------------------
-- Alertes d'anniversaire à traiter
--
-- `scope` = 'semaine' pour les sept prochains jours, 'mois' au-delà, jusqu'au
-- dernier jour du mois courant. Un anniversaire n'apparaît qu'une fois : la
-- fenêtre la plus large l'emporte, ce qui évite les doublons entre les deux
-- périmètres.
-- ---------------------------------------------------------------------------
create or replace function private.household_birthday_alerts(
  p_household_id text default null,
  p_today date default null
)
returns table (
  household_id text,
  birthday_id text,
  name text,
  linked_member_id text,
  member_name text,
  next_occurrence_date date,
  days_until integer,
  scope text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Europe/Paris')::date);
  v_horizon integer;
begin
  -- `p_household_id` n'est qu'un filtre, pas une frontière d'autorisation : la
  -- fonction n'est exécutable que par `service_role`. Toute autorisation
  -- passent par le foyer de l'appelant, vérifié en amont.
  -- Horizon = la plus lointaine des deux fenêtres : le mois courant restant, ou
  -- les sept prochains jours si le mois est presque terminé.
  v_horizon := greatest(
    7,
    extract(day from (date_trunc('month', v_today) + interval '1 month - 1 day'))::integer
      - extract(day from v_today)::integer
  );

  return query
  with upcoming as (
    select
      b.household_id,
      b.id as birthday_id,
      b.name,
      b.linked_member_id,
      m.display_name as member_name,
      private.next_birthday_date(b.birth_date, v_today) as next_date
    from public.birthdays b
    left join public.household_members m
      on m.id = b.linked_member_id
    where p_household_id is null or b.household_id = p_household_id
  )
  select
    u.household_id,
    u.birthday_id,
    u.name,
    u.linked_member_id,
    u.member_name,
    u.next_date,
    (u.next_date - v_today)::integer,
    case when u.next_date - v_today <= 7 then 'semaine' else 'mois' end
  from upcoming u
  where u.next_date between v_today and v_today + v_horizon
  order by u.next_date, u.household_id, u.name;
end;
$$;

comment on function private.household_birthday_alerts(text, date) is
  'Anniversaires du mois et des sept prochains jours, tous foyers confondus.';

-- ---------------------------------------------------------------------------
-- Dispatch quotidien
--
-- Tant que l'Edge Function d'envoi n'existe pas, la fonction se contente de
-- compter les alertes à traiter. L'activation est explicite : il faut déposer
-- `push_endpoint` dans Vault (et y placer `service_role_key`). Sans cela, rien
-- n'est envoyé — le calcul, lui, est déjà en place.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_birthday_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alerts integer;
  v_semaine integer;
  v_mois integer;
  v_endpoint text;
  v_key text;
  v_result jsonb;
begin
  select
    count(*)::integer,
    count(*) filter (where a.scope = 'semaine')::integer,
    count(*) filter (where a.scope = 'mois')::integer
    into v_alerts, v_semaine, v_mois
    from private.household_birthday_alerts() as a;

  v_result := jsonb_build_object(
    'alerts', v_alerts,
    'semaine', v_semaine,
    'mois', v_mois,
    'sent', 0,
    'generated_at', now()
  );

  if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net ou Vault absent : alertes calculées, aucun envoi.';
    return v_result;
  end if;

  select decrypted_secret into v_endpoint
    from vault.decrypted_secrets where name = 'push_endpoint';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_endpoint is null or v_key is null then
    raise notice 'push_endpoint / service_role_key absents de Vault : aucun envoi d''anniversaire.';
    return v_result;
  end if;

  perform net.http_post(
    url := rtrim(v_endpoint, '/') || '/functions/v1/birthday-alerts',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'date', (now() at time zone 'Europe/Paris')::date,
      'alerts', v_alerts
    ),
    timeout_milliseconds := 10000
  );

  return v_result || jsonb_build_object('sent', v_alerts);
end;
$$;

comment on function private.dispatch_birthday_alerts() is
  'Compte les alertes d''anniversaire et les distribue si Vault est configuré.';

-- ---------------------------------------------------------------------------
-- Installation du job (idempotente)
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobname text := 'eo-birthday-alerts';
  v_schedule text := '40 6 * * *';
  v_command text := 'select private.dispatch_birthday_alerts()';
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : job anniversaires non installé.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = v_jobname) then
    perform cron.unschedule(v_jobname);
  end if;

  perform cron.schedule_in_database(
    v_jobname,
    v_schedule,
    v_command,
    current_database()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges : usage serveur uniquement.
-- ---------------------------------------------------------------------------
revoke all on function private.next_birthday_date(date, date) from public, anon, authenticated;
revoke all on function private.household_birthday_alerts(text, date) from public, anon, authenticated;
revoke all on function private.dispatch_birthday_alerts() from public, anon, authenticated;

grant execute on function private.next_birthday_date(date, date) to service_role;
grant execute on function private.household_birthday_alerts(text, date) to service_role;
grant execute on function private.dispatch_birthday_alerts() to service_role;

commit;
