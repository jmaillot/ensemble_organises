---
phase: 33-cache-de-lecture-offline
plan: 01
subsystem: offline-cache
tags: [offline, tanstack-query, indexeddb, persistence]
requires:
  - "@tanstack/react-query@5.103.2 (existant)"
provides:
  - "app/src/lib/offline/query-persistence.ts — cacheKey, buildPersister, persistNow, restoreOfflineCache, purgeCache, OFFLINE_CACHE_BUSTER"
affects:
  - "33-02 (branchement React + bandeau)"
  - "33-03 (allowlist D-07, buster hash de build, garde de test eo-query-cache)"
  - "33-04 (purge à la déconnexion / OFFR-04)"
tech-stack:
  added:
    - "@tanstack/react-query-persist-client@5.103.2"
    - "@tanstack/query-async-storage-persister@5.103.2"
    - "idb-keyval@6.3.0"
  patterns:
    - "AsyncStorage adaptateur ferment sur la clé composée (namespacing structurel)"
    - "unsubscribe en état module, ordre unsubscribe → purge (Pitfall 6)"
key-files:
  created:
    - app/src/lib/offline/query-persistence.ts
    - app/src/lib/offline/query-persistence.test.ts
    - app/.npmrc
  modified:
    - app/package.json
    - app/package-lock.json
decisions:
  - "Épinglage 5.103.2 approuvé par l'humain (checkpoint Task 1) — même train que react-query en prod"
  - "app/.npmrc legacy-peer-deps=true : conflit de peer préexistant vite-plugin-pwa 1.3.0 vs assets-generator 2.0.0 (Rule 3)"
  - "persistNow déclenche une sauvegarde initiale explicite : persistQueryClient ne sauvegarde que sur événement de cache postérieur à la souscription"
  - "AsyncStorage setItem(key, value) : la clé du persister est ignorée pour imposer la clé composée (défaut REACT_QUERY_OFFLINE_CACHE reçue en premier argument)"
  - "hydrate() est une fonction libre en v5.103 (pas une méthode QueryClient)"
  - "throttleTime exposé en paramètre (défaut 1000 ms doc ; 0 dans les tests — le throttle trailing ferait tomber l'écriture après la fin du test)"
metrics:
  duration: 69 min
  completed: 2026-11-04T22:21Z
status: complete
actuals:
  tokens: 5300
  tasks: 3
  commits: 2
plan_head_before: 2b3c841cc84f81321c27e43c43c78c894f587e3b
plan_head_after: ac013ee
commits: 2
---

# Phase 33 Plan 01: Socle de persistance offline Summary

**One-liner:** Persistance du cache de lecture TanStack Query sur IndexedDB, namespacée par (utilisateur, foyer), prouvée par un tracer seed → persist → restore → lecture avec fake-indexeddb.

## What Was Done

- **Task 1 (checkpoint:human-verify):** légitimité des deux paquets TanStack [SUS] validée par l'humain (« verified »). Pré-check registre : 5.103.2 existe, repo `github.com/TanStack/query`, même train que `@tanstack/react-query@5.103.2` en prod.
- **Task 2 (auto, commit `4fb291c`):** installation épinglée `-E` des trois paquets ; `npm ls` sans divergence dans le train 5.103.2 (react-query deduped) ; typecheck vert. `app/.npmrc` ajouté (Rule 3) : conflit de peer préexistant `vite-plugin-pwa@1.3.0` (peer `assets-generator@^1.0.0`) vs root épinglé `2.0.0` bloquait tout `npm install`.
- **Task 3 (tracer, commit `ac013ee`):** `query-persistence.ts` avec `cacheKey` (source unique du format `eo-query-cache:<userId>:<householdId>`, D-03), `buildPersister` (persister AsyncStorage sur store idb-keyval `eo-offline-cache`/`query`), `persistNow` (unsubscribe → purge, Pitfall 6 / OFFR-01-concurrency ; buster `OFFLINE_CACHE_BUSTER`='v1', T-33-02 ; `shouldDehydrateQuery` laisse tout passer — stub documenté, remplacé par l'allowlist au plan 03), `restoreOfflineCache` (idempotent, hydrate fonction libre), `purgeCache`. 4 tests fake-indexeddb : E2E, idempotence (OFFR-01-idempotency), namespacing (restore de l'utilisateur B ne lit jamais la clé de A, T-33-01), purge.

## Verification (AGENTS.md §2.7)

| Étape | Résultat |
|---|---|
| `npm ls @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @tanstack/react-query` | 5.103.2 ×3, deduped, aucune divergence |
| `npm run typecheck` | vert |
| `npx vitest run src/lib/offline/query-persistence.test.ts` | 4 passed |
| `npm test` (complet) | 1749 passed, 2 failed — **prévus hors périmètre** (anniversaires, prouvés préexistant à `d404ed0` dans un worktree jetable) |
| `npm run build` | vert |

`test-db.sh` et `test:e2e` non requis : aucun changement SQL ni de parcours e2e dans ce plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] app/.npmrc legacy-peer-deps=true**
- **Found during:** Task 2
- **Issue:** tout `npm install` échouait sur un conflit de peer préexistant (`vite-plugin-pwa@1.3.0` déclare peerOptional `@vite-pwa/assets-generator@^1.0.0`, root épinglé `2.0.0`)
- **Fix:** `app/.npmrc` avec `legacy-peer-deps=true` et la raison en commentaire ; l'épinglage §2.1 reste la politique de versions
- **Commit:** `4fb291c`

**2. [Rule 1 - Bug]Trois pièges d'API corrigés pendant le tracer**
- **Issue:** (a) `persistQueryClient` retourne `[unsubscribe, promise]`, pas un objet ; (b) `AsyncStorage.setItem(key, value)` — implémentation initiale recevait la clé du persister (`REACT_QUERY_OFFLINE_CACHE`) comme valeur ; (c) `hydrate` est une fonction libre en v5.103, pas une méthode du client
- **Fix:** destructuration du tableau + sauvegarde initiale explicite via `persistQueryClientSave` (export du paquet) ; `setItem: (_key, value)` ignorant la clé passée ; `hydrateState` importé
- **Files modified:** app/src/lib/offline/query-persistence.ts
- **Commit:** `ac013ee`

### Deferred Issues (hors périmètre — voir deferred-items.md)

- `src/modules/anniversaires/anniversaires-page.test.tsx` : 2 tests échouent, prouvés préexistant au commit `d404ed0` (avant la phase 33, vérifié en worktree jetable). Journalisé dans `.planning/phases/33-cache-de-lecture-offline/deferred-items.md`, non corrigé ici.

## Known Stubs

| Fichier | Stub | Raison | Résolution |
|---|---|---|---|
| `app/src/lib/offline/query-persistence.ts` (`persistNow`) | `shouldDehydrateQuery: () => true` | Prévu par le plan : l'allowlist D-07 remplace ce prédicat au plan 03 | plan 33-03 |

## Auth Gates

Aucun. Le checkpoint Task 1 (légitimité paquets) a été approuvé par l'humain, pas un gate d'authentification.

## Self-Check: PASSED

- `app/src/lib/offline/query-persistence.ts` : FOUND
- `app/src/lib/offline/query-persistence.test.ts` : FOUND
- `app/.npmrc` : FOUND
- Commits `4fb291c`, `ac013ee` : FOUND dans `git log`
