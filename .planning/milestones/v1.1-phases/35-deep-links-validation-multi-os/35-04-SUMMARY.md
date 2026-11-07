---
phase: 35-deep-links-validation-multi-os
plan: 04
subsystem: bootstrap-auth-offline
tags: [deep-links, offline, auth-bootstrap, tdd, e2e]
requires: [33 (cache lecture offline), 34 (outbox/persist), 35-01 (/taches/jour), 35-03 (écran D-07)]
provides:
  - Bootstrap tolérant au hors-ligne (loadHousehold repli foyer persisté + chemin invité + garde expires_at)
  - Couverture automatisée des deux chemins de deep link hors-ligne (matrice §1.4/§1.5)
affects: [35-05 (re-validation on-device)]
tech-stack:
  added: []
  patterns:
    - Repli conditionné à onlineManager.isOnline() (TanStack Query v5) + état persisté restauré synchro
    - TDD RED→GREEN sur le bootstrap (3 commits : test ROUGE, feat, test e2e)
key-files:
  created:
    - app/src/stores/__tests__/load-household-offline.test.ts
    - app/src/hooks/__tests__/auth-bootstrap-offline.test.tsx
  modified:
    - app/src/stores/session-store.ts
    - app/src/hooks/use-auth.ts
    - app/e2e/deep-link-redirect.spec.ts
    - app/src/modules/taches/__tests__/jour-view.test.tsx
    - .planning/phases/35-deep-links-validation-multi-os/deferred-items.md
decisions:
  - loadHousehold : hors-ligne + foyer persisté (householdId + membres vivants, restaurés synchro par le persist zustand) → résout sur le foyer persisté, revalidation serveur reportée au retour du réseau (console.warn §2.7 F) ; en ligne ou sans foyer persisté → rejet propagé, WR-04 préservé
  - use-auth : tout rejet de la chaîne getSession/applySession hors-ligne → chemin invité existant (purge best-effort + setReady) au lieu de l'écran WR-04 — les gardes du routeur décident (RequireAuth → /connexion state.from → D-07)
  - Garde T-35-06 : session expires_at dépassée hors-ligne → jamais appliquée comme authentifiée, chemin invité
  - API : onlineManager.isOnline() (le nom getOnline du plan n'existe pas dans TanStack Query v5.103 — correction mécanique, documentée en déviation)
  - e2e hors-ligne : l'app est chargée une fois en ligne pour que le SW prenne le contrôle (comme une PWA installée), puis setOffline + navigation — la navigation est servie par le SW, présumé absent du plan mais prouvé nécessaire
  - sign-in-page.tsx et router.tsx NON touchés (l'ordre des gardes était correct, c'est le montage du routeur qui manquait)
metrics:
  duration: ~55 min
  completed: 2026-11-06
  tasks: 3
  commits: 3
  plan_head_before: 0126c98196927963a72507541266dd6bb5520f58
  plan_head_after: 59af4fd (docs: 35-04-SUMMARY + STATE/ROADMAP/deferred-items committed après)
status: complete
actuals:
  tokens: 111000
  tasks: 3
  commits: 3
---

# Phase 35 Plan 04: Gap closure — bootstrap tolérant hors-ligne Summary

Bootstrap d'authentification tolérant au hors-ligne : cold-start hors-ligne avec session + foyer persistés monte désormais le routeur (vue /taches/jour depuis le cache), et le deep link hors-ligne sans session atteint l'écran « connexion requise » (D-07) — les deux gaps §1.4/§1.5 de 35-VERIFICATION.md fermés et prouvés par tests.

## What Was Built

**Task 1 (tracer, TDD RED→GREEN)** — Correctif à la cause racine (bootstrap, pas les gardes) :
- `session-store.ts loadHousehold()` : les lectures réseau encadrées par un try/catch ; hors-ligne (`onlineManager.isOnline()` faux) ET foyer déjà persisté → résout sur le foyer persisté (objet `{ id, name, avatar_color, disabled_modules }` reconstruit, état du store inchangé), revalidation reportée au retour du réseau et journalisée (§2.7 F — jamais un succès muet). Sinon le rejet se propage (WR-04 préservé).
- `use-auth.ts` : repli invité hors-ligne dans le catch d'`applySession` ET dans le `.catch` de la chaîne `getSession` (purge best-effort via le goulot `signOut` + `setReady(true)`) ; garde d'expiration `session.expires_at` dépassé hors-ligne AVANT `applySession` → chemin invité (T-35-06, un jeton mort ne paraît jamais authentifié).
- 6 tests unitaires A–F écrits AVANT le fix (commit ROUGE `d6c76fc` : 3 échecs attendus A/D/E, 3 verts préservant les contrats B/C/F).

**Task 2** — Preuves de bout en bout :
- e2e G : deep link `/taches/jour` hors-ligne SANS session → écran « Connexion requise pour cette vue » (D-07) atteint via `/connexion` — impossible avant le correctif (routeur non monté).
- e2e H : deep link hors-ligne AVEC session démo → vue Tâches du jour rendue (SW contrôle la navigation, mode démo ; le chemin Supabase cold-start est couvert par les tests unitaires D/E).
- Test unitaire I : `TachesJourPage` rendue depuis un bouchon « données en cache » (retards en tête) — la délégation `vi.mock` laisse les 4 cas existants sur le hook réel.
- Les deux projets playwright (chromium + mobile) verts : 6/6.

**Task 3** — Chaîne §2.7 complète + consignation (voir Vérification) ; deferred-items.md : les DEUX items deep-link marqués corrigés par 35-04 (re-validation on-device reportée au 35-05), l'item outbox silencieux **reste ouvert, hors périmètre 35-04/05**.

## Verification Results

| Commande | Résultat |
|---|---|
| `npx vitest run src/stores/__tests__/load-household-offline.test.ts src/hooks/__tests__/auth-bootstrap-offline.test.tsx` | 6/6 passed (A–F) |
| Suites affectées (`src/hooks src/stores src/modules/landing src/main.test.tsx`) | 160/160 passed |
| `npx playwright test deep-link-redirect --reporter=list` | 6/6 passed (chromium + mobile, hors-ligne inclus) |
| `npm run typecheck` | code 0 |
| `npm test` (suite complète) | 1895/1895 passed, 238 files |
| `npm run build` | code 0 (précache 152 entries) |
| `npx vitest run src/modules/taches src/lib/query-policy.test.ts src/pwa` | 75/75 passed |
| `python3 scripts/check-sql-statique.py` | vert (230 fonctions, 179 migrations, 106 tests) |
| `git status -- supabase/` | propre — aucune migration SQL touchée |

## Deviations from Plan

- **[Rule 3 — API] `onlineManager.getOnline()` → `onlineManager.isOnline()`** : TanStack Query v5.103 n'expose pas `getOnline` (typecheck TS2551). Correction mécanique, sémantique identique.
- **[Écart de harnais e2e] `context.setOffline(true)` avant le premier chargement empêche de charger l'app elle-même** (pas de SW en contrôle). Les deux e2e chargent d'abord l'app EN LIGNE pour que le SW prenne le contrôle (`navigator.serviceWorker.controller`), puis basculent hors-ligne — c'est le mécanisme réel d'une PWA installée. Aucun `localStorage.setItem` ajouté (D-08 : purge seule).
- **[Écart de convention de fichiers] Plan annonçait `__tests__/` qui n'existait pas** : les répertoires ont été créés tels que planifiés (la convention du dépôt est colocalisée) ; les chemins du plan et les commandes verify sont respectés à l'identique.

Aucune autre déviation. AGENTS.md respecté : commentaires en français nommant les raisons, aucune directive de linter, aucun fix hors périmètre (la chaîne §2.7 est verte, rien d'opportuniste touché).

## Threat Model Outcomes

- **T-35-06 (mitigate)** : garde `expires_at` hors-ligne implémentée, prouvée par le test E — une session expirée hors-ligne retombe toujours sur le chemin invité.
- **T-35-07 (accept)** : le repli ne garde que le foyer DÉJÀ persisté sur cet appareil pour cet utilisateur — régime de confiance identique au cache offline de lecture (phase 33).
- **T-35-SC (mitigate)** : aucune dépendance installée (`onlineManager` vient de @tanstack/react-query déjà présent).

## Auth Gates

Aucun.

## Known Stubs

Aucun — aucune valeur factice ni donnée mockée en production ; les bouchons vivent uniquement dans les tests.

## Self-Check: PASSED

- Fichiers créés/modifiés présents sur disque (vérifiés `git log --stat`).
- Commits `d6c76fc`, `95a8572`, `59af4fd` trouvés dans `git log` sur la base `0126c98`.
