---
phase: 07-contacts-prives
plan: 01
subsystem: privacy
tags: [postgres, rls, trigger, mirror, birthdays, contacts, react, vitest, playwright]

# Dependency graph
requires:
  - phase: 05-cadeaux-contacts
    provides: contact_lists/contacts model with OQ-2 RLS (0077) and birthday mirror trigger (0078)
provides:
  - Famille-only birthday mirror (0097) with personal-mirror purge
  - Red-to-green privacy proof suite (0036)
  - Move-to-Famille affordance behind confirmation modal
affects: [anniversaires aggregation, cadeaux gift-idea linking, future contact visibility decisions]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 8178
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [privacy red-proof before fix, RLS WITH CHECK hard-refusal via expect_denied, Supabase-less separate-outDir e2e]

key-files:
  created:
    - supabase/migrations/0097_contact_mirror_family_only.sql
    - supabase/tests/0036_contact_mirror_privacy.sql
    - app/src/modules/contacts/api.test.ts
  modified:
    - app/src/modules/contacts/api.ts
    - app/src/modules/contacts/hooks/use-contacts.ts
    - app/src/modules/contacts/contacts-page.tsx
    - app/src/modules/contacts/contacts-page.test.tsx
    - app/e2e/cadeaux-contacts.spec.ts

key-decisions:
  - "Mirror gate reads owner_member_id IS NULL per row — the single Famille predicate, no list-name matching"
  - "Trigger watches list_id so personal-to-Famille moves spawn the mirror with zero dedicated writes"
  - "Bob's Famille-to-personal move proven via expect_denied: WITH CHECK raises, it never silently affects 0 rows"
  - "Sibling paths (dropdown, aggregation, counts, seeds) documented clean — RLS is the gate, no code touched"

patterns-established:
  - "Privacy fix shape: prove red on the exact leak (row exists + peer reads it), fix forward, prove green"
  - "Move payload minimal (list_id only) with api-level payload-shape test"

requirements-completed: [D-01, D-02, D-03, D-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Personal dated contact creates no household birthday; members blind to personal contacts end to end"
    requirement: "D-01"
    verification:
      - kind: integration
        ref: "supabase/tests/0036_contact_mirror_privacy.sql (red pre-0097: mirror exists + Bob reads it; green post-0097)"
        status: pass
      - kind: integration
        ref: "sh scripts/test-db.sh — 39/39 suites vertes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owners move own personal contacts to Famille through an explicit confirming modal"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "app/src/modules/contacts/api.test.ts (list_id-only payload, client guards)"
        status: pass
      - kind: unit
        ref: "app/src/modules/contacts/contacts-page.test.tsx (gating, modal copy, cancel no-op, confirm moves)"
        status: pass
      - kind: e2e
        ref: "app/e2e/cadeaux-contacts.spec.ts#déplacer un contact personnel vers Famille (chromium + mobile)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sibling exposure paths (idea dropdown, anniversary aggregation, contacts-tab counts, demo seeds) audited clean"
    requirement: "D-02"
    verification:
      - kind: other
        ref: "code audit: all four paths RLS-gated or dateless — documented in SUMMARY, no fix required"
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-10-08
status: complete
---

# Phase 07 Plan 01: Contacts privés Summary

**Birthday mirror gated on Famille lists with personal-mirror purge (proven red-to-green), members blind to personal contacts end to end, owner move-to-Famille behind a confirming modal**

## Performance

- **Duration:** 40 min
- **Started:** 2026-10-08T12:00:00Z
- **Completed:** 2026-10-08T12:40:05Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Personal dated contacts no longer mirror into household birthdays (0097 gates `mirror_contact_birthday` on `owner_member_id IS NULL`, trigger watches `list_id`, one-shot purge of pre-existing personal mirrors — Famille mirrors untouched)
- Leak proven RED before the fix (personal mirror created AND read by non-owner member B) then GREEN after (0036, full DB suite 39/39, static check 136 fns clean)
- Owners move their own personal contacts to Famille through a modal stating the household outcome; payload is `list_id`-only, RLS requires write on both lists (proven), no Famille-to-personal direction
- Sibling paths audited with per-path clean verdicts; full chain green (typecheck, 87 contacts+cadeaux Vitest, production build, e2e 18/18 chromium+mobile)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the leak red, then gate the mirror on Famille lists** - `26d9133` (feat)
2. **Task 2: Move-to-Famille affordance with confirmation** - `8defb59` (feat)
3. **Task 3: Sibling-path audit and full-chain gate** - `532f76a` (test)

## Files Created/Modified

- `supabase/migrations/0097_contact_mirror_family_only.sql` - Famille-only mirror gate + list_id trigger + personal-mirror purge (forward-only, 0077/0078 untouched)
- `supabase/tests/0036_contact_mirror_privacy.sql` - Red-to-green leak proof, Famille mirror intact, move spawns mirror, RLS negatives, D-14 intact
- `app/src/modules/contacts/api.ts` - `moveContactToFamily` (list_id-only payload + client guards)
- `app/src/modules/contacts/api.test.ts` - Payload-shape proof (list_id alone, no household_id; empty-id guard)
- `app/src/modules/contacts/hooks/use-contacts.ts` - `moveToFamily` mutation (resolves Famille target, refreshes snapshot)
- `app/src/modules/contacts/contacts-page.tsx` - Move button on own personal contacts only + confirming modal (non-destructive styling)
- `app/src/modules/contacts/contacts-page.test.tsx` - Gating, modal copy, cancel no-op, confirm-moves proofs
- `app/e2e/cadeaux-contacts.spec.ts` - Demo e2e: create-in-personal, confirm modal, lands in Famille

## Decisions Made

- Mirror gate reads `owner_member_id IS NULL` per row inside the trigger function — the single Famille predicate. No list-name matching, no new table, no RLS change (OQ-2 kept per CONTEXT).
- `list_id` added to the trigger's watched columns so the D-04 move spawns the mirror with zero dedicated writes; the reverse (Famille-to-personal, UI-never-offered) would correctly kill the mirror by the same gate.
- Missing-list defensive default: an unresolvable list is treated as personal (no mirror) rather than failing the write.
- Bob's Famille-to-personal attempt proven with `expect_denied` (hard RLS refusal), not 0-affected: Postgres raises on WITH CHECK violation while USING only filters — the test now documents that semantic.
- Purge scoped exactly (`contact_id` join + owner check); verified vacuous on the dev database (0 personal mirrors, 0 mirrors total pre-migration) and steady-state-gated by 0036 afterwards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WITH CHECK violation is an error, not 0 affected rows**
- **Found during:** Task 1 (0036 first green run, post-0097)
- **Issue:** The Bob Famille-to-personal negative used `testkit.affected(...) = 0`, but Postgres raises `new row violates row-level security policy` on WITH CHECK failure — the suite errored instead of asserting.
- **Fix:** Switched that single assertion to `testkit.expect_denied(...)` (stronger proof: hard refusal, documented the USING-vs-WITH-CHECK semantic in a comment).
- **Files modified:** supabase/tests/0036_contact_mirror_privacy.sql
- **Verification:** `sh scripts/test-db.sh 0036` green, then full suite 39/39 green.
- **Committed in:** 26d9133 (part of task commit)

**2. [Rule 1 - Bug] Vitest race on list chips + ambiguous modal copy assertion**
- **Found during:** Task 2 (contacts Vitest run)
- **Issue:** Two new page tests queried the list chips before async seed load (no list rendered yet); the modal copy assertion `/vers Famille/` matched both the title and the confirm button.
- **Fix:** Awaited the contact list before touching chips (same pattern as pre-existing tests); asserted the exact modal title plus the two outcome lines.
- **Files modified:** app/src/modules/contacts/contacts-page.test.tsx
- **Verification:** `npm test -- contacts` 7/7 green.
- **Committed in:** 8defb59 (part of task commit)

---

**Total deviations:** 2 auto-fixed (both test-only correctness, zero product impact)
**Impact on plan:** No scope creep. No new migration, no RLS change, no new package.

## Issues Encountered

- `pkill -f "vite preview --port 4174"` matched the invoking shell's own command line and SIGTERM-killed it mid-cleanup. Recovered: preview was already dead (port freed), env files were untouched in the hide directory, restored byte-identical afterwards (md5 OK/OK). Lesson recorded: match preview processes by port (`fuser -k 4174/tcp` or pkill with a pattern that cannot match the shell, e.g. `[v]ite preview`).
- Env files (`.env.development.local`, `.env.production.local`) were hidden for the Supabase-less demo build per the 06-03 workaround, restored byte-identical (checksums verified), disposable preview stopped, `/tmp/opencode/dist-demo` removed. Shared `dist/` and port 4173 untouched.

## Sibling-Path Audit (per-path verdicts)

- **Gift-idea contact dropdown** (`gift-idea-form-dialog.tsx`, source `useCadeaux` snapshot): CLEAN — options come from the RLS-filtered contacts snapshot; an unreadable personal contact is simply unresolvable (`gifteeName` falls back to free text, `nextOccasionDate` null). No fix.
- **Anniversary aggregation + next-occasion** (`anniversaires/types.ts aggregateBirthdays`, `cadeaux/types.ts nextIdeaOccasion/toGiftIdea`): CLEAN — pure functions over RLS-filtered rows; a member who cannot read a personal contact never receives its row, so neither the mirror-merge nor the leftover branch can render it. Post-0097 no personal mirrors exist server-side either. No fix.
- **Cadeaux contacts-tab counts** (`cadeaux-page.tsx` contacts tab): CLEAN — counts only (`contactLists.length`, `contacts.length`) over the RLS-filtered snapshot, zero names rendered. No fix.
- **Demo seeds** (`lib/data/seed.ts`): CLEAN — the sole personal seed contact (`contact-camille`) has `birth_date: null` (never mirrored, even pre-0097); every dated seed contact lives in Famille; demo mode is single-user local with no cross-member channel. No fix.

## Threat Flags

None beyond the plan's threat register: T-07-01 mitigated (gate + purge + 0036 B-blindness), T-07-02 mitigated (modal states outcome, button gated on own lists, RLS both-list write enforced server-side). No new endpoints, auth paths, file access, or schema trust-boundary changes introduced.

## Known Stubs

None. Stub scan over all touched files found only the pre-existing search-input `placeholder=` attribute (not a stub).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Personal contacts are household-invisible end to end; the move-to-Famille path is proven at SQL, unit, and e2e levels.
- OQ-2 deliberately unchanged (admins keep personal-list access) — recorded as deferred product decision, not a gap.
- No blockers. Note for deploy: run `sh scripts/migrate.sh` (applies 0097 incl. purge) before rebuilding the frontend.

---
*Phase: 07-contacts-prives*
*Completed: 2026-10-08*

## Self-Check: PASSED

- SUMMARY present on disk (`.planning/` is gitignored — intentionally uncommitted, noted for orchestrator).
- Commits `26d9133`, `8defb59`, `532f76a` all present in history.
- No STATE.md / ROADMAP.md changes (out of scope per dispatch).
