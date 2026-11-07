---
phase: 33-cache-de-lecture-offline
plan: 06
subsystem: lecture-hors-ligne
tags: [offline, tanstack-query, error-handling, tier1]
requires: [33-03 (allowlist/persistance), 33-04, 33-05 (bandeau ambre D-12/D-13)]
provides: [cloisonnement erreur/données dans la couche de lecture (useResource) et sur les useQuery directs exposant isError]
affects: [courses, taches, routines, voyages, calendrier, messages]
tech-stack:
  added: []
  patterns: ["garde `query.isError && query.data === undefined` — l'erreur n'est honnête que SANS données en cache (D-09)"]
key-files:
  created:
    - app/src/modules/taches/taches-offline.test.tsx
    - app/src/lib/data/useResource.test.tsx
  modified:
    - app/src/modules/courses/courses-offline.test.tsx
    - app/src/lib/data/useResource.ts
    - app/src/modules/voyages/hooks/use-voyages.ts
    - app/src/modules/voyages/hooks/use-trip-detail.ts
    - app/src/modules/calendrier/hooks/use-ref-days.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/taches/hooks/use-taches.ts
    - app/src/modules/routines/hooks/use-routines.ts
decisions:
  - "isError = query.isError && query.data === undefined partout où isError est exposé au rendu — aucune donnée en cache ne doit être masquée par une NetworkError de refetch hors ligne (G-33-3)"
  - "use-trip-detail : agrégat brut isError conservé pour le gating (notAuthorized/enabled compteurs), seul l'exposé au rendu est cloisonné (hasError)"
  - "aucun nouveau badge de péremption : le bandeau ambre D-12/D-13 reste le seul signal (décision produit du plan)"
  - "use-routines : completionsResource laissé tel quel — useResource cloisonne déjà son isError/error en interne"
metrics:
  duration: ~25 min
  completed: 2026-11-05
status: complete
actuals:
  tokens: 2600
  tasks: 4
  commits: 4
commits: 4
plan_head_before: e6430f9
plan_head_after: 6a5ccc9
---

# Phase 33 Plan 06: Cloisonnement erreur/données hors ligne (G-33-3) Summary

**One-liner :** Fermeture de G-33-3 — `isError` cloisonné par présence de données (`query.isError && query.data === undefined`) dans useResource, les useQuery directs exposant isError (voyages, détail voyage, calendrier useRefDays, messages) et les requêtes d'annexe de use-taches/use-routines, prouvé RED→GREEN par un test e2e courses + tâches hors ligne.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED — garde « refetch échoué avec données en cache → lignes rendues » | 8f8f37e | courses-offline.test.tsx, taches-offline.test.tsx (nouveau), useResource.test.tsx (nouveau) |
| 2 | GREEN — cloisonnement dans useResource (+garde sur error) | 4beaddb | useResource.ts |
| 3 | Audit des useQuery directs exposant isError | c469fa5 | use-voyages.ts, use-trip-detail.ts, use-ref-days.ts, use-messages.ts |
| 4 | Hooks composés Tier 1 — annexe taches/routines | 6a5ccc9 | use-taches.ts, use-routines.ts |

## RED→GREEN

- **RED (commit 8f8f37e)** : les 3 nouveaux tests échouent sur le code d'alors — la page rend l'ErrorState « Ce contenu n'a pas pu être chargé » malgré les lignes en cache (courses via useResource, tâches via les requêtes d'annexe `queryKeys.tableAll(...)`, unitaire useResource).
- **Après Task 2** : courses + unitaire verts, tâches encore rouge (les useQuery d'annexe ne passent pas par useResource) — exactement la frontière prédite par le diagnostic.
- **Après Task 4** : tâches verte (5/5 tests du périmètre verts).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] selectKey passé en `null` dans les tests — erreur TS2345**
- **Found during:** Task 2 (verify)
- **Issue:** `queryKeys.table(..., null)` — le paramètre `selectKey` est `string | undefined`, pas `null`.
- **Fix:** argument omis au lieu de `null` dans courses-offline.test.tsx et useResource.test.tsx.
- **Files modified:** les deux fichiers de test de la Task 1.
- **Commit:** 4beaddb

Aucune autre déviation : ni query-policy.ts, ni query-persistence.ts, ni router.tsx, ni le reducer TanStack n'ont été touchés (périmètre minimal du plan respecté).

## Verification (chaîne §2.7 AGENTS.md)

1. `npm run typecheck` — vert.
2. `npm test` — **1786/1788 verts** ; 2 échecs PRÉ-EXISTANTS (voir Observations hors périmètre).
3. `npm run build` — vert.
4. `npm run test:e2e` — Docker disponible, exécuté : **159 passed, 9 skipped, 2 failed** (voir Observations hors périmètre).
5. Contrôle statique SQL / test-db.sh — non concernés (aucune migration, aucun SQL dans ce plan).

## Observations d'audit hors périmètre (non corrigées, non introduites par ce plan)

1. **`anniversaires-page.test.tsx` — 2 échecs vitest pré-existants** (« bascule entre la vue liste et la vue calendrier », « garde le point d'un anniversaire d'origine anniversaire comme bouton d'édition (D-13, pendant) »). Prouvés pré-existants : reproductibles sur `e6430f9` (base du plan) dans un worktree propre, avant tout commit 33-06. Hors périmètre — aucune modification du module anniversaires dans ce plan.
2. **e2e — 2 échecs « rejoindre un foyer valide le format du token »** (chromium + mobile, `critical-paths.spec.ts:134`) et 9 skipped. Flux d'onboarding/jointure de foyer, aucun fichier de ce plan ne le touche (onboarding, token HMAC). À examiner dans une passe dédiée.
3. **Usages d'appoint non audités volontairement** (discipline de périmètre du plan) : `use-global-search`, `use-weather`, `use-open-task-assignees`, couvertures de recettes — aucun ne rend un ErrorState de page confirmé à l'audit grep ; à re-vérifier si un gap similaire remonte.
4. **`use-courses.ts:523`** compose `listResource.isError || itemResource.isError` — hérite du garde via useResource (aucune modification nécessaire, confirmé par le test courses GREEN) ; mais un cache d'items ABSENT (undefined) reste une erreur honnête : le test pré-pourrit une liste d'items vide pour rendre les lignes.

## Known Stubs

None — aucun stub introduit.

## Threat Flags

Aucune nouvelle surface de sécurité : le plan ne touche aucune route réseau, auth, ni schéma ; c'est un changement d'exposition d'état UI.

## Self-Check: PASSED

- 4 commits vérifiés (`git log e6430f9..HEAD --oneline` : 8f8f37e, 4beaddb, c469fa5, 6a5ccc9).
- Fichiers créés présents sur disque ; diff limité aux 10 fichiers `files_modified` (+ aucun autre).
- Aucune directive de linter (`eslint-disable`, etc.) introduite — `grep -rn "eslint-disable\|biome-ignore" app/src` sur les fichiers modifiés : néant.
