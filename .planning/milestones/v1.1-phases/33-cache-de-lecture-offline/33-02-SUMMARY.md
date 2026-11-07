---
phase: 33-cache-de-lecture-offline
plan: 02
subsystem: service-worker
tags: [service-worker, static-control, offline]
status: complete
requires: []
provides:
  - "Contrôle statique scripts/check-sw-api-cache.sh — prouve que dist/sw.js ne cache jamais une réponse API (OFFR-05)"
affects:
  - "docs/BACKEND.md §10.1 (chaîne de vérification)"
tech-stack:
  added: []
  patterns:
    - "Contrôle + contre-preuve vue rouge sur fixtures (grammaire test-check-sql-statique.py)"
key-files:
  created:
    - scripts/check-sw-api-cache.sh
    - scripts/test-check-sw-api-cache.sh
    - app/fixtures/sw-bon.js
    - app/fixtures/sw-mauvais.js
  modified:
    - docs/BACKEND.md
decisions:
  - "Le contrôle des routes workbox compileées vise src/sw.ts (count registerRoute( == 1) : dist/sw.js contient le code workbox inliné, dont registerRoute interne — un comptage sur le bundle compterait le framework, pas le code métier"
  - "Mode --check-file résout les chemins relatifs à app/ (le vérificateur y entre avant de lire)"
metrics:
  duration: ~15 min
  completed: 2026-11-04
plan_head_before: 845255b
plan_head_after: 309d429
commits: 2
actuals:
  tokens: 12000
  tasks: 2
  commits: 2
---

# Phase 33 Plan 02: Contrôle statique sw.js — jamais de cache API Summary

**One-liner:** Contrôle statique à trois vérifications sur `dist/sw.js` + contre-preuve vue rouge sur fixtures, prouvant que le SW ne cache jamais une réponse API (OFFR-05, garantie « le serveur est la seule vérité »).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Contrôle statique check-sw-api-cache.sh + fixtures | 5b541da | scripts/check-sw-api-cache.sh, scripts/test-check-sw-api-cache.sh, app/fixtures/sw-bon.js, app/fixtures/sw-mauvais.js |
| 2 | Brancher le contrôle dans la chaîne de vérification | 309d429 | docs/BACKEND.md |

## Preuve vue rouge (§2.7)

La contre-preuve a été vue ROUGE sur la fixture mauvaise AVANT d'être vue verte sur la
fixture bonne. Refus observé, sur le défaut visé (pas sur un garde-fou de fichier absent) :

```
fixture mauvaise : refusee comme attendu (vu rouge) — ECHEC: stratégie cacheable détectée
dans fixtures/sw-mauvais.js — le SW ne doit jamais cacher une réponse API.
```

Deux cas supplémentaires exercés : fixture bonne acceptée, fichier absent refusé.
Puis sur le bundle réel après `npm run build` :

```
denylist navigation (5 motifs) : presente
strategies cacheables : aucune
registerRoute dans src/sw.ts : 1 (NavigationRoute uniquement)
SW API CACHE: OK
```

## Verification Results

- `sh scripts/test-check-sw-api-cache.sh` → CONTRE-PREUVE SW API CACHE: OK
- `cd app && npm run build && sh ../scripts/check-sw-api-cache.sh` → SW API CACHE: OK
- `git diff app/src/sw.ts` → vide (source inchangé, verrouillé : injectManifest, skipWaiting, clientsClaim)
- `grep -c check-sw-api-cache docs/BACKEND.md` → 3, DOC_OK

## Deviations from Plan

**[Rule 3 - Blocking] Chemins des fixtures dans le mode --check-file**
- **Found during:** Task 1
- **Issue:** Le vérificateur entre dans `app/` avant de lire ; les chemins `app/fixtures/…` passés par la contre-preuve se résolvaient en `app/app/fixtures/…` → « fichier absent » au lieu du refus du défaut.
- **Fix:** La contre-preuve passe des chemins relatifs à `app/` (`fixtures/sw-mauvais.js`), commenté dans le script.
- **Files modified:** scripts/test-check-sw-api-cache.sh
- **Commit:** 5b541da

**[Note] docs/BACKEND.md ne documentait pas la chaîne frontend §2.7**
La chaîne de vérification frontend (typecheck/test/build + check-precache-coverage.sh) vit dans
AGENTS.md §2.7, pas dans docs/BACKEND.md. Le plan demandait « à côté de check-precache-coverage.sh »
dans BACKEND.md ; le contrôle a été documenté dans §10.1 « Contrôles statiques, avant la base »,
qui est la section des contrôles statiques de BACKEND.md, avec renvoi à check-precache-coverage.sh.

## Hypothèse flaggée (OFFR-05)

Le contrôle prouve le **contrôle statique du bundle construit**, pas le comportement runtime du
SW (aucune garantie d'exécution parallèle demandée au SW). Mentionné dans l'en-tête du script,
dans la doc §10.1, et ici.

## Threat Mitigations Applied

- T-33-04 : contrôle à trois vérifications avec refus explicite + contre-preuve vue rouge — un futur `CacheFirst` sur l'API casse la vérification. ✅
- T-33-05 : la fixture mauvaise est TOUJOURS refusée par `test-check-sw-api-cache.sh` — le contrôle est exercé. ✅

## Self-Check: PASSED

- scripts/check-sw-api-cache.sh, scripts/test-check-sw-api-cache.sh, app/fixtures/sw-bon.js, app/fixtures/sw-mauvais.js : présents, commités (5b541da)
- Commits 5b541da, 309d429 vérifiés dans `git log`
- docs/BACKEND.md : référence présente (309d429)
