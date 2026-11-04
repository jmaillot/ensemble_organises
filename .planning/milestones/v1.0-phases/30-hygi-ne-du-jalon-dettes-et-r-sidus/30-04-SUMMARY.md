---
phase: 30-hygi-ne-du-jalon-dettes-et-r-sidus
plan: 04
subsystem: app/parametres
tags: [det-04, estampille, pwa, tdd, d-11, d-12, d-13]
requires:
  - app/Dockerfile:25 (GIT_SHA:-unknown, canal build-arg)
  - offline-panel.tsx (constante au chargement du module)
provides:
  - Libellé de repli « Version de développement » aux deux points d'affichage
  - Contrat deux familles (sans estampille / estampillée) dans offline-panel.test.tsx
affects:
  - offline-panel.tsx (rendu UI uniquement — canaux machine intacts)
tech-stack:
  added: []
  patterns:
    - vi.stubEnv + vi.resetModules + import dynamique (constante calculée au chargement)
    - contrat rouge-avant-vert en deux familles (D-13)
key-files:
  created: []
  modified:
    - app/src/modules/parametres/components/offline-panel.tsx
    - app/src/modules/parametres/components/offline-panel.test.tsx
    - app/src/lib/data/seed.test.ts (déviation Rule 1)
key-decisions:
  - Le repli « Version de développement » est un choix de RENDU strict : appVersion reste 'unknown' côté machine, les trois canaux (X-App-Version, /version.json, LABEL image) gardent leur contrat D-12
  - Le title du repli déclare la cause (build hors pipeline estampillé, valeur non fiable) plutôt qu'un semver faux avec assurance (D-11)
requirements-completed: [DET-04]
duration: ~30 min
completed: 2026-10-31
status: complete
commits: 3
plan_head_before: 0ddb97c
plan_head_after: 7f1fe13
actuals:
  tokens: 33000
  tasks: 2
  commits: 3
coverage:
  - deliverable: "Sans estampille, « Version de développement » aux deux points d'affichage, jamais `unknown` ni `0.1.0`, title explicatif"
    verification:
      - kind: test
        ref: "app/src/modules/parametres/components/offline-panel.test.tsx#affiche « Version de développement » aux deux points d'affichage"
        status: pass
      - kind: test
        ref: "app/src/modules/parametres/components/offline-panel.test.tsx#variante chaîne vide"
        status: pass
    human_judgment: false
  - deliverable: "Avec estampille : SHA court 8 + title complet 40, ligne et pied, inchangés"
    verification:
      - kind: test
        ref: "app/src/modules/parametres/components/offline-panel.test.tsx#affiche les 8 premiers caractères du SHA"
        status: pass
      - kind: test
        ref: "app/src/modules/parametres/components/offline-panel.test.tsx#SHA court au pied Application web"
        status: pass
    human_judgment: false
  - deliverable: "Canaux machine intacts (D-12)"
    verification:
      - kind: command
        ref: "git status --short app/Dockerfile scripts/check-version-stamp.sh compose.app.yaml → vide"
        status: pass
    human_judgment: false
  - deliverable: "Valeur courte non estampillée (e.g. 'abc') affichée en entier"
    verification:
      - kind: test
        ref: "app/src/modules/parametres/components/offline-panel.test.tsx#laisse une valeur courte affichée en entier"
        status: pass
    human_judgment: false
---

# Phase 30 Plan 04: Version de développement sans estampille (DET-04) Summary

Panneau de version : « Version de développement » avec explication au survol quand l'estampille manque, aux deux points d'affichage — plus jamais `unknown` brut ni `0.1.0` à l'écran ; canaux machine inchangés.

## Accomplishments

- **Rouge D-13** (Task 1, commit 7726680) : famille 1 réécrite dans offline-panel.test.tsx — sans estampille (`'unknown'` stubbé ET chaîne vide `''`), le test attend « Version de développement » aux DEUX points d'affichage, refuse `unknown` et `0.1.0` dans le document, exige un `title` non vide. Rouge observé avant toute modification du composant : 2 failed | 3 passed. Famille 2 (SHA 40 → court 8 + title complet) inchangée et étendue au pied « Application web ».
- **Vert D-11** (Task 2, commit 56bbc9d) : offline-panel.tsx affiche « Version de développement » + title français (« construite hors du pipeline estampillé, sa valeur exacte n'est pas fiable ») quand la valeur résolue vaut `unknown` — le `||` existant garantit déjà la chaîne vide traitée comme absente. Avec estampille : SHA court + title complet inchangés. Commentaire du code prolongé (pas de linter : le code dit pourquoi).
- **D-12 prouvé** : `git status` sur app/Dockerfile, scripts/check-version-stamp.sh et compose.app.yaml vide — les trois canaux machine gardent leur contrat `unknown`.

## Verification

- `cd app && npm run typecheck` → vert
- `npm test -- offline-panel` → 5/5 (deux familles + valeur courte)
- `npm test` (suite complète) → 212 fichiers, **1682/1682** verts
- `npm run build` → vert (precache 141 entries)
- Rouge avant vert consigné (Task 1) ; tracer vérifié de bout en bout après Task 2

## Deviations from Plan

**1. [Rule 1 - Bug] Garde DET-03 de seed.test.ts ne pouvait jamais être vert**
- **Found during:** suite complète après Task 2
- **Issue:** le garde ajouté par 30-03 retirait `/assets/` de l'URL puis joignait `public/` — il cherchait `public/recettes/tartiflette.jpg` alors que Vite sert `public/assets/recettes/tartiflette.jpg` (échec préexistant, 1 failed dans la suite).
- **Fix:** join `public/` + chemin SANS le préfixe d'URL (`cover.slice(1)`), avec commentaire ; 2/2 vert, suite complète revenue au vert.
- **Files modified:** app/src/lib/data/seed.test.ts
- **Commit:** 7f1fe13

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** aucun sur le périmètre DET-04 ; répare le plan 30-03 du matin.

## Authentication Gates

None.

## Issues Encountered

None — chaîne complète verte après la déviation ci-dessus.

## Next

Plan 30-05 (dernier plan de la phase 30) — puis porte de la phase 31.
## Self-Check: PASSED — SUMMARY présent sur disque (gitignore .planning/phases), 3 commits vérifiés, 1682/1682 tests verts
