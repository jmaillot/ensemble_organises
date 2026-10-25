---
phase: 09-pwa-offline
plan: 04
subsystem: offline-full-sync
tags: [offline, full-sync, dexie, periodic-sync, react-query]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: [failure-based mutation queue with queuedForSync signal, flushWithAdapter replay entry point (09-01/09-02)]
  - phase: 09-pwa-offline
    provides: [proven list-cache readCached path with household scoping (09-01)]
provides:
  - Whole-household on-demand sync with progress, per-table isolation, queue-first ordering (D-08)
  - Periodic auto-refresh while open and online on a documented 15-minute interval (D-08)
  - Audited household table registry (50 entries) + recorded RPC/Edge exclusions
affects: [09-05 (per-module rollout reuses the same cache the driver pre-fills), offline panel copy]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [orchestration-over-existing-paths, audited-registry-with-recorded-exclusions, module-level timer coalescing]

key-files:
  created: [app/src/lib/data/full-sync.ts, app/src/lib/data/full-sync.test.ts, app/src/lib/data/use-full-sync.ts]
  modified: [app/src/modules/parametres/components/offline-panel.tsx, app/src/app/app-shell.tsx]

key-decisions:
  - "Single-pass household filter plus one parent pass: the schema denormalizes household_id almost everywhere, so 50 entries list with { household_id } and only ardoise_members/ardoise_guests need parent ids from pass 1"
  - "15-minute periodic default: sober per T-09-05, documented in SUMMARY and panel copy; offline/hidden ticks skip silently, never an error"
  - "Stamp last-full-sync only when at least one table refreshed: an all-failed run is not a sync"
  - "gift_items_for_list view (not the base table) is the registered read — the exact call fetchCadeauxSnapshot makes, so the D-01 fallback hits"

requirements-completed: [D-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "A 'Synchroniser le foyer' button downloads every household table into the local cache with visible progress, per-table failure isolation, and the mutation queue replayed first"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "app/src/lib/data/full-sync.test.ts (7 tests: registry coverage + RPC exclusions, ordered progress, isolation, queue-before-refresh, child second pass, parent-failure skip)"
        status: pass
    human_judgment: false
  - id: D2
    description: "While the app is open and online, the same full sync re-runs on a documented interval without user action and degrades silently when offline"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "Timer logic reviewed (visibility/online guards, teardown, inter-instance coalescing); interval constant FULL_SYNC_INTERVAL_MS exported"
        status: pass
    human_judgment: false
  - id: D3
    description: "Queued, un-replayed, or failed states from 09-01/09-03 behave identically under manual and periodic sync (no second replay path)"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "syncHousehold calls flushWithAdapter (the 09-01 path) first; queue-before-refresh ordering proven in full-sync.test.ts"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts (20/20 chromium+mobile, demo-mode Supabase-less build on :4184)"
        status: pass
    human_judgment: false

# Metrics
duration: 55min
completed: 2026-10-09
status: complete
---

# Phase 09 Plan 04: Full-household sync on demand + periodic Summary

**One button preloading every household table for offline use plus an automatic 15-minute refresh while open and online — orchestration over the proven list-cache and queue-replay paths, no new fetch layer, no new protocol**

## Performance

- **Duration:** ~55 min (incl. ~15 min waiting for the concurrent 09-05 agent's in-flight module edits to settle before the build gate)
- **Started:** 2026-10-09T14:50Z
- **Completed:** 2026-10-09T15:45Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- `full-sync.ts`: audited registry of 50 list-cached tables/views (every module's actual `useResource`/`data.list` calls, cross-checked against migrations — each entry exists and carries `household_id` except the three documented specials: `households` by id, `gift_list_shares` + `notification_reads` unfiltered as the app calls them, `gift_items_for_list` view as `fetchCadeauxSnapshot` reads it). `syncHousehold` replays the queue first (`flushWithAdapter`, the 09-01 path), then lists sequentially with per-table try/catch, ordered progress, and a second pass for `ardoise_members`/`ardoise_guests` by parent ids. RPC/Edge reads excluded with recorded reasons (`FULL_SYNC_EXCLUDED`: invite tokens, gift invites, profiles, raw gift_items, Edge invitations).
- `use-full-sync.ts`: `syncNowFull` with concurrent-run guard + inter-instance coalescing (shell timer + panel button never double-sync), `FULL_SYNC_INTERVAL_MS = 15 min` timer firing only when the tab is visible AND online (offline/hidden ticks skip silently, clean teardown).
- Panel: « Synchroniser le foyer » button with live `done/total (table)` progress, synced/failed report line, last-full-sync timestamp row, and honest scope copy (what syncs, what stays online-only: settlement calc, invitations, household creation, foreign shared lists).
- App shell mounts `useFullSync()` for the timer — zero visual change, no new global chrome. 09-01 banner/panel behavior otherwise untouched.
- Full gate green: typecheck, 66 Vitest (data + parametres, incl. 7 new), production build (precache 2206 KiB), e2e 20/20, static-SQL check clean.

## Task Commits

Each task was committed atomically on `main` (repo precedent: 09-01/09-02/09-03 also landed on `main`):

1. **Task 1: Household table registry plus full-sync driver** - `2073cfd` (feat)
2. **Task 2: Manual button plus periodic timer** - `178fd27` (feat)
3. **Task 3: Full-chain gate** - no commit (verification only, no file changes; e2e spec untouched)

**Note:** `.planning/` is gitignored in this repo, so `09-04-SUMMARY.md` lives on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

- `app/src/lib/data/full-sync.ts` - created, registry (50 + 2 children + 5 recorded exclusions) + `syncHousehold` driver
- `app/src/lib/data/full-sync.test.ts` - created, 7 tests (registry, progress order, isolation, queue-first, children, parent-failure skip, child declarations)
- `app/src/lib/data/use-full-sync.ts` - created, manual trigger + 15-min open-and-online timer with coalescing
- `app/src/modules/parametres/components/offline-panel.tsx` - button + progress + report + timestamp + honest scope copy
- `app/src/app/app-shell.tsx` - timer mount only, no visual change

## Decisions Made

- Single-pass `{ household_id }` plus one parent pass: migration audit showed the schema deliberately denormalizes `household_id` onto join/child tables (task/routine assignees, reminders, messages, post_*, expense_participants…), so only the two ardoise tables without it need pass 2 — no new fetch layer anywhere.
- 15-minute default interval, documented here and in panel copy; offline or hidden ticks skip silently (no error, no timestamp) — no background-tab or closed-app promises beyond the 09-02 SW handler.
- `lastFullSyncAt` stamps only when ≥ 1 table refreshed; queue replay alone does not stamp (that is the queue sync's own timestamp).
- No new e2e sync scenario: timers + network kills are not deterministically seedable in demo mode — documented limit per plan, not a gap.

## Deviations from Plan

None - plan executed exactly as written. No new packages (T-09-SC needs no gate).

## Issues Encountered

- **Concurrent 09-05 agent sharing the working tree:** mid-execution, `courses-page`, `notes-page`, then `prestataires-page`/`voyages-page` appeared half-edited (typecheck/build red on files outside my boundary). Waited without touching them; tree settled green and 09-05 committed. My scoped suites stayed green throughout. After my gate, one new uncommitted 09-05 edit (`notes-page.test.tsx`) appeared — out of scope, left alone; final re-run of typecheck still green.
- **Self-inflicted `pkill` matching my own shell** (`-f` pattern present in my own command line) killed the cleanup shell before env restore. Recovered cleanly: server was already dead (port free), env restored byte-identical (md5 `36de78ab…` before and after), temp build dir removed. Lesson recorded for future e2e cleanups: kill by port/PID file, never by command-line pattern.
- E2e used port **4184** (distinct from the 4173 default / 4174 used by 09-03) per the concurrency note; preview server stopped afterwards.

## Known Stubs

None. Foreign shared gift lists are intentionally not pre-fetched (cross-household by definition; share rows ARE synced and navigation re-fetches when online) — documented in panel copy, not a stub.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. T-09-05 (sync burst) mitigated by manual trigger + 15-min default + sequential reads + per-table isolation over existing RLS-gated lists; T-09-SC needs no action (no installs).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 09-05 rollout: every module's offline reads hit the same Dexie rows the driver pre-fills, so per-module adoption (empty-cache state, pending marking) works on first launch offline once a full sync has run.
- If a future module adds a list-cached table, it needs one registry line (+ migration cross-check) — the test's `AUDITED_TABLES` fails loudly until added.

## Self-Check: PASSED

- All 5 files verified present on disk; both commits (`2073cfd`, `178fd27`) verified in `git log`.
- No post-commit deletions; tracked tree contains only 09-05's uncommitted test edit (not mine).
- E2e env files md5-identical before/after (`36de78ab…`); preview server stopped (port 4184 free); temp dir removed.

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-09*
