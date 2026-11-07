---
phase: 35
plan: 09
subsystem: offline-cache
tags: [offline, diagnostics, cache]
gap_closure: true
gap_ids: [G-35-5]
status: complete
requirements: [DLNK-02, DLNK-03]
key-files:
  created: []
  modified:
    - app/src/lib/offline/query-persistence.ts
    - app/src/lib/offline/query-persistence.test.ts
    - app/src/modules/parametres/components/offline-panel.tsx
    - app/src/modules/parametres/components/offline-panel.test.tsx
    - app/src/lib/data/useResource.ts
    - app/src/lib/data/useResource.test.ts
    - app/src/lib/reachability.ts
    - app/src/lib/reachability.test.ts
requires: [35-07 (diagnostic G-35-5), 35-08]
provides:
  - inspectPersistedCache(userId, householdId, now) — introspection lecture seule du cache persisté
  - getRestoreOutcome() — télémétrie du restore { restoredFamilies, prunedFamilies, failure, at }
  - famillePerimee(dataUpdatedAt, maxAgeMs, now) — prédicat d'expiration partagé
  - MESSAGE_HORS_LIGNE_SANS_DONNEES + ResourceResult.offlineWithoutData (useResource)
  - Section « Cache hors-ligne » du panneau Paramètres
affects: [use-auth.ts (aucun changement requis — la télémétrie vit une couche plus bas), taches-jour-page (message substitué via le hook, sans modification)]
tech-stack:
  added: []
  patterns: [introspection lecture seule IndexedDB via le persister TanStack, télémétrie d'état module avec getters, substitution d'erreur à la source du hook avec cause ES2022]
decisions:
  - D-10 (networkMode 'always') et maxAge 24 h des familles Tier 1 INCHANGÉS — décision différée documentée au plan, l'utilisateur tranche avec les faits du panneau
  - Le delta de prune est compté avant/après pruneExpiredFamilies (fait affiché, jamais déduit — révision orchestrator du warning plan-checker, appliquée telle quelle)
  - use-auth.ts ZERO changements : connectOfflineCache enregistre l'issue puis relance ; le catch du hook garde sa ceinture de sécurité
metrics:
  duration: ~40 min d'exécution (spawn 10:53Z → SUMMARY 11:34Z)
  completed: 2026-11-07
  tasks: 3
  commits: 4
plan_head_before: 1b25de9504cd0b7b687547da08f02628e0dc2177
plan_head_after: d0354f9
actuals:
  tokens: 7600
  tasks: 3
  commits: 4
---

# Phase 35 Plan 09: Diagnostics cache hors-ligne + état offline honnête Summary

**One-liner :** Introspection lecture seule du cache persisté (`inspectPersistedCache`) + télémétrie du restore (delta de prune compté, cause d'échec capturée), section « Cache hors-ligne » dans le panneau Paramètres, et substitution du « TypeError: Failed to fetch » par un état honnête hors ligne sans données — sonde durcie `cache: 'no-store'`.

## What Was Built

### Task 1 — Introspection + télémétrie (commit `04d9332`)
- `inspectPersistedCache(userId, householdId, now)` : lit l'entrée persistée via `buildPersister().restoreClient()` ; retourne `{ exists, buster, persistedAt, families }` où chaque famille porte `prefix`, `dataUpdatedAt`, `ageMs`, `maxAgeMs` **lu d'OFFLINE_FAMILIES** (D-07) et `pruneEligible`. Aucun contenu de ligne (T-35-18, prouvé par test). Aucune écriture (prouvée par identité de contenu).
- Cache vide → `{ exists: false, families: [] }` — l'absence est un fait, jamais une levée.
- Prédicat d'expiration **partagé** `famillePerimee` : `pruneExpiredFamilies` et l'introspection utilisent le même site de comparaison (§2.7 E).
- Télémétrie de restore : `connectOfflineCache` enregistre `{ restoredFamilies, prunedFamilies, failure, at }` — familles comptées APRÈS restore AVANT prune, puis re-comptage APRÈS prune → `prunedFamilies` = delta affiché (révision orchestrator) ; échec = `String(cause)` puis **relance** (le catch de use-auth.ts:263-265 reste la ceinture, hook inchangé) ; rien-de-persisté = 0 + failure null (fait distinct d'un échec).

### Task 2 — Section « Cache hors-ligne » (commits `6e0556d`, `d0354f9`)
- Nouvelle Panel en lecture seule (aucun bouton, D-08) : état réseau (abonnement `onlineManager` apparié), familles (« tasks — mise en cache il y a 2 h — conserve 24 h »), mention honnête « au-delà de la durée de conservation, écartée au prochain démarrage » au-delà du maxAge (jamais « perdue », D-11), ligne « Dernière restauration : N familles restaurées[, M écartées (> 24 h)] » / « rien à restaurer » / « échec — cause » / « pas encore passée sur cette session » ; absence → « Aucune donnée mise en cache sur cet appareil pour ce foyer — reconnectez-vous une fois en ligne pour la mettre en cache ».
- Introspection chargée au montage + changement de (userId, householdId), jamais à chaque rendu (T-35-19) ; issue de restore lue une fois (fait de session, pas de polling).

### Task 3 — État hors ligne sans données + sonde (commit `fe2a7bc`)
- `useResource` : `offlineWithoutData = isError && data === undefined && !onlineManager.isOnline()` ; quand vrai, `error` est substituée par « Ces données ne sont pas encore sur cet appareil — reconnectez-vous une fois pour les mettre en cache. » avec l'erreur d'origine préservée en `error.cause` (ES2022). L'ErrorState des pages rend `error?.message` tel quel — **aucune page modifiée**. Avec cache (D-09) et en ligne : comportement inchangé. D-10 (`networkMode 'always'`), staleTime, retry : intacts.
- `reachability.ts` : la sonde passe `cache: 'no-store'` — un succès servi par le cache HTTP ne peut plus prouver un backend joignable en mode avion (hypothèse résiduelle H-A' du diagnostic 35-07).

## Verification

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | ✅ vert |
| `npx vitest run src/lib src/modules/parametres src/hooks/__tests__ src/stores/__tests__` | 387/388 — 1 échec = **flocon préexistant** (voir Deferred) |
| `npm test` | 1933/1934 — même flocon préexistant, passe en isolement et avec `--retry=1` |
| `npm run build` | ✅ vert |
| `npx playwright test deep-link-redirect` | ✅ 6/6 (chromium + mobile) |
| D-10 / maxAge 24 h intacts | ✅ `git diff 1b25de9..HEAD -- app/src/lib/query-policy.ts` vide |
| TDD | Les 3 tâches vues ROUGES avant implémentation (imports manquants / assertions fausses), puis vertes |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `persistNow` ré-hydratait les familles que la prune venait d'écarter**
- **Found during:** Task 1 (test « succès avec prune » rouge sur l'assertion « donnée élaguée absente »)
- **Issue:** `persistNow` utilisait `persistQueryClient` = restore + souscription (doc v5). Appelé APRÈS `pruneExpiredFamilies` dans `connectOfflineCache`, ce second restore ré-hydratait les familles périmées depuis IndexedDB : la prune était systématiquement annulée, et le panneau aurait affiché « 1 écartée » pendant que la donnée périmée revenait à l'écran. Préexistant depuis la phase 33/34, invisible car aucun test ne combinait connect + vieillissement.
- **Fix:** `persistNow` souscrit via `persistQueryClientSubscribe` + sauvegarde initiale explicite (`persistQueryClientSave`) — son contrat (« persister l'état courant et rester souscrit ») n'exige aucun restore, qui reste le monopole de `restoreOfflineCache`.
- **Files modified:** app/src/lib/offline/query-persistence.ts
- **Commit:** `04d9332` (test WR-01 ajusté : sa 2e assertion reposait accidentellement sur ce re-restore — il résuscitait le persisté d'un test antérieur ; le client rebranché porte désormais ses données h2 explicites, l'intention du test est inchangée)

### Notes
- Fixup `d0354f9` : constante `day` devenue inutilisée dans le test du panneau (noUnusedLocals).
- Le test useResource « données en cache » a dû semer la clé EFFECTIVE du hook (`{ household_id: 'h-1' }` dans le filtre) — erreur de test, pas de code.

## Deferred Issues

- **Flocon préexistant `auth-bootstrap-offline.test.tsx` test D** (charge, timeout `waitFor` 1 s vs dynamic import de `@/app/router`) — **prouvé sur la base `1b25de9`** via worktree temporaire (1 failed / 367, identique). Consigné dans `deferred-items.md` ; correction évidente : `waitFor(..., { timeout: QUERY_STATE_TIMEOUT })`, à porter par un plan de test-hygiène. Hors `files_modified` du plan.

## Known Stubs

Aucun — toutes les données affichées viennent de sources réelles (IndexedDB via le persister, télémétrie de module, `onlineManager`).

## Self-Check: PASSED

- Fichiers créés/modifiés : 8/8 présents dans le diff `1b25de9..d0354f9`.
- Commits : 4/4 trouvés (`04d9332`, `6e0556d`, `fe2a7bc`, `d0354f9`) via `git log 1b25de9..HEAD`.
- `commits: 4` mesuré (`git rev-list --count 1b25de9..HEAD`), cohérent avec le ledger `plan_head_before`.
