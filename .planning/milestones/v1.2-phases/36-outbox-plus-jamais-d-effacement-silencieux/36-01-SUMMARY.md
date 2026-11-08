---
phase: 36-outbox-plus-jamais-d-effacement-silencieux
plan: 01
status: complete
subsystem: outbox / offline
tags: [outbox, pgrst116, libellés, offline, postgrest]
requires:
  - classifyFailure (outbox.ts, phase 34 D-10)
  - offline-panel.tsx bloc failed
provides:
  - FAILURE_FAMILIES (matrice D-05 exportée, outbox.ts)
  - failureLabel (fonction pure code→libellé, outbox.ts)
affects:
  - offline-panel.tsx (rendu failure)
  - outbox.test.ts / outbox-replay.test.ts / offline-panel.test.tsx (audit vivant)
key-files:
  created: []
  modified:
    - app/src/lib/offline/outbox.ts
    - app/src/modules/parametres/components/offline-panel.tsx
    - app/src/lib/offline/outbox-replay.test.ts
    - app/src/lib/offline/outbox.test.ts
    - app/src/modules/parametres/components/offline-panel.test.tsx
decisions:
  - "FAILURE_FAMILIES : matrice D-05 fermée exportée, libellé PGRST116 verrouillé mot pour mot (D-01)"
  - "failureLabel : fonction PURE dérivée du seul code au rendu — jamais stocké, zéro migration IndexedDB (D-13)"
  - "Décision Q2 : codes PG retryable de nature (40001) restent sous le défaut terminal D-06, Réessayer manuel conservé"
tech-stack:
  added: []
  patterns: [matrice-auditive-it.each, libellé-dérivé-au-rendu]
metrics:
  tasks: 3
  duration: "~35 min"
  completed: 2026-11-07
---

# Phase 36 Plan 01 : Libellés d'échec d'outbox — jamais d'effacement silencieux Summary

**One-liner :** Catalogue code→famille→libellé français (D-05) dérivé au rendu via `FAILURE_FAMILIES` + `failureLabel` ; le scénario 404 (PGRST116) prouvé rouge→vert de bout en bout, le message PostgREST brut banni du DOM.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Tracer — scénario 404 rouge documenté puis vert | fabf9f7 (rouge), 56be727 (vert) | outbox-replay.test.ts, outbox.ts, offline-panel.tsx |
| 2 | Audit matriciel dans les tests (D-04/D-05/D-06) + décision Q2 | 4f2affb | outbox.test.ts |
| 3 | Rendu panneau testé (D-10) — libellé 404, ancienne forme, états vides | 4e7d432 | offline-panel.test.tsx |

## Sortie du rouge D-09 (consignée, §2.7 B)

- **Commande :** `cd app && npm test -- --run outbox-replay` → 1 failed / 24 passed.
- **Erreur observée :** `TypeError: failureLabel is not a function` sur l'assertion de libellé (outbox-replay.test.ts:325) — l'export n'existait pas.
- **Réponse à Q1 :** toutes les assertions AMONT passaient déjà dans le même run rouge : entrée jamais évaporée (longueur 1), status `'failed'`, code `PGRST116` conservé, non-boucle. **Ce n'était pas une vraie évaporation** — la classification D-10 de la phase 34 était correcte ; c'est le **libellé** qui manquait, le panneau affichant le message PostgREST anglais brut (`entry.failure.message`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test sonde « empty » : double rendu au lieu du re-rendu réactif**
- **Found during:** Task 3
- **Issue:** La première version montait un SECOND `OfflinePanel` après `setQueryData([])` au lieu d'observer le re-rendu du panneau déjà monté (2 occurrences attendues, 1 trouvée).
- **Fix:** Assertion sur le re-rendu du panneau existant (source unique `useOutbox`), via `waitFor` après vidage de la file.
- **Files modified:** app/src/modules/parametres/components/offline-panel.test.tsx
- **Commit:** 4e7d432

## Décisions clés

1. **Matrice D-05 fermée et exportée** (`FAILURE_FAMILIES`) : codes EXACTS, matching `===` (jamais startsWith — Pitfall 1, sonde « encoding » prouvée : `PGRST10` tronqué → générique). Libellé PGRST116 verrouillé mot pour mot (D-01).
2. **Libellé dérivé au rendu** (`failureLabel`, fonction pure du seul `code`) : la forme persistée `OutboxEntry.failure` est inchangée — zéro migration IndexedDB, les entrées d'avant la phase rendent le bon libellé (preuve « ancienne forme », Tâche 3).
3. **Décision Q2 (tranchée) :** les codes PG retryable de nature (40001) restent sous le défaut terminal D-06 — libellé générique + action Réessayer manuelle. Aucune famille retryable nouvelle. Testé explicitement.
4. **Badge :** le compteur est dérivé des entrées (failed incluses) via la source unique `useOutbox` — rien à libelliser côté badge, aucun changement nécessaire (assertion existante inchangée).

## Verification

- `cd app && npm test -- --run outbox-replay outbox offline-panel` : 92 tests verts, dont 6 familles itérées (D-04, 2× par code).
- `cd app && npm test` : 243 fichiers, 1961 tests verts.
- `cd app && npm run typecheck` : 0 erreur.
- `cd app && npm run build` : OK (précache 152 entrées).

## Success Criteria

- [x] Scénario critère 1 : intégration 404 → failed + libellé « cet élément a été supprimé entre-temps » + non-boucle, rouge documenté (fabf9f7) puis vert (56be727).
- [x] Matrice D-05 intégralement testée 2× par code (OBOX-02, D-04) — 6 familles.
- [x] D-06 (code imprévu XX999 → terminal + générique) et Q2 (40001) prouvés par test.
- [x] Aucun message PostgREST brut au DOM (`document.body.textContent` asserté) ; entrées anciennes rendues sans migration.

## Self-Check: PASSED

- Commits vérifiés : fabf9f7, 56be727, 4f2affb, 4e7d432 (git log).
- Fichiers modifiés présents au diff des commits correspondants.
