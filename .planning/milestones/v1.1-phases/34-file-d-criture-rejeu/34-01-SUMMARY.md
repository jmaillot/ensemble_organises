---
phase: 34-file-d-criture-rejeu
plan: 01
subsystem: base-de-données
tags: [sql, migration, idempotence, rls, offline]
requires: []
provides:
  - "client_key uuid not null + unicité sur les 5 tables Tier 1 (cible du upsert onConflict 'household_id,client_key' du plan 03)"
  - "Contrainte task_assignees_client_key_key (client_key seul)"
  - "Fonctions serveur (cron, RPC) alimentant client_key"
affects: [34-02, 34-03, 34-04]
tech-stack:
  added: []
  patterns: ["backfill + NOT NULL dans la même migration (D-15)", "unicité (household_id, client_key) alignée sur la structure réelle"]
key-files:
  created:
    - supabase/migrations/0177_client_key.sql
    - supabase/migrations/0178_client_key_cron.sql
    - supabase/migrations/0179_client_key_rpc.sql
    - supabase/tests/0177_client_key.test.sql
  modified:
    - supabase/tests/0001_schema_contract.sql
    - supabase/tests/0002_rls_isolation.sql
    - supabase/tests/0004_cron.sql
    - supabase/tests/0007_push.sql
    - supabase/tests/0017_folders.sql
    - supabase/tests/0022_products.sql
    - supabase/tests/0047_cercle_author_guards.sql
    - supabase/tests/0053_trip_workspace.sql
    - supabase/tests/0081_author_update.sql
    - supabase/tests/0123_rls_delete_zero_rows.sql
    - supabase/tests/0133_replace_sets.sql
    - supabase/tests/0134_folders_perso_prive.sql
    - supabase/tests/0139_shopping_item_order.sql
    - supabase/tests/0145_convert_managed_children.sql
    - supabase/tests/0146_child_behavior_guards.sql
    - supabase/tests/0147_child_push_adults.sql
    - supabase/tests/0148_link_managed_child.sql
    - supabase/tests/0150_household_members_delete_durci.sql
    - supabase/tests/0153_routine_completions_dedup_morte.sql
    - supabase/tests/0161_gdpr_extract_batch.sql
    - supabase/tests/0174_folder_default_dedup.test.sql
decisions:
  - "task_assignees : unicité sur client_key SEUL (jointure sans household_id, PK composite 0003:94-98)"
  - "Pas de DEFAULT sur client_key : une insertion sans clé reste refusée (la violation est le signal d'un client buggé), les sites serveur l'alimentent explicitement"
  - "replace_task_assignees : déduplication sur le membre seul avant gen_random_uuid() (distinct global casserait la dédup d'entrée)"
metrics:
  duration: ~50 min
  completed: 2026-11-05
status: complete
commits: 3
plan_head_before: 6bef936
plan_head_after: e6b0c89
actuals:
  tokens: 56000
  tasks: 3
  commits: 3
---

# Phase 34 Plan 01: Idempotence serveur client_key Summary

**One-liner:** `client_key uuid` NOT NULL + unicité par foyer sur les 5 tables Tier 1 (migration 0177, backfill D-15), migrations 0178/0179 pour les insertions serveur (cron routines, RPC coches/remplacements), tests SQL négatifs §2.7 verts (104/104).

## What Was Built

- **0177_client_key.sql** : colonne `client_key uuid`, backfill `gen_random_uuid()`, `set not null`, contrainte unique `(household_id, client_key)` sur shopping_list_items/tasks/routines/routine_completions et `(client_key)` seul sur task_assignees — une transaction, zéro politique RLS touchée, contrainte métier `routine_completions_unique_occurrence` intacte.
- **0178_client_key_cron.sql** : `private.generate_routine_occurrences` (0011:205) recopiée-modifiée — le job pg_cron insérait dans routine_completions sans client_key et aurait échoué sur le NOT NULL.
- **0179_client_key_rpc.sql** : `public.complete_routine_occurrence` et `public.replace_task_assignees` (0146) recopiées-modifiées, même raison ; déduplication de `p_member_ids` conservée sur le membre seul.
- **0177_client_key.test.sql** : 5 familles de cas (NOT NULL refusé, doublon 23505 sur les 5 tables, même clé acceptée dans deux foyers, `expect_denied` RLS inter-foyer sur tasks, upsert `on conflict (household_id, client_key)` rejoué deux fois = une ligne, seconde écriture gagnante). Vu ROUGE avant d'être vu vert (§2.7 B) : colonne absente puis sémantique RLS du comptage corrigées en cours de route.

## Verification

| Contrôle | Résultat |
|---|---|
| `python3 scripts/check-sql-statique.py` | vert — 179 migrations, 106 tests, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | vert — 6 cas |
| `sh scripts/test-db.sh` | vert — 104/104 fichiers |
| `sh scripts/migrate.sh` | 0177/0178/0179 enregistrés dans schema_migrations |
| information_schema | 5 colonnes client_key `is_nullable='NO'`, 5 contraintes uniques |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Blocking] Trois fonctions serveur inséraient sans client_key**
- **Found during:** Task 2/3 (test-db.sh rouge sur 0004, 0146, 0153 ; scan pg_get_functiondef)
- **Issue:** après le NOT NULL de 0177, `generate_routine_occurrences` (pg_cron quotidien), `complete_routine_occurrence` et `replace_task_assignees` échouaient — plus aucune occurrence/coche/assignation serveur possible.
- **Fix:** migrations 0178/0179, définitions effectives recopiées-modifiées avec `client_key = gen_random_uuid()`.
- **Files:** supabase/migrations/0178_client_key_cron.sql, 0179_client_key_rpc.sql
- **Commit:** e6b0c89

**2. [Rule 1 - Bug] 20 suites SQL existantes rouges (fixtures sans client_key)**
- **Found during:** Task 2
- **Issue:** 50+ inserts de fixtures sur les 5 tables violaient le NOT NULL.
- **Fix:** `client_key gen_random_uuid()` ajouté aux inserts ; contract 0001 étendu aux 5 tables ; fin de fichier `rollback` (pas `commit`) dans le nouveau test (le semis doit être annulé).
- **Commit:** 936091e

**3. [Rule 1 - Bug] `distinct` + gen_random_uuid() cassait la déduplication**
- **Found during:** Task 3 (0133 rouge : pkey violée sur `array[bob_m, bob_m]`)
- **Issue:** `select distinct p_task_id, m, gen_random_uuid()` rend chaque ligne distincte.
- **Fix:** dédup sur le membre seul dans une sous-requête. Correction d'une migration non encore commitée (dev DB uniquement) : ligne schema_migrations de 0179 retirée puis migrate.sh rejoué — la version appliquée est bien la définition corrigée (vérifié par pg_get_functiondef).

## Notes

- `app/src/types/database.ts` ne porte pas encore `client_key` : la colonne est additive et la divergence n'est vérifiée ni par 0001 ni par le typecheck ; les plans 02/03 (client) l'ajouteront en générant les types.
- Aucun commit de Task 3 séparé : l'application de la migration ne produit pas de diff ; elle est couverte par le commit e6b0c89 + preuve information_schema ci-dessus.

## Self-Check: PASSED
- 0177/0178/0179 dans schema_migrations : vérifié (requête ci-dessus).
- Commits 1f52def, 936091e, e6b0c89 présents : vérifié (git log).
- 104/104 suites SQL vertes : vérifié.
