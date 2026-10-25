---
phase: 13-hygiene-donnees
plan: 01
subsystem: database
tags: [postgres, rls, trigger, isolation, supabase, vitest]

# Dependency graph
requires:
  - phase: 12-voyages-animaux
    provides: [0048 flat-table isolation proof style to mirror]
provides:
  - Household-match guard on providers.provider_type_id (0112)
  - Isolation matrix proofs for provider_types/providers/loyalty_cards/places (0050)
affects: [13-hygiene-donnees plans 02+, prestataires/fidelite/adresses UI]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6129
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [household-match guard trigger with member-ref error shape, 0048-style isolation matrix]

key-files:
  created:
    - supabase/migrations/0112_flat_tables_guards.sql
    - supabase/tests/0050_flat_tables_guards.sql
  modified: []

key-decisions:
  - "Dedicated guard function (not validate_member_refs reuse): the checked reference is a household FK, not a member column"
  - "No data repair in 0112: violations raise on next write; live dev DB verified at 0 orphans before shipping"
  - "Task 2 added no UI tests: the new gate has no UI surface and the NULL-type path is already covered by the 'Sans type' assertion"

patterns-established:
  - "Type-household guard: BEFORE INSERT OR UPDATE trigger, NULL passes, unknown parent raises 23503, cross-household raises 23514 with member-ref error shape"

requirements-completed: [D-01, D-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Cross-household, child-role, and escalation cases on providers, provider_types, loyalty_cards, and places are refused with member/admin happy paths intact"
    requirement: "D-01"
    verification:
      - kind: other
        ref: "supabase/tests/0050_flat_tables_guards.sql (test-db.sh, 52 files green)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py (150 functions, no defects)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A provider row never references another household's type (guarded + proven, existing orphans reported not silently fixed)"
    requirement: "D-02"
    verification:
      - kind: other
        ref: "supabase/tests/0050_flat_tables_guards.sql#on ne rattache pas un prestataire au type d'un autre foyer (0112) (red before 0112, green after)"
        status: pass
      - kind: other
        ref: "live DB orphan count: 0 rows (read-only query 2026-10-12)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three modules' UI locked against the server changes (typecheck + prestataires/fidelite/adresses suites green, no product change)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "cd app && npm run typecheck && npm test -- prestataires fidelite adresses (15 tests pass)"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-10-12
status: complete
---

# Phase 13 Plan 01: Flat-table guards + isolation proofs Summary

**Household-match trigger on providers.provider_type_id plus a 4-table RLS isolation matrix, proven red first and shipped forward-only with zero client change**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-12T10:20:00Z
- **Completed:** 2026-10-12T10:45:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- RED baselines proven before any fix: throwaway probe showed a member attaching their provider to another household's type inserting 1 row; suite 0050's guard assertions failed pre-0112 with the same graft succeeding
- Migration 0112 enforces same-household provider types (NULL allowed, unknown type raises 23503, cross-household raises 23514 in the validate_member_refs error shape); no applied file touched, no policy changed
- Suite 0050 greens the full matrix: cross-household select/insert/update/delete refused, child read-only, member happy paths, delete admin-only including member-own refused, escalation refused, both-directions type graft refused
- Live dev DB checked read-only: 0 existing cross-household references, so nothing to report beyond the count — and nothing silently fixed
- UI regression gate: typecheck clean, 15/15 tests pass across prestataires/fidelite/adresses with no test additions (no new UI-facing gate)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove open references, then household guard on provider types** - `8248442` (feat)
2. **Task 2: Regression gate over the three modules' UI** - no commit (no file changed; typecheck + 3 suites green as-is)

## Files Created/Modified

- `supabase/migrations/0112_flat_tables_guards.sql` - `guard_provider_type_household()` trigger on providers (forward-only, sibling of 0008 guards)
- `supabase/tests/0050_flat_tables_guards.sql` - isolation matrix + D-02 guard proofs, 0048 style, rollback-only

## Decisions Made

- Dedicated `guard_provider_type_household()` function rather than reusing `validate_member_refs`: the checked reference is a household FK on another table, not a member column — a sibling trigger keeps the 0008 motif intact and the error shape identical.
- No data repair or backfill in 0112: a violating row raises on its next write instead of being rewritten; the dev DB held 0 orphans at ship time.
- Task 2 added no tests: the only new server gate (type-household match) has no UI surface — the client only ever offers current-household types — and the NULL-type path is already asserted via the 'Sans type' display value in the prestataires suite.
- Committed on `main` following project precedent (all prior phase commits live on main; single-executor repo, no worktree) rather than halting on the default-branch guard.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `lib-db.sh` sourced interactively resolves `EO_PROJECT_DIR` to a null directory (`$0`-relative default); worked around by exporting `EO_PROJECT_DIR` explicitly for the read-only orphan query. No file changed, test-db.sh/migrate.sh unaffected.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond the planned trigger. The writer→foreign-type boundary from the plan's threat model (T-13-01) is closed by 0112 and proven by 0050.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: supabase/migrations/0112_flat_tables_guards.sql
- FOUND: supabase/tests/0050_flat_tables_guards.sql
- FOUND: 8248442 (in `git log --all`)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Flat tables locked server-side; plans 13-02+ can build file-hygiene (D-03/D-04) and client-honesty (D-06/D-07/D-08) work on a proven isolation base.
- No blockers. `.planning/` is gitignored in this repo, so this SUMMARY lives on disk at `.planning/phases/13-hygiene-donnees/13-01-SUMMARY.md` only.

---
*Phase: 13-hygiene-donnees*
*Completed: 2026-10-12*
