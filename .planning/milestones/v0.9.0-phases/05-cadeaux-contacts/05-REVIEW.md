---
phase: 05-cadeaux-contacts
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - app/e2e/cadeaux-contacts.spec.ts
  - app/e2e/critical-paths.spec.ts
  - app/src/app/app-shell.test.tsx
  - app/src/app/router.tsx
  - app/src/components/shared/mobile-drawer.tsx
  - app/src/lib/data/seed.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/lib/modules.ts
  - app/src/modules/anniversaires/anniversaires-aggregation.test.tsx
  - app/src/modules/anniversaires/anniversaires-page.tsx
  - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
  - app/src/modules/anniversaires/hooks/use-anniversaires.ts
  - app/src/modules/anniversaires/types.ts
  - app/src/modules/cadeaux/api.ts
  - app/src/modules/cadeaux/cadeaux-page.test.tsx
  - app/src/modules/cadeaux/cadeaux-page.tsx
  - app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx
  - app/src/modules/cadeaux/components/gift-share-dialog.tsx
  - app/src/modules/cadeaux/hooks/use-cadeaux.ts
  - app/src/modules/cadeaux/types.ts
  - app/src/modules/calendrier/calendrier-page.test.tsx
  - app/src/modules/contacts/api.ts
  - app/src/modules/contacts/components/contact-form-dialog.tsx
  - app/src/modules/contacts/contacts-page.test.tsx
  - app/src/modules/contacts/contacts-page.tsx
  - app/src/modules/contacts/hooks/use-contacts.ts
  - app/src/modules/contacts/types.ts
  - app/src/modules/dashboard/dashboard-page.test.tsx
  - app/src/types/database.ts
  - supabase/functions/gift-list-invite/index.ts
  - supabase/migrations/0076_gift_ideas.sql
  - supabase/migrations/0077_contacts.sql
  - supabase/migrations/0078_birthday_mirror.sql
  - supabase/migrations/0079_gift_invites.sql
  - supabase/migrations/0080_gift_items_mask.sql
  - supabase-project/docker-compose.traefik.yml
  - supabase/tests/0001_schema_contract.sql
  - supabase/tests/0024_gift_ideas.sql
  - supabase/tests/0025_contacts_mirror.sql
  - supabase/tests/0026_gift_invites.sql
findings:
  critical: 0
  warning: 7
  info: 5
  total: 12
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 41 (full phase scope `dd12a64..HEAD`: migrations 0076–0080, tests 0024–0026 + 0001, Edge `gift-list-invite`, cadeaux/contacts/anniversaires modules, e2e spec)
**Status:** issues_found

## Summary

Phase 05 delivers a coherent, well-tested whole: foyer-scoped RLS with `search_path = ''` everywhere, RPC-only invite tables, a uniform-oracle redeem, and honest non-vacuous SQL assertions. No crash, data-loss, or auth-bypass defect was proven — hence **zero Critical**. But adversarial reading surfaced 7 Warnings that are real, line-cited defects: two dead error-mapping branches in the Edge (curly vs straight apostrophe, byte-verified), a non-uniform oracle via the e-mail-format path the tests never cover, the masked view `gift_items_for_list` shipped yet never queried by the app (enforcement rests on a JSX conditional plus a usage rule the code itself violates), a silent skip of the D-10 contact creation when lists haven't loaded, a mirror trigger blind to cross-household moves, a one-way `offert` propagation that goes stale on revert, and duplicated table interfaces in `database.ts`. Five Info items round out copy-paste labels, silent coercions, and permission asymmetries.

## Warnings

### WR-01: Dead error-mapping branches in Edge — curly apostrophe never matches SQL message

**File:** `supabase/functions/gift-list-invite/index.ts:268,274`
**Issue:** `translateRpcError` tests `message.includes('nombre d’utilisations invalide')` and `message.includes('empreinte d’invitation invalide')` with U+2019 RIGHT SINGLE QUOTATION MARK (byte-verified: `0x2019` in the source line), while migration 0079 raises them with a straight ASCII apostrophe (`'nombre d''utilisations invalide'`, `'empreinte d''invitation invalide'` → `0x27` at runtime). `String.includes` therefore never matches: an invalid `maxUses` and an invalid fingerprint both fall through to the generic `500 'Opération impossible.'` instead of the intended `400 'Paramètres de partage invalides.'` / `500` mapping. Same family bug may exist in the sibling `ardoise-invite` it was copied from — worth a grep.
**Fix:**
```ts
// Compare against the exact server literal (straight apostrophe), or normalize first:
const normalized = message.replace(/[\u2018\u2019]/g, "'");
if (normalized.includes("nombre d'utilisations invalide")) ...
```

### WR-02: Redeem oracle is not uniform — e-mail-format error distinguishes valid codes

**File:** `supabase/migrations/0079_gift_invites.sql:348-354` + `supabase/functions/gift-list-invite/index.ts:271-273`
**Issue:** The claimed uniform oracle (`code invalide` for every failure, T-05-04) holds at SQL level for unknown/expired/exhausted/revoked codes — all covered by 0026 §6. But the e-mail-format check happens *after* code lookup and raises a *distinct* message (`adresse e-mail invalide` → HTTP 400), while an unknown code yields 404. So `redeem(validCode, email='!!!')` → 400 but `redeem(invalidCode, email='!!!')` → 404: a code-validity oracle. Brute force is impractical (128-bit HMAC codes + per-IP rate limit), so impact is low — but the "oracle unique" security claim in 0079's header, the SUMMARY Threat Flags, and 0026 §6 is overstated, and the e-mail path is exactly the one assertion never covers.
**Fix:** Return the uniform `code invalide` for malformed e-mail too when the caller is not already a household member (validate e-mail shape *before* code lookup, or map both to the same 404 at the Edge):
```sql
-- option: validate email first, raise 'code invalide' to preserve the oracle
```

### WR-03: Masked view `gift_items_for_list` is dead code — app reads raw `gift_items`

**File:** `supabase/migrations/0080_gift_items_mask.sql:14-17` + `app/src/modules/cadeaux/api.ts:25`
**Issue:** 0080 documents as a usage rule: "l'UI lit les articles d'une liste via `gift_items_for_list`, jamais la table brute." A repo-wide grep proves the opposite: nothing under `app/` or `supabase/functions/` references `gift_items_for_list`. `fetchCadeauxSnapshot` loads raw `gift_items` (with `reserved_by`) for every list, and `toGiftItem` exposes it. Current display happens to mask the owner via a JSX conditional (`cadeaux-page.tsx:532` `activeList?.isOwned ? null : …`), so no user-visible leak today — but the documented server-side barrier is fiction, the full `reserved_by` column sits in client memory, and any future consumer (search, widget, export) leaks the surprise by default. Either wire the UI to the view or delete the view and document JSX-masking as the (fragile) mechanism.
**Fix:**
```ts
// fetchCadeauxSnapshot: read through the masked view instead of the raw table
data.list<GiftItemRow>('gift_items_for_list', { household_id: householdId }),
```
(or remove 0080 and downgrade the claim in its header comment + SUMMARY Threat Flags).

### WR-04: D-10 "create contact" silently skipped when contact lists haven't loaded

**File:** `app/src/modules/anniversaires/hooks/use-anniversaires.ts:60-63`
**Issue:** In `saveMutation`, when `values.createContact` is set but `contactLists` is still empty (async resource not yet loaded — the exact race class this phase already hit twice: contact-form-dialog listId, e2e chromium), `target` is `null` and the `if (target)` block is skipped with **no error, no toast**: the birthday is saved, the user believes the contact was created (checkbox was on), and nothing ever reports the miss. Server seed guarantees lists exist, but the client snapshot may lag.
**Fix:**
```ts
if (!id && values.createContact) {
  const target = contactLists.find(...) ?? contactLists[0] ?? null;
  if (!target) throw new Error('Listes de contacts pas encore chargées : réessayez.');
  await createContactFromBirthday({ ... }); // keep existing try/catch wrapping
}
```

### WR-05: Mirror trigger blind to list/household moves — orphan mirror stays in wrong foyer

**File:** `supabase/migrations/0078_birthday_mirror.sql:99-101`
**Issue:** `mirror_contact_birthday` fires only on `UPDATE OF birth_date, name, photo_url`. If a contact is moved to another list/household (`list_id` / `household_id` change — permitted by RLS + realigned by `align_household`), the trigger does not fire and the mirror row keeps the **old** `household_id` with `contact_id` pointing at a contact that now lives elsewhere: stale birthday visible to the former foyer (cross-tenant staleness), and the D-10 guard (household-scoped) can then create a *second* mirror in the new foyer for the same contact.
**Fix:**
```sql
create trigger mirror_contact_birthday
  after insert or update of birth_date, name, photo_url, list_id, household_id on public.contacts
  ...
-- plus: in the function, update b.household_id = NEW.household_id when following an existing mirror
```

### WR-06: `offert` propagation is one-way — reverting leaves `purchased = true` stale

**File:** `supabase/migrations/0078_birthday_mirror.sql:106-128` + `app/src/modules/cadeaux/cadeaux-page.tsx:208-220`
**Issue:** `propagate_idea_gifted` fires `WHEN (NEW.status = 'offert')` and sets linked items `purchased = true`. The UI explicitly offers the reverse transition (`handleToggleIdeaStatus` toggles `offert` ↔ `a_offrir`, toast "Idée remise à offrir"), but nothing ever resets `purchased`: after a revert, articles remain marked bought with no record of which rows the trigger touched. Either the revert path is a lie in the UI or the trigger is incomplete.
**Fix:** Document one-way as intended (and say so in the toast), or track provenance — e.g. only auto-set `purchased` where it was false *and* record `idea_id`-driven rows, clearing them on revert to `a_offrir`.

### WR-07: Duplicate table interfaces in `database.ts` — silent-divergence risk

**File:** `app/src/types/database.ts:442-474` vs `:484-513`
**Issue:** `ContactListRow` and `ContactRow` are each declared **twice** (~30 lines apart, once with `Uuid` ids, once with `string` ids). TypeScript merges them silently (`Uuid = string`, typecheck stays green), which is exactly why it's dangerous: the next editor will update one declaration and believe the type changed, while the merged result may not. `GiftIdeaRow` sits between them, suggesting a bad merge of two additions (05-03 client API + 05-05 types).
**Fix:** Delete one declaration block (keep a single `ContactListRow`/`ContactRow` pair).

## Info

### IN-01: Copy-paste labels — wrong nouns in three user-facing strings

**File:** `app/src/modules/cadeaux/components/gift-share-dialog.tsx:260`, `app/src/modules/cadeaux/cadeaux-page.tsx:283,521`
**Issue:** `GiftShareDialog` (a *list*-sharing dialog) is titled "Partager cette idée"; deleting a gift *article* toasts "Idée supprimée." and its aria-label reads "Supprimer l'idée". Cosmetic, but the phase's own UX bar is high and these are the exact strings a11y/QA will quote.
**Fix:** "Partager cette liste", "Article supprimé.", `aria-label={`Supprimer l’article ${item.name}`}`.

### IN-02: `parsePrice` coerces garbage to 0 and the schema accepts it

**File:** `app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx:28-31`
**Issue:** `parsePrice` returns `0` for any non-finite input, and the Zod refine (`value === '' || parsePrice(value) >= 0`) therefore *accepts* arbitrary strings as price 0. Unreachable via `type="number"` inputs today, but the validator proves nothing — a malformed programmatic value silently becomes "free".
**Fix:**
```ts
const parsePrice = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
};
// refine: value === '' || (Number.isFinite(parsePrice(value)) && parsePrice(value) >= 0)
```

### IN-03: Persisted `photoUrl` accepts `blob:` URLs that die with the session

**File:** `app/src/modules/contacts/components/contact-form-dialog.tsx:21-24`
**Issue:** The photo schema explicitly allows `blob:` URLs, and such a value would be persisted to `contacts.photo_url` — a session-local object URL that 404s everywhere after reload. The file-picker path deposits properly; only a hand-typed/pasted `blob:` value triggers it.
**Fix:** Refuse `blob:` in the schema (`/^(\/|https?:\/\/)/`), keeping it as a transient preview mechanism only.

### IN-04: Members cannot delete contacts from their own personal list (admin-only delete)

**File:** `supabase/migrations/0077_contacts.sql:230-232`
**Issue:** `contacts_delete` requires `is_household_admin`, so a member who created a contact in their *own* personal list cannot remove it and must ask an admin — while create/update on that same row are owner-permitted. Consistent with the list-level rule ("suppression réservée aux admins", OQ-2) but a UX trap worth one line in the UI empty-state or docs; flagging so the asymmetry is a decision, not an accident.

### IN-05: Contact seed refires on every member UPDATE; personal-list name goes stale

**File:** `supabase/migrations/0077_contacts.sql:364-367,318-334`
**Issue:** `ensure_default_contact_list` is `AFTER INSERT OR UPDATE` on `household_members`, so *any* member update (display-name change, role flip, color tag) re-runs the full seed loop — harmless (idempotent `NOT EXISTS`) but wasteful, and the personal list keeps the *arrival-time* `display_name` forever (rename the member, the list name lies). Also note the business-rule guard uses errcode `42501` (insufficient_privilege) for "last default list", which PostgREST surfaces like a permission error.
**Fix (suggestion):** Narrow the trigger to `AFTER INSERT OR UPDATE OF role` … or accept and document; use errcode `P0001`/`23505`-family-neutral for the guard instead of `42501`.

---

_Reviewed: 2026-10-05_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
