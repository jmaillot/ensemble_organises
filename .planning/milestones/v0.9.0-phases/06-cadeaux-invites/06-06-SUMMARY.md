---
phase: 06-cadeaux-invites
plan: 06
subsystem: ui
tags: [react, vitest, playwright, cadeaux, guest-view, accessibility]

# Dependency graph
requires:
  - phase: 06-04
    provides: guest payload already serves url/photoUrl/comment per item with D-07 masking
  - phase: 06-05
    provides: authenticated explicit choice (join vs detached anonymous) around the same guest view
provides:
  - Expandable guest rows (tap-to-detail) reusing the 06-04 payload keys, zero new endpoints
  - Vitest proofs for expand/collapse, reserve-from-expanded, fail-closed detail, masking-in-detail
affects: [06-VALIDATION, verify-work UAT for G-06-1a-bis]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 3594
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [independent per-item toggles with aria-expanded/aria-controls, detail region keyed guest-item-detail-<id>]

key-files:
  created: []
  modified:
    - app/src/modules/cadeaux/guest-cadeau-page.tsx
    - app/src/modules/cadeaux/guest-cadeau-page.test.tsx

key-decisions:
  - "Independent toggles (not single-open accordion): each row opens without closing others — simplest state, no focus loss on siblings"
  - "Collapsed summary shows name + price only; photo/comment/link live exclusively in the expanded detail"
  - "Existing G-06-1a and T-06-10 Vitest expectations moved behind the tap (they assert served content, which now requires opening the row)"

patterns-established:
  - "Guest row toggle is a real button with aria-expanded + aria-controls, visible focus ring, keyboard operable — no div-onClick, no swipe-only gesture (AGENTS.md §6)"
  - "e2e in this checkout still needs the Supabase-less separate-outDir workaround (06-03 pattern): env files aside, build to /tmp/opencode, serve on an unused port with E2E_BASE_URL, restore immediately"

requirements-completed: [D-05, D-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Guest rows expand on tap to an inline detail (large photo, full comment, price, external Voir link) and collapse on second tap; reserve reachable in both states"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#tap : le détail se déplie puis se replie"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#réserve depuis le détail déplié"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#lignes repliées : résumé seul, détail absent"
        status: pass
    human_judgment: false
  - id: D2
    description: "Expanded detail carries only the served payload keys with the same guards — fail-closed non-http rendering, no author identifiers anywhere"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#lien ou photo non-http : rien rendu (échec fermé, T-06-10)"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/guest-cadeau-page.test.tsx#détail déplié sans photo ni lien : rendu propre"
        status: pass
    human_judgment: false
  - id: D3
    description: "Existing guest e2e journey (code gate + offline refusal in demo mode) still green"
    requirement: "D-05"
    verification:
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts chromium+mobile 8/8 via Supabase-less outDir on :4175"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-10-07
status: complete
---

# Phase 06 Plan 06: Guest tap-to-detail Summary

**Expandable guest gift rows — tap reveals an inline detail (large photo, full comment, price, external Voir link) over the unchanged 06-04 payload, reserve flow byte-for-byte intact**

## Performance

- **Duration:** 35 min
- **Started:** 2026-10-07T10:55:00Z
- **Completed:** 2026-10-07T11:30:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Guest rows are tappable: each row header is a real toggle button (`aria-expanded`, `aria-controls="guest-item-detail-<id>"`, visible focus ring) opening an inline detail with large photo (same `isServableHttpUrl` guard, lazy, empty alt), full comment, price, and the existing external "Voir" anchor (new tab, rel noopener)
- Reserve button and reserved badge stay in the row header — reachable and functional collapsed or expanded; reserve logic untouched, no new fetch, no new payload keys, no author data (D-07 unchanged)
- Vitest suite extended: collapsed-summary proof, expand/collapse round-trip with masking assertion inside the detail, reserve-from-expanded success, clean degradation without photo/link; pre-existing G-06-1a and T-06-10 expectations moved behind the tap
- Full chain green: typecheck, cadeaux Vitest 44/44 (4 files), production build, guest e2e 8/8 (chromium + mobile) via the 06-03 Supabase-less workaround — G-06-1a-bis closed

## Task Commits

Each task was committed atomically:

1. **Task 1: Expandable guest rows with inline detail** - `aaa3f5b` (feat)
2. **Task 2: Vitest proofs for expand/collapse and full-chain gate** - `60aacf9` (test)

## Files Created/Modified

- `app/src/modules/cadeaux/guest-cadeau-page.tsx` - Independent per-item expanded state + toggle button + conditional detail region; reserve flow untouched
- `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` - 4 new expand/collapse proofs; G-06-1a and T-06-10 tests updated to open the row first

## Decisions Made

- **Independent toggles, not single-open accordion:** each row opens without closing others — simplest state shape (`string[]`), no focus loss on siblings, documented per plan's executor-choice clause
- **Collapsed summary = name + price only:** the thumbnail, comment, and Voir link moved exclusively into the detail so "tap to reveal" is a real affordance, not a duplicate; same payload keys, zero new endpoints (T-06-10 surface unchanged apart from size)
- **Large photo keeps `alt=""`:** the item name sits adjacent in the row header, so the image stays decorative for screen readers — same convention as the former thumbnail

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing G-06-1a/T-06-10 Vitest expectations asserted inline content that now requires a tap**
- **Found during:** Task 2 (suite update — 2 tests red after Task 1)
- **Issue:** The 06-04 tests expected photo/link in the DOM on render; collapsed rows intentionally render summary only
- **Fix:** Opened the row via the toggle before asserting served content (G-06-1a); extended the fail-closed test to open the row first so the detail itself proves the refusal
- **Files modified:** app/src/modules/cadeaux/guest-cadeau-page.test.tsx
- **Verification:** cadeaux Vitest 44/44 green
- **Committed in:** 60aacf9 (part of task commit)

**2. [Rule 3 - Blocking] e2e red at demo entry — local `.env*.local` hide the demo button (known 06-03 cause)**
- **Found during:** Task 2 (e2e gate — 8/8 failed, including 3 pre-existing tests, so environmental)
- **Issue:** Baked Supabase config hides « Entrer dans la démonstration »; without it no demo-mode journey can start
- **Fix:** Applied the 06-03-SUMMARY workaround verbatim: env files aside, Supabase-less build to `/tmp/opencode/dist-demo-06-06`, served on :4174→4175 with `E2E_BASE_URL`, env files restored immediately, preview stopped afterwards
- **Files modified:** none (ephemeral build only; shared `dist/` and :4173 untouched)
- **Verification:** e2e 8/8 chromium+mobile green
- **Committed in:** n/a (no repo change)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both required for correct proofs; no scope creep — no new packages (T-06-SC clean), no migration/Edge changes, no payload or masking changes.

## Issues Encountered

- `pkill -f "vite preview --outDir …"` matched the invoking shell's own command line and SIGTERM-killed it before the env-file restore ran. Recovery: verified both `.env*.local` still sat in the backup dir (timestamps intact), restored with plain `mv`, confirmed `app/.env*` present and `git status` clean of env changes. Lesson: never `pkill -f` with a pattern present in the caller's own command line — use a port-based kill or an exact-match guard instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-06-1a-bis closed: guest rows have the expected tap-to-detail affordance with reserve reachable in both states, keyboard/screen-reader operable, masking intact
- No blockers; guest e2e deterministic subset still green; server-backed reserve paths remain proven by SQL 0029 + Vitest as in 06-03

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-07*
