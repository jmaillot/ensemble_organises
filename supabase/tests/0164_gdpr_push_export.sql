-- supabase/tests/0164_gdpr_push_export.sql
-- 0164 : notification push d'achèvement de l'export RGPD (26-06,
-- RGEX-02, D-01/D-02/D-04).
--
-- Ce qui est prouvé ici :
--   1. Un job `pret` produit EXACTEMENT une ligne : titre « Votre export est
--      prêt », url '/parametres' (D-04), tag `export-<job_id>`, et AUCUN
--      champ ne contenant storage_path ni un lien.
--   2. Un job `echec` produit SON message d'échec (D-02 : notifié comme le
--      succès, même chaîne).
--   3. La consommation (public.consume_push_reminders, kind 'export') bascule
--      `notified_push` — et un second appel de la fonction ne retourne RIEN :
--      pas de push en boucle (T-26-19).
--   4. Un job `en_cours` (non terminal) ne produit rien.
--   5. Le scope 'export' traverse la garde de due_push_notifications, un
--      scope inconnu lève toujours 22023 (T-26-20).
--   6. Le job cron `eo-push-exports` appelle une fonction privée sans
--      paramètre (contrat test 0004), et le dispatch délègue à
--      post_push_dispatch sans lire Vault lui-même (motif 0042).
--
-- Bornes (AGENTS.md §2.7D) : la fonction est GLOBALE par nature (le job
-- cron doit couvrir tous les foyers) — chaque comptage filtre sur les
-- reminder_id des jobs du semis, jamais sur la table entière. Fichier
-- autonome, `rollback` final.

begin;

-- ---------------------------------------------------------------
-- Semis (postgres) : un demandeur, trois jobs (pret, echec, en_cours).
-- Le chemin du zip est reconnaissable : il finit par un long bloc de « a »
-- — une assertion peut donc prouver son ABSENCE des champs de notification
-- sans connaître la valeur exacte (§2.7D, marque reconnaissable).
-- ---------------------------------------------------------------
do $$
declare
  camille uuid := testkit.auth_user('t164-camille@example.fr', 'Camille 164');
  v_pret uuid;
  v_echec uuid;
  v_en_cours uuid;
begin
  insert into testkit.fx (key, user_id) values ('camille', camille);

  insert into public.gdpr_export_jobs (user_id, status, storage_path)
  values (camille, 'pret', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-pret.zip' || repeat('a', 60))
  returning id into v_pret;

  insert into public.gdpr_export_jobs (user_id, status, error)
  values (camille, 'echec', 'export abandonné après 62 passes (plafond atteint).')
  returning id into v_echec;

  insert into public.gdpr_export_jobs (user_id, status)
  values (camille, 'en_cours')
  returning id into v_en_cours;

  insert into testkit.fx (key, row_id) values
    ('pret', v_pret), ('echec', v_echec), ('en_cours', v_en_cours);
end;
$$;

-- Les jobs du semis, à portée de chaque assertion.
create or replace function testkit.t164_job_ids()
returns uuid[]
language sql
stable
as $$
  select array_agg(row_id::uuid) from testkit.fx
   where key in ('pret', 'echec', 'en_cours');
$$;

-- Les lignes de notification du semis, et rien d'autre (due est GLOBALE).
create or replace function testkit.t164_export_rows()
returns table (
  user_id uuid,
  reminder_id text,
  title text,
  body text,
  url text,
  tag text
)
language sql
stable
as $$
  select r.user_id, r.reminder_id, r.title, r.body, r.url, r.tag
    from private.push_reminder_notifications(now()) r
   where (r.reminder_id)::uuid = any (testkit.t164_job_ids());
$$;

-- ---------------------------------------------------------------
-- 1. Le job `pret` produit une ligne correcte — D-04 sans compromis.
-- ---------------------------------------------------------------
do $$
declare
  v_rows int;
  v_pret record;
  v_row record;
begin
  select * into v_pret from testkit.fx where key = 'pret';

  select count(*) into v_rows from testkit.t164_export_rows();
  perform testkit.eq(v_rows, 2::int,
    'le semis produit deux lignes (pret + echec), pas une de plus ni de moins');

  select * into v_row from testkit.t164_export_rows() where reminder_id = v_pret.row_id::text;
  perform testkit.ok(v_row.title = 'Votre export est prêt',
    'titre du succès générique, obtenu : ' || coalesce(v_row.title, 'NULL'));
  perform testkit.eq(v_row.url, '/parametres',
    'l''url est /parametres (D-04 : jamais le lien signé ni storage_path)');
  perform testkit.eq(v_row.tag, 'export-' || v_pret.row_id,
    'le tag porte le job_id, clé de la consommation notified_push');
  perform testkit.ok(v_row.body like '%archive est prête%',
    'le corps annonce l''archive sans en dévoiler le chemin');

  -- D-04 : AUCUN champ de notification ne transporte le chemin du zip
  -- (marque : le long bloc de « a » du semis) ni un lien http.
  perform testkit.ok(
    not exists (
      select 1 from testkit.t164_export_rows()
       where position(repeat('a', 60) in coalesce(reminder_id, '') || coalesce(title, '')
                      || coalesce(body, '') || coalesce(url, '') || coalesce(tag, '')) > 0
         or coalesce(body, '') like '%http%'
         or coalesce(url, '') like '%http%'
    ),
    'aucun champ de notification ne contient storage_path ni un lien http (D-04)');
end;
$$;

-- ---------------------------------------------------------------
-- 2. Le job `echec` produit SON message (D-02).
-- ---------------------------------------------------------------
do $$
declare
  v_echec record;
  v_row record;
begin
  select * into v_echec from testkit.fx where key = 'echec';
  select * into v_row from testkit.t164_export_rows() where reminder_id = v_echec.row_id::text;

  perform testkit.ok(v_row.title like 'Votre export a échoué%',
    'l''échec est notifié, avec son message distinct (D-02), obtenu : '
      || coalesce(v_row.title, 'NULL'));
  perform testkit.eq(v_row.url, '/parametres',
    'même chaîne, même url interne pour l''échec');
  perform testkit.ok(v_row.body like '%relancer%',
    'le corps invite à retenter — l''écran export reste retentable');
end;
$$;

-- ---------------------------------------------------------------
-- 3. Un job non terminal (en_cours) ne produit RIEN.
-- ---------------------------------------------------------------
do $$
declare
  v_en_cours record;
begin
  select * into v_en_cours from testkit.fx where key = 'en_cours';

  perform testkit.ok(
    not exists (
      select 1 from testkit.t164_export_rows() where reminder_id = v_en_cours.row_id::text
    ),
    'un job en_cours n''est pas notifié : seuls les statuts terminaux le sont');
end;
$$;

-- ---------------------------------------------------------------
-- 4. Le scope 'export' traverse la garde ; un scope inconnu lève 22023.
-- ---------------------------------------------------------------
do $$
declare
  v_camille uuid;
  v_state text;
  v_msg text;
  v_due jsonb;
begin
  select user_id into v_camille from testkit.fx where key = 'camille';

  v_due := public.due_push_notifications('export', now(), null);
  perform testkit.ok(
    exists (
      select 1 from jsonb_array_elements(v_due) n
       where (n.value ->> 'user_id')::uuid = v_camille
         and (n.value ->> 'tag') like 'export-%'
    ),
    'le scope ''export'' passe la garde et rend les lignes du semis');

  begin
    perform public.due_push_notifications('export_inconnu', now(), null);
    v_state := 'AUCUNE_ERREUR';
    v_msg := 'scope inconnu accepté';
  exception when others then
    v_state := SQLSTATE;
    v_msg := sqlerrm;
  end;
  perform testkit.ok(v_state = '22023',
    'un scope inconnu lève toujours 22023 (T-26-20), obtenu ' || v_state || ' — ' || coalesce(v_msg, 'aucune'));
end;
$$;

-- ---------------------------------------------------------------
-- 5. La consommation bascule notified_push, et un second appel ne
--    retourne RIEN (pas de boucle de push, T-26-19).
-- ---------------------------------------------------------------
do $$
declare
  v_pret record;
  v_echec record;
  v_consumed int;
  v_before int;
  v_after int;
begin
  select * into v_pret from testkit.fx where key = 'pret';
  select * into v_echec from testkit.fx where key = 'echec';

  select count(*) into v_before from testkit.t164_export_rows();

  -- Consommation après distribution : c'est l'appel que pousse push-notify
  -- lorsqu'au moins un appareil a reçu la notification (motif 0042).
  v_consumed := public.consume_push_reminders(
    jsonb_build_array(
      jsonb_build_object('kind', 'export', 'id', v_pret.row_id),
      jsonb_build_object('kind', 'export', 'id', v_echec.row_id)
    ));

  perform testkit.eq(v_consumed, 2::int,
    'la consommation marque les deux jobs (pret et echec)');

  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.gdpr_export_jobs where id = %L and notified_push = true',
      v_pret.row_id)),
    1::bigint,
    'notified_push bascule pour le job pret');
  perform testkit.eq(
    testkit.count(format(
      'select 1 from public.gdpr_export_jobs where id = %L and notified_push = true',
      v_echec.row_id)),
    1::bigint,
    'notified_push bascule pour le job echec');

  -- Le second passage ne retourne RIEN : la machine à états est consommée.
  perform testkit.eq(
    (select count(*) from testkit.t164_export_rows())::int, 0::int,
    'un second appel de la fonction ne retourne rien — pas de push en boucle (T-26-19)');

  -- La consommation répétée ne compte pas double : un job déjà notifié
  -- (notified_push déjà true) affecte zéro ligne.
  v_consumed := public.consume_push_reminders(
    jsonb_build_array(jsonb_build_object('kind', 'export', 'id', v_pret.row_id)));
  perform testkit.eq(v_consumed, 0::int,
    'une consommation répétée n''affecte rien — la ligne notifiée EST la preuve');

  -- Les autres kinds restent intacts : la branche export ne mange pas la
  -- mécanique 0042 (file des messages, même contractuel : row_count).
  select count(*) into v_after from testkit.t164_export_rows();
  perform testkit.eq(v_after, 0::int,
    'état final cohérent : plus aucune ligne de notification d''export due');
end;
$$;

-- ---------------------------------------------------------------
-- 6. Le job cron et le dispatch suivent les contrats du dépôt.
-- ---------------------------------------------------------------
do $$
begin
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-push-exports'
              and command = 'select private.dispatch_export_notifications()'),
    'le job cron eo-push-exports appelle une fonction privée sans paramètre (contrat test 0004)');

  perform testkit.ok(
    pg_get_functiondef('private.dispatch_export_notifications()'::regprocedure)
      like '%post_push_dispatch(''export'')%'
    and pg_get_functiondef('private.dispatch_export_notifications()'::regprocedure) not like '%vault.%',
    'le dispatch des exports délègue la lecture des secrets à post_push_dispatch (motif 0042)');
end;
$$;

rollback;
