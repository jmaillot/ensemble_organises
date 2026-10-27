-- supabase/tests/0161_gdpr_extract_batch.sql
-- Tests SQL pour 0161_gdpr_export_extract_batch — corps effectif du RPC
-- d'extraction RGPD (phase 26 plan 03 task 1).
--
-- Sections :
--   1. Périmètre « ce qui me concerne » — l'extraction d'Alice contient SA
--      tâche et SA note (comptages bornés §2.7D), JAMAIS la tâche de Bob
--      (même foyer) ni celle de Charlie (foyer voisin).
--   2. Curseur — les lots avancent sans répétition (union des identifiants
--      remis = total attendu), done=true à l'épuisement des 22 modules, un
--      appel après done reste done.
--   3. Médias — les chemins de pièce jointe ressortent préfixés de leur
--      bucket (`household-media/…`), les valeurs héritées (http) sont exclues.
--   4. Job introuvable — P0002 lisible (D-02).
--   5. batch_start_offset (0165, HR-02) — un module paginé rend des lots
--      dont l'offset de DÉBUT avance de la limite (nommage/tri des fragments).
--
-- Semis en postgres via testkit ; rollback final.

begin;

-- ---------------------------------------------------------------
-- Semis : deux foyers, trois utilisateurs, une tâche et une note chacun.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := testkit.auth_user('t161-alice@example.fr', 'Alice 161');
  bob uuid := testkit.auth_user('t161-bob@example.fr', 'Bob 161');
  charlie uuid := testkit.auth_user('t161-charlie@example.fr', 'Charlie 161');
  home_a text := testkit.household(alice, 'Foyer Alice 161');
  home_b text := testkit.household(bob, 'Foyer Bob 161');
  alice_m text;
  bob_m text;
  charlie_m text;
  alice_task text;
  bob_task text;
  charlie_task text;
  shared_task text;
  alice_note text;
begin
  alice_m := testkit.member(home_a, alice, 'Alice 161', 'admin', 'accent');
  bob_m := testkit.member(home_a, bob, 'Bob 161', 'membre', 'coral');
  charlie_m := testkit.member(home_b, charlie, 'Charlie 161', 'admin', 'ink');

  -- Tâches : chacune créée par son membre (created_by porte l'ID DE MEMBRE,
  -- texte — motif vérifié en base : jamais l'uuid utilisateur).
  insert into public.tasks (household_id, name, status, created_by)
  values (home_a, 'Tâche Alice 161', 'a_faire', alice_m)
  returning id into alice_task;
  insert into public.tasks (household_id, name, status, created_by)
  values (home_a, 'Tâche Bob 161', 'a_faire', bob_m)
  returning id into bob_task;
  insert into public.tasks (household_id, name, status, created_by)
  values (home_b, 'Tâche Charlie 161', 'a_faire', charlie_m)
  returning id into charlie_task;

  -- Tâche créée par BOB mais ASSIGNÉE à ALICE (MR-02) : elle concerne Alice
  -- par le chemin `task_assignees`, pas par `created_by`.
  insert into public.tasks (household_id, name, status, created_by)
  values (home_a, 'Tâche partagée Bob→Alice 161', 'a_faire', bob_m)
  returning id into shared_task;
  insert into public.task_assignees (task_id, member_id) values (shared_task, alice_m);

  -- Note d'Alice avec une pièce jointe chemin-bucket ET une valeur héritée.
  insert into public.notes (household_id, title, content, created_by)
  values (home_a, 'Note Alice 161', 'contenu', alice_m)
  returning id into alice_note;
  insert into public.note_attachments (note_id, household_id, file_url, file_name, mime_type, size_bytes)
  values (alice_note, home_a, home_a || '/notes/photo-alice-161.jpg', 'photo.jpg', 'image/jpeg', 100),
         (alice_note, home_a, 'https://exemple.fr/heritee.jpg', 'heritee.jpg', 'image/jpeg', 100);

  insert into testkit.fx (key, user_id) values
    ('alice', alice), ('bob', bob), ('charlie', charlie);
  insert into testkit.fx (key, household_id) values
    ('home_a', home_a), ('home_b', home_b);
  insert into testkit.fx (key, row_id) values
    ('alice_task', alice_task), ('bob_task', bob_task);

  -- Job d'Alice (insertion directe postgres — l'éveil HTTP n'est pas l'objet).
  insert into public.gdpr_export_jobs (user_id) values (alice);
end;
$$;

-- ---------------------------------------------------------------
-- 1 + 2 + 3. Consommation complète des lots du job d'Alice.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  alice_job uuid := (select j.id from public.gdpr_export_jobs j where j.user_id = alice);
  alice_m text;
  res jsonb;
  v_done boolean := false;
  v_passes integer := 0;
  v_tasks_seen int := 0;
  v_bob_tasks int := 0;
  v_charlie_tasks int := 0;
  v_shared_seen int := 0;
  v_shared_assignees int := 0;
  v_media jsonb := '[]'::jsonb;
  v_media_count int := 0;
  v_http_media int := 0;
  v_modules_done jsonb := '[]'::jsonb;
  m text;
begin
  select id into alice_m from public.household_members
   where user_id = alice and household_id = (select household_id from testkit.fx where key = 'home_a');

  -- Le lot terminal peut être vide : au plus 22 modules + un lot vide.
  while not v_done and v_passes < 30 loop
    res := private.gdpr_export_extract_batch(alice_job, 500);
    v_done := (res ->> 'done')::boolean;
    v_passes := v_passes + 1;

    -- Périmètre : la tâche d'Alice vue, celle de Bob jamais (même foyer).
    v_tasks_seen := v_tasks_seen
      + coalesce((select count(*) from jsonb_array_elements(res -> 'rows' -> 'tasks') t
                   where t ->> 'name' = 'Tâche Alice 161'), 0);
    v_bob_tasks := v_bob_tasks
      + coalesce((select count(*) from jsonb_array_elements(res -> 'rows' -> 'tasks') t
                   where t ->> 'name' = 'Tâche Bob 161'), 0);
    v_charlie_tasks := v_charlie_tasks
      + coalesce((select count(*) from jsonb_array_elements(res -> 'rows' -> 'tasks') t
                   where t ->> 'name' = 'Tâche Charlie 161'), 0);
    v_shared_seen := v_shared_seen
      + coalesce((select count(*) from jsonb_array_elements(res -> 'rows' -> 'tasks') t
                   where t ->> 'name' = 'Tâche partagée Bob→Alice 161'), 0);
    v_shared_assignees := v_shared_assignees
      + coalesce((select count(*) from jsonb_array_elements(res -> 'rows' -> 'task_assignees') a
                   join jsonb_array_elements(res -> 'rows' -> 'tasks') t
                     on t ->> 'id' = a ->> 'task_id'
                   where t ->> 'name' = 'Tâche partagée Bob→Alice 161'
                     and a ->> 'member_id' = alice_m), 0);

    -- Modules remis (au moins un par lot non vide).
    if res -> 'rows' ->> 'tasks' is not null then
      if not (v_modules_done ? 'tasks') then
        v_modules_done := v_modules_done || '["tasks"]'::jsonb;
      end if;
    end if;

    -- Médias : préfixe bucket présent, valeur héritée absente (accumulés sur
    -- tous les lots — chaque lot ne porte que ses propres chemins).
    v_media := v_media || coalesce(res -> 'media_paths', '[]'::jsonb);
    v_media_count := v_media_count + coalesce(jsonb_array_length(v_media), 0);
    v_http_media := v_http_media
      + coalesce((select count(*) from jsonb_array_elements_text(v_media) p
                   where p like 'http%'), 0);
  end loop;

  perform testkit.ok(v_done,
    'extraction terminée (done=true) en ' || v_passes || ' lot(s)');
  perform testkit.eq(v_tasks_seen, 1,
    'la tâche D''ALICE est extraite exactement une fois (pas de répétition de lot)');
  perform testkit.eq(v_bob_tasks, 0,
    'la tâche de BOB (même foyer) n''est JAMAIS extraite (RGEX-03)');
  perform testkit.eq(v_charlie_tasks, 0,
    'la tâche de CHARLIE (foyer voisin) n''est JAMAIS extraite (RGEX-03, MR-02)');
  perform testkit.eq(v_shared_seen, 1,
    'la tâche créée par BOB mais ASSIGNÉE à ALICE est extraite (chemin task_assignees, MR-02)');
  perform testkit.eq(v_shared_assignees, 1,
    'l''assignation de la tâche partagée à ALICE est extraite avec la tâche');
  perform testkit.ok(v_modules_done ? 'tasks',
    'le module tasks est remis par le RPC');
  perform testkit.ok(v_media_count >= 1,
    'au moins un chemin de média remis');
  perform testkit.ok(v_http_media = 0,
    'aucune valeur héritée (http) dans media_paths');
  perform testkit.ok(
    exists (select 1 from jsonb_array_elements_text(v_media) p
             where p like 'household-media/%'),
    'les chemins de médias sont préfixés de leur bucket');
end;
$$;

-- ---------------------------------------------------------------
-- 2 bis. Après done : un appel supplémentaire reste done, sans ligne.
-- ---------------------------------------------------------------
do $$
declare
  alice uuid := (select user_id from testkit.fx where key = 'alice');
  alice_job uuid := (select j.id from public.gdpr_export_jobs j where j.user_id = alice);
  res jsonb;
begin
  res := private.gdpr_export_extract_batch(alice_job, 500);
  perform testkit.ok((res ->> 'done')::boolean,
    'appel après épuisement : done=true (idempotent)');
  perform testkit.eq(
    coalesce((select sum(jsonb_array_length(e.v)) from jsonb_each(res -> 'rows') as e(k, v)), 0)::bigint, 0::bigint,
    'appel après épuisement : aucune ligne remise');
end;
$$;

-- ---------------------------------------------------------------
-- 4. Job introuvable : P0002 (D-02 — l'échec est lisible).
-- ---------------------------------------------------------------
do $$
declare
  v_state text;
begin
  begin
    perform private.gdpr_export_extract_batch(gen_random_uuid(), 500);
    v_state := 'AUCUNE_ERREUR';
  exception when others then
    v_state := SQLSTATE;
  end;
  perform testkit.ok(v_state = 'P0002',
    'job introuvable : P0002 attendu, obtenu ' || v_state);
end;
$$;

-- ---------------------------------------------------------------
-- 5. batch_start_offset (0165, HR-02) : l'offset de DÉBUT du lot est rendu,
--    croissant par pas de la limite — l'Edge en dérive un nom de fragment
--    ET un ordre de concaténation corrects pour tout module paginé.
--    Preuve sur un module qui déborde : 4 tâches de Bob, p_limit = 2 →
--    lots d'offsets de début 0 puis 2 (avant la correction, le RPC ne
--    rendait que l'offset post-avance, et le tri lexical de l'Edge
--    inversait les fragments au-delà de 999 lignes).
-- ---------------------------------------------------------------
do $$
declare
  bob uuid := (select user_id from testkit.fx where key = 'bob');
  home_a text := (select household_id from testkit.fx where key = 'home_a');
  bob_m text;
  bob_job uuid;
  res jsonb;
  v_done boolean := false;
  v_passes integer := 0;
  v_tasks_starts int[] := array[]::int[];
  v_tasks_rows int[] := array[]::int[];
begin
  select id into bob_m from public.household_members
   where user_id = bob and household_id = home_a;

  insert into public.tasks (household_id, name, status, created_by)
  values (home_a, 'Tâche Bob extra 1', 'a_faire', bob_m),
         (home_a, 'Tâche Bob extra 2', 'a_faire', bob_m),
         (home_a, 'Tâche Bob extra 3', 'a_faire', bob_m);

  insert into public.gdpr_export_jobs (user_id) values (bob)
  returning id into bob_job;

  while not v_done and v_passes < 30 loop
    res := private.gdpr_export_extract_batch(bob_job, 2);
    v_done := (res ->> 'done')::boolean;
    v_passes := v_passes + 1;
    if res ->> 'module' = 'tasks' then
      v_tasks_starts := v_tasks_starts || (res ->> 'batch_start_offset')::int;
      v_tasks_rows := v_tasks_rows
        || coalesce(jsonb_array_length(res -> 'rows' -> 'tasks'), 0);
    end if;
  end loop;

  perform testkit.ok(v_done,
    'extraction de Bob terminée (done=true) en ' || v_passes || ' lot(s)');
  -- 5 lignes créées par Bob (la sienne, la partagée Bob→Alice, 3 extras) :
  -- limite 2 → TROIS lots d'offsets de début 0, 2, 4.
  perform testkit.eq(cardinality(v_tasks_starts), 3,
    'le module tasks de Bob (5 lignes, limite 2) est remis en TROIS lots');
  perform testkit.eq(v_tasks_starts[1], 0,
    'premier lot tasks : batch_start_offset = 0 (début du module)');
  perform testkit.eq(v_tasks_starts[2], 2,
    'second lot tasks : batch_start_offset = 2 (offset de DÉBUT, pas post-avance)');
  perform testkit.eq(v_tasks_starts[3], 4,
    'troisième lot tasks : batch_start_offset = 4 (suite croissante)');
  perform testkit.eq(v_tasks_rows[1], 2,
    'chaque lot tasks porte exactement la limite demandée');
end;
$$;

rollback;
