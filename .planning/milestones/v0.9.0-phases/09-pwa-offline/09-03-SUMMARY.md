---
phase: 09-pwa-offline
plan: 03
subsystem: offline-honesty
tags: [offline, empty-cache, sync-queue, retention, react-query, toasts]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: [failure-based mutation queue with queuedForSync signal, stale-flag seam (09-01)]
  - phase: 09-pwa-offline
    provides: [Background Sync replay entry point flushWithAdapter (09-02)]
provides:
  - Explicit empty-cache state for first-launch-offline (D-07)
  - Queued-create retention with pending marking until replay confirms (D-07)
  - Queuing never surfaces as an error on the tasks create path (UAT 2026-10-09 correction)
affects: [other list modules (adopt OfflineEmptyState + isEmptyCacheOffline per module), 09-04]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5700
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [isEmptyCacheOffline presentation flag, pendingRows outside the query cache, caller-generated stable ids for queued creates]

key-files:
  created: [app/src/hooks/use-online.ts]
  modified: [app/src/lib/data/useResource.ts, app/src/components/ui/empty-state.tsx, app/src/modules/taches/hooks/use-taches.ts, app/src/modules/taches/components/task-row.tsx, app/src/modules/taches/taches-page.tsx, app/src/modules/taches/taches-page.test.tsx]

key-decisions:
  - "Empty-cache is a presentation flag (offline + no rows + last read not successful), not an adapter change: no fetch, gate, or queue-protocol touch"
  - "Pending creates live outside the React Query cache so background refetches cannot wipe them before replay; confirmation is id-matched, never positional"
  - "Caller-generated stable ids: optimistic row, queue entry, and replayed server row share one id, so replay confirms without duplicating"
  - "Scoped to the tasks path (reported module); other lists adopt the same two-line pattern per module, proven per module — no speculative rewrites"

requirements-completed: [D-01, D-04, D-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "First launch offline (empty cache) renders an explicit empty-cache state with reconnect retry, never a mute list or raw error"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx (4 tests: paused mute state, error-then-offline, auto reconnect refetch, safe retry)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Queued offline creates stay visible pending-marked until replay confirms, without duplicating"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx (offline-create test with real enqueueMutation + flushWithAdapter replay)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Queuing never surfaces as an error: offline create shows the queued confirmation"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "same offline-create test (queued copy present, raw queued message absent, dialog closes)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Online behavior byte-identical (presentation + retention only)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "5 pre-existing taches tests green unchanged; full data+taches suites green (27 tests)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts (20/20 chromium+mobile, demo-mode Supabase-less build)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-09
status: complete
---

# Phase 09 Plan 03: Empty-cache honesty + queued confirmation Summary

**Explicit empty-cache state with reconnect retry, queued creates retained pending-marked until replay, and the queued signal reaching the confirmation toast instead of the error toast**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-09T12:31:56Z
- **Completed:** 2026-10-09T12:56Z
- **Tasks:** 2
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments

- `useResource` exposes `isEmptyCacheOffline` (query enabled + offline + zero rows + last read not successful) and `pendingIds`; every list through the hook gets the seam, tasks wires it first
- Shared `OfflineEmptyState` (wifi icon, « Aucune donnée en cache — reconnecte-toi pour charger », « Réessayer » bound to `refetch`, which follows reconnect via the existing online-event/TanStack path — no new mechanism)
- Queued creates stay rendered: caller-generated stable id, optimistic row kept outside the query cache, merged into `rows`, pending-marked (« En attente de synchronisation ») until the id reappears in server data after replay — no duplicate by construction
- Offline create on the tasks path closes the dialog and toasts « Tâche ajoutée — elle sera synchronisée au retour du réseau. » (default tone); the error toast fires only on genuine failures
- Three visibly distinct states on the tasks path: live list / 09-01 stale (unchanged) / empty-cache; genuine empty list and online ErrorState byte-identical
- Full gate green: typecheck, 27 Vitest (data + taches), production build (precache 2195 KiB), e2e 20/20

## Task Commits

Each task was committed atomically on `main` (repo precedent: 09-01/09-02 also landed on `main`):

1. **Task 1: Explicit empty-cache state plus queued-write retention** - `42f8a0e` (feat)
2. **Task 2: Proofs and full-chain gate** - `a77c06b` (test)

**Note:** `.planning/` is gitignored in this repo, so `09-03-SUMMARY.md` lives on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

- `app/src/hooks/use-online.ts` - created, reactive `navigator.onLine` via `useSyncExternalStore` (shared seam for all empty-cache states)
- `app/src/lib/data/useResource.ts` - `isEmptyCacheOffline` + `pendingIds`; `create` generates a stable id upfront and retains queued creates as `pendingRows` outside the query cache with id-matched confirmation
- `app/src/components/ui/empty-state.tsx` - `OfflineEmptyState` shared component; `EmptyState` gains an `actionIcon` prop (default `plus`, `refresh` for retry)
- `app/src/modules/taches/hooks/use-taches.ts` - passes `isEmptyCacheOffline` + `pendingIds` through
- `app/src/modules/taches/components/task-row.tsx` - `pending` prop rendering « En attente de synchronisation » in the meta line
- `app/src/modules/taches/taches-page.tsx` - renders `OfflineEmptyState` first, queued-`DataError` on submit closes the dialog with the queued confirmation instead of the error toast
- `app/src/modules/taches/taches-page.test.tsx` - 5 new tests (red baselines first, all failed before the fix, all green after)

## Decisions Made

- Presentation + retention only: the flag reads hook state (`online`, `rows`, `query.status`), so fetch, gates, queue protocol, and all copy outside these states are untouched — online behavior is byte-identical.
- `query.status !== 'success'` (not `isError`) defines the empty-cache branch: a paused first fetch (production offline) and a failed fetch both qualify, while a successful-but-empty read followed by an offline blip still shows the genuine empty list.
- Pending rows live outside the query cache (not `setQueryData`): any `refetch`/`invalidate` before replay would otherwise wipe the queued row from the screen.
- Tasks-only wiring: the seam (`isEmptyCacheOffline`, `OfflineEmptyState`, `pendingIds`) is shared, the UI adoption is per-module and proven — other lists follow the same two lines when their module is touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Spy bypassed the queue it meant to prove**
- **Found during:** Task 2 (offline-create proof)
- **Issue:** `vi.spyOn(data, 'create').mockRejectedValue(...)` replaced the whole method, so the real `queueOrFail` never ran — `pendingCount()` stayed 0 and the replay half of the test proved nothing.
- **Fix:** `mockImplementation` that calls the real `enqueueMutation` then throws the queued `DataError` — faithful offline simulation, genuine `flushWithAdapter(data)` replay in the same test.
- **Files modified:** app/src/modules/taches/taches-page.test.tsx
- **Verification:** test green, `flushed.replayed > 0`, single confirmed row, marker cleared
- **Committed in:** a77c06b (part of task commit)

**2. [Rule 2 - Missing critical] Dropped a wrong `&& !isError` gate before committing**
- **Found during:** Task 1 (hook pass-through)
- **Issue:** Gating the flag on combined `isError` would have forced the error+offline branch back to the raw `ErrorState` — the exact bug being fixed.
- **Fix:** Pass the tasks-level flag through directly; render order (`isEmptyCacheOffline` first) already arbitrates.
- **Files modified:** app/src/modules/taches/hooks/use-taches.ts
- **Verification:** error-then-offline test green
- **Committed in:** 42f8a0e (part of task commit, never committed wrong)

---

**Total deviations:** 2 auto-fixed (1 test bug, 1 missing critical caught pre-commit)
**Impact on plan:** Both required for the plan's own must-haves (real replay proof, error+offline branch). No scope creep; no new packages.

## Issues Encountered

- None beyond the two deviations above. The e2e demo-mode workaround (moved `.env.production.local` aside, built to `dist-e2e-sans-supabase`, served on :4174 via `E2E_BASE_URL`, restored byte-identical md5 `36de78ab…`, preview stopped, temp dir removed) worked as in 09-01.

## Known Stubs

None. Queued creates/updates on non-tasks lists are unwired (documented adoption path, not stubs — their current behavior is unchanged).

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. The plan's T-09-04 (mute empty list) is mitigated by this plan's three distinct states with honest copy.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 09-04: the `isEmptyCacheOffline` / `OfflineEmptyState` / `pendingIds` seam is shared — any list module adopts it in two lines (`use-taches` + page render) with per-module proof tests following the taches pattern.
- Queued updates already retain optimistic state (09-01); queued creates now match. Queued deletes evict optimistically (09-01, unchanged).

## Self-Check: PASSED

- All 7 files verified present on disk; both commits (`42f8a0e`, `a77c06b`) verified in `git log`.
- No post-commit deletions (`git status` shows only the intended test-file modification before its own commit; tree clean apart from untracked `.claude/`/`.gsd/`).

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-09*
