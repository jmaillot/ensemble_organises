---
phase: 37-filet-de-tests-fiable
plan: 01
subsystem: session/auth
tags: [test-04, gotrue, localStorage, purge-session, e2e]
requires: [session-cache.ts, session-store.ts, offline-shared-device.spec.ts]
provides: [purgerStockageSession(), clesStockageBrutes()]
affects: [app/src/stores/session-store.ts, app/src/lib/supabase/session-cache.ts]
key-files:
  created: []
  modified:
    - app/src/lib/supabase/session-cache.ts
    - app/src/stores/session-store.ts
    - app/src/stores/session-store.test.ts
    - app/e2e/offline-shared-device.spec.ts
decisions:
  - "Purge GoTrue réutilisant cleStockageSession() — source unique de nommage (D-07)"
  - "Purge branchée au chokepoint signOut après les purges disque/mémoire, avant reset d'état (anti-résurrection, Pitfall 2)"
  - "Preuve rouge capturée avant le vert (D-09, §2.7 B) : 2 cas échouaient sur le code d'origine"
metrics:
  duration: ~6 min
  completed: 2026-11-07
status: complete
commits: 3
plan_head_before: fb6a27e
plan_head_after: 49829ea
estimate:
  tokens: 70000
actuals:
  tokens: 26000
  tasks: 3
  commits: 3
---

# Phase 37 Plan 01: Purge clé GoTrue résiduelle Summary

**One-liner :** `purgerStockageSession()` (clé de base + chunks `.0/.1…`, dérivation réutilisée de `cleStockageSession()`) branchée au chokepoint `session-store.signOut` — prouée rouge avant vert en unitaire, et lisible e2e via `clesStockageBrutes()`.

## Preuve rouge (D-09, §2.7 B)

Avant correction, sur le code d'origine (`1de5c61`), les 2 nouveaux cas échouaient :

```
FAIL … purge de la clé de session GoTrue (TEST-04, D-09)
  > retire la clé de base non chunkée à la déconnexion
  AssertionError: expected [ 'sb-api-auth-token' ] to deeply equal []
  > retire les fragments chunkés .0/.1 à la déconnexion
  AssertionError: expected [ 'sb-api-auth-token', 'sb-api-auth-token.0', 'sb-api-auth-token.1' ] to deeply equal []
 Tests  2 failed | 11 passed (13)
```

Après implémentation (`39ac6a8`) : 13/13 verts sur le fichier, suite complète 1960/1960.

## What Was Built

1. **Tâche 1 (tracer, test rouge)** — `app/src/stores/session-store.test.ts` : bloc « purge de la clé de session GoTrue (TEST-04, D-09) », deux cas (clé de base non chunkée, fragments `.0`/`.1`), lecture brute `Object.keys(localStorage)` filtrée par `/^sb-.*-auth-token(\.\d+)?$/` (toute la famille, Pitfall 6). URL Supabase épinglée à `https://api.exemple.fr` via mock partiel de `@/lib/supabase/client` → dérivation déterministe `sb-api-auth-token`. Session seed factice (§2.7 H). Commité en rouge AVANT le fix.
2. **Tâche 2** — `app/src/lib/supabase/session-cache.ts` : export `purgerStockageSession()` — dérivation via `cleStockageSession()` (D-07, aucune nouvelle logique), mêmes gardes (`!cle`, `typeof localStorage === 'undefined'`), `removeItem` de la base puis des fragments `.0`, `.1`… jusqu'au premier index absent (même règle de découverte que `lireSessionPersistee`). `app/src/stores/session-store.ts` : appel dans `signOut` APRÈS `purgeUserCache`/`queryClient.clear()` et AVANT le reset d'état — ordre anti-résurrection : `stopPersisting()` est déjà passé, plus aucun writer en vol ne peut réécrire la clé (Pitfall 2).
3. **Tâche 3** — `app/e2e/offline-shared-device.spec.ts` : helper `clesStockageBrutes(page)` (`page.evaluate(() => Object.keys(localStorage))`, réplique de `clesCacheBrutes`) + assertion `not.toContainEqual(expect.stringMatching(/^sb-.*-auth-token/))` après `seDeconnecter`, au même checkpoint que la lecture brute IndexedDB. Bloc skip conditionnel aux env vars inchangé octet pour octet (D-04) — `skipReason` vérifié identique (§2.7 I).

## Verification

- `cd app && npx vitest run src/stores/session-store.test.ts` — rouge (2/2 nouveaux cas) sur code d'origine, puis vert 13/13 après fix
- Chaîne §2.7 complète : `npm run typecheck` vert, `npm test` **243 fichiers / 1960 tests verts**, `npm run build` vert (precache 152 entries)
- SQL non modifié — contrôles SQL non requis
- E2E non exécuté ici (comptes réels D-06 reportés au plan 37-02, comme prévu par la tâche 3)

## Deviations from Plan

None — plan exécuté tel qu'écrit.

## Threat Flags

Aucune nouvelle surface : la purge retire une clé, elle n'en expose aucune.

## Self-Check: PASSED

- Commits `1de5c61`, `39ac6a8`, `49829ea` vérifiés via `git log`
- Les 4 fichiers modifiés présents dans le diff des commits correspondants
