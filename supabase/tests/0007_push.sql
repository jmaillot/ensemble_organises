-- supabase/tests/0007_push.sql
-- Notifications Web Push : table inatteignable du client, enregistrement et
-- révocation d'un abonnement, calcul des rappels dus, préférences, consommation
-- et rapport de livraison.
--
-- Ce fichier s'exécute en `postgres` : les fonctions serveur sont réservées à
-- `service_role`, et `testkit` crée ses fixtures avec les droits du
-- propriétaire. Le rôle `authenticated` n'est basculé que pour les cas négatifs,
-- où il doit être REFUSÉ — c'est là que se joue la frontière.

begin;

-- Un endpoint plausible : 65 octets de clé publique en base64url, 22 caractères
-- de secret d'authentification. Les contraintes de longueur de la table ne sont
-- pas décoratives, et un jeu de données qui les violerait ne testerait rien.
create or replace function testkit.push_endpoint(p_suffix text)
returns text
language sql
immutable
as $$
  select 'https://fcm.googleapis.com/fcm/send/' || p_suffix
    || repeat('a', 100 - length(p_suffix));
$$;

create or replace function testkit.push_p256dh()
returns text
language sql
immutable
as $$
  select 'B' || repeat('c', 86);
$$;

create or replace function testkit.push_auth_secret()
returns text
language sql
immutable
as $$
  select 'D' || repeat('e', 21);
$$;

-- ===========================================================================
-- 1. La table est inaccessible au client
-- ===========================================================================
insert into testkit.fx (key, user_id) values ('camille', testkit.auth_user('camille@example.fr', 'Camille Martin'));
insert into testkit.fx (key, user_id) values ('thomas', testkit.auth_user('thomas@example.fr', 'Thomas Martin'));

select testkit.as_user(user_id, 'camille@example.fr') from testkit.fx where key = 'camille';
set local role authenticated;

-- Aucune politique ne filtre une absence de politique : sans RLS active, ces
-- requêtes liraient la table entière. Le refus doit venir du PRIVILÈGE, pas
-- d'un filtre qui rendrait compte zéro — c'est la rétrospective §2.4.
select testkit.expect_denied(
  'select * from public.push_subscriptions',
  'un client ne peut pas lire les abonnements push, ni les siens');
select testkit.expect_denied(
  format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values (%L, %L, %L, %L)',
    (select user_id from testkit.fx where key = 'camille'),
    testkit.push_endpoint('c1'), testkit.push_p256dh(), testkit.push_auth_secret()),
  'un client ne peut pas enregistrer son propre abonnement');
select testkit.expect_denied(
  'delete from public.push_subscriptions',
  'un client ne peut pas supprimer un abonnement');

-- Les fonctions serveur sont réservées à service_role : avec un JWT
-- utilisateur, l'appelant EST authenticated.
select testkit.expect_denied(
  format('select public.list_push_subscriptions(%L)', (select user_id from testkit.fx where key = 'camille')),
  'un client ne peut pas lister ses appareils par la fonction serveur');
select testkit.expect_denied(
  format('select public.register_push_subscription(%L, %L, %L, %L, null, null)',
    (select user_id from testkit.fx where key = 'camille'),
    testkit.push_endpoint('c1'), testkit.push_p256dh(), testkit.push_auth_secret()),
  'un client ne peut pas enregistrer un abonnement par la fonction serveur');
select testkit.expect_denied(
  format('select public.due_push_notouncements(''rappels'', now(), null)'),
  'un client ne peut pas lire les rappels dus de tous les foyers');
select testkit.expect_denied(
  'select public.record_push_deliveries(''[]''::jsonb, 10)',
  'un client ne peut pas altérer les rapports de livraison');
select testkit.expect_denied(
  'select public.due_push_notifications(''test'', now(), null)',
  'un test exige un utilisateur connu : sans lui, il ne viserait personne');
select testkit.expect_denied(
  'select public.consume_push_reminders(''[]''::jsonb)',
  'un client ne peut pas supprimer les rappels des autres foyers');

reset role;

-- ===========================================================================
-- 2. Enregistrement, renouvellement, révocation
-- ===========================================================================
do $$
declare
  v_camille uuid;
  v_thomas uuid;
  v_result jsonb;
  v_devices jsonb;
begin
  select user_id into v_camille from testkit.fx where key = 'camille';
  select user_id into v_thomas from testkit.fx where key = 'thomas';

  v_result := public.register_push_subscription(
    v_camille, testkit.push_endpoint('c1'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Firefox sur Linux');
  perform testkit.ok(v_result ->> 'id' is not null, 'l''abonnement renvoie son identifiant');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    1::bigint,
    'un abonnement enregistré existe en base'
  );

  -- Réinscription du MÊME endpoint avec les mêmes clés : rien à écrire, et
  -- surtout pas de doublon. C'est le cas normal au retour sur l'application.
  v_result := public.register_push_subscription(
    v_camille, testkit.push_endpoint('c1'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Firefox sur Linux');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    1::bigint,
    'une réinscription identique ne duplique pas l''abonnement'
  );

  -- Clés renouvelées : la ligne est mise à jour, pas dupliquée.
  perform public.register_push_subscription(
    v_camille, testkit.push_endpoint('c1'), 'E' || repeat('f', 86), testkit.push_auth_secret(), null, 'Firefox sur Linux');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    1::bigint,
    'un renouvellement de clés met à jour l''abonnement existant'
  );
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions where p256dh like ''E%'''),
    1::bigint,
    'les nouvelles clés sont bien enregistrées'
  );

  -- Le même endpoint, un autre compte : l'appareil change de main.
  perform public.register_push_subscription(
    v_thomas, testkit.push_endpoint('c1'), 'E' || repeat('f', 86), testkit.push_auth_secret(), null, 'Firefox sur Linux');
  perform testkit.eq(
    (select user_id from public.push_subscriptions where endpoint = testkit.push_endpoint('c1')),
    v_thomas,
    'un endpoint détenu par un autre compte est transféré, pas dupliqué'
  );

  -- La liste ne renvoie QUE ses propres appareils, et jamais leurs clés.
  v_devices := public.list_push_subscriptions(v_thomas);
  perform testkit.eq(jsonb_array_length(v_devices), 1, 'chaque membre voit ses seuls appareils');
  perform testkit.ok(
    v_devices -> 0 ->> 'endpoint' = testkit.push_endpoint('c1'),
    'l''endpoint est renvoyé à son propriétaire : le navigateur en a besoin'
  );
  perform testkit.ok(
    v_devices -> 0 ? 'p256dh' is not true and v_devices -> 0 ? 'auth_secret' is not true,
    'les clés de chiffrement ne quittent jamais le serveur'
  );
  perform testkit.eq(jsonb_array_length(public.list_push_subscriptions(v_camille)), 0,
    'le précédent propriétaire n''a plus d''appareil');

  -- Révocation : le `user_id` du WHERE n'est pas décoratif.
  perform testkit.eq(public.remove_push_subscription(v_camille, testkit.push_endpoint('c1')), false,
    'on ne révoque pas l''appareil d''un autre membre');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    1::bigint,
    'l''appareil du membre est intact après une révocation étrangère'
  );
  perform testkit.eq(public.remove_push_subscription(v_thomas, testkit.push_endpoint('c1')), true,
    'le propriétaire révoque son appareil');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    0::bigint,
    'l''abonnement révoqué a disparu'
  );
end;
$$;

-- Un endpoint qui n'est pas une URL HTTPS, ou des clés mal formées, sont
-- refusés par les contraintes : ces valeurs ne pourraient rien recevoir.
do $$
declare
  v_camille uuid;
begin
  select user_id into v_camille from testkit.fx where key = 'camille';

  perform testkit.expect_denied(format(
    'select public.register_push_subscription(%L, %L, %L, %L, null, null)',
    v_camille, 'http://fcm.googleapis.com/fcm/send/x', testkit.push_p256dh(), testkit.push_auth_secret()),
    'un endpoint en HTTP ne peut pas être enregistré');
  perform testkit.expect_denied(format(
    'select public.register_push_subscription(%L, %L, %L, %L, null, null)',
    v_camille, testkit.push_endpoint('x1'), 'trop-court', testkit.push_auth_secret()),
    'une clé publique tronquée est refusée');
  perform testkit.expect_denied(format(
    'select public.register_push_subscription(%L, %L, %L, %L, null, null)',
    v_camille, testkit.push_endpoint('x1'), testkit.push_p256dh(), 'trop-court'),
    'un secret d''authentification tronqué est refusé');
  perform testkit.expect_denied(format(
    'select public.register_push_subscription(null, %L, %L, %L, null, null)',
    testkit.push_endpoint('x1'), testkit.push_p256dh(), testkit.push_auth_secret()),
    'un appel sans acteur est refusé : l''identifiant ne se devine pas');
  perform testkit.eq(
    testkit.count('select 1 from public.push_subscriptions'),
    0::bigint,
    'aucun des appels refusés n''a laissé de trace'
  );
end;
$$;

-- ===========================================================================
-- 3. Rappels dus : fenêtre, destinataires, préférences
-- ===========================================================================
do $$
declare
  v_alice uuid := testkit.auth_user('alice@example.fr', 'Alice Martin');
  v_bob uuid := testkit.auth_user('bob@example.fr', 'Bob Martin');
  v_kid uuid := testkit.auth_user('kid@example.fr', 'Noé Martin');
  v_home text := testkit.household(v_alice, 'Foyer A');
  v_other text := testkit.household(v_alice, 'Foyer B');
  v_alice_m text := testkit.member(v_home, v_alice, 'Alice Martin', 'admin', 'accent');
  v_bob_m text := testkit.member(v_home, v_bob, 'Bob Martin', 'membre', 'coral');
  -- Membre sans compte : personne à notifier, donc personne ne doit l'être.
  v_kid_m text := testkit.member(v_home, v_kid, 'Noé Martin', 'enfant', 'amber');
  v_task text := private.new_id('task');
  v_task_id text;
  v_event text := private.new_id('event');
  v_event_id text;
  v_routine text := private.new_id('routine');
  v_routine_id text;
  v_due jsonb;
  v_recipients uuid[];
begin
  insert into public.tasks (id, household_id, name, description, due_date, status, created_by)
  values (v_task, v_home, 'Sortir le chien', 'Avant 20 h', current_date, 'a_faire', v_alice_m);
  v_task_id := v_task;

  insert into public.events (id, household_id, title, start_at, created_by)
  values (v_event, v_home, 'Médecin', now() + interval '2 hours', v_alice_m);
  v_event_id := v_event;

  insert into public.routines (id, household_id, name, recurrence_rule, created_by)
  values (v_routine, v_home, 'Poubelle', 'FREQ=WEEKLY;BYDAY=WE', v_alice_m);
  v_routine_id := v_routine;

  -- Rappel dû il y a dix minutes : dans la fenêtre.
  insert into public.task_reminders (id, task_id, remind_at)
  values (private.new_id('task-reminder'), v_task_id, now() - interval '10 minutes');
  insert into public.event_reminders (id, event_id, remind_at)
  values (private.new_id('event-reminder'), v_event_id, now() - interval '5 minutes');
  insert into public.routine_reminders (id, routine_id, remind_at)
  values (private.new_id('routine-reminder'), v_routine_id, now() - interval '1 minutes');

  -- Trop vieux, et dans le futur : ni l'un ni l'autre n'est dû.
  insert into public.task_reminders (id, task_id, remind_at)
  values (private.new_id('task-reminder'), v_task_id, now() - interval '25 hours');
  insert into public.task_reminders (id, task_id, remind_at)
  values (private.new_id('task-reminder'), v_task_id, now() + interval '3 hours');

  v_due := public.due_push_notifications('rappels', now(), null);
  perform testkit.eq(jsonb_array_length(v_due), 3, 'trois rappels sont dus, les autres sont hors fenêtre ou futurs');

  perform testkit.ok(
    exists (select 1 from jsonb_array_elements(v_due) n where n.value ->> 'url' = '/taches' and n.value ->> 'title' like 'Tâche%'),
    'le rappel de tâche est annoncé avec son titre'
  );
  perform testkit.ok(
    exists (select 1 from jsonb_array_elements(v_due) n where n.value ->> 'body' like '%Échéance%'),
    'le rappel de tâche porte l''échéance'
  );
  perform testkit.ok(
    exists (select 1 from jsonb_array_elements(v_due) n where n.value ->> 'url' = '/calendrier'),
    'le rappel d''événement pointe vers le calendrier'
  );

  -- Sans assignataire, le rappel va au créateur — et à lui seul, pas à tout
  -- le foyer : c'est la règle documentée dans la migration 0019.
  select array_agg(distinct (n.value ->> 'user_id')::uuid) into v_recipients
    from jsonb_array_elements(v_due) n
   where n.value ->> 'url' in ('/taches', '/calendrier', '/routines');
  perform testkit.eq(v_recipients, array[v_alice]::uuid[],
    'sans destinataire déclaré, le rappel va au créateur et à lui seul');

  -- Le membre `enfant` n'a pas de compte : il ne doit apparaître nulle part.
  perform testkit.ok(
    not exists (select 1 from jsonb_array_elements(v_due) n where n.value ->> 'user_id' = v_kid::text),
    'un membre sans compte n''est jamais destinataire'
  );

  -- Le rappel ne touche que LE foyer concerné.
  perform testkit.ok(
    not exists (select 1 from jsonb_array_elements(v_due) n where n.value ->> 'household_id' = v_other),
    'aucun rappel ne fuit vers un autre foyer du même membre'
  );

  -- Une tâche terminée n'a plus rien à annoncer.
  update public.tasks set status = 'fait' where id = v_task_id;
  perform testkit.eq(
    testkit.count('select 1 from private.push_reminder_notifications(now()) where url = ''/taches'''),
    0::bigint,
    'une tâche terminée n''est plus rappelée'
  );
  update public.tasks set status = 'a_faire' where id = v_task_id;

  -- Un événement déjà commencé non plus.
  update public.events set start_at = now() - interval '1 hour' where id = v_event_id;
  perform testkit.eq(
    testkit.count('select 1 from private.push_reminder_notifications(now()) where url = ''/calendrier'''),
    0::bigint,
    'un événement déjà commencé n''est plus rappelé'
  );
  update public.events set start_at = now() + interval '2 hours' where id = v_event_id;

  -- Un assignataire reçoit le rappel, et le créateur ne le reçoit pas une
  -- seconde fois pour la même tâche.
  insert into public.task_assignees (task_id, member_id) values (v_task_id, v_bob_m);
  perform testkit.eq(
    testkit.count('select 1 from private.push_reminder_notifications(now()) where url = ''/taches'''),
    1::bigint,
    'l''assignataire reçoit le rappel de sa tâche'
  );
  perform testkit.eq(
    (select user_id from private.push_reminder_notifications(now()) where url = '/taches'),
    v_bob,
    'le rappel de tâche va à l''assignataire, pas au créateur'
  );
  delete from public.task_assignees where task_id = v_task_id and member_id = v_bob_m;

  -- Les préférences coupent l'envoi, et une seule catégorie à la fois.
  update public.profiles set task_reminders_enabled = false where id = v_alice;
  -- `format(…, %L)` et non une chaîne littérale. Une comparaison sur une
  -- colonne `jsonb` demande elle-même des apostrophes ; une seule non doublée
  -- ne ferme pas la chaîne, elle crée un TROISIÈME argument à `count()`, et
  -- l'échec porte alors sur une ARITÉ — très loin de la cause réelle. C'est la
  -- forme déjà employée par `0001_schema_contract.sql` et `0002_rls_isolation.sql`.
  perform testkit.eq(
    testkit.count(format(
      'select 1 from jsonb_array_elements(public.due_push_notifications(%L, now(), null)) n where n.value ->> %L = %L',
      'rappels', 'url', '/taches')),
    0::bigint,
    'un membre qui a coupé les rappels de tâches n''en reçoit plus'
  );
  perform testkit.ok(
    exists (select 1 from jsonb_array_elements(public.due_push_notifications('rappels', now(), null)) n where n.value ->> 'url' = '/routines'),
    'couper les rappels de tâches ne coupe pas ceux de routines'
  );
  update public.profiles set task_reminders_enabled = true where id = v_alice;

  -- L'échéance seule ne suffit pas : quelqu'un doit être abonné.
  perform testkit.ok(
    exists (
      select 1 from jsonb_array_elements(public.due_push_notifications('rappels', now(), null)) n
       where jsonb_array_length(n.value -> 'subscriptions') = 0
    ),
    'sans abonnement, la notification est préparée mais n''a aucun appareil'
  );

  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('a1'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Chrome');
  perform testkit.ok(
    exists (
      select 1 from jsonb_array_elements(public.due_push_notifications('rappels', now(), null)) n
       where jsonb_array_length(n.value -> 'subscriptions') = 1
    ),
    'un abonné reçoit ses appareils dans la notification à envoyer'
  );

  -- Les clés voyagent avec la notification, et nulle part ailleurs.
  perform testkit.ok(
    exists (
      select 1
        from jsonb_array_elements(public.due_push_notifications('rappels', now(), null)) n,
             jsonb_array_elements(n.value -> 'subscriptions') s
       where s.value ->> 'p256dh' = testkit.push_p256dh()
    ),
    'la clé publique de l''appareil accompagne la notification à chiffrer'
  );

  -- Le test manuel ne lit aucune table métier : un seul destinataire possible.
  --
  -- Et ce destinataire ne peut pas être omis. La fonction lève une exception si
  -- `p_user_id` est nul, et c'est une propriété de sécurité, pas une
  -- commodité : un appel sans destinataire produirait une notification que
  -- personne ne reçoit, et un appel qui devinerait l'identifiant d'un autre
  -- enverrait hors de son propre foyer. La fonction d'envoi deviendrait un
  -- service de messagerie ouvert à quiconque possède une session — ce que
  -- l'écriture du message dans la base, en 0019, cherche précisément à
  -- empêcher.
  perform testkit.expect_denied(
    'select public.due_push_notifications(''test'', now(), null)',
    'un test sans destinataire est refusé'
  );
  perform testkit.eq(
    jsonb_array_length(public.due_push_notifications('test', now(), v_alice)),
    1,
    'un test produit exactement une notification'
  );
  -- Le titre et la cible sont écrits par la base : l'appelant n'a aucun
  -- paramètre pour les choisir, et cette assertion le verrouille.
  perform testkit.eq(
    (select n.value ->> 'title'
       from jsonb_array_elements(public.due_push_notifications('test', now(), v_alice)) n),
    'Notifications activées',
    'le titre du test est écrit par la base, pas par l''appelant'
  );
  perform testkit.eq(
    (select n.value ->> 'url'
       from jsonb_array_elements(public.due_push_notifications('test', now(), v_alice)) n),
    '/parametres',
    'le test renvoie vers les paramètres, seul endroit où on peut le couper'
  );
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(public.due_push_notifications('test', now(), v_alice)) n
      where n.value ->> 'user_id' = v_alice::text),
    1::bigint,
    'le test ne vise que le demandeur'
  );
  perform testkit.eq(
    (select count(*) from jsonb_array_elements(public.due_push_notifications('test', now(), v_bob)) n
      where n.value ->> 'user_id' = v_bob::text),
    1::bigint,
    'un autre membre ne reçoit rien de ce test'
  );
end;
$$;

-- ===========================================================================
-- 4. Consommation et rapport de livraison
-- ===========================================================================
do $$
declare
  v_alice uuid;
  v_consumed integer;
  v_report jsonb;
  -- `bigint`, et non `integer` : `testkit.count()` renvoie un bigint, et
  -- `testkit.eq` est `eq(anyelement, anyelement, text)` — les deux arguments
  -- doivent être du MÊME type, sinon PostgreSQL ne trouve aucune surcharge et
  -- répond « function testkit.eq(bigint, integer, unknown) does not exist ».
  -- L'affectation, elle, accepte bigint → integer sans bruit : le défaut
  -- n'apparaissait qu'à la comparaison.
  v_before bigint;
begin
  select user_id into v_alice from testkit.fx where key = 'camille';

  -- La section 2 a terminé sur ZERO abonnement : le seul endpoint créé a été
  -- transféré à Thomas puis révoqué. Toute la suite ci-dessous porte sur « un
  -- appareil enregistré pour Camille », donc cet appareil est créé ICI, et pas
  -- laissé pour compte. Sans cette ligne, les identifiants lus plus bas
  -- vaudraient NULL, le rapport ne compterait rien, et la première assertion de
  -- cette section échouerait — pour une raison qui n'a rien à voir avec ce
  -- qu'elle vérifie.
  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('a1'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Chrome');

  v_before := testkit.count('select 1 from public.task_reminders');
  perform testkit.eq(public.consume_push_reminders('[]'::jsonb), 0, 'une liste vide ne consomme rien');
  perform testkit.eq(public.consume_push_reminders(null), 0, 'une absence de liste ne consomme rien');
  perform testkit.eq(
    public.consume_push_reminders('[{"kind":"tache","id":"task-reminder_inexistant"}]'::jsonb), 0,
    'un rappel inexistant ne compte pas comme consommé'
  );
  perform testkit.eq(
    testkit.count('select 1 from public.task_reminders'), v_before,
    'les rappels intacts le restent'
  );

  -- Un `kind` inconnu ne supprime rien : mieux vaut un doublon qu'une perte.
  v_consumed := public.consume_push_reminders(jsonb_build_array(
    jsonb_build_object('kind', 'anniversaire', 'id', (select id from public.task_reminders limit 1)),
    jsonb_build_object('kind', 'evenement', 'id', (select id from public.event_reminders limit 1)),
    jsonb_build_object('kind', 'routine', 'id', (select id from public.routine_reminders limit 1))
  ));
  perform testkit.eq(v_consumed, 2, 'seuls les types connus sont consommés');
  perform testkit.eq(
    testkit.count('select 1 from public.task_reminders'), v_before,
    'un type inconnu ne consomme aucun rappel'
  );

  -- Livraison réussie : l'horodatage avance, le compteur d'échecs repart de zéro.
  -- Le compteur est mis à 4 à la main : aucun envoi n'a eu lieu dans cette
  -- campagne, et c'est précisément ce que le test doit pouvoir reproduire.
  update public.push_subscriptions set failure_count = 4, last_status = 503 where user_id = v_alice;
  v_report := public.record_push_deliveries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.push_subscriptions where user_id = v_alice), 'delivered', true, 'status', 201)
  ));
  perform testkit.eq(v_report ->> 'delivered', '1', 'un envoi accepté est compté');
  perform testkit.eq(
    (select failure_count from public.push_subscriptions where user_id = v_alice), 0,
    'un envoi réussi remet le compteur d''échecs à zéro'
  );
  perform testkit.ok(
    (select last_success_at from public.push_subscriptions where user_id = v_alice) is not null,
    'un envoi réussi horodate le dernier succès'
  );

  -- 410 : l'endpoint est mort, l'abonnement disparaît.
  v_report := public.record_push_deliveries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.push_subscriptions where user_id = v_alice), 'delivered', false, 'status', 410)
  ));
  perform testkit.eq(v_report ->> 'dropped', '1', 'un 410 supprime l''abonnement');
  perform testkit.eq(
    (select count(*) from public.push_subscriptions where user_id = v_alice),
    0::bigint,
    'l''abonnement mort a bien disparu'
  );

  -- 503 : incident passager, l'abonnement est conservé… jusqu'au seuil.
  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('a2'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Chrome');
  v_report := public.record_push_deliveries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.push_subscriptions where user_id = v_alice), 'delivered', false, 'status', 503)
  ));
  perform testkit.eq(v_report ->> 'failed', '1', 'une erreur passagère est comptée comme échec');
  perform testkit.eq(
    (select count(*) from public.push_subscriptions where user_id = v_alice),
    1::bigint,
    'une erreur passagère conserve l''abonnement'
  );

  -- Au dixième échec, l'appareil deserté est retiré. Il y en a UN au compteur
  -- depuis le 503 ci-dessus : il en faut donc NEUF de plus, pas un seul. Un
  -- appel unique n'aurait porté le compteur qu'à 2 et l'abonnement aurait
  -- survécu — l'assertion aurait échoué en donnant à croire à un seuil faux.
  perform public.record_push_deliveries(
    (select jsonb_agg(jsonb_build_object('id', s.id, 'delivered', false, 'status', 503) order by g.n)
       from generate_series(1, 9) as g(n)
       cross join (select id from public.push_subscriptions where user_id = v_alice) as s),
    10);
  perform testkit.eq(
    (select count(*) from public.push_subscriptions where user_id = v_alice),
    0::bigint,
    'un appareil qui échoue dix fois de suite est retiré'
  );

  -- Un identifiant inconnu ne fait pas échouer le rapport. Il est TOUT DE
  -- MÊME compté comme distribué : le rapport décrit les envois tentés, et la
  -- ligne disparue n'a plus personne à qui l'annoncer. C'est vérifié ici pour
  -- que le comportement soit au moins connu, pas parce qu'il serait souhaitable.
  v_report := public.record_push_deliveries('[{"id":"push_inexistant","delivered":true,"status":201}]'::jsonb);
  perform testkit.eq(v_report ->> 'delivered', '1',
    'un rapport sur un abonnement déjà supprimé reste sans erreur, et compte la tentative');

  -- Le seuil est paramétrable, et un seuil nul ne devient pas « zéro échec ».
  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('a3'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Chrome');
  v_report := public.record_push_deliveries(jsonb_build_array(
    jsonb_build_object('id', (select id from public.push_subscriptions where user_id = v_alice), 'delivered', false, 'status', 503)
  ), 0);
  perform testkit.eq(
    (select count(*) from public.push_subscriptions where user_id = v_alice),
    0::bigint,
    'un seuil nul signifie « au premier échec », pas « jamais »'
  );
end;
$$;

-- ===========================================================================
-- 5. Nettoyage des abonnements inactifs
-- ===========================================================================
do $$
declare
  v_alice uuid;
begin
  select user_id into v_alice from testkit.fx where key = 'camille';

  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('vieux'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Ancien');
  update public.push_subscriptions
     set created_at = now() - interval '2 years',
         last_success_at = now() - interval '2 years'
   where endpoint = testkit.push_endpoint('vieux');

  perform public.register_push_subscription(
    v_alice, testkit.push_endpoint('recent'), testkit.push_p256dh(), testkit.push_auth_secret(), null, 'Récent');

  perform testkit.eq(private.prune_inactive_push_subscriptions(), 1,
    'un abonnement sans succès depuis six mois est purgé');
  perform testkit.eq(
    testkit.count(format('select 1 from public.push_subscriptions where endpoint = %L', testkit.push_endpoint('recent'))),
    1::bigint,
    'un abonnement récent est conservé'
  );
end;
$$;

-- ===========================================================================
-- 6. Le point d'entrée reste unique
--
-- Seul le chemin « rien à envoyer » est exercé ici : le chemin peuplé
-- appelle `net.http_post`, c'est-à-dire la fonction d'envoi pour de vrai. Le
-- contenu des rappels dus est validé en §3, et l'envoi lui-même ne peut pas
-- s'exécuter dans une transaction annulée.
-- ===========================================================================
do $$
declare
  v_result jsonb;
begin
  delete from public.push_subscriptions;
  delete from public.task_reminders;
  delete from public.event_reminders;
  delete from public.routine_reminders;

  v_result := private.dispatch_push_notifications();
  perform testkit.eq(v_result ->> 'due', '0', 'le job des rappels ne compte plus rien');
  perform testkit.eq(v_result ->> 'dispatched', 'false',
    'sans rien à envoyer, le job n''appelle pas la fonction d''envoi : la stack ne se réveille pas quatre fois par heure');

  v_result := private.dispatch_birthday_alerts();
  perform testkit.eq(v_result ->> 'due', '0', 'le job anniversaires ne compte que les anniversaires du jour');
  perform testkit.eq(v_result ->> 'dispatched', 'false', 'le job anniversaires n''appelle rien sans destinataire');
end;
$$;

rollback;
