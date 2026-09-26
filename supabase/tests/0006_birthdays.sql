-- supabase/tests/0006_birthdays.sql
-- Alertes d'anniversaires : prochaine occurrence (cas du 29 février inclus),
-- périmètre « mois + sept prochains jours », isolation entre foyers, résumé du
-- dispatch et installation du job pg_cron.
--
-- Ce fichier s'exécute en `postgres` : les fonctions de planification ne sont
-- pas exécutables par un client.

begin;

-- ===========================================================================
-- 1. Prochaine occurrence d'un anniversaire
-- ===========================================================================
do $$
declare
  v_anniv date := (now() at time zone 'Europe/Paris')::date;
begin
  perform testkit.eq(
    private.next_birthday_date(date '1990-06-02', date '2026-06-01'), date '2026-06-02',
    'un anniversaire à venir est daté dans l''année courante');
  perform testkit.eq(
    private.next_birthday_date(date '1990-06-02', date '2026-06-03'), date '2027-06-02',
    'un anniversaire dépassé est reporté à l''année suivante');
  perform testkit.eq(
    private.next_birthday_date(date '1990-06-02', date '2026-06-02'), date '2026-06-02',
    'un anniversaire du jour est daté aujourd''hui');
  perform testkit.eq(
    private.next_birthday_date(date '1990-12-31', date '2026-12-31'), date '2026-12-31',
    'le passage d''année ne décale pas le jour');

  -- 29 février hors année bissextile : 28 février.
  perform testkit.eq(
    private.next_birthday_date(date '2000-02-29', date '2026-01-15'), date '2026-02-28',
    'le 29 février est ramené au 28 février hors année bissextile');
  perform testkit.eq(
    private.next_birthday_date(date '2000-02-29', date '2026-03-01'), date '2027-02-28',
    'le 29 février déjà passé est reporté au 28 février suivant');
  perform testkit.eq(
    private.next_birthday_date(date '2000-02-29', date '2028-01-15'), date '2028-02-29',
    'le 29 février est conservé les années bissextiles');

  -- invariance dans le temps : la fonction ne lit pas `now()`.
  perform testkit.eq(
    private.next_birthday_date(date '1990-06-02', v_anniv),
    private.next_birthday_date(date '1990-06-02', v_anniv),
    'la prochaine occurrence est déterministe pour une date donnée');
  perform testkit.eq(private.next_birthday_date(null, v_anniv), null,
    'une date de naissance absente ne produit aucune alerte');
end;
$$;

-- ===========================================================================
-- 2. Périmètre des alertes
--
-- Date de référence figée au 10 mars 2026 : le mois courant laisse 21 jours,
-- l'horizon retenu est donc le mois (max(7, 21)).
-- ===========================================================================
do $$
declare
  alice uuid := testkit.auth_user('anniv-alice@example.fr', 'Alice Martin');
  bob uuid := testkit.auth_user('anniv-bob@example.fr', 'Bob Martin');
  home text := testkit.household(alice, 'Foyer A');
  other text := testkit.household(bob, 'Foyer B');
  alice_m text := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  bob_m text := testkit.member(home, bob, 'Bob Martin', 'membre', 'ink');
  v_today date := date '2026-03-10';

  soon text := private.new_id('birthday');
  later text := private.new_id('birthday');
  after text := private.new_id('birthday');
  passed text := private.new_id('birthday');
  leap text := private.new_id('birthday');
  elsewhere text := private.new_id('birthday');
begin
  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id) values
    (soon,      home, 'Anniversaire proche',  date '1990-03-12', alice_m),
    (later,     home, 'Anniversaire du mois',  date '1985-03-30', null),
    (after,     home, 'Hors périmètre',        date '1970-04-05', bob_m),
    (passed,    home, 'Passé cette année',      date '1990-01-15', null),
    (leap,      home, 'Né le 29 février',      date '2000-02-29', null),
    (elsewhere, other, 'Contact du foyer B',    date '1990-03-11', null);

  -- Périmètre du foyer : deux anniversaires, un par fenêtre.
  perform testkit.eq(
    (select array_agg(a.name order by a.next_occurrence_date)
       from private.household_birthday_alerts(home, v_today) a),
    array['Anniversaire proche', 'Anniversaire du mois'],
    'seuls les anniversaires du mois et des sept prochains jours remontent'
  );

  perform testkit.eq(
    (select a.scope from private.household_birthday_alerts(home, v_today) a where a.birthday_id = soon),
    'semaine',
    'un anniversaire à deux jours relève de la fenêtre « semaine »'
  );
  perform testkit.eq(
    (select a.days_until from private.household_birthday_alerts(home, v_today) a where a.birthday_id = soon),
    2,
    'le nombre de jours est exact'
  );
  perform testkit.eq(
    (select a.scope from private.household_birthday_alerts(home, v_today) a where a.birthday_id = later),
    'mois',
    'un anniversaire à vingt jours relève de la fenêtre « mois »'
  );
  perform testkit.eq(
    (select a.next_occurrence_date from private.household_birthday_alerts(home, v_today) a where a.birthday_id = later),
    date '2026-03-30',
    'la prochaine occurrence est calculée sur l''année courante'
  );
  perform testkit.eq(
    (select count(*) from private.household_birthday_alerts(home, v_today) a where a.birthday_id in (after, passed, leap)),
    0::bigint,
    'un anniversaire hors fenêtre, déjà passé ou au 29 février est exclu'
  );
  perform testkit.eq(
    (select a.member_name from private.household_birthday_alerts(home, v_today) a where a.birthday_id = soon),
    'Alice Martin',
    'le membre lié est restitué pour l''adressage de l''alerte'
  );
  perform testkit.eq(
    (select a.linked_member_id from private.household_birthday_alerts(home, v_today) a where a.birthday_id = later),
    null::text,
    'un anniversaire de contact n''est rattaché à aucun membre'
  );

  -- Isolation entre foyers.
  perform testkit.eq(
    (select array_agg(a.name order by a.next_occurrence_date)
       from private.household_birthday_alerts(p_today => v_today) a),
    array['Contact du foyer B', 'Anniversaire proche', 'Anniversaire du mois'],
    'sans filtre, tous les foyers sont couverts, chacun avec ses anniversaires'
  );
  perform testkit.eq(
    (select count(*) from private.household_birthday_alerts(other, v_today) a where a.household_id = home),
    0::bigint,
    'le filtre de foyer ne remonte aucun anniversaire d''un autre foyer'
  );

  -- Le 29 février est bien une alerte quand il tombe dans la fenêtre.
  perform testkit.eq(
    private.next_birthday_date(date '2000-02-29', date '2026-02-01') = date '2026-02-28',
    true,
    'la fenêtre de février couvre le 28 février'
  );
end;
$$;

-- ===========================================================================
-- 3. Ce que le job envoie, et ce qu'il déclare avoir envoyé
--
-- Aucun push n'est déclenché tant que personne n'est abonné. Les assertions
-- restent valables même si Vault contient un jour `push_endpoint`
-- (installation de l'Edge Function d'envoi) : sans abonné, le job n'a rien à
-- distribuer et n'appelle donc personne.
-- ===========================================================================
do $$
declare
  alice uuid := testkit.auth_user('anniv-dispatch@example.fr', 'Alice Martin');
  home text := testkit.household(alice, 'Foyer Martin');
  alice_m text := testkit.member(home, alice, 'Alice Martin', 'admin', 'accent');
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_birthday text := private.new_id('birthday');
  v_result jsonb;
  -- `least(…, 28)` évite de construire un 29 février sur une année non
  -- bissextile. Le prix à payer : entre le 29 et le 31 du mois, l'anniversaire
  -- construit est le 28, déjà passé, et son occurrence est l'année suivante.
  -- Ce test doit donc dire s'il prétend tester « le jour » ou « le 28 »,
  -- plutôt que d'échouer un tiers du temps selon la date d'exécution.
  v_birthday_is_today boolean := extract(day from v_today)::integer <= 28;
begin
  -- Anniversaire du jour : toujours dans la fenêtre, puisqu'il est à 0 jour.
  insert into public.birthdays (id, household_id, name, birth_date, linked_member_id)
  values (
    v_birthday,
    home,
    'Anniversaire du jour',
    make_date(
      extract(year from v_today)::integer - 30,
      extract(month from v_today)::integer,
      least(extract(day from v_today)::integer, 28)
    ),
    alice_m
  );

  if v_birthday_is_today then
    perform testkit.eq(
      (select count(*) from private.household_birthday_alerts(home) a where a.birthday_id = v_birthday),
      1::bigint,
      'un anniversaire daté du jour est dans la fenêtre, tous les jours'
    );
  end if;

  -- Le nouveau contrat. Depuis 0019, le dispatch ne rend plus les compteurs de
  -- fenêtre (« semaine », « mois ») : ce n'est plus à lui de décider de ce qui
  -- est dû, `public.due_push_notifications()` le fait. Il rend donc seulement ce
  -- qu'il a distribué, et ce qui reste lisible par un job pg_cron.
  --
  -- Ce qui remplace les compteurs, c'est la liste des notifications à envoyer,
  -- vérifiée directement sur la fonction qui la produit : c'est elle, et non le
  -- résumé, qui décide de ce qu'un membre recevra.
  if v_birthday_is_today then
    perform testkit.eq(
      (select count(*)
         from private.push_birthday_notifications(null) n
        where n.reminder_id = v_birthday),
      1::bigint,
      'l''anniversaire du jour produit une notification, pour le membre lié'
    );
    perform testkit.eq(
      (select n.tag || '|' || n.url || '|' || n.title
         from private.push_birthday_notifications(null) n
        where n.reminder_id = v_birthday),
      'anniversaire-' || v_birthday || '|/anniversaires|Anniversaire',
      'la notification porte une balise qui regroupe les envois du même jour'
    );
  end if;

  v_result := private.dispatch_birthday_alerts();

  perform testkit.ok(v_result ? 'due', 'le résumé contient le nombre de notifications à envoyer');
  perform testkit.ok(v_result ? 'dispatched', 'le résumé indique ce qui a été distribué');
  perform testkit.ok(v_result ? 'generated_at', 'le résumé est horodaté');

  -- Aucun membre de ce test n'a d'abonnement : le job n'a personne à notifier,
  -- et il n'essaie donc pas d'appeler l'Edge Function. Cette assertion reste
  -- vraie même si Vault contient un jour `push_endpoint`.
  perform testkit.eq(
    (v_result ->> 'due')::integer,
    0,
    'sans abonné, le job n''a personne à notifier'
  );
  perform testkit.eq(
    v_result ->> 'dispatched',
    'false',
    'rien n''est distribué quand il n''y a aucun destinataire'
  );
end;
$$;

-- Le dispatch des anniversaires ne lit aucun secret lui-même : il délègue à
-- `private.post_push_dispatch()`, qui est le seul point de lecture de Vault.
-- Deux points de lecture seraient deux endroits où un secret pourrait se
-- glisser. La preuve que la lecture a bien lieu, et qu'elle est différée à
-- l'exécution, est dans `0004_cron.sql` : la répéter ici demanderait à cette
-- fonction de porter un code qu'elle ne contient pas.
select testkit.ok(
  pg_get_functiondef('private.dispatch_birthday_alerts()'::regprocedure) like '%post_push_dispatch(''anniversaires'')%'
  and pg_get_functiondef('private.dispatch_birthday_alerts()'::regprocedure) not like '%vault.%',
  'le dispatch des anniversaires délègue la lecture des secrets'
);

-- ===========================================================================
-- 4. Job pg_cron
-- ===========================================================================
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron absent sur cette instance : assertions ignorées.';
    return;
  end if;

  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-birthday-alerts'),
    'le job des alertes d''anniversaire est installé'
  );
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-birthday-alerts' and schedule = '40 6 * * *'),
    'le job des anniversaires est planifié à 06 h 40'
  );
  perform testkit.ok(
    exists (select 1 from cron.job where jobname = 'eo-birthday-alerts' and database = current_database()),
    'le job vise explicitement la base courante'
  );
  perform testkit.ok(
    exists (select 1 from cron.job
             where jobname = 'eo-birthday-alerts'
               and command = 'select private.dispatch_birthday_alerts()'),
    'le job appelle une fonction privée sans paramètre'
  );
  perform testkit.ok(
    not exists (
      select 1 from cron.job
       where jobname = 'eo-birthday-alerts'
         and command ~* '(secret|token_hash|password|passwd|api[_-]?key|sb_secret|service_role|vault)'
    ),
    'aucun secret ni valeur sensible dans la commande planifiée'
  );
end;
$$;

-- ===========================================================================
-- 5. Privilèges : usage serveur uniquement
-- ===========================================================================
do $$
declare
  r text;
  v_functions text[] := array[
    'private.next_birthday_date(date,date)',
    'private.household_birthday_alerts(text,date)',
    'private.dispatch_birthday_alerts()'
  ];
begin
  foreach r in array v_functions loop
    perform testkit.eq(
      has_function_privilege('authenticated', r, 'EXECUTE')::text, 'false',
      'authenticated ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('anon', r, 'EXECUTE')::text, 'false',
      'anon ne doit pas pouvoir exécuter ' || r
    );
    perform testkit.eq(
      has_function_privilege('service_role', r, 'EXECUTE')::text, 'true',
      'service_role doit pouvoir exécuter ' || r
    );
  end loop;
end;
$$;

rollback;
