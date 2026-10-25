---
phase: 06-cadeaux-invites
plan: 01
subsystem: database
tags: [postgres, rls, edge-functions, gift-lists, anonymous-reservation, oracle, zod, deno]

# Dependency graph
requires:
  - phase: 05-cadeaux-contacts
    provides: gift_lists/gift_items schema, gift_list_invites RPC family (0079), masked view (0080), reserve guard (0083), gift-list-invite Edge user-only
provides:
  - Anonymous reservation data layer (reserved_by_name + mutual exclusion, guest RPCs, extended mask + guard)
  - Publishable Edge guest-view/guest-reserve actions with rate limits and oracle-preserving errors
  - Proof suite 0029 (oracle uniformity, masking, release, D-09 confusion)
affects: [06-02-email, 06-03-guest-ui, gift-share-dialog, guest-cadeau-page]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 12500
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [service_role-only guest RPCs with pessimistic locks, boolean-only guest payload projection, client-guard server bypass via auth.uid() NULL]

key-files:
  created:
    - supabase/migrations/0089_gift_guest_reserve.sql
    - supabase/tests/0029_gift_guest.sql
  modified:
    - supabase/functions/gift-list-invite/index.ts
    - supabase/tests/0001_schema_contract.sql

key-decisions:
  - "Task 1 pre-approved by human before dispatch: nullable text column beside member FK + mutual exclusion; reserves never consume use_count; guest payload reserved-boolean only; release is manager UPDATE, no RPC"
  - "Guest view takes no row lock (point-in-time read); only reserve locks invite + item rows (T-06-02)"
  - "Guard server bypass keys on auth.uid() NULL (service_role JWT has no sub), following the 0081 motif — proven by running server-path proofs before any as_user claims exist"
  - "Manager release proven on readable lists only (owner on private, admin on foyer): PG applies the SELECT policy to UPDATE row lookup, so an admin cannot release on another's private list"

patterns-established:
  - "Server-path SQL proofs run before the first testkit.as_user in a test file (claims persist transaction-wide and would turn server calls into client calls)"
  - "CREATE OR REPLACE VIEW appends new columns at the end (positional matching), never mid-list"

requirements-completed: [D-05, D-06, D-07, D-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Anonymous reserve data layer: column, guest RPCs, masked view, guard (D-05/D-06/D-07/D-08)"
    requirement: "D-05"
    verification:
      - kind: integration
        ref: "sh scripts/test-db.sh 0029"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh (full suite 32/32)"
        status: pass
      - kind: other
        ref: "python3 scripts/check-sql-statique.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edge guest-view/guest-reserve wired, rate-limited, deployed to local runtime"
    requirement: "D-06"
    verification:
      - kind: other
        ref: "sh scripts/deploy-functions.sh && handler count gate (9 guest-reserve refs)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Edge live HTTP behavior (oracle mapping, payload shape over the wire)"
    verification: []
    human_judgment: true
    rationale: "No Edge runtime HTTP test exists; translator branches and payload projection are proven only by SQL-layer proofs plus review. Covered end-to-end by the guest UI journey in 06-03."

# Metrics
duration: 15min
completed: 2026-10-06
status: complete
---

# Phase 06 Plan 01: Anonymous Reservation Tracer Summary

**Anonymous gift reservation end-to-end at data + Edge layer: `reserved_by_name` column, service_role-only guest RPCs, masked view, extended guard, publishable Edge actions — proven by 40+ SQL assertions, full suite green**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-06T14:24:34Z
- **Completed:** 2026-10-06T14:39:04Z
- **Tasks:** 3 (1 pre-approved decision + tracer + Edge)
- **Files modified:** 4

## Accomplishments

- Migration 0089: `reserved_by_name` (trimmed 1–80 CHECK) + mutual-exclusion constraint, `guest_view_gift_list` / `guest_reserve_gift_item` RPCs (SECURITY DEFINER, empty search_path, service_role-only, unique `code invalide` oracle, pessimistic locks, use_count never consumed), masked-view extension (owner sees NULL), guard extension (clients touching the column get 42501, server path bypasses on NULL identity)
- Proof suite 0029 (~40 real assertions): oracle uniformity on both RPCs (unknown/malformed/expired/exhausted/revoked), name bounds with distinct non-oracle messages, no inter-list leakage, happy path + idempotent same-name + 409 conflict, three-role masked-view reads, manager release of both author forms, non-manager release refusal, D-09 same-name confusion documented behaviorally
- Edge `gift-list-invite`: `guest-view` / `guest-reserve` publishable actions dispatched before the user gate, rate limits (send-email 5, guest-view 30, guest-reserve 10), Zod guest schemas, translator branches (400 invalid-name, 409 already-reserved, byte-identical 404 oracle), defensive boolean-only payload projection; member/account paths untouched; deployed to local runtime
- Full SQL suite 32/32 green + static SQL check green; 0001 schema contract extended with the new column

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the anonymous-author schema (D-05 one-way)** — pre-approved by human before dispatch (all four choices locked); no commit
2. **Task 2: End-to-end anonymous reserve in SQL** - `45675f2` (feat)
3. **Task 3: Edge guest-view and guest-reserve publishable actions** - `a0467d3` (feat)

**Plan metadata:** (this SUMMARY commit, docs scope — STATE.md/ROADMAP.md owned by orchestrator, untouched)

## Files Created/Modified

- `supabase/migrations/0089_gift_guest_reserve.sql` - Anonymous-author column, guest RPCs, extended view + guard, privilege lockdown
- `supabase/tests/0029_gift_guest.sql` - Tracer proof suite (oracle, masking, release, D-09)
- `supabase/functions/gift-list-invite/index.ts` - Guest actions, rate limits, translator branches, payload projection
- `supabase/tests/0001_schema_contract.sql` - Contract allowlist learns `reserved_by_name`

## Decisions Made

- Task 1's four schema choices arrived pre-approved; executed exactly as locked (see key-decisions above)
- Guest view takes no row lock (read-only point-in-time); reserve locks invite + item rows against concurrent double-reserve
- Guard server bypass keys on `auth.uid() IS NULL` rather than role names (works for service_role in prod and claim-free test sections; follows the 0081 motif)
- Manager-release proofs scoped to readable lists (owner→private, admin→foyer) after discovering PG applies the SELECT policy to UPDATE row lookup — an admin cannot touch another's private list even for release

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CREATE OR REPLACE VIEW column ordering**
- **Found during:** Task 2 (migration apply)
- **Issue:** New column inserted mid-list renamed `purchased` positionally (error 42P16) — REPLACE matches columns by position, not name
- **Fix:** Appended `reserved_by_name` at end of the SELECT list with a comment explaining the rule; consumers select by name (verified via grep)
- **Files modified:** supabase/migrations/0089_gift_guest_reserve.sql
- **Verification:** `sh scripts/migrate.sh` applies 0089 cleanly
- **Committed in:** 45675f2 (part of task commit)

**2. [Rule 1 - Bug] Admin release test targeted an unreadable private list**
- **Found during:** Task 2 (suite run — "l'admin libère une réserve membre" got 0 rows)
- **Issue:** Test asked an admin non-owner to UPDATE a private list's item; PG applies the SELECT policy (`can_read_gift_list`) to UPDATE row lookup, so the row was RLS-filtered (EXPLAIN confirmed). Product-correct: admins can't read others' private lists
- **Fix:** Fixture gained a `foyer` list + item + code (h6); admin releases the anonymous hold there, owner releases both forms on the private list — covering both manager branches (admin-non-owner, owner-non-admin)
- **Files modified:** supabase/tests/0029_gift_guest.sql
- **Verification:** `sh scripts/test-db.sh 0029` green, then full suite 32/32 green
- **Committed in:** 45675f2 (part of task commit)

**3. [Rule 2 - Missing Critical] Schema contract allowlist update**
- **Found during:** Task 2 (full suite run — 0001 flagged `reserved_by_name` as unexpected)
- **Issue:** 0001_schema_contract enumerates gift_items columns exactly; any schema change must evolve the contract or the suite stays red
- **Fix:** Added `reserved_by_name` to the gift_items column array
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Verification:** Full suite 32/32 green
- **Committed in:** 45675f2 (part of task commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All required for correctness/green suite. No scope creep — no new packages, no UI, no send-email (06-02).

## Issues Encountered

- `CREATE OR REPLACE VIEW` positional column matching (see deviation 1) — worth remembering for every future view extension
- SELECT-policy-on-UPDATE filtering (see deviation 2) — constrains where manager writes are testable/provable on private lists; no product change needed
- Debug probe file `9999_debug.sql` created during diagnosis, deleted before committing (never committed)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Tracer slice proven at data + Edge layer; UI expansion (06-03) can build on `guest-view`/`guest-reserve` contract `{ listId, listName, items[{id,name,price,comment,reserved}] }` / `{ itemId, alreadyReserved }` with 404-oracle / 400-name / 409-conflict errors
- `send-email` rate-limit entry (5/min) already in LIMITS; handler lands in 06-02
- Edge live HTTP behavior (D3) has no automated proof — covered by 06-03's guest journey; Inbucket/SMTP proof belongs to 06-02

---
*Phase: 06-cadeaux-invites*
*Completed: 2026-10-06*

## Self-Check: PASSED

- Migration, test suite, Edge file, SUMMARY all present on disk
- Commits 45675f2 (tracer SQL) and a0467d3 (Edge) exist in history
- Untracked `.claude/` / `.gsd/` are pre-existing environment dirs, untouched
