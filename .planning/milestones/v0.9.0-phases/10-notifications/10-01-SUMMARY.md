---
phase: 10-notifications
plan: 01
subsystem: notifications
tags: [react, tanstack-query, realtime, bell, vitest, push, vapid, pg-cron]

# Dependency graph
requires:
  - phase: 09-offline-removal
    provides: [direct Supabase data layer, demo-mode local adapter with emit-on-write]
provides:
  - Live bell feed (message rows surface without opening Messages)
  - Bell regression lock (arrival / open-clears / preference-off)
  - Push-chain audit verdict (complete-pending-operator-keys)
affects: [10-notifications remaining plans, supervised prod push proof]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 1671
  tasks: 3
  commits: 2
  plan_head_before: 23567bea9ef67bdc5f2cf841a63b7777cf161f34
  plan_head_after: 306ac74b9b30dd7eb3b5a5fd2b9c23e0088adaa

# Tech tracking
tech-stack:
  added: []
  patterns: ["bell mounts the module realtime hook instead of relying on page mounts"]

key-files:
  created: []
  modified: [app/src/hooks/use-notifications.ts, app/src/hooks/use-notifications.test.tsx]

key-decisions:
  - "Starvation seam was the missing realtime subscription on the shell-level bell, not the unread comparator, lastMessageAt mapping, or preference default"
  - "Push path untouched: audit verdict complete-pending-operator-keys, M-01/M-02 stay operator steps per D-04"
  - "Departed-member fan-out edge (no left_at filter in 0042) documented as observation only, not fixed without observed failure"

patterns-established:
  - "Session-long consumers (shell bell) mount their own realtime hook; page-level mounts are not a liveness guarantee"

requirements-completed: [D-01, D-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Post in an unopened thread raises bell badge + row (title, excerpt, /messages link)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#fait surface un message posté dans un fil non ouvert"
        status: pass
    human_judgment: false
  - id: D2
    description: "Opening the thread marks read and clears its row to recentRead (D-02, unchanged)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#ouvrir le fil solde sa ligne"
        status: pass
    human_judgment: false
  - id: D3
    description: "Preference-off hides message rows while computed reminders remain"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "app/src/hooks/use-notifications.test.tsx#masque les lignes messages quand la préférence est coupée"
        status: pass
    human_judgment: false
  - id: D4
    description: "Push chain audited complete-pending-operator-keys; supervised prod proof remains"
    requirement: "D-02"
    verification:
      - kind: other
        ref: "sh scripts/test-db.sh → 48 files green; cron.job shows eo-push-messages */5; check-sql-statique green"
        status: pass
    human_judgment: true
    rationale: "Final proof needs operator hardware on ubuntu1 (VAPID keys, real subscribed device, test-dispatch-push.sh with delivered) — automation cannot subscribe a real device."

# Metrics
duration: ~10min
completed: 2026-10-12
status: complete
---

# Phase 10 Plan 01: Starved Bell Diagnosis + Fix Summary

**Bell rows starved by a missing realtime subscription on the shell-level feed; one-hook fix, three-test lock, push chain audited complete-pending-operator-keys.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-10-12T09:33:00Z (approx)
- **Completed:** 2026-10-12T09:42:18Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Diagnosed the starvation seam with a red-baseline test (failed pre-fix, green post-fix): `useNotifications` lives in `AppShell` for the whole session but nothing invalidated its message queries — only `MessagesPage` mounted `useMessagesRealtime()`. The unread comparator, `lastMessageAt` mapping, markRead scope, feed filtering, and preference default were all proven innocent.
- Fixed minimally: the bell now mounts the existing `useMessagesRealtime()` hook (1 import + 1 call + comment). No center redesign, no other rows touched, no new write path (T-10-01).
- Locked with three regression tests: unopened-thread arrival surfaces badge + row, opening clears to recentRead (D-02 unchanged), preference-off hides message rows.
- Audited the push chain read-only with zero code changes: 0042 trigger/fan-out, `eo-push-messages` `*/5` verified present in `cron.job`, Edge `secret`+`user` scopes with `test`-only user mode, explicit VAPID-absent 500. Verdict: complete-pending-operator-keys (M-01/M-02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose the starved bell, then fix the seam** - `6482248` (fix)
2. **Task 2: Regression tests plus push-chain audit verdict** - `306ac74` (test)
3. **Task 3: Full-chain gate** - no commit (gate only, tree clean)

## Files Created/Modified

- `app/src/hooks/use-notifications.ts` - Mount `useMessagesRealtime()` inside `useNotifications()` so the session-long bell invalidates on message/conversation writes.
- `app/src/hooks/use-notifications.test.tsx` - Three regression tests: arrival-surfacing, open-clears (D-02), preference-off.

## Decisions Made

- The seam was the subscription gap, not the data mapping: cercle rows could go live (self-subscribing `useCercleFeed`) while message rows froze — matching the UAT symptom exactly (rows in code, never seen).
- Push code untouched per D-04: no observed failure anywhere on the push path (SQL suite 48/48 green, Edge reads correct), so M-01/M-02 remain operator steps for the supervised prod proof.
- The departed-member fan-out edge (`private.push_message_notifications` joins `conversation_members` without a `left_at is null` filter, so a tombstoned member still gets push) is recorded as an observation only — fixing it without an observed failure would violate D-04.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The preference-off test initially failed (message rows still shown): in the test env the session store has no user, so the profiles query is disabled and defaults (show everything) apply. Fixed the test by signing in `demoUser` before render and resetting afterwards — product code untouched. Note: the real shell always has a user, so this is test-harness-only.
- Task 3 needed no Supabase-less outDir workaround: no `.env*` files exist in `app/`, so the default build is demo-mode and the stock Playwright webServer path worked (e2e 20/20).

## Push-Chain Audit Verdict

**complete-pending-operator-keys.** Trigger `enqueue_message_notification` → queue `message_notifications` → read-time fan-out (participants minus author, account-holding, preference-gated, 24 h window, per-conversation tag) → `eo-push-messages` every 5 min → Edge `push-notify` (`secret` full send, `user` test-only, VAPID 500-explicit, per-device delivery report). Remaining: operator on ubuntu1 sets VAPID keys in stack `.env`, recreates `functions`, subscribes a real device, runs `test-dispatch-push.sh` expecting `delivered` (docs/PWA.md checklist). `test-dispatch-push.sh` was deliberately not run here: without a real subscribed device any result would be unprovable.

## Verification

- `npm run typecheck` — clean
- `npm test -- use-notifications messages` — 49/49 green (3 files)
- `npm run build` — clean (precache 88 entries)
- `npm run test:e2e -- e2e/cadeaux-contacts.spec.ts` — 20/20 (chromium + mobile)
- `python3 scripts/check-sql-statique.py` — 148 effective functions, no defects
- `sh scripts/test-db.sh` — 48 files, all green (incl. `0013_message_notifications` covering 0042)
- `cron.job` on the local stack shows `eo-push-messages | */5 * * * *`

## Known Stubs

None.

## User Setup Required

None - no external service configuration required. (M-01/M-02 operator steps belong to the supervised prod proof, a later plan.)

## Next Phase Readiness

- Bell is live; the supervised prod push proof (M-01/M-02) is unblocked with a precise operator checklist.
- Open observation for a future phase: exclude `left_at` tombstones from the 0042 fan-out (needs an observed failure or a product decision first, per D-04).

---
*Phase: 10-notifications*
*Completed: 2026-10-12*

## Self-Check: PASSED
- SUMMARY present on disk; both task commits exist; `.planning/` is gitignored (docs commit skipped per criteria).
