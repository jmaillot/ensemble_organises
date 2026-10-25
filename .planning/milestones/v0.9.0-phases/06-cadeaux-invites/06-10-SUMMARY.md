---
phase: 06-cadeaux-invites
plan: 10
subsystem: ui
tags: [gift-lists, share-dialog, vitest, playwright]
requires:
  - phase: 06-09
    provides: dialog warning + active-link reminder logic that must keep working
provides:
  - Email-free share dialog (members + code panel + send-email only)
  - Suite proof that members-only submit fabricates no email share
affects: [gift-share-dialog, verify-work]
tech-stack:
  added: []
  patterns: []
key-files:
  modified:
    - app/src/modules/cadeaux/components/gift-share-dialog.tsx
    - app/src/modules/cadeaux/components/gift-share-dialog.test.tsx
key-decisions:
  - "UI removal only: stored email shares untouched, redeem/send-email keep honoring them"
  - "06-09 reminder logic kept verbatim — zeroShare now keys on members only, the sole zero-share case"
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
status: complete
---

# Phase 06 Plan 10: Remove Redundant Email Invite Field (G-06-1e) Summary

**Slimmer share dialog: members (lecture/reservation) plus code panel plus send-email — the non-sending "Inviter un proche" field is gone, submit fabricates no email share, 06-09 reminder intact, all gates green.**

## Performance

- **Tasks:** 2
- **Files modified:** 2 (1 source, 1 test)
- **Commits:** fda1082 (feat), 761d0dd (test)

## Accomplishments

- `gift-share-dialog.tsx`: removed the "Inviter un proche (optionnel)" email `Field`, the `email` key from the zod schema and `defaultValues`, the existingShares email prefill, and the submit branch appending `{ memberId: null, email }`. Submit maps selected members to shares only; `zeroShare` keys on `selected.length === 0`. Members fieldset, permission selects, GiftCodePanel, send-email block, and all 06-09 copy/logic untouched. Redeem/send-email share handling and stored data untouched.
- `gift-share-dialog.test.tsx`: new test proving the "Inviter un proche" field is gone while the send-email block ("E-mail du destinataire") remains; strengthened the member-submit test to assert every submitted share carries a memberId and null email (no client-fabricated email share).
- Gates: typecheck clean, cadeaux Vitest 73/73 (5 files), production build green, guest e2e 14/14 (chromium + mobile) in demo mode via the 06-03 Supabase-less separate-outDir workaround (`/tmp/opencode/dist-demo-0610` on :4174, env files restored, preview stopped).

## Task Commits

1. **Task 1: Remove the email invite field and its submit branch** - `fda1082` (feat)
2. **Task 2: Update the dialog suite and full-chain gate** - `761d0dd` (test)

**Plan metadata:** SUMMARY written to disk; `.planning/` is gitignored in this repo so no docs commit is possible (verified via `git check-ignore`). STATE.md/ROADMAP.md untouched per plan instructions (orchestrator-owned).

## Decisions Made

- UI removal only: no migration, no API/Edge change — redeem-with-account and send-email already create/upgrade email shares server-side, stored shares keep working.
- Kept the dialog description copy ("personnes du foyer ou un proche externe") untouched per plan: externals are still invited via code link and send-email.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e demo entry hidden by gitignored local env files**
- **Found during:** Task 2 (first e2e run — all 14 failed waiting for "Entrer dans la démonstration")
- **Issue:** Same as 06-03 deviation #3: `.env.development.local` / `.env.production.local` bake Supabase config into the build, so `isSupabaseConfigured` is true and the demo entry never renders
- **Fix:** Applied the 06-03-SUMMARY workaround verbatim: env files moved to `/tmp/opencode/envbak-0610/`, Supabase-less build to separate outDir `/tmp/opencode/dist-demo-0610`, served on :4174 with `E2E_BASE_URL`, env files restored byte-identical afterwards (verified via `cat`), preview stopped (shared `dist/` and :4173 untouched)
- **Verification:** e2e 14/14 chromium + mobile

**Total deviations:** 1 auto-fixed (blocking, environmental — no product impact)

## Issues Encountered

None beyond the environmental e2e workaround above.

## User Setup Required

None.

## Next Phase Readiness

- G-06-1e closed: email field gone, members-only submit fabricates no email share, 06-09 reminder intact, stored email shares still honored by redeem/send-email.
- No stubs introduced; no new threat surface (field removed, no new endpoint — T-06-17 mitigated by suite assertion, T-06-SC clean: no new package).

## Self-Check: PASSED

- Both modified files present on disk; commits fda1082 and 761d0dd exist in history
- Env files restored byte-identical; disposable preview stopped; no sibling files staged or touched
- Gates re-run and green: typecheck clean, cadeaux 73/73, build ok, e2e cadeaux-contacts 14/14
- STATE.md/ROADMAP.md untouched (orchestrator-owned)
