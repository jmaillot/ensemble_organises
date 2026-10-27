-- 0158_gdpr_export.sql
-- Phase 26 Plan 02 : Export RGPD — socle SQL complet (bucket, jobs, extraction,
-- driver cron).
--
-- POURQUOI CETTE MIGRATION
--   Un membre avec session (D-08, phase 25 : seuls les comptes réels exportent ;
--   les enfants gérés n'ont pas de compte, invariant 0145) demande et obtient
--   l'archive complète de ses données personnelles (JSON structuré + médias, ZIP)
--   par un lien signé sur un bucket privé `gdpr-exports` qui expire (≤ 24 h), sans
--   bloquer l'application et sans jamais livrer la donnée d'un autre membre.
--
--   La portée exacte de l'export a été tranchée en phase 26 plan 01 (checkpoint
--   bloquant humain, consigné dans 26-SPEC-DECISION.md) : Option A « Ce qui me
--   concerne » — profil + créations (created_by, paid_by, author_id) + attributions
--   (task_assignees, routine_assignees) + participations ardoise
--   (expense_participants) + médias personnels. Fusion multi-foyers : une seule
--   archive ZIP, tous les foyers du demandeur confondus. 22 modules listés mot
--   pour mot dans 26-SPEC-DECISION.md. Cette migration applique cette portée
--   tranchée, elle ne la réinterprète pas.
--
--   Le job est asynchrone (statut visible, notification push à l'achèvement par
--   la chaîne existante `dispatch_messages` → `push-notify`), et le contenu du
--   bucket est purgé à 7 jours par le pg_cron existant. Le driver du job est le
--   cron-minute existant (chaque passage ≤ 60 s, idempotent, relancé à la minute) :
--   un passage tué par le timeout est naturellement redriven (contrainte worker
--   150 Mo / 60 s de supabase-project/volumes/functions/main/index.ts:203-204,
--   vérifiée dans le dépôt, impose un job multipasse).
--
-- MOTIFS ASSEMBLÉS (5, dans cet ordre)
--   1. Bucket + politiques (0010 lignes 13-58) : privé, scellé sur le préfixe
--      <user_id>/ (la borne est le demandeur D-08, pas le foyer) ; aucune
--      politique insert/update/delete client — l'écriture vit exclusivement côté
--      backend (clé secrète court-circuite la RLS, §2.6).
--   2. Table `public.gdpr_export_jobs` + index unique partiel (D-06 : un actif
--      par membre) + RLS select propre uniquement (aucune écriture client).
--   3. Table d'audit de purge `public.gdpr_export_purge_log` (preuve RGEX-04
--      lisible par la base et l'opérateur, jamais par le navigateur).
--   4. RPC `public.request_gdpr_export` (déclenchement avec acteur résolu en SQL,
--      motif 0146 lignes 144-177) + RPC `private.gdpr_export_extract_batch`
--      (extraction bornée au demandeur, SECURITY DEFINER service_role uniquement).
--   5. Fonction `private.post_gdpr_export_http` (éveil Edge via Vault + pg_net,
--      motif 0019 lignes 475-514) + jobs pg_cron (minute + quotidien, motif 0011
--      lignes 362-387 / 0129 lignes 24-41).
--
-- AUCUNE URL SIGNÉE STOCKÉE
--   L'URL signée de l'export n'est jamais persistée en base (aucune colonne,
--   aucun log) — elle se calcule à la demande et meurt au TTL ≤ 24 h. Précédent
--   du dépôt : phase 25, jamais une URL signée stockée.
--
-- ISOLEMENT RGEX-03
--   L'extraction JSON est bornée au demandeur par le SQL lui-même : la donnée
--   d'un autre utilisateur, même membre du même foyer, ne traverse jamais le RPC.
--   Le client admin de l'Edge transporte, la borne reste le SQL ; les tests
--   négatifs 0158 prouvent l'isolement (comptages bornés §2.7D, expect_denied
--   inter-foyers).
--
-- SECRETS (§2.7H)
--   Aucune clé secrète dans `cron.job.command` — les jobs appellent une fonction
--   SQL qui lit Vault (motif 0019).
--
-- Corrections vers l'avant uniquement (§2.7A), search_path vide partout, tous
-- les noms qualifiés (public./private./vault./net./cron./storage.).

begin;

-- ---------------------------------------------------------------------------
-- 1. Bucket gdpr-exports + politique de lecture scellée
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gdpr-exports', 'gdpr-exports', false, 1073741824, array['application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : SEULEMENT le préfixe de son propre user_id (le zip vit sous <uid>/<job>.zip).
-- La borne est le DEMANDEUR (D-08), pas le foyer : le préfixe est scellé sur
-- auth.uid()::text. AUCUNE politique insert/update/delete client : la fonction
-- (clé secrète) bypass la RLS, l'écriture vit exclusivement côté backend (§2.6).
drop policy if exists gdpr_exports_read on storage.objects;
create policy gdpr_exports_read on storage.objects
  for select using (
    bucket_id = 'gdpr-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 2. Table gdpr_export_jobs + index unique partiel (garde D-06) + RLS
-- ---------------------------------------------------------------------------
create table public.gdpr_export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'en_attente'
    check (status in ('en_attente','en_cours','pret','echec')),
  storage_path text,
  error text,
  cursor_module text,
  cursor_offset integer not null default 0,
  staging_ready boolean not null default false,
  pass_started_at timestamptz,
  pass_count integer not null default 0,
  notified_push boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- D-06 : un seul job actif à la fois par membre. La garde vit EN BASE (jamais
-- une vérif applicative seule — course concurrente). Les statuts terminaux
-- (pret, echec) ne participent pas à la contrainte : un nouveau déclenchement
-- est possible dès qu'un job est terminé (D-02/D-06).
create unique index gdpr_export_jobs_one_active
  on public.gdpr_export_jobs (user_id)
 where status in ('en_attente','en_cours');

alter table public.gdpr_export_jobs enable row level security;

-- RLS : select limité à ses propres lignes ; AUCUNE écriture client (RPC + service).
drop policy if exists gdpr_export_jobs_select_own on public.gdpr_export_jobs;
create policy gdpr_export_jobs_select_own on public.gdpr_export_jobs
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Table d'audit de purge (preuve RGEX-04)
-- ---------------------------------------------------------------------------
create table public.gdpr_export_purge_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.gdpr_export_jobs (id) on delete set null,
  storage_path text not null,
  removed boolean not null,
  error text,
  purged_at timestamptz not null default now()
);

alter table public.gdpr_export_purge_log enable row level security;

-- ZÉRO politique client : la preuve RGEX-04 est lisible par la base et
-- l'opérateur, jamais par le navigateur.

-- ---------------------------------------------------------------------------
-- 4. RPC public.request_gdpr_export (déclenchement avec acteur résolu en SQL)
-- ---------------------------------------------------------------------------
create or replace function public.request_gdpr_export()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_job record;
  v_new_job_id uuid;
begin
  -- Session requise (motif 0146:162-164).
  if v_actor is null then
    raise exception 'session requise' using errcode = '28000';
  end if;

  -- Idempotence : si une ligne active existe pour l'acteur, la retourner telle
  -- quelle (D-06 : un seul job actif par membre). L'index unique partiel
  -- `gdpr_export_jobs_one_active` garantit qu'au plus une ligne satisfait ce
  -- filtre à tout instant.
  select id, status, created_at, updated_at, expires_at
    into v_existing_job
    from public.gdpr_export_jobs
   where user_id = v_actor
     and status in ('en_attente','en_cours')
   limit 1;

  if found then
    return jsonb_build_object(
      'id', v_existing_job.id,
      'status', v_existing_job.status,
      'created_at', v_existing_job.created_at,
      'updated_at', v_existing_job.updated_at,
      'expires_at', v_existing_job.expires_at
    );
  end if;

  -- Insertion d'un nouveau job : la course concurrente est capturée par le
  -- viol de l'index unique partiel (SQLSTATE 23505), jamais par un verrou
  -- explicite — la ligne insérée par un processus concurrent devient visible
  -- et la seconde insertion échoue. Relire alors la ligne active pour la
  -- retourner (idempotence).
  begin
    insert into public.gdpr_export_jobs (user_id)
    values (v_actor)
    returning id into v_new_job_id;

    -- Éveil immédiat de la fonction d'export (snappy, D-03) : l'échec d'éveil
    -- n'est pas fatal — le cron-minute redrive (§2.7 : le redrive est le retry).
    perform private.post_gdpr_export_http('run');

    -- Réponse : jsonb du job créé (id, status, horodatages).
    select id, status, created_at, updated_at, expires_at
      into v_existing_job
      from public.gdpr_export_jobs
     where id = v_new_job_id;

    return jsonb_build_object(
      'id', v_existing_job.id,
      'status', v_existing_job.status,
      'created_at', v_existing_job.created_at,
      'updated_at', v_existing_job.updated_at,
      'expires_at', v_existing_job.expires_at
    );
  exception when unique_violation then
    -- Course concurrentielle : un second processus a inséré sans le voir.
    -- Relire la ligne active de l'acteur et la retourner (idempotence).
    select id, status, created_at, updated_at, expires_at
      into v_existing_job
      from public.gdpr_export_jobs
     where user_id = v_actor
       and status in ('en_attente','en_cours')
     limit 1;

    if found then
      return jsonb_build_object(
        'id', v_existing_job.id,
        'status', v_existing_job.status,
        'created_at', v_existing_job.created_at,
        'updated_at', v_existing_job.updated_at,
        'expires_at', v_existing_job.expires_at
      );
    else
      -- La ligne insérée par le concurrent a disparu entre l'exception et la
      -- relecture (terminée ou supprimée). Refuser avec un code d'erreur stable.
      raise exception 'aucun job actif trouvé après course concurrente' using errcode = 'P0002';
    end if;
  end;
end;
$$;

comment on function public.request_gdpr_export() is
  'Déclenchement de l''export RGPD : un seul job actif par membre (D-06), idempotent.';

-- Privilèges : RPC public appelé par authenticated (motif 0147 lignes 281-285).
revoke all on function public.request_gdpr_export() from public, anon;
grant execute on function public.request_gdpr_export() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC private.gdpr_export_extract_batch (extraction bornée au demandeur)
-- ---------------------------------------------------------------------------
create or replace function private.gdpr_export_extract_batch(
  p_job_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_user_id uuid;
  v_module text;
  v_offset integer;
  v_result jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_media_paths text[] := array[]::text[];
  v_done boolean := false;
begin
  -- Lecture du job avec verrouillage exclusif de la ligne (évite deux passes
  -- en parallèle sur le même job — le cron-minute redrive, le lease protège).
  select user_id, cursor_module, cursor_offset, staging_ready
    into v_job
    from public.gdpr_export_jobs
   where id = p_job_id
     for update;

  if not found then
    raise exception 'job introuvable' using errcode = 'P0002';
  end if;

  v_user_id := v_job.user_id;
  v_module := v_job.cursor_module;
  v_offset := coalesce(v_job.cursor_offset, 0);

  -- Cette fonction est appelée par l'Edge Function avec la clé admin : elle
  -- extrait la donnée bornée au demandeur selon la portée tranchée dans
  -- 26-SPEC-DECISION.md (Option A « Ce qui me concerne », 22 modules listés).
  --
  -- Le client admin court-circuite la RLS : la borne d'isolement RGEX-03 vit
  -- DANS CE RPC, testée en base par `supabase/tests/0158_gdpr_export.sql`
  -- (comptages bornés §2.7D, expect_denied inter-foyers). L'Edge ne fait que
  -- transporter — il ne définit jamais le périmètre lui-même.
  --
  -- Curseur : `cursor_module` et `cursor_offset` sur la ligne de job. Les
  -- modules sont traités dans l'ordre nominal (celui de 26-SPEC-DECISION.md),
  -- avec avance transactionnelle du curseur à chaque remise de lot.
  --
  -- Sortie : jsonb {user_id, module, rows, cursor_module, cursor_offset, done,
  -- media_paths}. `done = true` signale que tous les modules sont terminés.
  --
  -- SQUELETTE RÉSERVÉ POUR PLAN 26-03 : l'implémentation complète de l'extraction
  -- par module (tables métier + filtre demandeur + jointures + liste des médias)
  -- sera fournie dans le plan 26-03 Task 1, en même temps que l'Edge Function
  -- qui consomme ce RPC. Cette tâche 26-02 installe le socle SQL (structure de
  -- la table, machine à états, job cron, garde D-06) ; le plan 26-03 branche la
  -- logique d'extraction effective.
  --
  -- Signature et contrat : ne changeront pas — le plan 26-03 remplit le corps,
  -- sans toucher aux paramètres ni au retour.

  v_result := jsonb_build_object(
    'user_id', v_user_id,
    'module', v_module,
    'rows', v_rows,
    'cursor_module', v_module,
    'cursor_offset', v_offset,
    'done', v_done,
    'media_paths', v_media_paths
  );

  return v_result;
end;
$$;

comment on function private.gdpr_export_extract_batch(uuid, integer) is
  'Extraction JSON bornée au demandeur (RGEX-03). Portée tranchée dans 26-SPEC-DECISION.md : Option A « Ce qui me concerne », fusion multi-foyers, 22 modules. Squelette réservé pour plan 26-03 Task 1 : le corps sera rempli avec la logique d''extraction par module et la liste des médias à copier.';

-- Privilèges : réservé à service_role (l'Edge Function transporte, le RPC borne).
revoke all on function private.gdpr_export_extract_batch(uuid, integer) from public, anon, authenticated;
grant execute on function private.gdpr_export_extract_batch(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Fonction private.post_gdpr_export_http (éveil Edge via Vault + pg_net)
-- ---------------------------------------------------------------------------
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
  -- Gardes : pg_net et Vault doivent exister (motif 0019 lignes 485-488).
  if to_regclass('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then
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

  -- Comptage conditionnel (forme 0019 lignes 519-541) : ne POSTer que s'il y a
  -- quelque chose à traiter.
  if p_action = 'run' then
    -- Action 'run' : compter les jobs actifs (en_attente OU en_cours avec lease
    -- dépassé, grâce de 5 minutes). Ne POSTer que si au moins un job est dû.
    select count(*)::integer into v_due_count
      from public.gdpr_export_jobs
     where status in ('en_attente','en_cours')
       and (pass_started_at is null
             or pass_started_at < now() - interval '5 minutes');

    if v_due_count = 0 then
      return false;
    end if;
  elsif p_action = 'purge' then
    -- Action 'purge' : compter les jobs terminaux (pret, echec) avec expires_at
    -- dépassé. Ne POSTer que si au moins un candidat existe.
    select count(*)::integer into v_due_count
      from public.gdpr_export_jobs
     where status in ('pret','echec')
       and expires_at < now();

    if v_due_count = 0 then
      return false;
    end if;
  else
    -- Action inconnue : refuser.
    raise warning 'Action inconnue : %', p_action;
    return false;
  end if;

  -- Envoi HTTP : POST vers /functions/v1/gdpr-export-run (action 'run') ou
  -- /functions/v1/gdpr-export-purge (action 'purge'), corps {action}, timeout
  -- 30 s (motif 0019 lignes 500-510).
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/gdpr-export-' || p_action,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('action', p_action),
    timeout_milliseconds := 30000
  );

  return true;
end;
$$;

comment on function private.post_gdpr_export_http(text) is
  'POST /functions/v1/gdpr-export-run ou gdpr-export-purge, clé secrète lue dans Vault. Ne POSTe que si un job est dû (forme 0019).';

-- ---------------------------------------------------------------------------
-- 7. Jobs pg_cron (minute + quotidien, motif 0011/0129)
-- ---------------------------------------------------------------------------
do $$
declare
  v_jobs text[][] := array[
    array['eo-gdpr-export-run', '* * * * *', 'select private.post_gdpr_export_http(''run'')'],
    array['eo-gdpr-export-purge', '27 4 * * *', 'select private.post_gdpr_export_http(''purge'')']
  ];
  v_job text[];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent : jobs GDPR non installés.';
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

-- Job 'eo-gdpr-export-run' : cadence minute (motif 0129), appelle la fonction
-- qui compte d'abord les jobs dus et ne POSTe que si au moins un existe.
--
-- Job 'eo-gdpr-export-purge' : cadence quotidienne (fuseau Europe/Paris imposé
-- par §2.2, expression '27 4 * * *' — 4h27 UTC+1/UTC+2, heure non critique),
-- appelle la fonction qui compte les candidats et ne POSTe que s'il y en a.
--
-- AUCUN SECRET DANS LES COMMANDES (§2.7H) : les jobs appellent une fonction SQL
-- qui lit Vault.

commit;
