---
phase: 06-cadeaux-invites
plan: 14
subsystem: gifts
tags: [gift-lists, reservation, release, vitest, playwright, edge-functions, rls]
requirements: [D-07, D-08]
gap_closure: true
gap_ids: [G-06-22, G-06-23, G-06-24]
requires:
  - phase: 06-13
    provides: toolbar row, list selector, reservation-default sharing in the same files
provides:
  - Single uncheck-to-release path, standalone buttons gone (G-06-22)
  - Server-side reserve-or-release under verified identity with proofs (G-06-23)
  - Red danger Quit under the selector, origin badge removed (G-06-24)
affects: [gift-sharing, verify-work]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - supabase/migrations/0096_gift_member_release.sql
    - supabase/tests/0035_gift_member_release.sql
  modified:
    - supabase/tests/0033_gift_cross_household.sql
    - supabase/functions/gift-list-invite/index.ts
    - app/src/modules/cadeaux/api.ts
    - app/src/modules/cadeaux/api.test.ts
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/cadeaux-page.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts
key-decisions:
  - "Replay of one's own hold now RELEASES (reserve-or-release) instead of idempotent already_reserved — the switch is a request, the server verdict is authoritative"
  - "Release requires the reservation share, like holding (D-04 amended intact); quitting members keep holds but cannot release them server-side until they rejoin"
  - "Quit keeps its exact condition and pendingLeave modal — style and placement only (danger Button, under the selector)"
actuals:
  tokens: 16700
  tasks: 4
  commits: 4
status: complete
---

# Phase 06 Plan 14: Single Release Path + Reserve-or-Release + Red Quit (G-06-22/G-06-23/G-06-24) Summary

**Both standalone "Libérer la réserve" buttons are gone (owner uncheck on a reserved-showing item is the single release path through the existing confirmation), `member_reserve_gift_item` is now reserve-or-release keyed on the verified profile name (free→hold, mine→release, other's→clean 409 with zero author data), the foreign "Acheté" switch stays enabled and routes every toggle through the server, and "Quitter cette liste" is a red danger button directly under the list selector with the redundant origin badge removed — full chain green.**

## Performance

- **Tasks:** 4
- **Files modified:** 9 (2 created, 7 modified)
- **Commits:** a9189f1 (feat), 54933a2 (feat), 123051e (feat), f878a0e (test)

## Accomplishments

- `cadeaux-page.tsx` (Task 1): both standalone release buttons removed (owner branch and manager branch). `pendingRelease` modal, `handleRelease` payload, and `isManager` gating kept — the gating now lives explicitly in the owner uncheck path (identically true in that branch, D-08 still enforced server-side). Suite: presence assertions replaced with absence assertions.
- `0096_gift_member_release.sql` + `0035_gift_member_release.sql` + Edge (Task 2): forward-only migration (0093/0094/0095 untouched) extending the RPC into reserve-or-release under the session-derived profile name — never a client-supplied name, no RLS widened, share check unchanged. 0035 proves free→hold, mine→release (both name-attributed and member-row forms, three columns cleared), other's→409 with data unchanged and no author data in the refusal, no-share/lecture/unknown→refused, direct client writes still refused by the guard. Edge `member-reserve` passes `released` through with the same user-only gate and error translation. Static check clean, full DB suite 38/38, redeployed via `scripts/deploy-functions.sh`, `supabase-edge-functions` healthy.
- Client Task 3 (`api.ts`, `cadeaux-page.tsx` + suites): `MemberReserveResult` gains `released`; the foreign switch is one enabled control in all non-pending states (held-by-other disabled branch removed) routing through `handleForeignToggle` — released→"Réservation libérée.", 409→established "déjà réservé, choisissez-en un autre" notice + refetch, never an author name. Quit moved out of the toolbar into its own row under the selector as `<Button variant="danger">` (44px touch target, same condition and modal); origin badge render deleted (type fields untouched). Cadeaux Vitest 80/80.
- Proofs (Task 4): e2e extended with deterministic demo paths (no release button + uncheck-modal-cancel, enabled foreign switches + server refusal, red quit without badge); typecheck, cadeaux 80/80, production build, redeployed Edge, e2e cadeaux-contacts 16/16 (chromium + mobile) via the 06-03 Supabase-less separate-outDir workaround (env files restored byte-identical, preview stopped, port verified free).

## Task Commits

1. **Task 1: Remove the redundant standalone release button** - `a9189f1` (feat)
2. **Task 2: Server-side reserve-or-release under verified identity** - `54933a2` (feat)
3. **Task 3: Foreign toggle enabled, red Quit placement, badge removal** - `123051e` (feat)
4. **Task 4: Proof closure across the full chain** - `f878a0e` (test)

**Plan metadata:** SUMMARY written to disk; `.planning/` is gitignored in this repo so no docs commit is possible (verified via `git check-ignore`). STATE.md/ROADMAP.md untouched per plan instructions (orchestrator-owned).

## Decisions Made

- Replay semantics changed deliberately (not preserved): under 0094 replaying one's own hold returned `already_reserved: true`; under 0096 it releases. The old 0033 replay assertion was updated to the new contract with a re-hold restoring downstream state — documented as a contract change, not a regression.
- The `released` flag rides the existing `member-reserve` response (no new action, no payload change) so the client keeps sending only the item id.
- The Vitest reserve mock simulates the server verdict transport (hold clears/sets local rows) because the mine/other distinction is proven server-side in 0035 — the mock never decides identity.
- Quit uses the existing `danger` Button variant (coral tokens, min-h-11) rather than a bespoke red style, consistent with delete affordances.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 0096 not yet applied when test-db.sh first ran**
- **Found during:** Task 2 (first DB run: 0033 + 0035 failed with `released` NULL)
- **Issue:** `test-db.sh` runs tests against current DB state but never applies migrations — the 0094 function was still effective
- **Fix:** Ran `sh scripts/migrate.sh` (1 applied, 96 known) then re-ran the suite: 38/38 green
- **Files modified:** none (operational ordering)

**2. [Rule 1 - Bug] 0033 replay assertion contradicted the new contract**
- **Found during:** Task 2 (same failing run — expected once the cause was understood)
- **Issue:** 0033 asserted replay-own-hold returns `already_reserved: true`; under reserve-or-release it returns `released: true`
- **Fix:** Assertion updated to release (data cleared) + re-hold restoring the exact downstream state (§4 owner view, organizer release path unchanged)
- **Files modified:** supabase/tests/0033_gift_cross_household.sql (committed in 54933a2)
- **Commit:** 54933a2

**3. [Rule 1 - Bug] 0035 §1 double-invoked the RPC across two selects**
- **Found during:** Task 2 (authoring — caught before first run)
- **Issue:** Two `select` assertions on the same item would invoke the RPC twice; the second call now releases instead of re-reading
- **Fix:** Single-call `DO` block reading both fields from one return; freed item `c` reserved for the §4-free/§5-member-hold assertions (also avoided a mutual-exclusion CHECK violation)
- **Files modified:** supabase/tests/0035_gift_member_release.sql (committed in 54933a2)
- **Commit:** 54933a2

**4. [Rule 3 - Blocking] e2e demo entry hidden by gitignored local env files**
- **Found during:** Task 4 (same as 06-03/06-10/06-11/06-12/06-13)
- **Issue:** `.env.development.local` / `.env.production.local` bake Supabase config into the build, so the demo entry never renders
- **Fix:** Applied the 06-03-SUMMARY workaround verbatim: env files moved to `/tmp/opencode/envbak-0614/`, Supabase-less build to separate outDir `/tmp/opencode/dist-demo-0614`, served on :4174 with `E2E_BASE_URL`, env files restored by rename afterwards (117 bytes each, byte-identical), preview killed by port PID (never pattern `pkill`), port verified free
- **Verification:** e2e 16/16 chromium + mobile

**Total deviations:** 4 auto-fixed (3 SQL/test correctness, 1 environmental — no product impact)

## Issues Encountered

- None beyond the deviations above. `isManager` became unreferenced after the button removal (would trip `noUnusedLocals`); kept explicitly in the owner uncheck path where it is identically true — gating byte-identical in effect, reference preserved.

## User Setup Required

None.

## Next Phase Readiness

- G-06-22/G-06-23/G-06-24 closed: single uncheck-to-release path, foreign own-holds releasable server-side with clean conflicts, red Quit under the selector with no badge; guest, anonymous, leave, and share flows unchanged (0033 downstream, 0034, and all non-cadeaux suites untouched and green within the full 38-file DB run).
- No stubs introduced (only pre-existing input `placeholder=` attributes); no new threat surface (T-06-23 mitigated by design and proven in 0035 negatives; T-06-SC clean: no new package).

## Self-Check: PASSED

- All nine files present on disk; commits a9189f1, 54933a2, 123051e, and f878a0e exist in history
- Env files restored byte-identical; disposable preview stopped; port 4174 free; no unrelated files staged or touched
- Gates re-run and green: static SQL check clean, DB suite 38/38 (incl. new 0035), Edge functions service healthy, typecheck clean, cadeaux 80/80, build ok, e2e cadeaux-contacts 16/16
- STATE.md/ROADMAP.md untouched (orchestrator-owned)
