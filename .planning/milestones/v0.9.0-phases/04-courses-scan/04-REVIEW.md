---
phase: 04-courses-scan
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - app/e2e/courses-scan.spec.ts
  - app/src/lib/data/seed.ts
  - app/src/lib/data/supabase-adapter.ts
  - app/src/modules/courses/api.ts
  - app/src/modules/courses/components/product-sheet.tsx
  - app/src/modules/courses/components/scan-dialog.tsx
  - app/src/modules/courses/components/shopping-group-card.tsx
  - app/src/modules/courses/courses-page.tsx
  - app/src/modules/courses/hooks/use-courses.ts
  - app/src/modules/courses/off-client.test.ts
  - app/src/modules/courses/off-rayon.ts
  - app/src/modules/courses/products-api.test.ts
  - app/src/modules/courses/products-photo.test.ts
  - app/src/modules/courses/scan-flow.test.tsx
  - app/src/modules/courses/suggestions.test.tsx
  - app/src/modules/courses/types.ts
  - app/src/test/mocks/off-handlers.ts
  - app/src/types/database.ts
  - supabase/migrations/0071_products.sql
  - supabase/tests/0001_schema_contract.sql
  - supabase/tests/0022_products.sql
findings:
  critical: 5
  warning: 17
  info: 4
  total: 26
status: issues_found
---

# Phase 04-courses-scan: Code Review Report

**Reviewed:** 2026-10-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 19 (+2 SQL contract/evidence files read for boundary checks)
**Status:** issues_found

## Summary

Reviewed the Courses scan vertical (OFF enrichment client, rayon mapping,
product resolution, product sheet, scan dialog, page wiring, hook suggestions,
migration 0071 + RLS tests, MSW/e2e harnesses). No hardcoded secrets, no
`eval`/`innerHTML`, no empty catches, and the RLS test matrix (0022) covers
inter-foyer isolation, child-role denial, spoofed `created_by`, EAN uniqueness
and `on delete set null` survival. That substrate is sound — but the review
still finds 5 Critical defects: an unvalidated OFF image URL rendered into
`<img>` and persisted into `off_data` (then re-rendered as suggestion photos),
a cross-household `product_id` link with no consistency guard, a re-scan
quantity off-by-one (`null → 1` after two physical scans), scans hard-wired to
`lists[0]` with no destination choice, and a non-atomic photo-then-create
two-step that orphans Storage objects and half-fails against the RLS
`created_by` check. 17 warnings and 4 infos follow, each with file:line
evidence and a concrete fix.

## Critical Issues

### CR-01: Unvalidated OFF `image_url` rendered and persisted (tracking / markup risk)

**File:** `app/src/modules/courses/off-client.ts:37-38,88`
**Issue:** The zod schema accepts any string for `image_front_url`/`image_url`
(no URL validation) and `toOffProduct` forwards it verbatim. This value is
rendered directly in `<img src={offProduct.imageUrl}>`
(`product-sheet.tsx:212`), persisted into `off_data.image_url`
(`products-api.ts:123`), then re-served as `photoUrl` fallback
(`use-courses.ts:144-148`) and rendered again in
`shopping-group-card.tsx:124-129`. OFF is a publicly editable database: any
editor can point a product's image at an attacker host (IP/fingerprint leak
for every household member who opens the sheet or the suggestions row), a
non-HTTPS host (mixed-content breakage), or a `data:`/`javascript:` payload.
React escapes text but does not sanitize URL schemes in attributes.
**Fix:**
```ts
// off-client.ts — validate at ingestion, single choke point
const IMAGE_RE = /^https:\/\/images\.openfoodfacts\.org\//;
function cleanImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && IMAGE_RE.test(u.href) ? u.href : null;
  } catch { return null; }
}
// use in toOffProduct:
imageUrl: cleanImageUrl(payload.product.image_front_url)
  ?? cleanImageUrl(payload.product.image_url),
```
Apply the same allowlist where `photoUrl` fallback is read
(`use-courses.ts:144`), so legacy poisoned rows cannot render.

### CR-02: `shopping_list_items.product_id` can link across households

**File:** `supabase/migrations/0071_products.sql:44-45`
**Issue:** The FK is `references public.products (id) on delete set null`
with no check that the referenced product's `household_id` equals the item's
`household_id`. A client in household A that guesses (or enumerates) a product
UUID from household B can link it to an A-item: the write passes RLS (the
item's own household is valid) and creates a cross-tenant reference the
schema contract never intended. `0022_products.sql` never probes this join,
and `0001 §5` only checks the pre-existing `align_household` trigger, which
does not cover the new column.
**Fix:**
```sql
-- forward-only migration 0072:
create or replace function private.products_match_household()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.product_id is not null and not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.household_id = new.household_id) then
    raise exception 'product_id must belong to the same household';
  end if;
  return new;
end; $$;
create trigger check_product_household before insert or update of product_id
  on public.shopping_list_items for each row
  execute function private.products_match_household();
```
Plus negative RLS tests: cross-household link must fail.

### CR-03: Re-scan quantity off-by-one (`null → 1` after two scans)

**File:** `app/src/modules/courses/products-api.ts:145-150`
**Issue:** First scan creates the item with `quantity: null`
(`products-api.ts:155`). Re-scan computes `(current.quantity ?? 0) + 1`, so
after **two** physical scans the row shows quantity `1` — the user bought two
units but the list says one. `null` implicitly means "one unit", so the
increment base must be 1, not 0. The existing test at
`products-api.test.ts:134` even locks in the wrong expectation
(`(first.item.quantity ?? 0) + 1`).
**Fix:**
```ts
quantity: (current.quantity ?? 1) + 1,
```
And fix the test to assert `2` after first re-scan; consider creating scanned
items with `quantity: 1` explicitly so the semantics are never implicit.

### CR-04: Every scan lands in `lists[0]` — destination cannot be chosen

**File:** `app/src/modules/courses/courses-page.tsx:121,307-315`
**Issue:** `handleDetected` hard-codes `const target = lists[0]` and the sheet
is mounted with `listId={lists[0].id}`. In a household with several lists
("Fresque", "Maison", …) the user cannot choose where the scanned product
goes; everything piles into whichever list sorts first. The empty-lists guard
(`toast('Créez d'abord une liste…')`) confirms the author knew the coupling
was fragile but left the wrong-list behavior in place.
**Fix:** Pass the currently visible list (or add a list `<Select>` inside
`ProductSheet`, defaulting to `lists[0]`). At minimum, derive the target from
the card that opened the scanner instead of global `lists[0]`:
```tsx
const [scanTargetListId, setScanTargetListId] = useState<string | null>(null);
// open scanner from a specific card; handleDetected uses scanTargetListId ?? lists[0].id
```

### CR-05: Photo upload is a non-atomic two-step (orphan files + half-failure)

**File:** `app/src/modules/courses/components/product-sheet.tsx:129-161`
**Issue:** The flow is (1) `depositHouseholdFile` to the private bucket, (2)
`resolveScannedProduct`, (3) a **second** `data.update(... {photo_url})`. If
(2) fails (RLS, offline, validation), the uploaded file is orphaned in Storage
with no cleanup. Worse, if the product already existed and was created by a
*different* member, step (3) violates the update policy
(`created_by = current_member_id`, `0071:79-85`) — the item is added but the
photo write throws, producing a confusing error toast over a half-success.
**Fix:** Create the product with `photo_url` in a single write (extend
`FindProductInput`/`productPayload` with `photoUrl`), and on any failure after
a successful deposit, delete the deposited object:
```ts
try {
  // ... deposit, then resolve with photoUrl included
} catch (e) {
  if (deposited) await removeHouseholdFile(deposited.path).catch(() => {});
  throw e;
}
```

## Warnings

### WR-01: `offProductFromRow` drops `categoriesTags` → wrong rayon prefill + data loss

**File:** `app/src/modules/courses/products-api.ts:94-106,109-129`
**Issue:** `offProductFromRow` hard-codes `categoriesTags: []`, and
`productInputFromOff` never persists `categories_tags` into `off_data` (only
`code/brands/image_url/lang/fetched_at`). Consequence: opening the sheet for
an already-known product always suggests rayon `Divers`
(`product-sheet.tsx:51` derives from empty tags), discarding the stored
`category`. The rayon derivation is unreproducible from the stored row.
**Fix:** Persist `categories_tags` (capped, e.g. first 20, each ≤ 200 chars)
in `offData`, and rehydrate it in `offProductFromRow`.

### WR-02: Up-to-16 s dead silence between scan and sheet (no pending state)

**File:** `app/src/modules/courses/courses-page.tsx:127-142`
**Issue:** `sheetOpen(true)` fires in `finally` **after** `await
fetchOffProduct` (8 s timeout × 1 retry). The scan dialog is already closed,
nothing is shown meanwhile — the user assumes the scan failed and scans again,
stacking requests. The MSW timeout test proves the 8 s path is real.
**Fix:** Open the sheet optimistically with a loading state (`scanOff ===
undefined` = "enriching…"), filling it when the promise settles; or keep the
scan dialog open with a spinner until resolution.

### WR-03: Double-scan race + scanner callback churn

**File:** `app/src/modules/courses/courses-page.tsx:114`, `app/src/modules/courses/components/scan-dialog.tsx:31-33`
**Issue:** `handleDetected` is a new closure every render, so the
`useCallback((result) => onDetected(...))` given to `useBarcodeScanner`
changes every render — the scanner re-subscribes continuously (duplicate or
dropped detections). Separately, two rapid detections interleave
`setScanEan`/`setScanOff` with no staleness guard: the sheet can show EAN #1
with OFF data #2.
**Fix:** `useCallback` for `handleDetected`; sequence-number or `AbortController`
guard so only the latest detection populates the sheet.

### WR-04: Network failure misreported as "unknown product"

**File:** `app/src/modules/courses/courses-page.tsx:137-138`, `app/src/modules/courses/off-client.ts:111-118`
**Issue:** `catch { setScanOff(null); }` maps timeout/offline/5xx to the same
`null` as a genuine 404, so the sheet invites the user to "name it for your
household" when the product may exist on OFF. Creates duplicate, divergent
household products for one EAN.
**Fix:** Distinguish `OffResult = { status: 'found' | 'unknown' | 'error' }`
and render "enrichment unavailable — retry" vs "unknown — create manually".

### WR-05: No DB length guards on `brand` / `category` / `photo_url` (storage abuse)

**File:** `supabase/migrations/0071_products.sql:25-30`
**Issue:** Only `name` has a length CHECK. `brand`, `category`, `photo_url` are
unbounded `text`; any writer-role member can store megabytes per row via
direct SQL (RLS permits it), and `photo_url` can carry an OFF hotlink,
defeating D-05 at the boundary that matters. App-side slicing is not a
substitute for a CHECK.
**Fix (forward-only migration):**
```sql
alter table public.products
  add constraint products_brand_len check (brand is null or char_length(brand) between 1 and 200),
  add constraint products_category_len check (category is null or char_length(category) <= 60),
  add constraint products_photo_url_len check (photo_url is null or char_length(photo_url) <= 2000);
```

### WR-06: Suggestion `rayon` is last-wins, not most-frequent (comment lies)

**File:** `app/src/modules/courses/hooks/use-courses.ts:116-132`
**Issue:** The comment promises "le rayon le plus souvent associé" but the
loop overwrites `entry.rayon` on every repeat — the **last** row's category
wins, not the mode. Quick-add (`addItemToList`) then files items under the
wrong rayon.
**Fix:** Count per `(name, rayon)` pair and keep the max, or keep first-wins
and correct the comment.

### WR-07: `deleteShoppingList` is N+1 non-atomic (orphan race + half-delete)

**File:** `app/src/modules/courses/api.ts:29-37`
**Issue:** Lists items, deletes them one by one with `Promise.all`, then
deletes the list. An item added between the `list` and the deletes survives
with a dangling `list_id`; any single failure leaves a half-deleted list.
There is no server transaction and no FK-cascade cited.
**Fix:** Add `on delete cascade` from items to lists (forward migration) or a
single `removeWhere`, and on failure surface which step failed instead of
leaving partial state.

### WR-08: Personal email baked into every OFF request (PII leak)

**File:** `app/src/modules/courses/off-client.ts:11`
**Issue:** `OFF_USER_AGENT = 'EnsembleOrganises/1.0 (jeremymaillot@gmail.com)'`
ships a personal address to a third party on **every** scan, from every user —
a PII disclosure the user never consented to, plus a spam-harvestable string
in the public bundle. A custom `X-User-Agent` header also forces a CORS
preflight on each call.
**Fix:** Replace with a role address (`contact@example.fr` / project contact)
read from build config, and confirm with one live preflight that OFF still
accepts the header; otherwise send it only when reachable without preflight
failure.

### WR-09: No debounce/rate-limit on scan → OFF hammering

**File:** `app/src/modules/courses/off-client.ts:99-118`, `app/src/modules/courses/courses-page.tsx:114-143`
**Issue:** Each detection fires a fetch (+1 retry on any failure). A camera
held over a barcode emits many detections; N users rescanning the same EAN
emit N×2 requests. No in-flight dedup, no cache, no backoff. The retry test
(`off-client.test.ts:65-76`) proves the ×2 factor.
**Fix:** In-flight map keyed by EAN (share the promise), short TTL cache
(~5 min) for 404s as well as hits, and only retry on abort/network — never on
HTTP 5xx without backoff.

### WR-10: Photo gate checks MIME prefix only — SVG passes, no size cap

**File:** `app/src/modules/courses/components/product-sheet.tsx:97-101`
**Issue:** `file.type.startsWith('image/')` admits `image/svg+xml`
(active-content container) and relies on a fully spoofable client MIME; there
is no size guard before `compressImage` (a 100 MB "photo" goes straight to
decode). Safety currently depends on `compressImage` rasterizing — an
assumption, not a check.
**Fix:** Allowlist `['image/jpeg','image/png','image/webp','image/heic']`,
reject `image/svg+xml` explicitly, enforce `file.size <= 15_000_000`, and treat
empty `file.type` by sniffing via decode failure rather than hard reject.

### WR-11: Photo preview object URL leaks on unmount/close

**File:** `app/src/modules/courses/components/product-sheet.tsx:68-83,89-92`
**Issue:** `URL.createObjectURL` is revoked on reopen/change but never on
dialog close or component unmount — every scanned photo leaks one blob URL
for the session lifetime.
**Fix:** Revoke in the effect cleanup and when `onOpenChange(false)` fires.

### WR-12: `nextCourse` regex matches "concours", "discours", …

**File:** `app/src/modules/courses/hooks/use-courses.ts:36,186-194`
**Issue:** `/cours/i` is a substring match: "Concours de pétanque",
"Discours", "Recours" all surface as "Prochaine course" with a weekday badge.
**Fix:** `/\bcours(es)?\b/i` and exclude obvious compounds, or match a
dedicated event category instead of title wool.

### WR-13: Quantity parsing accepts negatives, hex, exponents

**File:** `app/src/modules/courses/hooks/use-courses.ts:217-222`
**Issue:** `Number(values.quantity)` accepts `-3`, `0x10`, `1e3`, `Infinity`
(filtered) — negative quantities persist with no CHECK anywhere. Quick-add
paths bypass even this.
**Fix:** Validate `Number.isInteger(q) && q > 0 && q <= 9999`, else `null`;
mirror with a DB CHECK in a forward migration.

### WR-14: Loading/error/refetch ignore the events + products resources

**File:** `app/src/modules/courses/hooks/use-courses.ts:322-329`
**Issue:** `isLoading` omits `eventResource.isLoading` (the "Prochaine
course" panel flashes "aucune course planifiée" while events load),
`isError`/`error` omit `eventResource` and `productResource` entirely, and
`refetch` skips both — retrying after a products failure does nothing.
**Fix:** Include all four resources in `isLoading`/`isError`/`error`, and
refetch all four.

### WR-15: Update policy lets a product be moved to another household

**File:** `supabase/migrations/0071_products.sql:79-85`
**Issue:** The UPDATE `WITH CHECK` requires `can_write_household(new
household_id)` — a member of two households can reassign a product (and its
OFF corpus + photo) to the other household, exfiltrating household A's
catalogue into B. Same remark applies to the `created_by` self-write clause,
which is fine, but `household_id` itself must be immutable.
**Fix (forward migration):** trigger rejecting `new.household_id IS DISTINCT
FROM old.household_id`, or strip `household_id` from the update path with a
`BEFORE UPDATE` guard.

### WR-16: API boundary validates nothing — raw DB errors reach the toast

**File:** `app/src/modules/courses/products-api.ts:40-51`, `app/src/modules/courses/api.ts:39-52`
**Issue:** `productPayload` trims but never rejects an empty name or a
non-queryable EAN; `createShoppingItem` trims but has no min/max. Violations
surface as raw PostgREST/CHECK messages in the user-facing toast
(`product-sheet.tsx:186`). Empty-string EAN with `findOrCreateProduct` leans
entirely on the DB check for correctness.
**Fix:** Throw `Error('…')` with FR copy at the API boundary (name 1–200,
`isQueryableEan` for product EANs) before any `data.*` call.

### WR-17: `tagKey` misses uppercase / long language prefixes

**File:** `app/src/modules/courses/off-rayon.ts:61-63`
**Issue:** `/^[a-z]{2}:/` only strips lowercase 2-letter prefixes. `EN:dairies`
or any non-2-letter prefix keeps its prefix, misses the table, and degrades
to `Divers` — silent misclassification with no log.
**Fix:** `/^[a-z]{2,3}:/i`.

## Info

### IN-01: Duplicate interface declarations merge silently

**File:** `app/src/types/database.ts:245-254,483-492`
**Issue:** `NoteAttachmentRow` and `PetAttachmentRow` are each declared twice,
identically. TypeScript merges them without error, so the duplication is
invisible to `typecheck` — but the next edit that touches only one copy will
silently change the merged shape (or conflict).
**Fix:** Delete the second copy of each (keep one canonical declaration).

### IN-02: Redundant index on `(household_id, ean)`

**File:** `supabase/migrations/0071_products.sql:42`
**Issue:** `constraint products_ean_per_household unique (household_id, ean)`
already creates a btree on exactly these columns; the explicit
`products_household_ean_idx` doubles write/index cost for zero planner gain.
**Fix:** Drop the explicit index in a forward migration (keep the constraint).

### IN-03: Demo seed has no `products` rows — D-03/D-06 unexercised in demo

**File:** `app/src/lib/data/seed.ts:887-927`
**Issue:** `seedTables` contains no `products` key, so the demo household —
the exact surface the Playwright spec drives — never shows catalogue-first
suggestions and never exercises the offline known-EAN path with real seed
data. Tests inject products ad hoc, hiding the gap.
**Fix:** Add 2–3 demo products (one with `photo_url`, one OFF-only fallback)
plus a linked `shopping_list_items.product_id`.

### IN-04: `supabase-adapter.ts` household scope list is advisory but unchecked

**File:** `app/src/lib/data/supabase-adapter.ts:11-49`
**Issue:** `HOUSEHOLD_SCOPED` includes `products` (correct — it has
`household_id`) but also `households` itself, which has no `household_id`
column — `cacheRows` then files household rows under `householdId: ''`,
making offline household filtering unreliable. No test asserts the set
matches real columns.
**Fix:** Remove `households` from the set (or special-case it) and add a test
that every entry has a `household_id` column per the schema contract.

---

_Reviewed: 2026-10-05T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
