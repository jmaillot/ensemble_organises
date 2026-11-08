---
phase: 37-filet-de-tests-fiable
plan: 02
subsystem: tests/docs
tags: [test-01, test-02, test-03, test-04, retrospective, flaky]
requires: [auth-bootstrap-offline.test.tsx, offline-shared-device.spec.ts, docs/RETROSPECTIVE.md]
provides: []
affects: [app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx, docs/RETROSPECTIVE.md]
key-files:
  created:
    - .planning/phases/37-filet-de-tests-fiable/deferred-items.md
  modified:
    - app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx
    - docs/RETROSPECTIVE.md
decisions:
  - "TEST-03 différé au checkpoint : e2e 2 comptes réels non exécuté — identifiants non fournis, skip conditionnel D-04 conservé tel quel (une preuve inventée n'est pas une preuve)"
  - "Entrée unique « campagne tests v1.2 » dans docs/RETROSPECTIVE.md couvrant les 4 dettes (D-10)"
  - "Flocon sibling household-store WR-03 observé en clôture — hors périmètre, consigné dans deferred-items.md (§2.7 périmètre)"
metrics:
  duration: ~25 min (hors pause checkpoint)
  completed: 2026-11-07
status: complete
commits: 2
plan_head_before: b0c9c3d
plan_head_after: 577871a
estimate:
  tokens: 80000
actuals:
  tokens: 14000
  tasks: 3
  commits: 2
---

# Phase 37 Plan 02: Durcissement test D, TEST-02 soldé, campagne v1.2 Summary

**One-liner :** Flocon auth-bootstrap épinglé par un waitFor à options explicites bornées (TEST-01), TEST-02 confirmé soldé par lecture du diff `cdd4fa7`, campagne tests v1.2 consignée en une entrée unique rétrospective — TEST-03 (e2e 2 comptes réels) différé assumé.

## Tasks

| # | Tâche | Statut | Commit |
|---|-------|--------|--------|
| 1 | Durcissement test D — tolérance bornée (TEST-01, D-01) | ✅ | `b0c9c3d` |
| 2 | TEST-02 confirmé soldé via `git show cdd4fa7` (D-03) | ✅ | — (vérification, preuve capturée au checkpoint) |
| 3 | Exécution e2e offline-shared-device 2 comptes réels (TEST-03, D-05/D-06) | ⏸️ **Différé — checkpoint skip** | — |
| 4 | Entrée unique rétrospective « campagne tests v1.2 » (D-10) | ✅ | `577871a` |

## Task 3 — Deferral (checkpoint decision)

L'exécution e2e offline-shared-device (TEST-03) a été **différée par décision utilisateur au checkpoint** : les 4 env vars `E2E_SHARED_USER_{A,B}_{EMAIL,PASSWORD}` ne sont pas fournies et aucune credential ne sera inventée (§2.7 H). Le skip conditionnel du spec (D-04) reste inchangé octet pour octet — il est correct : sans comptes réels, une exécution factice produirait un succès muet (§2.7 F). TEST-03 reste **ouvert** dans REQUIREMENTS.md ; le véhicule de re-test est prêt (spec étendu au plan 37-01). Consigné dans docs/RETROSPECTIVE.md (« Ce qui reste ouvert, assumé ») et dans les Blockers de STATE.md.

## What Was Built

1. **Tâche 1 (`b0c9c3d`)** — `app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx` : le `waitFor` nu du test D devient `waitFor(…, { timeout: 5_000, interval: 50 })` avec commentaire français citant D-01 (flocon ~1/367 sous charge, tolérance bornée à CE test, jamais vite.config.ts). Harnais, tests E/F et bloc `test` de vite.config.ts intacts. Suite complète verte au commit : 243 fichiers / 1960 tests.
2. **Tâche 2 (checkpoint)** — lecture du diff complet de `cdd4fa7` : il touche `anniversaires-page.test.tsx` avec le bornage annuel — les 2 tests rouges d'origine v1.1 sont bien ceux corrigés. Couverture prouvée, aucune escalade, aucun fichier modifié.
3. **Tâche 4 (`577871a`)** — `docs/RETROSPECTIVE.md` : section unique « Campagne tests v1.2 — filet de tests fiable » (D-10) avec 4 sous-entrées (flocon TEST-01, TEST-02 soldé, TEST-04 purge rouge→vert, TEST-03 assumé ouvert) + observation clôture. Vérifies du plan passés : exactement 1 occurrence du titre hors titres, zéro secret/credential.

## Deviations from Plan

**1. [Out-of-scope discovery] Flocon sibling household-store WR-03 en clôture** — lors de la re-vérification finale `npm test` après l'édition rétrospective, `household-store.test.ts` (WR-03 « rétablit la persistance sur le nouveau couple après le switch ») a échoué 1–2 fois sous charge parallèle (243 fichiers), puis 13/13 vert deux fois en isolation. Même famille de flocon que TEST-01 (attente temporelle fixe 1200 ms sensible au parallélisme), mais test non modifié par la phase 37 → non corrigé (périmètre §2.7). Consigné dans `.planning/phases/37-filet-de-tests-fiable/deferred-items.md` et mentionné honnêtement dans la rétrospective. **Le TEST-01 lui-même (test D) est passé sous charge dans les deux exécutions complètes.**

## Verification

- Plan verify tâche 4 : `grep -v '^#' docs/RETROSPECTIVE.md | grep -c 'campagne tests v1.2'` = 1 ✅ ; grep secrets = 0 ✅
- Chaîne §2.7 : `npm run typecheck` vert ; `npm test` = 1–2 flocons household-store WR-03 hors périmètre (1958–1959/1960 verts, test D inclus) ; `npm run build` non relancé en clôture — déjà vert à `b0c9c3d` (aucun fichier applicatif modifié depuis : le seul diff postérieur est docs/RETROSPECTIVE.md)
- SQL non modifié — contrôles SQL trivialement verts

## Known Stubs

Aucun stub — TEST-03 n'est pas un stub mais une dette explicitement assumée (skip conditionnel correct, véhicule de re-test prêt), tracée dans REQUIREMENTS.md (TEST-03 ouvert), STATE.md (Blockers) et docs/RETROSPECTIVE.md.

## Threat Flags

Aucune nouvelle surface : modifications test unitaire et documentation.

## Self-Check: PASSED

- Commit `b0c9c3d` présent (`git log`) ✅ — tâche 1
- Commit `577871a` présent (`git log`) ✅ — tâche 4
- docs/RETROSPECTIVE.md contient la section unique campagne tests v1.2 ✅
- deferred-items.md créé ✅
- `.planning/phases` est gitignore dans ce dépôt (whitelist) — SUMMARY non forcé au stage, conformément à la consigne
