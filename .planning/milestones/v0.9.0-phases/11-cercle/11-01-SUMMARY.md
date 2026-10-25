---
phase: 11-cercle
plan: 01
subsystem: database
tags: [postgres, rls, trigger, cercle, authorship, vitest]

# Dependency graph
requires:
  - phase: 08-messages
    provides: [sender-or-admin delete shape proven in 0039/0100]
  - phase: 10-infra
    provides: [0081 author-relaxation + guard_author_immutable baseline]
provides:
  - Content guard trigger author-or-admin on posts/post_comments UPDATE (0109)
  - Sender-or-admin DELETE on posts/post_comments/post_reactions (0109)
  - Proof suite 0047 (red-to-green) + cercle UI delete-affordance test
affects: [11-cercle plan 02 (D-04/D-05 UI edit/limits), verify-work phase 11]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 6272
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [content-guard trigger sibling (0083 gift shape), sender-or-admin delete policy]

key-files:
  created:
    - supabase/migrations/0109_cercle_author_guards.sql
    - supabase/tests/0047_cercle_author_guards.sql
  modified:
    - app/src/modules/cercle/cercle-page.test.tsx

key-decisions:
  - "Sibling trigger guard_cercle_content_author rather than extending guard_author_immutable (0081 untouched, effective definition stable)"
  - "DELETE policies re-cut under existing names (posts_delete_admin et al.) — forward-only, no applied file touched"
  - "Migration numbered 0109 per plan (0108 gap left free — harmless, lexicographic apply)"
  - "Reactions UPDATE untouched (D-02 toggle semantics); post_media policies untouched"

patterns-established:
  - "Cercle authorship: trigger for content UPDATE (raises 42501), RLS for DELETE (silent 0 rows) — same split as gift guards"

requirements-completed: [D-01, D-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Foreign post/comment rewrite refused; own edit allowed; admin moderates (D-01)"
    requirement: "D-01"
    verification:
      - kind: integration
        ref: "supabase/tests/0047_cercle_author_guards.sql#un membre ne reecrit pas (expect_denied) / l'auteur retouche / l'admin modere"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sender-or-admin delete on posts/comments/reactions; cascade intact; outsider/inter-foyer closed; 0081 tasks/notes intact (D-03)"
    requirement: "D-03"
    verification:
      - kind: integration
        ref: "supabase/tests/0047_cercle_author_guards.sql#D-03 sections + cascade + negatives + 0081"
        status: pass
    human_judgment: false
  - id: D3
    description: "Member deletes own post through UI trash affordance + confirm dialog, toast announced (regression gate)"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#supprime sa propre publication après confirmation et l’annonce"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-10-12
status: complete
---

# Phase 11 Plan 01: Cercle Authorship Guards Summary

**Author-or-admin content guard trigger plus sender-or-admin delete on Cercle posts/comments/reactions, proven red-to-green with cascade and 0081 non-regressions**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-12T12:00:00Z (approx, branch agent-11-01-cercle-authors)
- **Completed:** 2026-10-12
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Proved both audit findings RED before changing anything: member-B rewrite of A's post affected 1 row (D-01 open), member delete of own post affected 0 rows (D-03 closed)
- Migration 0109 (forward-only): `guard_cercle_content_author` trigger (author-or-admin UPDATE on posts/post_comments, 42501) + sender-or-admin DELETE on posts/post_comments/post_reactions under existing policy names
- Suite 0047 green: foreign writes refused, own/admin allowed, author_id still frozen, enfant read-only, reaction toggle unchanged, media paths unchanged, thread cascade intact, outsider blind, inter-foyer closed, 0081 tasks/notes intact
- Full gates green: static SQL check (149 fns, 0 defects), DB suite 49/49, app typecheck, cercle Vitest 5/5
- Zero client change except one gate-matching UI proof (own-post delete through trash + confirm dialog)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove open content writes red, then author gate plus sender-or-admin delete** - `0821f2c` (feat)
2. **Task 2: Regression gate over Cercle UI** - `c2e3bee` (test)

No docs commit: `.planning/` is gitignored in this repo (verified via `git check-ignore`), so `11-01-SUMMARY.md` lives on disk only — recorded here as the intentional skip path.

## Files Created/Modified

- `supabase/migrations/0109_cercle_author_guards.sql` - Content-guard trigger + sender-or-admin DELETE policies (forward-only)
- `supabase/tests/0047_cercle_author_guards.sql` - Red-to-green proof suite (~30 assertions, household-bounded)
- `app/src/modules/cercle/cercle-page.test.tsx` - Added own-post delete affordance test (no product change)

## Decisions Made

- Sibling trigger instead of extending `guard_author_immutable`: keeps the 0081 effective definition stable and its suite scope intact; the plan allowed either.
- DELETE policies re-cut under their existing `_delete_admin` names: forward-only drop+create, no applied file touched, no rename churn.
- Migration numbered 0109 exactly per plan (0108 slot left empty — harmless under lexicographic apply; no conflict existed).
- Toggle-then-cascade fixture split in 0047 (react_b3 reassigned to Alice, toggle run on post_b): keeps the uniqueness constraint genuine and the cascade-reaction assertion non-trivial.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate (post, author, coeur) fixture violated the uniqueness the suite preserves**
- **Found during:** Task 1 (first green run of extended 0047)
- **Issue:** react_b1 and react_b3 were both Bob's `coeur` on post_a — insert failed on `post_reactions_unique` before any assertion ran
- **Fix:** react_b3 reassigned to Alice; reaction-toggle aller/retour moved to the clean post_b (insert → duplicate denied → delete own)
- **Files modified:** supabase/tests/0047_cercle_author_guards.sql
- **Verification:** `sh scripts/test-db.sh 0047` green
- **Committed in:** 0821f2c (part of task commit)

**2. [Rule 1 - Bug] Inter-foyer survival assertion ran under the wrong role**
- **Found during:** Task 1 (second green run)
- **Issue:** "le post survit aux tentatives inter-foyers" counted as Carol, who is RLS-blind to home_a — 0 rows for a reason unrelated to the property (AGENTS.md §D.2 role mechanism)
- **Fix:** Carol's probes stay blind-assertions (0 rows); survival re-checked as Alice (home_a admin) with the moderated text intact
- **Files modified:** supabase/tests/0047_cercle_author_guards.sql
- **Verification:** `sh scripts/test-db.sh 0047` green, then full suite 49/49
- **Committed in:** 0821f2c (part of task commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 test-correctness bugs, no product impact)
**Impact on plan:** Both fixes necessary for the suite to prove what it claims. No scope creep — zero product-code change beyond the planned migration.

## Issues Encountered

- None beyond the two fixture bugs above. Both audit findings reproduced on the first red run exactly as the plan predicted (no stop-and-report needed).

## Threat Flags

None beyond the plan's register — the new trigger + widened DELETE policies are exactly T-11-01's mitigation (foreign speech→writer closed, author-or-admin only), proven by 0047. No new network/auth/schema-at-trust-boundary surface. (T-11-SC: no package installs in this plan.)

## Known Stubs

None — no placeholder, TODO, or unwired data path introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-01/D-03 server enforcement complete with admin moderation; plan 11-02 (D-04/D-05: inline edit + delete UI for comments, aligned length caps) can build on `canDelete = mine||admin` now being true server-side too.
- Note for 11-02: demo Camille is admin, so UI tests cannot distinguish mine-vs-admin affordance in the current seed — plan accordingly.
- Migration 0109 applied to the local stack DB via `scripts/migrate.sh` (1 applied, 108 known); remote rebuild must include it.

## Self-Check: PASSED

- FOUND supabase/migrations/0109_cercle_author_guards.sql
- FOUND supabase/tests/0047_cercle_author_guards.sql
- FOUND app/src/modules/cercle/cercle-page.test.tsx (5/5 Vitest)
- FOUND commits 0821f2c + c2e3bee in `git log --all`

---
*Phase: 11-cercle*
*Completed: 2026-10-12*
