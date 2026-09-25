-- 0011_cron.sql
-- Tâches planifiées : génération des occurrences de routines, évaluation des
-- retards, purge des tokens expirés.
--
-- Fuseau : toutes les dates sont calculées explicitement en `Europe/Paris`
-- (`now() at time zone 'Europe/Paris'`), afin que le résultat ne dépende pas du
-- fuseau du conteneur `db`.
--
-- Base : `cron.schedule_in_database(..., current_database())` fixe explicitement
-- `database_name`, pour que le job reste attaché au bon `POSTGRES_DB` même si la
-- variable d'environnement change.
--
-- Secrets : aucun secret n'est inscrit dans `cron.job.command`. La fonction de
-- dispatch des notifications lit ses secrets dans Vault au moment de l'exécution.

begin;

-- ---------------------------------------------------------------------------
-- Extension pg_cron (fournie par l'image Supabase ; créée si absente)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension pg_cron;
    exception when others then
      raise notice 'pg_cron indisponible sur cette instance : les jobs ne sont pas installés.';
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expansion d'une règle RRULE (sous-ensemble documenté dans docs/BACKEND.md)
--
-- Supporté : FREQ DAILY / WEEKLY / MONTHLY / YEARLY, INTERVAL, COUNT, UNTIL,
-- BYDAY, BYMONTHDAY. Les autres clés (BYSETPOS, BYMONTH, BYHOUR…) sont
-- ignorées : le moteur complet reste côté client (rrule.js).
-- ---------------------------------------------------------------------------
create or replace function private.rrule_day_matches_core(
  p_rule text,
  p_start date,
  p_day date
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rule text;
  v_freq text := 'DAILY';
  v_interval integer := 1;
  v_byday text[] := '{}';
  v_bymonthday integer[] := '{}';
  v_until date;
  v_part text;
  v_key text;
  v_value text;
  v_dow_code text;
  v_diff integer;
begin
  if p_rule is null or p_day is null or p_day < p_start then
    return false;
  end if;

  v_rule := btrim(p_rule);
  if v_rule ilike 'RRULE:%' then
    v_rule := substr(v_rule, 7);
  end if;

  foreach v_part in array string_to_array(v_rule, ';') loop
    v_key := upper(btrim(split_part(v_part, '=', 1)));
    v_value := split_part(v_part, '=', 2);
    case v_key
      when 'FREQ' then
        v_freq := upper(btrim(v_value));
      when 'INTERVAL' then
        v_interval := greatest(coalesce(btrim(v_value)::integer, 1), 1);
      when 'UNTIL' then
        v_until := nullif(split_part(btrim(v_value), 'T', 1), '')::date;
      when 'BYDAY' then
        select coalesce(array_agg(upper(btrim(x))), '{}')
          into v_byday
          from unnest(string_to_array(v_value, ',')) as x
         where upper(btrim(x)) in ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
      when 'BYMONTHDAY' then
        select coalesce(array_agg(btrim(x)::integer), '{}')
          into v_bymonthday
          from unnest(string_to_array(v_value, ',')) as x;
      else
        null;
    end case;
  end loop;

  if v_until is not null and p_day > v_until then
    return false;
  end if;

  v_dow_code := (array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[extract(isodow from p_day)::integer];

  case v_freq
    when 'DAILY' then
      v_diff := (p_day - p_start);
      if v_diff % v_interval <> 0 then
        return false;
      end if;
      if cardinality(v_byday) > 0 and not (v_dow_code = any (v_byday)) then
        return false;
      end if;
    when 'WEEKLY' then
      v_diff := (p_day - date_trunc('week', p_start)::date) / 7;
      if v_diff % v_interval <> 0 then
        return false;
      end if;
      if cardinality(v_byday) > 0 then
        if not (v_dow_code = any (v_byday)) then
          return false;
        end if;
      elsif v_dow_code <> (array['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])[extract(isodow from p_start)::integer] then
        return false;
      end if;
    when 'MONTHLY' then
      v_diff := (extract(year from p_day)::integer - extract(year from p_start)::integer) * 12
              + (extract(month from p_day)::integer - extract(month from p_start)::integer);
      if v_diff % v_interval <> 0 then
        return false;
      end if;
      if cardinality(v_bymonthday) > 0 then
        if not (extract(day from p_day)::integer = any (v_bymonthday)) then
          return false;
        end if;
      elsif extract(day from p_day)::integer <> extract(day from p_start)::integer then
        return false;
      end if;
    when 'YEARLY' then
      v_diff := extract(year from p_day)::integer - extract(year from p_start)::integer;
      if v_diff % v_interval <> 0 then
        return false;
      end if;
      if extract(month from p_day)::integer <> extract(month from p_start)::integer
         or extract(day from p_day)::integer <> extract(day from p_start)::integer then
        return false;
      end if;
    else
      return false;
  end case;

  return true;
end;
$$;

-- Variante publique du prédicat : applique COUNT (rang de l'occurrence dans
-- la série). Fonction distincte pour éviter toute récursion.
create or replace function private.rrule_day_matches(
  p_rule text,
  p_start date,
  p_day date
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_count integer;
  v_part text;
  v_ordinal bigint;
begin
  if not private.rrule_day_matches_core(p_rule, p_start, p_day) then
    return false;
  end if;

  foreach v_part in array string_to_array(btrim(p_rule), ';') loop
    if upper(btrim(split_part(v_part, '=', 1))) = 'COUNT' then
      v_count := coalesce(btrim(split_part(v_part, '=', 2))::integer, null);
    end if;
  end loop;

  if v_count is null then
    return true;
  end if;

  -- Au-delà de 10 ans d'historique, le comptage linéaire deviendrait coûteux :
  -- COUNT est alors ignoré (une série de plus de 10 ans n'a pas d'occurrence
  -- materialisée de toute façon, la fenêtre étant de 14 jours).
  if (p_day - p_start) > 3650 then
    return true;
  end if;

  select count(*) into v_ordinal
    from generate_series(p_start, p_day, interval '1 day') as g(day)
   where private.rrule_day_matches_core(p_rule, p_start, g.day::date);

  return v_ordinal <= v_count;
end;
$$;

comment on function private.rrule_day_matches(text, date, date) is
  'Vrai si p_day est une occurrence de la règle RRULE p_rule démarrant le p_start.';

-- ---------------------------------------------------------------------------
-- Génération et évaluation des occurrences
-- ---------------------------------------------------------------------------
create or replace function private.generate_routine_occurrences(
  p_from date,
  p_to date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if p_from is null or p_to is null or p_to < p_from then
    return 0;
  end if;

  insert into public.routine_completions (routine_id, household_id, occurrence_date, status)
  select r.id, r.household_id, g.day::date, 'en_retard'
    from public.routines r
    cross join lateral generate_series(
      greatest(p_from, r.created_at::date),
      p_to,
      interval '1 day'
    ) as g(day)
   where private.rrule_day_matches(r.recurrence_rule, r.created_at::date, g.day::date)
     and not exists (
       select 1
         from public.routine_completions rc
        where rc.routine_id = r.id
          and rc.occurrence_date = g.day::date
     )
  on conflict (routine_id, occurrence_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function private.generate_routine_occurrences(date, date) is
  'Matérialise les occurrences dues sur la fenêtre demandée. Idempotente.';

create or replace function private.evaluate_routine_occurrences()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  -- Au-delà d'une semaine sans validation, l'occurrence est définitivement manquée.
  update public.routine_completions
     set status = 'manque'
   where status = 'en_retard'
     and occurrence_date < v_today - 7;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function private.run_daily_routine_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_generated integer;
  v_escalated integer;
begin
  v_generated := private.generate_routine_occurrences(v_today - 14, v_today);
  v_escalated := private.evaluate_routine_occurrences();
  raise notice 'occurrences générées : %, escalées en « manque » : %', v_generated, v_escalated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purge des tokens d'invitation expirés ou épuisés
-- ---------------------------------------------------------------------------
create or replace function private.prune_expired_invite_tokens()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.household_invite_tokens
     set is_active = false
   where is_active
     and (
       (expires_at is not null and expires_at <= now())
       or use_count >= max_uses
     );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch des notifications : lecture des secrets dans Vault.
--
-- Volontairement NON planifié tant que l'endpoint Web Push
-- (`functions/v1/daily-briefing`) et la table d'abonnements Web Push n'existent
-- pas. Le modèle est prêt : aucun secret en clair dans cron.job.command.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_daily_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_sent integer := 0;
begin
  if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net ou Vault absent : dispatch des notifications désactivé.';
    return 0;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : dispatch ignoré.';
    return 0;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/daily-briefing',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'date', (now() at time zone 'Europe/Paris')::date
    ),
    timeout_milliseconds := 10000
  );

  v_sent := 1;
  return v_sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Installation des jobs
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobs text[][] := array[
    array['eo-routine-maintenance', '5 6 * * *', 'select private.run_daily_routine_maintenance()'],
    array['eo-invite-token-prune', '20 6 * * *', 'select private.prune_expired_invite_tokens()']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs non installés.';
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

revoke all on function private.run_daily_routine_maintenance() from public, anon, authenticated;
revoke all on function private.generate_routine_occurrences(date, date) from public, anon, authenticated;
revoke all on function private.evaluate_routine_occurrences() from public, anon, authenticated;
revoke all on function private.prune_expired_invite_tokens() from public, anon, authenticated;
revoke all on function private.dispatch_daily_notifications() from public, anon, authenticated;
revoke all on function private.rrule_day_matches(text, date, date) from public, anon, authenticated;
revoke all on function private.rrule_day_matches_core(text, date, date) from public, anon, authenticated;

grant execute on function private.rrule_day_matches(text, date, date) to service_role;
grant execute on function private.rrule_day_matches_core(text, date, date) to service_role;

commit;
