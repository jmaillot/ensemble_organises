---
phase: 10-notifications
plan: 02
subsystem: notifications
tags: [postgres, push, fan-out, tombstone, red-baseline, stop-and-report]

# Dependency graph
requires:
  - phase: 10-notifications
    provides: [live bell feed from 10-01]
  - phase: 08-messages
    provides: [tombstone departure semantics D-08 including push fan-out filter]
provides:
  - RED-baseline verdict for departed push fan-out (already excluded, proven at runtime)
  - Runtime re-lock of actives-intact behavior (24h window, author exclusion, preference filter untouched)
affects: [10-notifications remaining plans, supervised prod push proof]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 0
  tasks: 2
  commits: 0
  plan_head_before: 306ac7457b6fdc976fcfb7adb2b2c90aee93e5c4
  plan_head_after: 306ac7457b6fdc976fcfb7adb2b2c90aee93e5c4

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "RED did not reproduce: no migration 0108 and no test 0046 created per the plan's own stop-and-report instruction"
  - "The departed filter already lives in the effective fan-out definition (0100) and is already locked by 0039 + 0041 — a duplicate suite would be an unjustified test"

requirements-completed: [D-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Departed (tombstoned) members receive no message push; RED baseline attempted, bug absent"
    requirement: "D-03"
    verification:
      - kind: sql-suite
        ref: "supabase/tests/0039_leave_read_delete.sql#le ventilateur push exclut le partant"
        status: pass
      - kind: sql-suite
        ref: "supabase/tests/0041_archive_frozen_window.sql#le ventilateur push ignore toujours le partant (inchange)"
        status: pass
    human_judgment: false
  - id: D2
    description: "24h window, author exclusion, preference filter unchanged (no fan-out edit made)"
    requirement: "D-03"
    verification:
      - kind: sql-suite
        ref: "sh scripts/test-db.sh → 48 files green (incl. 0013_message_notifications)"
        status: pass
      - kind: unit
        ref: "npm test -- use-notifications messages → 49/49"
        status: pass
    human_judgment: false

# Metrics
duration: ~1min
completed: 2026-10-12
status: complete
---

# Phase 10 Plan 02: Departed Push Fan-out — Summary

**RED baseline did not reproduce: the tombstone filter is already in the effective fan-out definition (0100) and already locked by 0039 + 0041 — stopped per the plan's instruction, zero files touched.**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-10-12T09:44:20Z
- **Completed:** 2026-10-12T09:45:02Z
- **Tasks:** 2 (RED gate + regression gate; 0 code tasks — stop-and-report)
- **Files modified:** 0

## Accomplishments

- Read the effective fan-out before writing anything (AGENTS.md §D.1): `private.push_message_notifications` was redefined by migration `0100_message_sender_delete_tombstone.sql` (lines 195-235) with `and cm.left_at is null` — the exact filter plan 10-02 proposes to add. The 0042 definition it would "fix" is superseded, not effective.
- Confirmed the behavior is already proven, not just written: `0039_leave_read_delete.sql:282-289` asserts a post-departure message yields 0 fan-out rows for the departed member (`le ventilateur push exclut le partant`), and `0041_archive_frozen_window.sql:143-152` re-locks it (`ignore toujours le partant (inchange)`).
- Applied the plan's conditional exactly as written: "a tombstoned member is included in push fan-out for a thread they left (red baseline — if it does not reproduce, stop and report)". It does not reproduce — stopped, no `0108_push_skip_departed.sql`, no `0046_push_skip_departed.sql`.
- Ran the full verification chain anyway to turn the reading into runtime proof: static SQL check, full DB suite, typecheck, bell/messages Vitest — all green.

## Task Commits

No commits — no files created or modified. `git rev-list --count 306ac74..HEAD` = 0 (measured, not narrated).

1. **Task 1: Prove departed fan-out, then filter it** — RED attempted via existing 0039/0041 runtime proof; bug absent; filter step skipped per stop-and-report. No commit (tree untouched).
2. **Task 2: Regression gate** — typecheck clean + 49/49 green; no client change, no test added (need unproven). No commit.

## Files Created/Modified

None. Deliberately:

- `supabase/migrations/0108_push_skip_departed.sql` — NOT created. Redefining `push_message_notifications` with a byte-near-identical body would be churn with zero behavioral change; the forward-only rule protects applied files, it does not mandate new ones.
- `supabase/tests/0046_push_skip_departed.sql` — NOT created. 0039 + 0041 already assert departed-exclusion (fresh-message and frozen-window angles); a third suite asserting the same predicate is the unjustified test Task 2 itself forbids.

## Decisions Made

- "Stop and report" outranks the task list: the plan anticipated exactly this outcome and named the action, so stopping is compliance, not deferral.
- No duplicate regression suite: coverage of the must-have truth already exists at the behavioral level (fan-out rows for a real departed member), which is stronger than a new file re-asserting it.
- T-10-02 (push preview to departed members) is already mitigated by the 0100 filter + 0039/0041 locks; no new threat surface introduced (no files touched, no endpoints, no schema change) — Threat Flags section omitted.

## Deviations from Plan

None - plan executed exactly as written. The plan's Task 1 contains an explicit conditional branch (stop-and-report on non-reproduction); this summary follows that branch. No Rule 1-4 deviations: nothing was fixed, added, or asked.

## Issues Encountered

- Plan premise superseded: 10-01's SUMMARY already flagged the missing `left_at` filter as "recorded as an observation only" against the 0042 text, but migration 0100 (same wave family, D-08 tombstone work) had already added `and cm.left_at is null` to the effective definition. The observation was stale at plan-writing time — worth one line in the next planning pass, not a migration.

## Verification

- `python3 scripts/check-sql-statique.py` — 148 effective functions, no defects
- `sh scripts/test-db.sh` — 48 files, all green (incl. `0013_message_notifications`, `0039_leave_read_delete`, `0041_archive_frozen_window`)
- `cd app && npm run typecheck` — clean
- `npm test -- use-notifications messages` — 49/49 green (3 files)
- `test-dispatch-push.sh` deliberately not run: no fan-out code changed, and per 10-01 it needs operator hardware (real subscribed device) — same rationale, unchanged.
- Working tree clean apart from pre-existing untracked `.claude/` + `.gsd/` (not mine, left alone).

## Known Stubs

None — no code written.

## User Setup Required

None - no external service configuration required. (M-01/M-02 operator steps for the supervised prod push proof remain with the operator, unaffected.)

## Next Phase Readiness

- The supervised prod push proof can proceed knowing departed members are already excluded server-side; no code blocks it.
- If a future plan wants a dedicated departed-push suite, it must first show a gap in 0039/0041 coverage — currently there is none.

---
*Phase: 10-notifications*
*Completed: 2026-10-12*

## Self-Check: PASSED
- SUMMARY present on disk at `.planning/phases/10-notifications/10-02-SUMMARY.md`; zero code commits expected and confirmed (`rev-list --count` = 0, tree clean); `.planning/` is gitignored so the docs commit is skipped per criteria (verified via `git check-ignore`).
