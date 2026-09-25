-- supabase/tests/0004_cron.sql
-- Expansion des règles RRULE, génération des occurrences, évaluation des
-- retards et installation des jobs pg_cron.
--
-- Ce fichier s'exécute en `postgres` (les fonctions de planification ne sont
-- pas exécutables par un client).

begin;

-- ===========================================================================
-- 1. Prédicat RRULE
-- ===========================================================================
select testkit.eq(private.rrule_day_matches('FREQ=DAILY', date '2026-09-01', date '2026-09-01'), true,
  'une routine quotidienne tombe le premier jour');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY', date '2026-09-01', date '2026-09-05'), true,
  'une routine quotidienne tombe le cinquième jour');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY', date '2026-09-01', date '2026-08-31'), false,
  'une routine ne tombe pas avant son début');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY;INTERVAL=3', date '2026-09-01', date '2026-09-04'), true,
  'INTERVAL=3 tombe le 4e jour');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY;INTERVAL=3', date '2026-09-01', date '2026-09-03'), false,
  'INTERVAL=3 ne tombe pas le 3e jour');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY;COUNT=2', date '2026-09-01', date '2026-09-03'), false,
  'COUNT limite le nombre d''occurrences');
select testkit.eq(private.rrule_day_matches('FREQ=DAILY;UNTIL=20260902', date '2026-09-01', date '2026-09-03'), false,
  'UNTIL arrête la série');
select testkit.eq(private.rrule_day_matches('FREQ=WEEKLY;BYDAY=MO', date '2026-09-01', date '2026-09-07'), true,
  'BYDAY=MO tombe le lundi suivant');
select testkit.eq(private.rrule_day_matches('FREQ=WEEKLY;BYDAY=MO', date '2026-09-01', date '2026-09-08'), false,
  'BYDAY=MO ne tombe pas le mardi');
select testkit.eq(private.rrule_day_matches('FREQ=MONTHLY', date '2026-01-15', date '2026-03-15'), true,
  'une routine mensuelle tombe le même jour chaque mois');
select testkit.eq(private.rrule_day_matches('FREQ=MONTHLY', date '2026-01-15', date '2026-03-16'), false,
  'une routine mensuelle ne décale pas son jour');
select testkit.eq(private.rrule_day_matches('FREQ=YEARLY', date '2020-06-02', date '2026-06-02'), true,
  'une routine annuelle tombe chaque année');
select testkit.eq(private.rrule_day_matches('RRULE:FREQ=DAILY', date '2026-09-01', date '2026-09-02'), true,
  'le préfixe RRULE: est accepté');

-- ===========================================================================
-- 2. Génération des occurrences
-- ===========================================================================
do $$
declare
  alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  home_a text := testkit.household(alice, 'Foyer A');
  alice_m text := testkit.member(home_a, alice, 'Alice Martin', 'admin', 'accent');
  daily text := private.new_id('routine');
  weekly text := private.new_id('routine');
begin
  insert into public.routines (id, household_id, name, recurrence_rule, created_by, created_at)
  values
    (daily, home_a, 'Sortie canine', 'FREQ=DAILY', alice_m, now() - interval '30 days'),
    (weekly, home_a, 'Poubelle', 'FREQ=WEEKLY;BYDAY=WE', alice_m, now() - interval '30 days');

  -- Une occurrence déjà validée ne doit jamais être écrasée.
  insert into public.routine_completions (id, routine_id, household_id, occurrence_date, status, completed_by, completed_at)
  values (private.new_id('routine-completion'), daily, home_a, current_date - 20, 'fait', alice_m, now());

  perform testkit.eq(private.generate_routine_occurrences(current_date - 14, current_date) >= 15, true,
    'les occurrences des 14 derniers jours sont générées');
  perform testkit.eq(private.generate_routine_occurrences(current_date - 14, current_date), 0,
    'la génération est idempotente');
  perform testkit.eq(private.generate_routine_occurrences(current_date, current_date - 1), 0,
    'une fenêtre inversée ne génère rien');

  -- La colonne dénormalisée est alignée sur le parent.
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where routine_id in (daily, weekly) and household_id <> home_a),
    0,
    'household_id est aligné sur la routine'
  );

  -- Occurrences dupliquées impossibles.
  perform testkit.expect_denied(format(
    'insert into public.routine_completions (id, routine_id, household_id, occurrence_date) values (%L, %L, %L, current_date)',
    private.new_id('routine-completion'), daily, home_a));
end;
$$;

-- ===========================================================================
-- 3. Évaluation des retards
-- ===========================================================================
do $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_pending integer;
begin
  select count(*) into v_pending
    from public.routine_completions
   where status = 'en_retard'
     and occurrence_date < v_today - 7;
  perform testkit.ok(v_pending > 0, 'des occurrences anciennes attendent l''évaluation');

  perform testkit.ok(private.evaluate_routine_occurrences() > 0, 'l''évaluation traite des occurrences');

  perform testkit.eq(
    (select count(*) from public.routine_completions
      where status = 'en_retard' and occurrence_date < v_today - 7),
    0::bigint,
    'plus aucune occurrence ancienne en retard'
  );
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where status = 'manque' and occurrence_date < v_today - 7) > 0,
    true,
    'les occurrences anciennes de plus de sept jours sont manquées'
  );
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where status = 'en_retard' and occurrence_date > v_today - 7) > 0,
    true,
    'les occurrences de la semaine restent en retard'
  );
  perform testkit.eq(
    (select count(*) from public.routine_completions
      where occurrence_date = v_today - 20 and status = 'fait'),
    1::bigint,
    'une occurrence validée n''est jamais touchée'
  );
  perform testkit.eq(private.evaluate_routine_occurrences(), 0,
    'l''évaluation est idempotente');
end;
$$;

-- La maintenance quotidienne s'exécute sans erreur.
select testkit.expect_ok('select private.run_daily_routine_maintenance()');
select testkit.expect_ok('select private.prune_expired_invite_tokens()');

-- ===========================================================================
-- 4. Jobs pg_cron
-- ===========================================================================
do $$
declare
  v_jobs integer;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent sur cette instance : assertions ignorées.';
    return;
  end if;

  select count(*) into v_jobs
    from cron.job
   where jobname in ('eo-routine-maintenance', 'eo-invite-token-prune');
  perform testkit.eq(v_jobs, 2, 'les deux jobs planifiés sont installés');

  perform testkit.ok(
    not exists (select 1 from cron.job where database is distinct from current_database()),
    'chaque job vise explicitement la base courante (database_name défini à l''installation)'
  );

  -- Aucun secret en clair dans une commande planifiée.
  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where command ~* '(secret|token_hash|password|passwd|api[_-]?key|sb_secret|service_role)'
    ),
    'aucun secret ni valeur sensible dans cron.job.command'
  );

  -- Les jobs n'appellent que des fonctions du schéma privé.
  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where jobname like 'eo-%'
         and command !~ '^select private\.[a-z_]+\(\)$'
    ),
    'les jobs appellent uniquement des fonctions privées sans paramètre'
  );

  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-routine-maintenance' and schedule = '5 6 * * *'),
    'la maintenance quotidienne est planifiée à 06 h 05'
  );
end;
$$;

-- Le dispatch des notifications lit ses secrets dans Vault, pas en clair.
select testkit.ok(
  pg_get_functiondef('private.dispatch_daily_notifications()'::regprocedure) like '%vault.decrypted_secrets%',
  'le dispatch lit ses secrets dans Vault au moment de l''exécution');

rollback;
