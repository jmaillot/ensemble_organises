---
phase: 09-pwa-offline
plan: 07
subsystem: offline-removal
tags: [offline-removal, supabase-direct, pwa, push, demo, import-proof]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: [failure-based queue + cached-read fallback + stale seam (09-01), bg-sync trigger (09-02)]
  - phase: 09-pwa-offline
    provides: [empty-cache states + queued retention + OfflineEmptyState seam (09-03), full-sync driver + timer (09-04), all-modules rollout (09-05), route preload + retry boundary (09-06)]
provides:
  - Direct Supabase reads/writes with original errors (D-10)
  - Offline-free UI + precache-and-push-only SW + honest docs (D-10)
  - Import-proof + full-chain removal certificate (D-10)
affects: [future AGENTS.md amendment (orchestrator-owned), future notification-seed time-robustness (deferred)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 57000
  tasks: 3
  commits: 2

# Commits (#3968, measured from ledger)
plan_head_before: 5df6aa211d7cb48ffebda3f1698a3320afe859bc
plan_head_after: ef009bbb0619d86c3f60047049225c5ba7c5e962
commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [audit-first removal (inventory before deletion), checkout-anchored reverts (pre-offline copies as restoration proof), import-proof grep gate before test gate, pristine-worktree pair control for suspect failures]

key-files:
  created: []
  modified: [app/src/lib/data/supabase-adapter.ts, app/src/lib/data/adapter.ts, app/src/lib/data/useResource.ts, app/src/lib/data/dexie.ts, app/src/lib/data/local-adapter.ts, app/src/app/app-shell.tsx, app/src/modules/parametres/components/offline-panel.tsx, app/src/components/ui/empty-state.tsx, app/src/hooks/use-pwa.ts, app/src/sw.ts, app/src/test/setup.ts, docs/PWA.md]
  deleted: [app/src/lib/data/sync-queue.ts, app/src/lib/data/full-sync.ts, app/src/lib/data/use-full-sync.ts, app/src/hooks/use-offline-sync.ts, app/src/hooks/use-online.ts, app/src/lib/data/sync-queue.test.ts, app/src/lib/data/offline-reads.test.ts, app/src/lib/data/full-sync.test.ts, app/src/hooks/use-pwa.test.ts]

key-decisions:
  - "Revert-to-copy restoration: the 17 pages + 18 suites were restored to their exact pre-offline git copies (24fbb80^/19adb2d^/42f8a0e^/a77c06b^) — genuine empty lists and original error states back byte-identically, not rewritten"
  - "Dexie stays for the local demo adapter only (rows store); the queue's mutations store was dropped via a v2 schema upgrade — no half-removed dependency"
  - "Panel file kept (install/version/mode rows live there) with sync/offline rows and copy removed; SW bumped to precache-push-v1 with media cache + bg-sync sections deleted"
  - "3 clock-flakes left red on purpose (scope boundary): proven pre-existing via pristine pair + TZ characterization, logged to deferred-items.md"

requirements-completed: [D-10]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "In Supabase mode every read/write goes straight to the backend with original errors surfacing — no Dexie cache, no queue, no fallback, no retention, no full sync, no timer"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "typecheck green; full suite 669/672 (3 pre-existing clock-flakes, proven innocent — see Issues)"
        status: pass
      - kind: build
        ref: "production build green, precache 88 entries, check-precache-coverage.sh 69/69 + 31/31 + sw/nginx OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "No offline UX remains anywhere while genuine empty lists and original error states read exactly as before offline existed"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "repo-wide grep gate CLEAN for all 5 deleted modules + 25 removed symbols; 17 pages + 18 suites restored to pre-offline copies"
        status: pass
    human_judgment: false
  - id: D3
    description: "Installable PWA, push subscribe/notify paths, and local demo mode keep working byte-identically"
    requirement: "D-10"
    verification:
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts 20/20 in Supabase-less demo mode (demo journeys prove the Dexie remnant)"
        status: pass
      - kind: unit
        ref: "src/app + parametres suites 94/94 (install/panel/router/preload paths)"
        status: pass
    human_judgment: false

# Metrics
duration: ~12min
completed: 2026-10-12
status: complete
---

# Phase 09 Plan 07: Offline-data mode removal Summary

**Direct backend reads/writes with original errors, all offline UX gone, installable PWA + push + local demo preserved — import-proof and a fully green suite (modulo 3 proven pre-existing clock-flakes) as the removal certificate**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-12T06:20:10Z
- **Completed:** 2026-10-12T06:31:57Z
- **Tasks:** 3 (2 commits + 1 verification-only gate, per 09-04/09-06 precedent)
- **Files:** 59 changed, +155/−3448 (net −3293 lines of offline mode)

## Accomplishments

- **Audit-first inventory (recorded, then executed):** every offline-added or offline-bent symbol mapped with its importers before any deletion — `cacheRows/readCached/serveCached/listWithMeta/fromCache` (adapter + useResource + offline-reads), `enqueueMutation/flushMutations/pendingCount/queueOrFail/queuedForSync` (adapter + use-offline-sync + all page catch branches), `syncHousehold/FULL_SYNC_*` registry/driver/timer (panel + shell), `useOfflineSync/useFullSync/useOnline` hooks, `isEmptyCacheOffline/pendingIds/isStale/dataFromCache` seam flags, `OfflineEmptyState`, `requestQueueSync/requestPeriodicSync/EO_*` bg-sync constants, SW `eo-media` route + bg-sync/periodic handlers.
- **Data layer direct (Task 1, `4e452e8`):** `supabase-adapter.ts` is a pass-through — `list/create/update/remove/removeWhere` throw `DataError(error.message, error)` with the original message, no Dexie, no queue, no fallback; `adapter.ts` drops `ListResult/listWithMeta/queuedForSync`; `useResource.ts` is the pre-offline hook (optimistic `mutate` + unconditional rollback intact) plus the kept non-offline `refetchInterval` (accueil, be78765). 17 pages + 18 suites restored to exact pre-offline copies; offline-only lib suites (`offline-reads`, `sync-queue`) deleted.
- **UI + SW + docs (Task 2, `ef009bb`):** shell banners + both sync hooks gone (preload/push-toast/install kept); panel rewritten to mode/version/install + honest online-only copy (file kept — install rows live there); `empty-state`/`use-pwa` restored pre-offline; `sw.ts` = precache + push/notificationclick + EO_VERSION diagnostic only (`SW_VERSION precache-push-v1`, media route + bg-sync sections deleted); `docs/PWA.md` rewritten (removed-with-reason banner + install/push/demo remainder). All 5 offline-only modules + 3 remaining offline suites deleted. `dexie.ts`: queue `mutations` store dropped via `version(2)` upgrade (no half-removed schema); `clearDatabase`/test setup follow; local-adapter stale comment fixed.
- **Certificate gate (Task 3, verification only):** typecheck green (×4), FULL suite 669/672, production build green (precache 88 entries, 2184.63 KiB — down from 2206.60, entry count unchanged), `check-precache-coverage.sh` OK (69/69, 31/31, sw/nginx aligned), e2e `cadeaux-contacts` 20/20 in Supabase-less demo mode (env `36de78ab…` restored byte-identical, preview stopped port-based, production dist rebuilt). Demo journeys passing prove the Dexie remnant still serves local demo mode — the dependency stays for that documented reason.
- **Import-proof:** repo-wide grep CLEAN for all 5 deleted modules and all 25 removed symbols (only unrelated homonyms remain: courses `pendingCount` domain field, cadeaux `LeaveGiftListResult`).

## Task Commits

Each task committed atomically on `main` (repo precedent: 09-01 through 09-06 all landed on `main`):

1. **Task 1: Audit the removal surface, then slim the data layer** - `4e452e8` (refactor, 43 files, typecheck green)
2. **Task 2: Remove offline UI, slim SW, update docs** - `ef009bb` (refactor, 16 files, typecheck + 94 scoped tests green)
3. **Task 3: Prune tests and full-chain gate** - no commit (gate only: the pruning rode with Tasks 1–2 for import-proof atomicity — see deviation 1; full gate run here, zero files changed)

**Note:** `.planning/` is gitignored in this repo, so `09-07-SUMMARY.md` (+ `deferred-items.md`) live on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

Slimmed (direct/honest, no offline): `supabase-adapter.ts`, `adapter.ts`, `useResource.ts` (+kept `refetchInterval`), `dexie.ts` (v2 drops `mutations`), `local-adapter.ts` (comment), `app-shell.tsx` (banners/hooks out), `offline-panel.tsx` (rewritten), `empty-state.tsx` + `use-pwa.ts` (pre-offline copies), `sw.ts` (precache+push), `test/setup.ts` (no mutations clear), `docs/PWA.md` (rewritten).
Restored to pre-offline copies: 17 `*-page.tsx` (+`ardoise-detail-page.tsx`), 18 `*.test.tsx` (incl. taches hook/row/page), with the post-09-05 calendrier `findBy` fix (835aa66) re-applied on its reverted test.
Deleted with zero remaining importers (grep-proven): `sync-queue.ts`, `full-sync.ts`, `use-full-sync.ts`, `use-offline-sync.ts`, `use-online.ts`, `sync-queue.test.ts`, `offline-reads.test.ts`, `full-sync.test.ts`, `use-pwa.test.ts`.
Untouched survivors: `route-preload.ts`, `route-error.tsx` (09-06 guard stays per D-10), `router.tsx`, `check-precache-coverage.sh`, `local-adapter.ts` logic, `notifications-panel.tsx` + push lib/Edge, `vite.config.ts`, `nginx.conf`, e2e spec.

## Decisions Made

- **Revert-to-copy over rewrite:** the 09-01/03/04/05 commits give exact pre-offline versions per file; checking those out restores genuine empty/error states byte-identically and is itself the proof. Only later non-offline changes were re-applied (calendrier `findBy`, `refetchInterval`).
- **Panel kept, not deleted:** push/install rows live there, so per the plan it stays with the data section replaced by honest online-only copy; entry point (`parametres-page.tsx`) untouched.
- **Mutations store dropped, not left:** a dead `mutations` table in every user's IndexedDB would be half-removed residue (T-09-SC); Dexie's `version(2)` upgrade deletes it cleanly on next open, fresh DBs start without it.
- **`householdScopedTables` export kept:** zero importers but pre-existing public API, not offline-added — out of removal scope.
- **"Vider le cache local" button kept always** (as before offline existed): demo reset in local mode, harmless otherwise — pre-existing behavior, not offline-mode UX.
- **Clock-flakes left red (scope boundary):** 3 failures in an untouched file, proven environmental — fixed neither the tests nor the seeds; logged to `deferred-items.md`.

## Deviations from Plan

### Execution-order adjustments (import-graph forced, all green per commit)

**1. Page sources + suites reverted in the Task 1 commit, not Tasks 2–3**
- **Found during:** Task 1 typecheck (removing `queuedForSync` breaks every page catch branch + test mock the moment `adapter.ts` changes).
- **Why:** the removal is import-atomic — no green intermediate exists with data-layer slimmed but consumers unreverted. Task 1 commit therefore carries the 17 page + 18 suite reverts; Task 2 carries the module/test deletions its own UI edits unblock; Task 3 is the certificate gate with zero file changes (precedent: 09-04, 09-06).
- **Impact:** file-to-task mapping differs from the plan's `files` lists; the substance (every listed file changed/deleted, every gate run) is identical. No scope creep.

**2. `sync-queue.test.ts` + `offline-reads.test.ts` deleted in Task 1, `full-sync.test.ts` + `use-pwa.test.ts` in Task 2**
- **Reason:** same atomicity — each rides with the commit that removes what it imports. All four were offline-only suites; no surviving-behavior coverage was lost (page suites restored to pre-offline coverage).
- **Committed in:** `4e452e8` (first two), `ef009bb` (last two).

**3. [Rule 2 - Missing critical] Dexie `mutations` store dropped via v2 upgrade**
- **Found during:** Task 2 import-proof (the store's only producer/consumer was the deleted queue).
- **Fix:** `version(2).stores({...mutations: null})` + simplified `clearDatabase` + test setup; documented at the dependency.
- **Files modified:** `dexie.ts`, `test/setup.ts`, `local-adapter.ts` (comment)
- **Committed in:** `ef009bb`

---

**Total deviations:** 1 ordering adjustment (+ its test-deletion corollary) + 1 Rule-2 completion. No scope creep; no new packages (T-09-SC clean).

## Issues Encountered

- **3 pre-existing time-of-day failures in `use-notifications.test.tsx` (NOT a regression):** full suite 669/672. Proven innocent three ways — (1) identical 3/3 failure on the pristine pre-09-07 tree `5df6aa2` in a separate worktree against the same live backend; (2) same file passes 3/3 under `TZ=Pacific/Kiritimati` (20:30 local); (3) mechanism identified: `demoMessages` seeds carry fixed wall-clock times (`10:42/10:44/10:45/09:18/18:10` today) and the run happened at ~08:30 Paris, so `markRead(now)` can never cover future-dated messages. 09-06's 88/88 run happened at 17:45 Paris (past 10:45) — a post-10:45 Paris re-run is green with zero code change. Untouched file + untouched code path → out of scope per the boundary rule; logged to `deferred-items.md` (OPEN). Full-suite wall time ~188 s (09-06 infra note stands — extended timeout used).
- **Edit-tool whitespace friction (×3):** two `Edit` calls failed to match on `supabase-adapter.ts`/`app-shell.tsx` (indentation drift in long blocks); resolved via byte-exact Python replacements, verified by read-back + typecheck. No code impact.
- **e2e preview kill:** port-based `fuser -k 4187/tcp` (never `pkill -f`, per the 09-05 lesson); preview confirmed stopped, demo `outDir` never written (fixed `dist/`, production rebuilt after), `.env.production.local` restored byte-identical (md5 `36de78ab…` before and after).

## Known Stubs

None. No TODO/FIXME/placeholder added; no component left without a data source. The dropped `mutations` store is schema-removed (v2), not stubbed. `householdScopedTables` (zero importers, pre-existing) is retained API, not a stub.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes beyond the IndexedDB `mutations` store removal (client-local, upgrade-handled). T-09-08 (dangling import / half-removed path) mitigated by the repo-wide grep gate (CLEAN) + FULL suite + build + coverage proof + e2e; T-09-SC needs no action (no installs).

## AGENTS.md amendments needed (orchestrator-owned — NOT edited here)

1. **Ligne 10** — « installable, offline-first partiel » : plus vrai ; l'app est en ligne d'abord + installable + démo locale (D-10).
2. **§2.2, ligne 41** — `Offline cache | Dexie v4 + SW Workbox | Cache applicatif IndexedDB…` : Dexie ne sert plus que la démo locale ; le SW ne cache plus ni données ni médias (précache + push uniquement).
3. **§3, ligne 368** — `/offline # cache Dexie et queue de synchronisation` : ce répertoire n'existe pas (c'est `/lib/data`, déjà avant 09-07 — dérive pré-existante) et la file n'existe plus.
4. **`docs/BACKEND.md` ~l.1102** — « le calcul local de `types.ts` ne sert que de repli (démo, hors ligne, fonction injoignable) » : le cas « hors ligne » n'existe plus en mode Supabase (démo + fonction injoignable restent).

## User Setup Required

None — no external service configuration required. No operator step (M-01/M-02 unchanged, push untouched).

## Next Phase Readiness

- **Re-run for a literally-green board:** after 10:45 Paris (or any run past the day's fixed seed times), `cd app && npm test` is expected fully green with zero code change; the 3 flakes are the only delta.
- **For verifiers:** `git diff 5df6aa2..HEAD --stat` (59 files, +155/−3448) is the whole removal; the grep gate commands are in Task 2's log; e2e followed the 06-03 Supabase-less pattern.
- **If offline ever returns:** it must be re-planned as new work — no seam, flag, or store for it remains (that is the point of D-10).

## Self-Check: PASSED

- All modified/created files verified present on disk; both commits (`4e452e8`, `ef009bb`) verified in `git log`; `git status` clean apart from untracked `.claude/`/`.gsd/`.
- Post-commit deletions reviewed: commit 1 deletes only the 2 intended lib suites; commit 2 deletes only the 5 modules + 2 suites — all grep-proven zero-importer, all documented above.
- SUMMARY + `deferred-items.md` present on disk (`.planning` gitignored — docs commit skipped per §2.7/09-03 precedent).

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-12*
