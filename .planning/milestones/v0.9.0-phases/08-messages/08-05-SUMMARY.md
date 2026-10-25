---
phase: 08-messages
plan: "05"
subsystem: database
tags: [postgres, rls, policy, trigger, react, vitest, playwright, messages, frozen-archives]

# Dependency graph
requires:
  - phase: 08-messages plan 04
    provides: "Server-frozen leave announcements (NULL-sender system rows, exactly-once, silent)"
provides:
  - "Server-enforced frozen archive window (tombstoned reads bounded at own left_at)"
  - "Honest archived copy (frozen-window wording, no live-thread implication)"
  - "0041 proof suite: RED-to-green window, moving window on re-leave, negatives"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 23000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: ["RLS helper-gate function (SECURITY DEFINER, explicit params — avoids correlation shadowing)", "Statement-time leave stamp (clock_timestamp closes history inside shared transactions)", "Announcement born inside the leaver's window (created_at = NEW.left_at)"]

key-files:
  created:
    - supabase/migrations/0102_archive_frozen_window.sql
    - supabase/tests/0041_archive_frozen_window.sql
  modified:
    - app/src/modules/messages/components/chat-panel.tsx
    - app/src/modules/messages/messages-page.tsx
    - app/src/modules/messages/messages-page.test.tsx

key-decisions:
  - "Read bound is per-tombstone left_at evaluated server-side per row (never a client filter, never a global timestamp, never client-supplied)"
  - "Announcement created_at = NEW.left_at so the leaver's own announcement is inside the window by construction; admin-removal case keeps clock (removed member is blind anyway)"
  - "leave_conversation stamps clock_timestamp() so the stone closes history even inside shared transactions"
  - "conversations/members selects unchanged (metadata/roster needed for archive listing, no message content leaks); only messages_select changed"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01…08-04)"

patterns-established:
  - "Correlated EXISTS in RLS USING resolves unqualified names to the inner scope — use a helper-gate function with explicit p_* params instead"
  - "CREATE OR REPLACE preserves privileges — a prior REVOKE needs an explicit GRANT to repair, replace alone does not"
  - "Single-transaction test files freeze now(): post-leave rows need explicit created_at (stone + offset), pre-leave rows need explicit past stamps"
  - "Demo-mode bound seam: spy data.list applying the server predicate with Date (not lexicographic) comparison — documented, never faking the gate"

requirements-completed: [D-08, D-10]

coverage:
  - id: D1
    description: "A left member reads exactly the messages up to their left_at (own announcement included) and nothing newer, enforced server-side"
    requirement: "D-10"
    verification:
      - kind: integration
        ref: "supabase/tests/0041_archive_frozen_window.sql#post-leave invisible / history + announcement visible / forged bypass refused"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#masque au partant le message postérieur à son départ"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-add then re-leave moves the window; archive removal stays full blindness; stayers, push and unread unchanged"
    requirement: "D-08"
    verification:
      - kind: integration
        ref: "supabase/tests/0041_archive_frozen_window.sql#entre-deux enters the new window / post1+post2 stay out / stayers read 4+2 / fan-out excludes / removal blinds"
        status: pass
    human_judgment: false
  - id: D3
    description: "Archived UI states the frozen window honestly instead of implying a live thread"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#annonce des archives figées au départ, pas un fil vivant"
        status: pass
    human_judgment: false

duration: 85min
completed: 2026-10-09
plan_head_before: 0c439b10715a35b29513185ec6c02f1e386fec30
plan_head_after: b750168a181319a7b6f772edc6e2e3be5cc5d73b
status: complete
---

# Phase 08 Plan 05: Frozen archives at departure Summary

**Quitters re-read history up to their own departure instant and nothing newer — bounded server-side per tombstone with a moving window on re-leave — and the archived UI says the window is frozen; every 08-03/08-04 guarantee intact, full chain green.**

## Performance

- **Duration:** ~85 min
- **Started:** 2026-10-09T08:25:00Z
- **Completed:** 2026-10-09T09:50:00Z
- **Tasks:** 2/2 complete, 2 commits
- **Gates:** RED baseline proven (leaver read the post-departure message, 1 row vs 0), static SQL check clean (141 effective functions), DB suite 44/44 incl. 0041, typecheck clean, 25/25 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server bound (commit f0cbd21):** forward-only migration 0102 — `messages_select` rewritten through a `can_read_message` helper gate (active = whole thread, tombstoned = `created_at <= own left_at`, evaluated server-side per row); `leave_conversation` stamps `clock_timestamp()` (statement time closes history inside shared transactions); the 0101 announce trigger births voluntary-leave rows at `NEW.left_at` (own announcement inside the window by construction; admin-removal case keeps clock, the removed member is blind anyway). Suite 0041 proves RED-to-green (live archives reproduced pre-migration), window-1 freeze (history + own announcement in, post-leave out), re-add/re-leave window move (the between-leaves message enters the new window, both post shadows stay out), stayers whole (4 normal + 2 system), push fan-out exclusion, forged bypass refusal (no UPDATE path, no leaver writes), archive-removal blindness. Conversations/members selects audited and kept (metadata/roster for archive listing, no message content). 0039/0040 untouched and green.
- **Task 2 — client (commit b750168):** copy-only, zero fetch-logic change — archived footer now reads « seuls les messages jusqu’à votre départ restent lisibles, sans écriture possible » and the leave modal says the thread stays « figée à votre départ »; composer-absent/actions-absent/leave-again-absent behavior byte-identical. Two new Vitest proofs: frozen-window copy, and a post-departure server message masked in an archived thread via a seam that applies the exact server predicate at `data.list` (documented, never faking the gate). 25/25 messages Vitest, production build green, e2e 20/20 via the Supabase-less separate-outDir workaround (env files restored byte-identical md5 `36de78ab…`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove live archives, then bound left reads at left_at** - `f0cbd21` (feat)
2. **Task 2: Honest archived copy plus full-chain gate** - `b750168` (test)

## Files Created/Modified

- `supabase/migrations/0102_archive_frozen_window.sql` - helper-gate bound, statement-time leave stamp, in-window announcement (created)
- `supabase/tests/0041_archive_frozen_window.sql` - window, moving window, stayers, push, negatives, blindness proofs (created)
- `app/src/modules/messages/components/chat-panel.tsx` - frozen-window archived footer (modified)
- `app/src/modules/messages/messages-page.tsx` - frozen-window leave-modal description (modified)
- `app/src/modules/messages/messages-page.test.tsx` - 2 D-10 proofs (modified)

## Decisions Made

- Bound is the leaver's own tombstone `left_at` per row per leave — never a global timestamp, never client-supplied, evaluated server-side in RLS (per D-10).
- Announcement `created_at = NEW.left_at` on voluntary leave: inside the window by construction instead of overshooting it by microseconds; statement-time stamp on `leave_conversation` keeps it closing history inside shared transactions (same `clock_timestamp` rationale as 08-04).
- Only `messages_select` changed: `conversations_select` (thread metadata) and `conversation_members_select` (roster) stay — the archive listing needs them and neither leaks message content.
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01…08-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Correlated EXISTS shadowed the outer message row (policy admitted everything)**
- **Found during:** Task 1 (0041 still RED + 0002 failing after first 0102 apply; live `pg_get_expr` showed `cm.conversation_id = cm.conversation_id` and `c.created_at <= cm.left_at`)
- **Issue:** Inside the subquery, unqualified `conversation_id` resolved to `cm` (tautology opening neighboring threads) and `created_at` to `c` (thread birth, not message birth).
- **Fix:** Helper-gate function `private.can_read_message(p_conversation_id, p_created_at)` with explicit params; policy top level keeps the 0100 idiom (`conversation_id`/`created_at` unambiguous there). Trap documented in the migration header.
- **Files modified:** supabase/migrations/0102_archive_frozen_window.sql
- **Verification:** live policy definition re-checked, static + full DB suite green
- **Committed in:** f0cbd21 (part of task commit)

**2. [Rule 1 - Bug] REVOKE on the helper gate locked out every reader**
- **Found during:** Task 1 (6 suites red after the shadowing fix, incl. previously-green 0002/0038/0039/0040)
- **Issue:** RLS policy functions execute with the caller's rights — `authenticated` needs EXECUTE (unlike triggers). The copied 0101-style REVOKE denied the gate itself.
- **Fix:** REVOKE replaced by explicit GRANT to `authenticated` (needed twice over: `CREATE OR REPLACE` preserves privileges, so replacing alone did not repair the earlier revoke — also documented in-file).
- **Files modified:** supabase/migrations/0102_archive_frozen_window.sql
- **Verification:** `has_function_privilege(authenticated, …, EXECUTE) = t`, full suite 44/44
- **Committed in:** f0cbd21 (part of task commit)

**3. [Rule 3 - Blocking] Uncommitted-migration re-application for the two fixes above**
- **Found during:** Task 1 (0102 already recorded in local `schema_migrations`)
- **Issue:** Fixes had to reach the dev DB without rewriting shared history.
- **Fix:** 08-04 precedent: 0102 uncommitted and local-only, so dropped only its `schema_migrations` row and re-ran `migrate.sh` (file ≡ DB verified via `pg_get_expr` + privilege check).
- **Committed in:** f0cbd21 (part of task commit)

**4. [Rule 1 - Bug] Demo-seed lexicographic trap in the new bound test**
- **Found during:** Task 2 (archived thread rendered empty under the seam)
- **Issue:** Seeds are timezone-less local, the tombstone ISO-Z — string comparison misordered them (same trap class as 08-04).
- **Fix:** Test-only, intent-preserving: seam compares `Date` objects like the server's `timestamptz`, with a comment citing 08-04.
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** 25/25 messages Vitest green
- **Committed in:** b750168 (part of task commit)

**5. [Rule 1 - Bug] Fixture tombstone predated the fixed seeds (wall-clock dependent)**
- **Found during:** Task 2 (run at 10:25, seeds fixed 10:42–10:45 future → bound correctly hid everything)
- **Issue:** The real leave stamp fell before the fixed seeds, so history legally left the window.
- **Fix:** Test-only, intent-preserving: tombstone re-anchored to `2999-01-01` (seeds inside in all cases, trapped message at 1999-06… `2999-06` still outside); the leave flow itself was already proven above.
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** 25/25 messages Vitest green
- **Committed in:** b750168 (part of task commit)

---

**Total deviations:** 5 auto-fixed (4 bugs, 1 blocking)
**Impact on plan:** All required for correctness or the green-suite gate. No scope creep, no new packages, no prod-behavior change beyond the plan.

## Issues Encountered

- **Footer copy double-match (test-only):** the first footer draft repeated « lecture seule » already carried by the header subtitle, breaking a pre-existing `getByText`. Reworded the footer to avoid the duplication (« seuls les messages jusqu’à votre départ… ») instead of touching the old test — old suite green unchanged.
- **Transient `npm error enoent` on the Task 2 commit command:** the piped `npm run typecheck | tail` masked it and the commit proceeded; immediate clean re-run of `npm run typecheck` exited 0 on the committed tree — environmental blip, no code impact.
- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL, so the 06-03/08-02/08-03/08-04 workaround applied again (Supabase-less build to `/tmp/opencode/dist-demo-0805`, preview :4174, 20/20 green, env restored byte-identical md5 `36de78ab…`).
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01…08-04: direct-main commits are normal practice here, proceeded with plain commits.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files. Demo-mode leave emits no server announcement and applies no RLS bound (documented seams, Vitest mirrors the predicate; proofs of the gate live in 0041).

## Threat Flags

None beyond the plan's threat model. T-08-07 mitigated (per-tombstone bound server-side, 0041 proves newer rows invisible while history + announcement stay; window moves on re-leave; forged bypass refused — UPDATE path absent, leaver writes denied); no package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase per CONTEXT D-01…D-10 complete: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03), leave announcements + icon actions (08-04), frozen archive window + honest copy (08-05).
- Invariants for future tooling: tombstoned reads are `created_at <= own left_at` via `can_read_message` (any new message-fetch path inherits it through RLS); `leave_conversation` stamps statement time; own announcement shares the leave instant; unread/push paths stay active-only; `authenticated` must keep EXECUTE on the gate.

---
*Phase: 08-messages*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: supabase/migrations/0102_archive_frozen_window.sql
- FOUND: supabase/tests/0041_archive_frozen_window.sql
- FOUND commits: f0cbd21, b750168 (`git log` verified)
- FOUND client files: chat-panel.tsx, messages-page.tsx, messages-page.test.tsx
- MEASURED commits from ledger: 2 (plan_head_before 0c439b1 → plan_head_after b750168)
- No unintended deletions (`git diff --diff-filter=D` clean for both task commits); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- .planning/ is gitignored → SUMMARY on disk only, no docs commit; STATE.md / ROADMAP.md untouched per dispatch instructions
