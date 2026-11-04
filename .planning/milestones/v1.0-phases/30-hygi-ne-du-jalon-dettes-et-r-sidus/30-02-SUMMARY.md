---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 02
subsystem: docs/hors-ligne
tags: [det-02, offline, d-06, d-07, rejouement]
requires: [30-01]
provides: [todos-13-14-15-clos, det-02-clos]
affects: []
key-files:
  created: []
  modified: [docs/TODO.md]
decisions:
  - "D-06 : rejouement de preuves, réécriture zéro des fixes (seedOnlineStatus, networkMode 'always')"
  - "Clôture des todos par preuve fraîche datée du 2026-10-31 (tests rejoués + constat humain approuvé), dans le style des clôtures existantes de docs/TODO.md"
metrics:
  duration: session continue (Tasks 1-3), clôture le 2026-10-31
  completed: 2026-10-31
status: complete
commits: 1
plan_head_before: c7e6be52189990afb6e043faf661d49078ad667a
plan_head_after: e490dde
actuals:
  tokens: 800
  tasks: 3
  commits: 1
estimate:
  tokens: 55000
  tasks: 3
---

# Phase 30 Plan 02: Rejouement des preuves des todos 13/14/15 (DET-02) Summary

**One-liner:** DET-02 clos par rejouement de preuves (D-06) — tests automatisés re-vérifiés verts, constat d'usage hors ligne à froid refait et approuvé par l'opérateur le 2026-10-31 en production, todos 13/14/15 clôturés dans docs/TODO.md avec preuve fraîche datée.

## Ce qui a été re-prouvé

### Task 1 — Rejouement des preuves automatisées (aucun commit, aucune modification de code)

- `cd app && npm run typecheck` → **OK**.
- Tests ciblés `npm test -- online-status query-policy` → **9/9 verts** (2 fichiers de test sélectionnés, aucun "0 passed").
- Suite complète `npm test` → **1678/1679 verts**. L'unique échec, `calendrier-page.test.tsx`, est **antérieur au plan et hors périmètre** (SCOPE BOUNDARY) : consigné dans `.planning/phases/30-hygi-ne-du-jalon-dettes-et-r-sidus/deferred-items.md`, pas corrigé ici.
- Grep de vérification : le badge « À faire » du shell ne compte aucune valeur codée (le « 15 » historique), et `app/src/lib/query-policy.ts` porte bien `networkMode: 'always'` sur les deux configurations (queries l.39 et mutations l.49).
- **Aucune modification** de `online-status.ts` / `query-policy.ts` / `main.tsx` (D-06).

### Task 2 — Balayage de classe D-07 (aucun commit, verdicts « correct »)

Inventaire grep des lectures d'état réseau hors de `online-status.ts` :

| Zone | Verdict |
|---|---|
| `app/src/modules/ardoise/api.ts` | correct (aucune voie parallèle active) |
| `app/src/modules/parametres/api.ts` | correct |
| `app/src/app/route-preload.ts` | correct |
| `app/src/components/shared/offline-banner.tsx` | correct (passe par `useOnlineStatus`) |

**0 résidu, 0 correction** — la classe « état réseau lu par une voie parallèle » est close.

### Task 3 — Constat d'usage hors ligne à froid (HUMAIN) + clôture des todos

**Constat approuvé le 2026-10-31** par l'opérateur, en navigateur réel contre la production `https://ensemble.jeremymaillot.fr` (`F12` → Réseau → Hors ligne → recharger, cache désactivé) :

- Courses rend l'**erreur d'origine** avec « Réessayer » — jamais « Aucune liste pour ce foyer » ;
- le badge « À faire » compte juste — ou n'affiche rien tant que la lecture des assignations n'a pas rendu — jamais une valeur fausse ;
- le bandeau hors-ligne est présent **dès le premier rendu** ;
- le retour en ligne recharge les données **sans rechargement de page**.

**Aucun écart signalé.**

## Clôture des todos (preuve fraîche dans docs/TODO.md)

Chacun des trois todos porte désormais un paragraphe « **Re-prouvé le 2026-10-31 (phase 30, plan 02, rejouement D-06)** » citant le rejouement automatisé (typecheck OK, online-status + query-policy 9/9, suite 1678/1679 avec l'unique échec hors périmètre consigné) **et** le constat humain approuvé du même jour en production :

- **13** (scripts d'exploitation véridiques / estampille) — clôture 2026-10-18 complétée par le re-prouvé du 2026-10-31.
- **14** (badge « À faire » / course sur les assignations) — le correctif `2a74f8b`…`1a180a3` est cité comme non réécrit ; le badge ne peut plus compter la tâche d'un autre membre.
- **15** (hors ligne, « rien » au lieu de dire l'échec) — `networkMode: 'always'` et `seedOnlineStatus()` vérifiés en place, non réécrits ; les trois preuves du constat tiennent.

Commit : `e490dde` — `docs(30-02): clos todos 13/14/15 sur preuve fraiche (rejouement 2026-10-31 + constat humain approuve)`.

## Preuves citées (artefacts d'origine, inchangés)

- `app/src/main.tsx:25` → appel unique `seedOnlineStatus()` avant le rendu.
- `app/src/lib/online-status.ts:30` → amorçage depuis `navigator.onLine`.
- `app/src/app/app-shell.tsx:118-122` → badge « À faire » / bandeau hors-ligne.
- `app/src/lib/query-policy.ts:39` (queries) et `:49` (mutations) → `networkMode: 'always'`.

## Deviations from Plan

None — plan exécuté tel qu'écrit. Tasks 1-2 produisent zéro commit **by design** (rejouement sans réécriture, verdicts « correct »). Le seul échec de test (`calendrier-page.test.tsx`) est hors périmètre et consigné dans `deferred-items.md` (SCOPE BOUNDARY), pas traité ici.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `docs/TODO.md` contient trois occurrences « Re-prouvé le 2026-10-31 » (13/14/15) — vérifié par grep.
- [x] Commit `e490dde` existe dans l'historique.
- [x] Aucun changement de code d'application (`.planning` hors git ; `git show --stat e490dde` = docs/TODO.md seul).
