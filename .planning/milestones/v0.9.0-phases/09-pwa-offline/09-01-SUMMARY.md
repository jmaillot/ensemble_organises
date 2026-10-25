---
phase: 09-pwa-offline
plan: 01
subsystem: offline-data
tags: [dexie, indexeddb, sync-queue, stale-reads, pwa, react-query]

# Dependency graph
requires:
  - phase: 08-messages
    provides: [data-layer adapter contract, Dexie cache store, existing test idioms]
provides:
  - Failed Supabase reads serve Dexie cache with explicit staleness flag (D-01)
  - Failure-based mutation queue including join-row removals, ordered replay with attempts (D-02)
  - Honest offline panel and banner: cached reads, pending count, last sync, last-writer-wins (D-04/D-06)
affects: [09-02-pwa-install (background sync reuses flushWithAdapter), future conflict-resolution work]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 11000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [listWithMeta staleness envelope, replay-guard flag against queue duplication, queuedForSync optimistic retention]

key-files:
  created: [app/src/lib/data/offline-reads.test.ts, app/src/lib/data/sync-queue.test.ts]
  modified: [app/src/lib/data/supabase-adapter.ts, app/src/lib/data/sync-queue.ts, app/src/lib/data/dexie.ts, app/src/lib/data/adapter.ts, app/src/lib/data/useResource.ts, app/src/hooks/use-offline-sync.ts, app/src/modules/parametres/components/offline-panel.tsx, app/src/app/app-shell.tsx]

key-decisions:
  - "Any write failure enqueues (transient-first policy); replay is guarded by isReplayingQueue so failed replays count attempts instead of duplicating the queue"
  - "Staleness travels as listWithMeta envelope + hook state (isStale/dataFromCache), never as silent rows"
  - "Queued deletes evict local cache optimistically; queued creates/updates surface only after replay (documented limit in panel copy)"

patterns-established:
  - "listWithMeta: optional DataAdapter method returning { rows, fromCache }; hooks fall back to list() with fromCache:false"
  - "ReplayTarget: minimal structural interface (create/update/remove/removeWhere) so queue replay is testable with fakes"
  - "Honest copy rule: every offline claim names its boundary (stale marking, pending count, last sync, RPC/Edge online-only)"

requirements-completed: [D-01, D-02, D-04, D-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Failed Supabase list reads serve Dexie-cached rows flagged stale; empty cache still errors"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "app/src/lib/data/offline-reads.test.ts (6 tests: throw/error fallback, empty-cache error, household filter, success refresh)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mutations enqueue on real failure including join-row removeWhere; ordered replay with attempts accounting"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "app/src/lib/data/sync-queue.test.ts (6 tests: enqueue-on-failure, deleteWhere filter, no-replay-duplication, ordered replay, attempts, verb dispatch)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Offline panel and banner state exactly what works (cached reads, pending count online+offline, last sync, last-writer-wins, RPC/Edge limits)"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "npm test -- src/lib/data parametres (59 tests, 7 files)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts (20/20 chromium+mobile, demo-mode Supabase-less build)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Last-writer-wins conflicts and replay limits documented in code comments and panel copy"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/lib/data/sync-queue.test.ts#conserve les échecs avec attempts incrémenté"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-10-08
status: complete
---

# Phase 09 Plan 01: Offline reads, queue, honest panel Summary

**Stale-flagged cached reads on any fetch failure, always-enqueue mutation queue with join-row replay, and an offline panel/banner that state exactly what works**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-08T16:25Z
- **Completed:** 2026-10-08T16:45Z
- **Tasks:** 3
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- `SupabaseAdapter.listWithMeta` serves Dexie cache on any read failure (thrown network error or 5xx response), household-scoped with in-memory filter; empty cache rethrows the original error
- `queueOrFail` enqueues on every write failure (navigator flag is messaging-only now); `removeWhere` queues `deleteWhere` with its filter; `isReplayingQueue` guard prevents replay duplication
- `useResource`/`useLinkedRows` expose `isStale`/`dataFromCache`; queued mutations keep optimistic state via `DataError.queuedForSync`
- Offline panel shows network state, live pending count, last sync, and full honest copy (stale marking, ordered replay, last-writer-wins, RPC/Edge online-only); shell shows a pending pill even while online
- 12 new data-layer tests; full gate green: typecheck, 59 Vitest (data+parametres), production build, e2e 20/20

## Task Commits

Each task was committed atomically on branch `gsd/09-01-offline`:

1. **Task 1: Cached-read fallback on failed list** - `e94f25b` (feat)
2. **Task 2: Failure-based queue including join rows, honest panel** - `63ad7d2` (feat)
3. **Task 3: Full-chain gate** - verification only, no code changes (no commit)

**Note:** `.planning/` is gitignored in this repo, so `09-01-SUMMARY.md` lives on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

- `app/src/lib/data/supabase-adapter.ts` - `listWithMeta` fallback, always-enqueue `queueOrFail` + replay guard, `deleteWhere` queue path, optimistic delete eviction
- `app/src/lib/data/sync-queue.ts` - `ReplayTarget` interface, `replayOne`, `flushWithAdapter`, `isReplayingQueue` guard, D-06 last-writer-wins docs
- `app/src/lib/data/dexie.ts` - `PendingMutation.operation` gains `deleteWhere`
- `app/src/lib/data/adapter.ts` - `ListResult` envelope, optional `listWithMeta`, `DataError.queuedForSync`
- `app/src/lib/data/useResource.ts` - `isStale`/`dataFromCache` on both hooks, optimistic retention for queued writes
- `app/src/hooks/use-offline-sync.ts` - replay via `flushWithAdapter`, `lastSyncedAt` persisted to localStorage, failure toast
- `app/src/modules/parametres/components/offline-panel.tsx` - pending/last-sync rows, honest copy, sync-now button
- `app/src/app/app-shell.tsx` - online pending pill, offline copy marks cache as possibly stale
- `app/src/lib/data/offline-reads.test.ts` - created, 6 tests over fallback paths
- `app/src/lib/data/sync-queue.test.ts` - created, 6 tests over queue and replay

## Decisions Made

- Transient-first enqueue policy: any write error is queued (a durable error stays queued with `attempts++` instead of being lost); the replay guard is what keeps this from duplicating the queue. Documented in `queueOrFail` comment.
- Staleness as envelope + hook state rather than changing `list()` return type: zero changes to the ~40 existing `data.list` call sites.
- Queued deletes evict cache optimistically (a deleted row must not resurface from stale reads); queued creates/updates do not touch cache and are documented as appearing only after sync.
- No new e2e offline scenarios: jsdom + demo mode cannot kill the network deterministically (recorded as documented limit per plan, not a gap).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replay would duplicate the queue under always-enqueue**
- **Found during:** Task 2 (failure-based queue)
- **Issue:** Once every failure enqueues, a failed replay through `data.update/remove` enqueues a copy of the already-queued mutation before `flushMutations` counts the failure — the queue would grow on every failed sync.
- **Fix:** `isReplayingQueue()` guard set for the duration of `flushMutations`; `queueOrFail` returns a plain (non-queued) `DataError` during replay so attempts accounting stays the single bookkeeping path. Covered by the `ne remet pas en file pendant un rejeu` test.
- **Files modified:** app/src/lib/data/sync-queue.ts, app/src/lib/data/supabase-adapter.ts
- **Verification:** sync-queue.test.ts green (pending stays 1, attempts 1 after failed replay)
- **Committed in:** 63ad7d2 (part of task commit)

**2. [Rule 2 - Missing critical] `useResource` rolled back optimistic state for queued writes**
- **Found during:** Task 1 (hook stale flags)
- **Issue:** The optimistic `mutate` path restored the snapshot on any error; with failure-based enqueue the error means "queued, will replay" — rolling back would flash-revert a write the user was told is saved.
- **Fix:** `DataError.queuedForSync` flag; the hook keeps optimistic state only for queued errors and still rolls back genuine ones.
- **Files modified:** app/src/lib/data/adapter.ts, app/src/lib/data/useResource.ts
- **Verification:** typecheck + existing parametres/app-shell suites green (59 tests)
- **Committed in:** e94f25b (part of task commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both required for correctness of the plan's own must-haves (no silent divergence, no lost mutations). No scope creep; no new packages.

## Issues Encountered

- `pkill -f "vite preview.*4174"` matched its own shell command line and SIGTERM-killed the agent shell mid-cleanup. Recovered by re-running cleanup with a self-excluding pattern (`[v]ite preview`); env files were restored byte-identical (md5 `36de78ab…` before and after) and the preview server confirmed stopped.
- Plan filenames use `use-resource.ts`/`use-offline-sync.ts` but the repo has `useResource.ts` (camelCase) and `hooks/use-offline-sync.ts`; followed the repo, noted here for plan-phase filename accuracy.

## Known Stubs

None. Queued creates/updates not appearing in stale reads until replay is a documented limit (panel copy), not a stub.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 09-02 (PWA install): `flushWithAdapter(data)` is the Background Sync replay entry point; `lastSyncedAt`/`pending` are already exposed by `useOfflineSync`.
- Branch `gsd/09-01-offline` holds the two task commits; merge into `main` when the wave integrates.

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-08*
