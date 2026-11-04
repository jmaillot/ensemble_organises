---
phase: 31-inscriptions-ouvertes
plan: 07
subsystem: frontend-invitations
tags: [gap-closure, ui-truthfulness, tokens, invitations]
requires: [0176_token_list_governance]
provides: [libellés invitations véridiques (G-31-1 fermée)]
affects: [31-08]
tech-stack:
  added: []
  patterns: [véridicité d'interface — le texte UI décrit le comportement réel du schéma]
key-files:
  created: []
  modified:
    - app/src/modules/parametres/components/invitations-panel.tsx
    - app/src/modules/parametres/components/invitations-panel.test.tsx
    - app/src/modules/landing/join-household-page.tsx
decisions:
  - "Le texte véridique décrit le modèle liste : « chaque lien reste actif jusqu'à son expiration ou sa révocation individuelle » — aucune promesse d'invalidation à la génération (T-31-19)."
metrics:
  duration: 8 min
  completed: 2026-11-03
status: complete
actuals:
  tokens: 3200
  tasks: 2
  commits: 2
plan_head_before: 8461529
plan_head_after: 8ee9208
---

# Phase 31 Plan 07: Inscriptions ouvertes — Gap G-31-1 Summary

**Libellés d'invitation véridiques : plus aucune interface ne promet l'invalidation des liens précédents à la génération — le modèle liste (0176, D-14) rend chaque lien indépendant, actif jusqu'à son expiration ou sa révocation individuelle.**

## What Was Built

### Task 1 — Toast du panneau invitations + assertion de test (24cfff2)
- `invitations-panel.tsx:119` : « Les liens précédents sont invalidés. » → « Les liens précédents restent actifs jusqu'à leur expiration ou leur révocation. » (apostrophe typographique, comme le reste du fichier).
- `invitations-panel.test.tsx:111` : l'assertion `findByText` verrouille désormais le texte véridique intégral — toute réintroduction de la promesse d'invalidation fait échouer la suite (mitigation T-31-19).
- La mention ligne 311 (rotation de `INVITE_TOKEN_HMAC_SECRET` invalide tous les liens) est conservée : elle est vraie, c'est l'exception documentée, pas le gap.

### Task 2 — Pré-écran pré-auth du rejoindre (8ee9208)
- `join-household-page.tsx:222-223` : « …ce qui invalide immédiatement le précédent. » → « …; chaque lien reste actif jusqu'à son expiration ou sa révocation individuelle. » Style du paragraphe (`text-xs text-muted`) conservé.
- Balayage `grep` de `app/src` : plus aucune promesse d'invalidation à la génération liée aux liens de foyer.

## Verification

- `cd app && npm run typecheck` — vert.
- `npm test -- invitations-panel` — 10/10 verts (le cas du toast verrouille le nouveau texte).
- `grep -rn "liens précédents sont invalidés\|invalide immédiatement le précédent" app/src` → 0 occurrence.
- `npm run build` — vert (précache 142 entrées, sw.js généré).

## Deviations from Plan

### Out-of-scope discoveries (non corrigés, hors périmètre du plan)

1. **[Observation — hors périmètre] `app/src/modules/recettes/components/recipe-share-dialog.tsx:119`** : toast « Nouveau lien généré : l'ancien est invalidé. » pour les codes de partage de recettes. Le plan ne couvre que les liens de foyer (G-31-1). Le modèle de partage de recettes (`recipe_shares`, code haché unique) peut réellement invalider à la régénération — à vérifier avant toute correction ; ne pas copier-coller le correctif sans lire ce schéma.
2. **[Pré-existant] 6 échecs Vitest dans `anniversaires-page.test.tsx`, `birthday-confetti.test.tsx`, `calendrier-page.test.tsx`** : prouvés pré-existants — ils échouent aussi avec les fichiers de ce plan revertés (HEAD~1). Aucun rapport avec les corrections de libellés (modules différents). Voir §2.7 A : à diagnostiquer séparément.

Aucune dépendance nouvelle (T-31-SC respecté). Aucune migration SQL.

## Known Stubs

None.

## Self-Check: PASSED

- Commits vérifiés : `24cfff2`, `8ee9208` présents dans `git log`.
- Les trois fichiers modifiés existent et portent les textes corrigés (grep 0 occurrence de l'ancien).
