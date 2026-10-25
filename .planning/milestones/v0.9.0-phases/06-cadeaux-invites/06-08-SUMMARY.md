---
phase: 06-cadeaux-invites
plan: 08
subsystem: cadeaux
tags: [supabase, edge-functions, postgres, rls, react, vitest, playwright, gift-lists, cross-household]

# Dependency graph
requires:
  - phase: 06-cadeaux-invites plan 07
    provides: [member-reserve Edge action, 0094 name attribution, 0033 style mirrored in 0034]
provides:
  - member-leave self-only leave path (0095 RPC + Edge action, 0034 proofs)
  - "Quitter cette liste" quit control with confirming modal on foreign lists
  - demo e2e quit-path proofs (visibility, modal copy, cancel no-op, server-path refusal)
affects: [verify-work phase 06, ubuntu1 rebuild (migrate 0095 + deploy-functions)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 11854
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [session-derived identity Edge actions (no client-supplied ids), uniform oracle refusals, Supabase-less separate-outDir e2e]

key-files:
  created:
    - supabase/migrations/0095_gift_member_leave.sql
    - supabase/tests/0034_gift_member_leave.sql
  modified:
    - supabase/functions/gift-list-invite/index.ts
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/api.test.ts
    - app/src/modules/cadeaux/hooks/use-cadeaux.ts
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/cadeaux-page.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts

key-decisions:
  - "Leave deletes exactly the caller's shares (member + email forms); name-attributed holds stay byte-identical, redeem rejoins unchanged"
  - "Quit button gated on the same isForeign condition as the origin badge; destructive-adjacent action always behind ConfirmDialog (AGENTS.md §6)"
  - "e2e proves the deterministic demo subset only (server-path refusal, not silent client delete)"

patterns-established:
  - "e2e in this checkout needs a Supabase-less build (local .env*.local hide the demo entry): build to a separate outDir, serve on an unused port, E2E_BASE_URL set, env files restored byte-identical immediately, preview stopped afterwards"

requirements-completed: [D-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Invited member leaves a cross-household gift list via 'Quitter cette liste' — own shares deleted, name holds kept, others untouched, link rejoins"
    requirement: "D-04"
    verification:
      - kind: integration
        ref: "supabase/tests/0034_gift_member_leave.sql (self-only deletion, negatives, rejoin)"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/api.test.ts#leaveGiftList (G-06-1c)"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/cadeaux-page.test.tsx#CadeauxPage — quitter une liste étrangère (G-06-1c)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#quitter une liste étrangère / quitter sans serveur"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min
completed: 2026-10-07
status: complete
---

# Phase 06 Plan 08: Member leave for cross-household gift lists Summary

**Self-only server-side leave (0095 RPC + member-leave Edge action, 0034 proofs) with a modal-confirmed "Quitter cette liste" control on foreign lists — G-06-1c closed, redeem/guest/anonymous flows unchanged.**

## Performance

- **Duration:** ~55 min (retry after provider rate-limit; Task 1 already committed by prior attempt, resumed without duplication)
- **Started:** 2026-10-07T10:15Z (prior attempt) / resumed 2026-10-07T10:35Z
- **Completed:** 2026-10-07T11:30Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `member-leave` user-only Edge action + `0095_member_leave_gift_list` RPC (service_role only): deletes exactly the caller's shares (member-id and email forms) on one foreign list from the verified session alone — no client-supplied ids; uniform quitter-impossible oracle; `gift_items` never touched; RLS unwidened
- 0034 proof suite: both-forms deletion, list drops out of the caller's readable set, another member's shares and all holds untouched, leave-without-share fails cleanly, direct client deletes RLS-refused, redeem rejoin intact
- `leaveGiftList` helper (list id only) + `useLeaveGiftList` hook + "Quitter cette liste" button rendered only where the origin badge is, with ConfirmDialog stating the exact outcome (list leaves, names kept, link rejoins); oracle 404 surfaces the standard "lien ne passe plus" copy
- Full chain green: static SQL (136 fns, 0 défaut), DB 37/37 incl. 0034, Edge redeployed + healthy, typecheck, cadeaux Vitest 72/72, production build, e2e 14/14 (chromium + mobile)

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-side self-only member-leave path with proofs** - `429f8ff` (feat — prior attempt; verified present, not duplicated)
2. **Task 2: Quit control on foreign lists with confirmation** - `dea5f32` (feat)
3. **Task 3: Proof closure across the full chain** - `6925a77` (test)

## Files Created/Modified

- `supabase/migrations/0095_gift_member_leave.sql` - `member_leave_gift_list` RPC: session-resolved identity, scoped delete, uniform oracle (Task 1)
- `supabase/tests/0034_gift_member_leave.sql` - self-only deletion, negatives, rejoin proofs (Task 1)
- `supabase/functions/gift-list-invite/index.ts` - `member-leave` action (user-only, list id only, rate-limited) (Task 1)
- `app/src/modules/cadeaux/api.ts` - `leaveGiftList` helper + `LeaveGiftListResult` (Task 2)
- `app/src/modules/cadeaux/hooks/use-cadeaux.ts` - `useLeaveGiftList` mutation hook (Task 2, supporting plumbing)
- `app/src/modules/cadeaux/cadeaux-page.tsx` - quit button + confirming modal + `handleLeave` (Task 2)
- `app/src/modules/cadeaux/api.test.ts` - list-id-only payload, session path, empty guard, oracle propagation (Task 2)
- `app/src/modules/cadeaux/cadeaux-page.test.tsx` - button only on foreign lists, modal copy, confirm-removes, cancel no-op, oracle copy (Task 2)
- `app/e2e/cadeaux-contacts.spec.ts` - quit visibility/modal/cancel + server-path refusal in demo (Task 3)

## Decisions Made

- Leave scope is caller-shares-only by construction (server-resolved member ids + account email); name-attributed holds stay byte-identical so the audit trail (T-06-15) is stable and rejoin is the existing rate-limited redeem — no new code path
- The quit button reuses the exact `isForeignList` condition as the origin badge: never on own-household lists, never for managers (isManager already requires !isForeignList)
- ConfirmDialog copy is explicit about the three outcomes (list leaves Cadeaux, names kept, link rejoins) rather than a generic "are you sure" — the UAT reporter's confusion was precisely about what quitting does
- e2e asserts the deterministic demo subset only; the successful-leave path is proven by 0034 + Vitest, unreachable without a backend (same doctrine as 06-03/06-07)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] New page tests queried the visible label, but the accessible name comes from aria-label**
- **Found during:** Task 2 verification (5/5 new G-06-1c page tests failed; typecheck green)
- **Issue:** The quit button carries `aria-label="Quitter la liste <nom>"` (good a11y — more context than the visible "Quitter cette liste"), which overrides the accessible name; tests used `{ name: 'Quitter cette liste' }` and could never match
- **Fix:** Positive lookups/clicks use `{ name: /Quitter la liste/ }`; negative absence checks broadened to `{ name: /Quitter/ }` so they prove no quit-flavored button at all (stronger than planned)
- **Files modified:** app/src/modules/cadeaux/cadeaux-page.test.tsx (test-only; implementation untouched)
- **Verification:** cadeaux Vitest 72/72 green
- **Committed in:** dea5f32 (part of task commit)

**2. [Rule 3 - Blocking] e2e preview served a Supabase-baked build hiding the demo entry**
- **Found during:** Task 3 (all 14 e2e failed at demo entry, including pre-existing — environmental, not a regression)
- **Issue:** Gitignored local `.env*.local` bake Supabase config into the preview build, hiding the "Entrer dans la démonstration" entry (known since 06-03)
- **Fix:** Applied the established 06-03 workaround: env files moved aside (md5-verified), Supabase-less build to `/tmp/opencode/dist-demo-06-08`, served on :4174 with `E2E_BASE_URL`, env files restored byte-identical (md5 36de78ab… confirmed), preview stopped, shared `dist/` and :4173 untouched
- **Files modified:** none (ephemeral build artifacts only)
- **Verification:** e2e 14/14 chromium+mobile green
- **Committed in:** 6925a77 (spec only; workaround leaves no repo trace)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both necessary for correctness/proof; no scope creep. File boundaries with concurrent plan 06-09 respected (`gift-share-dialog.tsx` untouched; `hooks/use-cadeaux.ts` plumbing is Task 2's own call path).

## Issues Encountered

- Retry context: prior attempt committed Task 1 (`429f8ff`) then hit a provider rate-limit with Task 2 work uncommitted in the tree. Verified the commit's contents (0095 + Edge + 0034) before resuming; adopted the working-tree Task 2 implementation after fixing its test queries — no committed work duplicated, no conflicts with the concurrently-landed 06-09 commits.
- `pkill -f "vite preview --port 4174"` matched the invoking shell (SIGTERM suicide); retried with a self-excluding `[v]ite` pattern — preview stopped cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-06-1c closed; D-04 redeem/rejoin path unchanged and proven intact by 0034 + e2e
- Blocker for production: rebuild ubuntu1 (migrate 0095 + deploy-functions + recreate functions + rebuild frontend), same as the pending 06-06/06-07 rebuild
- No stubs introduced; no threat-model surface beyond the mitigated T-06-14/T-06-15

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-07*

## Self-Check: PASSED

- SUMMARY present on disk (`.planning` is gitignored — intentionally uncommitted, orchestrator reads from disk)
- Commits `429f8ff`, `dea5f32`, `6925a77` verified in `git log`
- Tracked tree clean; `.planning` untouched by git
