---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
plan: '03'
subsystem: frontend-recettes
tags: [react, vitest, playwright, edge-invite, print-css, courses]
requires:
  - phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
    provides: [socle serveur Recettes 16-01 (schema + RLS + RPC + Edge recipe-invite), grille-fiche-scaler 16-02]
provides:
  - Partage invité lecture seule révocable (dialogue + page /invitation/recette + route lazy)
  - Export print @media print + envoi Courses à l'échelle courante depuis la fiche
  - Spec e2e recettes 7 parcours × 2 viewports + chaîne AGENTS.md 2.7 verte
affects: [verify-work-phase-16]
actuals:
  tokens: 15800
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [Edge invite lien-seul publishable (calque ardoise/voyages), print CSS natif sans lib, send-to-courses via createShoppingItem + guessRayon, invalidation tableAll contrat tâches/routines]
key-files:
  created:
    - app/src/modules/recettes/components/recipe-share-dialog.tsx
    - app/src/modules/recettes/guest-recipe-page.tsx
    - app/src/modules/recettes/guest-recipe-page.test.tsx
    - app/src/modules/recettes/components/recipe-export.css
    - app/src/modules/recettes/recipe-actions.test.ts
    - app/e2e/recettes.spec.ts
  modified:
    - app/src/modules/recettes/api.ts
    - app/src/modules/recettes/types.ts
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/components/ingredient-list.tsx
    - app/src/modules/recettes/hooks/use-recettes.ts
    - app/src/app/router.tsx
    - app/src/app/route-preload.ts
    - app/src/app/route-preload.test.tsx
key-decisions:
  - "Dialogue partage réduit au lien seul : l'Edge recipe-invite ne connaît que link-view, pas de part membre ni d'e-mail (SPEC hors-scope verrouillé)"
  - "Curseur contrôlé optionnel sur IngredientList : la fiche membre partage l'échelle avec print/Courses, l'invitée garde l'état local (comportement historique)"
  - "Print = .recipe-screen masqué + .recipe-print + chrome applicatif masqué en @media print ; la vue print porte le modèle toRecipePrintModel, jamais de photo"
requirements-completed: [R5, R10, R11, R12, R14]
coverage:
  - id: T1
    description: "Lien généré visible sans compte, révoqué/expiré rend lien invalide (oracle unique), zéro PostgREST direct, enfant sans actions"
    requirement: "R11"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-page.test.tsx (6 tests)"
        status: pass
    human_judgment: false
  - id: T2
    description: "Export print nom + ingrédients à l'échelle + étapes sans photo ; envoi 3 ingrédients à l'échelle 8 crée 3 lignes aux bonnes quantités"
    requirement: "R12, R14"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-actions.test.ts (3 tests)"
        status: pass
    human_judgment: false
  - id: T3
    description: "Parcours démo grille→fiche→scaler→partage→Courses, enfant lecture seule, invitée ; chaîne 2.7 complète verte"
    requirement: "R5, R10"
    verification:
      - kind: e2e
        ref: "app/e2e/recettes.spec.ts (14/14, chromium + mobile)"
        status: pass
    human_judgment: false
duration: 26min
completed: 2026-10-14
status: complete
plan_head_before: 5fd395d8e8a7b063a46ffdd01a635dc89d8ccba6
plan_head_after: 75304999b0bb82f07cbb985a3a95d290d85b2370
---

# Phase 16 Plan 03 : Partage invité + export + Courses Summary

**Lien invité lecture seule révocable prouvé sans compte, export print à l'échelle, envoi Courses aux bonnes quantités, enfant lecture seule e2e — chaîne 2.7 verte, 2 bugs prod corrigés au passage**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-10-14T08:54Z
- **Completed:** 2026-10-14T09:20Z
- **Tasks:** 3 (tracer + export/Courses + e2e/chaîne)
- **Files modified:** 14 (6 created, 8 modified)

## Accomplishments

- Dialogue `RecipeShareDialog` : lien copiable + QR, code brut affiché une seule fois, régénération invalidante, révocation immédiate, compteur utilisations — via Edge `recipe-invite` en JWT user, jamais PostgREST sur les partages (D-13)
- Page `/invitation/recette` : même fiche en lecture seule (défilement, curseur pair, cases cuisson locales), zéro bouton d'édition, ticket = code via `link-view` seul, zéro appel PostgREST direct prouvé par le journal fetch du test (D-14, T-16-10)
- Fiche membre : boutons Partager / Exporter / Ajouter à une liste (sélecteur `shopping_lists` + aperçu des lignes créées), suppression toujours confirmée par modale, zones ≥ 44px ; enfant : tout le panneau Actions masqué + `guard()` sur l'envoi (T-16-13)
- Vue print `@media print` : nom + ingrédients recalculés à l'échelle courante + étapes numérotées, robuste sans photo, 0 nouvelle dépendance (R12, T-16-SC tient)
- Envoi Courses : `sendRecipeIngredientsToCourses` (quantités `qté × cible/base`, NULL intact, unité accordée, rayon deviné) — 3 ingrédients à l'échelle 8 → 3 lignes `1000 g / 2 œufs / au goût` (R14, D-16)
- Route lazy + morceau préchargé, compteur 34 → 35 (intentionnel)
- Chaîne 2.7 complète : typecheck ✓, 110 fichiers / 885 tests Vitest ✓, build (precache 103) ✓, e2e recettes 14/14 ✓, statique SQL (180 fonctions, 0 défaut) ✓, test-db 58 fichiers verts ✓ ; test-dispatch-push non pertinent (pas de push, per RESEARCH)

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): lien invité généré puis ouvert sans compte** - `5f1be96` (feat)
2. **Task 2: export print + envoi Courses** - `24939c9` (feat)
3. **Task 3: e2e + chaîne 2.7** - `7530499` (test)

**Tracer feedback gate :** tâche sans `gate="blocking-human"`, vérification automatisée seule (`npm test -- guest-recipe` 5/5 à l'époque, 6/6 final) → `⚡ Tracer verified end-to-end — expanding`, poursuite sans checkpoint.

## Files Created/Modified

- `app/src/modules/recettes/components/recipe-share-dialog.tsx` - Dialogue lien invité (nouveau, calque gift-share-dialog réduit au lien seul)
- `app/src/modules/recettes/guest-recipe-page.tsx` - Page invitée lecture seule (nouveau, calque guest-ardoise-page)
- `app/src/modules/recettes/guest-recipe-page.test.tsx` - 6 preuves invitée (nouveau : fiche, scaler, formulaire, révoqué, oracle unique, garde code court)
- `app/src/modules/recettes/components/recipe-export.css` - Print fiche seule (nouveau)
- `app/src/modules/recettes/recipe-actions.test.ts` - 3 preuves envoi + print + unités (nouveau, hors liste plan — test seul)
- `app/e2e/recettes.spec.ts` - 7 parcours démo × 2 viewports (nouveau)
- `app/src/modules/recettes/api.ts` - Invite Edge (user + publishable) + vue invitée + envoi Courses
- `app/src/modules/recettes/types.ts` - `toRecipePrintModel` + unités abrégées invariables
- `app/src/modules/recettes/recette-detail-page.tsx` - Panneau Actions (Partager/Exporter/Courses/supprimer), échelle partagée, vue print
- `app/src/modules/recettes/components/ingredient-list.tsx` - Curseur contrôlé optionnel (défaut local inchangé)
- `app/src/modules/recettes/hooks/use-recettes.ts` - Fix invalidation tableAll (voir déviations)
- `app/src/app/router.tsx` + `route-preload.ts` + `route-preload.test.tsx` - Route `/invitation/recette`, 34 → 35

## Decisions Made

- Dialogue partage réduit au lien seul : pas de part membre, pas d'e-mail — l'Edge ne connaît que `link-view` et la SPEC verrouille la lecture seule (T-16-12)
- Curseur contrôlé optionnel : `servings`/`onServingsChange` sur `IngredientList`, mode local par défaut préservé (aucun test 16-02 touché)
- Max-uses : pas de preuve client — l'application est serveur (RPC `FOR UPDATE`, suite 0054 en 16-01) ; le client affiche le compteur du `summary`
- `test-dispatch-push.sh` non exécuté : non pertinent, aucun push dans la phase (RESEARCH + plan l'excluent explicitement)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `agreeUnit('g', N>1)` rendait `'gs'`**
- **Found during:** Task 2 (écriture du test d'envoi : `500 g` à l'échelle 8 donnait `1000 gs`)
- **Issue:** L'accord +s/+x s'appliquait aux abréviations métriques, variables en français (`g, kg, ml, cl, cas…`)
- **Fix:** Ensemble `INVARIABLE_UNITS` rendu tel quel ; preuves 16-02 (`oeuf`/`noix`) inchangées
- **Files modified:** app/src/modules/recettes/types.ts (+ test recipe-actions.test.ts)
- **Commit:** 24939c9

**2. [Rule 1 - Bug] Les enfants ne se rafraîchissaient jamais après mutation (ajout ingrédient invisible)**
- **Found during:** Task 3 (e2e : ajout `Farine` accepté sans erreur mais ligne jamais affichée — succès muet traité en échec, AGENTS.md §F)
- **Issue:** `refreshChildren` (puis `toggleFavorite`, `reorderSteps`) invalidaient `[table]`, mais les requêtes enfants sont cléées `['all', table, …]` (`queryKeys.tableAll`) — le préfixe ne matchait rien. Le contrat correct est celui de tâches/routines/voyages (`tableAll` aux deux bouts) ; la 16-02 avait copié la forme sans la clé
- **Fix:** `refreshChildren` invalide `[table]` pour les ressources `useResource` (catégories/tags) + `tableAll(table)` pour les 4 `useQuery` enfants ; `toggleFavorite` et `reorderSteps` alignés (corriger la classe, §E)
- **Files modified:** app/src/modules/recettes/hooks/use-recettes.ts
- **Verification:** e2e ajout→affichage vert, suite recettes 33/33
- **Commit:** 7530499

**3. [Rule 1/3 - Tests] Ajustements de preuves côté test uniquement (zéro prod)**
- Libellé checkbox étapes (`Marquer l'étape N comme faite`), oracle expiré asserté en message exact, sélecteurs e2e ambigus (print masqué vs fiche), garde formulaire invitée prouvée en Vitest (`fireEvent.submit`, bouton désactivé en e2e)
- **Commits:** 5f1be96, 7530499

---

**Total deviations:** 3 auto-fixed (2 bugs prod, 1 rafale tests)
**Impact on plan:** Les deux bugs prod étaient requis pour les must-haves (bonnes quantités ; fiche qui affiche ce qu'on ajoute). Aucun élargissement de scope, 0 paquet neuf.

## Issues Encountered

- **Échec pré-existant vague 2 NON reproduit :** `src/hooks/use-notifications.test.tsx` (4 timeouts signalés en 16-02 sur baseline 23ce9a8) est vert dans cette vague : full suite **110 fichiers / 885 tests, 100 % verte**. Flaky de charge probable ; à toutes fins utiles, non touché (scope boundary), état constaté.
- **2 échecs e2e hors scope, prouvés pré-existants sur baseline :** `critical-paths` landing (attend le lien Facebook retiré par `a570a50` — spec jamais mise à jour) et `voyage-workspace` masquage rubrique — tous deux reproduits à l'identique dans un worktree à `5fd395d` (sans mes changements, rebuild propre), donc disjoints de ce plan au fichier près. Laissés intacts per scope boundary ; full e2e : 107 passed / 4 failed, recettes 14/14.
- `getByLabel('Ingrédient')` sans `exact:true` matche aussi la section `aria-label="Ingrédients"` : sélecteurs e2e resserrés (spec, pas prod).

## Auth Gates

None - aucun.

## Known Stubs

None - grep `TODO|FIXME|placeholder|coming soon|not available` vide sur les fichiers du plan (les `placeholder=` des champs de saisie sont l'attribut HTML standard, pas des stubs).

## Threat Flags

None - surfaces du plan couvertes par le threat model : page invitée sans PostgREST ni bouton d'édition (T-16-10 ✓ prouvé par journal fetch), token brut éphémère d'état jamais loggé (T-16-11 ✓), lecture seule invitée sans RPC d'écriture (T-16-12 ✓), envoi Courses gardé `canWrite` + RLS writer (T-16-13 ✓), 0 paquet neuf (T-16-SC ✓).

## User Setup Required

None - pas de USER-SETUP.md.

## Self-Check: PASSED

- Fichiers : les 6 créés + 8 modifiés existent (`[ -f … ]`)
- Commits : 5f1be96 + 24939c9 + 7530499 existent (`git log --all`)
- Preuves : typecheck ✓, Vitest 885/885 ✓, build precache 103 ✓, e2e recettes 14/14 ✓, statique SQL 0 défaut ✓, test-db 58/58 ✓
- Compte rendu fidèle : 2 bugs prod documentés, 2 échecs e2e pré-existants prouvés sur baseline, notifications-suite verte constatée

## Next Phase Readiness

- Phase 16 complète (R1–R14 répartis 16-01/16-02/16-03) : prête pour `/gsd-verify-work`
- Dette connue hors phase : spec e2e `critical-paths` (lien Facebook) et `voyage-workspace` (masquage rubrique) rouges sur baseline — à traiter hors 16-03
- Aucun bloqueur

---
*Phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage*
*Completed: 2026-10-14*
