# Phase 15 Plan 02: Trip Workspace Shell Summary

---
phase: 15-voyage-espace
plan: 02
subsystem: voyages-shell
tags: [trips, trip-detail, tab-bar, trip-invite-edge, guest-tickets, demo-seeds, soft-close]
status: complete
requires: [15-01-trip-server]
provides: [trip-create-flow, trip-detail-route, infos-parametres-tabs, trip-share-guest, trip-demo-workspace, close-reopen-edge]
affects: [15-03-trip-tabs, 15-04-budget-e2e]
tech-stack:
  added: []
  patterns: [edge-atomic-create-client-flow, rls-read-detail-hook, code-share-dialog-mirror, ticket-namespaced-storage, foyer-null-scope-filter]
key-files:
  created:
    - app/src/modules/voyages/components/trip-create-dialog.tsx
    - app/src/modules/voyages/components/trip-share-dialog.tsx
    - app/src/modules/voyages/trip-detail-page.tsx
    - app/src/modules/voyages/guest-trip-page.tsx
    - app/src/modules/voyages/hooks/use-trip-detail.ts
    - app/src/modules/voyages/trip-tabs.test.ts
    - app/src/modules/voyages/trip-create-dialog.test.tsx
    - app/src/modules/voyages/trip-detail.test.tsx
    - app/src/modules/voyages/trip-parametres.test.tsx
    - app/src/modules/voyages/trip-share-dialog.test.tsx
    - app/src/modules/voyages/guest-trip-page.test.tsx
  modified:
    - app/src/modules/voyages/api.ts
    - app/src/modules/voyages/types.ts
    - app/src/modules/voyages/voyages-page.tsx
    - app/src/modules/voyages/hooks/use-voyages.ts
    - app/src/types/database.ts
    - app/src/lib/data/keys.ts
    - app/src/lib/data/seed.ts
    - app/src/app/router.tsx
    - app/src/app/route-preload.ts
    - app/src/app/route-preload.test.tsx
    - app/src/modules/dashboard/hooks/today-items.test.ts
    - app/src/modules/taches/hooks/use-taches.ts
    - app/src/modules/notes/hooks/use-notes.ts
    - app/src/modules/adresses/hooks/use-adresses.ts
    - app/src/modules/courses/hooks/use-courses.ts
    - app/src/modules/ardoise/hooks/use-ardoise.ts
    - supabase/functions/trip-invite/index.ts
decisions:
  - "Close/reopen had no client path (RPCs are service_role-only, Edge lacked the actions): added close/reopen Edge actions mirroring member-leave instead of inventing a direct path"
  - "Guest page renders the identity-only server view (counts/budget deferred to 15-03): no new guest endpoint invented for this plan"
  - "Demo seeds forced foyer-list scoping (trip_id NULL) in taches/notes/adresses/courses/ardoises hooks: the locked 15-01 model applied to readers, not just writers"
  - "Cascade-delete controls removed from the voyages list page: D-08 soft-close only, no destructive path anywhere"
  - "Demo create flow replays server rows locally (trip + members + linked ardoise + enrollments) so the tracer path is provable without a backend"
metrics:
  duration: ~100min
  completed: 2026-10-12
  tasks: 3
  commits: 3
plan_head_before: 51069e4c4a823ba9921684735a223e3696fd33d1
plan_head_after: a23d222ca5967afe24f20823d15d46528f2e8cbd
actuals:
  tokens: 42000
  tasks: 3
  commits: 3
---

## One-liner

Trip creation flow, detail route with seven-tab bar, real Infos/Paramètres tabs, code sharing + guest page, and a complete demo trip workspace — on the 15-01 server, with foyer lists rescoped to `trip_id NULL`.

## What was built

**Task 1 (tracer, 2112fde)** — One path end-to-end: `trip-create-dialog`
(infos fields + toggles bound to tab keys + participants multi-select offering
admin/membre only, enfants never listed — D-01) calls the `trip-invite`
`create-trip` Edge action (never direct PostgREST insert); on success the app
navigates to `/voyages/:tripId` (new `voyageDetail` chunk + route).
`trip-detail-page` renders hero + seven-tab bar; `use-trip-detail` loads
trip + membership + tab_state via RLS reads (non-member gets the honest
not-authorized state, admin non-participant gets a read-only moderation view —
D-07). `TripInput` gained `participantIds`/`enabledTabs`, `toTrip` gains
`createdBy`/`tabState`/`closed`. Demo fallback in `createTripFlow` replays the
server rows locally so the path is provable without a backend.

**Task 2 (auto, e1df68c)** — Infos tab with live counts (members + guests,
per-table trip-scoped counts, linked ardoise expense count + total — every
number from a live query, `null` rendered as honest "—"). Paramètres tab:
meta edit (reused `TripFormDialog` + `saveTripMeta`), tab toggles (hidden, never
deleted — D-05), soft-close + reopen with `ConfirmDialog` confirmations (T-15-09),
leave with redirect. Frozen trips render read-only with a banner; reopen is
admin-only and hidden otherwise; no cascade-delete control anywhere (D-08 —
list-page delete buttons removed). Required a server gap fix (see deviations).

**Task 3 (auto, a23d222)** — `trip-share-dialog` (gift code-panel mirror:
Copier/Partager, regenerate invalidating immediately, revoke, expiry + max-uses
summary) wired into Paramètres (participants + moderating admins; hidden when
frozen). `guest-trip-page` at public `/invitation/voyage`: code form →
join-with-account (lands on the fiche) vs continue-as-guest (link-view, then
pseudonyme → ticket persisted under `eo:trip:ticket:<tripId>` → ticket view,
never member controls). Demo seeds: trip-1 keeps its id with two members, one
named guest (ticketless — tickets are born from redeem, never seeded),
trip-scoped list + items / notes / tasks + assignees / places, and a linked
ardoise with 2 expenses (120 + 200). Full frontend chain green including build.

## Verification

- `cd app && npm run typecheck` → clean
- `npx vitest run src/modules/voyages` → 45/45 (13 pre-existing + 32 new:
  tab model, create dialog incl. enfant exclusion, detail incl. hidden tabs +
  not-authorized + moderation, Infos counts, Paramètres lifecycle incl. fake-Edge
  close/reopen/leave, share dialog, guest page both paths)
- `npx vitest run` (full) → **795/795, 96 files** (after rescoping fallout, below)
- `npm run build` → green (PWA precache 90 entries)
- Live Edge smoke (local stack, redeployed): `close`/`reopen` without session →
  401 (same as `member-leave` witness), malformed body → 400 (new Zod entries
  parse). Authenticated close/reopen mirrors `member-leave` byte-for-byte
  against SQL-proven RPCs; full user proof deferred to 15-04 Playwright.
- Manual spot-check (create → detail → toggle → close → reopen → leave → guest
  join) covered at unit level; full Playwright proof deferred to 15-04 per plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2/3 - Missing/Blocking] No client path existed for soft-close/reopen**
- **Found during:** Task 2 (`trip_close`/`trip_reopen` are `service_role`-only
  per 0118 grants; the `trip-invite` Edge exposed no `close`/`reopen` action —
  the plan's "trip_close action" named an endpoint that did not exist).
- **Fix:** Added `close` + `reopen` actions to `supabase/functions/trip-invite`
  mirroring `member-leave` exactly (Zod `tripId`, rate-limit 10, `refuseEnfant`
  `manage`, RPC call, existing `translateRpcError` already covers both RPC
  error strings). No child-guard change (same refusal family). Deployed
  (`deploy-functions.sh` + `recreate functions` → Healthy) and smoked (401/400
  paths). No new table/service — not Rule 4.
- **Files:** `supabase/functions/trip-invite/index.ts` (+ local-only runtime copy)
- **Commit:** e1df68c

**2. [Rule 1 - Bug] Demo seeds polluted foyer lists (2 suites red, 3 latent)**
- **Found during:** Task 3 full-suite run (`taches-page` count 5→7,
  `adresses` "À visiter" filter no longer empty).
- **Issue:** Trip-scoped rows leaked into foyer views, contradicting the locked
  15-01 model (foyer regime = `trip_id NULL`).
- **Fix:** One-line scope filters at each foyer reader: `trip_id == null` in
  `use-taches`, `use-notes`, `use-adresses`, `use-courses` (lists + items via
  list + history/counts), `useArdoises` list (detail-by-id untouched so 15-03
  reuses it). Foyer prep counter in `use-voyages` scoped the same way.
  Shrinking the seeds was rejected — the plan mandates a complete demo trip.
- **Files:** 6 hooks + voyages api/hook
- **Commit:** fc46553

**3. [Rule 1 - Bug] Dialog error copy diverged from the established flow**
- **Found during:** Task 1 (`voyages-page` failure-path tests expect
  "Le voyage n'a pas pu être enregistré.").
- **Fix:** New create dialog uses the same message as `TripFormDialog`.
- **Files:** `trip-create-dialog.tsx`

**4. [Rule 2 - Missing] Guest view serves identity only (no counts/budget)**
- **Found during:** Task 3 (Edge `guest-view`/`link-view` return trip identity
  + guest — the plan's "counts + budget summary" parenthetical exceeds the
  locked 15-01 contract).
- **Fix:** Guest page renders what the server serves (hero, dates, notes,
  closed state, guest name) and says rubriques/budget open from the member
  fiche. No new endpoint invented — 15-03 owns tab content and can extend the
  view if UAT demands it. Plan DONE criteria (both join paths + persisted
  ticket) fully met.
- **Files:** `guest-trip-page.tsx` (documented in code + here)

**5. [Rule 3 - Blocking] Shared `TripRow`/row types lacked the 15-01 columns**
- **Found during:** Tasks 1/3 (no `created_by`/`tab_state`/`is_closed`,
  no `trip_id` on the 4 fork tables + ardoises, no member/guest row types).
- **Fix:** Extended `TripRow` (+ `TripMemberRow`/`TripGuestRow`) and added
  required `trip_id: Uuid | null` to the 5 interfaces; fixed the 12 seed
  literals + 1 test fixture (typecheck as safety net). `trip_members` added
  to `KEYLESS_TABLES` (composite PK, no id injection).
- **Files:** `types/database.ts`, `lib/data/keys.ts`, `lib/data/seed.ts`

No auth gates. No new packages (T-15-SC clean). Rule 4 never triggered.

## Known Stubs

None — grep for TODO/FIXME/placeholder across new voyage shell files returns
zero; every count renders from a live query (`null` shown as "—", never a
decorative number); no component renders mock data.

## Threat Flags

None beyond the plan register: T-15-06 (enfant exclusion wired + tested, server
re-validates), T-15-07 (RLS reads + honest not-authorized + no prefetch before
membership — counts query enabled only after authorization), T-15-08 (ticket in
`eo:trip:ticket:<tripId>`, body-only to the Edge), T-15-09 (ConfirmDialogs on
close + leave, reopen admin-only and hidden otherwise). New `close`/`reopen`
Edge actions reuse the proven `member-leave` guard regime (child-guard
`manage`, uniform oracle via `translateRpcError`).

## Follow-ups for 15-03 / 15-04 (not blockers)

- Five tab contents (Courses, Notes, Tâches, Adresses, Budget) + guest expense
  UI on `guest-expense-create`; frozen-read-only enforcement per tab.
- Authenticated close/reopen full-path proof (15-04 Playwright against the
  local stack covers it; unit proof via fake Edge here).
- `trip_invites` stays server-only (zero-policy) — unchanged.
- `useVoyages.remove` / `api.deleteTrip` left in place (generic adapter
  passthroughs, no UI path — D-08 satisfied by removal of all controls).

## Self-Check: PASSED

- New files present on disk (dialogs, pages, hook, 6 test files); branch
  `feat/15-02-voyage-shell` holds 3 task commits (2112fde, e1df68c, a23d222),
  `git rev-list --count 51069e4..HEAD` = 3, no deletions in any commit.
- Repair note: the first `fc46553` cut of the task-3 commit staged a stale copy
  of `trip-parametres.test.tsx` (verified-green worktree content missed the
  staging); amended in place to `a23d222` (branch unpushed, no other consumer
  of the hash) and re-verified (typecheck + 315 tests across the 7 affected
  modules green, worktree clean).
- `.planning` is gitignored → SUMMARY on disk only (skip noted, per instructions).
