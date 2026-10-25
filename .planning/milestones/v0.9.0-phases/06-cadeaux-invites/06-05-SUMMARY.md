---
phase: 06-cadeaux-invites
plan: 05
subsystem: cadeaux-guest
tags: [gift-lists, guest-choice, anonymous-reserve, vitest, playwright]
dependency_graph:
  requires:
    - phase: 06-04-guest-view-details
      provides: guest url/photoUrl payload, GuestAnonymousView, guest e2e journey + Supabase-less outDir pattern
  provides:
    - authenticated explicit choice (join-via-account vs continue-without-linking) on the guest invitation page
    - sessionless detached anonymous path (withoutSession publishable option, T-06-11)
    - Vitest proofs for both options, sessionless reserve, and argument-identical redeem
  affects: [guest-cadeau-page, gift-list-invite-client, verify-work, 06-UAT]
tech_stack:
  added: []
  patterns: [gate-on-explicit-choice query enablement, opt-in credential suppression on a shared publishable helper]
key_files:
  created: []
  modified:
    - app/src/modules/cadeaux/guest-cadeau-page.tsx
    - app/src/modules/cadeaux/guest-cadeau-page.test.tsx
    - app/src/modules/cadeaux/api.ts
key_decisions:
  - "Redeem fires only after the explicit join choice (query enabled on choice === 'join'); the visitor branch and code-entry form are byte-for-byte behaviorally unchanged"
  - "Detached anonymous path reuses the same GuestAnonymousView and publishable helpers with an opt-in withoutSession flag — no new endpoints, no new packages, default helper behavior untouched"
  - "The already-authenticated 'connect with the invited email' prompt is hidden in detached mode (it addresses visitors, not signed-in users)"
  - "Cross-household list merging, RLS changes, and onboarding changes explicitly untouched and recorded as deferred, not gaps"
metrics:
  duration: 40min
  completed: 2026-10-07
  actuals:
    tokens: 5500
    tasks: 2
    commits: 2
    plan_head_before: 49855f1
    plan_head_after: b2f2144
status: complete
requirements_completed: [D-04, D-05]
gaps_closed: [G-06-1b]
---

# Phase 06 Plan 05: Authenticated Guest Choice Summary

**An authenticated user opening a code link now picks explicitly — join via account (untouched redeem) or continue without linking (same anonymous view, provably sessionless)**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-07T10:30:00Z
- **Completed:** 2026-10-07T10:55:00Z (UTC)
- **Tasks:** 2
- **Files modified:** 3 (2 source, 1 test)

## Accomplishments

- Guest invitation page renders an explicit two-option choice for signed-in visitors instead of auto-firing the redeem: "Rejoindre via mon compte" (existing redeem path — same `redeemGiftListInvite` call, same idempotent `already_shared` handling, same "Ouvrir les cadeaux" outcome) or "Continuer sans lier mon compte" (the same code-gated `GuestAnonymousView` visitors use)
- Redeem query gated on the explicit join choice (`enabled: … && choice === 'join'`); choice resets with the code, and a "Revenir au choix" affordance lets the user switch before redeeming
- Anonymous path is provably sessionless even with a live session: new opt-in `GuestPublishableOptions.withoutSession` skips the bearer lookup in `callGiftInvitePublishable` and is threaded through `fetchGuestGiftView` / `reserveGuestGiftItem` (defaults preserve existing behavior everywhere else)
- Anonymous-attribution copy in both places the threat model requires: the choice card ("rien ne sera rattaché à votre compte ni à un foyer") and the detached view header/footer ("seul le nom déclaré sera transmis")
- Full gate green: typecheck, cadeaux Vitest 40/40 (11 page tests incl. 3 new + 2 choice-aware updates), production build, existing guest e2e journey 8/8 (chromium + mobile, Supabase-less outDir per the 06-03 pattern)

## Task Commits

Each task was committed atomically:

1. **Task 1: Authenticated explicit choice between join-via-account and continue-without-linking** - `50f07be` (feat)
2. **Task 2: Vitest proofs for the choice and full-chain gate** - `b2f2144` (test)

## Files Created/Modified

- `app/src/modules/cadeaux/guest-cadeau-page.tsx` - Choice state, gated redeem, detached anonymous branch with attribution copy, `detached` prop on `GuestAnonymousView`
- `app/src/modules/cadeaux/api.ts` - `GuestPublishableOptions.withoutSession` threaded through the publishable caller and both guest helpers (backward-compatible optional param)
- `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` - Hoisted controllable `getSession` mock, recording fetch stubs, 3 new G-06-1b/T-06-11 proofs, 2 session tests updated for the choice step

## Decisions Made

- Redeem fires only after the explicit join choice (query enabled on `choice === 'join'`); the visitor branch and code-entry form are behaviorally unchanged
- Detached anonymous path reuses the same `GuestAnonymousView` and publishable helpers with an opt-in `withoutSession` flag — no new endpoints, no new packages, default helper behavior untouched
- The already-authenticated "connect with the invited email" prompt is hidden in detached mode (it addresses visitors, not signed-in users)
- Cross-household list merging, RLS changes, and onboarding changes explicitly untouched and recorded as deferred, not gaps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `api.ts` needed a sessionless publishable option (T-06-11)**
- **Found during:** Task 1 (reading `callGiftInvitePublishable` before wiring the detached path)
- **Issue:** The plan's `files_modified` listed only the page, but the existing publishable helper unconditionally attaches the bearer whenever a session exists — an authenticated user on the "anonymous" path would have reserved *with* their session attached, violating the plan's own threat mitigation ("the anonymous path attaches no session to the reserve call")
- **Fix:** Opt-in `GuestPublishableOptions.withoutSession` flag (skips the `getSession` lookup entirely); threaded through `fetchGuestGiftView` / `reserveGuestGiftItem` as an optional 4th/2nd param; default path byte-identical (all pre-existing header-shape tests green untouched)
- **Files modified:** `app/src/modules/cadeaux/api.ts`
- **Verification:** New page test with a live `jwt-test` session asserts `authorization` is `undefined` on every `guest-view`/`guest-reserve` call and zero `redeem` calls; api.test.ts pre-existing with/without-session tests still green
- **Committed in:** 50f07be (part of task commit)

### Deferred (explicitly out of scope per plan — not gaps)

- Merging cross-household lists into `fetchCadeauxSnapshot`
- Any RLS change
- Any onboarding change

## Issues Encountered

- None beyond the Rule 2 above. E2E followed the 06-03 Supabase-less pattern (env files staged aside, separate outDir `:4174`, restored byte-identical afterwards — verified with `cmp`); the preview server was killed by port lookup, avoiding the `pkill -f` self-match trap documented in 06-04.

## Known Stubs

None — no placeholders, TODOs, or unwired data introduced. (The two `placeholder=` hits in the stub scan are pre-existing HTML input attributes, not stub content.)

## Threat Flags

None beyond the plan's threat model — T-06-11 (anonymous attribution + no session on the reserve call) is mitigated as specified plus the `withoutSession` enforcement (deviation 1); T-06-SC clean (no new packages).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-06-1b closed: invited account holders can participate without joining a household via the explicit anonymous path, while the redeem path is provably argument-identical to before
- Supervised-manual residuals stay with the operator per 06-VALIDATION.md (no new manual surface: the choice UI is covered by Vitest + demo-mode e2e structure)

---

*Phase: 06-cadeaux-invites*
*Completed: 2026-10-07*

## Self-Check: PASSED

- FOUND: `app/src/modules/cadeaux/guest-cadeau-page.tsx` (choice + detached branch)
- FOUND: `app/src/modules/cadeaux/api.ts` (withoutSession option)
- FOUND: `app/src/modules/cadeaux/guest-cadeau-page.test.tsx` (11/11 incl. 3 new proofs)
- FOUND: commits `50f07be`, `b2f2144` in `git log`
- FOUND: `.planning/phases/06-cadeaux-invites/06-05-SUMMARY.md` on disk (uncommitted — `.planning/` is gitignored, skip noted)
