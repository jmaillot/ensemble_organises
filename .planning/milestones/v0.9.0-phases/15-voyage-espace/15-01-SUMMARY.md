# Phase 15 Plan 01: Trip Workspace Server Foundation Summary

---
phase: 15-voyage-espace
plan: 01
subsystem: voyages-server
tags: [trips, rls, rpc, hmac-invites, edge-functions, guest-expenses, soft-close]
status: complete
requires: [phase-14-enfant-perimeter, ardoise-guest-settlement-0064, gift-invites-0079]
provides: [trip-schema-rls, create-trip-atomic-rpc, trip-invite-edge, guest-expense-path]
affects: [15-02-creation-flow, 15-03-tabs, 15-04-budget, 15-05-e2e]
tech-stack:
  added: []
  patterns: [hmac-invite-oracle-mirror, security-definer-server-rpc, trip-member-conjunct-rls, soft-close-no-cascade]
key-files:
  created:
    - supabase/migrations/0118_trip_workspace.sql
    - supabase/tests/0053_trip_workspace.sql
    - supabase/functions/trip-invite/index.ts
    - supabase/functions/trip-invite/child-guard.ts
    - supabase/functions/trip-invite/child-guard.test.ts
  modified:
    - supabase/tests/0001_schema_contract.sql
    - supabase/tests/0048_flat_tables_isolation.sql
    - supabase-project/docker-compose.traefik.yml
decisions:
  - "Trip creation is RPC-only for members (direct PostgREST insert is admin-only): naked trips without participants/linked ardoise cannot exist"
  - "Trip-guest ticket is the ONLY guest credential (SHA-256); the ardoise mirror row carries ticket NULL under the SAME id — no name-based resolution"
  - "Close is participant-or-admin, reopen is admin-only; is_closed/created_by are server flags (client-immutable trigger)"
  - "Trip invite management (create/revoke/summary) is admin-OR-participant (gift lists were owner-or-admin — trips are collaborative)"
metrics:
  duration: ~26min
  completed: 2026-10-12
  tasks: 3
  commits: 3
plan_head_before: c345c33
plan_head_after: 51069e4c4a823ba9921684735a223e3696fd33d1
actuals:
  tokens: 46000
  tasks: 3
  commits: 3
---

## One-liner

Trip workspace server foundation: isolated trip RLS, atomic create-trip RPC with linked ardoise, HMAC invite oracle, ticket-guarded guest expense path, and soft-close — all proven by 55/55 SQL suites plus live Edge smoke.

## What was built

**Task 1 (tracer, aef7507)** — Schema + RLS isolation in `0118_trip_workspace.sql`:
`trips.created_by/tab_state/is_closed`, `ardoises.trip_id` UNIQUE, nullable
`trip_id` on shopping_lists/notes/tasks/places (never expenses), new
`trip_members` / `trip_guests` / `trip_invites` (HMAC-only, no client access),
`is_trip_member` conjunct on every policy of trips + the 4 tables (foyer rows
with `trip_id NULL` keep their historic regime), alignment anti-forge triggers,
task-assignee range trigger, ardoise same-foyer link trigger, frozen-trip
household guard, additive Realtime (`trip_members`, `trip_guests` — invites
stay out), fresh-start DELETE of user trips (demo `trip-1` preserved).
Suite `0053` stage 1: member round-trip, per-table cross-trip/inter-foyer
negatives, admin-sees-without-participating, enfant exclusion.
RED probe (rolled-back scratch txn): without the trips conjunct a
non-participant reads the trip (voyage=1); with 0118, 0.

**Task 2 (auto, d11b620)** — RPCs in the same file (single forward-only file):
`create_trip_atomic` (trip + members + linked ardoise + synced enrollments,
one transaction), `trip_leave` (dual removal, uniform `quitter impossible`
oracle), `trip_close`/`trip_reopen` (freeze without cascade, reopen admin-only),
invite family (`create/revoke/summary/redeem` mirroring 0079 bounds and oracle),
`verify_trip_ticket`, `create_trip_guest_expense` (guest-paid expense on the
linked ardoise, parts validated by the existing ardoise perimeter).
All `service_role`-only (contract-asserted in 0001). Suite `0053` stage 2:
real late-failure atomicity (150-char name passes the trip check, breaks the
ardoise check → zero orphan trips), double-join idempotence with stable
`use_count`, 6-way oracle uniformity (unknown = malformed = expired = revoked
= exhausted = enfant), guest expense round-trip, leave/close/reopen lifecycle.
Contract `0001` + isolation `0048` updated to the overturned trip model.

**Task 3 (auto, 51069e4)** — Edge `trip-invite` (byte-motif copy of
ardoise/gift-invite, dedicated `x-trip-guest` CORS header): `create-trip`,
`create`, `revoke`, `summary`, `join`, `redeem-guest`, `guest-view`,
`link-view` (both read-only, no `use_count` consumption), `member-leave`,
`guest-expense-create`; `child-guard.ts` + 4 Vitest proofs; secret
`TRIP_INVITE_HMAC_SECRET` wired in prod override (`traefik.yml`) and local
override (`secrets.yml`) + generated into local `.env`. Deployed, functions
service healthy. Live smoke on the local stack: uniform 404 oracle on member
join AND guest redeem, 404 on bad ticket, 401 anonymous, 403 no-foyer —
all against real JWTs.

## Verification

- `python3 scripts/check-sql-statique.py` → 170 functions, 0 défaut
- `sh scripts/test-db.sh` → **55/55 green** (0053 included, negatives per table)
- `sh scripts/deploy-functions.sh` + `run.sh recreate functions` → Healthy
- `cd app && npm run typecheck` → clean
- `npx vitest run ../supabase/functions/trip-invite/child-guard.test.ts` → 4/4
- `npx vitest run src/modules/voyages` → 13/13 (no frontend regression)
- Live Edge smoke (throwaway accounts `smoke-trip@example.com`,
  `smoke-trip2@example.com` — purge manually like prior smoke runs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `is_trip_member` admin branch required a member row**
- **Found during:** Task 2, via fallout suite 0048 (admin read 0 on a memberless trip)
- **Issue:** The admin branch lived inside the `trip_members` EXISTS, so a trip
  with zero participants was invisible even to admins — breaking D-07.
- **Fix:** Admin check split into an independent EXISTS on `trips` (no member
  row needed); 0053 asserts admin reads on memberless trips.
- **Files:** `0118_trip_workspace.sql`

**2. [Rule 1 - Bug] Unqualified pgcrypto calls (stale-text trap, AGENTS.md §2.7A.2)**
- **Found during:** Task 2, first 0053 stage-2 run (`gen_random_bytes does not exist`)
- **Issue:** Copied 0058's original text; the EFFECTIVE definition (0062) uses
  `extensions.gen_random_bytes` / `extensions.digest` (pgcrypto lives in
  `extensions`, functions run `search_path=''`).
- **Fix:** Schema-qualified both calls. Lesson logged: read the effective
  definition, not the first migration that introduced the pattern.
- **Files:** `0118_trip_workspace.sql`

**3. [Rule 1 - Bug] `is_closed` flippable by any participant via PostgREST**
- **Found during:** Task 2 self-review (escalation: participant bypasses admin-only reopen)
- **Issue:** RLS allowed writers to update trip rows including `is_closed`.
- **Fix:** New `guard_trip_server_flags` trigger (0081 `guard_author_immutable`
  pattern, `current_user` discrimination): clients cannot touch
  `is_closed`/`created_by`; SECURITY DEFINER RPCs keep control. Proven both
  ways in 0053 (direct flip denied while open; frozen writes denied while closed).
- **Files:** `0118_trip_workspace.sql`, `0053_trip_workspace.sql`

**4. [Rule 2 - Missing] Contract suites encoded the overturned model**
- **Found during:** Task 2 full-suite run (0001, 0048 red)
- **Issue:** 0001 pinned exact columns (no `trip_id`), 0048 asserted foyer-wide
  trip visibility + member direct create/update — exactly what D-01/D-07 overturn.
- **Fix:** 0001 extended (6 column sets + 3 new tables + `trip_invites`
  zero-policy/grant block + 10 RPCs in the server-only list); 0048's 6 trip
  assertions rewritten to the container model (member anchor moved to pets,
  direct create → denied, update/delete → 0, enfant reads → 0). Animal/recipe
  sections untouched.
- **Files:** `0001_schema_contract.sql`, `0048_flat_tables_isolation.sql`

**5. [Rule 3 - Blocking] Local iteration mechanics for the single-file mandate**
- **Found during:** Tasks 1→2 (0118 already journaled locally after the tracer commit)
- **Issue:** Plan mandates ONE new migration file extended across tasks, but the
  tracer's file was already applied to the dev DB, so appended statements would
  never run there.
- **Fix (DEV ONLY, twice):** rolled back 0118 DDL + journal row on the dev DB
  and re-applied the complete file — the bytes tested are exactly the bytes
  that will ship; prod applies 0118 once. The file is unpushed; git history
  retains the faulty intermediate (aef7507) per §2.7A spirit. Never pushed,
  never deployed mid-plan.
- **Files:** none shipped (procedure only)

**6. [Rule 1 - Bug] Test-authoring corrections (no prod impact)**
- Intactness of an RLS-invisible row must be checked as owner, not as the
  filtered participant; `trip_invites` count → `expect_denied` (grants revoked,
  the query itself errors); RLS-filtered updates yield 0 rows, not errors
  (0048 move test, guard-proof ordering while open).
- **Files:** `0053_trip_workspace.sql`, `0048_flat_tables_isolation.sql`

**7. [Rule 3 - Blocking] Secret missing from the running container**
- **Found during:** Task 3 live smoke (500 `Configuration serveur absente`)
- **Issue:** Edited `docker-compose.traefik.yml`, but the local stack runs
  `COMPOSE_FILE=docker-compose.yml:docker-compose.secrets.yml` — the local
  secrets override (unversioned) is authoritative in dev.
- **Fix:** Added `TRIP_INVITE_HMAC_SECRET` to `secrets.yml` too (traefik edit
  kept for production), recreated functions, re-smoked green. Operator note:
  provision the secret in Vault/prod `.env` before any prod rebuild.
- **Files:** `supabase-project/docker-compose.traefik.yml` (committed),
  `supabase-project/docker-compose.secrets.yml` + `.env` (local-only)

No architectural changes (Rule 4 never triggered). No auth gates. No new
packages (T-15-SC clean).

## Known Stubs

None — grep for TODO/FIXME/placeholder across `trip-invite/` and the new SQL
returns zero; every touched table has a negative proof or an explicit
no-policy + grant assertion.

## Self-Check: PASSED

- Migration, suite, Edge files present on disk; 3 task commits
  (aef7507, d11b620, 51069e4) verified via `git rev-list --count c345c33..HEAD` = 3
- `trip-invite` live on the local stack (uniform oracle + 401/403 paths);
  functions service Healthy
