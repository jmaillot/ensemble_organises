---
phase: 34-file-d-criture-rejeu
plan: 34-06
subsystem: data-layer
tags: [offline, outbox, useResource, UAT-34-1, error-handling]
requires: [34-05]
provides:
  - "isEnqueuedFailure exporté (useResource.ts) — prédicat d'absorption recopiant le filtre onError du MutationCache"
  - "contrat useResource : create/update/remove résolvent sur échec enfilé (table allowlistée + réseau), propagent refus métier et tables hors liste"
affects: [useResource, useCourses, outbox tests]
tech-stack:
  added: []
  patterns:
    - "absorption d'échec au niveau hook derrière un prédicat calqué sur le filtre du MutationCache (T-34-14)"
key-files:
  created: []
  modified:
    - app/src/lib/data/useResource.ts
    - app/src/lib/data/useResource.test.tsx
    - app/src/lib/data/useResource.test.ts
    - app/src/lib/offline/outbox.test.ts
    - app/src/modules/courses/courses-offline-writes.test.tsx
decisions:
  - "prédicat isEnqueuedFailure exporté pour un test d'invariant qui refuse la divergence entre hook et MutationCache"
  - "update absorbé : ligne lue dans le cache, ou { id, ...values } synthétisée si le cache ne la peint pas — l'absorption ne dépend pas de la chance du cache"
  - "remove absorbé : résout void, sans restauration (le remove ne pose pas d'overlay)"
metrics:
  duration: "~50 min"
  completed: 2026-11-06
status: complete
estimate:
  tokens: 90000
actuals:
  tokens: ~88000
  tasks: 3
  commits: 3
plan_head_before: 7ca7f0a
plan_head_after: 2f56802
---

# Phase 34 Plan 06 : Absorption de l'échec enfilé dans useResource (UAT-34-1) Summary

**Fermeture UAT-34-1 : une écriture hors-ligne enfilée dans l'outbox (table allowlistée, échec réseau) ne remonte plus comme rejet à l'appelant — le signal utilisateur est le badge (D-11/D-12), plus jamais un toast « TypeError: NetworkError… ».**

## Ce qui a été fait

1. **Task 1 (TDD, vu rouge : 4 failed / 2 passed avant correction)** — `isEnqueuedFailure(table, error) = isWriteAllowed(table) && isNetworkFailure(error)` exporté de useResource.ts, commenté en français nommant outbox/D-02, D-11/D-12 et T-34-14. Appliqué aux trois voies :
   - `create` : échec enfilé → résout avec la ligne overlay (id + client_key), overlay resté peint (WR-02) ;
   - `mutate`/`update` : échec enfilé → résout avec la ligne fusionnée lue dans le cache, ou `{ id, ...values }` synthétisée si le cache ne la peint pas ; refus métier → snapshot restauré + rejet (inchangé) ;
   - `remove` : try/catch ajouté (il n'en avait pas) ; échec enfilé → résout void ; refus → rejet.
   Quatre tests unitaires : create enfilé, update+remove enfilés, refus métier + table hors liste (propagation), invariant T-34-14.
2. **Task 2** — scénario (g) dans courses-offline-writes.test.tsx : `addItemToList` hors-ligne SANS `.catch(() => undefined)` résout, zéro toast peint (`[role="status"]` absent du document — preuve d'absence falsifiable), une entrée outbox pending, overlay peint. Scénarios (a)-(f) inchangés et verts.
3. **Task 3** — chaîne §2.7 complète verte (voir ci-dessous), inventaire des appelants consigné.

## Vérification (chaîne §2.7, dans l'ordre)

| Étape | Résultat |
|---|---|
| `npm run typecheck` | vert (tsc --noEmit) |
| `npm test` | **234 fichiers, 1879 tests passés, 0 échec** |
| `npm run build` | vert (Vite 8 + SW precache 150 entrées) |
| `python3 scripts/check-sql-statique.py` | vert — 230 fonctions effectives / 179 migrations, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | vert — 6 cas |
| `test:e2e` | non exécuté — Playwright exige un navigateur/serveur, hors périmètre backend de ce plan, aucune route ni page modifiée |
| `test-db.sh` / `test-dispatch-push.sh` | **NON exécutés — raison (§2.7 F/I) : aucun fichier sous `supabase/` n'est modifié par ce plan** (useResource et tests `app/` uniquement) ; le passage obligatoire ne s'applique qu'à un changement SQL. Fait vérifié : `git status` ne montre aucun fichier supabase/. Remarque : le binaire docker répond sur cette machine, mais la pile n'a pas été montée pour un delta SQL nul — à refaire impérativement à la prochaine migration |

## Inventaire des appelants `itemResource.*` (T-34-15)

12 sites hors tests, tous dans `app/src/modules/courses/hooks/use-courses.ts` : 117-118 (mutateurs injectés `resolveScannedProduct`), 353/385 (create addItem/addItemToList), 415/420 (update/create editItem), 496 (removeItem), 506 (update), 522 (`deleteShoppingList(…, itemResource.remove)`), 563 (reorder). **Aucun ne compte sur le rejet réseau pour réinitialiser un état local** : le seul consommateur du rejet était `runQuietly` (courses-page.tsx) pour toast — couvert par le scénario (g), le `.catch` n'attrape plus rien. `useLinkedRows` (`add`/`remove` de jointures) présente le même défaut potentiel et n'a PAS été touché (hors périmètre UAT-34-1, le plan l'interdit explicitement) — observation à traiter dans un plan ultérieur si un toast d'incident apparaît sur tâches→membres.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Trois suites historiques asseraient l'ANCIEN verdict (rejet)**
- **Found during:** Task 3 (chaîne complète)
- **Issue:** `useResource.test.ts` (« conserve l'overlay sur échec RÉSEAU ») et 6 assertions d'`outbox.test.ts` utilisaient `await expect(…).rejects.toThrow('fetch failed')` comme point de synchronisation — ces tests contredisaient le nouveau contrat (et non l'inverse : le plan exige que les écritures enfilées résolvent).
- **Fix:** simples `await` + assertion sur la ligne retournée ; commentaire nommant UAT-34-1 et les chemins non couverts (useLinkedRows, mutation non marquée) qui rejettent toujours.
- **Files modified:** app/src/lib/data/useResource.test.ts, app/src/lib/offline/outbox.test.ts
- **Commit:** 2f56802

**2. [Rule 1 - Bug] L'absorption d'update dépendait de la présence de la ligne en cache**
- **Found during:** Task 3 (échec « coche puis décoche » : cache vide → rethrow)
- **Issue:** mutate absorbé ne résolvait que si la ligne fusionnée était trouvée dans le cache — l'absorption aurait dépendu de la chance du cache (T-34-15).
- **Fix:** repli `{ id, ...values }` synthétisé, commenté ; 40/40 verts sur les 4 fichiers touchés.
- **Commit:** 2f56802

**3. [Rule 3 - Harness] Le harnais courses simule l'état APRÈS rejeu pour les écritures enfilées**
- **Found during:** Task 2 ((a)/(f) rouges après l'absorption)
- **Issue:** la promesse résolvant, le `await invalidate()` du module révèle le magasin simulé vide — artefact du faux client (les LECTURES réussissent hors ligne), alors qu'en production réel le refetch échoue et le cache est conservé.
- **Fix:** le faux client persiste l'insertion/upsert enfilé dans le magasin simulé (état après rejeu) tout en levant le transport ; le rejeu upsert déduplique par client_key — scénario (f) prouve zéro doublon. Scénario (g) : `document.querySelectorAll('[role="status"]')` au lieu de `container` (renderHook n'expose pas le conteneur du wrapper).
- **Commit:** bd152a8

## Known Stubs

Aucun — aucune donnée simulée, aucun placeholder.

## Threat Flags

Aucune nouvelle surface : aucun endpoint, chemin d'auth ni schéma nouveau — le prédicat T-34-14 est couvert par Test 3/4 de Task 1.

## Self-Check: PASSED
