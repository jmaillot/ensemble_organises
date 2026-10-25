---
phase: 17-mode-cuisine-recette
plan: '05'
subsystem: ui
tags: [radix-ui, switch, playwright, bounding-box, tailwind]

# Dependency graph
requires:
  - phase: 17-mode-cuisine-recette
    provides: Toggle Mode cuisine (cuisine-toggle asChild) dont le gap visuel G-17-3 restait ouvert
provides:
  - Primitif Switch géométriquement juste (course 12px, structure piste > pastille restaurée en asChild)
  - Preuve Playwright bounding-box du containment ON/OFF à 390px
affects: [recettes, cadeaux, voyages, adresses, calendrier, parametres-notifications]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 1424
  tasks: 2
  commits: 2
plan_head_before: 14d7168
plan_head_after: abdca4f3b102654f254a2edfed3076961cf92a98

# Tech tracking
tech-stack:
  added: []
  patterns: ['asChild Radix : injecter le Thumb dans l enfant clone pour garder piste > pastille']

key-files:
  created:
    - app/e2e/recettes-switch-geometry.spec.ts
  modified:
    - app/src/components/ui/primitives.tsx

key-decisions:
  - "Fix au niveau du primitif partage (AGENTS.md §E), zero retouche aux 9 consommateurs"
  - "asChild : cloneElement + injection du Thumb plutot que retouche de cuisine-toggle.tsx (interdit par le plan)"
  - "Echecs use-notifications pre-existants prouves sur arbre pristine, non corriges (hors scope)"

patterns-established:
  - "Switch asChild : le Slot Radix ne doit jamais recevoir piste et pastille fusionnees — le primitif injecte le Thumb dans l'enfant"

requirements-completed: [R1]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Pastille du switch Mode cuisine contenue dans la piste a ON et OFF (G-17-3 ferme)"
    requirement: "R1"
    verification:
      - kind: e2e
        ref: "app/e2e/recettes-switch-geometry.spec.ts#pastille contenue dans la piste a ON et a OFF"
        status: pass
      - kind: e2e
        ref: "cd app && npx playwright test e2e/recettes.spec.ts e2e/recettes-cuisine-mobile.spec.ts e2e/recettes-switch-geometry.spec.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "8 autres consommateurs Switch (cadeaux, voyages, adresses, notifications, calendrier) sans regression"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "cd app && npm test (925 passed, seuls 4 echecs pre-existants use-notifications prouves anterieurs)"
        status: pass
    human_judgment: false

# Metrics
duration: 45min
completed: 2026-10-15
status: complete
---

# Phase 17 Plan 05: Gap G-17-3 Switch Summary

**Course translate du Switch partagé ramenée à 12px + structure piste > pastille restaurée en usage asChild, containment ON/OFF prouvé par bounding-box Playwright à 390px**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-15T08:30:00Z
- **Completed:** 2026-10-15T09:15:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Primitif `Switch` partagé géométriquement juste : course cochée `translate-x-3` (12px), 18 + 12 = 30px = exactement les 30px utiles de la piste 38px ; taille visuelle 38px inchangée partout
- Usage `asChild` (cuisine-toggle) réparé au niveau du primitif : la pastille est injectée dans l'enfant cloné, la structure piste > pastille existe à nouveau dans le DOM
- Spec e2e `recettes-switch-geometry.spec.ts` : containment ON (bord droit pastille ≤ bord droit piste) et OFF (bord gauche pastille ≥ bord gauche piste) prouvés par bounding-box à 390×844, projets chromium + mobile
- Chaîne verte : typecheck + build + trio e2e recettes (24 passed) ; Vitest 925 passed, seuls 4 échecs pré-existants hors scope avec antériorité prouvée ; lockfile inchangé ; copie française intacte

## Task Commits

Each task was committed atomically:

1. **Task 1: corriger la course translate du Switch partage (12px), taille 38px conservee** - `9d70cfa` (fix)
2. **Task 2: preuve Playwright containment ON + non-regression Switch + chaine verte** - `abdca4f` (test)

## Files Created/Modified

- `app/src/components/ui/primitives.tsx` - Switch : constantes piste/pastille + commentaire arithmétique G-17-3, course 12px, injection du Thumb en mode asChild
- `app/e2e/recettes-switch-geometry.spec.ts` - Preuve bounding-box containment ON/OFF à 390px (idiome openDemoSession, membre uniquement per D-16)

## Decisions Made

- Fix au niveau de la classe partagée `primitives.tsx` per AGENTS.md §E : les 8 usages normaux profitent de la course 12px sans retouche, aucun site consommateur modifié
- `asChild` réparé par `cloneElement` + injection du Thumb dans le primitif plutôt qu'en retouchant `cuisine-toggle.tsx` (explicitement interdit par le plan) : même Switch, même API, DOM corrigé
- Les 4 échecs `use-notifications.test.tsx` ne sont pas corrigés : antériorité prouvée sur arbre pristine (worktree `HEAD~1`, 4 failed / 9 passed identiques), hors scope per scope-boundary ; à traiter dans un plan dédié

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Usage asChild du Switch ne rendait aucune pastille distincte**
- **Found during:** Task 2 (preuve Playwright containment ON + non-regression Switch + chaine verte)
- **Issue:** Le DOM réel (`outerHTML` en démo) a montré un seul `<span>` portant à la fois les classes piste ET pastille : avec `asChild`, le Slot Radix fusionne les props du Root sur le seul enfant et le `children` d'usage (`<span/>`) écrase le Thumb interne du primitif. Il n'y avait donc pas de pastille à contenir — tout le bloc glissait à ON (le symptôme utilisateur exact), et la correction translate-x-3 seule ne changeait que l'amplitude du glissement. Arithmétique du plan (34px > 30px) valide uniquement pour les 8 usages normaux.
- **Fix:** Dans `Switch` (classe partagée, aucun consommateur touché) : quand `asChild` avec un enfant élément valide, `cloneElement` de l'enfant avec le Thumb injecté dedans — structure piste > pastille restaurée, `cuisine-toggle.tsx` et sa doc (single tab stop, pas de `<button>` imbriqué) intacts.
- **Files modified:** app/src/components/ui/primitives.tsx
- **Verification:** `outerHTML` post-fix : `span[data-state] > span` ; spec géométrie verte chromium + mobile ; trio e2e recettes 24 passed
- **Committed in:** abdca4f (Task 2 commit)

**2. [Rule 1 - Bug] Locators initiaux de la spec géométrie invalides (aria-hidden + Slot)**
- **Found during:** Task 2 (preuve Playwright containment ON + non-regression Switch + chaine verte)
- **Issue:** Premier jet `:scope > span` nth(1) : pas de pastille à trouver (cause = déviation 1). Second jet `getByRole('switch')` : timeout car `aria-hidden="true"` exclut l'élément de l'arbre d'accessibilité Playwright.
- **Fix:** Locators structurels `toggle.locator(':scope > span[data-state]')` (piste) + `track.locator(':scope > span')` (pastille), robustes aux deux rendus.
- **Files modified:** app/e2e/recettes-switch-geometry.spec.ts
- **Verification:** Spec verte du premier coup après le fix asChild (chromium 2.1s)
- **Committed in:** abdca4f (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs Rule 1)
**Impact on plan:** Les deux auto-fixes étaient nécessaires pour atteindre la vérité du gap (pastille contenue prouvée). Aucun élargissement de scope : un seul fichier source modifié, contrainte "ne pas toucher cuisine-toggle.tsx" respectée, blast radius inchangé.

## Issues Encountered

- `src/hooks/use-notifications.test.tsx` : 4 échecs (5s/timeout chacun) en suite complète comme en isolation — antériorité prouvée sur arbre pristine `14d7168` via worktree temporaire (mêmes 4 failed / 9 passed), donc pré-existants et non causés par ce plan. Worktree temporaire supprimé après preuve. Non corrigés (hors scope) ; spec e2e de sizing existante ? Non — à router vers un plan de réparation dédié.
- Fichiers untracked pré-existants non miens (`.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`) laissés intacts per scope-boundary ; spec de debug temporaire `zz-debug.spec.ts` créée puis supprimée dans la même tâche.

## Known Stubs

None — aucun stub introduit ; le Switch rend une pastille réelle dans tous les usages.

## Threat Flags

None — aucune surface de sécurité nouvelle : pas d'endpoint, pas de changement auth/RLS, pas de dépendance neuve (gate T-17-SC : lockfile vérifié inchangé).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-17-3 prêt pour re-test utilisateur (test UAT 1, aspect du toggle à ON) : la pastille est contenue, le bloc ne glisse plus
- Suivi suggéré hors plan : réparation des 4 tests `use-notifications` pré-existants (plainte distincte, cause probable timers/async, à investiguer avec Playwright/DOM si visuel)
- `git diff --stat` du plan : uniquement `primitives.tsx` + nouvelle spec ; copies françaises et 38px visuels intacts

---
*Phase: 17-mode-cuisine-recette*
*Completed: 2026-10-15*

## Self-Check: PASSED

- `app/src/components/ui/primitives.tsx` : FOUND (Switch asChild + translate-x-3)
- `app/e2e/recettes-switch-geometry.spec.ts` : FOUND
- Commits `9d70cfa`, `abdca4f` : FOUND (`git rev-list --count 14d7168..HEAD` = 2)
- SUMMARY `./.planning/phases/17-mode-cuisine-recette/17-05-SUMMARY.md` : écrit avant ce commit
