---
phase: 08-messages
plan: "06"
subsystem: database
tags: [postgres, rls, trigger, react, vitest, playwright, messages, join-announcements, solo-notice]

# Dependency graph
requires:
  - phase: 08-messages plan 05
    provides: "Server-enforced frozen archive window (tombstoned reads bounded at own left_at)"
provides:
  - "Server-frozen join announcements (NULL-sender system rows, exactly-once, creation-silent)"
  - "Solo-thread composer notice (display-only, send never gated)"
  - "0042 proof suite: RED-to-green announcement, re-add announcement, rename freeze, negatives"
affects: [08-messages verification, messages UI, future moderation tooling]

actuals:
  tokens: 10300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns: ["Same-transaction xmin rule (founding members share the conversation's founding xid — no clocks, no flags)", "Committed-founding + rolled-back-probes + cleanup test structure (cross-transaction proof without side effects)", "Demo-seam lock test (no client-fabricated announcements)"]

key-files:
  created:
    - supabase/migrations/0103_message_system_join.sql
    - supabase/tests/0042_message_system_join.sql
  modified:
    - app/src/modules/messages/messages-page.tsx
    - app/src/modules/messages/components/chat-panel.tsx
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/messages/types.ts
    - app/src/modules/messages/messages-page.test.tsx

key-decisions:
  - "Creation silence = same founding transaction (NEW.xmin = conversation xmin): exact, clock-free, flag-free; matches D-11's 'present at creation' precisely"
  - "0040/0041 stay byte-identical: their re-inserts share the founding transaction, hence silent by the same rule — no expectation weakened"
  - "0042 spans three transactions (commit founding, rollback probes, commit cleanup) because the positive proof requires distinct xmins; randomized emails + fx purge keep it re-runnable"
  - "Solo notice is display-only from the loaded active registry (leave-gate source); honest present-tense copy (future joiners re-read history)"
  - "Committed on main (single-branch repo, no worktree, direct-main history — same evaluation as 08-01…08-05)"

patterns-established:
  - "xmin comparison in AFTER INSERT triggers distinguishes founding rows from later rows deterministically (no clock, no flag, seed-compatible)"
  - "Multi-transaction SQL suites: T1 commits seeds, T2 rolls back probes, T3 cleans committed rows; ON_ERROR_STOP abort semantics preserved per block"
  - "Comment-only D-11 extensions where the system-row shape and unread exclusion are stated (no logic touched)"

requirements-completed: [D-11]

coverage:
  - id: D1
    description: "A later-added member announces the thread once, frozen at add-time name; founding members (direct and RPC) emit nothing on either side"
    requirement: "D-11"
    verification:
      - kind: integration
        ref: "supabase/tests/0042_message_system_join.sql#later-add announces once, exact frozen text / founding silent direct + RPC / rename freeze"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#annonce d'arrivée centrée / pas d'annonce fabriquée en démo"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-add after leave announces again; the leaver's window covers arrival + departure; re-admitted member writes again (0100 semantics intact)"
    requirement: "D-11"
    verification:
      - kind: integration
        ref: "supabase/tests/0042_message_system_join.sql#re-add announces / partante window reads 2 system / réadmise writes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forged join rows refused at every entry; join rows cause no push queue or fan-out noise; normal history survives"
    requirement: "D-11"
    verification:
      - kind: integration
        ref: "supabase/tests/0042_message_system_join.sql#forgery refused insert/update/delete/adopte / push queue + fan-out 0 / history intact"
        status: pass
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#ligne d'arrivée jamais en non-lu"
        status: pass
    human_judgment: false
  - id: D4
    description: "A single-active-member thread shows a sober composer notice while sending stays fully enabled; absent for two-active and archived threads"
    requirement: "D-11"
    verification:
      - kind: unit
        ref: "app/src/modules/messages/messages-page.test.tsx#solo shows notice and still sends / two-active none / archived none"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-09
plan_head_before: b750168a181319a7b6f772edc6e2e3be5cc5d73b
plan_head_after: 7af76ce5686169c49e470849ccef00d848ce6ec4
status: complete
---

# Phase 08 Plan 06: Join announcements + solo notice Summary

**Later joiners announce themselves once — frozen, unforgable, silent — founding members stay silent by construction, and solo senders get an honest notice without ever being blocked; every 08-03…08-05 guarantee intact, full chain green.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-09T08:40:00Z
- **Completed:** 2026-10-09T08:59:00Z
- **Tasks:** 3/3 complete, 3 commits
- **Gates:** RED baseline proven (later add emits 0 rows pre-0103), static SQL check clean (142 effective functions), DB suite 45/45 incl. 0042, typecheck clean, 31/31 messages Vitest, production build green, e2e cadeaux-contacts 20/20 green

## Accomplishments

- **Task 1 — server (commit b09a94c):** forward-only migration 0103 — `announce_conversation_join()` AFTER INSERT trigger compares `NEW.xmin` to the conversation's founding `xmin` (silent for founders, announces otherwise), writes the 0101 NULL-sender shape (`<nom> a rejoint la conversation`, name snapshotted, `clock_timestamp()`), same REVOKE idiom, `sender_id` comment extended to D-11. Suite 0042 proves RED-to-green (pre-0103 later-add = 0 rows), founding silence for direct seeds AND the real `create_conversation` RPC path on both sides, exactly-once later announcement with exact frozen text, rename freeze, departure interplay (leave at renamed name, stone cleanup mute, re-insert announces again with renamed name, 3 system rows total), leaver window reads (arrival + own departure), forgery refused at all four entries, push queue + fan-out silence with normal-row control, re-admitted write, intact history. 0040/0041 untouched and green — their in-file re-inserts share the founding transaction, silent by the same rule.
- **Task 2 — solo notice (commit d8a3aac):** display-only, zero fetch change — `isSolo` from `memberIdsByConversation` (the leave gate's own active registry, stones excluded) in messages-page, `showSoloNotice` prop into ChatPanel rendering a muted centered `role="status"` line above the composer; send path untouched. Copy is present-tense honest (« aucun autre membre ne peut lire ce message pour l'instant » — future joiners re-read history). D-11 comment extensions where the system shape / unread exclusion / preview fallback are stated (chat-panel, use-messages ×3, types ×2). 3 new Vitest proofs (solo shows + still sends, two-active none, archived none); 28/28 green, typecheck clean.
- **Task 3 — proofs + gate (commit 7af76ce):** 3 more Vitest proofs mirroring the 08-04 leave idioms — join row renders centered/frozen/actionless/author-prefix-free, join-as-latest never marks the thread unread (exact-name button, no unread suffix), and the demo seam is locked (dialog add writes the registry row, no client-fabricated announcement — the server owns it per 0042). Full gate: typecheck, 31/31 messages Vitest, production build, e2e 20/20 on a Supabase-less demo build served on :4176 (env files restored byte-identical md5 `36de78ab…`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove creation silence, then frozen join rows for later adds** - `b09a94c` (feat)
2. **Task 2: Solo notice at the composer** - `d8a3aac` (feat)
3. **Task 3: Proofs and full-chain gate** - `7af76ce` (test)

## Files Created/Modified

- `supabase/migrations/0103_message_system_join.sql` - join trigger, xmin founding rule, D-11 rationale (created)
- `supabase/tests/0042_message_system_join.sql` - three-transaction proof suite (created)
- `app/src/modules/messages/messages-page.tsx` - isSolo + prop threading (modified)
- `app/src/modules/messages/components/chat-panel.tsx` - showSoloNotice prop + muted notice + D-11 comment (modified)
- `app/src/modules/messages/hooks/use-messages.ts` - D-11 comment extensions ×3 (modified)
- `app/src/modules/messages/types.ts` - D-11 comment extensions ×2 (modified)
- `app/src/modules/messages/messages-page.test.tsx` - 6 new D-11 proofs (modified)

## Decisions Made

- Same-transaction (`xmin`) founding rule over age-guard or RPC-flag alternatives: exact (a 3-second-later manual add is not a founder), clock-free (no flaky boundaries), flag-free (no schema/param), and provable both sides. Documented in the migration header and the suite header, including the honest edge (raw-SQL two-transaction founding announces its second batch).
- Old suites byte-identical: no data-driven rule can separate 0040/0041's in-file re-inserts from 0042's later-add (data-identical situations); only the transaction separates them — hence the xmin rule keeps prior proofs valid without weakening a single expectation.
- 0042's three-transaction structure (commit founding / rollback probes / commit cleanup) with randomized e-mails and fx-key purge: re-runnable after any interruption, including the harness's failure-replay double-run (observed: two founding households committed during RED, both cleaned).
- Solo notice from the leave gate's registry (not `participants`, which carries the preview-sender fallback) — the count is exactly the active roster by construction.
- Committed on `main`: single-branch repo, orchestrator spawned no worktree/agent branch (same evaluation as 08-01…08-05).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Invalid fixture color tag broke the RED run before any assertion**
- **Found during:** Task 1 (first 0042 run, pre-migration)
- **Issue:** `testkit.member(..., 'sun')` violates `household_members_color_tag_check` (allowed: accent, ink, coral, amber, violet) — suite aborted at seed line 93.
- **Fix:** Carol's tag → `coral`; the mui color vocabulary has no `sun`.
- **Files modified:** supabase/tests/0042_message_system_join.sql
- **Verification:** re-run reached the intended RED assertion (line 177, attendu 1 obtenu 0)
- **Committed in:** b09a94c (part of task commit)

**2. [Rule 1 - Bug] Vitest text query matched an input's accessible name**
- **Found during:** Task 2 (`getByText(/Écrire un message/)` — inputs carry no text content)
- **Issue:** New two-active test used `getByText` for the composer; the suite idiom is `getByLabelText`.
- **Fix:** One-line query change to `getByLabelText('Écrire un message')`.
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** 28/28 messages Vitest green
- **Committed in:** d8a3aac (part of task commit)

**3. [Rule 1 - Bug] Post-add direct title follows the registry, not the test's assumption**
- **Found during:** Task 3 (demo-seam test: after adding Noé, the log is `Messages de Noé, Lina`, not `Messages de Lina`)
- **Issue:** 3-participant direct resolves its title from registry order (known idiom from the Noé image test).
- **Fix:** Test-only, intent-preserving: query the log by `/Messages de Noé, Lina/`.
- **Files modified:** app/src/modules/messages/messages-page.test.tsx
- **Verification:** 31/31 messages Vitest green
- **Committed in:** 7af76ce (part of task commit)

---

**Total deviations:** 3 auto-fixed (all test/fixture bugs, no prod-behavior change beyond the plan)
**Impact on plan:** All required for the green-suite gate. No scope creep, no new packages, no migration rewrite.

**Plan frontmatter note:** `requirements: [D-04]` in 08-06-PLAN.md looks like a planner carry-over (D-04 = leave, delivered in 08-02); everything this plan proves is D-11 (join-events + solo-notice), recorded above as `requirements-completed: [D-11]`. No STATE/ROADMAP update per dispatch instructions, so no marking was performed either way.

## Issues Encountered

- **RED-run residue (anticipated by design):** the harness replays a failing file for output, so the RED run committed two founding households. Both removed by name (`Foyer Messages Arrivees`, `jarr-%` e-mails) with count-0 verified; the GREEN run needed no cleanup (T3) and the full suite left the base untouched.
- **Stale preview server on :4174:** a leftover 08-05 demo server (dist-demo-0805, pre-08-06 code) still holds the port. Left untouched; the 08-06 demo build was served on :4176 instead and stopped afterwards.
- **e2e demo entry hidden (anticipated pattern):** gitignored `.env*.local` bake a configured Supabase URL, so the 06-03/08-02…08-05 workaround applied again (Supabase-less build to `/tmp/opencode/dist-demo-0806`, preview :4176, 20/20 green, env restored byte-identical md5 `36de78ab…`).
- **HEAD branch guard (pre-commit assertion):** HEAD is on `main`, the repo's only branch. Same evaluation as 08-01…08-05: direct-main commits are normal practice here, proceeded with plain commits.

## Known Stubs

None. No placeholders, empty-value rendering paths, or unwired components in this plan's files. The composer `placeholder=` attribute hit by the stub grep is the input's pre-existing UX hint, not a stub. Demo-mode join emits no server announcement (documented seam, locked by test; proofs of the gate live in 0042).

## Threat Flags

None beyond the plan's threat model. T-08-08 mitigated (trigger-only creation in the 0101 shape, proven refused to clients in 0042; founding-silence rule documented and proven both sides; rename freeze; no push/unread noise). No package added (T-08-SC not triggered).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Messages phase per CONTEXT D-01…D-11 complete: child image fix (08-01), edit/delete/leave/pagination (08-02), sender-only delete + tombstone archives (08-03), leave announcements + icon actions (08-04), frozen archive window + honest copy (08-05), join announcements + solo notice (08-06).
- Invariants for future tooling: founding = same founding transaction (`xmin`); every later INSERT into `conversation_members` announces once (plan for it in any bulk-import or migration touching that table — seed members in the founding transaction or expect announcements); `authenticated` needs no EXECUTE on the join trigger (trigger, not gate); unread/push paths stay system-blind via the NULL-sender marker; solo notice is purely the active-registry count.

---
*Phase: 08-messages*
*Completed: 2026-10-09*

## Self-Check: PASSED

- FOUND: supabase/migrations/0103_message_system_join.sql
- FOUND: supabase/tests/0042_message_system_join.sql
- FOUND commits: b09a94c, d8a3aac, 7af76ce (`git log` verified)
- FOUND client files: messages-page.tsx, chat-panel.tsx, use-messages.ts, types.ts, messages-page.test.tsx
- MEASURED commits from ledger: 3 (plan_head_before b750168 → plan_head_after 7af76ce)
- Effective DB definition verified (`pg_get_functiondef` carries the join text); 0103 recorded in `public.schema_migrations`
- No unintended deletions (`git diff --diff-filter=D` clean for all three task commits); untracked `.claude/` + `.gsd/` pre-exist and were left alone
- .planning/ is gitignored → SUMMARY on disk only, no docs commit; STATE.md / ROADMAP.md untouched per dispatch instructions
