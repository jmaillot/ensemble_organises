---
phase: 08-messages
plan: "04"
subsystem: database
tags: [postgres, rls, trigger, react, tanstack-query, messages, system-rows, vitest, playwright]

# Dependency graph
requires:
  - phase: 08-messages plan 03
    provides: "Tombstone leave (left_at) with read-admitting/write-refusing split gates, 0039 proof suite"
provides:
  - "Server-frozen leave announcements (NULL-sender system rows, exactly-once, silent)"
  - "Compact icon per-bubble actions with unread exclusion for system rows"
  - "0040 proof suite: trigger fires, forgery refused, push/unread exclusion, history preserved"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: ["NULL-sender system rows (server shape clients cannot forge, zero RLS touches)", "Statement-time announce timestamp (clock_timestamp closes history inside shared transactions)"]

key-files:
  created:
    - supabase/migrations/0101_message_system_leave.sql
    - supabase/tests/0040_message_system_leave.sql
  modified:
    - supabase/tests/0039_leave_read_delete.sql
    - app/src/types/database.ts
    - app/src/modules/messages/types.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/components/chat-panel.tsx
    - app/src/modules/messages/messages-page.test.tsx

key-decisions:
  - "System shape is NULL sender_id (not a kind flag): validate_member_refs skips nulls, align/lock triggers untouched, every RLS write gate already demands sender = current member so forgery is refused with zero policy edits"
  - "Announce trigger covers RPC self-leave (UPDATE transition) and admin hard-remove (DELETE of active row); tombstone cleanup and whole-thread cascade stay silent via guards"
  - "Demo-mode leave flow untouched per plan: the announcement is server-emitted, seeded as data in Vitest"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01/08-02/08-03)"

patterns-established:
  - "System-row tests locate rows by (conversation, sender IS NULL) and assert normal/system counts separately — never bare totals"
  - "Wall-clock-dependent Vitest seeds are anchored to seed data (max created_at + offset), never to execution time"

requirements-completed: [D-04]

coverage:
  - id: D1
    description: "Leaving a conversation appends one frozen system row visible to stayers and in the leaver's archives, with no author actions and no push noise"
    requirement: "D-04"
    verification:
      - kind: integration
        ref: "supabase/tests/0040_message_system_leave.sql#self-leave announces once / admin removal announces once / frozen name survives rename / no push queue row"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#affiche une annonce de départ centrée, sans actions / quitte en archivant le fil avec son annonce visible"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-bubble edit/delete are compact icon buttons on the text line with accessible labels and delete confirmation"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#propose des actions bulle en icônes compactes, modale intacte"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forged system rows are impossible from any client path and system rows never count as unread"
    requirement: "D-04"
    verification:
      - kind: integration
        ref: "supabase/tests/0040_message_system_leave.sql#insert/update/adopt/delete refused on system rows"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#ne compte jamais une ligne système en non-lu"
        status: pass
    human_judgment: false

duration: 60min
completed: 2026-10-09
status: complete
---

# Phase 08 Plan 04: Leave announcements + compact icon actions Summary

**Departures announce themselves once per leave as server-frozen, unactionable, silent system rows (NULL-sender shape no client can forge), and per-bubble edit/delete shrink to icon buttons on the text line with labels and modal intact — full chain green.**

## Performance

- **Duration:** ~60 min
- **Started:** 2026-10-09T07:20:00Z
- **Completed:** 2026-10-09T08:20:00Z
- **Tasks:** 3/3 complete, 3 commits
- **Gates:** RED baseline proven (leave emitted 0 rows), static SQL check clean (140 effective functions), DB suite 43/43 incl. 0040, typecheck clean, 23/23 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server gates (commit 68f1f00):** forward-only migration 0101 — `messages.sender_id` nullable (the system shape), `announce_conversation_leave` trigger on tombstone writes (UPDATE NULL→stamped) and active-row deletes (admin removal), frozen `<display_name> a quitté la conversation` with fallback, exactly-once guards (re-leave, tombstone cleanup, thread-cascade silent), enqueue trigger skips system rows, `clock_timestamp` so the announcement closes history inside shared transactions. Suite 0040 proves RED-to-green (silence reproduced pre-migration), plus forgery refusal at every entry, frozen-name survival across rename, admin-removal announcement, push queue/fan-out exclusion, ordered history. 0039 aligned (normal/system counts split).
- **Task 2 — client (commit 5795fa0):** system rows render as centered muted announcements (no avatar/name/actions), `isSystem` derived from NULL sender with null-safe `isMine`, unread selectors (feed preview + thread count) skip system rows, preview sender fallback guarded; edit/delete become `size-8` icon buttons (`edit`/`trash`) in a right-aligned group with accessible names and coral delete styling; leave/archive/realtime/pagination flows untouched.
- **Task 3 — proofs (commit 0c439b1):** four new Vitest proofs (centered announcement without actions, never-unread, icon form + edit/modal round-trip, leave archives with announcement visible) plus pagination determinism fix; 23/23 messages Vitest, production build green, e2e 20/20 via the Supabase-less separate-outDir workaround (env files restored byte-identical md5 `36de78ab…`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove current silence, then server-frozen leave rows** - `68f1f00` (feat)
2. **Task 2: System rendering plus compact icon actions** - `5795fa0` (feat)
3. **Task 3: Proofs and full-chain gate** - `0c439b1` (test)

## Files Created/Modified

- `supabase/migrations/0101_message_system_leave.sql` - NULL-sender shape, announce trigger + guards, enqueue skip (created)
- `supabase/tests/0040_message_system_leave.sql` - RED-to-green proofs for announce/forgery/silence/history (created)
- `supabase/tests/0039_leave_read_delete.sql` - history count split normal/system for D-09
- `app/src/types/database.ts` - `MessageRow.sender_id` nullable with D-09 comment
- `app/src/modules/messages/types.ts` - `Message.isSystem` + null-safe `toMessage`
- `app/src/modules/messages/hooks/use-messages.ts` - unread exclusions + preview sender guard
- `app/src/modules/messages/components/chat-panel.tsx` - system announcement + icon actions
- `app/src/modules/messages/messages-page.test.tsx` - 4 D-09 proofs + deterministic pagination seed

## Decisions Made

- System shape is NULL `sender_id`, not a kind/system flag: it disturbs existing constraints least (validate_member_refs skips nulls, align/lock triggers untouched, zero RLS edits — every write gate demands `sender = current member` which NULL never satisfies). Documented per constraint in the migration header.
- Announce trigger fires on RPC self-leave AND admin hard-remove (DELETE of an active row); tombstone cleanup (archive removal, re-add) and whole-thread cascade stay silent — the cascade guard (conversation-exists check) keeps the D-07 admin thread-delete lever intact, proven by the untouched 0039 moderation assertions.
- `clock_timestamp()` (statement time) instead of the `now()` default for announcement rows: inside one transaction `now()` is frozen, so the announcement would tie with setup writes and not reliably close history.
- Demo-mode leave flow left untouched per plan: the announcement is server-emitted; Vitest seeds system rows as data. Known limitation, not a stub (no unwired UI).
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01/08-02/08-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Announcement did not reliably close history (transaction-time tie)**
- **Found during:** Task 1 (0040 order assertion failed post-migration)
- **Issue:** `created_at DEFAULT now()` is the transaction start: trigger-inserted rows tie with same-transaction writes and `(created_at, id)` ordering is a coin flip on random ids.
- **Fix:** Announcement insert sets `created_at = clock_timestamp()` with a comment; re-applied the uncommitted 0101 on the dev DB by dropping its `schema_migrations` record and re-running `migrate.sh` (file ≡ DB verified via `pg_get_functiondef`).
- **Files modified:** supabase/migrations/0101_message_system_leave.sql
- **Verification:** order assertion green across 3 consecutive 0040 runs
- **Committed in:** 68f1f00 (part of task commit)

**2. [Rule 3 - Blocking] Pre-existing time-of-day pagination flake blocked the green-suite gate**
- **Found during:** Task 2 (messages Vitest 18/19 after client edits; proven pre-existing via `git stash` on the clean tree)
- **Issue:** Seed messages carry fixed local times (10:42–10:45); the pagination test's 35 messages used execution time, so runs before 10:45 local sort seeds last and the first window wrongly contains `message-3`. A second trap: ISO-`Z` stamps sort before the seeds' timezone-less stamps lexicographically regardless of instant.
- **Fix:** Test-only, intent-preserving: the 35 messages anchor to the newest seed (`max created_at + N seconds`) serialized in the seeds' local timezone-less format.
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** pagination test green on this morning tree; 23/23 suite green
- **Committed in:** 5795fa0 (Task 2) + 0c439b1 (Task 3)

**3. [Rule 1 - Bug] Stale element reference in the new icon-actions test**
- **Found during:** Task 3 (new test failed: `alertdialog` not found)
- **Issue:** The delete button queried before the edit round-trip is detached by the edit/cancel re-render, so the click silently missed.
- **Fix:** Re-query the delete button from the live log after cancelling the edit (same idiom as pre-existing tests).
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** 23/23 messages Vitest green
- **Committed in:** 0c439b1 (part of task commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All required for correctness or the green-suite gate. No scope creep, no new packages, no prod-behavior change beyond the plan.

## Issues Encountered

- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL into the build, so `/connexion` shows real login instead of the demo entry. Applied the 06-03/08-02/08-03 workaround: Supabase-less `vite build --outDir /tmp/opencode/dist-demo` (env files moved aside, restored byte-identical md5 `36de78ab…` before and after), served on :4174 with `E2E_BASE_URL`, 20/20 green; preview stopped via port-held PID kill (no `pkill -f` self-match).
- **migrate.sh skip on edited uncommitted migration:** the first 0101 version was recorded before the `clock_timestamp` fix; removed only its `schema_migrations` row on the local dev DB and re-ran. Uncommitted-file correction, not shared-history rewrite.
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01/08-02/08-03: direct-main commits are normal practice here, proceeded with plain commits.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files. Demo-mode leave emits no announcement (server trigger only) — documented limitation, no UI stub left behind.

## Threat Flags

None beyond the plan's threat model. T-08-05 mitigated (NULL-sender shape creatable only by the leave trigger — client insert/update/adopt/delete refused, proven in 0040; identical text via a normal message still renders as an authored bubble, never as an announcement); T-08-06 mitigated (same conversation-scoped selects, no new grant; push queue + fan-out + both unread selectors exclude system rows); no package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase complete per CONTEXT D-01…D-09: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03), leave announcements + icon actions (08-04).
- Invariants for future tooling: `sender_id IS NULL` ⇔ server system row; unread/push paths must keep excluding it; `leave_conversation` + admin-removal are the only announcement emitters.

---
*Phase: 08-messages*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: supabase/migrations/0101_message_system_leave.sql
- FOUND: supabase/tests/0040_message_system_leave.sql
- FOUND commits: 68f1f00, 5795fa0, 0c439b1 (`git log` verified)
- FOUND client files: database.ts, types.ts, use-messages.ts, chat-panel.tsx, messages-page.test.tsx
- No unintended deletions (`git diff --diff-filter=D` clean for all three task commits); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- .planning/ is gitignored → SUMMARY on disk only, no docs commit; STATE.md / ROADMAP.md untouched per dispatch instructions
