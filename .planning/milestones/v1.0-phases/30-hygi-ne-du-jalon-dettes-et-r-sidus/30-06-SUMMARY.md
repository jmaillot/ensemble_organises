---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 06
subsystem: routines + folders SQL
tags: [gap-closure, G-30-2, routines, folders, sql-garde]
requires: [0050_folders.sql, 0052_folders_triggers_seed.sql, 0065_create_household_ardoise.sql]
provides: [0174_folder_default_dedup.sql, private.dedup_folder_defaults(), formFoldersOf]
affects: [routine-form-dialog, routines-page, create_household]
tech-stack:
  added: []
  patterns: [dédoublonnage forward-only via fonction private + session_replication_role, filtre dérivé useMemo dans le hook]
key-files:
  created:
    - supabase/migrations/0174_folder_default_dedup.sql
    - supabase/tests/0174_folder_default_dedup.test.sql
    - app/src/modules/routines/hooks/use-routines-form-folders.test.tsx
  modified:
    - app/src/modules/routines/hooks/use-routines.ts
    - app/src/modules/routines/components/routine-form-dialog.test.tsx
    - app/src/modules/routines/routines-page.tsx
decisions:
  - "Site de filtrage : option (a) du plan — le hook (formFoldersOf, second useMemo) ; le dialogue et son option « Général » codée en dur ne changent pas, les onglets gardent la liste complète"
  - "La logique de dédoublonnage vit dans private.dedup_folder_defaults() pour être appelable par le test testkit (jamais la migration elle-même comme outil du test — anti-tautologie §2.7-D.3)"
  - "Diagnostic local : zéro doublon, les trois index partiels 0050 présents — le doublon UAT est client (option codée en dur + ligne is_default rendue)"
metrics:
  duration: ~1 session
  completed: 2026-10-31
status: complete
---

# Phase 30 Plan 06: Gap G-30-2 — doublon « Général » au formulaire de routine Summary

**One-liner:** Dédoublonnage idempotent SQL (0174 : fonction `private.dedup_folder_defaults()` + index 0050 conditionnels + `create_household` durci `on conflict`) et filtre `is_default` côté hook — le formulaire n'affiche plus qu'une entrée « Général », les onglets restent complets.

## Diagnostic SQL (§2.7-I : une absence affirmée se prouve)

**Base locale (2026-10-31, via `scripts/psql.sh`) :**

```sql
select 'task_lists', count(*), count(distinct household_id) from public.task_lists where is_default
union all select 'note_folders', ... union all select 'routine_folders', ...;
-- task_lists|1|1 ; note_folders|1|1 ; routine_folders|1|1  → AUCUN doublon

select indexname from pg_indexes where indexname in
  ('task_lists_default_unique','note_folders_default_unique','routine_folders_default_unique');
-- les 3 présents
```

**Prod : NON diagnostiqué depuis l'exécuteur** (pas d'accès prod depuis cette session — absence déclarée, pas une absence affirmée). Requête à jouer par l'opérateur (via `scripts/psql.sh` sur l'instance prod) :

```sql
select 'task_lists' t, household_id, count(*) from public.task_lists where is_default group by 1,2 having count(*) > 1
union all select 'note_folders', household_id, count(*) from public.note_folders where is_default group by 1,2 having count(*) > 1
union all select 'routine_folders', household_id, count(*) from public.routine_folders where is_default group by 1,2 having count(*) > 1;
```

La migration 0174 est idempotente : sur une base sans doublon, elle ne touche aucune ligne (prouvé par le second appel du Test C).

## Tasks exécutés

| Task | Nom | Commit | Fichiers |
| ---- | --- | ------ | -------- |
| 1 | Test testkit rouge (diagnostic + cas négatif + dédoublonnage) | 60dc3ce | supabase/tests/0174_folder_default_dedup.test.sql |
| 2 | Migration 0174 (dédoublonnage + garde + semis durci) | 7e996a0 | supabase/migrations/0174_folder_default_dedup.sql + test |
| 3 | Filtre formulaire + tests vitest | 904186d | use-routines.ts, use-routines-form-folders.test.tsx, routine-form-dialog.test.tsx, routines-page.tsx |

## Deviations from Plan

**1. [Rule 1 - Bug] Nom de fichier de test : `.test.sql` au lieu du nom du plan**
- **Found during:** Task 1
- **Issue:** le plan disait `0174_folder_default_dedup.sql` dans supabase/tests ; la convention du dépôt (et du glob `[0-9]*.sql`) suffixe `.test.sql`
- **Fix:** `0174_folder_default_dedup.test.sql`
- **Commit:** 60dc3ce

**2. [Rule 1 - Bug] Fixture : created_at explicite pour le survivant**
- **Found during:** Task 2
- **Issue:** `now()` vaut le début de TRANSACTION — toutes les lignes du fixture partageaient la même created_at, le tie-break `(created_at, id)` choisissait le survivant arbitrairement et le repointage échouait
- **Fix:** le Général survivant est inséré avec `created_at = now() - interval '1 day'`
- **Commit:** 7e996a0

**3. [Rule 3 - Blocking] Contrainte `routine_folders_name_unique` retirée par un premier run commis par erreur**
- **Found during:** Task 1→2
- **Issue:** la première version du test finissait par `commit;` (la convention testkit est `rollback;`) — le fixture ET le `drop constraint` ont été réellement commis sur la base locale
- **Fix:** test passé en `rollback;` final ; la contrainte recréée sur la base locale (`alter table ... add constraint routine_folders_name_unique unique (household_id, name)`) et vérifiée (pg_constraint) ; données de fixture purgées ; suite complète rejouée
- **Commit:** (réparation base locale, hors dépôt)

**4. [Deviation] Test B : les DEUX gardes sont retirées pour simuler l'état fautif**
- L'index partiel SEUL ne suffit pas : `routine_folders_name_unique` bloque aussi le doublon. Les deux sont retirées le temps de l'insertion (transaction du fichier, annulée), l'index est recréé après dédoublonnage (miroir du bloc DO de 0174).

## Verification (chaîne §2.7)

- `python3 scripts/check-sql-statique.py` : vert (227 fonctions effectives, aucun défaut)
- `python3 scripts/test-check-sql-statique.py` : 6 cas verts (un littéral multi-lignes du Test B a été corrigé en une ligne — attrapé par le contrôle 3)
- `sh scripts/test-db.sh` : **101/102 verts** ; l'échec `0147_child_push_adults` est PRÉ-EXISTANT et documenté (STATE.md Blockers, deferred-items.md — push anniversaires, hors périmètre)
- `sh scripts/test-db.sh 0174` : vert (rouge avant la migration, prouvé : `function private.dedup_folder_defaults() does not exist`)
- `cd app && npm run typecheck && npm test && npm run build` : verts (213 fichiers, 1686 tests)

## TDD Gate Compliance

- Task 1 (tracer, tdd) : RED prouvé — le test échouait sur `function private.dedup_folder_defaults() does not exist`, Tests A et B déjà verts (garde 0050 prouvée par cas négatif)
- Task 3 (tdd) : RED prouvé — `formFolders is not defined` puis assertions du helper rouges avant implémentation

## Known Stubs

Aucun. La migration `create_household` est une copie de la définition effective 0065 (dernière redéfinition, vérifiée par grep sur supabase/migrations) — 0174 n'ajoute que les trois `on conflict do nothing`.

## Notes pour le vérificateur

- Site de filtrage : **(a) hook** (`formFoldersOf` exporté, second `useMemo` dans `useRoutines`) — `routines-page.tsx` passe `formFolders` au dialogue seul ; `FolderTabs` reçoit toujours `folders` complet.
- L'option `<option value="">Général</option>` du dialogue est INTENTIONNELLEMENT inchangée (cible `folder_id = NULL`, DDL 0050).
- Le garde `guard_folder_default` (0052) est intact : `dedup_folder_defaults()` bascule `session_replication_role = replica` à portée TRANSACTION le temps de ses trois DELETE, puis le rôle revient.
