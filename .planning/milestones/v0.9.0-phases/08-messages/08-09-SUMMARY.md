---
phase: 08-messages
plan: "09"
subsystem: database
tags: [postgres, rls, rpc, react, vitest, playwright, messages, tombstone, archive]

# Dependency graph
requires:
  - phase: 08-messages plan 08
    provides: "Trigger-maintained presence periods gating message reads"
provides:
  - "Atomic archive-for-all RPC (mass tombstone at one instant, pre-left bounds untouched)"
  - "0045 proof suite: common instant, read-everyone/write-none, negatives, closed periods, no-destroy"
  - "Client archive control with honest modal (destroy path removed everywhere)"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 34000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns: ["Mass-tombstone archive RPC (single UPDATE at one clock_timestamp, per-row triggers close periods, session-local GUC suppresses N leave announcements in favor of one archive announcement)", "Explicit-TRUE admin guard (coalesce NULL outsider to false — RLS policies never had the hole, procedural IF did)"]

key-files:
  created:
    - supabase/migrations/0106_conversation_archive_all.sql
    - supabase/migrations/0107_archive_admin_null_guard.sql
    - supabase/tests/0045_conversation_archive_all.sql
  modified:
    - supabase/tests/0039_leave_read_delete.sql
    - app/src/modules/messages/api.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/components/chat-panel.tsx
    - app/src/components/shared/icon.tsx
    - app/src/modules/messages/messages-page.tsx
    - app/src/modules/messages/api.test.ts
    - app/src/modules/messages/messages-page.test.tsx

key-decisions:
  - "Policy drop (not DELETE repurposing) retires destruction: RLS default-deny refuses with 0 rows, provable, no surprising DELETE-archives semantics"
  - "Single archive announcement at exactly the common instant (created_at = left_at, includable by <= in every new window) instead of N misleading 'X a quitté' lines, suppressed via transaction-local GUC the RPC sets and unsets"
  - "Pre-left rows never rewritten (WHERE left_at IS NULL): their 0102 bounds and 0105 periods stay byte-identical, proven by text comparison"
  - "Forward-only NULL-guard fix in 0107 (0106 applied, never rewritten): admin check demands explicit TRUE"
  - "0039 destroy section amended to refusal assertions (D-14 retires the contract 0039 proved); 0045 is the canonical archive proof"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01…08-08)"

patterns-established:
  - "Proving a retired destroy path: affected=0 plus existence counts for every vaporized table (conversation + messages + memberships), since RLS refusal is silent"
  - "Random-suffixed fixture emails (0044 pattern) for replay-safe suites with committed transactions; fixed emails collide on the second run"

requirements-completed: [D-08]

coverage:
  - id: D1
    description: "Admin archive tombstones every active member at one instant; pre-left bounds byte-identical; archived thread readable by all ex-members up to their window, writable by none"
    requirement: "D-08"
    verification:
      - kind: integration
        ref: "supabase/tests/0045_conversation_archive_all.sql#instant commun + borne Bob inchangee + lectures + ecritures refusees + periodes fermees"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/api.test.ts#archiveConversation (RPC id-only, local tombstone-all, same instant)"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#honest modal + confirm archives + non-admin sees nothing"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#20/20 on Supabase-less demo build :4176"
        status: pass
    human_judgment: false
  - id: D2
    description: "Destroy path retired everywhere (server policy dropped, client calls removed) with proofs; non-admins archive and destroy nothing"
    requirement: "D-08"
    verification:
      - kind: integration
        ref: "supabase/tests/0045_conversation_archive_all.sql#tentative admin 0 ligne + histoire intacte + 3 negatifs"
        status: pass
    human_judgment: false

duration: 150min
completed: 2026-10-09
plan_head_before: 4d1ac4b247035150de70104e603ecde9d1425998
plan_head_after: 2bbd3d105269a816f83442e36fcdf194cf43315d
status: complete
---

# Phase 08 Plan 09: Archive-for-all Summary

**Admin deletion now freezes the thread for everyone instead of vaporizing it — one atomic RPC tombstones every active member at a single instant, pre-left bounds stay byte-identical, the frozen thread reads in archives and writes for none, and the destroy path is retired with proofs; full chain green.**

## Performance

- **Duration:** ~150 min
- **Completed:** 2026-10-09
- **Tasks:** 3/3 complete, 2 commits (Task 3 verification-only, no diff — same as 08-07/08-08)
- **Gates:** RED baseline proven (admin delete vaporized all: delete = 1, messages = 0, memberships = 0), static SQL check clean (148 effective functions), DB suite 48/48 incl. 0045, typecheck clean, 43/43 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server (commit 8a6d0e1):** forward-only migrations 0106 (`archive_conversation` RPC: in-RPC admin re-verification, single-statement mass tombstone of actives at one `clock_timestamp()`, pre-left rows never rewritten, one archive announcement at exactly the common instant via transaction-local GUC suppression of per-row leave announcements, zero deletes; `conversations_delete` policy dropped) and 0107 (explicit-TRUE admin guard — see deviations). Suite 0045 (six committed transactions, real clocks only): payload `archived_members = 2`, zero actives / three tombstones, one distinct instant for the newly archived + Bob's stone byte-identical, exactly two system lines (Bob's leave + archive, no N-tombstone spam), announcement born at the common instant, nothing vaporized, Alice/Carol read all / Bob reads pre + own announcement only, all writes refused incl. admin, re-archive idempotent, three negatives refused (member, off-thread, outsider), admin DELETE affects 0 rows with history intact, three periods closed each bearing its member's stone. 0039 destroy section amended to refusal (D-14 retires the old contract).
- **Task 2 — client (commit 2bbd3d1):** `archiveConversation` replaces `removeConversationCascade` (RPC with conversation id only; local adapter tombstones all actives at one ISO instant, documented demo seam: no server announcement in demo, as in 0104); hook renamed (`archiveConversation`/`isArchiving`, optimistic tombstone-all with rollback); "Archiver la conversation" button (new `archive` icon) + modal stating the exact outcome (frozen, archives-visible for all, nobody writes — admin included) with "Archiver" label; thread stays selected into read-only archives with toast; last-member copy updated. Proofs: 4 api tests (RPC args exact, error propagation, local same-instant tombstone-all with pre-left untouched, empty no-op) + page tests (honest copy, confirm archives into "Anciennes conversations" read-only, non-admin Thomas sees no control on his seed-stable direct).
- **Task 3 — gate (no commit, verification-only):** typecheck, 43/43 messages Vitest, production build, Supabase-less demo build to `/tmp/opencode/dist-demo-0809` (runtime JS verified Supabase-free — only a sourcemap mentions markers), preview :4176, e2e cadeaux-contacts 20/20, env files restored byte-identical (md5 `36de78ab…` both), preview stopped. No new e2e archive scenario (multi-account server state not deterministically seedable in demo mode — documented limit, not a gap).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove destroy, then atomic archive-for-all** - `8a6d0e1` (feat)
2. **Task 2: Client archive control with honest modal** - `2bbd3d1` (feat)
3. **Task 3: Full-chain gate** - verification-only, no file diff, no commit (working tree clean apart from pre-existing untracked `.claude/` + `.gsd/`)

## Files Created/Modified

- `supabase/migrations/0106_conversation_archive_all.sql` - archive RPC + announce-trigger suppression flag + policy drop + privilege guards (created)
- `supabase/migrations/0107_archive_admin_null_guard.sql` - explicit-TRUE admin guard, forward fix (created)
- `supabase/tests/0045_conversation_archive_all.sql` - six-transaction D-14 proof suite (created)
- `supabase/tests/0039_leave_read_delete.sql` - destroy section rewritten to refusal assertions (modified, deviation Rule 2)
- `app/src/modules/messages/api.ts` - `archiveConversation` replaces `removeConversationCascade` (modified)
- `app/src/modules/messages/hooks/use-messages.ts` - archive mutation with optimistic tombstone-all (modified, adjacent to plan files — the destroy call lived here)
- `app/src/modules/messages/components/chat-panel.tsx` - `onArchiveConversation` prop + label (modified, adjacent — the button lived here)
- `app/src/components/shared/icon.tsx` - `archive` glyph added to the shared set (modified, adjacent — no archive icon existed)
- `app/src/modules/messages/messages-page.tsx` - Archiver modal + toast + selection-kept + copy (modified)
- `app/src/modules/messages/api.test.ts` - 4 D-14 proofs + rpc mock + second active fixture row (modified)
- `app/src/modules/messages/messages-page.test.tsx` - honest-modal + confirm-archives + non-admin proofs (modified)

## Decisions Made

- Policy drop over DELETE repurposing: a DELETE that archives would surprise; a refused DELETE (0 rows, RLS default-deny) is provable. Proven both ways (affected = 0 + full existence counts).
- One archive announcement at exactly the common instant rather than N leave lines or none: the plan's includability condition is met by `<=` equality with no boundary hack, and N "X a quitté" lines would misdescribe a single admin act. Pre-left members correctly don't see it (post-departure content, as ever).
- `clock_timestamp()` (instruction time, as in 0102) for the common instant, not `now()`: a write-then-archive transaction must close the bound after its own writes.
- Re-archive is a no-op success (0 tombstoned, no second announcement), not an error.
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01…08-08).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Outsider passed the 0106 admin guard (three-valued logic hole)**
- **Found during:** Task 1 (first 0045 run: `un exterieur n'archive rien` failed — the RPC succeeded for a non-member)
- **Issue:** `private.is_household_admin` = `household_role(...) = 'admin'`, and `household_role` returns NULL with no member row. `IF NOT NULL` never fires. RLS policies never had this hole (a policy demands TRUE); only the procedural guard did. No corruption resulted (all rows were already tombstoned: 0 touched, no announcement).
- **Fix:** Forward-only migration 0107 (0106 applied, never rewritten): `coalesce(..., false) is not true` demands explicit TRUE. 0045's outsider negative now passes.
- **Files modified:** supabase/migrations/0107_archive_admin_null_guard.sql (created)
- **Committed in:** 8a6d0e1 (part of task commit)

**2. [Rule 2 - Missing critical] 0039 still proved the retired destroy contract**
- **Found during:** Task 1 (dropping `conversations_delete` turns 0039's "admin deletes thread, cascade carries all" red)
- **Issue:** The plan retires destruction but the full-suite-green gate requires every file green. The old contract had to move with the behavior.
- **Fix:** Rewrote the section to refusal assertions (affected = 0 + conversation/messages/memberships intact on the witness thread), header notes 0045 as canonical. Minimal diff, fixture kept.
- **Files modified:** supabase/tests/0039_leave_read_delete.sql
- **Committed in:** 8a6d0e1 (part of task commit)

**3. [Rule 1 - Bug] 0045 fixed fixture emails collided on replay**
- **Found during:** Task 1 (full-suite run after the passing single-file run: `arc-alice@example.fr already exists` — committed transactions leave Auth users behind)
- **Issue:** 0044 suffixes emails with a random tag for exactly this reason; 0045 used fixed emails.
- **Fix:** Random tag suffix + `as_user(user_id, row_id)` single-line form, mirroring 0044. Replay-safe: full suite green twice in a row.
- **Files modified:** supabase/tests/0045_conversation_archive_all.sql
- **Committed in:** 8a6d0e1 (part of task commit)

**4. [Rule 3 - Blocking] Client destroy path lived in files adjacent to the plan list**
- **Found during:** Task 2 (the `removeConversationCascade` call sits in `use-messages.ts`, its button in `chat-panel.tsx` — neither in the plan's file list, but the plan demands no destroy call remains on this flow)
- **Issue:** Editing only the four listed files would leave the destroy path wired.
- **Fix:** Renamed through the hook (`archiveConversation`/`isArchiving`, optimistic tombstone-all) and the panel prop (`onArchiveConversation`, "Archiver la conversation …" label); added the missing `archive` glyph to the shared icon set rather than reusing `trash` for a non-destructive act.
- **Files modified:** use-messages.ts, chat-panel.tsx, icon.tsx
- **Committed in:** 2bbd3d1 (part of task commit)

---

**Total deviations:** 4 auto-fixed (1 three-valued-logic bug + forward fix, 1 retired-contract amendment, 1 replay-safety bug, 1 adjacent-file blocking expansion)
**Impact on plan:** All required for the plan's own gates (full DB suite green, no destroy path remaining). No scope creep, no new packages, no applied-migration rewrite.

## Issues Encountered

- **RED-run residue (anticipated by design):** the throwaway RED proof ran rolled-back, but the first 0045 run committed T1–T3 before failing on the NULL guard. Cleaned via lib-db (`EO_PROJECT_DIR` exported explicitly) + count-0 verified for households and `arc-%` users, twice (after the NULL-guard failure and after the email-collision failure).
- **Non-admin page test needed a seed-stable thread:** Thomas sees no Lina thread (non-member) and `Projet cabane` only exists if earlier tests ran — the isolated run proved it. Used seed-stable `conversation-2` ("Camille" for Thomas) plus 8 s timeouts (shared-DB reads can exceed the 1 s default late in the file).
- **Preview PID killed precisely by port** (`ss -tlnp` → single vite PID 682316), not `pkill -f`. Server verified down by curl afterwards; background shell exited 143 (SIGTERM, expected).
- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL, so the 06-03/08-02…08-08 workaround applied again (Supabase-less build to `/tmp/opencode/dist-demo-0809` — runtime JS verified Supabase-free, only a sourcemap mentions markers — preview :4176, 20/20 green, env restored byte-identical).
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01…08-08: direct-main commits are normal practice here, proceeded with plain commits.
- **Task 3 has no commit:** the gate modified no files (`git status` clean apart from pre-existing untracked `.claude/` + `.gsd/`). Verification-only tasks leave no commit; the measured commit count (2) covers all code changes.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files. Demo-mode archive renders through a documented seam (tombstone-all without the server announcement, locked pattern from 08-04/08-05); the gate proof lives in 0045. Restoration stays an explicit deferred follow-up per D-14, not a stub.

## Threat Flags

None beyond the plan's threat model. T-08-11 mitigated (admin re-verified in-RPC with explicit-TRUE guard proven against member/off-thread/outsider refusals in 0045; only ACTIVE rows tombstoned at one instant; pre-left rows never rewritten — byte-identical proof; non-admin archive refused; destroy retired so no path vaporizes history anymore — admin DELETE affects 0 rows with history intact). No package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase per CONTEXT D-01…D-14 complete: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03), leave announcements + icon actions (08-04), frozen archive window + honest copy (08-05), join announcements + solo notice (08-06), single-update re-admission (08-07), presence-gated gap hiding (08-08), archive-for-all (08-09).
- Invariants for future tooling: `archive_conversation` is the only mass-tombstone path (actor = household admin, explicit TRUE); `conversations_delete` policy must NOT return without re-proving 0045; the `conversation.archive_all` GUC is set/unset inside the RPC only — any future bulk-left_at writer must either accept per-row leave announcements or reuse the flag; every tombstone still closes exactly one open period at the stone (0045 pins it). Re-admission post-archive reopens via the 0104 path unchanged; explicit restoration remains deferred.
- No new e2e archive scenario exists (documented limit): multi-account server state is not deterministically seedable in demo mode; the server proof lives in 0045, the modal/seam proofs in Vitest.

---
*Phase: 08-messages*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: supabase/migrations/0106_conversation_archive_all.sql
- FOUND: supabase/migrations/0107_archive_admin_null_guard.sql
- FOUND: supabase/tests/0045_conversation_archive_all.sql
- FOUND: client archive path (api.ts `archive_conversation` RPC, messages-page.tsx "Archiver" modal, no `removeConversationCascade` on the flow)
- FOUND commits: 8a6d0e1, 2bbd3d1 (`git log` verified)
- MEASURED commits from ledger: 2 (plan_head_before 4d1ac4b → plan_head_after 2bbd3d1)
- Effective DB definition verified (0106+0107 apply cleanly; 0045 green, 0039 amended green, full suite 48/48; static check 148 functions clean)
- No unintended deletions (`git diff --diff-filter=D` clean across both task commits); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- .planning/ is gitignored → SUMMARY on disk only, no docs commit; STATE.md / ROADMAP.md untouched per dispatch instructions
