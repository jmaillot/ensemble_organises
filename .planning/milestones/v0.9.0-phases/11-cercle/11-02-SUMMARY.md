---
phase: 11-cercle
plan: 02
subsystem: frontend-cercle
tags: [react, cercle, authorship-ui, validation-caps, vitest, playwright]

# Dependency graph
requires:
  - phase: 11-cercle plan 01
    provides: [author-or-admin content guard trigger (0109), sender-or-admin DELETE, own-post delete UI proof]
provides:
  - Author inline edit on posts/comments + modal-confirmed delete on proven gates (D-04)
  - DB-aligned client caps post 4000 / comment 2000 with counters (D-05)
  - Cercle suite 14/14 incl. gate-matrix and cap proofs
affects: [verify-work phase 11]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 9910
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [messages-shaped inline edit (bubble idiom), confirm-as-sibling-of-dialog (ardoise idiom), optimistic update with snapshot rollback]

key-files:
  created: []
  modified:
    - app/src/modules/cercle/api.ts
    - app/src/modules/cercle/hooks/use-cercle.ts
    - app/src/modules/cercle/components/post-card.tsx
    - app/src/modules/cercle/components/comments-dialog.tsx
    - app/src/modules/cercle/components/post-composer.tsx
    - app/src/modules/cercle/types.ts
    - app/src/modules/cercle/cercle-page.tsx
    - app/src/modules/cercle/cercle-page.test.tsx

key-decisions:
  - "Affordances mirror the 11-01 gates exactly: edit author-only, delete mine-or-admin, server still decides"
  - "Caps live in cercle/types.ts (POST_TEXT_MAX/COMMENT_CONTENT_MAX) as mirrors of the 0004 CHECKs — no base change"
  - "No maxLength attributes: zod validation stays the enforcer so over-DB refusal is provable in tests"
  - "Comment ConfirmDialog as sibling of Dialog (ardoise-members-dialog idiom), not nested in DialogContent"

patterns-established:
  - "Cercle edit: card/dialog own the draft state, hook owns the optimistic write + rollback (messages chat-panel shape)"

requirements-completed: [D-04, D-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Authors edit own posts/comments inline (prefilled, save/cancel); deletes confirmed by modal; non-authors see no affordance, admin deletes any (D-04)"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#modifie sa propre publication / annule l’édition / modifie son propre commentaire / supprime son propre commentaire / l’admin supprime la publication d’autrui / aucune affordance sur autrui / l’admin supprime mais ne retouche pas"
        status: pass
    human_judgment: false
  - id: D2
    description: "Composer cap 4000 and comment cap 2000 mirror DB CHECKs; over-old-cap submits, over-DB refused with honest copy (D-05)"
    requirement: "D-05"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#publie un texte long sous le plafond base et refuse au-delà / publie un commentaire long sous le plafond base et refuse au-delà"
        status: pass
    human_judgment: false

# Metrics
duration: 30min
completed: 2026-10-12
status: complete
---

# Phase 11 Plan 02: Cercle Author Affordances + DB-Aligned Caps Summary

**Author inline edit and modal-confirmed delete on the proven 11-01 gates, plus client caps mirroring the DB CHECKs (4000/2000) — client only, no SQL touched**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-12 (branch `main`, dispatched executor)
- **Completed:** 2026-10-12
- **Tasks:** 3
- **Files modified:** 8 (0 created)

## Accomplishments

- PostCard: author-only inline edit (prefilled textarea, save/cancel, counter, over-cap guard) beside the existing gate-mirrored delete; reaction toggle, media render, realtime untouched
- CommentsDialog: per-comment edit (author only) and delete (author or admin) with modal confirmation as a Dialog sibling (ardoise idiom); comment form keeps its shape plus a live counter
- Hook + api: `updatePost`/`updateComment` optimistic with snapshot rollback and house-style error copy, `deleteComment` with announce; `canEditPost`/`canEditComment`/`canDeleteComment` mirror the 0109 gates; failed writes surface the standard error toast
- Caps: composer 600→4000, comment 400→2000, constants in `cercle/types.ts` as documented mirrors of the 0004 CHECKs; counters and over-cap copy on composer, comment form, and both inline editors; no `maxLength` attributes so zod stays the provable enforcer
- Full chain green: typecheck, cercle Vitest 14/14 (5 pre-existing + 9 new), production build, e2e cadeaux-contacts 20/20 in demo mode (no env files present, nothing to restore, no preview left running)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author edit plus delete affordances** - `82af458` (feat)
2. **Task 2: DB-aligned caps** - `f8693e8` (feat)
3. **Task 3: Proofs and full-chain gate** - `b786ef5` (test)

No docs commit: `.planning/` is gitignored in this repo (verified via `git check-ignore`), so `11-02-SUMMARY.md` lives on disk only — recorded here as the intentional skip path. STATE.md / ROADMAP.md untouched per dispatch instructions.

## Files Created/Modified

- `app/src/modules/cercle/api.ts` - `updatePostText`, `updateCommentContent`, `removeComment` on existing data verbs (no new SQL)
- `app/src/modules/cercle/hooks/use-cercle.ts` - `updatePost`/`updateComment` (optimistic + rollback), `deleteComment`, `canEditPost`/`canEditComment`/`canDeleteComment`
- `app/src/modules/cercle/components/post-card.tsx` - `canEdit`/`onSaveEdit` props, inline editor with counter
- `app/src/modules/cercle/components/comments-dialog.tsx` - per-comment edit/delete, sibling ConfirmDialog, 2000 cap + counters
- `app/src/modules/cercle/components/post-composer.tsx` - 4000 cap + counter hint
- `app/src/modules/cercle/types.ts` - `POST_TEXT_MAX`/`COMMENT_CONTENT_MAX` with mirror documentation
- `app/src/modules/cercle/cercle-page.tsx` - wiring only
- `app/src/modules/cercle/cercle-page.test.tsx` - 9 new tests (edit save/cancel, comment edit/delete, admin-moderates, gate matrix, caps both tiers)

## Decisions Made

- Affordances render exactly where the 11-01 gates allow (edit = mine, delete = mine-or-admin); forged calls still refused server-side — T-11-02 mitigated in UI, enforced in base.
- Caps as named constants in `types.ts` (not magic numbers in two schemas) so the mirror is auditable in one place.
- Deliberately no `maxLength` on textareas: truncation would make over-DB refusal untestable; zod + disabled-save is the honest bound.
- Demo Camille is admin, so the non-author matrix is proven by direct-rendered PostCard/CommentsDialog (per the 11-01 handoff note), not through the page.

## Deviations from Plan

None - plan executed exactly as written. (One in-task correction, not a deviation: the comment ConfirmDialog was first nested inside DialogContent, then moved to a Dialog sibling per the established ardoise-members-dialog pattern — same commit, no behavior change.)

## Issues Encountered

- None. Commits landed on `main` (the dispatch checkout); no per-agent branch existed in this environment — noted, not acted on (no history rewritten).

## Threat Flags

None beyond the plan's register — affordances are a strict subset of the 11-01 server gates, deletes confirmed per AGENTS.md §6, no new network/auth/schema surface. (T-11-SC: no package installs in this plan.)

## Known Stubs

None — no placeholder, TODO, or unwired data path introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-04/D-05 complete: Cercle integrity closed client + server (11-01 + 11-02). Phase 11 ready for verify-work.
- Note: image-only posts with empty text would violate the posts.text CHECK server-side (pre-existing composer behavior, out of this plan's scope — flagged, not changed).

## Self-Check: PASSED

- FOUND app/src/modules/cercle/components/post-card.tsx (edit affordance + POST_TEXT_MAX counter)
- FOUND app/src/modules/cercle/components/comments-dialog.tsx (edit/delete + sibling confirm + 2000 cap)
- FOUND app/src/modules/cercle/components/post-composer.tsx (4000 cap)
- FOUND commits 82af458 + f8693e8 + b786ef5 in `git log`
- FOUND 14/14 cercle Vitest, typecheck, build, 20/20 e2e (this wave)

---
*Phase: 11-cercle*
*Completed: 2026-10-12*
