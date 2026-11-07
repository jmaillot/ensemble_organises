---
phase: 35-deep-links-validation-multi-os
plan: 03
subsystem: ui
tags: [deep-links, offline, sign-in, react-router, tdd]

requires:
  - phase: 33 (offline & outbox)
    provides: écran sign-in-page avec state.from / internalPathOf (garde T-19-43)
provides:
  - Écran « connexion requise pour cette vue » rendu hors-ligne sans session sur un deep link (D-07)
  - Composant ConnexionRequise exporté, patron Forbidden, révocation par bouton « Se reconnecter »
affects: [verify-work phase 35, UAT D-07]

actuals:
  tokens: 1936
  tasks: 1
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Écran de repli humain : lecture d'état navigator.onLine + requestedPath, jamais de stockage (D-08)"

key-files:
  created:
    - app/src/modules/landing/__tests__/connexion-requise.test.tsx
  modified:
    - app/src/modules/landing/sign-in-page.tsx

key-decisions:
  - "La vue visée est affichée comme chemin interne (déjà filtré par internalPathOf) — aucune table de libellés maison, pas de nouveau parseur d'URL"
  - "Révocation du formulaire par useState (état de session de page), jamais persisté (D-08)"

patterns-established:
  - "Écran de repli D-07 : condition requestedPath !== null && !navigator.onLine, patron forbidden.tsx"

requirements-completed: [DLNK-02, DLNK-03]

coverage:
  - id: D1
    description: "Deep link hors-ligne sans session affiche l'écran « Connexion requise pour cette vue » avec la vue visée nommée, aucun champ de formulaire (D-07)"
    requirement: DLNK-02
    verification:
      - kind: unit
        ref: "app/src/modules/landing/__tests__/connexion-requise.test.tsx#hors-ligne avec une vue demandée : titre explicite, vue visée nommée, aucun champ de formulaire"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bouton « Se reconnecter » révèle le formulaire de connexion"
    requirement: DLNK-02
    verification:
      - kind: unit
        ref: "app/src/modules/landing/__tests__/connexion-requise.test.tsx#le bouton « Se reconnecter » révèle le formulaire de connexion"
        status: pass
    human_judgment: false
  - id: D3
    description: "Formulaire standard inchangé hors écran (sans vue demandée, ou en ligne)"
    requirement: DLNK-02
    verification:
      - kind: unit
        ref: "app/src/modules/landing/__tests__/connexion-requise.test.tsx#hors-ligne sans vue demandée : formulaire standard inchangé + en ligne avec une vue demandée"
        status: pass
    human_judgment: false
  - id: D4
    description: "Aucun écrit localStorage/sessionStorage pendant le cycle (D-08)"
    requirement: DLNK-03
    verification:
      - kind: unit
        ref: "app/src/modules/landing/__tests__/connexion-requise.test.tsx#aucun écrit localStorage/sessionStorage pendant le cycle (D-08)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-11-06
status: complete
---

# Phase 35 Plan 03: Écran « connexion requise pour cette vue » Summary

**Écran D-07 rendu hors-ligne sans session sur un deep link : titre explicite, vue visée dérivée de `requestedPath`, bouton « Se reconnecter » — jamais le formulaire nu, aucun stockage au-delà de `state.from` (D-08), cycle TDD rouge→vert complet.**

## Performance
- **Duration:** 14min
- **Started:** 2026-11-06T12:01:53Z
- **Completed:** 2026-11-06T12:16Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Écran « Connexion requise pour cette vue » (D-07) dans sign-in-page.tsx : le chemin raccourci → /taches/jour hors-ligne sans session affiche désormais un écran explicite nommant la vue visée, patron sobre de forbidden.tsx.
- 5 cas de test verts dont 2 négatifs (formulaire inchangé en ligne / sans vue demandée) et une assertion d'absence de setItem (D-08).
- Garde open-redirect `internalPathOf` (T-19-43) réutilisée telle quelle — aucun nouveau parseur, aucune route-garde dédiée (RESEARCH §3), mécanisme RequireAuth → state.from intact (D-05).

## Task Commits
1. **Task 1: Écran « connexion requise pour cette vue » hors-ligne sans session (D-07)** - `232cb03` (test, rouge vérifié RED_EVIDENCE_OK) → `d67f18d` (feat)

**Plan metadata:** commit final docs séparé (voir log).

## Files Created/Modified
- `app/src/modules/landing/__tests__/connexion-requise.test.tsx` - 5 cas D-07 (écran, révocation, 2 négatifs, absence de stockage)
- `app/src/modules/landing/sign-in-page.tsx` - composant exporté `ConnexionRequise` + condition `requestedPath !== null && !navigator.onLine && !formRevealed`

## Decisions Made
- La vue visée est affichée comme chemin interne (déjà filtré par `internalPathOf`) — pas de table de libellés maison, donc pas de dérive silencieuse si les routes changent.
- La révocation du formulaire passe par un `useState` de la page, jamais persisté (D-08).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. Chaîne §2.7 verte : typecheck OK, 1884 tests passés (235 fichiers), build OK (précache SW 150 entrées). Preuve e2e D-06/D-07 on-device reste à la validation de phase (35-VALIDATION).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 35 plans 01-02 déjà exécutés ; plan 03 complète le lot. Prêt pour la vérification de phase (UAT D-07 consolidé) et la validation multi-OS on-device.

---
*Phase: 35-deep-links-validation-multi-os*
*Completed: 2026-11-06*
