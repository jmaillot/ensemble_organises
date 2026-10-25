# Phase 04 Plan 01 : Tracer scan courses — Summary

**Status:** complete
**Commit:** ba06b69 (`feat(courses): tracer scan EAN -> OFF -> produit foyer -> article`, 14 files, +966/−7)

## One-liner

Slice scan vertical prouvé : migration `products` + client OpenFoodFacts direct navigateur + résolution scan→produit→item (re-scan +1), verts en Vitest, test-db.sh et contrôle statique.

## What was built

**SQL (forward-only, `search_path = ''` partout où une fonction est définie)**
- `supabase/migrations/0071_products.sql` : `public.products` (id `private.new_id('product')`,
  `household_id` explicite, `ean ~ '^\d{8,14}$'`, `name` 1–200, `brand`/`category`/`photo_url`,
  `off_data jsonb default '{}'`, `created_by SET NULL`, `unique (household_id, ean)`),
  index `products_household_ean_idx`, `shopping_list_items.product_id … on delete set null`,
  trigger `set_updated_at` + `validate_member_refs('created_by')` (motif 0008),
  4 politiques foyer-plat (`select/insert/update_household` + `delete_admin`, motif 0007),
  publication Realtime (motif 0010 protégé).
- `supabase/tests/0022_products.sql` : scénario Alice/Bob/Noé vs Carol — SELECT inter-foyer vide,
  INSERT inter-foyer refusé, enfant INSERT refusé, `created_by` d'un autre membre refusé,
  doublon même foyer rejeté + même EAN autre foyer accepté, DELETE admin → item survivant à
  `product_id NULL`, chemin heureux UPDATE authentifié.
- `supabase/tests/0001_schema_contract.sql` : inventaire §1 aligné (`product_id` sur items, ligne `products`).

**Frontend**
- `app/src/modules/courses/off-client.ts` : `fetchOffProduct` — GET v2 + `fields=` + `X-User-Agent:
  EnsembleOrganises/1.0 (jeremymaillot@gmail.com)`, AbortController 8 s, branche 404 → `null`
  sans lever, `status: 0`/invalide → `null`, un unique retry réseau/timeout, validation zod.
- `app/src/modules/courses/off-rayon.ts` : `offCategoriesToRayon` (table tags → RAYONS, repli `Divers`).
- `app/src/modules/courses/products-api.ts` : `PRODUCTS_TABLE`, `findOrCreateProduct` (upsert
  foyer+EAN, course résolue sur la contrainte unique), `productInputFromOff` (image OFF jamais
  copiée dans `photo_url`), `resolveScannedProduct` (1-tap D-02, re-scan quantité +1 + décoché, D-04).
- `app/src/test/mocks/off-handlers.ts` : premiers handlers MSW (Nutella 200, inconnu 404, invalide 200/status 0).
- `off-client.test.ts` (13 tests) + `products-api.test.ts` (7 tests) : enrichment mocké, 404 → null,
  timeout/retry, headers assertés, re-scan +1 sans doublon, isolation par foyer.
- Touches existants : `ProductRow` + `product_id` (`database.ts`), `'products'` dans `HOUSEHOLD_SCOPED`,
  `productId?` optionnel sur `ShoppingItemInput`/`createShoppingItem`, `product_id: null` sur les 5 seeds démo.

## Verification results

| Check | Result |
|---|---|
| `npm run typecheck` | vert |
| nouveaux tests ciblés | 20/20 (2 fichiers) |
| module courses | 26/26 (3 fichiers) |
| `npm run build` | vert (SW généré) |
| `check-sql-statique.py` | vert, aucun défaut |
| `test-db.sh` | 23/23 suites vertes (dont 0022) |
| suite Vitest complète | 386/389 — 3 échecs **préexistants**, prouvés sur arbre pristine (mêmes fichiers, mêmes tests, sans mes changements) |

**Échecs préexistants (hors scope, non causés par ce plan) :** `calendrier-page.test.tsx`
(« supprime un événement après confirmation ») et `use-notifications.test.tsx` (2 tests).
Constatés avant/après à l'identique via `git stash -u` + rejeu ciblé. À traiter hors phase 04-01.

## Deviations from plan

None — plan executed exactly as written, avec deux compléments relevant des règles auto :
- **[Rule 2]** Trigger `validate_member_refs('created_by')` + `set_updated_at` sur `products` (motif 0008) :
  sans eux, `created_by` inter-foyer n'était couvert que par la RLS et `updated_at` jamais maintenu.
  Couverture T-04-01 en profondeur, cohérence avec toutes les autres tables foyer-plat.
- **[Rule 1]** `0001_schema_contract.sql` mis à jour : l'ajout de `product_id` faisait échouer le
  contrat §1 (« colonnes inattendues ») — pattern établi (ardoises, folders) de faire évoluer
  ce fichier-test avec le schéma. Aucune migration appliquée réécrite.

## Threat model coverage

- T-04-01 : politique INSERT/UPDATE `created_by = current_member` + trigger membre + test négatif dédié.
- T-04-02 : zod à l'ingestion, `name` borné 1–200, `photo_url` jamais alimentée par OFF (test dédié).
- T-04-03 : SELECT via `is_household_member`, tests négatifs Alice vs Carol dans les deux sens.
- T-04-04 : un unique retry réseau, pas de retry storm (test compteur d'appels = 2), repli manuel immédiat.
- T-04-SC : aucune nouvelle dépendance (`fetch` + `zod`/`msw` déjà épinglés).

## Key links for plan 02

`fetchOffProduct` 404 → `null` = entrée du chemin création manuelle (D-01) ;
`resolveScannedProduct` = le 1-tap fiche (D-02) + re-scan (D-04) ;
`shopping_list_items.product_id SET NULL` + `products` en Realtime + `HOUSEHOLD_SCOPED`.

## Self-Check: PASSED

- `0071_products.sql` appliqué en local (`migrate.sh` : 1 appliquée, `tables_sans_rls = 0`).
- Commit `ba06b69` présent (`git log`), working tree propre (`git status` vide).
- Aucun stub : pas de `TODO`/`placeholder` dans les fichiers créés ; `nutriments`/quantités OFF
  volontairement non surfacés (R5/R6, plan 02+).
