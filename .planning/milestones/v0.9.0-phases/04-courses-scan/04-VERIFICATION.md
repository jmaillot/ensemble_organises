# Phase 3 (04-courses-scan) — Verification Report

**Scope:** commits ba06b69, 7f74571, efad5bb, 2821781, 85acd3a, 765a18d, 5532e40.
Uncommitted files (app/nginx.conf, privacy-page, app/public/*) ignored — concurrent wave.
**Verified:** 2026-10-05. All 7 commits present (`git log`). Targeted tests re-run by verifier: **42/42 green** (6 files: courses/off-client/products-api/scan-flow/suggestions/products-photo).

## Decisions D-01..D-09

| ID | Decision | Verdict | Evidence |
|----|----------|---------|----------|
| D-01 | Code-barres absent OFF / hors-ligne → création manuelle (nom + rayon + photo) en produits foyer | **DELIVERED** | `off-client.ts:119` 404→null; `:104` non-queryable→null; `:111-118` retry unique puis null; `product-sheet.tsx:32,195-200` fiche manuelle sur offProduct null (« Produit non trouvé — créez-le »); `courses-page.tsx:132-134` EAN non interrogeable → fiche sans appel OFF; `scan-flow.test.tsx` 404→formulaire manuel + création manuelle |
| D-02 | Bouton principal fiche = 1 tap : enregistrer produit ET ajouter à la liste | **DELIVERED** | `product-sheet.tsx:267-269` bouton unique « Enregistrer et ajouter à la liste » → `products-api.ts:136-162` `resolveScannedProduct` (findOrCreate + createShoppingItem); `scan-flow.test.tsx:128` 1-tap → 1 produit + 1 item + toast |
| D-03 | Saisie article suggère produits du foyer en premier (nom, rayon, photo) | **DELIVERED** | `use-courses.ts:138-153` productEntries (photo_url ?? off_data.image_url), `:155-170` produits d'abord puis historique, dédup insensible casse, limite 5; `suggestions.test.tsx` Comté produit position 1 avec photo, sans doublon, ≤5 |
| D-04 | Re-scan produit déjà en liste → quantité +1 + toast, jamais doublon | **DELIVERED** | `products-api.ts:144-150` item existant → quantity+1, checked false, `incremented:true`; `:168-170` toast « quantité +1 »; `0071_products.sql:44-45` product_id SET NULL; `suggestions.test.tsx:108-123` lignes inchangées, +1, toast +1 |
| D-05 | Photo locale compressée (WebP/JPEG, bucket privé) prioritaire ; URL OFF repli non persisté | **DELIVERED** | `product-sheet.tsx:131-135` compressImage → depositHouseholdFile folder 'products' AVANT résolution; `:157-161` photo_url = URL signée; `:210-217` figure OFF « affichage seul, non enregistrée »; `products-api.ts:47` photo_url:null à la création; `products-api.test.ts:94-96` OFF jamais copié dans photo_url; `products-photo.test.ts:82-138` 3 tests (upload persisté, repli OFF null, rejet PDF zéro upload) |
| D-06 | Catalogue foyer en cache Dexie : ajout + création manuelle offline, synchro retour ; scan = caméra, pas réseau si EAN connu | **DELIVERED** | `products-api.ts:85-91` findProductByEan lecture Dexie pure sans réseau; `courses-page.tsx:129-131` Dexie-first zéro réseau si connu; `dexie.ts:29-33` cache générique (products via data layer, HOUSEHOLD_SCOPED `supabase-adapter.ts:16`); `suggestions.test.tsx` fetch rejeté → résolution sans appel réseau, ajout durable en Dexie |
| D-07 | Pas de proxy Edge — appels navigateur directs OFF v2 | **DELIVERED** | `off-client.ts:4-7` (D-07 documenté), `:9` OFF_BASE_URL world.openfoodfacts.org, `:62-64` GET v2 + fields, `:70-73` fetch direct; aucun proxy Edge ajouté dans les 7 commits |
| D-08 | Attribution X-User-Agent EnsembleOrganises/1.0 (contact) | **DELIVERED** | `off-client.ts:11` OFF_USER_AGENT constant; `:71` header envoyé; `off-client.test.ts:78-84` header asserté |
| D-09 | Catalogue par foyer, pas global ; OFF = catalogue partagé lecture | **DELIVERED** | `0071_products.sql:37` unique (household_id, ean); `:69-89` 4 politiques foyer-plat; `products-api.ts:58-63` lookup (household_id, ean); `0022_products.sql` même EAN autre foyer accepté, inter-foyer refusé |

## Spec items

- **Migration products + RLS + index + Realtime:** DELIVERED — `0071_products.sql` (table, check EAN `^\d{8,14}$`, index household_ean, product_id SET NULL, 4 policies, Realtime publication, triggers updated_at + validate_member_refs).
- **OFF client (404 branch, timeout):** DELIVERED — 8 s AbortController (`off-client.ts:13,66-77`), 404→null (`:119`), zod validation, 13 tests.
- **Scanner dialog + product sheet 1-tap:** DELIVERED — `scan-dialog.tsx:25-31` reuse `useBarcodeScanner` Fidélité; `courses-page.tsx:150-152` bouton Scanner ≥44px, disabled pendant chargement (5532e40); ProductSheet 1-tap.
- **Foyer-first suggestions / re-scan / photo upload / Dexie / MSW / tests:** DELIVERED — see D-03/D-04/D-05/D-06; `off-handlers.ts:13-50` MSW Nutella 200 / inconnu 404 / invalide 200+status 0; e2e `courses-scan.spec.ts` (132 lignes, 4 scénarios); SQL `0022_products.sql` négatifs inter-foyer.
- **Photo bucket privé:** DELIVERED — folder `products` via `depositHouseholdFile`, bucket privé existant, URL signée 30 j.

## Gaps / warnings

None. Pre-existing failures (calendrier-page, use-notifications — 3 tests) out of scope, documented in SUMMARIES, untouched by these commits.

**Score: 9/9 decisions DELIVERED. 42/42 targeted tests green on re-run.**
