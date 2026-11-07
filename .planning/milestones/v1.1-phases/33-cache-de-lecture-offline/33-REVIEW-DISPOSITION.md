---
phase: 33-cache-de-lecture-offline
updated: 2026-11-05T00:30:00Z
source_review: 33-REVIEW.md
findings_total: 11
fixed: 6
open: 5
---

# 33-REVIEW-DISPOSITION

Disposition des findings de la revue de phase 33 (`33-REVIEW.md`, 2026-11-04).
Périmètre appliqué : CR-01 + WR-01..WR-05. Les IN restent ouverts (défaut).

| ID | Titre | Disposition | Source |
|----|-------|-------------|--------|
| CR-01 | Les données Tier 1 de l'utilisateur A fuient dans le cache persisté de l'utilisateur B (purge mémoire absente + prédicat de sérialisation non scopé) | **fixed: requires human verification** — goulot `signOut` : `queryClient.clear()` après la purge IndexedDB (import dynamique router, pas de cycle) ; défense en profondeur : `shouldDehydrateQuery` refuse tout `householdId` étranger (clés sans foyer/`null` restent éligibles, D-10) ; test appareil partagé rouge vu avant vert | 2f3cfd9, bff35e5 (suivi test use-auth-local) |
| WR-01 | `persistNow` ne cancel jamais l'ancien persister — commentaire portant un invariant faux | **fixed** — `persistNow` invoque `activeCancel?.()` avec le désabonnement ; commentaire corrigé ; test de traîne muette sur rebranchement direct vu rouge avant vert | 94d5c1e |
| WR-02 | Rejets de promesse non gérés sur les `void signOut()` du bootstrap et du listener SIGNED_OUT | **fixed** — `.catch` avec `console.error` contextualisé aux trois sites (§2.7 F) | 467e273 |
| WR-03 | `switchWithPurge` laisse l'app sans souscription de persistance ni cache restauré après le switch | **fixed** — `connectOfflineCache(client, userId, householdId)` après le switch (pas de branchement en démo, Pitfall 7) ; contrat JSDoc étendu ; test post-switch (souscription active sur la nouvelle clé, lu au stockage brut) vu rouge avant vert | 144a377 |
| WR-04 | `pruneExpiredFamilies` écarte aussi les queries jamais chargées (`dataUpdatedAt === 0`) | **fixed** — garde `dataUpdatedAt <= 0 → return false` commentée ; test vu rouge avant vert (prouvé par son échec après instrumentation, §2.7 D) | ccea2f9 |
| WR-05 | `useSyncExternalStore` avec un `subscribe` recréé à chaque rendu | **fixed** — `useCallback` sur le subscribe ; test d'espion sur `cache.subscribe` vu rouge avant vert (1 resouscription pour 2 re-rendus) | 7d2b6db |
| IN-01 | Assertion e2e tautologique à l'étape 4 du spec appareil partagé | **open** — hors périmètre (Info) | — |
| IN-02 | `check-sw-api-cache.sh` — vérification 2 : faux négatif possible si le minifieur embarque les littéraux workbox | **open** — hors périmètre (Info) | — |
| IN-03 | `restoreOfflineCache` duplique la logique de buster | **open** — hors périmètre (Info, acceptable en l'état) | — |
| IN-04 | `purgeUserCache` construit le préfixe par `cacheKey(userId, '')` — convention non contrainte par type | **open** — hors périmètre (Info) | — |
| IN-05 | `signInDemo` / chemins démo ne passent pas par `connectOfflineCache` — asymétrie non documentée au niveau du module | **open** — hors périmètre (Info) | — |

## Vérification (chaîne §2.7, exécutée dans le checkout principal — pas de worktree, `node_modules` requis par les gates)

- `npm run typecheck` : vert.
- `npm test` : 1782/1784 — les 2 échecs restants sont les tests `anniversaires-page.test.tsx` **préexistants documentés, hors périmètre**.
- `npm run build` : vert (precache 149 entrées).
- Commits atomiques par finding, TDD : chaque correction comportementale a été vue rouge avant verte.

## Note de vérification humaine (CR-01)

La correction CR-01 change un comportement de frontière (mémoire + sérialisation) : la logique est couverte par le test d'appareil partagé simulé (`session-store.test.ts`, rouge avant vert), mais un contrôle humain de l'ordre `purge → clear → set` et de l'éligibilité des clés sans foyer (`null`, D-10) est recommandé avant la phase de vérification.
