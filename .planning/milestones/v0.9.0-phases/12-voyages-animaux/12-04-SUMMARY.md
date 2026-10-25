---
phase: 12-voyages-animaux
plan: 04
subsystem: voyages-card-covers
tags: [voyages, trip-cover, thumbnails, signed-urls, non-regression]

# Dependency graph
requires:
  - phase: 12-03
    provides: [resolveTripCoverUrl signed reads, isServableCoverUrl guard, DEFAULT_TRIP_COVER fallback]
provides:
  - Cover thumbnail on every other-trip card (same signed-read path as the hero)
  - Fail-closed card rendering for unusable covers, default-asset fallback for null covers
affects: [12-future, voyages-cover-reads]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 1100
  tasks: 2
  commits: 2
plan_head_before: 753919e
plan_head_after: c345c33

# Tech tracking
tech-stack:
  added: []
  patterns: [same-guard-same-data-card-thumbnail, fail-closed-card-cover]

key-files:
  created: []
  modified:
    - app/src/modules/voyages/voyages-page.tsx
    - app/src/modules/voyages/voyages-page.test.tsx

key-decisions:
  - "Thumbnail placed as first child of the card (outside the select button) with empty alt + aria-hidden — the destination/date accessible name is untouched"
  - "Null covers render the default-asset thumbnail exactly like the hero (toTrip fallback), only truly unusable values (ftp:, etc.) render no image"

patterns-established:
  - "Card thumbnails reuse isServableCoverUrl + the already-resolved coverPhoto — no new fetch layer, no new minting"

requirements-completed: [D-11]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Every trip card with a usable cover renders a thumbnail through the existing signed-read path, not just the featured hero"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#cartes : vignette pour le voyage couvert, rien pour le sans-couverture, héros intact (12-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cards without a usable cover render exactly as today (no image, affordances intact); hero, selection, badges, and edit buttons unchanged"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/voyages-page.test.tsx#cartes : vignette pour le voyage couvert, rien pour le sans-couverture, héros intact (12-04)"
        status: pass
      - kind: e2e
        ref: "cd app && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min
completed: 2026-10-12
status: complete
---

# Phase 12 Plan 04: Card cover thumbnails Summary

**Every trip card now shows its cover through the same signed-read path as the hero — one guarded `<img>` per card, lazy-loaded, with unusable covers rendering nothing exactly as before.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-12T16:37Z (approx)
- **Completed:** 2026-10-12T16:52Z (approx)
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Thumbnail on each other-trip card reusing `isServableCoverUrl` + the already-resolved `coverPhoto` (same minting, same fail-closed rule as the hero — no new fetch layer)
- Lazy loading, empty alt + `aria-hidden` (outside the select button, so the destination/date accessible name is byte-identical), fixed `h-24` banner sizing in the guest-row `rounded-[10px] object-cover` idiom
- Null covers fall back to the default asset thumbnail exactly like the hero (`toTrip` fallback); only truly unusable values render no image
- Selection ring, badges, edit buttons, and hero untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Cover thumbnails on trip cards** - `d64ae9d` (feat)
2. **Task 2: Proofs and full-chain gate** - `c345c33` (test)

`.planning/` is gitignored → SUMMARY on disk only, no metadata commit (per 12-01/12-02/12-03 precedent). STATE.md / ROADMAP.md intentionally untouched (dispatcher instruction).

## Files Created/Modified

- `app/src/modules/voyages/voyages-page.tsx` - guarded thumbnail `<img>` as first child of each other-trip card
- `app/src/modules/voyages/voyages-page.test.tsx` - 1 new test (covered card thumbnail + lazy src, ftp-cover card imageless with intact affordances, null-cover default fallback, hero intact)

## Decisions Made

- Thumbnail sits outside the select button with empty alt + `aria-hidden`: placing it inside would have polluted the button's accessible name (destination + date concatenation the tests rely on).
- Null-cover cards show the default-asset thumbnail rather than nothing: `toTrip` already maps null → `DEFAULT_TRIP_COVER` and the hero renders it, so cards match the hero instead of inventing a third state.
- `h-24` fixed height (not the guest-row `h-44`): same shape idiom (`w-full rounded-[10px] object-cover`), scaled to a small card rather than an expanded detail row.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Coverless test seed used `cover_photo: null`, which never renders imageless**
- **Found during:** Task 2 (new test failed: Oslo card contained an `<img>`)
- **Issue:** `toTrip` maps null → `DEFAULT_TRIP_COVER` (servable first-party asset), so a null-cover card legitimately renders the default thumbnail like the hero — there is no null-imageless state on cards.
- **Fix:** Coverless proof seeds `ftp://exemple.fr/oslo.jpg` (unusable → fail-closed, no `<img>`), and a third null-cover trip locks in the hero-consistent default-asset thumbnail.
- **Files modified:** app/src/modules/voyages/voyages-page.test.tsx
- **Verification:** voyages Vitest 13/13
- **Committed in:** c345c33 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (test bug, wrong seed assumption)
**Impact on plan:** None on scope — same files, same behavior; the test now proves both the fail-closed and the default-fallback card states.

## Issues Encountered

- None beyond the seed assumption above. No local `.env*.local` in checkout, so the 06-03 Supabase-less workaround was unnecessary; no env files touched, no preview server leftovers.

## Verification

- `cd app && npm run typecheck` → green
- `cd app && npm test -- voyages` → 13/13 green (12 pre-existing + 1 new)
- `cd app && npm run build` → green (precache 88 entries)
- `cd app && npm run test:e2e -- e2e/cadeaux-contacts.spec.ts` → 28/28 green
- `python3 scripts/check-sql-statique.py` → 150 effective functions / 117 migrations / 56 tests, zero defects (no SQL touched)

## Known Stubs

None. Stub scan not needed beyond the two touched files: the thumbnail is fully wired (resolved `coverPhoto`, guarded render), no placeholder text or empty data paths added.

## Threat Flags

None — thumbnails reuse the hero's signed reads (T-12-04: same per-read minting, household-count images, lazy-loaded); no new packages (T-12-SC not applicable).

## Self-Check: PASSED

- FOUND: app/src/modules/voyages/voyages-page.tsx (guarded card thumbnail)
- FOUND: app/src/modules/voyages/voyages-page.test.tsx (12-04 thumbnail proof test)
- FOUND: .planning/phases/12-voyages-animaux/12-04-SUMMARY.md (this file, on disk; `.planning/` gitignored)
- FOUND: d64ae9d, c345c33 in `git log`
- Commits measured from base 753919e: 2 (`git rev-list --count 753919e..HEAD`)
- No untracked leftovers from this plan (`git status` shows only pre-existing `.claude/`, `.gsd/`)

## Next Phase Readiness

- D-11 card presentation closed: covered trips are visible from every card, coverless/invalid states match the hero exactly.
- No blockers; voyages cover work complete unless a future phase revisits sizing or hero parity.

---
*Phase: 12-voyages-animaux*
*Completed: 2026-10-12*
