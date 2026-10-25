# Phase 04 Plan 02 : UI scan Courses — Summary

**Status:** complete
**Commits:** 7f74571 (ScanDialog + Scanner), efad5bb (ProductSheet 1-tap), 2821781 (suggestions + re-scan + offline)

## One-liner

Scan Courses utilisable depuis la page : bouton Scanner → dialogue caméra/saisie manuelle → fiche produit 1-tap (OFF ou création manuelle) → suggestions produits-du-foyer en premier, re-scan +1 toasté, hors-ligne Dexie prouvé sans fetch.

## What was built

**Task 1 — ScanDialog + bouton Scanner (`scan-dialog.tsx`, `courses-page.tsx`)**
- `ScanDialog` reprend tel quel le motif `ScannerDialog` de Fidélité (`useId` hostId, ref callback vidéo, `useBarcodeScanner` avec `onDetected`, cycle start/stop sur open+video, messages FR, repli saisie manuelle) avec libellés Courses ; props `{ open, onOpenChange, onManual, onDetected(value) }`, `<video aria-label="Aperçu de la caméra">`.
- La saisie manuelle suit le même chemin `onDetected` que la caméra (pas de caméra requise).
- `courses-page.tsx` : bouton `Scanner` (≥44px, icône `scan`) dans les actions du `ModuleShell` ; `onDetected` ferme le dialogue puis résout **Dexie d'abord** (`findProductByEan` → `offProductFromRow`, zéro réseau pour un EAN connu, D-06), sinon `fetchOffProduct` si `isQueryableEan`, sinon fiche manuelle directe sans appel OFF (T-04-05) ; `onManual` ouvre le formulaire article classique (création sans code).
- `products-api.ts` : ajout `findProductByEan` (lecture Dexie pure), `offProductFromRow` (reconstruction depuis la ligne connue), `scanAddedToast` (libellé partagé fiche + hook).

**Task 2 — Fiche produit 1-tap (`product-sheet.tsx`, `scan-flow.test.tsx`)**
- `ProductSheet { offProduct, ean, listId }` (+ `open`/`onOpenChange` structurels) : OFF non-null → nom/marque/rayon (`offCategoriesToRayon`) pré-remplis et éditables, image OFF affichée avec crédit « Open Food Facts — affichage seul, non enregistrée » ; null → « Produit non trouvé — créez-le » + formulaire nom + rayon (D-01).
- Bouton unique « Enregistrer et ajouter à la liste » → `resolveScannedProduct` → toast `« {nom} » ajouté à la liste` (D-02) ; erreur serveur relayée en toast, fiche conservée (T-04-07) ; EAN non interrogeable → article simple sans fiche produit (T-04-05).
- `photo_url` jamais alimentée par OFF (asserté) ; **aucune persistance/upload de photo** — la photo locale est greffée par le plan 04-03 (voir Déviations).
- `scan-flow.test.tsx` (7 tests, MSW `off-handlers` du 04-01) : bouton Scanner ouvre le dialogue, repli manuel sans écran blanc, fiche Nutella/Ferrero, 404 → formulaire manuel, 1-tap → 1 produit + 1 item + toast, `photo_url` null, refus relayé en toast, création manuelle sur 404.

**Task 3 — Suggestions + re-scan + offline (`use-courses.ts`, `suggestions.test.tsx`)**
- `suggestionsFor` : produits du foyer préfixés (`{ name, rayon, photoUrl: photo_url ?? off_data.image_url ?? null }`), puis historique, dédupliqués insensible à la casse, limite 5 (D-03) ; `addItemToList` reprend aussi le rayon produit ; chips enrichies (miniature photo, rayon en `title`).
- `addScannedToList(listId, ean, addedBy?)` : lookup Dexie → `resolveScannedProduct` → toast `« {nom} : quantité +1 »` si incrémenté (D-04), erreur « Produit inconnu : créez-le depuis la fiche » sinon ; invalidation produits ajoutée.
- `ItemSuggestion.photoUrl?` ajouté (rétrocompatible) ; `isLoading` inclut les produits.
- `suggestions.test.tsx` (5 tests, `renderHook` + fake-indexeddb) : Comté produit en position 1 avec photo, sans doublon, ≤5 ; re-scan → lignes inchangées, quantité +1, toast `+1` ; EAN inconnu → erreur, rien d'écrit ; **fetch stubbé en rejet** → résolution sans aucun appel réseau, ajout durable en lignes Dexie (D-06).

## Verification results

| Check | Result |
|---|---|
| `npm run typecheck` | vert |
| `npm test -- scan-flow` | 7/7 |
| `npm test -- suggestions` | 5/5 |
| module courses complet | vert (inclus dans la suite complète) |
| `npm test` (suite complète) | 398/401 — 3 échecs **préexistants** identiques à l'arbre pristine (voir ci-dessous) |
| `npm run build` | vert (SW généré) |
| `check-sql-statique.py` | vert, aucun défaut (aucune migration dans ce plan) |

**Échecs préexistants (hors scope, non causés par ce plan) :** `calendrier-page.test.tsx` (« supprime un événement après confirmation ») + 2 tests `use-notifications.test.tsx` — exactement le trio documenté par le 04-01 et la consigne d'exécution.

## Deviations from plan

1. **Fichier `suggestions.test.ts` → `suggestions.test.tsx`.** Le wrapper `renderHook` contient du JSX, qu'esbuild refuse de parser en `.ts` (`TS1005` à la première balise). Renommage mécanique, contenu identique.
2. **Photo du formulaire manuel différée au plan 04-03.** L'action Task 2 mentionnait « nom + rayon + photo per D-01 », mais la consigne d'exécution interdit toute persistance/upload photo dans ce plan (04-03 : « photo D-05 greffée sur la fiche »). Formulaire livré avec nom + rayon ; l'affichage transitoire OFF avec crédit (seule persistance interdite) est implémenté et asserté (`photo_url` null).
3. **Assertion `mutations` offline adaptée au mode de test.** L'acceptance Task 3 demandait « `mutations` contient 1 entrée `insert` », mais cette file n'est renseignée que par l'adaptateur Supabase (`navigator.onLine === false`) — les tests tournent sur l'adaptateur local, dont les lignes Dexie SONT le magasin hors-ligne. Le test prouve la propriété D-06 réelle : fetch en rejet + produit seedé → résolution sans aucun appel réseau (`expect(fetch).not.toHaveBeenCalled()`) et ajout durable en lignes Dexie. Le commentaire du test consigne l'équivalence.

## Threat model coverage

- T-04-05 : `isQueryableEan` page + fiche (trim, `^\d{8,14}$`), pas d'appel OFF hors motif, repli article simple ; couvert par `off-client.test.ts` (04-01) + chemin fiche.
- T-04-06 : image OFF affichée avec crédit, `photo_url` toujours null (asserté en 1-tap).
- T-04-07 : refus serveur → toast d'erreur, fiche conservée ; RLS enfant déjà prouvée côté SQL par `0022_products.sql` (04-01).
- T-04-SC : aucune nouvelle dépendance (`fetch` + `zod`/`msw` déjà épinglés).

## Key links for plan 03

`ScanDialog`/`ProductSheet` prêts pour le parcours E2E Playwright ; la fiche accueille la photo D-05 (champ + `depositHouseholdFile('products')`) sans changer ses props ; `addScannedToList` + `suggestionsFor` étendu alimentent la vérification D-03/D-04.

## Self-Check: PASSED

- `scan-dialog.tsx`, `product-sheet.tsx`, `scan-flow.test.tsx`, `suggestions.test.tsx` présents ; `use-courses.ts` expose `addScannedToList`.
- Commits `7f74571`, `efad5bb`, `2821781` présents (`git log`), working tree propre.
- Aucun stub : pas de `TODO`/`placeholder` dans les fichiers créés ; seule absence documentée = photo manuelle → plan 04-03.
