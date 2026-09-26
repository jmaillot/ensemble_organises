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
    0::bigint,
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
  r text;
  v_expected text[] := array[
    'eo-routine-maintenance', 'eo-invite-token-prune', 'eo-birthday-alerts',
    'eo-push-dispatch', 'eo-push-prune'
  ];
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent sur cette instance : assertions ignorées.';
    return;
  end if;

  foreach r in array v_expected loop
    perform testkit.ok(
      exists (select 1 from cron.job where jobname = r),
      'le job ' || r || ' doit être installé'
    );
  end loop;

  select count(*) into v_jobs
    from cron.job
   where jobname = any(v_expected);
  perform testkit.eq(v_jobs, cardinality(v_expected), 'tous les jobs planifiés sont installés');

  perform testkit.ok(
    not exists (select 1 from cron.job where database is distinct from current_database()),
    'chaque job vise explicitement la base courante (database_name défini à l''installation)'
  );

  -- Aucun secret en clair dans une commande planifiée.
  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where command ~* '(secret|token_hash|password|passwd|api[_-]?key|sb_secret|service_role|vapid)'
    ),
    'aucun secret ni valeur sensible dans cron.job.command'
  );

  -- Les jobs n'appellent que des fonctions du schéma privé, sans paramètre :
  -- c'est ce qui garantit qu'aucune valeur n'est recopiée dans le catalogue.
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
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-push-dispatch' and schedule = '*/15 * * * *'),
    'les rappels push sont tentés toutes les quinze minutes'
  );
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-birthday-alerts' and schedule = '40 6 * * *'),
    'les anniversaires du jour sont annoncés au matin'
  );
end;
$$;

-- Le dispatch des notifications lit ses secrets dans Vault, pas en clair.
--
-- L'assertion porte sur `post_push_dispatch`, et NON sur les deux dispatchs :
-- depuis 0019, ceux-ci ne lisent plus Vault eux-mêmes, ils délèguent. Les
-- interroger sur `vault.decrypted_secrets` revenait à leur demander un code
-- qu'ils ne contiennent pas — l'assertion échouait en donnant à croire à une
-- fuite de secret, alors que la lecture y est centralisée exactement comme
-- prévu. C'est la fonction de dispatch qui doit porter la preuve.
select testkit.ok(
  pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%vault.decrypted_secrets%',
  'la fonction de dispatch lit ses secrets dans Vault au moment de l''exécution');

-- Et les trois dispatchs délèguent bien à cette fonction unique, sans jamais
-- lire Vault eux-mêmes : deux points de lecture seraient deux endroits où un
-- secret pourrait se glisser.
select testkit.ok(
  pg_get_functiondef('private.dispatch_push_notifications()'::regprocedure) like '%post_push_dispatch(''rappels'')%'
  and pg_get_functiondef('private.dispatch_push_notifications()'::regprocedure) not like '%vault.%',
  'le dispatch des rappels délègue la lecture des secrets');
select testkit.ok(
  pg_get_functiondef('private.dispatch_birthday_alerts()'::regprocedure) like '%post_push_dispatch(''anniversaires'')%'
  and pg_get_functiondef('private.dispatch_birthday_alerts()'::regprocedure) not like '%vault.%',
  'le dispatch des anniversaires délègue la lecture des secrets');

-- `dispatch_daily_notifications()` est l'ancien nom du dispatch des rappels
-- (migration 0011). Elle délègue donc au dispatch des rappels, lui-même : le
-- travail n'est écrit qu'une fois, et le nom historique ne renvoie plus à un
-- endpoint fantôme.
select testkit.ok(
  pg_get_functiondef('private.dispatch_daily_notifications()'::regprocedure) like '%dispatch_push_notifications()%'
  and pg_get_functiondef('private.dispatch_daily_notifications()'::regprocedure) not like '%vault.%',
  'le dispatch historique délègue au dispatch des rappels');

-- Le prédicat doit interroger le catalogue avec le bon TYPE d'objet.
--
-- `net.http_post` est une fonction, et `to_regclass` ne résout que les
-- relations : il répondait `NULL` même pg_net installée, si bien que le
-- dispatch était inerte par construction et que `dispatched` valait `false` en
-- permanence. Aucun envoi n'est donc parti, et le chemin « Envoyer un test »
-- fonctionnait quand même, puisqu'il n'emprunte pas ce chemin.
--
-- L'assertion porte sur la FORME du prédicat, pas sur la présence de pg_net :
-- elle est donc vraie sur une stack qui n'a pas l'extension, et fausse partout
-- ailleurs. Une assertion « pg_net est installée » aurait été vraie chez vous
-- et muette ailleurs — c'est-à-dire incapable de signaler le défaut qu'elle
-- prétend surveiller.
select testkit.ok(
  pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%to_regproc(%net.http_post%'
  and pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure)
      not like '%to_regclass(''net.http_post'')%',
  'le dispatch teste l''existence de net.http_post comme une fonction, pas comme une relation');

-- Et les deux causes restent distinguables : « pg_net ou Vault absent » obligeait
-- à trancher entre deux origines sans instrument. Fusionner de nouveau les deux
-- messages ferait échouer cette assertion.
select testkit.ok(
  pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%pg_net absent%'
  and pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%Vault absent%',
  'le dispatch nomme la cause qu''il a constatée, extension ou coffre');

-- L'EN-TÊTE DE LA CLÉ SECRÈTE.
--
-- Le mode d'authentification d'une Edge Function est décidé par l'EN-TÊTE, pas
-- par la forme de la valeur : `secret` attend la clé sb_* dans `apikey`, et
-- `user` attend un JWT dans `Authorization`. Une clé secrète présentée comme
-- Bearer est donc un JWT qui n'en est pas un, et le framework répond
-- `401 UNUSABLE_CREDENTIAL` AVANT d'atteindre le corps de la fonction — donc
-- sans un seul log de la fonction, et sans rien consommé.
--
-- Le chemin est resté inerte de bout en bout, et le bouton « Envoyer un test »
-- le masquait : lui appelle `push-notify` depuis le navigateur, avec un JWT
-- d'utilisateur, donc par le bon mode depuis le début.
select testkit.ok(
  pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%''apikey'', v_key%'
  and pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) not like '%''authorization''%',
  'le dispatch envoie la clé secrète dans l''en-tête apikey, et pas comme un jeton Bearer');

-- Ce que la fonction met dans l'URL et dans le corps n'est PAS vérifié ici, et
-- ce n'est pas un oubli.
--
-- `pg_get_functiondef` ne rend pas la source : il re-déparse l'arbre SQL, et
-- PostgreSQL réaffiche les littéraux avec leurs casts (`'scope'::text`). Un
-- motif écrit contre le fichier de migration échoue donc sans qu'aucun code
-- ait changé ; écrit contre la sortie observée, il cesse de vérifier quoi que
-- ce soit dès qu'on reformate. Aucune des deux formes n'est un test.
--
-- La propriété qui nous intéresse — le secret ne voyage ni dans l'URL ni dans
-- le corps — est une interdiction, et un motif d'interdiction croise toujours
-- ce qu'il ne faut pas : `%v_key%||%functions/v1%` matchait le `v_key` d'une
-- déclaration de variable et le `||` d'une autre instruction.
--
-- La preuve retenue est comportementale : le `200` de `net._http_response`, et
-- la disparition de la ligne de rappel. Voir AGENTS.md §2.7 D.

-- Sur une instance qui a pg_net, le dispatch ne doit plus être inerte. La suite
-- ne suppose pas l'extension : elle le signale, comme elle le fait pour pg_cron.
do $$
begin
  if to_regproc('net.http_post') is null then
    raise notice 'pg_net absent sur cette instance : la non-inertie du dispatch n''est pas vérifiée.';
    return;
  end if;

  perform testkit.ok(
    to_regclass('vault.decrypted_secrets') is not null,
    'pg_net et Vault sont présents : le dispatch a de quoi envoyer');
end;
$$;

-- Le point d'entrée est unique : une seule Edge Function à déployer et à
-- surveiller, et les deux jobs ne peuvent pas diverger d'un point d'entrée.
select testkit.ok(
  pg_get_functiondef('private.post_push_dispatch(text)'::regprocedure) like '%/functions/v1/push-notify%',
  'les deux dispatch pointent vers la fonction push-notify');
select testkit.ok(
  pg_get_functiondef('private.dispatch_daily_notifications()'::regprocedure) not like '%daily-briefing%',
  'plus aucun appel à la fonction daily-briefing, qui n''a jamais existé');

rollback;
