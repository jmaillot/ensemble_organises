---
phase: 11-cercle
plan: 04
subsystem: cercle-messages-delete
tags: [rls, sender-only-delete, cercle, messages, vitest, playwright]

# Dependency graph
requires:
  - phase: 11-cercle plan 03
    provides: [inline replies on shared comment verb, 17/17 cercle suite]
provides:
  - Sender-only single delete everywhere (posts/comments/reactions/messages, D-07)
  - Admin thread archive intact as the freeze-not-delete lever (proven, untouched)
  - Zero admin delete affordance on others' content
affects: [verify-work phase 11]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 9200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [author-only delete policy (historic policy names kept, admin branch dropped), page-level admin-no-affordance proof through the real hook]

key-files:
  created:
    - supabase/migrations/0117_sender_only_delete.sql
    - supabase/tests/0052_sender_only_delete.sql
  modified:
    - supabase/tests/0047_cercle_author_guards.sql
    - app/src/modules/cercle/hooks/use-cercle.ts
    - app/src/modules/cercle/components/post-card.tsx
    - app/src/modules/cercle/components/comments-dialog.tsx
    - app/src/modules/cercle/cercle-page.tsx
    - app/src/modules/cercle/cercle-page.test.tsx

key-decisions:
  - "Numbering 0117/0052, not the plan's 0113/0051: those numbers were taken by the enfant perimeter (0113-0116 migrations, 0051 test) — noted in the migration header"
  - "Historic DELETE policy names kept (posts_delete_admin etc.), admin branch dropped inside — no dependent churn"
  - "isAdmin prop fully removed from PostCard/CommentsDialog (not left dead): gates no longer consult it anywhere; page pass-throughs and copy updated"
  - "No RED-sonde file kept: the probe narrative lives in migration/test headers; the suite asserts the post-fix state"

patterns-established:
  - "Sender-only delete: policy body is exactly author_id = private.current_member_id(household_id) — any or-admin branch on a single-delete path is the D-07 violation shape"

requirements-completed: [D-07]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Only a row's author deletes it (posts, comments, reactions, chat messages) — no admin branch on any single-delete path (D-07)"
    requirement: "D-07"
    verification:
      - kind: sql
        ref: "supabase/tests/0052_sender_only_delete.sql#admin refused per table, author allowed, outsider blind, cascade intact, messages pre-secured asserted"
        status: pass
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#admin no-delete proofs (page-level, dialog rewrite, post rewrite)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin thread archive stays intact (freeze, not delete — proven unchanged) (D-07)"
    requirement: "D-07"
    verification:
      - kind: sql
        ref: "supabase/tests/0052_sender_only_delete.sql#archive RPC intacte (refus non-admin, tombe collective, histoire relue, ecritures figees)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No admin delete affordance renders on others' content anywhere (D-07)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#page-level admin proof through the real canDelete hook (Camille is demo admin)"
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-10-12
status: complete
---

# Phase 11 Plan 04: Sender-Only Single Delete Summary

**Single delete strictly author-only across Cercle and messages — admin branches dropped with proofs, thread archive proven intact as the freeze lever, affordances aligned; full chain green**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-12 (branch `main`, dispatched executor, retry after provider rate-limit)
- **Completed:** 2026-10-12
- **Tasks:** 3
- **Files created:** 2 (migration 0117, suite 0052) · **modified:** 6

## Accomplishments

- Migration 0117 (forward-only, applied files untouched): the three Cercle DELETE policies (`posts_delete_admin`, `post_comments_delete_admin`, `post_reactions_delete_admin`) re-created author-only — the `or is_household_admin` branch is gone on every single-delete path. `messages_delete` (0100) untouched, asserted pre-secured in 0052, not rebuilt. `archive_conversation` (0106) + admin guard (0107) + content guard D-01 (0109 UPDATE) + thread cascade + reaction toggle-off path all untouched.
- Suite 0052 (rollback-only, household/thread/object-bounded, no tautologies): author deletes own comment + own reaction (toggle-off) + own thread (cascade aspirates children, sibling post survives); member and admin single-delete on others refused per table with survival asserts; outsider blind + cross-household closed; messages author-allowed / admin-refused; archive RPC intact end-to-end (non-admin refused, collective tomb, memberships preserved, history readable, writes frozen — including admin no longer deleting even own message in an archived thread).
- Suite 0047 amended D-03→D-07 (minimal): admin post/reaction deletes on others now expect 0 + survival; author cascade section unchanged.
- Frontend: `canDelete`/`canDeleteComment` (hook), `canDeleteInline` (card), dialog gate all author-only; `isAdmin` prop removed from PostCard/CommentsDialog with page pass-throughs, page copy, and tests updated. Messages module verified sender-only (`message.isMine` gate) — untouched.
- Full chain green: static SQL check, DB suite 54/54, typecheck, cercle+messages Vitest 61/61 (cercle 19/19 incl. 1 net-new page-level admin proof + 2 D-07 rewrites), production build, e2e cadeaux-contacts 28/28 in demo mode (no `.env*.local` present, nothing to restore, no preview left running).

## Task Commits

Each task was committed atomically (on `main`, per wave precedent — no per-agent branch exists in this environment):

1. **Task 1: Prove admin single-delete, then drop every remaining branch** - `96dbffd` (feat)
2. **Task 2: Remove admin delete affordances on others' content** - `7ec5c52` (feat)
3. **Task 3: Proofs and full-chain gate** - `15dec52` (test)

No docs commit: `.planning/` is gitignored in this repo (verified via `git check-ignore`), so `11-04-SUMMARY.md` lives on disk only — recorded here as the intentional skip path. STATE.md / ROADMAP.md untouched per dispatch instructions.

## Files Created/Modified

- `supabase/migrations/0117_sender_only_delete.sql` - author-only re-creation of the 3 Cercle DELETE policies (numbering documented in header)
- `supabase/tests/0052_sender_only_delete.sql` - per-table admin-refused/author-allowed/outside-blind/cascade/messages/archive proofs
- `supabase/tests/0047_cercle_author_guards.sql` - D-03 to D-07 amendment (2 assertions to 0 + survival)
- `app/src/modules/cercle/hooks/use-cercle.ts` - `canDelete = post.mine`, `canDeleteComment` author-only (Rule 2 file, outside plan list)
- `app/src/modules/cercle/components/post-card.tsx` - `isAdmin` prop removed, inline gate author-only
- `app/src/modules/cercle/components/comments-dialog.tsx` - `isAdmin` prop removed, dialog gate author-only
- `app/src/modules/cercle/cercle-page.tsx` - pass-throughs + destructure + copy aligned (Rule 2 file, outside plan list)
- `app/src/modules/cercle/cercle-page.test.tsx` - 2 D-07 rewrites + 1 net-new page-level admin proof (Camille is the demo admin, so the page test runs through the real hook)

## Decisions Made

- Numbering 0117/0052 instead of the plan's 0113/0051: those numbers were taken meanwhile by the enfant perimeter — recorded in the migration header so a future reader doesn't go hunting for a "missing" 0113.
- Historic policy names kept on purpose: renaming would churn dependents for zero security gain; the violation shape was the `or admin` branch, not the name.
- Full `isAdmin` prop removal (not a dead prop): leaving a consulted-nowhere `isAdmin` on the components would invite the next reader to re-add the branch. The page, copy, and tests move together.
- T-11-04 kept as mitigate-as-decision: abusive content with no moderator delete is the explicit D-07 product trade-off; the admin lever is thread archive (freeze, preserves evidence) — proven intact in 0052, documented here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Tightened the hook gates in `use-cercle.ts` (file outside the plan's list)**
- **Found during:** Task 2
- **Issue:** The plan listed only the two components, but `canDelete`/`canDeleteComment` in the hook still returned `mine || isAdmin` — the page feeds cards from the hook, so component-only edits would have left admins with delete affordances on the real feed.
- **Fix:** Both gates author-only; `isAdmin` still returned by the hook (API stable).
- **Files modified:** `app/src/modules/cercle/hooks/use-cercle.ts`
- **Commit:** 7ec5c52

**2. [Rule 2 - Missing critical functionality] Updated `cercle-page.tsx` pass-throughs, destructure, and user-facing copy (file outside the plan's list)**
- **Found during:** Task 2
- **Issue:** Removing the `isAdmin` prop breaks the two page pass-throughs (type error) and the "A propos" panel still promised admins could remove publications.
- **Fix:** Pass-throughs + now-unused destructure removed; copy rewritten to author-only.
- **Files modified:** `app/src/modules/cercle/cercle-page.tsx`
- **Commit:** 7ec5c52

**3. [Rule 1 - Bug] Rewrote the pre-existing admin-deletes-others-post page test to D-07 refusal**
- **Found during:** Task 3 (1 failing test — the old behavior assertion)
- **Issue:** The test asserted the exact behavior D-07 removes (admin deletes another's post with modal + toast).
- **Fix:** Rewritten to assert no affordance + post survival; the author-with-modal flow stays covered by the pre-existing own-post/own-comment tests.
- **Files modified:** `app/src/modules/cercle/cercle-page.test.tsx`
- **Commit:** 15dec52

### Prior-attempt adoption (not a deviation)

The dispatched retry found Task 1's work uncommitted in the tree (migration 0117, suite 0052, 0047 amendment — same numbering rationale as above). Verified green (static check + full DB suite) and committed as `96dbffd` rather than duplicating it. Tasks 2–3 had no trace and were executed fresh.

## Issues Encountered

- None beyond the adopted partial work above. Commits landed on `main` (the dispatch checkout); no per-agent branch existed — noted, not acted on (no history rewritten).

## Threat Flags

T-11-04 (Availability, abusive content with no moderator delete, medium, mitigate-as-decision): D-07 explicitly accepts that only authors remove single rows; the admin moderation lever is thread archive (freeze, preserves evidence), proven intact in suite 0052 and untouched by migration 0117. Documented here per the plan's threat register, not silently accepted. (T-11-SC: no package installs in this plan.)

No new network/auth/schema surface beyond the plan's register — three DELETE policies tightened in place, no new endpoints, no RPC re-scoping.

## Known Stubs

None — no placeholder, TODO, or unwired data path introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-07 complete: single delete is author-only on posts/comments/reactions/messages with archive intact — Phase 11 ready for verify-work (D-01 through D-07 all landed across 11-01…11-04).
- Same pre-existing note as 11-02/11-03 (unchanged): image-only posts with empty text would violate the posts.text CHECK server-side — out of scope, flagged not changed.

## Self-Check: PASSED

- FOUND supabase/migrations/0117_sender_only_delete.sql, supabase/tests/0052_sender_only_delete.sql on disk
- FOUND commits 96dbffd + 7ec5c52 + 15dec52 in `git log`
- FOUND static SQL check green, DB suite 54/54, typecheck, 61/61 cercle+messages Vitest, build, 28/28 e2e (this wave)

---
*Phase: 11-cercle*
*Completed: 2026-10-12*
