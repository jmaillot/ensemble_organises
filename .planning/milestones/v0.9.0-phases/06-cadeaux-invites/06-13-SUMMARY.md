---
phase: 06-cadeaux-invites
plan: 13
subsystem: ui
tags: [gift-lists, sharing, toolbar, vitest, playwright, edge-functions]
requirements: [D-04]
gap_closure: true
gap_ids: [G-06-21]
requires:
  - phase: 06-12
    provides: release-confirmation wording in the same page area
provides:
  - List-level actions in one toolbar row with a labeled small-size list selector (G-06-21)
  - Reservation-only sharing default in dialog and send-email, D-04 amended (G-06-21)
affects: [gift-sharing, verify-work]
tech-stack:
  added: []
  patterns: []
key-files:
  modified:
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/components/gift-share-dialog.tsx
    - supabase/functions/gift-list-invite/index.ts
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/cadeaux-page.test.tsx
    - app/src/modules/cadeaux/components/gift-share-dialog.test.tsx
key-decisions:
  - "D-04 amended 2026-10-07 per UAT product decision: sharing creates a reservation share, never lecture — dialog submit, client email ensure, and Edge send-email ensure all write 'reservation'"
  - "Stored lecture shares stay honored with no migration and no RLS change: 0082 redeem upgrades lecture to reservation on redeem, and the never-downgrade rule is preserved on the send path"
  - "The toolbar keeps every render condition byte-identical (!isForeignList share, isOwned trash, isForeignList quit, isForeign badge) — placement and size only"
  - "The list group keeps its Listes de cadeaux aria-label for tests and screen readers; the visible selector label is adjacent text, not an overriding labelledby"
actuals:
  tokens: 8000
  tasks: 3
  commits: 3
status: complete
---

# Phase 06 Plan 13: Toolbar Row + Reservation by Default (G-06-21) Summary

**List-level actions (Partager/Gérer, Supprimer, Quitter, origin badge) now sit in one `Actions de la liste` toolbar row under a visibly labeled small-size list selector, and sharing grants reservation by default — the dialog creates reservation shares with no lecture option and send-email ensures a reservation share (D-04 amended) — all gates green.**

## Performance

- **Tasks:** 3
- **Files modified:** 6 (3 source, 1 Edge, 2 Vitest suites; api.ts comment-only)
- **Commits:** f00e87a (feat), 186736c (feat), 614614d (test)

## Accomplishments

- `cadeaux-page.tsx` (Task 1): list-scoped controls regrouped into one horizontal toolbar row (`role="group" aria-label="Actions de la liste"`, flex-wrap) directly under the selector — Partager/Gérer (`!isForeignList`), trash (`isOwned`), Quitter (`isForeignList`), foreign origin badge — conditions unchanged, placement only. Selector prefixed with the visible label "Sélection de la liste de cadeaux : " and toggles dropped to `size="sm"` (same `min-h-9` as the Toutes/Privées filter group); group keeps its `Listes de cadeaux` aria-label; single-list plain-name and empty-filter copy unchanged. Client email ensure (`handleEnsureLectureShare`) now pushes `permission: 'reservation'` to match the amended D-04.
- `gift-share-dialog.tsx` + `gift-list-invite/index.ts` (Task 2): dialog per-member permission Select removed with its zod `permissions` record, reset prefill mapping, and submit branch — every created member share is `permission: 'reservation'`; checkboxes, 06-09 warning/reminder logic, code panel, and send-email block otherwise untouched. Edge `handleSendEmail` inserts `permission: 'reservation'` for the ensured share; share-first ordering and the never-downgrade rule intact; header/step comments updated to the amended D-04. Redeployed via `scripts/deploy-functions.sh` (10 functions, 0 obsolete); `supabase-edge-functions` healthy.
- Proofs (Task 3): dialog suite asserts submit creates `reservation` shares and no `Permission pour` select exists; page share test asserts the visible selector label, `min-h-9` small toggles, the `Actions de la liste` toolbar containing Partager/Gérer, no permission select in the dialog, and Gérer staying in the toolbar. No lecture-share fixtures exist in Vitest (nothing to migrate in tests); the stored-lecture upgrade path was verified read-only in `0082_gift_redeem_upgrade.sql` (both member and email branches `update ... set permission = 'reservation' where ... permission = 'lecture'`) — no migration, no RLS change.
- Gates: typecheck clean, cadeaux Vitest 77/77 (5 files), production build green, redeployed Edge live, e2e cadeaux-contacts 14/14 (chromium + mobile) in demo mode via the 06-03 Supabase-less separate-outDir workaround (`/tmp/opencode/dist-demo-0613` on :4174, env files restored by rename, preview stopped, port verified free).

## Task Commits

1. **Task 1: Toolbar row, labeled small selector** - `f00e87a` (feat)
2. **Task 2: Reservation by default in dialog and send-email (D-04 amended)** - `186736c` (feat)
3. **Task 3: Proofs update and full-chain gate** - `614614d` (test)

**Plan metadata:** SUMMARY written to disk; `.planning/` is gitignored in this repo so no docs commit is possible (verified via `git check-ignore`). STATE.md/ROADMAP.md untouched per plan instructions (orchestrator-owned).

## D-04 Amendment (recorded per plan)

- **Before:** D-04 "création de la part lecture" — sharing (dialog submit, client email ensure, Edge send-email ensure) created a `lecture` share first, upgraded to `reservation` only on redeem.
- **After (UAT product decision 2026-10-07, G-06-21):** D-04 "création de la part reservation" — every sharing path creates a `reservation` share directly; `lecture` is no longer a creatable value anywhere in the UI or the send path.
- **Scope guard:** stored `lecture` shares remain valid and are still honored — `redeem_gift_list_invite` (0082) upgrades them to `reservation` on redeem as before. No data migration, no RLS/policy change, no flow change. The reachable permission set is identical (T-06-22): lecture shares already upgraded to reservation on redeem, so only the default changed.

## Decisions Made

- Kept the `onEnsureLectureShare` / `handleEnsureLectureShare` names (plan key-link: permission value only, share-first ordering unchanged) — renaming the chain would have widened the diff for zero behavior gain; comments now say `reservation`.
- Dropped `aria-labelledby` on the selector group after the first test run: it overrode the kept `Listes de cadeaux` accessible name and broke 14 tests — the visible label stays as adjacent text, the group keeps its name for tests and screen readers.
- `api.ts` send-email comments aligned with the amended D-04 (Rule 2 stale-prose fix: prose asserting "part lecture d'abord" would have contradicted the new default).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] aria-labelledby overrode the kept group accessible name**
- **Found during:** Task 3 (first cadeaux run: 63/77, 14 failures in cadeaux-page.test.tsx)
- **Issue:** Adding `aria-labelledby` to the selector group replaced its accessible name, so `getByRole('group', { name: 'Listes de cadeaux' })` found nothing
- **Fix:** Removed `aria-labelledby`, added `role="group"` to the toolbar div instead; selector group keeps `aria-label="Listes de cadeaux"`, visible label remains adjacent text
- **Files modified:** app/src/modules/cadeaux/cadeaux-page.tsx (committed in 614614d)
- **Commit:** 614614d

**2. [Rule 2 - Missing] api.ts comments still asserted lecture-first send-email**
- **Found during:** Task 3 (grep for stale `lecture` after the Edge change)
- **Issue:** `api.ts` header and helper comments described the pre-amendment D-04 ("part `lecture` d'abord"); per AGENTS.md §I an affirmed absence/limit must be corrected in all copies
- **Fix:** Comments updated to `reservation` with the amendment reference; also repaired a garbled continuation line from the edit
- **Files modified:** app/src/modules/cadeaux/api.ts (comment-only, committed in 614614d)
- **Commit:** 614614d

**3. [Rule 3 - Blocking] e2e demo entry hidden by gitignored local env files**
- **Found during:** Task 3 (same as 06-03/06-10/06-11/06-12)
- **Issue:** `.env.development.local` / `.env.production.local` bake Supabase config into the build, so the demo entry never renders
- **Fix:** Applied the 06-03-SUMMARY workaround verbatim: env files moved to `/tmp/opencode/envbak-0613/`, Supabase-less build to separate outDir `/tmp/opencode/dist-demo-0613`, served on :4174 with `E2E_BASE_URL`, env files restored by rename afterwards, preview stopped (port verified free)
- **Verification:** e2e 14/14 chromium + mobile

**Total deviations:** 3 auto-fixed (1 UI bug, 1 stale-prose, 1 environmental — no product impact)

## Issues Encountered

- `pkill -f "vite preview --port 4174"` matched the invoking shell's own command line and SIGTERM-killed it before the chained `mv` restore ran. Recovery: env files restored with a plain `mv` in a fresh shell (verified 117 bytes each, both present), preview confirmed dead via `ss` port check instead of pattern kill. Lesson for future plans: kill preview servers by port PID (`ss -tlnp`), never by command-pattern `pkill`.

## User Setup Required

None.

## Next Phase Readiness

- G-06-21 closed: one toolbar row, labeled small selector, reservation-by-default sharing in dialog and send-email with the D-04 amendment recorded and stored lecture shares honored; keyboard/screen-reader behavior preserved (native buttons, kept group labels, touch targets unchanged).
- No stubs introduced; no new threat surface (no new write path — T-06-22 mitigated by owner-explicit grants, identical reachable permission set, never-downgrade preserved; T-06-SC clean: no new package).

## Self-Check: PASSED

- All six modified files present on disk; commits f00e87a, 186736c, and 614614d exist in history
- Env files restored; disposable preview stopped; port 4174 free; no unrelated files staged or touched
- Gates re-run and green: typecheck clean, cadeaux 77/77, build ok, e2e cadeaux-contacts 14/14, Edge functions service healthy
- STATE.md/ROADMAP.md untouched (orchestrator-owned)
