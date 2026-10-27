-- 0162_gdpr_http_guard.sql
-- Phase 26 Plan 03 Task 1 (tracer) : garde-fou HTTP de post_gdpr_export_http.
--
-- POURQUOI CETTE MIGRATION (§2.7A — correction vers l'avant)
--   Le tracer du plan 26-03 a révélé l'échec de bout en bout : le job cron
--   `eo-gdpr-export-run` s'exécute (statut succeeded), mais `net._http_response`
--   reste vide et aucun job n'est jamais réclamé. Cause : le garde-fou de 0158
--   teste `to_regclass('net.http_post')` — or `net.http_post` est une FONCTION,
--   pas une relation, et `to_regclass` ne résout que des relations : le garde
--   est toujours faux, l'éveil HTTP meurt en silence.
--
--   C'est exactement la classe de défaut corrigée en 0024 pour le dispatch
--   push (0024 lignes 22-28 documentent le motif : `to_regclass` → NULL pour
--   une fonction, `to_regproc` le résout). 0158 a régressé sur le même point
--   en recopiant la forme 0011/0019. §2.7E : corriger la classe, pas
--   l'instance — ici le correctif applique le motif 0024 à la fonction GDPR.
--
--   `vault.decrypted_secrets` reste testé par `to_regclass` : c'est une vue,
--   le motif 0024 le documente.

begin;

create or replace function private.post_gdpr_export_http(p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_due_count integer;
begin
  -- Gardes : pg_net doit offrir sa FONCTION (to_regproc — motif 0024, une
  -- fonction n'est pas une relation) et Vault sa vue (to_regclass).
  if to_regproc('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
    raise notice 'pg_net ou Vault absent : envoi des jobs GDPR désactivé.';
    return false;
  end if;

  -- Lecture des secrets dans Vault (motif 0019 lignes 490-498).
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise warning 'Secrets Vault project_url / service_role_key absents : envoi ignoré.';
    return false;
  end if;

  -- Comptage conditionnel (forme 0019) : ne POSTer que s'il y a un travail dû.
  if p_action = 'run' then
    select count(*)::integer into v_due_count
      from public.gdpr_export_jobs
     where status in ('en_attente','en_cours')
       and (pass_started_at is null
             or pass_started_at < now() - interval '5 minutes');

    if v_due_count = 0 then
      return false;
    end if;
  elsif p_action = 'purge' then
    select count(*)::integer into v_due_count
      from public.gdpr_export_jobs
     where status in ('pret','echec')
       and expires_at < now();

    if v_due_count = 0 then
      return false;
    end if;
  else
    raise warning 'Action inconnue : %', p_action;
    return false;
  end if;

  -- Envoi HTTP : POST vers /functions/v1/gdpr-export-'action', corps {action},
  -- clé lue dans Vault — jamais dans cron.job.command (§2.7H).
  --
  -- La clé secrète va dans `apikey`, et JAMAIS dans `Authorization: Bearer`
  -- (motif 0025 : une clé `sb_*` présentée comme Bearer est prise pour un JWT
  -- et le framework répond 401 avant d'atteindre le corps — 0158 avait
  -- régressé sur ce point, corrigé ici).
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/gdpr-export-' || p_action,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', v_key
    ),
    body := jsonb_build_object('action', p_action),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;

-- Privilèges inchangés (posés en 0160) : service_role uniquement.
revoke all on function private.post_gdpr_export_http(text) from public, anon, authenticated;
grant execute on function private.post_gdpr_export_http(text) to service_role;

comment on function private.post_gdpr_export_http(text) is
  'Éveil HTTP de l''export RGPD (motif 0019, garde-fou corrigé en 0162 : to_regproc pour la fonction net.http_post — motif 0024). Lit Vault, ne POSTe que si un job est dû.';

commit;
