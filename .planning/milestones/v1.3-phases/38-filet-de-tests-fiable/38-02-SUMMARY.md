---
phase: 38
plan: 02
subsystem: tests
tags: [tests, flake, timing, offline, retrospection]
requires: [plan 37 D-01 (protocole flocon), commits 4f88b89/8dace2c/4f45e83 (38-01, référencés)]
provides: [WR-03 durci (attente d'état), harnais household-store fidèle (délégation synchrone), diagnostic W-02 campagne v1.3 dans docs/RETROSPECTIVE.md]
affects: [app/src/stores/household-store.test.ts, docs/RETROSPECTIVE.md]
actuals:
  tokens: 62000   # chars/4 sur le diff réel (3 commits)
  tasks: 3
  commits: 3
plan_head_before: 4f45e83
plan_head_after: b4a19ef
tech-stack:
  added: []
  patterns: [vi.waitFor attente d'état (patron route-error.test.tsx:39), mock synchrone par refs capturées en factory]
key-files:
  created: []
  modified:
    - app/src/stores/household-store.test.ts
    - docs/RETROSPECTIVE.md
key-decisions:
  - "Correction strictement test-only : le protocole W-02 n'a désigné aucun défaut de production (garde cancelled de Pitfall 6 et stopPersisting synchrone innocents) — le harnais, lui, déléguait stopPersisting de façon ASYNCHRONE (vi.importActual par mockImplementation), rouvrant sous charge la fenêtre que Pitfall 6 avait fermée."
  - "Le flake reproduit (1/30) a frappé le test frère D-17 (l.266), pas le test WR-03 accusé (l.330) : les deux courses du même fichier (sommeil 1200 ms vs throttle 1000 ms ; fenêtre de mise en silence) sont corrigées ensemble, et la non-reproduction de WR-03 lui-même (0/30, 0/12 isolation) est consignée explicitement (§2.7 F) avec sa cause prouvée par lecture (marge 200 ms)."
  - "Le harnais fidèle au contrat temporel de production : espions délégués à des refs réelles capturées UNE FOIS par la factory du mock, appel SYNCHRONE — comme le stopPersisting de production."
requirements-completed: [TEST-01, TEST-03]
coverage:
  - deliverable: "Protocole W-02 exécuté avant fix (reproduction + taux consigné)"
    kind: command
    ref: "30 exécutions chargées de npx vitest run src/stores/household-store.test.ts sur l'arbre de base → 1/30 rouge (test frère D-17, l.266, état vide attendu undefined) ; 0/12 WR-03 en isolation ; 0/12 D-17 en isolation ; consigné dans RETROSPECTIVE.md §12"
    status: pass
    human_judgment: false
  - deliverable: "WR-03 durci : attente d'état vi.waitFor, sommeil 1200 ms supprimé"
    kind: command
    ref: "grep setTimeout(resolve, 1200) = 0 ; grep vi.waitFor >= 1 ; npx vitest run src/stores/household-store.test.ts → 13/13 ; série de preuve 20/20 exécutions chargées vertes"
    status: pass
    human_judgment: false
  - deliverable: "Diagnostic W-02 des deux flakes consigné (campagne v1.3, RETROSPECTIVE.md)"
    kind: command
    ref: "grep -c 'WR-03' docs/RETROSPECTIVE.md = 9 (>= 2 requis) ; grep -c 'debutSemaineIso' = 2 ; section 15 référence le flocon test D de la phase 37"
    status: pass
    human_judgment: false
  - deliverable: "Aucune régression hors périmètre"
    kind: command
    ref: "npm run typecheck (tsc --noEmit) vert ; npm test complet → 244/244 fichiers, 1988/1988 tests verts"
    status: pass
    human_judgment: false
duration: ~80 min
completed: 2026-11-08
status: complete
---

# Phase 38 Plan 02: Filet de tests fiable — WR-03 et flake D-17 (household-store) Summary

**WR-03 n'est plus une course assumée : le test attend l'état persisté via `vi.waitFor` (20/20 exécutions chargées vertes), la cause timing est prouvée par le protocole W-02 exécuté avant fix (1/30 sous charge) et consignée dans la campagne v1.3 de `docs/RETROSPECTIVE.md` — code de production prouvé innocent, correction test-only.**

## What Was Built

1. **Protocole W-02 exécuté avant tout fix (§2.7 B)** — commit `3eb42c1` : 30 exécutions
   chargées de la suite household-store sur l'arbre de base (5 en parallèle, la
   concurrence tenant lieu de charge) → **1/30 rouge**, frappant le test frère D-17
   (l.266) : l'assertion d'absence a reçu `{"buster":"v2",…,"queries":[]}` — un état
   vide réécrit sur la clé du foyer quitté après la purge. WR-03 lui-même : 0/30, et
   0/12 en isolation — absence de reproduction dite explicitement (§2.7 F), la cause
   restant prouvée par lecture (sommeil 1200 ms vs throttle 1000 ms,
   `query-persistence.ts:71`, marge 200 ms). Cause date exclue (ids fixes, aucune
   horloge). 37 exécutions de plus avec un traceur temporaire sur `setItem` (retiré
   après) ont capturé la classe du défaut : une écriture d'état vide par une
   souscription ayant survécu à son point de mise en silence.
2. **Durcissement test-only** — commit `3895197` : le sommeil fixe de 1200 ms est
   remplacé par `vi.waitFor(() => expect(get(cacheKey('u1','h-new'), probeStore))
   .resolves.toContain('post-switch'), { timeout: 5_000, interval: 50 })` (patron
   `route-error.test.tsx:39`) ; le commentaire de contrat de course est remplacé par
   la désignation du défaut d'origine ; le harnais D-17 délègue désormais ses espions
   de façon SYNCHRONE (refs réelles capturées par la factory du mock) au lieu du pont
   asynchrone `vi.importActual` qui, sous charge, rouvrait la fenêtre de mise en
   silence fermée par Pitfall 6.
3. **Diagnostic consigné** — commit `b4a19ef` : campagne v1.3 dans
   `docs/RETROSPECTIVE.md` (sections 12-15, numérotation poursuivant v1.2) — pour les
   DEUX flakes : WR-03/D-17 (timing, corrections test-only, preuve 20/20) et le flake
   menu (cause DATE, correction portée par le plan 38-01 via `debutSemaineIso`/
   `jourSemaine`, commits `4f88b89`/`8dace2c`/`4f45e83` vérifiés dans l'historique) —
   avec le lien de continuité vers le protocole du flocon test D de la phase 37.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Le flake reproduit n'était pas (seulement) WR-03 — course du harnais D-17 corrigée dans le même commit test-only**
- **Found during:** Task 1 (protocole de reproduction)
- **Issue:** La reproduction (1/30) a frappé le test D-17 (l.266), pas le test WR-03 visé par le plan. Le traceur temporaire a montré la classe du défaut : écriture d'état vide sur la clé `h-old` par une souscription dont la mise en silence (stopPersisting) glissait de quelques tâches — fenêtre ouverte par la délégation ASYNCHRONE du mock (`vi.importActual` dans chaque `mockImplementation`), alors que le `stopPersisting` de production est un void SYNCHRONE.
- **Fix:** Délégation synchrone aux refs réelles capturées une fois par la factory du mock — le harnais colle au contrat temporel de production. W-02 respecté : correction test-only, aucune modification de production (`grep -c switchWithPurge household-store.ts` inchangé = 2, diff production vide).
- **Files modified:** app/src/stores/household-store.test.ts
- **Commit:** 3895197

## Verification Results (§2.7 F — chaque contrôle avec son résultat)

- Reproduction arbre de base : 30 exécutions chargées → 1 FAIL (run 4, test D-17 l.266), 29 PASS.
- Isolation : WR-03 seul 0/12, D-17 seul 0/12 (la course exige l'état module du fichier partagé).
- Post-fix : 20/20 exécutions chargées vertes (5 en parallèle).
- `grep -c "setTimeout(resolve, 1200)"` = 0 ; `grep -c "vi.waitFor"` = 1 ; `grep -c "WR-03" docs/RETROSPECTIVE.md` = 9 ; `grep -c "debutSemaineIso"` = 2.
- `npm run typecheck` : vert (tsc --noEmit, aucune sortie).
- Suite complète : **244/244 fichiers, 1988/1988 tests verts** (264 s).
- Aucune modification de production : `git diff --stat household-store.ts query-persistence.ts` vide au commit test (le traceur temporaire de Task 1 a été appliqué puis retiré, sans commit).

## Known Stubs

Aucun — aucune donnée factice, aucune assertion neutralisée.

## Self-Check: PASSED

- Fichiers clés présents : `app/src/stores/household-store.test.ts` (modifié, vi.waitFor en place), `docs/RETROSPECTIVE.md` (campagne v1.3 sections 12-15).
- Commits vérifiés : `git log --oneline -3` → `b4a19ef`, `3895197`, `3eb42c1` ; `git rev-list --count 4f45e83..HEAD` = 3.
- Critères d'acceptance des 3 tâches : tous relus et PASS (détail dans Verification Results).
