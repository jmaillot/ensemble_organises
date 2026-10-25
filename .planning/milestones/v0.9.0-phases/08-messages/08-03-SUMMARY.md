---
phase: 08-messages
plan: "03"
subsystem: database
tags: [postgres, rls, react, tanstack-query, messages, tombstone, vitest, playwright]

# Dependency graph
requires:
  - phase: 08-messages plan 02
    provides: "Per-bubble edit/delete/leave affordances with modal confirmation, paged threads, 17/17 messages Vitest"
provides:
  - "Sender-only single-message delete enforced in RLS (admin branch dropped) and UI (own bubbles only)"
  - "Tombstone leave: leavers keep read-only archived history under 'Anciennes conversations', self-removable"
  - "0039 proof suite: sender-only delete, tombstone read-only, roster exclusion, archive removal, re-add"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 20686
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: ["Tombstone membership (left_at) with read-admitting / write-refusing split gates", "Local visibility filter mirroring the server read gate for Supabase-less demo parity"]

key-files:
  created:
    - supabase/migrations/0100_message_sender_delete_tombstone.sql
    - supabase/tests/0039_leave_read_delete.sql
  modified:
    - supabase/tests/0001_schema_contract.sql
    - supabase/tests/0038_conversation_matrix.sql
    - app/src/modules/messages/api.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/messages-page.tsx
    - app/src/modules/messages/components/chat-panel.tsx
    - app/src/modules/messages/components/conversation-list.tsx
    - app/src/modules/messages/messages-page.test.tsx
    - app/src/modules/messages/types.ts
    - app/src/types/database.ts
    - app/src/lib/data/seed.ts

key-decisions:
  - "Admin single-delete removed end to end; whole-thread delete stays the moderation lever (D-07)"
  - "leave_conversation RPC tombstones self membership (idempotent); admin removing someone else keeps existing hard semantics, documented in migration"
  - "Roster-style reads and push fan-out count active rows only; stayers see zero behavior change (D-08)"
  - "Re-add revives the tombstone via admin/participant-gated path; the leaver alone cannot re-add themselves"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01/08-02)"

patterns-established:
  - "Archive-removal tests assert the tombstone row is gone while sibling rows survive (personal cleanup, never thread deletion)"
  - "Demo-mode feed filters threads to those with an own membership row, mirroring the RLS conversations_select gate"

requirements-completed: [D-03, D-04]

coverage:
  - id: D1
    description: "Only a message's sender deletes it; admin single-delete refused, admin whole-thread delete still works"
    requirement: "D-03"
    verification:
      - kind: integration
        ref: "supabase/tests/0039_leave_read_delete.sql#sender deletes own / admin single-delete refused / thread delete allowed"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#delete affordance own-only + thread-delete lever present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Leaving tombstones membership: leaver re-reads history read-only in archives, removes it from own archives, never rewrites"
    requirement: "D-04"
    verification:
      - kind: integration
        ref: "supabase/tests/0039_leave_read_delete.sql#leaver reads history / send-edit refused / roster excludes leaver / own-tombstone delete / admin re-add"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#retire un fil quitté de ses archives + exclut le partant du registre actif"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-08
status: complete
---

# Phase 08 Plan 03: Sender-only delete + tombstone leave Summary

**Single-message delete is sender-only end to end (RLS + UI, admin thread-delete intact) and leaving tombstones membership so leavers keep a read-only archived history they can drop from their own archives — stayers notice nothing, all gates green.**

## Performance

- **Duration:** ~45 min retry execution (Tasks 1–2 inherited committed from the pre-rate-limit attempt, Task 3 finished here)
- **Started:** 2026-10-08T18:00:00Z (retry dispatch)
- **Completed:** 2026-10-08T18:45:00Z
- **Tasks:** 3/3 complete, 3 commits
- **Gates:** static SQL check clean (139 effective functions), DB suite 42/42 incl. 0039, typecheck clean, 19/19 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server gates (commit e35d66a, prior attempt):** forward-only migration 0100 — `messages_delete` sender-only (admin branch dropped, whole-thread cascade path verified independent), `conversation_members.left_at` tombstone, `leave_conversation` self-leave RPC (idempotent), reads admit left members while all writes require active membership, push fan-out active-only. Suite 0039 proves RED-to-green (admin delete-other refused, leaver read-allowed/write-refused, roster exclusion, own-tombstone delete, admin re-add); 0001 contract and 0038 aligned to D-07/D-08.
- **Task 2 — client (commit 987adb0, prior attempt):** per-bubble delete on own messages only (admin-on-others branch dropped, admin whole-thread delete kept), « Anciennes conversations » archived section rendering left threads read-only (no composer, no edit/delete/leave/add), « Retirer de mes archives » with modal confirmation deleting the own tombstone row; rosters/unread active-only; `addMembers` revives tombstones (server-gated).
- **Task 3 — proofs (commit eabaaa6, this session):** visibility filter in `useMessagesFeed` (threads without an own membership row hidden locally, mirroring RLS), archive-removal and roster-exclusion tests, thread-delete lever assertion, Noé pre-mount membership seed for stable titles. 19/19 messages Vitest, full chain green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove current state red, then sender-only delete plus tombstone leave** - `e35d66a` (feat, prior attempt — verified present, not duplicated)
2. **Task 2: Client sender-only affordances plus archived section** - `987adb0` (feat, prior attempt — verified present, not duplicated)
3. **Task 3: Proofs and full-chain gate** - `eabaaa6` (test, this session)

## Files Created/Modified

- `supabase/migrations/0100_message_sender_delete_tombstone.sql` - sender-only delete, left_at tombstone, leave RPC, read/write gate split (created)
- `supabase/tests/0039_leave_read_delete.sql` - RED-to-green proofs for delete + tombstone + re-add (created)
- `supabase/tests/0001_schema_contract.sql` - contract aligned to D-07/D-08
- `supabase/tests/0038_conversation_matrix.sql` - matrix aligned to sender-only delete + tombstone leave
- `app/src/modules/messages/api.ts` - tombstone leave/archive-removal verbs, active-only consumers
- `app/src/modules/messages/hooks/use-messages.ts` - archived feed split, visibility filter mirroring the server read gate
- `app/src/modules/messages/messages-page.tsx` - archived section wiring, read-only panel, archive-removal modal
- `app/src/modules/messages/components/chat-panel.tsx` - own-only delete affordance, read-only archived rendering
- `app/src/modules/messages/components/conversation-list.tsx` - « Anciennes conversations » section
- `app/src/modules/messages/messages-page.test.tsx` - archive-removal, roster-exclusion, thread-lever proofs (19/19)
- `app/src/modules/messages/types.ts`, `app/src/types/database.ts`, `app/src/lib/data/seed.ts` - left_at typing + demo seed support

## Decisions Made

- Admin single-delete removed end to end (RLS + UI); whole-thread delete stays the documented moderation lever per D-07.
- Leave tombstones (`left_at`) instead of deleting the row; self-leave is idempotent via RPC; admin removing someone else keeps existing hard semantics, documented in the migration per D-08.
- Roster-style reads, unread counts, and push fan-out count active rows only — stayers see zero behavior change.
- Re-add revives the tombstone through the admin/participant-gated path; the leaver alone cannot re-add themselves.
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01/08-02).

## Deviations from Plan

None - plan executed as written across the two attempts. The retry inherited Tasks 1–2 as committed (verified via `git show --stat`, not redone) and completed only the uncommitted Task 3 remainder. One Rule 3-class fix from the prior attempt's Task 3 remainder, committed here:

### Auto-fixed Issues

**1. [Rule 1 - Bug] Archive-removed threads resurfaced as active in demo mode**
- **Found during:** Task 3 (prior attempt's uncommitted remainder)
- **Issue:** After own-tombstone deletion the thread has no membership row; online the RLS `conversations_select` gate hides it, but the local demo adapter has no such gate, so the thread resurfaced in the active list.
- **Fix:** `useMessagesFeed` filters conversations to those with an own membership row (active or tombstoned), mirroring the server read gate; comment cites the parity rationale.
- **Files modified:** app/src/modules/messages/hooks/use-messages.ts
- **Verification:** archive-removal test asserts the Lina thread disappears entirely; 19/19 green
- **Committed in:** eabaaa6 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required for demo/online parity of the archive-removal truth. No scope creep, no SQL, no new packages.

## Issues Encountered

- **Retry dispatch (provider rate-limit on first dispatch):** prior attempt had committed Tasks 1–2 and left Task 3 partial work dirty in the tree. Verified via `git log`/`git diff` that e35d66a + 987adb0 cover Tasks 1–2, adopted the dirty Task 3 remainder as-is, finished the chain, committed. No work duplicated.
- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL into the build, so `/connexion` shows real login instead of the demo entry. Applied the 06-03/08-02 workaround: Supabase-less `vite build --outDir /tmp/opencode/dist-demo` (env files moved aside, restored byte-identical md5 `36de78ab…` before and after), served on :4174 with `E2E_BASE_URL`, 20/20 green; preview stopped by port kill (no `pkill -f` self-match).
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01/08-02: direct-main commits are normal practice here, proceeded with plain commits.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files (the single `placeholder` grep hit is TanStack Query's `placeholderData` API, not a UI stub).

## Threat Flags

None beyond the plan's threat model. T-08-03 mitigated (admin branch dropped from `messages_delete`, 0039 proves refusal, UI no longer renders it, thread delete intact); T-08-04 mitigated (left reads reuse conversation-scoped selects, writes require active, roster/push active-only); no package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase complete per CONTEXT D-01…D-08: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03).
- `leave_conversation` RPC and `left_at` semantics are the contract for any future moderation or re-invite tooling: active-only counting is the invariant to preserve.

---
*Phase: 08-messages*
*Completed: 2026-10-08*

## Self-Check: PASSED

- FOUND: supabase/migrations/0100_message_sender_delete_tombstone.sql
- FOUND: supabase/tests/0039_leave_read_delete.sql
- FOUND: app/src/modules/messages/api.ts, hooks/use-messages.ts, messages-page.tsx, chat-panel.tsx, conversation-list.tsx, messages-page.test.tsx
- FOUND commits: e35d66a, 987adb0, eabaaa6 (`git log` verified)
- No unintended deletions (`git diff --diff-filter=D` clean for the task commit); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- STATE.md / ROADMAP.md untouched per dispatch instructions
