---
phase: 06-cadeaux-invites
reviewed: 2026-10-06T17:30:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/0089_gift_guest_reserve.sql
  - supabase/tests/0029_gift_guest.sql
  - supabase/tests/0001_schema_contract.sql
  - supabase/functions/gift-list-invite/index.ts
  - supabase-project/docker-compose.traefik.yml
  - docs/BACKEND.md
  - app/src/modules/cadeaux/email-template.ts
  - app/src/modules/cadeaux/email-template.test.ts
  - scripts/test-gift-mail.sh
  - app/src/modules/cadeaux/api.ts
  - app/src/modules/cadeaux/guest-cadeau-page.tsx
  - app/src/modules/cadeaux/components/gift-share-dialog.tsx
  - app/src/modules/cadeaux/cadeaux-page.tsx
  - app/e2e/cadeaux-contacts.spec.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-10-06T17:30:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed all phase 06 (cadeaux-invites) changes across three plans: anonymous guest-reserve data layer + Edge actions (06-01), send-email SMTP action + relay runbook (06-02), and guest/host UI + proofs (06-03). Sibling calendrier commits (f4d1b49, 52c3a4a, 8a17229) were explicitly excluded.

The SQL data layer (0089) and Edge function are carefully built: oracle uniformity, pessimistic locks, privilege lockdown, fail-closed SMTP, and header-injection stripping all check out. One functional gap breaks the headline feature end-to-end: the guest RPC sets `reserved_by_name` but never `purchased`, while the organizer UI gates both the "Réservé" badge and the "Libérer" release button on `purchased` — so anonymous holds are invisible to the owner and can never be released from the UI, and foyer members can walk into a CHECK-violation error trying to reserve an apparently-free item. Three warnings (unhandled refetch rejection, fragile ISO-string expiry comparison, TS type drift on `GiftItemRow`) and three info items round out the report.

## Critical Issues

### CR-01: Anonymous holds invisible to organizer UI; release control unreachable for them

**File:** `app/src/modules/cadeaux/cadeaux-page.tsx:629-648` (with root cause in `supabase/migrations/0089_gift_guest_reserve.sql:294-296` + `app/src/modules/cadeaux/types.ts:193-209`)
**Issue:** `guest_reserve_gift_item` sets only `reserved_by_name`; nothing ever sets `purchased = true` on an anonymous hold (no trigger exists — verified: only the guard trigger touches `gift_items`). But the owner branch renders the "Réservé" badge and the "Libérer" button exclusively on `item.purchased`:

```tsx
{item.purchased ? <Badge tone="amber">Réservé</Badge> : null}
...
{item.purchased && isManager ? ( ... Libérer ... ) : null}
```

Consequences:
1. An owner never sees that a guest reserved an item, and the D-08 "organizer releases any reservation" button — the feature this phase claims delivered — can never appear for anonymous holds. The SQL-layer release is proven (0029 does a direct manager UPDATE), but the UI affordance is dead code for exactly the reservation form this phase introduced.
2. Non-owner members are affected symmetrically: their badge is gated on `item.reservedBy` (member FK, `cadeaux-page.tsx:652`), and `toGiftItem` (`types.ts:193-209`) resolves names only via member lookup — `reserved_by_name` is dropped entirely (`GiftItemRow` has no such field). A member sees an anonymously-held item as free, attempts to reserve it, and eats a `gift_items_single_author_check` CHECK-violation error toast instead of a "déjà réservé" state.
3. The guest page itself is correct (RPC `reserved` boolean), so guest and organizer views disagree about the same item.

**Fix:** Pick one coherent signal and wire it through. Minimal option — treat either author form as "reserved" in the member mapping and gate the owner badge on it too:

```ts
// types.ts — toGiftItem needs the column first (see WR-03)
const heldAnonymously = (row.reserved_by_name ?? '').trim() !== '';
// owner badge / release gate: item.purchased || heldAnonymously
// member badge: item.reservedBy ? `Réservé par ${name}` : heldAnonymously ? 'Réservé' : null
```

Alternative (server-side): have `guest_reserve_gift_item` also set `purchased = true`, and have release clear it (it already does). Either way, the member-reserve path must also refuse anonymously-held items with a clean message instead of a CHECK violation — e.g. surface `reserved` state in `toGiftItem` and disable/conflict before the UPDATE.

## Warnings

### WR-01: Unhandled promise rejection on conflict-path refetch

**File:** `app/src/modules/cadeaux/guest-cadeau-page.tsx:188`
**Issue:** The 409-conflict branch calls `void viewQuery.refetch();` with no `.catch`, while the success branch two lines above (`:181`) correctly uses `void viewQuery.refetch().catch(() => {});`. If the server is unreachable at exactly that moment (the offline/demo case this page explicitly handles), the conflict path produces an unhandled promise rejection. Inconsistent with the file's own convention.
**Fix:**
```tsx
void viewQuery.refetch().catch(() => {});
```

### WR-02: Expiry check compares ISO strings lexicographically across formats

**File:** `supabase/functions/gift-list-invite/index.ts:542-546`
**Issue:** `inviteRow.expires_at <= new Date().toISOString()` is a string comparison between a PostgREST-serialized timestamptz (typically `…+00:00` suffix) and `toISOString()` (`…Z` suffix). Same-instant values with different suffixes misorder (`'+' < 'Z'`), and any non-ISO-canonical serialization breaks the comparison silently. The SQL RPCs correctly use `expires_at <= now()`; the Edge reimplementation should compare instants, not strings.
**Fix:**
```ts
if (
  !inviteRow?.list_id ||
  inviteRow.is_active !== true ||
  (inviteRow.expires_at != null && Number.isNaN(Date.parse(inviteRow.expires_at)) === false && Date.parse(inviteRow.expires_at) <= Date.now()) ||
  ...
```

i.e. replace the string `<=` with `Date.parse(inviteRow.expires_at) <= Date.now()` (fail closed on unparseable: treat as invalid → 404 oracle or 500, never as valid).

### WR-03: TS type drift — `GiftItemRow` missing `reserved_by_name`, worked around with `as unknown`

**File:** `app/src/types/database.ts:414-432`, `app/src/modules/cadeaux/api.ts:63-68`, `app/src/modules/cadeaux/cadeaux-page.tsx:394-399`
**Issue:** Migration 0089 added the `reserved_by_name` column and the 0001 SQL contract was updated, but the `GiftItemRow` interface was not. `updateGiftItem`'s parameter type therefore excludes the column, forcing the release path into `as unknown as Partial<GiftItemRow>` — a cast that silences exactly the class of mistake (wrong column name, wrong type) the type exists to catch. This drift is also what makes CR-01 invisible at compile time: `toGiftItem` cannot map a field the row type does not declare.
**Fix:**
```ts
// database.ts
export interface GiftItemRow {
  ...
  reserved_by: Uuid | null;
  reserved_by_name: string | null;  // migration 0089, D-05
  ...
}
```
```ts
// api.ts — extend the Pick
values: Partial<Pick<GiftItemRow, 'name' | 'price' | 'comment' | 'photo_url' | 'url' | 'reserved_by' | 'reserved_by_name' | 'purchased'>>,
```
then drop the `as unknown` cast at the call site.

## Info

### IN-01: `supabase!` non-null assertion in `callGiftInvite`

**File:** `app/src/modules/cadeaux/api.ts:243`
**Issue:** `supabase!.auth.getSession()` asserts non-null while the sibling `callGiftInvitePublishable` (`:357`) uses safe optional chaining for the same call. Safe by construction today (`supabase` and `supabaseFunctionsBase` derive from the same `isSupabaseConfigured` flag), but the inconsistency means a future refactor decoupling the two reintroduces a TypeError where a clean "Edge Function indisponible." was intended.
**Fix:** Mirror the publishable variant: `const session = (await supabase?.auth.getSession())?.data.session ?? null;` after the existing `supabaseFunctionsBase` guard.

### IN-02: Client-side invite-link check weaker than server

**File:** `app/src/modules/cadeaux/api.ts:537-538`
**Issue:** `sendGiftListInviteEmail` only checks the link is non-empty; the Edge validates a full URL (`z.string().url().max(2048)`). A malformed link passes client gates and fails server-side as a generic send error. Harmless (server is authoritative, error surfaces in `sendError`), but mirroring the URL check client-side would give the faster, clearer message.
**Fix:** Validate with `new URL(link)` (try/catch → 'Lien d’invitation invalide.') before the network call.

### IN-03: Rate-limit fallback key collapses all headerless clients into one bucket

**File:** `supabase/functions/gift-list-invite/index.ts:306-309`
**Issue:** `clientAddress` falls back to the literal `'inconnu'` when neither `x-forwarded-for` nor `cf-connecting-ip` is present, so all such clients share one rate-limit bucket per action (notably `send-email: 5/min`). Behind a proxy that strips headers, one user's sends consume everyone's quota — a self-DoS shape. Pre-existing pattern (inherited from `household-invite`), low likelihood in the target deployment where Traefik sets forwarding headers, hence info only.
**Fix:** Document the header assumption in the runbook, or key the fallback with a per-session/request distinguisher if the deployment ever fronts the function without forwarding headers.

---

_Reviewed: 2026-10-06T17:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
