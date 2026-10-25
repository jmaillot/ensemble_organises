# Phase 3 — Courses scan (OpenFoodFacts) — Research

**Researched:** 2026-10-05
**Domain:** Barcode scan → OpenFoodFacts enrichment → household product catalog linked to shopping-list items
**Confidence:** HIGH (OFF API verified by live probes this session + official docs; repo patterns read in source)

## Summary

The OpenFoodFacts (OFF) read API needs **no Edge proxy**: live probes from this session confirm `access-control-allow-origin: *` on both `GET` and `OPTIONS` preflight, so a direct browser `fetch` works. Reads are keyless `GET https://world.openfoodfacts.org/api/v2/product/{ean}.json` with a `fields=` selector to keep payloads small. The three response shapes that matter were all verified live: found (`HTTP 200` + `status:1`), unknown EAN (`HTTP 404` + `status:0/"product not found"` — the 404 status is the discriminator, not just the body), invalid code (`HTTP 200` + `status:0/"no code or invalid code"`).

The in-repo reuse surface is unusually complete: the Fidélité scanner hook, the native image-compression helper, the private Storage bucket, the generic `useResource` + Dexie offline layer, and the foyer-plat RLS generator all exist and were read in source. **No new npm package is required** (`fetch` + `zod@4.6.5` already in `app/package.json`). MSW is a declared devDependency (`msw@2.15.0`) with zero existing handlers — this phase writes the first ones.

**Primary recommendation:** direct browser calls to OFF v2 (`fields=`-limited, 8 s `AbortController` timeout, `X-User-Agent` attribution header) with graceful degradation to manual creation (D-01); persist per-household `products` rows (never OFF hotlinks, D-05); link via nullable `shopping_list_items.product_id SET NULL`.

## User Constraints (from CONTEXT.md — LOCKED)

- **D-01:** Barcode absent from OFF (or offline) → manual creation proposed (name + rayon + photo), saved in household products.
- **D-02:** The product sheet's primary button does two things in one tap: save the product AND add it to the current shopping list.
- **D-03:** Item entry suggests household products first (name, rayon, photo), before existing item history.
- **D-04:** Re-scan of a product already in the list → quantity +1 on the existing item + toast, never a duplicate.
- **D-05:** Uploaded + home-compressed photo (WebP/JPEG, private Storage bucket) takes priority; OFF URL only as fallback when no local photo. **Reversibility: costly** — photo URLs are persisted and served to clients.
- **D-06:** Household product catalog in Dexie cache: list-add and manual creation work offline, sync on return. Scan itself needs the camera (hardware), not network for already-known EANs.
- **Agent's discretion (mine to decide):** OFF call strategy (cache, 8 s timeout, anti-CORS Edge proxy), exact sheet shape, inter-household EAN duplicate handling.
- **Deferred:** none. **Out of scope:** price comparison, receipt import, stock management.

## API Findings (OpenFoodFacts — all verified this session)

### Endpoint and version

- **Read endpoint:** `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json` [CITED: https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/scanning-barcodes/ — the current official scan tutorial prescribes exactly this v2 call].
- **v2 vs v3:** v3 (latest v3.6) is current; **v2 is deprecated but still supported** for backward compatibility [CITED: https://openfoodfacts.github.io/openfoodfacts-server/api/]. The official scan tutorial still uses v2 for the scan flow. **Recommendation: v2 for product reads** (stable, `fields=` documented, tutorial-backed); v3 migration is a later, mechanical change. `GET /api/v3/product/…` was probed returning `200` [VERIFIED: live probe], so the fallback path exists.
- Host `api.openfoodfacts.org` also answers `200` [VERIFIED: live probe], but `world.openfoodfacts.org` is the documented canonical host — use it. `fr.openfoodfacts.org` answers `200` [VERIFIED: live probe] but is unnecessary: prefer `world` + language param below.
- **Payload limiter:** `?fields=code,product_name,brands,image_url,…` returns only the listed fields [CITED: cheatsheet `ref-cheatsheet/`; VERIFIED: live probe returned exactly the requested subset].

### Response shapes (verified live 2026-10-05)

| Case | HTTP | Body | Handling |
|------|------|------|----------|
| Found (e.g. `3017620422003` Nutella) | `200` | `{"status":1,"status_verbose":"product found","product":{"code","product_name":"Nutella","brands":"Nutella, Ferrero","image_front_url","image_url","lang":"fr","categories_tags":[...]}}` | Map to sheet + persist |
| Unknown EAN, valid checksum (`2999999999991`) | **`404`** | `{"code":"…","status":0,"status_verbose":"product not found"}` | **D-01 manual creation** — the 404 status is the discriminator |
| Invalid code (`0000000000017`) | `200` | `{"status":0,"status_verbose":"no code or invalid code"}` (server strips/echoes `code:"00000017"`) | Treat as invalid input, offer manual entry |

- **Critical implementation note:** `fetch` does NOT reject on 404 — `fetchOffProduct` must branch on `response.status === 404` explicitly and must not let a 404 fall into the generic network-error path [VERIFIED: live probe].
- Useful product fields observed: `product_name`, `product_name_fr`, `brands`, `image_url`, `image_front_url`, `categories_tags` (e.g. `en:spreads`, `fr:Pâtes à tartiner`), `lang`, `lc`, `nutriments` (present but out of scope — store, don't surface).

### CORS verdict: DIRECT browser calls — no Edge proxy required

- `OPTIONS` preflight from an `Origin:` returns `204` with `access-control-allow-origin: *`; `GET` returns `access-control-allow-origin: *` [VERIFIED: live probe with `Origin: https://app.example.fr`].
- Allowed headers include `X-User-Agent` (`access-control-allow-headers: …User-Agent,X-User-Agent,…`) [VERIFIED: preflight response]. Browsers forbid setting `User-Agent` directly, so **send attribution via `X-User-Agent`** — it is pre-approved for cross-origin use.
- **Consequence:** the phase-spec's "CORS → Edge proxy" risk is retired by measurement. The `discretion` item "proxy Edge anti-CORS" resolves to **no proxy** (justification below).

### Rate limits and attribution (official docs — [CITED: https://openfoodfacts.github.io/openfoodfacts-server/api/])

- **15 req/min/IP** for product reads; 10 req/min/IP for search (don't use search-as-you-type — not needed here).
- **No rate-limit response headers** are exposed (probed for `ratelimit|retry|limit` — none) [VERIFIED: live probe]; over-limit yields IP ban or global `HTTP 503`. Client must therefore self-throttle (debounce per scan, no retry storm) and degrade to manual creation.
- **Attribution mandatory:** custom User-Agent `AppName/Version (ContactEmail)` for reads (no auth needed for reads) [CITED]. From the browser: `X-User-Agent: EnsembleOrganises/<version> (<contact-email>)`. The contact email is an open question (OQ-2).
- Terms: data under ODbL, images under CC BY-SA [CITED]. Filling the [API usage form](https://docs.google.com/forms/d/e/1FAIpQLSdIE3D8qvjC_zRJw1W8OmuHhsWJ_NSckiiniAHlfaVwUZCziQ/viewform) is requested by OFF (OQ-3, non-blocking).
- Server normalizes barcodes itself (pads short codes with leading zeros to 13 digits) — **do not pre-normalize** beyond trimming [CITED: scan tutorial "You should not try to normalize barcodes"].

### Language handling (verified live)

- `?lc=fr` echo confirmed (`"lc":"fr"`), `product_name_fr` field available, `lang:"fr"` on French products [VERIFIED: live probe].
- **Recommendation:** always request `world.openfoodfacts.org` with the needed `*_fr` fields in `fields=`; display `product_name_fr ?? product_name`; derive rayon from `categories_tags` via the `off-rayon.ts` map with `normalizeRayon` fallback to `Divers`.

## Recommended Architecture: DIRECT (no Edge proxy)

```
Caméra → useBarcodeScanner ──EAN──▶ fetchOffProduct (fetch direct OFF, 8 s timeout)
                                          │ 200/status:1 → fiche pré-remplie
                                          │ 404 / status:0 / timeout / offline
                                          │   → création manuelle (D-01)
                                          ▼
Fiche 1-tap (D-02) → products (upsert par foyer+EAN) + item (ou quantité+1, D-04)
                                          ▼
Photos: compressImage → depositHouseholdFile(folder 'products') prioritaire (D-05)
OFF image_url: affichage transitoire uniquement, jamais persistée comme photo principale
                                          ▼
Offline: Dexie rows(products) + mutations queue → sync au retour (D-06)
Realtime: channel table:products → invalidation TanStack Query
```

**Justification (direct vs Edge proxy):**

1. CORS is provably open (`ACAO: *`) — the only technical reason for a proxy does not exist [VERIFIED].
2. Reads are keyless GETs — no secret to hide server-side, no auth to broker.
3. Rate limits are **per client IP** ("If your requests come from your users directly, the rate limits apply per user" [CITED]) — a proxy would concentrate all households behind one egress IP and hit 15 req/min far sooner.
4. A proxy adds latency, infra (deploy + monitor a function), and a new failure mode for zero gain. The repo's Edge pattern (`ardoise-invite`) stays available if OFF ever locks down CORS — the fallback is documented, not built.

**Call strategy (agent's discretion, decided):** `fetch` with `AbortController` timeout 8000 ms; `fields=` limited to `code,product_name,product_name_fr,brands,image_front_url,categories_tags,lang`; `X-User-Agent` attribution; no retries on 404/invalid (immediate manual path), single retry on network error/timeout then manual path; TanStack Query caches successful OFF responses in-memory, Dexie `products` rows are the durable offline catalog (D-06).

## Data Model Sketch

```sql
-- forward-only migration, conventions 0050/0003: text id via private.new_id,
-- household_id explicite, audit created_at, search_path='' partout.
create table public.products (
  id text primary key default private.new_id('product'),
  household_id text not null references public.households (id) on delete cascade,
  ean text not null check (ean ~ '^\d{8,14}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  brand text,
  category text,                       -- rayon (contrainte applicative: RAYONS via normalizeRayon)
  photo_url text,                      -- photo LOCALE signée (D-05) ; jamais un hotlink OFF
  off_data jsonb not null default '{}'::jsonb,  -- snapshot OFF brut (image_url repli, categories_tags…)
  created_by text references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_ean_per_household unique (household_id, ean)
);
create index products_household_ean_idx on public.products (household_id, ean);

alter table public.shopping_list_items
  add column product_id text references public.products (id) on delete set null;

-- RLS: ajouter ('products', array['created_by']) au générateur foyer-plat (0007 §1).
-- shopping_list_items déjà couvert. Realtime: alter publication supabase_realtime add table public.products.
-- Data layer: ajouter 'products' à HOUSEHOLD_SCOPED (supabase-adapter.ts:11).
```

- **Inter-household EAN duplicates (discretion, decided):** allowed by design — `unique (household_id, ean)` scopes identity per foyer; each household keeps its own name/photo. No global products table.
- **RLS policies** follow the foyer-plat generator verbatim: SELECT member, INSERT/UPDATE `can_write_household` + `created_by = current member`, DELETE admin (enfant read-only). Negative tests mandatory (see Test strategy).
- **`off_data` contents:** `{ code, product_name, brands, categories_tags, image_url (fallback display only), lang, fetched_at }` — validated by `zod` on ingest; `nutriments` may be stored for later phases but is not surfaced.

## Reuse Inventory (exact paths — all read in source)

| Need | File | Contract to reuse |
|------|------|-------------------|
| Scanner UI + camera lifecycle | `app/src/modules/fidelite/hooks/use-barcode-scanner.ts` | `useBarcodeScanner(onDetected)` → `{ supported, status: idle\|starting\|scanning\|denied\|unsupported\|error, error, result: {value, format}, engine: native\|fallback, start(video), stop() }`; native `BarcodeDetector` (EAN-13 included) + dynamic `html5-qrcode` fallback; manual-entry fallback is the established error pattern |
| Barcode display/format | `app/src/components/shared/barcode.tsx` | `resolveBarcodeFormat` (EAN13 vs CODE128), `normalizeBarcodeValue`, EAN-13 checksum-failure → CODE128 fallback |
| Item writes, table names | `app/src/modules/courses/api.ts` | `SHOPPING_ITEMS_TABLE`, `createShoppingItem` (household_id explicit, `normalizeRayon(category)`); add `findOrCreateProduct` / `resolveScannedProduct` alongside |
| Rayons, normalization, suggestion type | `app/src/modules/courses/types.ts` | `RAYONS` (9 values), `DEFAULT_RAYON='Divers'`, `normalizeRayon()`, `ItemSuggestion{name, rayon}` — extend, don't fork |
| Suggestions hook (D-03/D-04 point) | `app/src/modules/courses/hooks/use-courses.ts` | `suggestionsFor(listId)` history-based (top 5 checked items); prepend household products; `addItemToList` is the keyboard-add path to mirror for scan-add; prefix invalidation via `queryKey: [TABLE]` |
| Image compression (D-05) | `app/src/modules/cercle/lib/media.ts` | `compressImage(file)` → WebP (q 0.82) else JPEG (q 0.85), `MAX_MEDIA_EDGE=1600`, graceful fallback returning original when `createImageBitmap` missing |
| Private upload (D-05) | `app/src/lib/storage.ts` | `depositHouseholdFile({householdId, folder:'products', file})` → bucket `household-media`, path `<householdId>/<folder>/…`, 30-day signed URL; Storage RLS checks first path segment = household (0010) |
| Reads/cache/mutations/offline | `app/src/lib/data/useResource.ts`, `app/src/lib/data/dexie.ts`, `app/src/lib/data/supabase-adapter.ts`, `app/src/lib/data/sync-queue.ts` | `useResource('products')` (scoped, optimistic, prefix invalidation); `EnsembleDatabase.rows` (`[table+householdId]` index) + `mutations` queue with `enqueueMutation` → offline create/add auto-queued; `subscribe(table)` channel `table:${table}` on `postgres_changes` — free Realtime once published |
| Household scoping registry | `app/src/lib/data/supabase-adapter.ts:11` | Add `'products'` to `HOUSEHOLD_SCOPED` |
| Edge pattern (fallback only, NOT built) | `supabase/functions/ardoise-invite/index.ts` | `withSupabase({auth:['user','publishable']})`, zod `discriminatedUnion` validation, in-memory per-IP rate limit, explicit CORS headers, `translateRpcError` — template if a proxy is ever needed |
| Migration conventions | `supabase/migrations/0050_folders.sql`, `0003_tables_daily.sql`, `0007_rls_policies.sql`, `0010_storage_and_realtime.sql`, `0008_triggers.sql` | Forward-only `begin/commit`; `private.new_id('…')`; `household_id` dénormalisé + trigger check (0008 pattern for `shopping_list_items.household_id` applies to `products` too); foyer-plat policy generator (add one row); Realtime publication loop (add `'products'`); `set search_path=''` in every function (AGENTS.md §2.7A) |
| SQL test conventions | `supabase/tests/0002_rls_isolation.sql`, `supabase/tests/_setup.sql` | `testkit.auth_user/household/member` fixtures, two-household Alice/Bob/Noé vs Carol/Dave scenario, `testkit.affected`/`expect_denied` for RLS-filtered writes |
| JS test setup | `app/src/test/setup.ts`, `app/src/modules/courses/courses-page.test.tsx` | `fake-indexeddb/auto` global + per-file Dexie names; RTL + user-event patterns; MSW has **no existing handlers** — first `msw/node` `setupServer` + `http.get` OFF intercept goes here |

**Versions pinned (app/package.json — no new deps):** `zod 4.6.5` (OFF payload validation), `@tanstack/react-query 5.103.2`, `dexie 4.4.6`, `msw 2.15.0` (dev), `vitest 5.0.2`, `jsbarcode 3.12.3`, `html5-qrcode 2.3.8`.

## Test Strategy

- **OFF client (new, MSW-first):** `msw/node` `setupServer(http.get('https://world.openfoodfacts.org/api/v2/product/:ean.json', …))` — cases: (1) 200/status:1 maps name/brands/image/categories; (2) **404 → returns null** (manual path, asserts no throw); (3) 200/status:0 invalid → null; (4) timeout (8 s `AbortController`, use short timeout injection in test, not real 8 s); (5) `fields=` + `X-User-Agent` headers asserted on the request. MSW is already a devDependency — no install, no legitimacy audit needed.
- **EAN validation:** checksum unit tests — valid `3017620422003` (check digit 3 verified by computation [ASSUMED: arithmetic done in-session, re-verify in test]) vs invalid `3017620422000`; EAN-8 accepted without checksum; non-digit/CODE128 promo codes → manual path.
- **off-rayon mapping:** `categories_tags` → `RAYONS` table test (`en:spreads`→? mapping rows defined in `off-rayon.ts`; unknown/empty → `Divers` via `normalizeRayon`).
- **D-04 re-scan:** unit test on the resolve logic — unchecked item with same `product_id` in target list → `quantity+1` via `mutate`, toast fired, zero new rows; checked item with same product → uncheck + quantity+1 (define in plan).
- **Offline (Dexie):** `fake-indexeddb` (already global) — seed `products` rows, assert sheet renders and add-to-list works with network offline (fetch mocked to reject); assert `mutations` queue entries created for later sync.
- **SQL (`supabase/tests/00XX_products.sql`, 0002-pattern):** inter-foyer isolation (Carol cannot SELECT/INSERT/UPDATE/DELETE Alice's products), enfant read-only (Noé INSERT denied), `product_id SET NULL` on product DELETE (item survives), `unique(household_id, ean)` (same EAN in both foyers OK; duplicate in one foyer rejected), `added_by/created_by` author-spoofing rejected.
- **E2E (manual per phase spec):** scan → sheet → 1-tap add on a real device; offline airplane-mode add.
- **Mandatory chain (AGENTS.md §2.7):** `npm run typecheck && npm test && npm run build`, `npm run test:e2e`, `check-sql-statique.py`, `test-db.sh` on a Docker machine. New migration functions use `set search_path=''` and schema-qualified `public.*` table names; no CTE shadowing; no tautological assertions.

## Risks and Unknowns

- **R1 — OFF downtime / unknown EAN:** covered by D-01 by design; risk is UX dead-ends only if the 404 path is miswired as an error — mitigated by the dedicated 404 test above.
- **R2 — Rate limit on shared IPs (15 req/min/IP):** a household on one home NAT shares a public IP; burst-scanning a cupboard could hit 429/503 (no `Retry-After` headers observed [VERIFIED]). Mitigate: no auto-retry storm (single retry on network error only), per-scan debounce, immediate manual fallback. NOT mitigated by a proxy (worse).
- **R3 — Photo hotlink vs upload (D-05, costly reversibility):** OFF `image_url` is CC BY-SA and must never be persisted as the product photo; transient display only, with credit ("Open Food Facts") when shown. Persist only `depositHouseholdFile` URLs. A migration mixing the two would be a data migration, not a code fix.
- **R4 — EAN validation scope:** checksum applies to 13-digit codes; EAN-8/short codes rely on server normalization; non-EAN symbologies (CODE128 promos/coupons) skip OFF entirely → manual entry. `ean ~ '^\d{8,14}$'` check constraint reflects this.
- **R5 — Quantity units:** OFF `quantity` is free text ("200 g", "6×50 cl") and does not map to the numeric `quantity` + `unit` item columns. Recommendation: prefill nothing; user sets quantity on the sheet (D-02 tap adds with sheet values). Parser explicitly out of scope.
- **R6 — `nutriments`/scores:** out of scope for this phase; stored opaquely in `off_data` for later, never rendered.

## Open Questions — all RESOLVED 2026-10-05 (see CONTEXT.md D-07…D-09)

1. **OQ-1 — v2 vs v3 lock: (RESOLVED)** OFF v2 locked for product reads (plan 04-01); v3 migration stays a backlog item.
2. **OQ-2 — Attribution identity: (RESOLVED)** `X-User-Agent: EnsembleOrganises/1.0 (jeremymaillot@gmail.com)` (plan 04-01 asserts the header).
3. **OQ-3 — OFF API usage form: (RESOLVED — non-blocking)** ops decision, tracked outside this phase; does not gate implementation.
4. **OQ-4 — Inter-foyer EAN duplicates: (RESOLVED)** per-foyer rows via `unique(household_id, ean)` (D-09); shared catalog rejected and deferred.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `world.openfoodfacts.org` API | OFF enrichment | ✓ (probed 200/404 correctly) | v2 (+v3.6) | D-01 manual creation |
| Camera (`getUserMedia`/BarcodeDetector) | Scan | Runtime/browser-dependent | — | Manual EAN entry (established pattern) |
| Docker (for `test-db.sh`) | SQL verification | To check at plan time | — | Static check + CI |

No new npm packages → no Package Legitimacy Audit required.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | EAN-13 checksum example (`…2003` valid / `…2000` invalid) — arithmetic done in-session | Test strategy | Low: unit test will confirm or correct immediately |
| A2 | `X-User-Agent` is honored by OFF as attribution equivalent (it's in ACAH, semantics inferred) | API findings | Low: worst case, unattributed-but-allowed reads; OQ-2/OQ-3 cover compliance |
| A3 | `fr.openfoodfacts.org` behaves identically to `world` long-term (single probe) | API findings | None: recommendation uses `world` + `lc=fr` |

## Sources

### Primary (HIGH)
- Official API docs + scan tutorial + cheatsheet (openfoodfacts.github.io/openfoodfacts-server) — endpoints, rate limits, attribution, normalization, v2/v3 status.
- Live probes 2026-10-05: CORS preflight/GET headers, found/unknown/invalid bodies + statuses, `lc=fr`, v3 + `api.` + `fr.` hosts, rate-limit header absence.
- In-repo source (read): `use-barcode-scanner.ts`, `barcode.tsx`, courses `api.ts`/`types.ts`/`use-courses.ts`, `cercle/lib/media.ts`, `lib/storage.ts`, `lib/data/*`, `ardoise-invite/index.ts`, migrations `0003/0007/0008/0010/0050`, tests `0002` + `test/setup.ts`, `app/package.json`.

### Secondary
- None — no secondary sources needed; everything above is primary or marked [ASSUMED].

## Metadata

- Standard stack: HIGH — all reuse targets read in source; versions pinned from `package.json`.
- Architecture: HIGH — direct-vs-proxy decided by measured CORS headers + documented per-IP limits.
- Pitfalls: HIGH — 404-vs-error and hotlink-persistence traps identified with concrete mitigations.
- **Research date:** 2026-10-05. **Valid until:** 2026-11-05 (OFF v2 deprecation is the only moving part; re-check v2 status if planning slips).
