-- 0087_calendrier_refresh_cron.sql
-- Phase 01 calendrier, D-14 : refresh du cache feries/vacances deux fois par
-- an (janvier = annee en cours, septembre = rentree), en heure Europe/Paris,
-- via la Edge `refresh-calendrier-ref` appelee serveur-seul.
--
-- FUSEAU (verifie sur la stack au plan : `show cron.timezone` = GMT) :
-- `cron.schedule` s'evalue dans le fuseau du serveur pg_cron, donc les heures
-- sont decalees pour viser 04h00 Europe/Paris :
-- - 1er janvier (CET, UTC+1) : 03h00 GMT = 04h00 Paris ;
-- - 1er septembre (CEST, UTC+2) : 02h00 GMT = 04h00 Paris.
-- Si `cron.timezone` passe un jour a Europe/Paris, ces deux planifications
-- devront revenir a `0 4 1 1 *` / `0 4 1 9 *`.
--
-- SECRETS (AGENTS.md 2.7H, motifs 0011/0024/0025) : aucun secret en clair
-- dans `cron.job.command` (les deux jobs sont de nus
-- `select private.dispatch_calendrier_refresh()`). La fonction lit
-- `project_url` / `service_role_key` dans Vault au moment de l'execution,
-- teste `net.http_post` avec `to_regproc` (une fonction, pas une relation) et
-- envoie la cle dans l'en-tete `apikey`, jamais en Bearer (0025).
--
-- Discipline (AGENTS.md 2.7A) : SECURITY DEFINER, `search_path = ''`,
-- tables `public.*` qualifiees, variables `v_` (pas de collision
-- returns-table, controle statique n°4), REVOKE final. Pas de DML+ALTER
-- combinee (controle n°8) : fonction puis jobs, sans ALTER de table.

begin;

-- ---------------------------------------------------------------------------
-- Dispatch serveur : Vault a l'execution, inertie propre si stack incomplète.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_calendrier_refresh()
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
  -- Une FONCTION se demande au catalogue avec `to_regproc` (0024) : `to_regclass`
  -- repond NULL devant `net.http_post` et rendrait le dispatch inerte.
  if to_regproc('net.http_post') is null then
    raise notice 'pg_net absent (net.http_post introuvable) : dispatch calendrier desactive.';
    return 0;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Vault absent (vault.decrypted_secrets introuvable) : dispatch calendrier desactive.';
    return 0;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : dispatch calendrier ignore.';
    return 0;
  end if;

  -- La cle secrete va dans `apikey`, jamais en Bearer (0025 : Bearer + cle
  -- = 401 UNUSABLE_CREDENTIAL avant le corps de la fonction).
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/refresh-calendrier-ref',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', v_key
    ),
    body := jsonb_build_object(
      'date', (now() at time zone 'Europe/Paris')::date
    ),
    timeout_milliseconds := 30000
  );

  v_sent := 1;
  return v_sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Jobs janvier + septembre, 04h00 Europe/Paris (voir entete pour le decalage).
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobs text[][] := array[
    array['eo-calendrier-refresh-jan', '0 3 1 1 *', 'select private.dispatch_calendrier_refresh()'],
    array['eo-calendrier-refresh-sept', '0 2 1 9 *', 'select private.dispatch_calendrier_refresh()']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs calendrier non installes.';
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

revoke all on function private.dispatch_calendrier_refresh() from public, anon, authenticated;
grant execute on function private.dispatch_calendrier_refresh() to service_role;

commit;
