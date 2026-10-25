---
phase: 17-mode-cuisine-recette
plan: '01'
subsystem: ui
tags: [react, radix, wake-lock, localstorage, vitest, recettes]

# Dependency graph
requires:
  - phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
    provides: [RecipeSteps StepRow motif, Panel action slot, readOnly enfant/invité, régime mémoire eo:recipe:code:]
provides:
  - Slice membre complet mode cuisine : toggle + vue épurée + mémoire locale + veille
  - Composant cuisine partagé RecipeCuisineView prêt pour la parité invitée (17-02)
  - Hooks useCuisineProgress et useScreenWakeLock réutilisables côté invité
affects: [17-02-parite-invitee, e2e-recettes]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 10394
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [bouton aria-pressed + Switch asChild visuel single-tab-stop, hook mémoire locale par id régime try/catch, wake-lock suivant toggle avec garde fantome]

key-files:
  created:
    - app/src/modules/recettes/hooks/use-cuisine-progress.ts
    - app/src/modules/recettes/hooks/use-screen-wake-lock.ts
    - app/src/modules/recettes/components/recipe-cuisine-view.tsx
    - app/src/modules/recettes/components/cuisine-toggle.tsx
    - app/src/modules/recettes/recette-cuisine.test.tsx
    - app/src/modules/recettes/use-screen-wake-lock.test.tsx
  modified:
    - app/src/modules/recettes/recette-detail-page.tsx

key-decisions:
  - "Vue cuisine créée avec le prop wakeLockSupported dès le tracer : la tâche 2 n'a eu qu'à monter le hook sur la page"
  - "Test wake-lock renommé .ts → .tsx : JSX non transformable en .ts, plan amendé en Rule 3"
  - "Preuves page réelle (pas de harnais) : fiche seedée via local adapter, navigation A→B par NavProbe sans démontage"

patterns-established:
  - "CuisineToggle : <button aria-pressed> + Switch asChild→span, un seul tab stop, bascule unique par remontée de clic"
  - "useCuisineProgress : clé eo:recette:cuisine:<recipeId>, purge orphelins réécrite, session-seule silencieuse si stockage bloqué"
  - "useScreenWakeLock(active) : request ON, release cleanup, flag cancelled anti-fantôme, garde released, reacquire visibilitychange"

requirements-completed: [R1, R2, R3, R4]

# Coverage metadata (#1602) — one entry per shipped deliverable. Drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Toggle Mode cuisine OFF/ON sur la fiche membre : OFF = vue édition inchangée, ON = numéros + textes + cases seules, compteur N/M + barre, retour OFF conserve les cases"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#fiche ouverte : toggle OFF avec la vue édition inchangée"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#toggle ON : numeros + textes + cases seules, compteur 0/3 + barre, sans édition"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#changer de fiche remet le mode à OFF"
        status: pass
    human_judgment: false
  - id: D2
    description: "Liste cuisine simplifiée : pastille XL 48px statique, case 48px tactiles, texte entier 18px non coché / 14px clamp sans barré coché, reset inline aux deux endroits"
    requirement: "R2"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#vue isolée : pastilles 1-2-3 statiques, texte entier 18px, coché réduit 14px sans barré"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#reset inline : Annuler restaure le bouton, Réinitialiser remet à zéro"
        status: pass
    human_judgment: false
  - id: D3
    description: "Progression mémorisée par appareil et par recette : reprise à la réouverture, purge ids orphelins, reset efface la clé, corrompu/bloqué sans crash ni erreur UI"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#fermer puis rouvrir restaure 2 cases et 2/3"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#ids orphelins purgés silencieusement, mémoire isolée par fiche"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#stockage corrompu : Set vide, sans crash"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#stockage bloqué : cases 100 % opérables en session seule, sans erreur UI"
        status: pass
    human_judgment: false
  - id: D4
    description: "Écran allumé suivant le toggle : demande ON, relâche OFF/sortie/démontage, anti-fantôme ON/OFF rapide, réacquisition visibilitychange, mention discrète si non supporté"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/use-screen-wake-lock.test.tsx#ON demande le verrou, OFF le relâche"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/use-screen-wake-lock.test.tsx#ON/OFF rapide avant résolution : relâché quand même, pas de fantôme"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/use-screen-wake-lock.test.tsx#visibilitychange vers visible réacquiert quand le mode est ON"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/use-screen-wake-lock.test.tsx#non supporté : mention discrète sous la barre, jamais d’erreur"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prohibitions prouvées : zéro appel réseau en vue isolée, zéro dépendance (lockfile inchangé), zéro affordance d'écriture en ON"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#prohibition 1 : zéro appel réseau en vue isolée"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recette-cuisine.test.tsx#prohibition 3 : aucun handler d’écriture câblé, zéro affordance d’édition en ON"
        status: pass
      - kind: other
        ref: "git diff --stat package-lock.json app/package-lock.json (vide)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Chaîne verte : typecheck + suite Vitest complète + build Vite+PWA"
    verification:
      - kind: other
        ref: "cd app && npm run typecheck && npm test && npm run build"
        status: pass
    human_judgment: false

# Metrics
duration: ~30min
completed: 2026-10-14
status: complete
---

# Phase 17 Plan 01 : Tracer mode cuisine fiche membre Summary

**Slice membre complet : toggle aria-pressed en Panel action, vue cuisine XL avec compteur N/M + barre, mémoire locale par recette, Wake Lock suivant le toggle — 25 tests Vitest verts, zéro dépendance.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-14T13:35:00Z (approx.)
- **Completed:** 2026-10-14T14:02:51Z
- **Tasks:** 3
- **Files modified:** 7 (6 créés, 1 modifié)

## Accomplishments

- Tracer vertical prouvé sur la fiche membre : OFF = édition inchangée, ON = 3 lignes numéro + texte + case, 2/3 + barre 2/3, reprise après fermeture, purge orphelins, reset inline, OFF forcé au changement de fiche
- Veille native sans élément séparé : `navigator.wakeLock` demandé en ON, relâché en OFF/sortie/démontage, anti-fantôme, réacquisition `visibilitychange`, mention « Veille non bloquée sur cet appareil. » si non supporté
- Prohibitions figées par test : zéro `fetch` en vue isolée, lockfile inchangé, aucun handler d'écriture câblé en ON
- Chaîne §2.7 hors SQL verte : `typecheck` + 113 fichiers / 915 tests + `build` (PWA 103 entrées)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer toggle OFF/ON + vue cuisine + mémoire locale** - `50b3236` (feat)
2. **Task 2: Veille Wake Lock suivant le toggle + repli discret** - `a248025` (feat)
3. **Task 3: Prohibitions + edges + backstop + typecheck/build** - `9bdfbd0` (test)

⚡ Tracer vérifié de bout en bout (12/12) avant expansion — gate tracer passée, suite étendue à 25/25.

## Files Created/Modified

- `app/src/modules/recettes/hooks/use-cuisine-progress.ts` - Mémoire `eo:recette:cuisine:<recipeId>` + helpers colocalisés régime try/catch copié de `readRecipeInviteCode`
- `app/src/modules/recettes/hooks/use-screen-wake-lock.ts` - `useScreenWakeLock(active)` retournant `{ supported }`, types natifs TS 7.0.2
- `app/src/modules/recettes/components/recipe-cuisine-view.tsx` - Vue cuisine partagée (sticky N/M + Progress + resets + mention repli), fork StepRow sans DnD ni édition
- `app/src/modules/recettes/components/cuisine-toggle.tsx` - Bouton `aria-pressed` + Switch `asChild`, un seul tab stop
- `app/src/modules/recettes/recette-detail-page.tsx` - `cuisine` OFF défaut + reset sur `[id]`, hook monté `active = cuisine`, swap description, branche ON/OFF
- `app/src/modules/recettes/recette-cuisine.test.tsx` - 15 tests page + vue isolée + prohibitions/edges
- `app/src/modules/recettes/use-screen-wake-lock.test.tsx` - 10 tests hook + repli vue

## Decisions Made

- Vue créée avec le prop `wakeLockSupported` dès le tracer : la tâche 2 n'a eu qu'à monter le hook et brancher le prop, sans retoucher la vue.
- Tests sur la page réelle seedée via `local-adapter` (même technique que `recettes-page.test.tsx`), pas de harnais : la preuve couvre le vrai câblage `Panel action` + `key`/reset par fiche.
- Navigation A→B testée sans démontage via `NavProbe` exposant `navigate` : c'est le cas piège Pitfall 3 (route `/recettes/:id` réutilisée).
- Apostrophes typographiques (’) dans tout le copy UI, conformément aux fichiers existants (`recipe-steps.tsx:122` copié tel quel pour l'état vide).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test wake-lock renommé `use-screen-wake-lock.test.ts` → `.tsx`**
- **Found during:** Task 2 (veille Wake Lock)
- **Issue:** JSX dans un fichier `.ts` : échec de transformation `vite:oxc` (`Expected '>' but found 'Identifier'`), 0 test trouvé
- **Fix:** `mv` vers `.test.tsx` (même motif que `recipe-steps.test.tsx`) ; le filtre `npm test -- use-screen-wake-lock` du plan reste valide
- **Files modified:** app/src/modules/recettes/use-screen-wake-lock.test.tsx
- **Verification:** 10/10 verts après renommage
- **Committed in:** a248025 (part of task commit)

**2. [Rule 1 - Bug] `openCuisine` ne patientait pas le chargement fiche**
- **Found during:** Task 1 (tracer)
- **Issue:** `getByRole` synchrone juste après le rendu : la fiche charge en asynchrone (`useRecettes`), 6 tests rouges « Unable to find »
- **Fix:** `findByRole` dans le helper d'ouverture (attente du toggle)
- **Files modified:** app/src/modules/recettes/recette-cuisine.test.tsx
- **Verification:** 12/12 verts
- **Committed in:** 50b3236 (part of task commit)

**3. [Rule 1 - Bug] Assertion « pas de checkbox en OFF » fausse**
- **Found during:** Task 1 (tracer)
- **Issue:** La vue édition affiche elle-même des cases (cuisson D-12) : `queryByRole('checkbox')` trouvait 3 éléments
- **Fix:** Assertion corrigée sur l'absence de la vue cuisine (`region` « Mode cuisine » + `progressbar` absents)
- **Files modified:** app/src/modules/recettes/recette-cuisine.test.tsx
- **Verification:** 12/12 verts
- **Committed in:** 50b3236 (part of task commit)

**4. [Rule 1 - Bug] Typage `adapter.create` dans `seedFiche`**
- **Found during:** Task 3 (chaîne typecheck)
- **Issue:** `create<T>` infère `T` depuis les valeurs : `.id` inexistant sur le type inféré, puis sur le type élargi (2 erreurs `tsc` successives)
- **Fix:** `create` sans générique + cast ciblé `as unknown as { id: unknown }` (test-only)
- **Files modified:** app/src/modules/recettes/recette-cuisine.test.tsx
- **Verification:** `npm run typecheck` vert
- **Committed in:** 9bdfbd0 (part of task commit)

---

**Total deviations:** 4 auto-fixed (1 blocking, 3 bugs)
**Impact on plan:** Correctifs nécessaires au vert (tests + typage) et un renommage imposé par la toolchain. Aucun changement de périmètre, aucune dépendance ajoutée.

## Issues Encountered

- Ambiguïté « Réinitialiser » × 2 (en-tête + bas) dans le test reset : levée par scopage `within(prompt.parentElement)` — pas un bug produit, les deux confirmations sont indépendantes par conception (D-09).
- Fichier test `.ts` listé au plan mais JSX requis : renommage documenté ci-dessus, le plan 17-02 devra référencer le `.tsx`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `RecipeCuisineView` + `useCuisineProgress` + `CuisineToggle` prêts pour la parité invitée (17-02) : alimenter avec les étapes `link-view`, même clé mémoire sur l'appareil de l'invité (D-17).
- `useScreenWakeLock` réutilisable tel quel côté invité (`active = cuisine`).
- e2e recettes non rejoué ici (chaîne §2.7 hors SQL : typecheck + Vitest + build verts) ; le parcours démo toggle → cocher → recharger reste à couvrir dans le plan e2e.
- Aucun stub, aucun `Known Stubs` : grep `TODO|FIXME|placeholder|coming soon` vide sur les 4 fichiers sources.

## Self-Check: PASSED

- Fichiers créés/modifiés : 7/7 FOUND sur disque, 6/6 sources+tests suivis par git (`git ls-files`).
- Commits : `50b3236`, `a248025`, `9bdfbd0` FOUND (`git log`).
- `commits:` mesuré 3/3 depuis le ledger `gsd-plan-head-before-17-01` (`rev-list --count`).
- SUMMARY : ce fichier, à commiter ci-après.

---
*Phase: 17-mode-cuisine-recette*
*Completed: 2026-10-14*
