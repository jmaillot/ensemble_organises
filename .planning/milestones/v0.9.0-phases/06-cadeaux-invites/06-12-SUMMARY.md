---
phase: 06-cadeaux-invites
plan: 12
subsystem: ui
tags: [gift-lists, release-confirmation, received-toggle, vitest, playwright]
requires:
  - phase: 06-11
    provides: toggle navigation in the same file
provides:
  - Owner uncheck on reserved-showing items delegates to the release confirmation (G-06-20)
  - Explicit "Libérer la réserve" moderation wording
affects: [gift-moderation, verify-work]
tech-stack:
  added: []
  patterns: []
key-files:
  modified:
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/cadeaux-page.test.tsx
key-decisions:
  - "Uncheck delegates on the exact badge condition (purchased || heldAnonymously) — clearing the flag on a reserved item IS releasing it"
  - "Defensive plain-toggle branch kept for uncheck on unreserved items (unreachable via UI since checked implies badge, but safe against future divergence)"
  - "Modal confirm relabelled alongside the card buttons so every release entry reads the same explicit wording"
actuals:
  tokens: 3000
  tasks: 2
  commits: 2
status: complete
---

# Phase 06 Plan 12: Delegating Uncheck + "Libérer la réserve" (G-06-20) Summary

**Owner unchecking "Reçu" on a reserved-showing item now routes into the existing release confirmation (same manager-gated payload, D-08-safe) instead of silently clearing the flag; unchecking on a free item stays a plain tracking toggle; the moderation control reads "Libérer la réserve" — all gates green.**

## Performance

- **Tasks:** 2
- **Files modified:** 2 (1 source, 1 Vitest suite)
- **Commits:** ad74c0b (feat), f99b56e (test)

## Accomplishments

- `cadeaux-page.tsx`: read-only invariant check first — every reserve path sets `purchased=true` with the hold (0091 guest RPC, 0094 member-reserve RPC, member `handleTogglePurchased`), so no hold can exist without the owner-visible signal; no SQL/Edge change needed. Owner "Reçu" `onCheckedChange`: `false` on a reserved-showing item (`purchased || heldAnonymously`, the exact badge condition) calls `setPendingRelease(item)` — the switch stays checked until the modal confirms, cancel leaves everything untouched; `false` on an unreserved item and any `true` keep the plain `handleToggleReceived` toggle (authors untouched). Confirming runs the unchanged `handleRelease` payload (`reserved_by: null, purchased: false, reserved_by_name: null`) — one release path, not two. Member (non-owner) branch, guest flows, and manager gates byte-for-byte untouched.
- `cadeaux-page.tsx` relabel: both card "Libérer" buttons → "Libérer la réserve" with aria-labels extended consistently ("Libérer la réserve de X"), modal confirm → "Libérer la réserve"; the "Reçu" tracking label stays.
- `cadeaux-page.test.tsx`: new `G-06-20` describe with 3 tests on the demo adapter — full delegation flow on the Thomas-held "Casque pour le vélo" (plain check-ON keeps the hold, modal on uncheck, cancel keeps flag+badge+hold, confirm clears all three columns and the badge), plain toggle on the free "Atelier céramique" (no modal, authors null), manager-only relabel (no release control on the held "Plante verte" of the foreign list). Suite now 77/77 (was 74).
- Gates: typecheck clean, cadeaux Vitest 77/77 (5 files), production build green, e2e cadeaux-contacts 14/14 (chromium + mobile) in demo mode via the 06-03 Supabase-less separate-outDir workaround (`/tmp/opencode/dist-demo-0612` on :4174, env files restored by rename, preview stopped, sibling :4176 untouched).

## Task Commits

1. **Task 1: Owner uncheck delegates to release confirmation plus relabel** - `ad74c0b` (feat)
2. **Task 2: Vitest proofs for delegating uncheck and full-chain gate** - `f99b56e` (test)

**Plan metadata:** SUMMARY written to disk; `.planning/` is gitignored in this repo so no docs commit is possible (verified via `git check-ignore`). STATE.md/ROADMAP.md untouched per plan instructions (orchestrator-owned).

## Decisions Made

- Delegation keys on the badge condition rather than on hold authorship: the owner only ever sees `purchased`/`heldAnonymously`, so the rule "clearing the flag on a reserved-looking item IS releasing it" is the single coherent semantic.
- Modal confirm relabelled too, so the card button, its aria-label, and the confirmation all speak the same "Libérer la réserve" wording.
- The plain-`false` branch is defensive (unreachable via UI: a checked switch implies `purchased`, which implies the badge) and kept per plan text rather than omitted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test queried background card while the AlertDialog was open**
- **Found during:** Task 2 (first Vitest run: 76/77)
- **Issue:** Radix `AlertDialog` sets `aria-hidden` on the background while open, so `within(card).getByRole('switch')` finds "no accessible roles" inside the stale card scope
- **Fix:** While the modal is open, prove "switch stays checked" via the DB (`purchased` still true — and `checked={item.purchased}` is the visual); assert `toBeChecked()` after cancel, when the background is accessible again
- **Files modified:** app/src/modules/cadeaux/cadeaux-page.test.tsx (test-only, committed in f99b56e)
- **Commit:** f99b56e

**2. [Rule 3 - Blocking] e2e demo entry hidden by gitignored local env files**
- **Found during:** Task 2 (same as 06-03/06-10/06-11)
- **Issue:** `.env.development.local` / `.env.production.local` bake Supabase config into the build, so `isSupabaseConfigured` is true and the demo entry never renders
- **Fix:** Applied the 06-03-SUMMARY workaround verbatim: env files moved to `/tmp/opencode/envbak-0612/`, Supabase-less build to separate outDir `/tmp/opencode/dist-demo-0612`, served on :4174 with `E2E_BASE_URL`, env files restored by rename afterwards, preview stopped by PID (sibling :4176 preview left alone)
- **Verification:** e2e 14/14 chromium + mobile

**Total deviations:** 2 auto-fixed (1 test-only bug, 1 environmental — no product impact)

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None.

## Next Phase Readiness

- G-06-20 closed: no silent badge-gone state (uncheck on reserved confirms release through the single manager-gated payload), plain tracking toggle on free items, explicit "Libérer la réserve" wording; keyboard/screen-reader behavior unchanged (native Switch + AlertDialog).
- No stubs introduced; no new threat surface (no new write path, no guard change — T-06-19 mitigated by reusing `pendingRelease`/`handleRelease`; T-06-SC clean: no new package).

## Self-Check: PASSED

- Both modified files present on disk; commits ad74c0b and f99b56e exist in history
- Env files restored; disposable preview stopped; sibling preview untouched; no unrelated files staged or touched
- Gates re-run and green: typecheck clean, cadeaux 77/77, build ok, e2e cadeaux-contacts 14/14
- STATE.md/ROADMAP.md untouched (orchestrator-owned)
