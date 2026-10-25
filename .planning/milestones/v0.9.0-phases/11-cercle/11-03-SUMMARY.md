---
phase: 11-cercle
plan: 03
subsystem: frontend-cercle
tags: [react, cercle, inline-replies, vitest, playwright]

# Dependency graph
requires:
  - phase: 11-cercle plan 02
    provides: [author edit/delete affordances, DB-aligned caps 4000/2000, 14/14 cercle suite]
provides:
  - Inline replies under each post (latest 2 + composer on the shared create-comment verb, D-06)
  - Full comments dialog intact for history
  - Cercle suite 17/17 incl. inline proofs
affects: [verify-work phase 11]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 7750
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [inline composer on shared verb (dialog path untouched), history-link when hidden comments exist]

key-files:
  created: []
  modified:
    - app/src/modules/cercle/components/post-card.tsx
    - app/src/modules/cercle/cercle-page.tsx
    - app/src/modules/cercle/cercle-page.test.tsx

key-decisions:
  - "N fixed at 2 (INLINE_COMMENT_COUNT): matches the pre-existing preview count, so no layout shift — documented in code"
  - "New comment props optional on PostCard: direct renders without the verb keep working (no composer, no affordances), page always provides them"
  - "Inline composer labelled 'Répondre à X' (never 'Votre commentaire') so pre-existing page-composer queries stay unambiguous"
  - "Inline edit/delete reuse the dialog's aria-labels and gate grid (edit = mine, delete = mine-or-admin); delete confirmed by sibling ConfirmDialog per the ardoise idiom"
  - "'Tous les commentaires (N)' shown only when comments are hidden inline; the existing Commenter button still opens history otherwise"

patterns-established:
  - "Cercle inline: card owns reply/edit/delete draft state, hook's addComment/updateComment/deleteComment stay the single write path (no second verb)"

requirements-completed: [D-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Each post shows its latest comments inline with a direct reply field; sending posts without opening the dialog (D-06)"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#répond en ligne sans ouvrir la modale et garde l’historique complet / montre les N derniers commentaires en ligne avec les affordances d’auteur / ignore l’envoi inline vide sans rien changer"
        status: pass
    human_judgment: false
  - id: D2
    description: "The full comments dialog stays for history with identical behavior (D-06)"
    requirement: "D-06"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#répond en ligne sans ouvrir la modale et garde l’historique complet (dialog asserts all 3 comments)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-12
status: complete
---

# Phase 11 Plan 03: Inline Replies Summary

**Latest 2 comments inline under each post with a reply field on the shared create-comment verb; full dialog untouched for history — presentation only, no model or gate change**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-12 (branch `main`, dispatched executor)
- **Completed:** 2026-10-12
- **Tasks:** 2
- **Files modified:** 3 (0 created)

## Accomplishments

- PostCard: latest 2 comments inline as a labelled `<ul>` (author + text + reused author edit/delete affordances, modal-confirmed delete as a sibling ConfirmDialog), "Tous les commentaires (N)" history link when comments are hidden, and an inline reply field posting through the existing `addComment` verb (cap 2000, over-cap copy, empty submit no-op, labelled composer)
- CerclePage: wiring only — passes `currentMemberId`/`isAdmin`/`addComment`/`updateComment`/`deleteComment` into each card; reaction toggle, media render, realtime, read marks untouched
- Full chain green: typecheck, cercle Vitest 17/17 (14 pre-existing + 3 new), production build, e2e cadeaux-contacts 28/28 in demo mode (no env files present, nothing to restore, no preview left running)

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline latest comments plus reply composer** - `05c8786` (feat)
2. **Task 2: Proofs and full-chain gate** - `dafb745` (test)

No docs commit: `.planning/` is gitignored in this repo (verified via `git check-ignore`), so `11-03-SUMMARY.md` lives on disk only — recorded here as the intentional skip path. STATE.md / ROADMAP.md untouched per dispatch instructions.

## Files Created/Modified

- `app/src/modules/cercle/components/post-card.tsx` - `INLINE_COMMENT_COUNT = 2`, inline `<ul>` with edit/delete, history link, reply composer on the shared verb, sibling ConfirmDialog
- `app/src/modules/cercle/cercle-page.tsx` - wiring only (5 new props per card)
- `app/src/modules/cercle/cercle-page.test.tsx` - 3 new tests (inline send without dialog + history intact, empty no-op, latest-2 + affordances + shared-verb send)

## Decisions Made

- N = 2 keeps the pre-existing preview cardinality — the card already showed `slice(-2)`; the plan's new work is the affordances, the composer, and the history link, not a new count.
- Optional comment props keep the 11-02 direct-render gate-matrix test green without edits (no affordances/composer when the verb is absent); the page always supplies them.
- Inline send reuses `addComment` exactly (same optimistic insert + rollback + toast in the hook) — T-11-03 mitigated by construction, single shared verb.
- No `maxLength` on the reply input, same as 11-02: zod-equivalent length guard + disabled send keep over-cap refusal provable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Wired the new card props in `cercle-page.tsx` (file outside the plan's list)**
- **Found during:** Task 1
- **Issue:** The plan listed only `post-card.tsx`, but without passing `currentMemberId`/`addComment`/etc. from the page, the inline composer would never render (props optional) and the task's done criteria could not hold on the real feed.
- **Fix:** Added the five prop pass-throughs in `cercle-page.tsx` — wiring only, no logic.
- **Files modified:** `app/src/modules/cercle/cercle-page.tsx`
- **Commit:** 05c8786

## Issues Encountered

- None. Commits landed on `main` (the dispatch checkout); no per-agent branch existed in this environment — noted, not acted on (no history rewritten).

## Threat Flags

None beyond the plan's register — inline send is the same `addComment` verb with identical caps/gates/RLS, deletes confirmed per AGENTS.md §6, no new network/auth/schema surface. (T-11-SC: no package installs in this plan.)

## Known Stubs

None — no placeholder, TODO, or unwired data path introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-06 complete: Cercle integrity closed end-to-end (11-01 server gates + 11-02 affordances/caps + 11-03 inline replies). Phase 11 ready for verify-work.
- Same pre-existing note as 11-02 (unchanged): image-only posts with empty text would violate the posts.text CHECK server-side — out of scope, flagged not changed.

## Self-Check: PASSED

- FOUND app/src/modules/cercle/components/post-card.tsx (INLINE_COMMENT_COUNT + composer + history link)
- FOUND commits 05c8786 + dafb745 in `git log`
- FOUND 17/17 cercle Vitest, typecheck, build, 28/28 e2e (this wave)

---
*Phase: 11-cercle*
*Completed: 2026-10-12*
