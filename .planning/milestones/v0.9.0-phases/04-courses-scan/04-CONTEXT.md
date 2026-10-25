# Phase 3: Courses scan - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Produits du foyer scannables (EAN) enrichis OpenFoodFacts, liés aux articles des listes de courses :
bouton Scanner (réutilise le scanner Fidélité), fiche produit 1-tap, suggestions depuis les produits du
foyer, photos locales prioritaires, catalogue hors-ligne. Pas de comparateur de prix, pas d'import de
tickets de caisse, pas de stocks — hors phase.

</domain>

<decisions>
## Implementation Decisions

### Scan → fiche produit
- **D-01:** Code-barres absent d'OpenFoodFacts (ou hors-ligne) → création manuelle proposée (nom + rayon +
  photo), enregistrée dans les produits du foyer.
- **D-02:** Le bouton principal de la fiche fait deux choses d'un tap : enregistrer le produit ET l'ajouter à
  la liste de courses courante.

### Liaison items-produits
- **D-03:** La saisie d'article suggère les produits du foyer en premier (nom, rayon, photo), avant
  l'historique d'items existant.
- **D-04:** Re-scan d'un produit déjà dans la liste → quantité +1 sur l'item existant + toast, jamais de
  doublon.

### Photos produits
- **D-05:** Photo uploadée et compressée maison (WebP/JPEG, bucket Storage privé) prioritaire ; URL
  OpenFoodFacts seulement en repli quand aucune photo locale. — **Reversibility:** costly — les URLs des
  photos sont persistées en base et servies aux clients ; inverser impose une migration de données.

### Hors-ligne
- **D-06:** Catalogue produits du foyer en cache Dexie : ajout à la liste et création manuelle possibles
  sans réseau, synchronisation au retour. Le scan lui-même exige la caméra (matériel), pas le réseau pour
  les EAN déjà connus.

### the agent's Discretion
Forme exacte de la fiche, cache des appels OFF.

### Post-recherche (verrouillé 2026-10-05)
- **D-07:** Pas de proxy Edge — appels navigateur directs vers OFF v2 (CORS `*` vérifié en probes).
- **D-08:** Attribution `X-User-Agent: EnsembleOrganises/1.0 (jeremymaillot@gmail.com)`.
- **D-09:** Catalogue par foyer (pas de catalogue global partagé ; OFF = catalogue partagé en lecture).
- **D-10 (amendement — recherche instable constatée) :** proxy Edge `off-search`
  (cache 1 h, bascule miroirs, quota 10/min, session requise) EN PREMIER pour
  la recherche par nom, repli direct en cas de panne Edge (hors quota) ;
  lectures produit par EAN inchangées (direct, D-07 maintenu).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase et produit
- `.planning/PHASES/04-courses-scan.md` — spec de phase (migration products, mapping OFF, UI scan, risque CORS → proxy Edge)
- `.planning/ROADMAP.md` — Phase 3 : products foyer + OpenFoodFacts
- `AGENTS.md` §2 — stack (Dexie, compression native, Storage privé, Edge), §2.6 RLS, §2.7 chaîne de vérification

### Code à réutiliser
- `app/src/modules/fidelite/hooks/use-barcode-scanner.ts` — hook scan (BarcodeDetector + repli)
- `app/src/components/shared/barcode.tsx` — affichage code-barres
- `app/src/modules/courses/api.ts`, `app/src/modules/courses/types.ts` — items, suggestions, rayons
- `app/src/lib/storage.ts` — dépôt fichiers (vérifier compression WebP/JPEG avant upload)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useBarcodeScanner` + dialogue scan Fidélité : flux caméra/permission/gestion d'erreur à reprendre tel quel
- Suggestions d'items Courses : étendre la source aux produits du foyer (priorité décidée D-03)
- Compression d'images avant upload : motif natif existant (createImageBitmap + canvas)

### Established Patterns
- RLS foyer-plat + tests négatifs inter-foyer sur chaque table (dont `products`)
- Photos en bucket Storage privé, jamais d'hotlink externe persistant (D-05)
- MSW pour simuler le réseau + fake-indexeddb pour Dexie dans les tests

### Integration Points
- `shopping_list_items.product_id` (nullable) vers `products` : SET NULL à la suppression du produit
- Nouveau : fonction Edge proxy OpenFoodFacts si CORS bloque l'appel direct (risque identifié phase)
- Realtime sur `products` pour la synchro multi-appareils du foyer

</code>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 3-Courses scan*
*Context gathered: 2026-10-05*
