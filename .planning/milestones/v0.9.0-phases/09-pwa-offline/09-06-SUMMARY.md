---
phase: 09-pwa-offline
plan: 06
subsystem: offline-navigation
tags: [offline, routing, code-splitting, precache, service-worker, retry]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: [Single manifest + aligned sw.js/nginx no-cache rule, bg-sync worker (09-02)]
  - phase: 09-pwa-offline
    provides: [OfflineEmptyState honesty states on every list (09-03/09-05)]
provides:
  - Single route-chunk loader table feeding both LazyRoute and the idle preloader (D-09)
  - Per-route chunk-failure boundary with true re-import + auto-retry on reconnect (D-09)
  - Repeatable build-time precache coverage proof, proven red-capable (D-09)
affects: [every future route addition (one table entry), future SW-precache audits]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 9000
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [single-loader-table (router consumes loaders, preloader triggers them — no drift), attempt-keyed lazy recreation (React caches rejected lazy promises, retry needs a new object), online-event auto-retry on chunk boundaries]

# Commits (#3968, measured from ledger)
plan_head_before: 19adb2d35963dd6670013785593104cd1a4a13d3
plan_head_after: 993fa319b84ddfdd8a83b0b429d980371a13561
commits: 2

key-files:
  created: [app/src/app/route-preload.ts, app/src/app/route-preload.test.tsx, app/src/components/ui/route-error.tsx, scripts/check-precache-coverage.sh]
  modified: [app/src/app/router.tsx, app/src/app/app-shell.tsx]

key-decisions:
  - "Single loader table as source of truth: route-preload.ts owns the 31 import() specifiers, router consumes them via LazyRoute, the preloader triggers them idle — adding a route is one table entry, preload and coverage follow"
  - "Retry recreates the lazy() object per attempt (attempt-keyed useMemo): React caches a rejected lazy promise, so re-rendering the same object would never re-fetch — the re-import is real, precached chunks resolve offline"
  - "Coverage proof as a committed shell script over dist/ (not a unit test): it asserts what the SW actually precaches — dist/assets vs dist/sw.js — and fails loud on table/build divergence, proven red on a bogus 32nd entry"
  - "No vite.config.ts/nginx.conf change: the 09-02 sw.js/no-cache alignment held on the fresh dist — confirmed, not touched"

requirements-completed: [D-09]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Offline navigation to a never-visited page renders it (preloaded/precached chunk) or an explicit retry state — never a frozen fallback or dead click"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "app/src/app/route-preload.test.tsx — LazyRoute renders Réessayer on rejection, retry re-imports and recovers, online event auto-retries; bare-Suspense baseline pinned as retry-less"
        status: pass
    human_judgment: false
  - id: D2
    description: "While online and idle, route chunks preload in the background at the lowest priority without slowing first paint"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "route-preload.test.tsx — nothing synchronous before idle (requestIdleCallback, setTimeout fallback), online-only, sequential, one failure never stops the rest, mounts once"
        status: pass
    human_judgment: false
  - id: D3
    description: "The built precache manifest provably covers every route chunk (build-time check)"
    requirement: "D-09"
    verification:
      - kind: build
        ref: "sh scripts/check-precache-coverage.sh — 69/69 dist JS in sw.js, 31/31 page chunks match the loader table, sw.js/nginx aligned; proven red (exit 1) on a bogus 32nd entry"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts 20/20 (Supabase-less demo build, isolated outDir/port, env restored byte-identical)"
        status: pass
    human_judgment: false

# Metrics
duration: ~44min
completed: 2026-10-09
status: complete
---

# Phase 09 Plan 06: Reliable offline navigation Summary

**Frozen offline navigation ended: one loader table feeds per-route retry boundaries and the idle preloader, and the built SW precache is proven to cover every route chunk**

## Performance

- **Duration:** ~44 min (14:38 → 15:22 UTC, start timestamp recorded)
- **Tasks:** 3
- **Files:** 6 (4 created, 2 modified)

## Accomplishments

- **RED first:** a rejecting chunk under today's bare-`Suspense` pattern was proven recovery-less (fallback persists, then the uncaught rejection escapes to the root — no retry button ever appears). The red suite failed before any source was touched.
- **Single loader table** (`app/src/app/route-preload.ts`): all 31 route `import()` specifiers in one `routeChunkLoaders` record. `router.tsx` consumes them through `LazyRoute`; the preloader triggers them idle. Same chunks as before (specifiers unchanged), no eager bundling, no bundle-size change (precache 2206.60 KiB, same as 09-05's 2206).
- **Per-route retry boundary** (`app/src/components/ui/route-error.tsx`): `LazyRoute` wraps every lazy route — shared `RouteFallback` skeleton while loading, French `ErrorState` with « Réessayer » on chunk failure, true re-import per attempt (attempt-keyed `lazy()` recreation, because React caches rejected promises), plus automatic retry on the `online` event. On success the boundary sleeps — online rendering is byte-identical.
- **Idle preloader:** `requestIdleCallback` (timeout 8 s) with a deferred `setTimeout` fallback, online-only, sequential, every failure swallowed (T-09-07), mounted once in `AppShell` inside try/catch with a StrictMode double-effect guard. 10 new tests pin all of it.
- **Coverage proof** (`scripts/check-precache-coverage.sh`): on the fresh production dist — 69/69 `dist/assets/*.js` present in `dist/sw.js` (zero missing, zero orphans), 31/31 `*-page-*` chunks match the 31 table entries, `dist/sw.js` exists and the nginx `/sw.js` no-cache rule is present. `vite.config.ts`/`nginx.conf` needed no change (09-02 alignment held). Script proven red-capable: a bogus 32nd loader entry fails it with exit 1 (entry reverted afterwards, byte-identical).
- **Full gate green:** typecheck, 47/47 `src/app` tests, production build, full suite 88/88 files (~730 tests) on the closing run, e2e 20/20.

## Task Commits

Each task committed atomically on `main` (repo precedent: 09-01 through 09-05 all landed on `main`):

1. **Task 1: RED, idle preload plus retry boundary** - `dfb8e07` (feat, 5 files)
2. **Task 2: Build-time precache coverage proof** - `993fa31` (chore, proof script)
3. **Task 3: Full-chain gate** - no commit (gate only: typecheck + Vitest + build + e2e, zero files changed; e2e spec untouched)

**Note:** `.planning/` is gitignored in this repo, so `09-06-SUMMARY.md` lives on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

- `app/src/app/route-preload.ts` - created, loader table (31 entries) + `preloadRouteChunks` + `ROUTE_CHUNK_COUNT`
- `app/src/app/route-preload.test.tsx` - created, 10 tests (frozen baseline + boundary + preloader)
- `app/src/components/ui/route-error.tsx` - created, `RouteFallback` (moved verbatim from router) + `LazyRoute`
- `scripts/check-precache-coverage.sh` - created, repeatable dist-vs-SW proof (executable)
- `app/src/app/router.tsx` - 31 bare-`Suspense` blocks → `LazyRoute` (same specifiers, guards, fallbacks); `RouteFallback` now imported
- `app/src/app/app-shell.tsx` - one guarded `preloadRouteChunks()` mount

## Decisions Made

- **Table owns the specifiers, router only references them:** the alternative (preload duplicating the import list) would drift on the next route addition; the single table makes drift a type error, not a silent gap.
- **Attempt-keyed `lazy()` recreation over key-remount of the same object:** remounting the same `lazy()` replays the cached rejection — verified against React's lazy caching semantics, pinned by the retry-recovers test (attempts === 2).
- **Proof as a shell script over `dist/`, not a Vitest file:** coverage is a property of the build output, not the source tree — a unit test would assert the wrong artefact (and fail on checkouts without `dist/`). The script reads only `dist/` + `nginx.conf`.
- **`vite.config.ts`/`nginx.conf` untouched:** the plan allowed config fixes "if anything is missing" — nothing was missing (69/69, 31/31, rule present), so no behavior change beyond coverage, per the plan's constraint.
- **e2e asserts the deterministic subset only** (unchanged spec, gate only): true offline-navigation e2e (killed network mid-session) is not deterministically seedable in demo mode — recorded as the plan's documented limit; the device UAT re-test is the proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test file must be `.tsx`, not `.ts`**
- **Found during:** Task 1 (first RED run — JSX parse error, zero tests ran)
- **Issue:** Vitest transforms `.ts` without the JSX pipeline; the plan's `route-preload.test.ts` filename cannot hold JSX assertions.
- **Fix:** Renamed to `route-preload.test.tsx` (matches the existing `router.test.tsx` convention).
- **Files modified:** app/src/app/route-preload.test.tsx
- **Commit:** dfb8e07 (part of task commit, never committed broken)

**2. [Rule 3 - Blocking] `noImplicitOverride` requires `override` on class members**
- **Found during:** Task 1 (typecheck — 4 errors on `LazyRoute`)
- **Issue:** `state`, `componentDidMount`, `componentWillUnmount`, `render` override `Component` members; `getDerivedStateFromError` (static) must NOT carry it.
- **Fix:** Added `override` to the four instance members; static left bare.
- **Files modified:** app/src/components/ui/route-error.tsx
- **Commit:** dfb8e07 (part of task commit)

**3. [Rule 1 - Test bug] Already-rejected `lazy()` throws synchronously, and `act` rethrows at scope exit**
- **Found during:** Task 1 (baseline test failed at the assertion instead of proving the freeze)
- **Issue:** The characterization test caught only the render-time throw; the uncaught error also escapes when the `act` scope exits, failing the test for the wrong reason.
- **Fix:** try/catch around the whole `await act(...)` — the test now asserts the meaningful property (no retry UI appears, error escapes to the root).
- **Files modified:** app/src/app/route-preload.test.tsx
- **Commit:** dfb8e07 (part of task commit)

---

**Planned-file variances (not deviations — plan-authorized):**
- `scripts/check-precache-coverage.sh` is a new file beyond the task's `files` list, but the task explicitly says "script, test, or documented manual check — executor picks"; the script is the deterministic pick, recorded here.
- `vite.config.ts` / `nginx.conf` list as task files but needed zero edits (alignment held — confirmed, not assumed).
- `app/e2e/cadeaux-contacts.spec.ts` listed for Task 3 but unchanged (gate only — the spec already covers the deterministic subset).

**Total deviations:** 3 auto-fixed (all pre-commit, all required for the plan's own gates). No scope creep; no new packages (T-09-SC clean).

## Issues Encountered

- **Live-backend timing flake in the full suite (proven innocent):** one intermediate full run showed 2 failures including notes `valide puis crée une note depuis le dialogue`. Exoneration, not assertion: (1) the test renders `<NotesPage/>` directly and `notes-page.tsx` imports none of the 6 files this plan touched (verified by grep — only `main.tsx` imports the router, and it is not under test), so the failing path is byte-identical to the pristine base; (2) the test performs a real unmocked `data.create` round-trip against the live `:8000` backend and fails waiting for dialog close — the known timing-sensitive family 09-05 already documented; (3) the closing full run is 88/88 files green with no code change between runs. No action taken (out of scope); flake watch stands.
- **Full `npm test` exceeds the 120 s default shell timeout** (~203 s for ~730 tests): re-ran with an extended timeout, no sharding changed. Infra note for future waves.
- **e2e preview kill:** port-based `fuser -k 4174/tcp` used (never `pkill -f`, per the 09-05 lesson); preview confirmed stopped via curl, demo `outDir` and env-staging dirs removed, `.env.*.local` restored byte-identical (md5 `36de78ab…` before and after), shared `dist/` left as the production build.

## Known Stubs

None. The retry branches are live code (fire on any chunk failure today, resolve via precache offline); no TODO/FIXME/placeholder added. The unseedable true-offline e2e is a documented limit (plan §task 3), not a stub.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. T-09-07 (preload storm) mitigated by construction: `requestIdleCallback` + online-only + sequential low-priority imports + per-chunk try/catch + mount-once guard, all pinned by tests. T-09-SC needs no action (no new package).

## User Setup Required

None - no external service configuration required. The device UAT re-test (open an unvisited page offline, with and without prior online idle) remains the human proof per D-09; M-01/M-02 stay operator-owned per CONTEXT.md.

## Next Phase Readiness

- **Adding a route:** one entry in `routeChunkLoaders` + one `<LazyRoute load={…}/>` in the route table — preload and the coverage script follow automatically. If a page ever merges into a shared chunk, the script fails loud (counts diverge) instead of silently under-covering.
- **Repeating the proof:** `cd app && npm run build && sh ../scripts/check-precache-coverage.sh` (script path is repo-root-relative: `sh scripts/check-precache-coverage.sh`).
- **For verifiers:** the 10 new tests are backend-independent (stub loaders, fake timers where needed); the only backend-touching evidence is the unchanged e2e spec (demo subset) plus this SUMMARY's build numbers (precache 88 entries, 2206.60 KiB).

## Self-Check: PASSED

- Files: `app/src/app/route-preload.ts`, `app/src/app/route-preload.test.tsx`, `app/src/components/ui/route-error.tsx`, `scripts/check-precache-coverage.sh` all FOUND; `dist/sw.js` + nginx `/sw.js` rule FOUND.
- Commits: `dfb8e07` and `993fa31` FOUND in `git log`; measured `git rev-list --count 19adb2d..HEAD` = 2, matches `actuals.commits`; no post-commit deletions.
- Gates: typecheck clean, 47/47 `src/app` tests, full suite 88/88 files green (closing run), production build green (precache 88 entries), e2e 20/20, proof script OK + proven red-capable.
- SUMMARY present on disk (`.planning` gitignored — docs commit skipped per §2.7/09-02 precedent, noted in Task Commits).

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-09*
