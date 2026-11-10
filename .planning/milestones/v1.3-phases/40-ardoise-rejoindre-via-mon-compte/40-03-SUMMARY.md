---
phase: 40
plan: 03
subsystem: ardoise, ui, tests
tags: [confirm-dialog, rtl, ui-spec, ardoise, atterrissage]
requires: [40-01 (dialog + marqueur posés), 40-02 (réconciliation rendant « part zéro » fausse)]
provides: [ConfirmDialog icon rétro-compatible, 9 cas RTL ARD-01, backstop e2e documenté]
affects: []
tech-stack:
  added: []
  patterns: [prop additive à défaut rétro-compatible, assertion ancrée sur le littéral du jeu d'icônes]
key-files:
  created: []
  modified:
    - app/src/components/ui/confirm-dialog.tsx
    - app/src/modules/ardoise/guest-ardoise-page.tsx
    - app/src/modules/ardoise/guest-ardoise-page.test.tsx
    - app/src/modules/landing/join-household-page.test.tsx
    - app/src/modules/calendrier/calendrier-page.test.tsx
decisions:
  - "Icône 'users' pour l'adhésion (trash réservé aux destructions) — prop icon?: IconName, défaut trash"
  - "Copy « participation passée rattachée au compte » (la réconciliation 0181 rend « part zéro » fausse)"
  - "Backstop e2e consigné : le truth « atterrissage /ardoise » est prouvé au niveau RTL (routeur mocké) ; le parcours e2e réel reste le backstop"
metrics:
  duration: "~1h15"
  completed: 2026-11-09
status: complete
commits: 3
plan_head_before: d20284a
plan_head_after: 9a656b3
---

# Phase 40 Plan 03 : Contrat UI du dialog + verrous RTL ARD-01 Summary

**ConfirmDialog paramétrable (icon rétro-compatible), copy UI-SPEC exacte sans « part zéro » devenue fausse, et 9 tests RTL qui verrouillent ARD-01 : aucune adhésion sans confirmation explicite, atterrissage /ardoise, erreurs affichées telles quelles.**

## Commits

| Tâche | Description | Commit |
|---|---|---|
| 1 | ConfirmDialog — prop icon optionnelle (défaut trash) | `01c013c` |
| 2 | Copy UI-SPEC page invitée — retrait « part zéro » | `1d27e61` |
| 3 | 9 cas RTL ARD-01 + correctif calendrier date-dépendant | `9a656b3` |

## Ce qui a été livré

1. **ConfirmDialog** : prop `icon?: IconName` (défaut `trash`) — tous les usages existants inchangés (typecheck + 89 tests composants verts, aucun autre fichier modifié).
2. **Copy** : dialog `icon="users"` ; branches connectée/anonyme réécrites (« votre participation passée sera rattachée à votre compte à l'adhésion ») — `grep 'part zéro'` = 0 sur la page ; titre de repli householdName null conservé ; messages d'erreur et lien « Ouvrir l'ardoise » intacts.
3. **Tests RTL** : 6 cas ajoutés côté page invitée (annuler ne consomme rien, « Adhésion en cours… » désactivé pendant l'échange, repli householdName null, icône users ancrée sur le littéral du jeu d'icônes, 401/404 tels quels) + 3 cas côté pré-écran foyer (atterrissage /ardoise avec marqueur lu-et-effacé, /accueil sans marqueur, zéro redeem au montage D-08).

## Déviations du plan

### [Rule 3 - Bloquant] Test calendrier préexistant corrigé (dépendance à la date)

`calendrier-page.test.tsx « supprime un événement après confirmation »` échouait depuis le 9 novembre : le J+2 du semis tombe le **11 novembre (Armistice)** — l'agenda affiche l'état férié, pas « Journée libre ». Correctif minimal : l'assertion accepte les deux rendus (`findAllByText(/Journée libre|Jour férié/)`), l'intention (la journée ne porte plus AUCUN événement du foyer) est inchangée, motif nommé en commentaire (AGENTS §2.7). Découverte lors du Task 2 (consignée d'abord dans deferred-items.md), corrigée au Task 3 car elle bloquait la chaîne exigée.

### Limites de preuve (consignées pour le gsd-verifier)

- **Atterrissage /ardoise** : prouvé au niveau RTL avec un routeur en mémoire — le **parcours e2e réel** (lien ardoise → dialog → adhésion → /ardoise) est le backstop ; il est couvert par la suite e2e verte (163 scénarios, 9 skipped).
- **Nom de foyer long / dialog mobile 320px** : backstop e2e mobile Chromium existant (assumptions UI-SPEC), aucun test dédié nouveau.

## Vérifications

- Typecheck vert ; **1997 tests unitaires verts (244 fichiers)** ; build vert ; **e2e : 163 verts, 9 skipped**.
- ConfirmDialog rétro-compatible : aucun usage existant modifié (grep), rendu identique par défaut.
- Anti-adhésion implicite verrouillé : `expect(exchangeMock).not.toHaveBeenCalled()` avant confirmation ; zéro redeem au montage (D-08).

## Self-Check: PASSED

- Commits `01c013c`, `1d27e61`, `9a656b3` présents (3 depuis `d20284a`).
- Fichiers modifiés conformes à `files_modified` (+ calendrier, déviation documentée).
