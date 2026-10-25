---
phase: 06-cadeaux-invites
plan: 09
subsystem: ui
tags: [react, vitest, gift-sharing, invite-code, copy-only]

# Dependency graph
requires:
  - phase: 06-cadeaux-invites
    provides: [dialog invite summary state and revokeGiftListInviteCode helper from plan 06-05]
provides:
  - Share dialog discloses shares-vs-code independence (G-06-1d closed)
  - Zero-share save with live code shows reminder with direct revoke (no silent cut)
  - Dialog Vitest suite proving warning, reminder, revoke-refresh, silent-save cases
affects: [06-cadeaux-invites UAT, guest-invite copy audits]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 4294
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [copy-only gap closure reusing already-loaded summary state, stubbed-fetch dialog suite idiom]

key-files:
  created:
    - app/src/modules/cadeaux/components/gift-share-dialog.test.tsx
  modified:
    - app/src/modules/cadeaux/components/gift-share-dialog.tsx

key-decisions:
  - "Copy-only fix: zero behavior change to share, code, redeem, and leave flows (G-06-1d)"
  - "Reminder reuses existing revokeGiftListInviteCode helper and refreshes shared summary — no new fetch, no new endpoint"
  - "06-08-owned cadeaux-page failures left untouched (concurrent agent's mid-flight edits, strict file boundary)"

patterns-established:
  - "Active-link reminder: blocking zero-share save while a code is live, offering revoke vs keep-link-and-save"

requirements-completed: [D-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Share dialog states that removing shares does not revoke the invitation code link"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/components/gift-share-dialog.test.tsx#explique que retirer un partage ne révoque pas le lien"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero-share save with live code shows reminder with direct revoke, never a silent cut"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/components/gift-share-dialog.test.tsx#zéro partage + code actif : rappel explicite, pas de coupe silencieuse"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/components/gift-share-dialog.test.tsx#révoquer depuis le rappel coupe le lien et resynchronise le panneau"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/components/gift-share-dialog.test.tsx#garder le lien et enregistrer : coupe explicite des partages, lien intact"
        status: pass
    human_judgment: false
  - id: D3
    description: "Silent save preserved when no code, revoked code, or non-zero shares"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/components/gift-share-dialog.test.tsx#zéro partage sans code / code coupé / partages non vides"
        status: pass
    human_judgment: false
  - id: D4
    description: "Guest journey still green end-to-end in demo mode (garde code + refus hors ligne)"
    requirement: "D-04"
    verification:
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#invité sans compte : garde code puis refus hors ligne (14/14 file green)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-07
status: complete
---

# Phase 06 Plan 09: Share-vs-Code Independence Disclosure Summary

**Copy-only gap closure (G-06-1d): share dialog now states the two independent accesses and blocks silent share-cuts while a code is live — reminder with direct revoke, zero behavior change**

## Performance

- **Duration:** ~25 min (retry after provider rate-limit; prior attempt had committed Task 1)
- **Started:** 2026-10-07T10:20:00Z (approx, retry dispatch)
- **Completed:** 2026-10-07
- **Tasks:** 2 (Task 1 pre-committed by prior attempt, verified; Task 2 completed here)
- **Files modified:** 2

## Accomplishments

- Static warning in the share form: removing members/email here does not revoke the invitation code link below, which keeps granting guest access on its own
- Zero-share submit while `summary.hasCode && summary.isActive` opens an explicit reminder (not a silent save) with a direct revoke control plus a keep-link-and-save choice; revoke refreshes the shared summary so panel and reminder agree
- New 7-test dialog suite proving warning copy, reminder, revoke-refresh, keep-link save, and all three silent-save cases
- Full tier gate green: typecheck, dialog suite 7/7, production build, guest e2e journey 14/14

## Task Commits

Each task was committed atomically:

1. **Task 1: Warning copy and active-link reminder in the share dialog** - `c678f63` (feat, by prior attempt — verified in place, not duplicated)
2. **Task 2: Dialog test suite and full-chain gate** - `3ad2f54` (test)

**Plan metadata:** SUMMARY only (no STATE.md/ROADMAP.md updates per dispatch instructions)

## Files Created/Modified

- `app/src/modules/cadeaux/components/gift-share-dialog.tsx` - Static shares-vs-code note, invite summary lifted to dialog and shared with GiftCodePanel, zero-share reminder with revoke/keep-and-save (committed `c678f63`)
- `app/src/modules/cadeaux/components/gift-share-dialog.test.tsx` - New 7-test Vitest suite, stubbed-fetch + provider idioms (committed `3ad2f54`)

## Decisions Made

- Copy-only fix honored strictly: share submit semantics, redeem, guest, and leave flows unchanged; existing `revokeGiftListInviteCode` helper reused, no new fetch, no new endpoint
- Retry resumed cleanly: Task 1 commit `c678f63` found intact on inspection, Task 2 test file found complete-but-uncommitted on disk — verified (7/7 green) and committed as-is, no rewrite
- Concurrent-agent boundary honored: 5 failures in `cadeaux-page.test.tsx` (G-06-1c quitter tests) are 06-08's uncommitted mid-flight edits with zero references to the dialog — left untouched per the strict file boundary

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e demo entry hidden by gitignored local env (known 06-03 pattern)**
- **Found during:** Task 2 (e2e gate — all 10 tests failed at « Entrer dans la démonstration »)
- **Issue:** `app/.env.production.local` bakes Supabase config into the preview build, hiding the demo entry
- **Fix:** Applied the 06-03-SUMMARY Supabase-less workaround: env files moved to `/tmp/opencode/envbak-06-09/`, built to separate outDir `/tmp/opencode/dist-demo-06-09`, served on :4174 with `E2E_BASE_URL` (shared `dist/` and :4173 untouched for the concurrent agent), env files restored immediately, preview stopped afterwards
- **Files modified:** none in repo (all workaround artifacts under /tmp/opencode)
- **Verification:** e2e 14/14 green (7 tests × chromium + mobile), including the guest journey
- **Committed in:** n/a (no repo change)

---

**Total deviations:** 1 auto-fixed (1 blocking, pre-documented pattern)
**Impact on plan:** Environmental workaround only, identical to the 06-03 precedent. No scope creep — no new packages (T-06-SC clean), no migration/Edge changes, file boundary with 06-08 respected.

## Issues Encountered

- **Retry after provider rate-limit:** prior attempt had committed Task 1 (`c678f63`) and drafted the full Task 2 test file but was cut off before committing it. Resume inspection (`git log`, `git status`, file read) confirmed both artifacts intact; no work duplicated.
- **Concurrent 06-08 edits in working tree:** `api.ts`, `cadeaux-page.tsx`, `use-cadeaux.ts`, `api.test.ts`, `cadeaux-page.test.tsx`, and `e2e/cadeaux-contacts.spec.ts` carry 06-08's uncommitted member-leave work. The 5 `cadeaux-page.test.tsx` failures reproduce against those edits, not against this plan's files. Documented here, not fixed, not staged, not committed.
- Threat T-06-16 (perceived disclosure on share-cut) is mitigated by the reminder itself: no silent cut is possible anymore; the reused revoke path stays manager-only server-side, unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-06-1d closed: dialog discloses shares-vs-code independence, zero-share save with live code warns with direct revoke, silent save otherwise
- All gates green for this plan's scope; 06-08's suite will go green when its agent commits its mid-flight work
- Ready for UAT routing via coverage D1–D4 (all auto-pass eligible)

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-07*
