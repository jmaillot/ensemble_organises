---
phase: 09-pwa-offline
plan: 05
subsystem: offline-honesty
tags: [offline, empty-cache, sync-queue, all-modules, react-query, toasts]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: [OfflineEmptyState, isEmptyCacheOffline seam, pendingRows retention, queuedForSync signal (09-03)]
  - phase: 09-pwa-offline
    provides: [failure-based mutation queue with queuedForSync signal, stale-flag seam (09-01)]
provides:
  - Explicit empty-cache state on every household list (D-07, all-modules)
  - Queued-create confirmation on every page-owned create path (D-07, per-module proofs)
  - Documented seam gaps for Edge/RPC/direct and hook-owned create paths (follow-ups)
affects: [09-04 (shared seam owner — follow-ups listed), future module work (copy-paste proof idiom)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 36000
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [page-level adoption of the 09-03 predicate (useOnline + empty rows + loading-or-error), DataError.queuedForSync catch branch per create path, offline-queue mock idiom (enqueueMutation + queued throw)]

# Commits (#3968, measured from ledger)
plan_head_before: 178fd278f9381636e5366feb64eb96eed5267646
plan_head_after: 19adb2d35963dd6670013785593104cd1a4a13d3
commits: 2

key-files:
  created: []
  modified: [app/src/modules/notes/notes-page.tsx, app/src/modules/notes/notes-page.test.tsx, app/src/modules/courses/courses-page.tsx, app/src/modules/courses/courses-page.test.tsx, app/src/modules/calendrier/calendrier-page.tsx, app/src/modules/calendrier/calendrier-page.test.tsx, app/src/modules/routines/routines-page.tsx, app/src/modules/routines/routines-page.test.tsx, app/src/modules/anniversaires/anniversaires-page.tsx, app/src/modules/anniversaires/anniversaires-page.test.tsx, app/src/modules/contacts/contacts-page.tsx, app/src/modules/contacts/contacts-page.test.tsx, app/src/modules/fidelite/fidelite-page.tsx, app/src/modules/fidelite/fidelite-page.test.tsx, app/src/modules/adresses/adresses-page.tsx, app/src/modules/adresses/adresses-page.test.tsx, app/src/modules/prestataires/prestataires-page.tsx, app/src/modules/prestataires/prestataires-page.test.tsx, app/src/modules/animaux/animaux-page.tsx, app/src/modules/animaux/animaux-page.test.tsx, app/src/modules/cadeaux/cadeaux-page.tsx, app/src/modules/cadeaux/cadeaux-page.test.tsx, app/src/modules/cercle/cercle-page.tsx, app/src/modules/cercle/cercle-page.test.tsx, app/src/modules/messages/messages-page.tsx, app/src/modules/messages/messages-page.test.tsx, app/src/modules/voyages/voyages-page.tsx, app/src/modules/voyages/voyages-page.test.tsx, app/src/modules/ardoise/ardoise-page.tsx, app/src/modules/ardoise/ardoise-page.test.tsx, app/src/modules/ardoise/ardoise-detail-page.tsx, app/src/modules/ardoise/ardoise-detail-page.test.tsx, app/src/modules/recettes/recettes-page.tsx, app/src/modules/recettes/recettes-page.test.tsx]

key-decisions:
  - "Page-level adoption, not hook edits: the 09-05 file boundary (pages + tests only, 09-04 owns lib/data) forced the 09-03 predicate to be recomputed per page from useOnline + row count + loading-or-error — same predicate shape, shared component, shared copy, shared retry path, no per-module variant"
  - "resource.create swallows queued errors (09-03 retention) while resource.update and direct data.* writes rethrow: page catch branches are live for api-direct saves and all edits, dead-but-harmless for resource.create saves (success toast + retained row, proven instead)"
  - "Edge/RPC/direct-supabase create paths (ardoise, cadeaux ideas/lists, messages conversations) cannot queue client-side: page branches added for demo-mode correctness, supabase-mode gap reported as seam-owner follow-up, never worked around per module"
  - "Hook-owned toasts (cercle publish/comment, voyages save) left untouched: empty-cache states wired, confirmation gap reported, boundary respected"

requirements-completed: [D-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Every offline-meaningful household list renders the explicit empty-cache state with reconnect retry when offline with nothing cached — no mute empty list, no raw error"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "16 page suites, one empty-cache test each (offline + rejected list → OfflineEmptyState + retry, raw error copy absent, genuine-empty copy absent)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every page-owned create path confirms queued work instead of erroring"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "queued-confirmation or retention-without-error tests in 12 suites (courses, calendrier, anniversaires, contacts, prestataires, animaux, cadeaux-item, messages-send, notes, adresses, fidelite, routines); hook-owned and Edge/RPC paths documented as follow-ups"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tasks behavior from 09-03 byte-identical; online behavior unchanged everywhere"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "taches files untouched; full suite 718-719/720 (only the two pre-existing timing-sensitive backend tests flap, both proven innocent)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts 20/20 (Supabase-less demo build, isolated outDir/port, env restored byte-identical)"
        status: pass
    human_judgment: false

# Metrics
duration: ~150min
completed: 2026-10-09
status: complete
---

# Phase 09 Plan 05: All-modules honest-offline rollout Summary

**09-03 states on all 15 household lists with per-module proofs: empty-cache honesty everywhere, queued confirmations on every page-owned create path, seam gaps reported not crossed**

## Performance

- **Duration:** ~150 min (audit-heavy: 30-file seam survey + mock-layer analysis + contention triage)
- **Started:** 2026-10-09T12:10Z (approx — start timestamp not recorded, see deviation 5)
- **Completed:** 2026-10-09T14:05Z
- **Tasks:** 2
- **Files modified:** 34 (17 pages + 17 test files; taches untouched as 09-03 reference)

## Accomplishments

- **Audit-first rollout:** surveyed every `*-page.tsx` rendering a household list. 16 pages wired (15 modules; ardoise has list + detail), 6 views excluded with documented reasons (see Decisions). The plan's `files_modified` hypothesis needed no additions and no drops among list pages — every hypothesised page owned a mute list or raw error branch.
- **Empty-cache state everywhere:** each wired page computes the 09-03 predicate at page level (`!online && primaryRows.length === 0 && (isLoading || isError)`) via shared `useOnline`, renders shared `OfflineEmptyState` with `refetch` retry first — before any `ErrorState`. Recettes (direct `useResource` reader) uses the seam's own `isEmptyCacheOffline` flag.
- **Queued confirmations on page-owned creates:** `DataError.queuedForSync` catch branches added to every page-level create catch (notes, courses list/item/edit, calendrier event/calendar/category, routines, anniversaires, contacts, fidelite, adresses, prestataires, animaux pet/record, cadeaux item/idea/list/promote, messages conversation×2/send/media, ardoise create/expense×2). Courses item/edit submits additionally gained their first error toasts (previously unhandled rejections — mute failures, strictly worse).
- **Per-module proofs:** 30 new tests (`hors ligne (09-05)` blocks) — 16 empty-cache proofs + 14 create-path proofs. Full gate: typecheck green, production build green (precache 2206 KiB), e2e 20/20 green.
- **Boundary respected under concurrency:** 09-04 ran concurrently on the same tree (same live backend). No file outside pages/tests touched; three seam-level gaps reported as follow-ups instead of fixed.

## Task Commits

Each task committed atomically on `main` (repo precedent: 09-01 through 09-04 all landed on `main`):

1. **Task 1: Audit every list, then roll out the shared states** - `24fbb80` (feat, 17 pages, typecheck green)
2. **Task 2: Per-module proofs and full-chain gate** - `19adb2d` (test, 17 suites, suite + build + e2e green)

**Note:** `.planning/` is gitignored in this repo, so `09-05-SUMMARY.md` lives on disk only (verified present); per dispatch instructions STATE.md/ROADMAP.md were NOT updated.

## Files Created/Modified

Pages (empty-cache branch + queued branches; taches untouched):
- `app/src/modules/{notes,courses,calendrier,routines,anniversaires,contacts,fidelite,adresses,prestataires,animaux,cadeaux,cercle,messages,voyages,ardoise,recettes}/*-page.tsx` (+ `ardoise-detail-page.tsx`)
- Tests: the 17 matching `*.test.tsx` files with `hors ligne (09-05)` blocks.

## Decisions Made

- **Audit outcome — wired (16 pages):** notes, courses, calendrier, routines, anniversaires, contacts, fidelite, adresses, prestataires, animaux, cadeaux (list + ideas sections), cercle, messages, voyages, ardoise list, ardoise detail, recettes. All showed mute empty lists or raw `ErrorState` on empty cache before this plan.
- **Audit outcome — excluded with reason (6):** `landing/*` (onboarding flow, no household list); `dashboard` (aggregated read-only digest, no list/error branch — data freshness is 09-04's full-sync scope); `parametres` (settings/members admin, no list states); `guest-ardoise` + `guest-cadeau` (token-scoped share views outside household sync scope); `product-catalog-page` (sub-view without own fetch/error branch — inherits the courses list state it is navigated from).
- **Page-level predicate, not hook pass-through:** the 09-05 file boundary (pages + tests only) rules out hook edits, so each page recomputes the exact 09-03 predicate from hook-exposed `isLoading`/`isError`/rows + `useOnline`. Same shape, shared component/copy/retry — adoption, not a variant.
- **Seam asymmetry documented, not fought:** `resource.create` retains-and-resolves on queued errors (success toast, row kept — proven by retention tests on notes/adresses/fidelite), while `resource.update`, direct `data.*` writes and secondary writes rethrow (queued-confirmation branch fires — proven on 8 modules). Routines needed a partial-failure mock (primary succeeds, secondary queues) because retaining a `created_at`-less optimistic row crashes its streak reader (seam-owner follow-up #3).
- **Unqueueable paths reported (09-04/seam-owner follow-ups):** ardoise creates/expenses (Edge/RPC), cadeaux ideas/lists (direct insert in Supabase mode), messages conversation creation (RPC) — page branches added (fire in demo mode), Supabase-mode gap open. Cercle publish/comment and voyages save toast inside their hooks (out of bounds) — empty-cache wired, confirmation gap open.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Courses item/edit submits had no catch at all (unhandled rejections)**
- **Found during:** Task 1 (courses rollout)
- **Issue:** `submitItem`/`submitItemEdit` awaited throwing api calls with no try/catch — offline creates were mute failures (dialog stuck open, console rejection), worse than an error toast.
- **Fix:** Wrapped both in try/catch with the queued branch + genuine-error toast (dialog stays open on genuine errors, as before for validation).
- **Files modified:** app/src/modules/courses/courses-page.tsx
- **Commit:** 24fbb80 (part of task commit)

**2. [Rule 1 - Test bug] Notes/adresses/fidelite queued tests asserted a toast that cannot fire**
- **Found during:** Task 2 (first notes run red)
- **Issue:** `resource.create` swallows queued errors by 09-03 design, so the page queued branch is unreachable for these creates — the tests asserted the queued copy against actual success-toast behavior.
- **Fix:** Rewrote as retention-without-error proofs (success toast + row visible + queue non-empty + raw queued message absent).
- **Files modified:** notes/adresses/fidelite page tests
- **Commit:** 19adb2d (part of task commit, never committed wrong)

**3. [Rule 2 - Missing critical] Routines retention crashes the streak reader**
- **Found during:** Task 2 (unhandled `toLocalDate(undefined)` in `buildRoutines`)
- **Issue:** A retained optimistic routine row lacks server-defaulted `created_at`; `toIsoDate(toLocalDate(row.created_at))` throws during render. Full-failure simulation poisons the suite.
- **Fix:** Test simulates partial failure (primary succeeds server-dated, secondary queues) — proves the queued confirmation without triggering the seam bug; bug reported as follow-up #3 (seam owner: default `created_at` on retained rows or harden the reader).
- **Files modified:** app/src/modules/routines/routines-page.test.tsx
- **Commit:** 19adb2d (part of task commit)

**4. [Rule 3 - Blocking] `mockOfflineQueue` helper left unused after routines rewrite (TS6133 broke build)**
- **Found during:** Task 2 (production build gate)
- **Issue:** The routines rewrite inlined a table-aware mock; the shared helper became dead code and `tsc --noEmit` (build gate) failed.
- **Fix:** Deleted the unused helper.
- **Files modified:** app/src/modules/routines/routines-page.test.tsx
- **Commit:** 19adb2d (part of task commit)

**5. [Process miss] Plan start timestamp not recorded**
- **Found during:** SUMMARY writing
- **Issue:** The `<step name="record_start_time">` was skipped — duration is reconstructed (~150 min), not measured.
- **Fix:** None possible retroactively; noted so future waves keep the step.
- **Impact:** `actuals` calibration slightly less precise; no code impact.

---

**Total deviations:** 4 auto-fixed (1 blocking, 1 test bug, 1 missing critical caught pre-commit, 1 build-breaker) + 1 process note
**Impact on plan:** All required for the plan's own must-haves (honest per-module proofs, green build). No scope creep; no new packages.

## Issues Encountered

- **Concurrent-wave backend contention (09-04):** 09-04 ran e2e/builds against the same live backend (`localhost:8000`) throughout this wave. Two timing-sensitive backend tests flapped across full-suite runs (718–719/720): calendrier `ajoute un événement via le dialogue` and notes `valide puis crée une note… (PDF)`. Both proven innocent — calendrier passes isolated on this wave's commit and fails paired on the pristine page too (pre-existing order-dependence + contention); notes-attachment fails on pristine 09-03 head `a77c06b`. All 30 new tests are backend-independent (mocked `data.list`/`data.create`) and pass consistently. No action taken (out of scope + out of bounds); recomm disperser les suites lourdes entre vagues concurrentes.
- **Belgian-time debugging detour:** ~40 min spent triaging the calendrier flake (5 worktrees, pair bisection) before the pristine-page pair-failure exonerated this wave. Lesson recorded: on a shared live backend with a concurrent wave, run the pristine-pair control BEFORE deep-diving a suspect diff.
- **e2e preview kill:** `pkill -f` matched the invoking shell and SIGTERM-killed the cleanup command mid-run (preview was already stopped). Recovery: verified stopped, removed `dist-e2e-0905`, restored `.env.production.local` byte-identical (md5 `36de78ab…` before and after). Prefer port-based kill (`fuser -k 4180/tcp`) or `pkill` with narrower match in future waves.

## Known Stubs

None. Queued branches on Edge/RPC/direct paths are live code (fire in demo mode today, in Supabase mode once the seam routes those writes through the queue) — not stubs. No TODO/FIXME/placeholder added.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes. The plan's T-09-06 (un-audited module left mute) is mitigated by the audit table above (every list wired or excluded-with-reason) + the full-suite gate; T-09-SC needs no action (no new package).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **For 09-04 / seam owner (follow-ups, all reported not fixed):**
  1. Route Edge/RPC/direct-supabase creates (ardoise, cadeaux ideas/lists, messages conversations) through the queue or surface an equivalent queued signal so the page branches fire in Supabase mode too.
  2. Consider surfacing `queuedForSync` from `resource.create` to callers (currently silent-retain) so notes/adresses/fidelite-style creates can confirm explicitly instead of success-copying.
  3. Default `created_at` (etc.) on retained optimistic rows, or harden `buildRoutines`' streak reader — retained rows without server defaults crash rendering.
  4. Cercle publish/comment + voyages save toast inside hooks: add queued branches when those hooks are next touched.
- **For verifiers:** the 30 new tests are self-contained (mocked adapter + `setOnlineStatus` idiom copied per file — intentional duplication per the plan's "shared helper where idioms allow", kept file-local to avoid cross-module test coupling). The e2e spec is untouched (gate only).
- **Flake watch:** calendrier-dialog + notes-attachment tests are timing-sensitive against the live backend; green in isolation, flappy under concurrent load. If they gate a future wave, run them single-file before triaging.

## Self-Check: PASSED

- All 34 files verified present on disk (`git diff --stat` shows 34 files, 1321+/86-).
- Both commits verified in `git log`: `24fbb80` (feat), `19adb2d` (test).
- No post-commit deletions (`git diff --diff-filter=D --name-only` empty for both commits).
- SUMMARY present on disk (`.planning` gitignored — docs commit skipped per §2.7/09-03 precedent, noted in Task Commits).

---
*Phase: 09-pwa-offline*
*Completed: 2026-10-09*
