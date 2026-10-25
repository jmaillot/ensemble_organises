---
phase: 07-contacts-prives
plan: 02
subsystem: privacy
tags: [postgres, rls, owner-only, contacts, react, vitest, playwright]
# Dependency graph
requires:
  - phase: 07-contacts-prives
    provides: Famille-only birthday mirror (0097) with red-to-green proof (0036) and move-to-Famille affordance
provides:
  - Owner-only personal contact lists (0098) with red-to-green proof suite (0037)
  - Amended legacy expectations (0025) to the OQ-2 amendment
  - Admin-snapshot locks at Vitest + e2e level
affects: [anniversaires aggregation, cadeaux gift-idea linking, future admin-moderation tooling]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 7912
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [owner-only red-proof before fix, expect_denied for WITH CHECK refusals, affected-zero for USING filtering, postgres-role guard proof, Supabase-less separate-outDir e2e]

key-files:
  created:
    - supabase/migrations/0098_contact_owner_only.sql
    - supabase/tests/0037_contact_owner_only.sql
  modified:
    - supabase/tests/0025_contacts_mirror.sql
    - app/src/modules/contacts/contacts-page.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts

key-decisions:
  - "Inline contact_lists insert/update personal-admin branches dropped too — the gates alone would have left list-row writes admin-open (Rule 2, required for 'reads and writes nothing')"
  - "DELETE policies left byte-identical (admin-only) per plan — but Postgres requires SELECT-visibility for DELETE, so blind delete of unreadable rows now affects 0 (proven, documented, deferred product call)"
  - "Departure hygiene proven structurally instead: member-removal cascades personal lists+contacts (Eve in/out in 0037)"
  - "0025 guard proof moved to owner role: no single member sees all defaults post-0098, so the last-default refusal is proven bypass-RLS (trigger is role-independent)"

patterns-established:
  - "Amendment shape: prove red on the exact privilege (admin reads+writes other's personal), restrict forward, prove green, amend stale suites"
  - "Client locks the RLS-shaped snapshot (exact chips + readable-only counts); the server proves the exclusion"

requirements-completed: [D-01, D-02, D-03, D-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Admin reads and writes nothing on another member's personal list; owner (non-admin) has full access; Famille unchanged"
    requirement: "D-01"
    verification:
      - kind: integration
        ref: "supabase/tests/0037_contact_owner_only.sql (red pre-0098: admin list-read returned 1; green post-0098)"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh — 40/40 suites vertes (dont 0025 amendée)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Delete policies unchanged admin-only; true delete behavior proven (readable rows deletable, unreadable rows 0, departure cascade)"
    requirement: "D-02"
    verification:
      - kind: integration
        ref: "supabase/tests/0037_contact_owner_only.sql (hygiene section + Eve cascade, EXPLAIN-proven PG semantics)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Move personal-to-Famille intact for the owner, mirror born from the trigger, Bob reads legitimately after"
    requirement: "D-04"
    verification:
      - kind: integration
        ref: "0037 move section + app/e2e/cadeaux-contacts.spec.ts#déplacer un contact personnel vers Famille (chromium + mobile)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No client path assumes admin visibility of others' personal lists; admin snapshot locked"
    requirement: "D-03"
    verification:
      - kind: unit
        ref: "app/src/modules/contacts/contacts-page.test.tsx (admin sees exactly Famille + own, readable-only counts)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#vue admin (chromium + mobile)"
        status: pass
    human_judgment: false

# Metrics
duration: 35min (approx)
completed: 2026-10-08
status: complete
---

# Phase 07 Plan 02: Contacts strictement propriétaire-only Summary

**Personal contact lists are strictly owner-only in read and write (admins included, OQ-2 amended per UAT 2026-10-08) — proven red-to-green at SQL level, clients re-verified with zero code changes, full chain green**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Owner-only gates (0098, forward-only, 0077/0097 untouched): admin branch dropped from `can_read_contact_list` + `can_write_contact_list`, AND from the inline `contact_lists_insert`/`contact_lists_update` personal-admin branches (the gates alone would have left list-row writes admin-open). Famille branches byte-identical, DELETE policies byte-identical.
- Red proven before restricting: 0037 run pre-0098 failed on `l'admin ne voit pas la liste personnelle d'un autre membre (attendu 0, obtenu 1)` — current admin access established, then removed.
- Green after: 0037 covers admin select/insert/update refused on another's personal list+contacts, non-admin owner full access (proves owner-only needs no admin), Famille read/write intact for members and admins, owner move personal→Famille with mirror birth, inter-foyer isolation.
- Legacy suite 0025 amended to the amendment (admin sees Famille + own only; owner-path non-default delete; last-default guard proven via owner role).
- Clients: every path re-verified clean with NO code change (RLS is the gate); admin snapshot locked by one new Vitest + one new e2e journey.
- Full chain green: static SQL check (136 fns, 0 defect), DB 40/40, typecheck, 88/88 contacts+cadeaux Vitest, production build, e2e 20/20 chromium+mobile.

## Task Commits

Each task was committed atomically on `agent-07-02-owner-only`:

1. **Task 1: Prove admin access, then restrict to owner-only** - `1c90787` (feat)
2. **Task 2: Client re-verification for admin-visibility assumptions** - `5f92457` (test)
3. **Task 3: Proof closure across the full chain** - `fdcc8a3` (test)

## Files Created/Modified

- `supabase/migrations/0098_contact_owner_only.sql` - Owner-only gates + inline insert/update tightening (forward-only)
- `supabase/tests/0037_contact_owner_only.sql` - Red-to-green owner-only proof, move intact, true-behavior hygiene + Eve departure cascade
- `supabase/tests/0025_contacts_mirror.sql` - Stale OQ-2 expectations amended (admin counts, owner-path deletes, owner-role guard proof)
- `app/src/modules/contacts/contacts-page.test.tsx` - Admin-snapshot lock (2 chips, readable-only counts)
- `app/e2e/cadeaux-contacts.spec.ts` - Demo admin-view journey (2 chips; cross-member exclusion stays SQL-proven)

## Decisions Made

- Inline `contact_lists_insert`/`update` personal-admin branches dropped alongside the gates: those policies inline the predicate instead of calling the gates, so a gates-only change would have left admins able to rename others' personal lists and create personal lists for others. Same class as the gate change (Rule 2), Famille and owner branches untouched, zero client impact (no client writes `contact_lists` rows — verified by grep; only the SECURITY DEFINER seed writes them).
- DELETE policies kept byte-identical per plan — and 0037 proves the TRUE resulting behavior instead of the assumed one (see headline deviation below).
- 0025's last-default guard proof moved to the owner role: post-0098 no single member sees all of a household's defaults, so the Famille-last refusal is proven RLS-bypassed (the guard is a trigger, role-independent) — same mechanism, same guarantee.
- Demo seed untouched: Famille + Camille's own personal list already IS the post-0098 admin snapshot (Camille is the demo admin), so seeds imply no admin visibility and both new client proofs lock that shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seed pre-fill broke the owner-read count**
- **Found during:** Task 1 (0037 first green run, post-0098)
- **Issue:** Alice's personal list holds the 0077 seed pre-filled contact plus 2 fixtures — expected 2, got 3.
- **Fix:** Expect 3 with a comment naming the seed contact (same class as 07-01's fixture-count lessons: read the seed before asserting).
- **Files modified:** supabase/tests/0037_contact_owner_only.sql
- **Verification:** `sh scripts/test-db.sh 0037` green.
- **Committed in:** 1c90787 (part of task commit)

**2. [Rule 1 - Bug] Stale OQ-2 suite 0025 failed the full run**
- **Found during:** Task 1 (full DB suite: 39/40, 0025 red)
- **Issue:** 0025 asserted admin sees Famille + both adult personals — the exact privilege the amendment removes. Five read assertions + the delete block needed amending (details: admin counts 3→2, Bob's list/counts invisible to Alice, non-default delete via owner path, last-default guard via owner role).
- **Fix:** Amended expectations to the OQ-2 amendment, preserving each section's original intent (defaults, pre-fill, child blocks, isolation, mirror, D-06, D-14 all untouched and still passing).
- **Files modified:** supabase/tests/0025_contacts_mirror.sql
- **Verification:** `sh scripts/test-db.sh` 40/40 green.
- **Committed in:** 1c90787 (part of task commit)

**3. [Rule 2 - Missing critical functionality] Inline list-row policies needed the same tightening**
- **Found during:** Task 1 (reading 0077 before writing 0098)
- **Issue:** `contact_lists_insert`/`update` inline the owner-or-admin predicate instead of calling the gates — dropping the admin branch from the gates alone would still let an admin rename another's personal list or create one for them, violating "reads and writes nothing".
- **Fix:** Dropped the personal-admin branch inline too; Famille (`owner NULL` + admin) and owner branches kept. Proven refused in 0037 (list rename → 0 rows, create-for-other → hard denial).
- **Files modified:** supabase/migrations/0098_contact_owner_only.sql, supabase/tests/0037_contact_owner_only.sql
- **Verification:** 0037 green, full suite 40/40 green.
- **Committed in:** 1c90787 (part of task commit)

---

**Total deviations:** 3 auto-fixed (2 test-correctness, 1 policy-completeness, zero product impact beyond the mandated amendment)
**Impact on plan:** No scope creep. No new package, no new endpoint, no RLS widening anywhere.

## HEADLINE FINDING — blind-delete hygiene does not survive owner-only read (proven, deferred product call)

The plan (and CONTEXT §amendment) assumed unchanged admin-only DELETE policies = preserved blind hygiene. **That assumption is mechanically false on PostgreSQL, and 0037 proves it rather than assuming it:**

- EXPLAIN on this stack shows a DELETE plan filtering `is_household_admin AND is_household_member AND can_read_contact_list` — Postgres requires SELECT-visibility to delete a row. Once reads are owner-only, an admin's DELETE on another's personal list/contact matches 0 rows **no matter what the DELETE policy says** (policies kept byte-identical admin-only — verified in `pg_policies`).
- 0037 asserts the true behavior, not the wish: admin delete of a readable Famille contact → 1 row (shared hygiene intact); admin delete of another's personal contact and personal list → **0 rows, no error** (neither silently widened nor loudly broken).
- What actually covers departures: **member-removal cascade** (0077 FKs `ON DELETE CASCADE`), proven live in 0037 — Eve arrives (seed creates her personal list), Eve is removed, her lists+contacts are gone, Famille untouched. No RLS, no admin, no prior read involved.
- **Real residual loss (vs. the plan's "stays possible"):** moderation by an admin of a CURRENT member's personal lists is no longer possible through RLS at all. The only path would be a new SECURITY DEFINER purge function (member-scoped, since admins can't discover invisible list IDs) + admin UI — new server surface needing product design, deliberately NOT built here.
- **Recommendation:** accept the loss and defer (personal means personal; no admin UI ever managed others' personal lists — verified by grep in Task 2; departures are cascade-covered). A purge RPC can be proposed as a follow-up plan if moderation becomes a real need. **This is the one product call this plan hands back — everything else is closed.**

## Sibling-Path Audit (per-path verdicts, re-verified against the stricter gate)

- **Gift-idea contact dropdown** (`gift-idea-form-dialog.tsx`, options from RLS-filtered `contacts` prop): CLEAN — no admin branch, an unreadable personal contact is simply not an option; free-text `gifteeText` covers the rest. No fix.
- **Giftee name/occasion resolution** (`cadeaux/types.ts` `toGiftIdea`): CLEAN — `contacts.find(...)` over the filtered snapshot, falls back to `giftee_text`, `nextOccasionDate` null when unresolvable. No fix.
- **Cadeaux contacts-tab counts** (`cadeaux-page.tsx`): CLEAN — bare lengths over the filtered snapshot. No fix.
- **Admin management screens**: CLEAN — grep over all `isAdmin`/admin-role branches (drawer, calendrier, parametres, cadeaux gift lists, ardoise, messages): none touch `contact_lists` of other members. The contacts page itself has no role branch. No fix.
- **Demo seeds** (`lib/data/seed.ts`): CLEAN — Famille + Camille's own personal only; Camille is the demo admin, so the seed already matches the post-0098 admin view. No fix.
- **Contact form list selector + move gating**: CLEAN — options and `canMoveToFamily` already owner-scoped over visible lists. No fix.

## Threat Flags

None beyond the plan's threat register: T-07-03 mitigated (admin branch dropped from both gates + inline policies; 0037 proves admin select/insert/update refused on others' personal lists while Famille, own access, move, and readable-row delete are intact). No new endpoints, auth paths, file access, or schema trust-boundary changes — the change strictly shrinks the admin's reachable surface. T-07-SC not triggered (no package added).

## Known Stubs

None. Stub scan over the full task diff found no placeholders, TODOs, or empty render paths.

## User Setup Required

None - no external service configuration required.

## Issues Encountered

- Debug residue in the dev DB (my own): a first empirical probe script ended with COMMIT instead of ROLLBACK, persisting two `auth.users` rows + one debug household. Cleaned surgically (household cascade-delete + time-bounded user delete, both verified 0 afterwards). Lesson recorded: debug SQL scripts end with ROLLBACK, always; the suite files already do.
- `pkill`-style cleanup avoided per 07-01 lesson: preview stopped via `fuser -k 4174/tcp`, port verified freed. Env files (`.env.development.local`, `.env.production.local`) hidden only for the Supabase-less demo build, restored byte-identical (md5 OK/OK), disposable preview stopped, `/tmp/opencode/dist-demo-0702` removed. Shared `app/dist/` untouched (build went to separate outDir).

## Next Phase Readiness

- Personal contacts are strictly owner-only end to end (read + write, admins included); Famille sharing, owner move-to-Famille with mirror, and departure-cascade hygiene are proven at SQL, unit, and e2e levels.
- Deploy note: run `sh scripts/migrate.sh` (applies 0098 — no data migration, gate-only) before rebuilding the frontend (frontend needs no change, but keep the habit).
- Open product call (see headline finding): accept the loss of active-member admin moderation (recommended) or schedule a purge-RPC follow-up. Nothing else pending.

---
*Phase: 07-contacts-prives*
*Completed: 2026-10-08*

## Self-Check: PASSED

- SUMMARY present on disk (`.planning/` is gitignored — intentionally uncommitted, noted for orchestrator).
- Commits `1c90787`, `5f92457`, `fdcc8a3` all present in history on `agent-07-02-owner-only`.
- Migration `0098_contact_owner_only.sql` + suite `0037_contact_owner_only.sql` present; 0025 + client tests + e2e spec modified as listed.
- No STATE.md / ROADMAP.md changes (out of scope per dispatch).
