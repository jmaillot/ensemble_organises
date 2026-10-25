# Phase 04 Plan 03 : Photos persistées + preuve E2E — Summary

**Status:** complete
**Commits:** 85acd3a (photo D-05 + tests), 765a18d (spec E2E + invalidation + régression), 5532e40 (Scanner disabled + synchro E2E)
**Décision D-05 :** actée par l'utilisateur le 2026-10-05 avant implémentation (dispatch) — URLs signées 30 jours du bucket privé `household-media` dossier `products` persistées en `products.photo_url`, URL OFF en repli d'affichage non persisté.

## One-liner

Fiche produit enrichie d'une photo locale compressée persistée en bucket privé (prioritaire, OFF en repli crédité non persisté), parcours scan → fiche → 1-tap prouvé sur navigateur réel (4 scénarios × 2 projets Playwright), chaîne §2.7 complète verte.

## What was built

**Task 1 — D-05 (décision, pré-approuvée).** Aucune question reposée : le dispatch portait la validation humaine. Implémentée telle que spécifiée (bucket privé, URLs persistées, repli OFF).

**Task 2 — Photo D-05 greffée sur ProductSheet (`product-sheet.tsx`, `products-photo.test.ts`)**
- Champ `Photo` (optionnel, `accept="image/*"`) : rejet immédiat des non-images (`Sélectionnez une image…`, aucun upload), aperçu local prioritaire avec légende « Photo locale — enregistrée avec le produit », sinon figure OFF avec crédit « Photo Open Food Facts — affichage seul, non enregistrée ».
- Soumission : `compressImage` (WebP q 0.82 sinon JPEG q 0.85, repli fichier d'origine) → `depositHouseholdFile({ householdId, folder: 'products', … })` **avant** résolution (un échec d'upload ne laisse jamais un produit sans sa photo) → `resolveScannedProduct` → `data.update(photo_url)` avec l'URL signée. Sans photo, `photo_url` reste null (asserté).
- `products-photo.test.ts` (3 tests, `compressImage` + `depositHouseholdFile` mockés) : upload `photo.jpg` → dépôt `folder: 'products'` + `photo_url` `https://…` ; sans photo → crédit OFF + `photo_url` null ; `notes.pdf` → message + zéro upload.
- Le 1-tap D-02 est inchangé (même bouton, mêmes toasts).

**Task 3 — Preuve E2E + chaîne complète (`courses-scan.spec.ts`)**
- 4 scénarios : `scan enrichi 1-tap` (fiche Nutella/Ferrero → item en liste), `re-scan quantite +1` (toast `+1`, un seul article), `EAN inconnu creation manuelle` (`Produit non trouvé` → `Miel artisanal` créé), `photo locale et repli OFF non persisté` (champ Photo + crédit d'affichage).
- Mode démonstration (zéro backend), OFF intercepté en route avec les payloads MSW (`3017620422003` → Nutella 200, `2999999999991` → 404), série dans le fichier + `test.slow()` (serveur preview partagé, petite machine).

## Verification results

| Check | Result |
|---|---|
| `npm run typecheck` | vert |
| `npm test -- products-photo scan-flow` / `-- courses` | 11/11 puis 42/42 (dont régression 04-03) |
| `npm test` (suite complète) | 402/405 — 3 échecs **préexistants** identiques à l'arbre pristine (voir ci-dessous) |
| `npm run build` | vert (SW généré, 77 entrées) |
| `npm run test:e2e` (complet, chromium + mobile) | **45 passed, 5 skipped, 0 failed** — dont 8/8 courses-scan |
| `python3 scripts/check-sql-statique.py` | vert (112 fonctions effectives, aucun défaut ; aucune migration dans ce plan) |
| `sh scripts/test-db.sh` | 23/23 suites vertes (dont `0022_products`) |

**Échecs préexistants (hors scope, non causés par ce plan) :** `calendrier-page.test.tsx` (« supprime un événement après confirmation ») + 2 tests `use-notifications.test.tsx` — le trio documenté par 04-01/04-02 et la consigne d'exécution. Skips E2E = tests viewport-conditionnels de `critical-paths` (tiroir/poignées/drag).

## Deviations from plan

1. **[Rule 1 — Bug] La fiche 1-tap n'invalidait pas le cache TanStack.** `resolveScannedProduct` écrit via `data.*` hors hook : l'article existait en Dexie (toast OK) mais restait invisible jusqu'au rechargement — trouvé par l'E2E, invisible aux tests Dexie directs du 04-02. Fix : `invalidateQueries` (`shopping_lists`, `shopping_list_items`, `products`) dans `ProductSheet` après soumission (même jeu que `useCourses`) + test de régression page réelle dans `scan-flow.test.tsx`. Fichiers : `product-sheet.tsx`, `scan-flow.test.tsx`. Commits : 765a18d.
2. **[Rule 1 — Bug] Scanner cliquable pendant le chargement des listes.** Un clic précoce tombait sur `lists[0]` vide → toast trompeur « Créez d'abord une liste » et fiche jamais ouverte (flaky E2E sous charge). Fix : `disabled={isLoading}` sur le bouton Scanner (cohérent avec « Ajouter un article ») + synchro E2E sur la région `Fresque` et le bouton activé. Fichiers : `courses-page.tsx`, `courses-scan.spec.ts`. Commit : 5532e40.
3. **[Rule 1 — Bug] `URL.createObjectURL` lève sous jsdom.** Le stub vitest est une fonction qui jette : l'aperçu photo est désormais en `try/catch` (confort, jamais prérequis à l'upload). Fichier : `product-sheet.tsx`. Commit : 85acd3a.
4. **Adaptation de test (accept `image/*`).** `user-event` v14 filtre les fichiers au regard de `accept` comme le sélecteur natif : le PDF n'atteignait jamais l'input. Le cas `notes.pdf` passe par `fireEvent.change` (contournement « Tous les fichiers », chemin réel de la validation composant) ; assertion OFF affinée en `/affichage seul, non enregistrée/` (le hint du champ mentionne aussi OFF). Fichier : `products-photo.test.ts`.
5. **Robustesse E2E.** `mode: 'serial'` dans le fichier + `test.slow()` : 4 Chromium parallèles affamaient le preview partagé (timeouts à 8 s puis au clic) sur cette machine 6 CPU. Isolation inchangée (contexte neuf par test).

**Note d'arbre :** des fichiers hors plan sont modifiés/non suivis dans le working tree (`app/nginx.conf`, `privacy-page.*`, `app/public/conditions-utilisation|confidentialite|robots|sitemap`) — travail concurrent d'une autre vague, présent à la fin d'exécution, **non touché** par ce plan (commits limités aux fichiers du plan, vérifiés `2 files changed` à chaque commit).

## Threat model coverage

- T-04-08 : validation `image/*` côté fiche + `ACCEPTED_MIMES` dans `depositHouseholdFile`, compression avant envoi, chemin `<householdId>/products/…` imposé, bucket privé jamais public — couvert par `products-photo.test.ts` (rejet PDF, `folder: 'products'` asserté).
- T-04-09 : URL signée TTL 30 jours (`SIGNED_URL_TTL`), lecture via RLS foyer (politiques `0010`, premier segment = foyer), aucun bucket public — inchangé, aucun nouveau chemin de lecture.
- T-04-SC : aucune nouvelle dépendance (`compressImage` natif + `depositHouseholdFile` existants).

## Key links

- `ProductSheet` champ photo → `compressImage` → `depositHouseholdFile('products')` → `products.photo_url` ; OFF `image_url` cantonnée à `off_data` + affichage crédité.
- `courses-scan.spec.ts` → interception OFF (payloads `off-handlers`) → vraie page Courses en démo → lignes Dexie + cache invalidé.
- D-01..D-09 : D-05 actée et implémentée ici ; D-02/D-04/D-06 prouvées par l'E2E re-scan et hors-ligne (04-02) ; les 9 décisions sont couvertes par les trois plans.

## Self-Check: PASSED

- `product-sheet.tsx` (champ Photo, preview, upload), `products-photo.test.ts` (3 tests), `e2e/courses-scan.spec.ts` (4 scénarios) présents.
- Commits `85acd3a`, `765a18d`, `5532e40` présents (`git log`), chacun limité aux fichiers du plan.
- Aucun stub : pas de `TODO`/`placeholder` dans les fichiers créés ; photo ignorée (sans erreur) uniquement pour les codes non interrogeables sans fiche produit (T-04-05, par conception).
