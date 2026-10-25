---
phase: 17-mode-cuisine-recette
plan: '03'
subsystem: ui
tags: [react, tailwind, sticky, vitest, playwright, recettes, cuisine]

# Dependency graph
requires:
  - phase: 17-01
    provides: [RecipeCuisineView sticky N/M + barre, fiche membre prouvée]
  - phase: 17-02
    provides: [parité invitée (défaut top-0 correct hors shell), e2e recettes]
provides:
  - Gap G-17-1 fermé : en-tête sticky cuisine sous la topbar membre, top-0 invité intact
  - Prop stickyTopClass sur la vue partagée + 4 preuves Vitest + chaîne verte complète
affects: [17-04-fix-adjacent-panel-header, verify-work-phase-17]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 2250
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: [offset sticky par prop littérale (scan statique Tailwind), preuve de classe via closest div.sticky + classList]

key-files:
  created: []
  modified:
    - app/src/modules/recettes/components/recipe-cuisine-view.tsx
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/recette-cuisine.test.tsx

key-decisions:
  - "Offset par prop optionnelle stickyTopClass (défaut top-0), pas de baisse de z-index : sous la topbar opaque l'en-tête à top-0 serait masqué au lieu d'être décalé"
  - "guest-recipe-page.tsx intouché : hors shell, zéro topbar, le défaut top-0 y reste correct"
  - "Les 4 preuves vivent dans recette-cuisine.test.tsx (wave : 17-04 suit sur le même fichier Panel, guest test laissé read-only)"

patterns-established:
  - "Sticky offset : prop string littérale complète au site d'appel, défaut top-0 dans la déstructuration"
  - "Preuve sticky : compteur N/M -> closest('div.sticky') -> classList.contains (match exact de token, pas de sous-chaîne)"

requirements-completed: [R2]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Fiche membre : en-tête sticky cuisine (compteur N/M + barre) colle sous la topbar (76px desktop, 56px sous 650px), topbar menu/notifications/profil visible et cliquable au scroll"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#fiche membre : toggle-ON colle l’en-tête sous la topbar (topbar cliquable)"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#prop : l’en-tête colle sous la topbar, fond surface-blur et z intacts (UI-SPEC Color)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Page invitée (hors shell, sans topbar) : en-tête cuisine colle toujours à top-0, aucun vide parasite"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#page invitée : toggle-ON colle l’en-tête à top-0, sans vide parasite"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#défaut : l’en-tête colle à top-0 (page invitée hors shell, zéro topbar)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-régression : 3 suites Vitest recettes-cuisine + e2e recettes + typecheck + build verts, lockfile inchangé"
    verification:
      - kind: unit
        ref: "cd app && npm test -- recette-cuisine guest-recipe-cuisine use-screen-wake-lock (35 passed)"
        status: pass
      - kind: e2e
        ref: "cd app && npx playwright test e2e/recettes.spec.ts (18 passed)"
        status: pass
      - kind: other
        ref: "cd app && npm run typecheck && npm run build (PWA 103 entrées)"
        status: pass
      - kind: other
        ref: "git status --short -- app/package-lock.json (vide)"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-10-14
status: complete
---

# Phase 17 Plan 03 : Offset sticky cuisine sous-topbar Summary

**Gap G-17-1 fermé : prop `stickyTopClass` sur la vue cuisine partagée — la fiche membre colle compteur N/M + barre sous la topbar (76px/56px), l'invitée reste à top-0, 4 preuves Vitest, chaîne complète verte sans dépendance.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-14T17:00:00Z (approx.)
- **Completed:** 2026-10-14T17:15:00Z
- **Tasks:** 2
- **Files modified:** 3 (0 créés, 3 modifiés)

## Accomplishments

- Cause G-17-1 éliminée : `recipe-cuisine-view.tsx` (`sticky top-0 z-10`) contre topbar `app-shell.tsx` (`sticky top-0 z-10`, h-76px desktop / h-14 mobile) — z égaux, l'ordre DOM faisait gagner la vue cuisine ; l'en-tête colle désormais sous la topbar côté membre (D-07/D-08 : compteur N/M + barre conservés, seule la position change)
- Page invitée intacte : `guest-recipe-page.tsx` intouché, le défaut `top-0` y reste correct (hors shell, zéro topbar — un offset y laisserait un vide collé de 76px)
- UI-SPEC Color intact : `z-10 bg-surface/95 backdrop-blur` conservés, prouvés par test ; pastilles, cases, mémoire, Wake Lock et copies intouchés
- Chaîne §2.7 verte : `typecheck` + 35 tests (19 recette-cuisine + 6 guest + 10 wake-lock) + `build` (PWA 103 entrées) + e2e recettes 18/18 ; `package-lock.json` inchangé (T-17-SC)

## Task Commits

Each task was committed atomically:

1. **Task 1: offset sticky sous-topbar sur la fiche membre, top-0 conservé en invité** - `409311a` (feat)
2. **Task 2: non-régression complète + lockfile gate + chaîne verte** - pas de commit (vérification read-only, zéro modification — `guest-recipe-cuisine.test.tsx` laissé intact per wave notes)

## Files Created/Modified

- `app/src/modules/recettes/components/recipe-cuisine-view.tsx` - Prop optionnelle `stickyTopClass?: string` (défaut `'top-0'`), utilisée sur le div d'en-tête à la place du `top-0` en dur ; tout le reste intact
- `app/src/modules/recettes/recette-detail-page.tsx` - Ligne 305 (chemin in-shell) : `stickyTopClass="top-[76px] max-[650px]:top-14"` en chaîne littérale complète — seule ligne touchée du fichier (scope 17-04 préservé)
- `app/src/modules/recettes/recette-cuisine.test.tsx` - Mocks `supabase/client` (flag hoisted, défaut false) + `./api` (`fetchGuestRecipeView`) calqués sur `guest-recipe-cuisine.test.tsx` ; nouveau describe G-17-1 à 4 tests (défaut top-0, prop offset + fond/z, membre offset, invité top-0)

## Decisions Made

- Offset par prop plutôt que baisse de z-index : sous la topbar opaque, l'en-tête à `top-0` serait masqué au lieu d'être décalé (argument repris du plan, appliqué tel quel).
- Les 4 preuves vivent toutes dans `recette-cuisine.test.tsx` (y compris la preuve invitée via mocks calqués) : `guest-recipe-cuisine.test.tsx` reste read-only, zéro risque de conflit avec la wave.
- Preuve de classe par `closest('div.sticky')` + `classList.contains` (match exact de token) plutôt que `toContain` sur `className` (évite les faux positifs de sous-chaîne type `top-0` dans `top-01`).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-17-1 prêt pour re-test utilisateur (test UAT 1 au scroll) : topbar entièrement visible et cliquable en mode cuisine membre, invitée sans vide.
- 17-04 suit en séquence sur `recette-detail-page.tsx` (header Panel adjacent) : la seule ligne touchée ici est le site d'appel `stickyTopClass`, aucun chevauchement fonctionnel.
- Aucun stub : grep `TODO|FIXME|placeholder|coming soon` sans ajout sur les fichiers touchés ; `guest-recipe-page.tsx` non modifié.

## Self-Check: PASSED

- Fichiers créés/modifiés : 3/3 FOUND sur disque et suivis par git (`git ls-files`).
- Commits : `409311a` FOUND (`git log`).
- SUMMARY : ce fichier, à commiter ci-après.

---
*Phase: 17-mode-cuisine-recette*
*Completed: 2026-10-14*
