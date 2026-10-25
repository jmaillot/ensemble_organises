---
phase: 17-mode-cuisine-recette
plan: '04'
subsystem: ui
tags: [react, tailwind, panel, vitest, playwright, recettes, cuisine, mobile]

# Dependency graph
requires:
  - phase: 17-01
    provides: [tracer cuisine membre (toggle + cases + mémoire + veille)]
  - phase: 17-02
    provides: [parité invitée, e2e recettes démo]
  - phase: 17-03
    provides: [offset sticky cuisine sous-topbar (commit 409311a), lignes stickyTopClass intouchées]
provides:
  - Gap G-17-2 fermé : toggle Mode cuisine inline en haut à droite du panneau Étapes sur mobile
  - Prop opt-in headerInlineOnMobile sur Panel + preuves Vitest + spec e2e mobile 390/360
affects: [verify-work-phase-17]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 3000
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [prop opt-in à défaut faux sur composant partagé (~85 consommateurs intacts), preuve de classe par classList.contains (match exact de token), preuve e2e par bounding-box + scrollWidth <= innerWidth]

key-files:
  created:
    - app/src/modules/recettes/recette-cuisine-panel.test.tsx
    - app/e2e/recettes-cuisine-mobile.spec.ts
  modified:
    - app/src/components/shared/module-shell.tsx
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/guest-recipe-page.tsx

key-decisions:
  - "Prop opt-in headerInlineOnMobile (défaut faux) plutôt que changement global : les ~85 autres Panels gardent un rendu strictement identique (T-17-06)"
  - "Titre min-w-0 flex-1 + action shrink-0 en chaînes littérales Tailwind complètes, jamais d'interpolation (scan statique)"
  - "e2e membre seul (l'invitée partage le même Panel, couverte en Vitest — parité D-16) ; recettes.spec.ts intouché"

patterns-established:
  - "Header Panel opt-in : ternaire de branches à classes littérales (défaut = markup historique exact, opt-in = rangée inline)"
  - "Preuve mobile e2e : toggleBox.y <= titleBox bas + toggle calé à droite du panneau + scrollWidth - innerWidth <= 0"

requirements-completed: [R1]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Mobile 390px et 360px : le toggle Mode cuisine reste sur la ligne du titre Étapes en haut à droite du panneau, jamais sous la description"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine-panel.test.tsx#opt-in : l'en-tête garde la rangée titre-à-gauche/action-à-droite sous 650px"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine-panel.test.tsx#fiche membre : toggle aria-pressed sur la rangée inline du titre Étapes"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine-panel.test.tsx#page invitée : même toggle inline, même aria-pressed"
        status: pass
      - kind: e2e
        ref: "app/e2e/recettes-cuisine-mobile.spec.ts (4 passed : 390px + 360px × chromium + mobile)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Aucun défilement horizontal sur la fiche membre à 360px avec le toggle inline"
    requirement: "R1"
    verification:
      - kind: e2e
        ref: "app/e2e/recettes-cuisine-mobile.spec.ts#scrollWidth - innerWidth <= 0 (390px + 360px)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tous les autres panneaux Panel gardent leur comportement mobile colonne inchangé"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine-panel.test.tsx#défaut sans prop : l'en-tête garde la colonne mobile, rendu inchangé"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-régression : 4 suites Vitest + typecheck + build + e2e recettes verts, lockfile inchangé"
    verification:
      - kind: unit
        ref: "cd app && npm test -- recette-cuisine guest-recipe-cuisine recette-cuisine-panel use-screen-wake-lock (39 passed)"
        status: pass
      - kind: e2e
        ref: "cd app && npx playwright test e2e/recettes.spec.ts e2e/recettes-cuisine-mobile.spec.ts (22 passed)"
        status: pass
      - kind: other
        ref: "cd app && npm run typecheck && npm run build (PWA 103 entrées)"
        status: pass
      - kind: other
        ref: "git status --short -- app/package-lock.json (vide)"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min
completed: 2026-10-14
status: complete
---

# Phase 17 Plan 04 : En-tête Étapes inline sur mobile Summary

**Gap G-17-2 fermé : prop opt-in `headerInlineOnMobile` sur `Panel` — le toggle Mode cuisine reste en haut à droite du panneau Étapes à 390px et 360px, zéro débordement, ~85 autres Panels inchangés, chaîne complète verte sans dépendance.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-14T17:05:00Z (approx.)
- **Completed:** 2026-10-14T17:35:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 5 (2 créés, 3 modifiés)

## Accomplishments

- Cause G-17-2 éliminée : l'en-tête `Panel` (`module-shell.tsx` ligne 80) portait `max-[650px]:flex-col`, empilant le slot action sous titre + description sur mobile — les deux panneaux Étapes gardent désormais la rangée titre-à-gauche/action-à-droite sous 650px (D-12 : toggle en haut à droite, per UI-SPEC Toggle interaction contract identique membre + invité)
- Zéro régression globale : prop à défaut faux, branche défaut = markup historique exact ; seuls les 2 panneaux Étapes consomment l'opt-in (T-17-06) ; toggle (bouton `aria-pressed` + `Switch asChild`, 44px), libellé, description D-15, vue cuisine/mémoire/veille intacts
- Lignes 17-03 préservées : `stickyTopClass` membre et `recipe-cuisine-view.tsx` intouchés ; chevauchement `recette-detail-page.tsx` sans conflit (seule la balise d'ouverture `Panel` Étapes modifiée)
- Chaîne §2.7 verte (hors SQL/DB, aucun SQL dans ce fix) : `typecheck` + 39 tests (4 suites) + `build` (PWA 103 entrées) + 22 e2e (18 recettes + 4 mobile) ; `package-lock.json` inchangé (T-17-SC)

## Task Commits

Each task was committed atomically:

1. **Task 1: prop d'en-tête inline opt-in sur Panel + câblage des deux panneaux Étapes** - `ad294c0` (feat)
2. **Task 2: preuve Playwright mobile 390px + 360px + chaîne verte + gate lockfile** - `14d7168` (test)

## Files Created/Modified

- `app/src/components/shared/module-shell.tsx` - `PanelProps.headerInlineOnMobile?: boolean` (défaut `false`) ; branche opt-in : en-tête `max-[650px]:flex-row`, bloc titre `min-w-0 flex-1`, action wrappée `shrink-0` — littéraux Tailwind complets, branche défaut identique à l'historique
- `app/src/modules/recettes/recette-detail-page.tsx` - Seule la balise d'ouverture du `Panel` Étapes : `headerInlineOnMobile` ajouté (ligne `stickyTopClass` 17-03 intouchée)
- `app/src/modules/recettes/guest-recipe-page.tsx` - Même ajout sur la balise d'ouverture du `Panel` Étapes invité
- `app/src/modules/recettes/recette-cuisine-panel.test.tsx` - Nouveau : 4 tests (défaut colonne, opt-in rangée + `flex-1`/`shrink-0`, membre `aria-pressed` OFF→ON avec en-tête inline, invité `aria-pressed` + inline via `fetchGuestRecipeView` moqué)
- `app/e2e/recettes-cuisine-mobile.spec.ts` - Nouveau : idiome `openDemoSession` copié de `recettes.spec.ts` (intouché) ; viewports 390x844 + 360x640 ; bounding-box toggle dans la bande du titre + calé à droite + `scrollWidth <= innerWidth`

## Decisions Made

- Prop opt-in plutôt que changement global du header `Panel` : un changement global aurait reflowé ~85 panneaux (T-17-06) ; l'opt-in à défaut faux rend la régression impossible par construction, prouvée par le test défaut.
- Action wrappée dans un `div.shrink-0` uniquement en opt-in : en défaut l'action reste rendue nue (aucun nœud ajouté) pour un rendu strictement identique.
- Preuve de classe par `classList.contains` (match exact de token) plutôt que `toContain` sur `className` — même idiome que 17-03, évite les faux positifs de sous-chaîne.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sélecteur e2e `section` ambigu (strict mode)**
- **Found during:** Task 2 (première exécution de la spec mobile : 4 failed)
- **Issue:** `page.locator('section', { has: title })` résolvait 2 éléments — la section `ModuleShell` (`data-module="recettes"`) contient aussi le heading Étapes
- **Fix:** Sélecteur restreint à `section.panel-surface` (classe du `Panel`)
- **Files modified:** `app/e2e/recettes-cuisine-mobile.spec.ts`
- **Commit:** `14d7168` (4/4 verts après fix, puis 22/22 avec `recettes.spec.ts`)

## Issues Encountered

None beyond the auto-fixed locator above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-17-2 prêt pour re-test utilisateur (test UAT 1 sur petit écran 360px/390px) : toggle sur la ligne du titre, zéro scroll horizontal, membre + invité.
- Aucun stub : aucun `TODO|FIXME|placeholder|coming soon` ajouté sur les fichiers touchés ; `recipe-cuisine-view.tsx` et `recettes.spec.ts` intouchés.

## Threat Flags

None - no new security-relevant surface: pure layout classes + test files, no endpoints, no auth paths, no schema changes. T-17-06/T-17-07/T-17-SC mitigations proven (default-branch test, bounding-box + overflow e2e, lockfile gate).

## Self-Check: PASSED

- Fichiers créés/modifiés : 5/5 FOUND sur disque et suivis par git (`git ls-files`).
- Commits : `ad294c0`, `14d7168` FOUND (`git log`).
- SUMMARY : ce fichier, à commiter ci-après.
- Lignes 17-03 intactes : `stickyTopClass` présent sur `recette-detail-page.tsx`, `recipe-cuisine-view.tsx` non modifié (`git status`).
- Lockfile : `git status --short -- app/package-lock.json` vide.

---
*Phase: 17-mode-cuisine-recette*
*Completed: 2026-10-14*
