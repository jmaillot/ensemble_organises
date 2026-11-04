---
phase: 27
plan: 01
subsystem: backend
tags: [rgpd, suppression-compte, sql, rls, tdd]
requires: [0002 (FK vers auth.users), 0145 (chk_members_managed_child), 0158 (gdpr_export_jobs)]
provides:
  - household_members.account_deleted_at (colonne « ancien membre », D-03)
  - account_deletion_requests (table, une demande active par utilisateur, D-06)
  - account_deletion_restorations (instantané D-04)
  - request_account_deletion(uuid) / cancel_account_deletion(uuid) (RPC security definer)
  - FK converties en cascade : tasks/task_reminders/notes/note_attachments/events/event_reminders/shopping_list_items/routine_reminders/recipes.photo_path/recipe_shares/pets/pet_records/loyalty_cards/birthdays/places/pantry_items/meal_entries/posts/post_media/post_comments
affects: [27-02 (purge cron J+30 + emails), 27-03 (frontend Paramètres)]
tech-stack:
  added: []
  patterns: [instantané-avant-déshumanisation, garde-unicité-en-base, RPC security definer avec vérification d'acteur en base]
key-files:
  created:
    - supabase/migrations/0166_account_deletion_tables.sql
    - supabase/migrations/0167_account_deletion_rpc.sql
    - supabase/tests/0166_account_deletion_tables.test.sql
  modified:
    - supabase/tests/0001_schema_contract.sql
    - app/src/types/database.ts
decisions:
  - "D-06 appliqué en base : une seule demande ACTIVE (demandee/rappellee) par utilisateur — index partiel unique"
  - "La demande reposée après annulation court-circuite le re-snapshot (l'instantané porte toujours les valeurs d'origine) mais REJOUE la déshumanisation (D-05 l'a restaurée)"
  - "chk_members_managed_child assoupli vers l'avant : l'état « ancien membre » (account_deleted_at posé) admet user_id NULL sans être enfant"
  - "FK auditées une par une : les données PARTAGÉES du foyer survivent à la purge (set null sur ligne membre survivante), les données PERSONNELLES du compte meurent avec lui (cascade)"
metrics:
  duration: ~40 min
  completed: 2026-10-27
status: complete
actuals:
  tokens: 10000
  tasks: 3
  commits: 4
plan_head_before: 5441edccd08631c3eb4bce59cebdf81c2336ef89
plan_head_after: a83d411
---

# Phase 27 Plan 01: Fondations SQL suppression de compte RGPD Summary

**One-liner:** Tables + RPC de demande/annulation de suppression de compte avec instantané de restauration, déshumanisation immédiate et FK auditées pour que la purge J+30 ne casse aucune donnée partagée du foyer.

## Ce qui a été construit

- **Migration 0166** : colonne `household_members.account_deleted_at`, tables `account_deletion_requests` (index unique partiel : une demande active par utilisateur) et `account_deletion_restorations` (instantané profil + ligne membre, D-02 couvre les deux surfaces), audit FK complet vers `auth.users` documenté dans l'entête, conversion `recipe_shares.created_by` cascade→set null, assouplissement vers l'avant de `chk_members_managed_child`.
- **Migration 0167** : RPC `request_account_deletion` (instantané D-04 AVANT déshumanisation D-01/D-02, marqueur D-03, horloge J+30 rejouée à chaque demande) et `cancel_account_deletion` (restauration D-05 depuis l'instantané, demande « annulee » reposable). Acteur vérifié en base (jamais `auth.uid()` cru pour la cible), privilèges explicites retrait/accord + preuve en migration.
- **Tests SQL** : `0166_account_deletion_tables.test.sql` (acteur légitime, unicité D-06 en base, remplacement avec rejeu d'horloge, négatifs d'acteur T-27-01, §5 purge RGDP-05) + mises à jour du contrat `0001_schema_contract.sql`.

## Vérification

| Contrôle | Résultat |
|---|---|
| `python3 scripts/check-sql-statique.py` | vert — 218 fonctions effectives, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | vert — 6 cas, tous verts |
| `sh scripts/migrate.sh` | 0166 + 0167 appliqués |
| `sh scripts/test-db.sh` | 96 fichiers SQL, tous verts (dont 0166) |
| `cd app && npm run typecheck` | vert |
| `cd app && npm test -- --run` | 202 fichiers / 1636 tests verts |

## TDD Gate Compliance

- Task 2 exécutée en TDD strict : RED (`5d4b86b`, preuve `/tmp/opencode/gsd-tdd-red-27-01.json` — les fonctions n'existaient pas), puis GREEN (`a5dcef6`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Déshumanisation sautée à la demande reposée après annulation**
- **Found during:** Task 3 (le test §5 purge l'a fait échouer)
- **Issue:** `request_account_deletion` après un `cancel_account_deletion` prenait le raccourci D-06 et sautait la déshumanisation ; or D-05 (annulation) avait restauré les noms et déposé `account_deleted_at`. La purge `delete from auth.users` tombait alors sur une ligne membre adulte vivante (user_id NULL), refusée par `chk_members_managed_child`.
- **Fix:** les updates de déshumanisation (profils + lignes membres) sortent du `if` — rejoués pour toute demande, idempotents ; seul le re-snapshot reste court-circuité dans le cas du remplacement.
- **Files modified:** supabase/migrations/0167_account_deletion_rpc.sql
- **Commit:** a83d411

### Discoveries sur le schéma effectif (audit FK, documentés dans l'entête de 0166)

1. `household_members.id` / `households.id` sont `text`, pas uuid — la ligne membre porte un `member_*`, les fixtures du plan ont été adaptées.
2. `recipes.created_by` référençait DÉJÀ `household_members(id) on delete set null` (0122) — pas d'ALTER nécessaire, consigné.
3. `recipe_shares.created_by` référençait `auth.users` en CASCADE NOT NULL (omission du research) — converti en set null, 5e ALTER.
4. Le contrat `0001_schema_contract.sql` a été étendu (colonne `account_deleted_at` + exception no-policy des deux nouvelles tables) — hors périmètre littéral du plan, nécessaire pour que le contrat reste vrai.
5. `app/src/types/database.ts` : `account_deleted_at?: IsoDateTime | null` ajouté (les fixtures TypeScript du typecheck le demandaient).

## Auth Gates

Aucune.

## Known Stubs

Aucun — la purge effective J+30 (cron/Edge Function) et les emails sont volontairement hors périmètre de ce plan (plans 27-02 et 27-03) ; les RPC exposent `purge_due_at` pour le cron à venir.

## Self-Check: PASSED

- Fichiers créés : 0166, 0167, test 0166 — présents sur disque.
- Commits c5bc1b9, 5d4b86b, a5dcef6, a83d411 — présents dans `git log`.
