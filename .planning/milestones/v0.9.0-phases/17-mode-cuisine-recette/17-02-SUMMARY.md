---
phase: 17-mode-cuisine-recette
plan: '02'
subsystem: ui
tags: [react, vitest, playwright, recettes, cuisine, guest, wake-lock, localstorage]

# Dependency graph
requires:
  - phase: 17-01
    provides: [RecipeCuisineView, CuisineToggle, useCuisineProgress, useScreenWakeLock, fiche membre prouvée]
provides:
  - Parité invitée du mode cuisine (même toggle + vue + mémoire + veille, zéro PostgREST, zéro édition)
  - Preuve enfant (toggle visible, cases seules) en Vitest + e2e démo
  - Parcours e2e démo toggle → cocher → recharger → reprise (membre + enfant)
  - Chaîne §2.7 verte : typecheck + 921 Vitest + build + e2e recettes 18/18, lockfile inchangé
affects: [verify-work-phase-17, e2e-recettes]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 5268
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: [parité invitée par réutilisation stricte des unités 17-01, mock fetchGuestRecipeView + fetch piégé pour preuve zéro-réseau, flag supabase hoisted figé à l'import]

key-files:
  created:
    - app/src/modules/recettes/guest-recipe-cuisine.test.tsx
  modified:
    - app/src/modules/recettes/guest-recipe-page.tsx
    - app/e2e/recettes.spec.ts

key-decisions:
  - "Clé mémoire invitée = view.recipeId réel (même clé que la fiche membre, D-17), repli activeCode"
  - "Assertion e2e 16-03 recalée sur la copie 8269d72 (test-only, aucun code produit touché)"
  - "Enfant prouvé sur la fiche réelle via currentMemberId = Noé, pas de harnais"

patterns-established:
  - "Guest cuisine : Panel Étapes + CuisineToggle en action + branche ON/OFF, OFF forcé sur [activeCode] (miroir fiche membre sur [id])"
  - "Preuve zéro-réseau invitée : fetchGuestRecipeView mocké, mock réarmé après link-view initial, fetch global piégé (Pitfall 7)"
  - "Client Supabase mocké à getter sur flag hoisted initialisé false : lib/data fige l'adaptateur local à l'import, la page invitée lit le flag à chaque rendu"

requirements-completed: [R1, R2, R3, R4, R5]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Lien d'invitation recette : même toggle Mode cuisine, même vue (cases + compteur N/M + barre + resets + repli veille), mémoire même clé eo:recette:cuisine:, zéro PostgREST au-delà du link-view initial, zéro édition en ON"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#toggle OFF par défaut, vue invitée inchangée"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#ON : mêmes cases + compteur + barre + resets, zéro édition"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#cocher persiste sous la même clé, reprise à la réouverture"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#zéro réseau au toggle et aux cases (au-delà du link-view initial)"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#changer de lien remet le mode à OFF"
        status: pass
    human_judgment: false
  - id: D2
    description: "Enfant (canWrite faux) : toggle visible, cases seules cochables avec compteur, ni ajout ni drag ni édition ni actions foyer"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx#enfant : toggle visible, cases seules cochables, ni ajout ni drag ni édition"
        status: pass
      - kind: e2e
        ref: "app/e2e/recettes.spec.ts#enfant : toggle visible et cases cochables, rien d’autre"
        status: pass
    human_judgment: false
  - id: D3
    description: "Parcours e2e démo membre : 2 étapes via formulaire, toggle, cocher → 1/2, recharger → OFF mais reprise 1/2, retour édition"
    requirement: "R3"
    verification:
      - kind: e2e
        ref: "app/e2e/recettes.spec.ts#membre : toggle, cocher, recharger, reprise, retour édition"
        status: pass
    human_judgment: false
  - id: D4
    description: "Chaîne verte : typecheck + suite Vitest complète + build Vite+PWA + e2e recettes, lockfile inchangé (zéro dépendance, T-17-SC)"
    verification:
      - kind: other
        ref: "cd app && npm run typecheck && npm test (114 fichiers / 921 tests) && npm run build"
        status: pass
      - kind: e2e
        ref: "cd app && npm run test:e2e -- recettes (18 passed)"
        status: pass
      - kind: other
        ref: "git diff --stat package-lock.json app/package-lock.json (vide)"
        status: pass
    human_judgment: false

# Metrics
duration: ~50min
completed: 2026-10-14
status: complete
---

# Phase 17 Plan 02 : Parité invitée + enfant + preuves e2e Summary

**Page invitée à parité stricte du mode cuisine (même toggle, vue, mémoire, veille — zéro réseau, zéro édition), enfant prouvé en Vitest + e2e, parcours démo toggle-cocher-recharger-reprise vert, chaîne complète verte sans dépendance.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-10-14T15:20:00Z (approx.)
- **Completed:** 2026-10-14T16:10:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 créé, 2 modifiés)

## Accomplishments

- Parité invitée totale : le lien `/invitation/recette` donne le même toggle `CuisineToggle` (OFF par défaut, reset au changement de lien) et la même `RecipeCuisineView` alimentée par les étapes `link-view` déjà chargées — confort XL, sticky N/M + barre, resets, repli veille via le même `useScreenWakeLock`
- Mémoire invitée sous la même clé `eo:recette:cuisine:<recipeId>` (id réel de la vue, repli code) avec purge identique ; entrée orpheline documentée inoffensive, sans migration
- Zéro appel PostgREST/fetch au toggle et aux cases, prouvé par test (mock `fetchGuestRecipeView` réarmé après le `link-view` initial + `fetch` global piégé) ; zéro affordance d'édition en ON y compris côté invité (T-17-04)
- Enfant : toggle visible et cases seules cochables sur la fiche réelle (`currentMemberId` = Noé), ni ajout ni drag ni édition — cohérent avec les cases cuisson D-12 conservées en `readOnly`
- E2E démo (chromium + mobile) : membre toggle → cocher → recharger → reprise → retour édition ; enfant toggle + cases, rien d'autre
- Chaîne §2.7 verte : `typecheck` + 114 fichiers / 921 tests Vitest + `build` (PWA 103 entrées) + `test:e2e -- recettes` (18/18) ; `package-lock.json` inchangé

## Task Commits

Each task was committed atomically:

1. **Task 1: parité invitée du mode cuisine, zéro PostgREST, zéro édition** - `c6191e3` (feat)
2. **Task 2: enfant + e2e démo + chaîne finale et lockfile** - `20b922c` (test)

## Files Created/Modified

- `app/src/modules/recettes/guest-recipe-page.tsx` - Panel « Étapes » à parité (toggle en `action`, description basculée verbatim UI-SPEC, branche ON = `RecipeCuisineView`, hook veille monté `active = cuisine`, reset OFF sur `[activeCode]`)
- `app/src/modules/recettes/guest-recipe-cuisine.test.tsx` - 6 tests : 5 parité/mémoire/zéro-réseau/reset-lien + 1 enfant fiche réelle
- `app/e2e/recettes.spec.ts` - Nouveau describe « mode cuisine » (membre + enfant) + recalage d'une assertion 16-03 périmée

## Decisions Made

- Clé mémoire invitée = `view.recipeId` réel (pas le code) : même clé que la fiche membre sur l'appareil, partage de la progression si l'invité ouvre ensuite la fiche en membre ; repli `activeCode` si `recipeId` nul.
- `fetchGuestRecipeView` mocké au module (pas `fetch`) : la preuve zéro-réseau porte sur le seul chemin réseau autorisé + le `fetch` global piégé couvre tout PostgREST direct.
- Enfant prouvé sur `RecetteDetailPage` réelle plutôt qu'un harnais : couvre le vrai câblage `canWrite` → `readOnly` → toggle conservé.
- Assertion e2e 16-03 recalée sur la copie effective plutôt que le code produit retouché : le message « N ajoutée(s) dans » est le produit voulu de 8269d72 (fusion des lignes), le test était périmé.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Assertion « Réinitialiser » ambiguë dans le test zéro-réseau**
- **Found during:** Task 1 (parité invitée)
- **Issue:** Après « Tout réinitialiser », deux boutons « Réinitialiser » coexistent (en-tête + confirmation inline) : `getByRole` lève « multiple elements »
- **Fix:** Scopage `within(prompt.parentElement)` comme en 17-01 (les deux confirmations sont indépendantes par conception, D-09)
- **Files modified:** app/src/modules/recettes/guest-recipe-cuisine.test.tsx
- **Verification:** 6/6 verts
- **Committed in:** c6191e3 (part of task commit)

**2. [Rule 3 - Blocking] `client.from is not a function` sur le test enfant**
- **Found during:** Task 1 (test enfant dans le même fichier)
- **Issue:** Le mock `supabase/client` (`isSupabaseConfigured: true`) forçait l'adaptateur Supabase pour la fiche membre ; de plus `lib/data/index.ts` fige l'adaptateur UNE fois à l'import, donc un flag muté en `beforeEach` arrivait trop tard
- **Fix:** Mock à getter sur flag `vi.hoisted` initialisé à `false` (évalué avant les imports → adaptateur local figé) ; describes invités repassant le flag à `true` en `beforeEach` (la page invitée lit le flag à chaque rendu)
- **Files modified:** app/src/modules/recettes/guest-recipe-cuisine.test.tsx
- **Verification:** 6/6 verts (fiche membre via adaptateur local, page invitée via Edge mockée)
- **Committed in:** c6191e3 (part of task commit)

**3. [Rule 3 - Blocking] E2E 16-03 rouge sur copie périmée (« 1 ligne ajoutée à »)**
- **Found during:** Task 2 (chaîne e2e recettes)
- **Issue:** `8269d72` (fusion des lignes Courses existantes) a changé la copie en « 1 ajoutée dans « Fresque » » sans mettre à jour l'assertion e2e ; échec pré-existant, reproductible en isolation, sans rapport avec la phase 17
- **Fix:** Test-only : regex recalée sur la copie effective + commentaire traçant 8269d72 ; aucun code produit touché
- **Files modified:** app/e2e/recettes.spec.ts
- **Verification:** `test:e2e -- recettes` 18/18 vert (chromium + mobile)
- **Committed in:** 20b922c (part of task commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** Correctifs nécessaires au vert (tests + e2e) ; un recalage test-only d'une assertion périmée d'une phase antérieure, tracé et sans code produit. Aucun changement de périmètre, aucune dépendance ajoutée.

## Issues Encountered

- DOM Vitest affichant « Bientôt disponible » pendant le diagnostic enfant : simple en-tête `ModuleShell` du module recettes (kicker catalogue), pas une erreur — la vraie erreur était `client.from is not a function` (déviation 2).
- Suite e2e initiale 16/18 : les 2 échecs étaient le test 16-03 périmé (déviation 3), les 4 tests cuisine 17-02 passaient déjà (chromium + mobile).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 17 livrée sur les deux chemins (membre 17-01 + invité/enfant 17-02) : décisions D-01–D-19 implémentées, edges 6/6 et prohibitions 3/3 prouvés, prête pour verify-work.
- Menaces T-17-03 (acceptée : locale à l'appareil par conception) et T-17-04 (mitigée : aucun handler d'écriture câblé en ON, prouvé des deux chemins) couvertes ; T-17-SC (lockfile inchangé) vérifié.
- Aucun stub : grep `TODO|FIXME|placeholder|coming soon` ne rend qu'un attribut `placeholder=` pré-existant du champ code invité (phase 16, aide de saisie légitime), rien de nouveau ; la page invitée ne reçoit que `steps` + état de cases.

## Self-Check: PASSED

- Fichiers créés/modifiés : 3/3 FOUND sur disque et suivis par git (`git ls-files`).
- Commits : `c6191e3`, `20b922c` FOUND (`git log`).
- `commits:` mesuré 2/2 depuis `9bdfbd0` (`rev-list --count`, hors commit SUMMARY à venir).
- SUMMARY : ce fichier, à commiter ci-après.

---
*Phase: 17-mode-cuisine-recette*
*Completed: 2026-10-14*
