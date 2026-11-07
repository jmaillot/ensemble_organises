---
phase: 35-deep-links-validation-multi-os
plan: 10
subsystem: data-layer-offline
tags: [offline, error-handling, tdd, gap-closure]
requires: ["35-09 (MESSAGE_HORS_LIGNE_SANS_DONNEES, substitution useResource)"]
provides: ["composeOfflineAwareError — garde hors-ligne partagé exporté de useResource.ts", "ResourceResult.hasData — verrou d'annexe décorative"]
affects: [taches, routines, messages, voyages, calendrier]
tech-stack:
  added: []
  patterns: ["un seul mécanisme d'erreur hors-ligne, deux appelants (interne useResource + compositions d'annexe)"]
key-files:
  created:
    - app/src/modules/routines/routines-offline.test.tsx
    - app/src/modules/messages/messages-offline.test.tsx
    - app/src/modules/voyages/voyages-offline.test.tsx
  modified:
    - app/src/lib/data/useResource.ts
    - app/src/lib/data/useResource.test.tsx
    - app/src/modules/taches/hooks/use-taches.ts
    - app/src/modules/taches/taches-offline.test.tsx
    - app/src/modules/routines/hooks/use-routines.ts
    - app/src/modules/messages/hooks/use-messages.ts
    - app/src/modules/voyages/hooks/use-voyages.ts
    - app/src/modules/voyages/hooks/use-trip-detail.ts
decisions:
  - "composeOfflineAwareError est le miroir exact du useMemo de substitution 35-09 — la mécanique interne l'appelle désormais (zéro duplication, §2.7 E)"
  - "L'isError composé d'annexe est GATE sur hasData : l'échec d'une annexe décorative ne masque jamais les lignes du principal (D-09)"
  - "Audit de classe au critère demandé : messages, voyages liste, voyage détail corrigés + test par site ; use-ref-days justifié hors périmètre (aucune erreur brute exposée)"
metrics:
  duration: 25min
  completed: 2026-11-07
status: complete
actuals:
  tokens: 8000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 6fa99a0c33d7cfa08d1ba34d9d85fae257f6bdc8
plan_head_after: 37b6df0d5d44ad59205e4ff098d7bf462b89ac26
---

# Phase 35 Plan 10: Garde honnête hors-ligne sur les compositions d'erreur d'annexe (G-35-6) Summary

**One-liner :** `composeOfflineAwareError` exporté de useResource.ts (miroir exact de la substitution 35-09) remplace la chaîne `error ?? annexe` brute de use-taches.ts et use-routines.ts — plus aucun « TypeError: failed to fetch » hors-ligne, même quand la requête principale possède des données en cache.

## What Was Built

- **Task 1 (tests rouges)** : test A (tâches, cache présent via le chemin RÉEL `persistNow` → `restoreOfflineCache` — les annexes hors allowlist 33-03 reviennent absentes), test A' (routines, les deux annexes hors allowlist), test B (cache absent → MESSAGE_HORS_LIGNE_SANS_DONNEES), test C (en ligne inchangé). A et A' vus ROUGES avant le fix (TypeError rendu, lignes masquées) ; B et C verts avant le fix. Commit 7c8ac0a.
- **Task 2 (mécanisme)** : `composeOfflineAwareError(query)` exporté de useResource.ts — hors ligne + isError + data undefined → `new Error(MESSAGE_HORS_LIGNE_SANS_DONNEES, { cause: query.error })` ; data présente → null (D-09) ; en ligne → erreur brute (D-11). Le useMemo interne de useResource l'appelle désormais (un seul site pour la condition et le message). Appliqué aux annexes de use-taches.ts. 4 tests unitaires du helper (dont cause préservée). Commit 8878d34.
- **Task 3 (classe)** : use-routines.ts au garde (A' rouge→vert) ; audit des sites useQuery brut au critère de la revue (détail ci-dessous). Chaîne §2.7 complète passée. Commit 37b6df0.

## Audit de classe (Task 3, critère de la revue liante 6fa99a0)

| Site | Rendu de l'erreur brute ? | Décision |
|------|---------------------------|----------|
| use-messages.ts:711-716 → messages-page.tsx:85 (`feed.error?.message`) | **OUI** — le premise du plan (« sans composer d'error ») était faux, corrigé par la revue | Garde appliqué aux trois lectures + `messages-offline.test.tsx` |
| use-voyages.ts:241-243 → voyages-page.tsx:124 (`error?.message`) | **OUI** | Garde appliqué + `voyages-offline.test.tsx` (liste) |
| use-trip-detail.ts:149-151 → trip-detail-page.tsx:69 (`error?.message`) | **OUI** | Garde appliqué + `voyages-offline.test.tsx` (détail ; la route `/voyages/:tripId` est déclarée dans le test car la page lit `useParams`) |
| use-ref-days.ts:182-183 → calendrier-page.tsx:556 | **NON** — le hook n'expose AUCUN `error`, et la ligne 556 est l'ErrorState du calendrier (useResource événements, déjà gardé) ; `isRefError` rend un libellé fixe (« Référentiel jours fériés / vacances indisponible… »), jamais le message transport | Hors périmètre — justification ci-contre, site vérifié existant |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug plan] L'isError composé d'annexe ne pouvait pas rester « inchangé »**
- **Found during:** Task 1 (état rouge observé)
- **Issue:** Le plan demandait de ne toucher que la chaîne `error ??` et de laisser l'isError composé (use-taches.ts:352-355) inchangé. Mais l'état rouge a PROUVÉ l'incohérence : avant le fix, l'isError d'annexe remplace les lignes par le TypeError ; après le fix tel que spécifié, il les aurait remplacées par le message honnête — `must_haves` truth #1 exige au contraire « les lignes rendent » avec cache présent.
- **Fix:** `ResourceResult` expose `hasData` (`data !== undefined`, 35-10) ; l'isError d'annexe des deux hooks ne s'ajoute que si `!hasData`. La ligne rendue reste autoritaire (D-09), l'annexe redecorative retombe silencieusement, le bandeau ambre D-12 signale toujours la péremption.
- **Files modified:** app/src/lib/data/useResource.ts, use-taches.ts, use-routines.ts
- **Commit:** 8878d34, 37b6df0

**2. [Rule 3] Test A' : doublons de texte « Sortie canine »** — `getAllByText` (la routine apparaît en occurrence, historique et colonne) ; `findAllByText` au premier passage. Commit 7c8ac0a + 37b6df0.

**3. [Rule 3] Test détail voyage : `useParams` sans route déclarée** — le harnais `renderWithProviders` ne monte pas de `<Routes>` ; le test déclare `<Route path="/voyages/:tripId">` comme le fait le routeur de l'app. Commit 37b6df0.

## Verification (chaîne §2.7 complète)

| Vérification | Résultat |
|---|---|
| `npm run typecheck` | ✅ vert |
| vitest ciblé (lib, taches, routines, messages, voyages, calendrier) | ✅ 86 fichiers, **599 tests** verts |
| `npm test` | ✅ 243 fichiers, **1946 tests** verts (> 1902 exigés) |
| `npm run build` | ✅ vert (dist/sw.js généré) |
| `npx playwright test deep-link-redirect` | ✅ 6/6 (chromium + mobile) |
| Tests rouges pré-fix | ✅ A et A' rouges (TypeError affiché, lignes masquées), B et C verts |

## Constraints respected

- Décision 33-03 : AUCUN changement d'allowlist/persistance — seules les compositions d'erreur changent ; les annexes restent non persistées.
- D-09/D-10/D-11 intacts : query-policy.ts non touché (networkMode 'always' en place), comportement en ligne byte-identique (test C).
- MESSAGE_HORS_LIGNE_SANS_DONNEES défini UNE fois (useResource.ts:133) et réimporté partout — zéro littéral dupliqué.
- Aucune page modifiée (le fix vit dans les hooks, ErrorState rend `error?.message` verbatim) ; pas de directive de linter ; pas de SQL ; pas de AbortSignal.timeout.

## Known Stubs

Aucun — scan des fichiers créés/modifiés : aucune valeur vide codée en dur, aucun placeholder, aucun composant sans source de données. (Les occurrences « placeholderData » sont l'API TanStack, pas des stubs.)

## Notes de clôture

- Le rejeu on-device final reste l'arbitre de clôture (D-11) : G-35-6 ne passe « clos » qu'après ce rejeu, à consigner dans 35-UAT.md (test 3 — hors périmètre de ce plan, autonomous: true).
- La sous-cause « pourquoi l'entrée tasks manquait au cache » reste l'affaire du panneau « Cache hors-ligne » 35-09 — aucune investigation de prune ici, conformément au plan.

## Self-Check: PASSED

Tous les 10 fichiers créés/modifiés existent ; les 3 commits (7c8ac0a, 8878d34, 37b6df0) sont dans l'historique ; commits mesurés : 3 (plan_head_before 6fa99a0 → plan_head_after 37b6df0).
