# Phase 15 Plan 03: Trip Sub-Tabs + Budget Wrapper Summary

---
phase: 15-voyage-espace
plan: 03
subsystem: voyages-tabs
tags: [trips, trip-tabs, courses, notes, taches, adresses, budget, ardoise, guest-expense, isolation]
status: complete
requires: [15-02-trip-shell]
provides: [trip-courses-fork, trip-notes-fork, trip-tasks-fork, trip-places-fork, trip-budget-wrapper, trip-guest-expense-path]
affects: [15-04-budget-e2e]
tech-stack:
  added: []
  patterns: [tripid-fork-tab, strict-ardoise-resolution, ticket-gated-guest-form, server-settlement-passthrough]
key-files:
  created:
    - app/src/modules/voyages/components/trip-tasks-tab.tsx
    - app/src/modules/voyages/components/trip-courses-tab.tsx
    - app/src/modules/voyages/components/trip-notes-tab.tsx
    - app/src/modules/voyages/components/trip-places-tab.tsx
    - app/src/modules/voyages/components/trip-budget-tab.tsx
    - app/src/modules/voyages/trip-tasks-tab.test.tsx
    - app/src/modules/voyages/trip-courses-tab.test.tsx
    - app/src/modules/voyages/trip-notes-tab.test.tsx
    - app/src/modules/voyages/trip-places-tab.test.tsx
    - app/src/modules/voyages/trip-budget-tab.test.tsx
    - app/src/modules/voyages/trip-budget-settlement.test.tsx
  modified:
    - app/src/modules/voyages/api.ts
    - app/src/modules/voyages/trip-detail-page.tsx
    - app/src/modules/voyages/trip-detail.test.tsx
decisions:
  - "Fork tabs are self-contained components (not drop-ins of foyer pages): trip-filtered reads, explicit trip_id creates, folder_id NULL — D-09 honored at data level while reusing foyer writers (shopping items, toPlacePayload, visited toggle) tel quel"
  - "Foyer writers reused, never forked: createShoppingItem/deleteShoppingList, toPlacePayload/toVisitedPayload, setTaskAssignees-equivalent writes — zero model drift by construction"
  - "Budget tab embeds useArdoiseDetail + MemberBalances + SettlementsPanel + ExpenseFormDialog tel quel (no settlement math of its own); guest form is ticket-gated and calls guest-expense-create Edge only"
  - "use-trip-detail.ts needed no change: participantMembers/guests/counts already exposed everything the forks consume"
metrics:
  duration: ~95min
  completed: 2026-10-12
  tasks: 3
  commits: 3
plan_head_before: a23d222ca5967afe24f20823d15d46528f2e8cbd
plan_head_after: 6f0573e4034d0f83ffeb113f02a85e1ceebc102b
actuals:
  tokens: 27000
  tasks: 3
  commits: 3
---

## One-liner

Four tripId-forked tabs (Tâches, Courses, Notes, Adresses) plus a thin linked-ardoise Budget wrapper with ticket-gated guest expenses — tab isolation proven per tab, full frontend chain green, proven components untouched.

## What was built

**Task 1 (tracer, f30332a)** — `trip-tasks-tab` fork: reads `tasks` by
`trip_id`, creates with `trip_id` set + `folder_id` NULL (folders stay
foyer-level), assignee picker offering trip participants only
(`assertTripAssignees` client guard, 15-01 range guard server backstop).
Mounted in `trip-detail-page` behind the Tâches tab (tab_state gating
unchanged); frozen/moderation renders read-only. Isolation suite (6 tests):
foyer rows absent, sibling-trip rows absent, UI-created task carries
`trip_id` with NULL folder, non-member assignee rejected, read-only hides
all writers, `fetchTripTasks` strictly scoped.

**Task 2 (auto, cd05631)** — Same fork contract for the three remaining
tabs: `trip-courses-tab` (lists by `trip_id`, items inherit via `list_id`,
foyer writers reused), `trip-notes-tab` (notes by `trip_id`, folder NULL,
categories incl. « Voyage »), `trip-places-tab` (`toPlacePayload` tel quel +
`trip_id`, `visited` born false, dedicated toggle only). API gained
`fetchTripShoppingLists`/`fetchTripListItems`/`createTripList`,
`fetchTripNotes`/`createTripNote`, `fetchTripPlaces`/`createTripPlace` plus
shared `tripRowsOf`. All three mounted behind tab_state gates. Isolation
suites per tab (5 tests each) mirroring the tracer. Pre-existing
`trip-detail.test.tsx` Budget-placeholder assertion updated to the real
content (Rule 1, plan-driven).

**Task 3 (auto, 6f0573e)** — `trip-budget-tab` thin wrapper: ardoise
resolved strictly via `ardoises.trip_id` + household guard
(`resolveTripArdoiseId`, T-15-13); missing ardoise renders an honest error,
never a silent empty tab. Detail + settlement reuse `useArdoiseDetail`,
`MemberBalances`, `SettlementsPanel`, `ExpenseFormDialog` unmodified
(`fetchArdoiseSettlement` called as-is by the untouched hook). Member
expenses follow member paths (trip participants only); guest section renders
only under `eo:trip:ticket:<tripId>` and calls `guest-expense-create` Edge
via `createTripGuestExpense` (never PostgREST, D-04) with dual
member/guest parts (D-03). Suites: linked detail render, strict resolution
(unit + null fetch + honest error), server-settlement passthrough (mocked
network edge, real mappers/panels, `fetchArdoiseSettlement` asserted on the
linked id), guest body dual shares + validation, guest-created expense
rendering with guest share (0118 row shape), ticket-gated form.

## Verification

- `cd app && npm run typecheck` → clean
- `npx vitest run src/modules/voyages` → 76/76 (13 files, incl. 31 new)
- `npx vitest run` (full) → **826/826, 102 files**
- `npm run build` → green (PWA precache 98 entries)
- Proven components untouched: `git status` shows only voyages files;
  ardoise-detail, `fetchArdoiseSettlement`, foyer pages/hooks unmodified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid EmptyState icon names in two forks**
- **Found during:** Task 2 typecheck (`"cart"` / `"note"` not in IconName)
- **Fix:** `receipt` (courses convention) / `edit` (notes convention)
- **Files:** `trip-courses-tab.tsx`, `trip-notes-tab.tsx`
- **Commit:** cd05631

**2. [Rule 1 - Bug] Courses items assertion raced the child query**
- **Found during:** Task 2 Vitest (sync `getByText` before items loaded)
- **Fix:** `findByText` for item names (lists-first, items-follow render)
- **Files:** `trip-courses-tab.test.tsx`
- **Commit:** cd05631

**3. [Rule 1 - Bug] Budget tests multi-matched rendered names**
- **Found during:** Task 3 Vitest (server caption twice, guest name in
  expense + balances)
- **Fix:** `findAllByText` count assertion; expense-line regex
  (`Mamie Budget · 2 participants`)
- **Files:** `trip-budget-settlement.test.tsx`, `trip-budget-tab.test.tsx`
- **Commit:** 6f0573e

**4. [Rule 1/2 - Plan-driven] 15-02 Budget placeholder assertion obsolete**
- **Found during:** Task 3 (old test expected « bientôt relié »)
- **Fix:** Asserts the real linked expense (`Vols aller-retour`) on tab switch
- **Files:** `trip-detail.test.tsx`
- **Commit:** 6f0573e

No auth gates. No new packages (T-15-SC clean). Rule 4 never triggered.
`use-trip-detail.ts` listed in the plan needed no change (detail already
exposes members/guests/counts) — documented, not a gap.

## Known Stubs

None — grep for TODO/FIXME/placeholder across new voyage tab files returns
zero; every list renders from a live trip-filtered query; the no-ardoise
case renders an honest error, never an empty shell. Deliberate scope notes
(not stubs): trip notes carry no attachments UI, trip places carry no photo
upload (read-only render), trip tasks carry no reminders/reorder — the plan's
done criteria (list/create/isolate) are fully met; enrichments belong to a
future plan if UAT asks.

## Threat Flags

None beyond the plan register: T-15-10 (trip_id filter per fork +
isolation suites), T-15-11 (explicit trip_id setter, triggers as backstop),
T-15-12 (member-only pickers + `assertTripAssignees` + server range guard),
T-15-13 (`resolveTripArdoiseId` strict trip+household, inter-trip never
resolves, suite-proven). Guest path is Edge-under-ticket only; no PostgREST
from guests anywhere in the new code.

## Follow-ups for 15-04 (not blockers)

- Playwright voyage-workspace spec (creation → tabs → budget → code → guest
  expense under real ticket → close/reopen) against the local stack —
  covers the authenticated Edge paths unit suites can't reach.
- Guest-page (`guest-trip-page`) expense creation UI for ticket-only guests
  (the Edge action + wrapper form exist; the guest page still defers budget
  to the member fiche per 15-02).
- `check-sql-statique.py` + `test-db.sh` unaffected (no migration in this plan).

## Self-Check: PASSED

- New files present on disk (5 tab components, 6 test files); branch `main`
  holds 3 task commits (f30332a, cd05631, 6f0573e),
  `git rev-list --count a23d222..HEAD` = 3, no deletions in any commit.
- `.planning` is gitignored → SUMMARY on disk only (skip noted, per instructions).
