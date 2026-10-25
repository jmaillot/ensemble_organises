---
phase: 08-messages
plan: "07"
subsystem: database
tags: [postgres, rls, trigger, react, vitest, playwright, messages, rejoin, tombstone]

# Dependency graph
requires:
  - phase: 08-messages plan 06
    provides: "Server-frozen join announcements (NULL-sender system rows, creation-silent via xmin)"
provides:
  - "Single-update re-admission (un-leave) granted to active participants and admins, announced like any later join"
  - "0043 proof suite: RED-to-green re-add, announcement, window lift, fresh bound, negatives, legacy path"
  - "Client re-add via update (online) with api + page proofs"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 11100
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns: ["RLS transition narrowing (USING on OLD row + WITH CHECK on NEW row opens exactly one state transition)", "Reused frozen-announcement shape across a third trigger (leave 0101, join 0103, rejoin 0104 — same NULL-sender, same exclusions)"]

key-files:
  created:
    - supabase/migrations/0104_member_rejoin_clear.sql
    - supabase/tests/0043_member_rejoin.sql
    - app/src/modules/messages/api.test.ts
  modified:
    - app/src/modules/messages/api.ts
    - app/src/modules/messages/messages-page.test.tsx

key-decisions:
  - "Update grant narrowed to the un-leave transition (USING left_at NOT NULL + WITH CHECK left_at NULL) over a plain insert-mirroring grant: forged departures via UPDATE are refused by construction, proven in 0043"
  - "Rejoin announcement is a new AFTER UPDATE trigger reusing the 0103 shape, disjoint from the 0101 leave trigger (each transition has exactly one announcer); creation-silence untouched since un-leave is always a later event"
  - "Client uses direct supabase update online (the data adapter only keys single-id updates, unusable for the composite registry key) and keeps the local two-step in demo (no RLS, no trigger there) — mirrors the leaveConversation mode-branch idiom"
  - "Task 3 produced no file diff (verification-only gate) — 2 commits for 3 tasks, documented below"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01…08-06)"

patterns-established:
  - "Proving an RLS transition grant: REFUSAL evidence for the old two-step (delete→0, insert→denied) stays green before and after; only the new-verb assertion flips RED→green"
  - "Future-dated proof timestamps distort later windows: the T2 gap message (stone1+1min) exceeds stone2, so the fresh-bound proof keys on stone2>stone1 + after2-excluded + pre-included, with the artifact documented in the suite header"

requirements-completed: [D-08, D-11, D-12]

coverage:
  - id: D1
    description: "A non-admin participant re-adds a tombstoned member in one granted update (no delete+recreate), announced once with the frozen name like any later join"
    requirement: "D-12"
    verification:
      - kind: integration
        ref: "supabase/tests/0043_member_rejoin.sql#participant re-add works + announces exact frozen text / admin identical path via legacy"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/api.test.ts#la pierre s'efface en une mise à jour, sans suppression ni recréation"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#réadmet un partant tombé : registre actif, annonce visible, archives allégées"
        status: pass
    human_judgment: false
  - id: D2
    description: "A re-added member reads whole threads again (bound lifted); a later re-leave sets a fresh bound excluding only newer messages"
    requirement: "D-12"
    verification:
      - kind: integration
        ref: "supabase/tests/0043_member_rejoin.sql#re-admise relit avant+creux / seconde pierre > premiere / apres exclu, avant inclus"
        status: pass
    human_judgment: false
  - id: D3
    description: "Outsiders and conversation non-members re-add, add, and forge departures nothing; even grantees cannot tombstone an active member via update"
    requirement: "D-08"
    verification:
      - kind: integration
        ref: "supabase/tests/0043_member_rejoin.sql#outsider/non-membre re-add + faux departs refuses / insertion inchangee refusee"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy archive-removal then re-add still works and announces again; no system row ever enters push queue or fan-out"
    requirement: "D-11"
    verification:
      - kind: integration
        ref: "supabase/tests/0043_member_rejoin.sql#voie historique intacte, nettoyage muet / push queue + ventilateur 0 systeme"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#20/20 on Supabase-less demo build :4176"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-09
plan_head_before: 7af76ce5686169c49e470849ccef00d848ce6ec4
plan_head_after: 809380e0a36a5ade07feb540e56534c6ec5fc046
status: complete
---

# Phase 08 Plan 07: Re-add via left_at clearance Summary

**Departed members return in one granted update — same population as adds, arrival announced like any later join, reads lifted, re-leave re-bounds; the archive-first workaround is over, full chain green.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-09T10:35:00Z
- **Completed:** 2026-10-09T11:35:00Z
- **Tasks:** 3/3 complete, 2 commits (Task 3 verification-only, no diff)
- **Gates:** RED baseline proven (participant un-leave update = 0 rows pre-0104, exact refusal captured), static SQL check clean (143 effective functions), DB suite 46/46 incl. 0043, typecheck clean, 37/37 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server (commit ac34037):** forward-only migration 0104 — `conversation_members_update` policy mirroring the insert grant (`can_join_conversation` + same-household target) narrowed to the un-leave transition (USING `left_at NOT NULL`, WITH CHECK `left_at NULL`), plus `announce_conversation_rejoin()` AFTER UPDATE trigger reusing the 0103 frozen shape (NULL sender, frozen name, `clock_timestamp()`, same push/unread exclusions), disjoint from the 0101 leave trigger. Suite 0043 (three-transaction structure like 0042) proves RED-to-green: two-temps block evidence (Bob delete → 0, re-insert → denied) green before and after, update 0→1 across the migration, exact frozen arrival text, read lift (pre + gap), re-admitted write, fresh bound (stone2 > stone1, after2 excluded, pre included), all negatives (outsider/non-member re-add, forged departures incl. by grantee, unchanged inserts refused), legacy path intact (stone cleanup mute, re-insert announces 2nd arrival, full re-read), push queue + fan-out silence with 4-normal-row control.
- **Task 2 — client (commit 809380e):** `addConversationMembers` re-add path is a single `left_at → null` update online (direct supabase call — the data adapter only keys single-`id` updates, unusable for the composite registry key) and keeps the local two-step in demo (no RLS/trigger there); admin-only comment replaced with the D-12 rationale. New `api.test.ts` (5 proofs: update payload + eqs, no removeWhere/create on that path, inserts for truly-missing rows, server refusal propagated, local path + empty guard) and one `messages-page.test.tsx` proof (tombstoned Camille re-added: single registry row with cleared stone, thread back in the active list with no archived section, seeded 0104-shape arrival renders centered, composer returns). 37/37 messages Vitest, typecheck clean.
- **Task 3 — gate (no commit, verification-only):** typecheck, 37/37 messages Vitest, default production build, Supabase-less demo build served on :4176, e2e cadeaux-contacts 20/20, env files restored byte-identical (md5 `36de78ab…`), preview stopped. No new e2e re-add scenario (multi-account server state not deterministically seedable in demo mode — documented limit, not a gap).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the re-add block red, then granted un-leave with announcement** - `ac34037` (feat)
2. **Task 2: Client re-add via update, proofs** - `809380e` (feat)
3. **Task 3: Full-chain gate** - verification-only, no file diff, no commit (all Task 3 proofs already landed in Task 2's commit; working tree clean)

## Files Created/Modified

- `supabase/migrations/0104_member_rejoin_clear.sql` - update policy (insert-grant population, un-leave transition) + rejoin announcement trigger (created)
- `supabase/tests/0043_member_rejoin.sql` - three-transaction proof suite (created)
- `app/src/modules/messages/api.test.ts` - 5 D-12 client-path proofs (created)
- `app/src/modules/messages/api.ts` - re-add via single update online, local two-step kept (modified)
- `app/src/modules/messages/messages-page.test.tsx` - 1 D-12 roster/announcement/archives proof (modified)

## Decisions Made

- Transition-narrowed grant over plain insert mirroring: USING sees the OLD row, WITH CHECK the NEW row — `left_at NOT NULL → NULL` opens exactly un-leave, so forged departures via UPDATE (by anyone, including grantees) are refused without an extra guard. Proven in 0043 (Bob tombstoning Alice → 0).
- Documented breadth, not closed: `member_id`/`conversation_id` retargeting stays possible in principle, but both sides enforce the same grant and every tombstoned→active transition announces — no silent privilege gain, no silent add. Recorded in the migration header.
- New rejoin trigger (not an extension of the 0101 leave trigger): the two functions have disjoint guards, each transition keeps exactly one announcer, and 0101/0103 stay byte-identical.
- Direct `supabase.from().update().eq().eq()` online instead of extending the data adapter with `updateWhere` (would need interface + two adapters + sync-queue support — out of scope); local path keeps removeWhere+create (no RLS to traverse, no trigger in demo — locked by the 08-06 no-fabrication test).
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01…08-06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing fx ids for gap/back/after2 messages broke the suite before any assertion**
- **Found during:** Task 1 (first 0043 RED run)
- **Issue:** T1 only generated `msg_pre`; the T2 statements referencing `radd_msg_gap/_back/_after2` resolved NULL ids (plus an unescaped apostrophe in `l'absence` broke `format()` quoting).
- **Fix:** Generate all four message ids in the T1 seed block, store them in `fx`, double the apostrophe (`l''''absence` inside the format literal).
- **Files modified:** supabase/tests/0043_member_rejoin.sql
- **Verification:** re-run reached the intended RED assertion (line 217, attendu 1 obtenu 0)
- **Committed in:** ac34037 (part of task commit)

**2. [Rule 1 - Bug] api.test.ts refusal assertion expected the wrong message**
- **Found during:** Task 2 (first api.test run, 4/5 green)
- **Issue:** Test expected the fallback text ('réadhésion') but the code propagates `error.message` when the server provides one — the assertion contradicted the propagate-as-is intent.
- **Fix:** Test-only, intent-preserving: expect the server message ('refus de la politique').
- **Files modified:** app/src/modules/messages/api.test.ts
- **Verification:** 5/5 api.test green, then 37/37 messages green
- **Committed in:** 809380e (part of task commit)

---

**Total deviations:** 2 auto-fixed (both test/fixture bugs, no prod-behavior change beyond the plan)
**Impact on plan:** Both required for the green-suite gate. No scope creep, no new packages, no migration rewrite.

## Issues Encountered

- **RED-run residue (anticipated by design):** the harness replays a failing file, so the RED run committed the T1 founding household. Removed by name + `radd-%` e-mails (count-0 verified); T1 additionally carries a defensive name-based purge so any future interrupted run self-cleans; the GREEN run needed no cleanup (T3) and the full suite left the base untouched.
- **pkill matched its own command string:** stopping the :4176 preview with `pkill -f "vite preview.*4176"` killed the invoking shell (its cmdline contains the pattern) before the env restore ran. Server was down; env files were still in the backup dir and were restored afterwards with plain `mv`, md5-verified identical (`36de78ab…` both). Lesson: match preview servers by port with a self-excluding pattern or kill by stored PID.
- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL, so the 06-03/08-02…08-06 workaround applied again (Supabase-less build to `/tmp/opencode/dist-demo-0807`, preview :4176, 20/20 green, env restored byte-identical).
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01…08-06: direct-main commits are normal practice here, proceeded with plain commits.
- **Task 3 has no commit:** the gate modified no files (`git status` clean — the e2e spec ran unmodified, builds write gitignored `dist/`). Verification-only tasks leave no commit; the measured commit count (2) covers all code changes.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files. Demo-mode re-add emits no server announcement (documented seam, locked by the 08-06 no-fabrication test; proofs of the gate live in 0043).

## Threat Flags

None beyond the plan's threat model. T-08-09 mitigated (grant mirrors the proven insert grant and is further narrowed to the un-leave transition; 0043 proves outsider/non-member re-add, forged departures incl. by grantees, and unchanged-insert refusals refused; announcements reuse the unforgable 0101/0103 NULL-sender shape). No package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase per CONTEXT D-01…D-12 complete: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03), leave announcements + icon actions (08-04), frozen archive window + honest copy (08-05), join announcements + solo notice (08-06), single-update re-admission with announcement (08-07).
- Invariants for future tooling: the registry now has its first UPDATE policy — exactly the un-leave transition for the insert grant's population; any future registry rewrite must preserve the USING/WITH CHECK narrowing or re-prove the negatives. Every tombstoned→active transition announces (INSERT or UPDATE path); founding-xmin silence applies to INSERTs only. `authenticated` needs no EXECUTE on the rejoin trigger (trigger, not gate).
- No new e2e re-add scenario exists (documented limit): multi-account server state is not deterministically seedable in demo mode; the server proof lives in 0043.

---
*Phase: 08-messages*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: supabase/migrations/0104_member_rejoin_clear.sql
- FOUND: supabase/tests/0043_member_rejoin.sql
- FOUND: app/src/modules/messages/api.test.ts
- FOUND commits: ac34037, 809380e (`git log` verified)
- FOUND client files: api.ts (re-add update branch), messages-page.test.tsx (D-12 proof)
- MEASURED commits from ledger: 2 (plan_head_before 7af76ce → plan_head_after 809380e)
- Effective DB definition verified (0104 applies cleanly; 0043 green post-migration, RED pre-migration with exact refusal `attendu 1, obtenu 0`)
- No unintended deletions (`git diff --diff-filter=D` clean across the plan range); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- .planning/ is gitignored → SUMMARY on disk only, no docs commit; STATE.md / ROADMAP.md untouched per dispatch instructions
