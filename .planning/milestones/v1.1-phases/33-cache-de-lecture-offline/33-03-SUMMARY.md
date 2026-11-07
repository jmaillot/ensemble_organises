---
phase: 33-cache-de-lecture-offline
plan: 03
subsystem: offline-cache
tags: [offline, allowlist, maxage, restore, tanstack-query]
requires:
  - 33-01 (socle query-persistence.ts, persister async IndexedDB)
provides:
  - OFFLINE_FAMILIES (source unique des familles persistées + maxAge par famille)
  - pruneExpiredFamilies (élagage post-restore D-09)
  - connectOfflineCache (restore → prune → souscription persist)
  - branchement restore dans useAuthBootstrap avant setReady(true)
affects:
  - plan 04 (OFFR-04 : purge multi-foyers, rejeu, sémantique concurrence)
tech-stack:
  added: []
  patterns:
    - filtrage à la sérialisation via shouldDehydrateQuery (jamais le maxAge global TanStack, Pitfall 3)
    - garde de classe sur la forme de déclaration d'allowlist (Test I)
    - import dynamique du queryClient pour éviter le cycle use-auth → router
key-files:
  created:
    - app/src/lib/offline/query-persistence.test.ts (étendu, 9 tests)
  modified:
    - app/src/lib/query-policy.ts (OFFLINE_FAMILIES + gcTime 7 j)
    - app/src/lib/query-policy.test.ts (tests F/G/H/I)
    - app/src/lib/offline/query-persistence.ts (familyOf, pruneExpiredFamilies, connectOfflineCache, dehydrateOptions filtré)
    - app/src/hooks/use-auth.ts (restore branché dans le bootstrap)
decisions:
  - "Buster = constante OFFLINE_CACHE_BUSTER 'v1' bumpée au changement de forme — l'estampille /version.json (hypothèse A3) est écartée : son fetch hors ligne échouerait et jetterait un cache sain au seul moment où il sert."
  - "Garde Test I porte sur la FORME de déclaration (prefix: '…') et pas sur les noms de tables — les api.ts définissent légitimement les constantes *_TABLE, une aiguille sur les noms aurait refusé du code sain."
  - "queryKey de TASK_ASSIGNEES/TASK_REMINDERS etc. commencent par 'all' (queryKeys.tableAll) : ces annexes d'assignation ne sont PAS dans l'allowlist (choix du planner, 8 familles exactement) — hors ligne, les assignés affichent depuis household_members/profiles (annexes, 7 j)."
metrics:
  duration: ~1 h 10 min
  completed: 2026-11-04T22:50:00Z
status: complete
actuals:
  tokens: 12000
  tasks: 3
  commits: 3
plan_head_before: 309d42972828400eb49258d0a597bfb56d6d4a30
plan_head_after: 3ba1bb2
commits: 3
---

# Phase 33 Plan 03: Allowlist offline par famille + restore branché (OFFR-01, OFFR-03) Summary

Allowlist Tier 1 par famille posée à la sérialisation (seules 8 familles + 2 annexes quittent la mémoire vers IndexedDB), maxAge honnête évalué par prune au restore, et restauration branchée dans `useAuthBootstrap` avant `setReady(true)`.

## Tasks Completed

| Task | Description | Commit | Files |
| ---- | ----------- | ------ | ----- |
| 1 | OFFLINE_FAMILIES + gcTime 7 jours (D-07, D-08, D-10, Pitfall 1) | 348473d | app/src/lib/query-policy.ts, query-policy.test.ts |
| 2 | Filtrage sérialisation + prune post-restore (D-01, D-09) | d85330f | app/src/lib/offline/query-persistence.ts, .test.ts |
| 3 | Restore branché avant le premier rendu (OFFR-01) | 3ba1bb2 | app/src/hooks/use-auth.ts, query-persistence.ts |

## TDD Gate Compliance

Chaque tâche comportementale a été vue **rouge avant verte** :

- **Task 1** : tests F/G/H/I écrits d'abord — 4 échecs prouvés (`Tests 4 failed | 5 passed`), puis implémentation → 9/9 verts. Le test I refusait son propre fichier au premier rouge (l'aiguille y vit) : exclusion du garde + preuve d'efficacité de l'aiguille ajoutées (§2.7 F).
- **Task 2** : 5 tests écrits d'abord — `Tests 5 failed | 4 passed` prouvé, puis familyOf/shouldDehydrateQuery/pruneExpiredFamilies/connectOfflineCache → 9/9 verts.

## Verification Results

- `npx vitest run src/lib/offline src/lib/query-policy.test.ts` : **18/18 verts** (2 fichiers)
- `npm run typecheck` : **0 erreur** (après annotation explicite du prédicat, l'objet `persistProps` non typé inférait `any`)
- `npm test` (suite complète) : 1758/1760 — les **2 échecs sont les préexistants documentés** (`anniversaires-page.test.tsx`, prouvés avant la phase 33 au commit `d404ed0`, journalisés dans `deferred-items.md`) — hors périmètre, non touchés
- `npm run build` : **succès** (precache 151 entrées)
- `grep -rl "eo-query-cache" app/src` : confiné à `query-persistence.ts` seul
- networkMode 'always', refetchOnReconnect et la fusion un-niveau des overrides : inchangés (tests A/B/D restés verts)

## Deviations from Plan

**1. [Rule 3 - Blocking] `queryKeys.tableAll` préfixe par `'all'`, pas par la table**
- **Found during:** Task 1 (lecture de use-taches.ts)
- **Issue:** les queries d'assignés/rappels (task_assignees, task_reminders…) sont clés `['all', table, …]` — leur préfixe de famille est `'all'`, jamais le nom de table. L'allowlist planifiée ne les couvre donc pas.
- **Fix:** aucun ajout à l'allowlist (le plan verrouille exactement 10 familles) ; documenté en décision — hors ligne, les assignés se résolvent depuis les annexes `household_members`/`profiles` (7 j).
- **Commit:** 348473d (commentaire décision), SUMMARY ci-dessus.

**2. [Rule 3 - Blocking] Import dynamique du queryClient dans use-auth (cycle évité)**
- **Found during:** Task 3
- **Issue:** `router.tsx` importe `use-auth` statiquement ; importer `queryClient` de `router` depuis `use-auth` créerait un cycle statique. Le plan disait « ne pas toucher le routeur » — déplacer le client était une option Rule 4 écartée au profit d'un fix non structurel.
- **Fix:** `await import('@/app/router')` dans la chaîne du bootstrap (module déjà chargé par `main.tsx`, résolution depuis le cache).
- **Commit:** 3ba1bb2.

## Auth Gates

Aucune.

## Known Stubs

Aucun nouveau stub. Note : `connectOfflineCache` est prouvé par test unitaire (fake-indexeddb) ; le parcours complet démarrage → rendu hors ligne est porté par le plan 04 (e2e), comme prévu au plan.

## Threat Flags

Aucune surface nouvelle hors du `<threat_model>` du plan : T-33-06 (allowlist écriture), T-33-07 (prune fraîcheur), T-33-08 (buster documenté), T-33-09 (restore best-effort) couverts et prouvés par test.

## Self-Check: PASSED

- Commits vérifiés : 348473d, d85330f, 3ba1bb2 (`git log --oneline -3`)
- Fichiers créés/modifiés présents sur disque ; SUMMARY écrit (intentionnellement non commitée, .planning gitigné)
- STATE.md mis à jour sur disque (Plan 4 of 5, completed_plans 6)
