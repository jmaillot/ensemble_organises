---
phase: 06-cadeaux-invites
fixed_at: 2026-10-06T17:45:00Z
review_path: .planning/phases/06-cadeaux-invites/06-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-10-06T17:45:00Z
**Source review:** `.planning/phases/06-cadeaux-invites/06-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0
- Out of scope, untouched: IN-01, IN-02, IN-03

**Verification environment:** main checkout (`/home/jmaillot/Projects/ensemble_organises`).
Per fix: `cd app && npm run typecheck` + targeted Vitest (`npx vitest run
src/modules/cadeaux`) + `npm run build`. Edge change (WR-02): Tier-1
re-read + Node semantics check of the helper (no Deno available) + redeploy
via `sh scripts/deploy-functions.sh` (runtime in sync, `diff -q` clean).

## Fixed Issues

### CR-01: Anonymous holds invisible to organizer UI; release unreachable

**Files modified:** `app/src/modules/cadeaux/types.ts`, `app/src/modules/cadeaux/cadeaux-page.tsx`, `app/src/modules/cadeaux/cadeaux-page.test.tsx`
**Commit:** e73598c
**Applied fix:** minimal client-side option from the review. `toGiftItem`
derives `heldAnonymously` from `row.reserved_by_name` (WR-03 first) and never
exposes the declared name (`reservedByName` stays NULL — D-07 holds, covered
by a runtime assertion). Owner badge/release gate on
`purchased || heldAnonymously`; member badge shows `Réservé` (no author) for
anonymous holds; manager release gate extended symmetrically.
`handleTogglePurchased` refuses anonymously-held items with
`Cet article est déjà réservé.` BEFORE the UPDATE — no more
`gift_items_single_author_check` CHECK-violation toast. No SQL/Edge touched,
no new migration.
**Honest limit (documented, not hidden):** the masked view still NULLs
`reserved_by_name` for the list owner, so in prod the owner's
`heldAnonymously` stays false and the owner gate reduces to `purchased` —
members and admins on shared lists get the full fix today; the owner gate is
wired for when the signal is visible. What the review's server-side
alternative (`purchased = true` on guest reserve) would change is unchanged
and remains a possible follow-up — deliberately NOT done (no re-proof).

### WR-03: TS type drift — `GiftItemRow` missing `reserved_by_name`

**Files modified:** `app/src/types/database.ts`, `app/src/modules/cadeaux/api.ts`, `app/src/modules/cadeaux/cadeaux-page.tsx`, `app/src/lib/data/seed.ts`
**Commit:** aed271b
**Applied fix:** added `reserved_by_name: string | null` to `GiftItemRow`
(0089, D-05/D-07); extended the `updateGiftItem` Pick; dropped the
`as unknown as Partial<GiftItemRow>` cast at the release site (plus its now
unused import); added explicit `reserved_by_name: null` to `createGiftItem`
and to the three seed rows (forced by typecheck — typed literals).

### WR-01: Unhandled promise rejection on conflict-path refetch

**Files modified:** `app/src/modules/cadeaux/guest-cadeau-page.tsx`
**Commit:** 7f93665
**Applied fix:** one line — `void viewQuery.refetch();` →
`void viewQuery.refetch().catch(() => {});`, matching the file's own success-branch convention.

### WR-02: Expiry check compares ISO strings lexicographically

**Files modified:** `supabase/functions/gift-list-invite/index.ts` (source; runtime copy synced, gitignored)
**Commit:** a9530ef
**Applied fix:** new `isInviteExpired()` helper — `Date.parse(...) <= Date.now()`,
fail closed (`NaN` → expired → 404 oracle). Replaces the `<= toISOString()`
string comparison. Redeployed via `sh scripts/deploy-functions.sh` (10
functions, 0 stale); source and runtime `diff -q` clean. Helper semantics
proven in Node across `+00:00`/`Z`/past/unparseable cases.

## Skipped Issues

None — all in-scope findings fixed.

## Test coverage added

`cadeaux-page.test.tsx` — new `describe('toGiftItem — tenue anonyme (CR-01)')`
with 4 runtime assertions (never source-text matches): anonymous hold →
`heldAnonymously` true + both author fields NULL (D-07 masking);
whitespace-only name → not held (CHECK mirror); member hold → author resolved,
not anonymous; free item → all clear. Suite: 30 → 34 passing.

---

_Fixed: 2026-10-06T17:45:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
