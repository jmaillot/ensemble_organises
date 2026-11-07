---
phase: 34-file-d-criture-rejeu
plan: 02
subsystem: client-offline
tags: [offline, outbox, tanstack-query, liste-blanche, persistance]
requires:
  - "34-01 : colonne client_key uuid NOT NULL + unicité sur les 5 tables Tier 1 (0177-0179)"
provides:
  - "outbox.ts : OUTBOX_KEY, OutboxEntry, enqueueOutbox (fusion D-04, annulation D-05), isNetworkFailure/classifyFailure (D-10), setOutboxScopeProvider"
  - "WRITE_ALLOWLIST + isWriteAllowed + assertWriteAllowed (query-policy.ts) — les 5 tables D-14 exactement"
  - "MutationCache central dans buildQueryClient (D-02) — enfilage sur échec réseau"
  - "meta { table, operation } sur les 5 mutations centralisées (useResource ×3, useLinkedRows ×2)"
  - "Create Tier 1 = id + client_key côté client + overlay optimiste (Pitfall 7)"
  - "Outbox persistée dans le persister 33 (D-01), buster v2, exempte de prune"
affects: [34-03, 34-04]
tech-stack:
  added: []
  patterns:
    - "MutationCache.onError comme point unique d'enfilage (pas de resumePausedMutations, Pitfall 1)"
    - "outbox = query TanStack persistée (zéro stockage séparé, D-01)"
    - "liste blanche consultée à deux endroits : garde mutation + filtre MutationCache (T-34-05)"
key-files:
  created:
    - app/src/lib/offline/outbox.ts
    - app/src/lib/offline/outbox.test.ts
  modified:
    - app/src/lib/query-policy.ts
    - app/src/lib/query-policy.test.ts
    - app/src/lib/data/useResource.ts
    - app/src/lib/offline/query-persistence.ts
    - app/src/stores/session-store.ts
decisions:
  - "Portée outbox via fournisseur (setOutboxScopeProvider) enregistré par session-store — query-policy ne peut pas importer les stores (cycle)"
  - "La garde upfront (D-07) ne refuse que HORS LIGNE : en ligne les modules hors liste fonctionnent normalement (sinon l'app entière serait cassée)"
  - "L'overlay optimiste d'échec réseau RESTE peint (l'écriture est en file, le rejeu réconcilie) ; il n'est retiré que sur refus métier"
metrics:
  duration: ~25 min
  completed: 2026-11-05
status: complete
commits: 3
plan_head_before: e14edef
plan_head_after: 184f1f8
actuals:
  tokens: 24300
  tasks: 3
  commits: 3
---

# Phase 34 Plan 02: File d'écriture & enfilage Summary

**One-liner:** Outbox TanStack persistée (D-01) enfilée par un MutationCache central (D-02) sur échec réseau des 5 mutations Tier 1 marquées `meta`, fusion D-04 / annulation D-05, liste blanche WRITE_ALLOWLIST avec refus upfront hors-ligne (D-07), classification terminal/retryable (D-10) — 36 tests verts, typecheck + build verts.

## What Was Built

- **outbox.ts** (nouveau) : `OutboxEntry` (key/table/operation/id/filter/values/clientKey/enqueuedAt/status/failure), `enqueueOutbox` — fusion D-04 (la nouvelle écriture écrase la pendante du même `buildEntityKey`) et annulation D-05 (remove retire les pendantes ; create+delete = zéro écriture, y compris sur jointure via correspondance filtre⊂valeurs) ; `buildEntityKey` (removeWhere = filtre sérialisé trié, Pitfall 6) ; `isNetworkFailure`/`classifyFailure` déroulent la `cause` DataError (code PG = refus métier, jamais enfilé — Pitfall 2/3/4) ; `newClientKey` (crypto.randomUUID + repli).
- **query-policy.ts** : `WRITE_ALLOWLIST` (les 5 tables D-14 exactement), `isWriteAllowed`, `assertWriteAllowed` (refus AVANT tout départ réseau, hors-ligne uniquement), `MutationCache({ onError })` dans `buildQueryClient` — filtre meta → allowlist → réseau → enqueue (T-34-05 : double consultation).
- **useResource.ts** : `meta { table, operation }` sur les 5 mutations ; `assertWriteAllowed` dans chaque `mutationFn` ; create Tier 1 = `id` (randomId) + `client_key` (uuid) injectés EN LIGNE COMME HORS LIGNE (0177 refuse les insertions sans client_key) + overlay optimiste conservé sur échec réseau, retiré sur refus métier ; overlay simule `created_at`/`updated_at` (Rule 1 : buildRoutines lisait `row.created_at` sur la ligne optimiste et crashait) ; `useLinkedRows.add` injecte `client_key` (jointure sans id).
- **query-persistence.ts** : le préfixe `outbox` est un cas particulier de `shouldDehydrateQuery` AVANT `familyOf` (aucun maxAge, défense CR-01 sur `queryKey[2]`) ; exempt de `pruneExpiredFamilies` ; `OFFLINE_CACHE_BUSTER` v1 → v2.
- **session-store.ts** [Rule 3] : `setOutboxScopeProvider(() => ({userId, householdId}))` — la portée est lue au moment de l'enfilage, suit sessions et foyers ; `query-policy` ne peut pas importer les stores (cycle session-store → household-store → query-persistence → query-policy).
- **outbox.test.ts** (17 tests) + query-policy.test.ts (tests J/K/L) : enfilage avec id+client_key distincts, overlay peint, mutation non marquée ignorée, fusion = 1 écriture, create+delete = 0 écriture, 42501 jamais enfilé, removeWhere sérialisé rejouable, refus upfront sans appel adaptateur (spy) sur les DEUX chemins, en ligne la garde est inerte, survie au reload prouvée par présence, foyer étranger jamais sérialisé, prune épargne l'outbox, buster v1 jeté.

## Verification

| Contrôle | Résultat |
|---|---|
| `npx vitest run src/lib/offline src/lib/query-policy.test.ts` | vert — 36 + 12 tests |
| `npm run typecheck` | vert |
| `npm test` | 1810/1812 — les 2 échecs préexistent sur la baseline e14edef (anniversaires-page, vérifié sur worktree jetable) |
| `npm run build` | vert (precache 149 entrées) |
| Garde de classe | `new MutationCache(` et `new QueryClient(` uniquement dans query-policy.ts (tests E et L) ; `sw.ts` intouché |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Portée outbox : session-store enregistre un fournisseur**
- **Found during:** Task 1
- **Issue:** le MutationCache a besoin du couple (userId, householdId) ; query-policy ne peut pas importer les stores (cycle d'imports démontré dans RESEARCH).
- **Fix:** `setOutboxScopeProvider` (outbox.ts) + enregistrement à la fin de session-store.ts — la portée est évaluée à chaque enfilage, donc suit naturellement signOut (user null → plus d'enfilage) et les changements de foyer.
- **Files:** app/src/stores/session-store.ts, app/src/lib/offline/outbox.ts
- **Commit:** 71b0c7a

**2. [Rule 1 - Bug] L'overlay optimiste crashait les vues lisant `created_at`**
- **Found during:** Task 3 (`npm test` : routines-page rouge, vert sur baseline)
- **Issue:** la ligne optimiste ne portait pas les champs d'audit posés par le serveur ; `buildRoutines` → `toLocalDate(row.created_at)` sur `undefined`.
- **Fix:** l'overlay simule `created_at`/`updated_at` (Realtime/invalidation les remplaceront, D-16).
- **Files:** app/src/lib/data/useResource.ts
- **Commit:** 184f1f8

**3. [Rule 1 - Bug] `isNetworkFailure`/`classifyFailure` lisaient l'Error, pas sa cause**
- **Found during:** Task 2 (tests rouges : DataError n'expose pas `code` au premier niveau — il est dans `cause`)
- **Fix:** les deux fonctions déroulent la chaîne `error → cause` ; un code PG à l'un OU l'autre maillon est un refus métier.
- **Files:** app/src/lib/offline/outbox.ts
- **Commit:** f5359a7

## Notes

- La garde upfront (D-07) est interprétée « hors-ligne uniquement » : en ligne, les modules hors liste (ardoise, notes…) doivent continuer de fonctionner — le message du refus (« Ce module n'est pas disponible hors-ligne. ») le confirme. Prouvé par le test « EN LIGNE, une écriture hors liste passe normalement ».
- Le rejeu lui-même (lecture de la file, upsert onConflict, déclencheurs D-08, badge D-13) est le plan 03 ; ce plan livre la matière première et sa persistance.
- `app/src/types/database.ts` toujours sans `client_key` : les payloads voyagent en `Partial<T>` générique, le typecheck ne vérifie pas la colonne (divergence déjà notée au plan 01).
- 2 tests anniversaires préexistants en échec : hors périmètre, consignés dans `deferred-items.md`.

## Self-Check: PASSED
- Commits 71b0c7a, f5359a7, 184f1f8 présents (git log) : vérifié.
- outbox.ts / outbox.test.ts / query-persistence.ts / query-policy.ts / useResource.ts modifiés : vérifié (git diff 7 fichiers, 931 insertions).
- Suites vertes : vérifié (vitest 36/36 sur src/lib/offline + query-policy, typecheck, build).
