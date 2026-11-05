-- 0177_client_key.sql
-- Phase 34 (file d'écriture & rejeu, WRQ-01) — idempotence serveur du rejeu
-- client par une colonne `client_key uuid` sur les 5 tables Tier 1 (D-14).
--
-- Le create hors-ligne génère son UUID `client_key` côté client ; au rejeu,
-- le client fait un upsert PostgREST `on_conflict=household_id,client_key`
-- (plan 03) : rejouer deux fois la même écriture fusionne au lieu de doubler.
--
-- Backfill + NOT NULL dans la MÊME migration (D-15) : les lignes pré-existantes
-- reçoivent `gen_random_uuid()`, et la contrainte est VRAIE dès le premier
-- déploiement — jamais d'intervalle où une écriture en file pourrait créer un
-- doublon parce que la colonne serait encore nullable.
--
-- Forme des contraintes uniques, alignée sur la structure RÉELLE de chaque
-- table (lecture de 0003_tables_daily.sql) :
--   - `shopping_list_items`, `tasks`, `routines`, `routine_completions`
--     portent `household_id text not null` → contrainte
--     `unique (household_id, client_key)` : le même client_key peut exister
--     dans deux foyers distincts, et l'index sert directement l'upsert
--     onConflict 'household_id,client_key' du rejeu (plan 03).
--   - `task_assignees` est une jointure SANS `household_id` ni `id`
--     (PK composite `(task_id, member_id)`, 0003:94-98) : la contrainte
--     (household_id, client_key) n'y a aucun sens → unicité sur `client_key`
--     SEUL. Deux lignes du monde entier ne peuvent pas partager une clé.
--   - La contrainte métier pré-existante de `routine_completions`
--     (`routine_completions_unique_occurrence`, 0003) n'est pas touchée :
--     client_key est orthogonale à (routine_id, occurrence_date).
--
-- Les PK sont `text` (`private.new_id(...)`) : `client_key` est une colonne
-- NOUVELLE, orthogonale à `id`.
--
-- Vers l'avant uniquement (AGENTS §2.7 A) : aucune migration appliquée n'est
-- réécrite ; aucune politique RLS n'est touchée (la RLS des tables borne déjà
-- l'upsert de rejeu au foyer du membre, AGENTS §2.6 — preuve par le test
-- négatif inter-foyer de 0177_client_key.test.sql).

begin;

-- ---------------------------------------------------------------------------
-- shopping_list_items
-- ---------------------------------------------------------------------------
alter table public.shopping_list_items add column client_key uuid;
-- Backfill D-15 : chaque article pré-existant reçoit un uuid, la contrainte
-- d'unicité ci-dessous est donc satisfiable immédiatement.
update public.shopping_list_items set client_key = gen_random_uuid();
alter table public.shopping_list_items alter column client_key set not null;
-- Unicité par foyer : sert l'upsert onConflict 'household_id,client_key' du rejeu.
alter table public.shopping_list_items
  add constraint shopping_list_items_client_key_key unique (household_id, client_key);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
alter table public.tasks add column client_key uuid;
update public.tasks set client_key = gen_random_uuid();
alter table public.tasks alter column client_key set not null;
alter table public.tasks
  add constraint tasks_client_key_key unique (household_id, client_key);

-- ---------------------------------------------------------------------------
-- task_assignees — jointure sans household_id (0003:94-98, PK composite
-- task_id/member_id) : la contrainte (household_id, client_key) n'a pas de
-- sens ici, l'unicité porte sur client_key SEUL.
-- ---------------------------------------------------------------------------
alter table public.task_assignees add column client_key uuid;
update public.task_assignees set client_key = gen_random_uuid();
alter table public.task_assignees alter column client_key set not null;
alter table public.task_assignees
  add constraint task_assignees_client_key_key unique (client_key);

-- ---------------------------------------------------------------------------
-- routines
-- ---------------------------------------------------------------------------
alter table public.routines add column client_key uuid;
update public.routines set client_key = gen_random_uuid();
alter table public.routines alter column client_key set not null;
alter table public.routines
  add constraint routines_client_key_key unique (household_id, client_key);

-- ---------------------------------------------------------------------------
-- routine_completions — la contrainte métier pré-existante
-- routine_completions_unique_occurrence (0003) reste inchangée : client_key
-- est orthogonale à (routine_id, occurrence_date).
-- ---------------------------------------------------------------------------
alter table public.routine_completions add column client_key uuid;
update public.routine_completions set client_key = gen_random_uuid();
alter table public.routine_completions alter column client_key set not null;
alter table public.routine_completions
  add constraint routine_completions_client_key_key unique (household_id, client_key);

commit;
