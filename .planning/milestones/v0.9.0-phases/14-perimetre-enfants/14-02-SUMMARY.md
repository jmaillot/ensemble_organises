---
phase: 14-perimetre-enfants
plan: "02"
subsystem: ui
tags: [enfant, navigation, route-guard, rbac-presentation, playwright, vitest]
requires:
  - phase: 14-01
    provides: [child-closed-5-modules]
provides:
  - child-gated navigation catalogue, drawer, dashboard and route guard
affects: [14-perimetre-enfants-verification, future-module-additions]
tech-stack:
  added: []
  patterns: [child-presentation-gating, sober-forbidden-guard, persisted-store-role-fixture-e2e]
key-files:
  created:
    - app/src/components/ui/forbidden.tsx
  modified:
    - app/src/lib/modules.ts
    - app/src/components/shared/module-catalogue.tsx
    - app/src/components/shared/mobile-drawer.tsx
    - app/src/app/app-shell.tsx
    - app/src/app/router.tsx
    - app/src/modules/dashboard/dashboard-page.tsx
    - app/src/app/router.test.tsx
    - app/src/app/app-shell.test.tsx
    - app/src/modules/dashboard/dashboard-page.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts
    - app/src/app/route-preload.test.tsx
decisions:
  - "Guard is presentation-only: RequireGrownUp renders Forbidden, server RLS/Edge from 14-01 stay the real gates"
  - "Anonymous invite routes (/invitation/*) intentionally unguarded: open-to-all by construction per 14-01"
  - "Whole-card hiding (BoardSummaryCard/ActivityCard) for children, never row filtering: no client-side masking of server rows"
  - "Fixed stale 13-02 test regex (Rule 1) to unblock the mandatory FULL-suite gate"
metrics:
  duration: "45m"
  completed: "2026-10-12"
  tasks: 3
  commits: 3
  plan_head_before: 1c343baefeb0634a91297bc4bacf01f097f252dd
  plan_head_after: bce12fb0631ba5f0ad8de9bd3cf4e6bcc41b251b
status: complete
actuals:
  tokens: 7900
  tasks: 3
  commits: 3
requirements-completed: [D-05, D-06, D-07]
coverage:
  - id: D1
    description: "Child role sees no tile, drawer entry, catalogue link, or dashboard widget for the 5 modules"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "app/src/app/app-shell.test.tsx#AppShell — périmètre enfant"
        status: pass
      - kind: unit
        ref: "app/src/modules/dashboard/dashboard-page.test.tsx#masque à un enfant les tuiles et la colonne Ardoise/activité"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#enfant : aucune tuile ni carte Ardoise/activité sur l’accueil + tiroir mobile sans les 5 espaces (chromium+mobile)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Direct URL access as a child renders a sober not-allowed page, never a 404 nor a silent redirect"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/app/router.test.tsx#Garde enfant — 5 modules hors périmètre"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#enfant : URL directe rend non-autorisé, jamais 404 ni redirection (chromium+mobile)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No widget, aggregation, or notification renders the 5 modules' data to a child"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/dashboard/dashboard-page.test.tsx#masque à un enfant les tuiles et la colonne Ardoise/activité"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#admin : tuiles et cartes Ardoise/activité inchangées (chromium+mobile)"
        status: pass
    human_judgment: false
---

# Phase 14 Plan 02: Masquage client périmètre enfants — Summary

Child role sees none of ardoise/cadeaux/fidélité/prestataires/animaux anywhere in navigation (tiles, catalogue, drawer, dashboard cards), meets a sober "reserved for grown-ups" page on direct URL, and no aggregation leaks module data — presentation only on the proven 14-01 server gates.

## Performance

- **Duration:** 45m
- **Tasks:** 3
- **Files modified:** 11 (1 created, 10 modified)
- **Commits:** 3 (measured `git rev-list --count 1c343ba..HEAD`)

## Accomplishments

- `CHILD_HIDDEN_MODULES` + `isChildHiddenModule` in `lib/modules`: single source gating all surfaces on the existing `role === 'enfant'` signal (same store/hook as the D-06 calendrier precedent, no new identity source).
- Catalogue sidebar, sidebar quick links, mobile drawer (group-level filter, flat render unchanged), and dashboard tiles all hide the 5 modules for children; admin/member views byte-identical.
- Dashboard `BoardSummaryCard` + `ActivityCard` hidden for children (14-01 handoff: the activity widget reads expenses).
- `Forbidden` sober page + `RequireGrownUp` guard on `/ardoise`, `/ardoise/:id`, `/cadeaux`, `/animaux`, `/prestataires`, `/fidelite` — never a 404, never a silent redirect, link back home.
- Aggregation audit: notifications carry only message/cercle/tâche/événement/routine kinds, `gift_ideas` is consumed only inside the guarded cadeaux module, anniversaire mirrors are contacts+birthdays (out of perimeter), widgets/today-items/calendar read only tasks/events/birthdays/routines — no 5-module data reaches a child; whole cards hidden, zero client-side row filtering.

## Task Commits

1. **Task 1: Hide the 5 modules from child navigation** - `cfd9ee1` (feat)
2. **Task 2: Not-allowed guard plus aggregation audit** - `1fe2eb2` (feat)
3. **Task 3: Proofs and full-chain gate** - `bce12fb` (feat)

## Files Created/Modified

- `app/src/components/ui/forbidden.tsx` - Sober "Un espace réservé aux grands" page (created; reuses Button-as-Link idiom from the 404 page, no suitable primitive existed)
- `app/src/lib/modules.ts` - `CHILD_HIDDEN_MODULES` + `isChildHiddenModule`
- `app/src/components/shared/module-catalogue.tsx` - Catalogue filtered for child (count badge follows)
- `app/src/components/shared/mobile-drawer.tsx` - Group-level filter via `useVisibleDrawerEntries` (render stays flat, search filters the visible set)
- `app/src/app/app-shell.tsx` - Quick links filtered (no-op today, future-proof)
- `app/src/app/router.tsx` - `RequireGrownUp` on the 5 module routes
- `app/src/modules/dashboard/dashboard-page.tsx` - 12 tiles + Ardoise/activity cards hidden for child
- `app/src/app/router.test.tsx` - 6-path guard proofs + home-link + sibling-route intact
- `app/src/app/app-shell.test.tsx` - Catalogue-12 + drawer-13 child proofs
- `app/src/modules/dashboard/dashboard-page.test.tsx` - Tiles-12 + cards-gone child proof
- `app/e2e/cadeaux-contacts.spec.ts` - 4 child tests (persisted-store role fixture + reload) × chromium+mobile
- `app/src/app/route-preload.test.tsx` - Stale-apostrophe fix (see deviations)

## Decisions Made

- Guard is presentation-only: bypass yields nothing since 14-01 RLS/Edge deny regardless (threat T-14-02 mitigated server-side, proven in 14-01).
- Anonymous invite routes (`/invitation/ardoise`, `/invitation/cadeau`) intentionally unguarded: open-to-all by construction; the guest-cadeau "Ouvrir les cadeaux" link lands on the guard for a child, which is the correct D-06 behavior.
- Whole-card hiding rather than row filtering: hiding `ActivityCard` entirely (not stripping expense rows) keeps the "assert emptiness, don't filter client-side" invariant — a 14-01 escape would surface as a visible card, never be masked.
- E2E child fixture via persisted zustand store (`ensemble-organises-household` → `member-noe` + reload): demo bootstrap preserves the persisted member, so no production test-hook was added.
- Commits landed on `main` directly, per this repo's established convention (every prior `feat(XX-YY)` plan commit, incl. 14-01, is on `main`; single-developer workflow, no PR flow).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale assertion] route-preload test regex vs 13-02 honest-labels copy**
- **Found during:** Task 3 (FULL-suite gate: 1 failed / 748)
- **Issue:** `route-preload.test.tsx:90` asserted `/n'a pas pu se charger/` (straight apostrophe) but `route-error.tsx` renders "n’a" (typographic `’`) since 13-02 commit `e82b4be` rewrote the copy without updating the test. Deterministic failure, zero overlap with this plan's diff (failing test imports only `route-error` + `route-preload`).
- **Fix:** One-character test-side alignment to the production copy (the copy is the source of truth; the app consistently uses `’`). No product code touched. Scope-boundary tension noted: strictly pre-existing, but it blocked the plan-mandated FULL-suite gate, so fixed rather than blocking the phase over a typo.
- **Files modified:** `app/src/app/route-preload.test.tsx`
- **Verification:** File suite 10/10, then FULL suite 89 files / 748 tests green.
- **Committed in:** `bce12fb` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Unblocked the mandatory full-suite gate; no scope creep, no behavior change.

## Issues Encountered

None beyond the deviation above. E2E needed no Supabase-less workaround: no `.env*.local` files exist in this checkout and no Supabase env vars are set, so the stock `test:e2e` build already shows the demo entry. Preview server started by the Playwright webServer config stopped on its own (port 4173 free afterwards; port 4179 belongs to another process and was left alone).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Client perimeter complete: any future module added to `modules.ts` is visible to children by default — a future phase adding a restricted module must append its key to `CHILD_HIDDEN_MODULES` (single point).
- Server gates (14-01) + client masking (14-02) jointly close the phase boundary; remaining phase work is verification/UAT only.

## Self-Check: PASSED

- All 11 created/modified files FOUND on disk; all 3 task commits FOUND in history (`cfd9ee1`, `1fe2eb2`, `bce12fb`).
- `.planning/` is gitignored in this repo: SUMMARY verified present on disk, commit skipped by design.
- Gates: typecheck clean, FULL unit suite 89 files / 748 tests green, production build green, e2e `cadeaux-contacts` 28/28 (chromium + mobile).
- STATE.md / ROADMAP.md intentionally untouched (plan success criteria).

---
*Phase: 14-perimetre-enfants*
*Completed: 2026-10-12*
