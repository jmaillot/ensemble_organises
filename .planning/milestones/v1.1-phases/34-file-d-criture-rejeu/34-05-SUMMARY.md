---
phase: 34-file-d-criture-rejeu
plan: 05
subsystem: testing
tags: [offline, outbox, tanstack-query, supabase, write-policy, idempotence]

requires:
  - phase: 34-02
    provides: file d'écriture (outbox) et enfilage MutationCache D-02
  - phase: 34-03
    provides: rejeu idempotent côté serveur (client_key)
  - phase: 34-04
    provides: badge, panneau offline et purge D-17
provides:
  - module feuille write-policy.ts (allowlist d'écriture SOURCE UNIQUE) et ré-export query-policy
  - garde assertWriteAllowed dans l'adaptateur Supabase (filet de sécurité de classe)
  - écritures d'articles Courses routées par la couche mutation Tier 1 (useResource)
  - régression bout en bout hors ligne : enfilage, overlay optimiste, rejeu réconcilié
affects: [34-verify, offline, courses, recettes]

actuals:
  tokens: 18436
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "mutation Tier 1 : identité client (id + client_key) posée par prepareCreate, overlay optimiste conservé sur échec réseau"
    - "module feuille write-policy : l'adaptateur importe la garde sans tirer la fabrique TanStack (pas de cycle)"

key-files:
  created:
    - app/src/lib/data/write-policy.ts
    - app/src/lib/data/write-policy.test.ts
    - app/src/modules/courses/courses-offline-writes.test.tsx
  modified:
    - app/src/lib/query-policy.ts
    - app/src/lib/data/supabase-adapter.ts
    - app/src/lib/data/supabase-adapter.test.ts
    - app/src/modules/courses/api.ts
    - app/src/modules/courses/hooks/use-courses.ts
    - app/src/modules/courses/products-api.ts
    - app/src/modules/courses/components/product-sheet.tsx
    - app/src/modules/courses/courses-page.tsx
    - app/src/modules/voyages/components/trip-courses-tab.tsx

key-decisions:
  - "Voies brutes createShoppingItem/updateShoppingItem/deleteShoppingItem CONSERVÉES dans api.ts (plan : « supprimer ») : recettes/api.ts et trip-courses-tab.tsx les appellent sans couche hook ; bloc commentaire « NE PAS EN AJOUTER » posé"
  - "Reroutage de product-sheet replié dans le commit Task 2 : le changement de signature des mutateurs cassait 9 tests tant que la fiche produit passait encore par data.create"
  - "Test e2e : attente de la charge initiale AVANT la coupure réseau — sinon la toute première lecture (magasin vide) résout après l'overlay optimiste et l'écrase (artefact de calendrier du faux client)"

patterns-established:
  - "write-policy : toute nouvelle allowlist d'écriture se déclare dans le module feuille, query-policy ne fait que ré-exporter"
  - "Test hors ligne : waitFor(isLoading=false) avant onlineManager.setOnline(false)"

requirements-completed: [WRQ-02, WRQ-06]

coverage:
  - id: D1
    description: "Garde d'écriture centralisée : write-policy.ts module feuille, ré-exports query-policy, filet de sécurité dans l'adaptateur Supabase"
    requirement: WRQ-02
    verification:
      - kind: unit
        ref: "app/src/lib/data/write-policy.test.ts"
        status: pass
      - kind: unit
        ref: "app/src/lib/data/supabase-adapter.test.ts#A. create hors liste hors ligne : DataError ET zéro appel réseau"
        status: pass
    human_judgment: false
  - id: D2
    description: "Écritures d'articles Courses (formulaire, clavier, catalogue, scan, édition, réordonnancement, fiche produit) routées par itemResource (mutation Tier 1) avec identité client id + client_key"
    requirement: WRQ-02
    verification:
      - kind: unit
        ref: "app/src/modules/courses/courses.test.tsx"
        status: pass
      - kind: unit
        ref: "app/src/modules/courses/scan-flow.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Régression bout en bout hors ligne : ajout d'article → écriture enfilée dans l'outbox (D-02), overlay optimiste conservé, refus métier avant toute écriture, rejeu réconcilié sans doublon (identité préservée)"
    requirement: WRQ-02
    verification:
      - kind: integration
        ref: "app/src/modules/courses/courses-offline-writes.test.tsx#écritures Courses hors ligne — file d'écriture et rejeu (G-34-1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Propagation D-10 inchangée pour l'utilisateur : la couche hook re-propage l'erreur d'origine, l'UI toaste, l'enfilage a lieu malgré tout"
    requirement: WRQ-06
    verification:
      - kind: integration
        ref: "app/src/modules/courses/courses-offline-writes.test.tsx#(a) addItem hors ligne"
        status: pass
    human_judgment: false

duration: 2h20min
completed: 2026-11-05
status: complete
---

# Phase 34, plan 05 : File d'écriture & rejeu — Summary

**Fermeture de G-34-1 : allowlist d'écriture centralisée (write-policy), écritures d'articles Courses passées par la couche mutation Tier 1, et régression bout en bout prouvant l'enfilage hors ligne, l'overlay optimiste et le rejeu réconcilié sans doublon.**

## Performance

- **Duration:** 2h20min
- **Tasks:** 3
- **Files modified:** 16 (3 créés, 13 modifiés)

## Accomplishments
- `write-policy.ts` : la liste blanche d'écriture vit dans un module feuille que l'adaptateur peut importer sans cycle ; `query-policy.ts` ré-exporte, aucun consommateur ne bouge.
- Garde `assertWriteAllowed` posée dans `supabase-adapter.ts` (create/update/remove/removeWhere) : filet de sécurité de classe couvrant tout chemin hors hook (§2.7 E).
- Écritures d'articles Courses routées par `itemResource` : identité client (`id` + `client_key`) dès la création, overlay optimiste, marque D-02 pour l'enfilage.
- Régression intégration à montage réel (faux client supabase, fabrique `buildQueryClient` de production) : 6 scénarios verts — enfilage, overlay peint, refus métier avant écriture, garde de classe, rejeu idempotent.

## Task Commits

1. **Task 1 : garde d'écriture dans l'adaptateur et module feuille write-policy** - `6514256` (feat)
2. **Task 2 : écritures d'articles Courses routées par la couche mutation Tier 1** - `f787e31` (feat)
3. **Task 3 : régression bout en bout des écritures Courses hors ligne et du rejeu** - `dcb2f8d` (feat)

## Files Created/Modified
- `app/src/lib/data/write-policy.ts` (créé) - allowlist d'écriture SOURCE UNIQUE + garde upfront
- `app/src/lib/query-policy.ts` - ré-exports depuis le module feuille, MutationCache inchangé
- `app/src/lib/data/supabase-adapter.ts` - garde sur les 4 voies d'écriture
- `app/src/modules/courses/api.ts` - `buildShoppingItemValues` pur, mutateur sur `deleteShoppingList`, bloc voies brutes conservées
- `app/src/modules/courses/hooks/use-courses.ts` - routage complet via `itemResource`, `itemMutators` exposés
- `app/src/modules/courses/products-api.ts` - gardes hors ligne sur resolveScanned/ManualOff, type ItemMutators
- `app/src/modules/courses/components/product-sheet.tsx` - mutateurs reçus par props
- `app/src/modules/courses/courses-offline-writes.test.tsx` (créé) - régression 6 scénarios

## Decisions Made
- **Voies brutes conservées** (écart au plan qui disait « supprimer ») : `recettes/api.ts` (`sendRecipeIngredientsToCourses`) et `trip-courses-tab.tsx` appellent `createShoppingItem`/`deleteShoppingItem` sans couche hook ; les supprimer cassait ces deux parcours. Un bloc commentaire « VOIES BRUTES CONSERVÉES HORS PÉRIMÈTRE — NE PAS EN AJOUTER » les entoure.
- **Reroutage de product-sheet dans le commit Task 2** : la signature des mutateurs (Task 2) cassait 9 tests tant que la fiche produit importait encore `createShoppingItem` ; garder l'arbre vert a demandé de replier ce morceau de Task 3 dans `f787e31`.
- **Tests hors ligne : attente de charge initiale** : le résultat de la toute première lecture (magasin vide) résolvait APRÈS l'overlay optimiste et l'écrasait — artefact de calendrier du faux client, pas un défaut du code de production (hors ligne réelle, la lecture en vol échoue au lieu de renvoyer `[]`). Corrigé côté test par `waitFor(isLoading=false)` avant `setOnline(false)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Context] Le plan sous-estimait les consommateurs des voies brutes**
- **Found during:** Task 2 (routage use-courses)
- **Issue:** la suppression demandée de `createShoppingItem`/`updateShoppingItem`/`deleteShoppingItem` cassait recettes et voyages
- **Fix:** voies brutes conservées, entourées d'un commentaire d'interdiction ; grep de vérification : les écritures brutes d'articles ne matchent plus que ces 2 sites documentés
- **Committed in:** `f787e31`

**2. [Rule 2] Erreurs de typecheck sur le fichier de test neuf**
- **Found during:** Task 3 (chaîne de vérification)
- **Issue:** `payload` du faux client typé `| null` recevait `undefined` ; `rayon: 'Frais'` hors union ; `client_key` absent du type métier ; `off` requis par `ItemFormValues`
- **Fix:** `target ?? null`, rayon littéral de l'union, type `OverlayRow = ShoppingListItemRow & { id; client_key }`, `off: null`
- **Committed in:** `dcb2f8d`

---

**Total deviations:** 2 auto-fixées (+ 1 repli de périmètre Task 2→Task 3 documenté plus haut)
**Impact on plan:** aucun élargissement de périmètre ; les écarts visent à garder l'arbre vert et les parcours recettes/voyages intacts.

## Issues Encountered
- **Échec muet du débogage** (§2.7 F) : l'overlay semblait « annulé » ; la journalisation du cache a montré qu'il s'agissait d'un artefact de calendrier du test, pas d'un retour arrière du code. Documenté dans les décisions.
- **Hors périmètre, observé sans y toucher** : 2 tests `anniversaires-page.test.tsx` (« bascule liste/calendrier », « point d'origine anniversaire ») échouent AUSSI sur le checkout principal — défaillance préexistante, indépendante de ce plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- G-34-1 fermé : une écriture allowlistée hors ligne est enfilée (D-02), réconciliée au rejeu idempotent (34-03), visibles dans le panneau offline (34-04).
- `test-db.sh` et `test-dispatch-push.sh` restent à passer sur une machine Docker avant de considérer le changement comme entièrement validé (aucun SQL modifié par ce plan).

---
*Phase: 34-file-d-criture-rejeu*
*Completed: 2026-11-05*
