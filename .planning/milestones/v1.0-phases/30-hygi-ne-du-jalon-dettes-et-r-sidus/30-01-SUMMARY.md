---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 01
subsystem: database
tags: [pg_cron, rrule, routines, sql, europe-paris, supabase]

# Dependency graph
requires:
  - phase: 29-messagerie-v2
    provides: baseline verte (tests, e2e) avant hygiène
provides:
  - Cause racine documentée du job routine silencieux (fuseau UTC vs Europe/Paris, verdict H2)
  - Migration 0173 re-planifiant `eo-routine-maintenance` à `5 6 * * * Europe/Paris`
  - Assertion SQL occurrence-du-jour dans supabase/tests/0004_cron.sql (rouge prouvé → vert)
  - docs/BACKEND.md §6.3 explicite sur l'horaire en heure de Paris
affects: [phase-31 inscriptions ouvertes (go-live), verify-work DET-01]

# Actuals (#2632)
actuals:
  tokens: 1900
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "cron.schedule_in_database avec 6e paramètre timezone 'Europe/Paris' (gabarit idempotent 0011)"
    - "assertion SQL bornée par foyer (home_a) pour l'occurrence du jour, preuve rouge par commentaire de l'appel"

key-files:
  created:
    - supabase/migrations/0173_routine_cron_fix.sql
  modified:
    - supabase/tests/0004_cron.sql
    - docs/BACKEND.md

key-decisions:
  - "Verdict H2 : le job tournait à 06:05 UTC (08:05 Paris) — re-planifié en 'Europe/Paris' plutôt que documenter l'UTC (l'image pg_cron supporte le 6e paramètre)"
  - "Nom de migration 0173 (0154 du plan déjà pris) — correction vers l'avant, 0011 non réécrite"
  - "0147_child_push_adults.sql échoue pour une cause pré-existante hors périmètre (consigné dans deferred-items.md)"

patterns-established:
  - "Diagnostic cron : cron.job + cron.job_run_details (start_time) tranchent les hypothèses par mesure, jamais par supposition"

requirements-completed: []

coverage:
  - id: D1
    description: "Cause racine diagnostiquée et corrigée : job `eo-routine-maintenance` re-planifié à 06:05 Europe/Paris (migration 0173), 0011 inchangée, revokes anon/auth vérifiés après migration"
    requirement: DET-01
    verification:
      - kind: integration
        ref: "sh scripts/test-db.sh (0004_cron.sql — occurrence du jour, assertion bornée home_a)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py"
        status: pass
  - id: D2
    description: "Assertion SQL rouge-avant-vert : l'occurrence du jour pour un RRULE quotidien existe après private.run_daily_routine_maintenance(), rouge prouvé en commentant l'appel"
    requirement: DET-01
    verification:
      - kind: integration
        ref: "supabase/tests/0004_cron.sql#occurrence du jour (sortie d'échec consignée au rouge, vert après migration)"
        status: pass
  - id: D3
    description: "Preuve D-03 : exécution matinale fraîche du job après 06:05 Paris dans cron.job_run_details (statut succeeded)"
    requirement: DET-01
    verification: []
    human_judgment: true
    rationale: "La preuve exige d'attendre la prochaine exécution programmée (demain matin) — non observable dans la session d'exécution"
  - id: D4
    description: "Preuve D-04 : constat d'usage — une routine créée dans un foyer apparaît dans la vue du jour de l'app, matin après matin"
    requirement: DET-01
    verification: []
    human_judgment: true
    rationale: "La base ne contient aucune routine réelle ; le constat exige une création dans l'app et une observation le lendemain matin"

# Metrics
duration: ~90min
completed: 2026-10-30
status: partial
---

# Phase 30 Plan 01: DET-01 — job routine pg_cron Summary

**Job `eo-routine-maintenance` re-planifié à 06:05 Europe/Paris (fuseau UTC diagnostiqué), assertion SQL de l'occurrence du jour rouge→vert ; preuves humaines D-03/D-04 reportées en résidu.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-10-30 ~11:30 UTC
- **Completed:** 2026-10-30
- **Tasks:** 3/3 volets techniques (Task 3 = checkpoint human-verify partiellement traité, preuves humaines en attente)
- **Files modified:** 3

## Accomplishments
- **Verdict du diagnostic (D-02) : H2 — fuseau.** Mesure prod : le job `eo-routine-maintenance` tournait à `5 6 * * *` interprété en UTC, soit 08:05 Paris (heures réelles d'exécution citées dans `cron.job_run_details`). H1 (job absent) et H3 (garde 0153) tranchées par mesure : le job existe et s'exécute en succès.
- **Correction (Task 2)** : migration `0173_routine_cron_fix.sql` — unschedule + `cron.schedule_in_database('eo-routine-maintenance', '5 6 * * *', 'select private.run_daily_routine_maintenance()', current_database(), 'Europe/Paris')`, gabarit idempotent de 0011. 0011 non réécrite. Revokes anon/authenticated re-vérifiés après migration (T-30-01).
- **Preuve automatisée (D-03 volet automatisé)** : assertion SQL dans `0004_cron.sql` — routine `FREQ=DAILY` dans un foyer de test, appel `private.run_daily_routine_maintenance()`, occurrence du jour affirmée bornée par `household_id = home_a`. Rouge prouvé (appel commenté → échec observé), vert après migration.
- **Mesure manuelle en transaction annulée** : `{"occurrences_late": 1, "occurrences_missed": 0, "occurrences_created": 1}` — occurrence du jour créée pour la sonde, aucune trace persistée.
- **Doc (D-04 volet doc)** : `docs/BACKEND.md` §6.3 explicite — le job tourne à 06:05 heure de Paris, l'Edge `generate-routine-occurrences` reste déclenchement manuel + supervision.

## Remaining / Résidus (owed, not done)

- **D-03 (preuve cron fraîche)** : exécution matinale du jour après la migration à vérifier dans `cron.job_run_details` — statut `succeeded`, `start_time ≈ 06:05 +02`. À constater demain matin (2026-10-31).
- **D-04 (constat d'usage)** : créer une routine dans un foyer et constater l'occurrence dans la vue du jour de l'app, matin après matin. La base ne contient actuellement **aucune routine réelle**.

## Task Commits

1. **Task 1: Diagnostic prod + assertion SQL rouge** — `0f0cfc4` (test)
2. **Task 2: Correction cause racine (fuseau) + test au vert** — `deadd5a` (fix) — migration `0173` (nom `0154` du plan déjà pris, écart documenté)
3. **Task 3: Preuves de clôture — volet automatisé (doc)** — `e2a9170` (docs)

## Files Created/Modified
- `supabase/migrations/0173_routine_cron_fix.sql` — re-planification du job en Europe/Paris
- `supabase/tests/0004_cron.sql` — assertion occurrence du jour (bornée par foyer)
- `docs/BACKEND.md` — §6.3 : horaire 06:05 Paris explicite, rôle Edge inchangé

## Decisions Made
- Re-planification en `Europe/Paris` plutôt que documentation de l'UTC : l'image pg_cron supporte le 6e paramètre timezone ; l'intention produit (06:05 Paris) est restaurée, pas reformulée.
- Migration numérotée `0173` : `0154` était déjà pris — nom de fichier écarté, contenu conforme.

## Deviations from Plan

**1. [Rule 3 - Blocking] Nom de migration 0154 indisponible → 0173**
- **Found during:** Task 2
- **Issue:** `0154_*.sql` déjà utilisé par une migration antérieure
- **Fix:** migration créée sous `0173_routine_cron_fix.sql`, appliquée via `scripts/migrate.sh`
- **Files modified:** supabase/migrations/0173_routine_cron_fix.sql
- **Committed in:** deadd5a

**2. [Pre-existant, hors périmètre] `supabase/tests/0147_child_push_adults.sql` échoue**
- **Found during:** Task 2 (run test-db.sh)
- **Issue:** assertion « anniversaire enfant : annonce à chaque adulte (attendu 2, obtenu 0) » — voie `push_birthday_notifications` sans lien avec cron
- **Fix:** non corrigé — consigné dans `deferred-items.md`, hors périmètre de 30-01
- **Committed in:** n/a

---

**Total deviations:** 2 (1 blocking auto-fixed, 1 pre-existing deferred)
**Impact on plan:** travail technique du plan livré intégralement ; aucun scope creep.

## Issues Encountered
- La base de prod ne contient aucune routine réelle : le constat d'usage (D-04) ne peut pas être fait automatiquement — reporté en résidu.
- La preuve D-03 exige une exécution programmée fraîche (06:05 Paris du lendemain) — non observable dans la session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 30-02 (todos hors-ligne), 30-03 (semis recette), 30-04 (estampille), 30-05 (césure Anniversaires) peuvent démarrer — aucune dépendance sur les résidus D-03/D-04.
- Les résidus D-03/D-04 doivent être collectés par `/gsd-verify-work` (constat demain matin) avant le go-live de la phase 31.

---
*Phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus*
*Completed: 2026-10-30*
