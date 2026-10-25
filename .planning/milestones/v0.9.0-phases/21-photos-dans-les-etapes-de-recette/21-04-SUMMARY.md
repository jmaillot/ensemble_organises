---
phase: 21-photos-dans-les-etapes-de-recette
plan: 04
subsystem: recettes / rendu (mode cuisine + impression)
tags: [react, vitest, playwright, tailwind, css-print, dexie, blob-url, recipe-steps]

# Dependency graph
requires:
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-01 — colonne `recipe_steps.photo_path`, modèle `RecipeStep.photoPath`, `uploadRecipeStepPhoto`/`resolveRecipeStepPhotoUrl`/`replaceRecipeStepPhoto`, `step-photo.tsx` (rendu, plein écran au tap, masquage `onError` démo) et la carte d'URLs déjà construite pour `RecipeSteps`"
  - phase: 17-recettes
    provides: "Mode cuisine (`RecipeCuisineView`, Wake Lock, mémoire locale) et impression (`toRecipePrintModel`, `recipe-export.css`) — les deux surfaces étendues ici, plus `depositHouseholdFile` et la compression native"
provides:
  - "recipe-cuisine-view.tsx — prop `photoUrls?: Record<string, string | null>` (optionnel, défaut `{}`) et rendu de `StepPhoto` sous le texte de chaque étape dans le conteneur `min-w-0 flex-1`, réduit (`max-h-[120px]`) une fois l'étape cochée, rien pour une étape sans photo"
  - "types.ts — `RecipePrintModel.stepPhotos: (string | null)[]` parallèle à `stepLines` (même longueur, même index), alimenté par l'argument optionnel `toRecipePrintModel({ stepPhotoUrls })` (pur, synchrone), jamais par `step.photoPath`"
  - "recipe-export.css — `.recipe-print img { max-width: 100%; max-height: 120pt; object-fit: contain }` dans `@media print`, CSS seul, aucune dépendance PDF"
  - "recette-detail-page.tsx — la carte `photoUrls` alimente les DEUX surfaces (vue cuisine ET `toRecipePrintModel`) et le bloc `.recipe-print` rend une `<img>` bornée sous chaque ligne numérotée"
  - "Preuves : `recipe-cuisine-photo.test.tsx` (5), `recette-detail-page.test.tsx` (3), `recipe-actions.test.ts` (modèle d'impression positif + `blob:`/nettoyage) et le parcours e2e démo dans `e2e/recettes.spec.ts`"
affects: [21-03]

# Actuals (#2632) — pair with the plan's `estimate` (22k tokens / 3 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff = `git diff <base>..HEAD | wc -c` / 4), never a harness token count.
actuals:
  tokens: 7091
  tasks: 3
  commits: 3
  plan_head_before: d167e58f0edaeaff9c824bb70f955196edb20bf3
  plan_head_after: acde76343ba091ee086737d3efb7f53c16518f65

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Une vue qui reçoit une carte d'URLs RÉSOLUES (jamais un chemin de bucket) projette la même valeur sur l'écran et sur le papier : une seule résolution alimente les deux surfaces, donc elles ne peuvent pas diverger (T-21-05)"
    - "Un modèle d'impression PUR et synchrone gagne un tableau PARALLÈLE optionnel (`stepPhotos` à côté de `stepLines`) alimenté par un argument — la fonction ne fait aucun accès réseau, la résolution appartient à la page"
    - "En mode cuisine, cocher une étape RÉDUIT l'image (`max-h-[120px]`) au lieu de la retirer : pas de saut de mise en page ; la chaîne de classe est littérale au site d'appel (scan Tailwind), et `cn`/twMerge écrase la base `max-h-[320px]`"
    - "Un test e2e de dépôt en démo cible le conteneur de l'étape puis y cherche `img` (comptage exact), jamais par rôle : le bloc `.recipe-print` est `aria-hidden=\"true\"`, donc `byRole` l'ignore"

key-files:
  created:
    - app/src/modules/recettes/recipe-cuisine-photo.test.tsx
    - app/src/modules/recettes/recette-detail-page.test.tsx
  modified:
    - app/src/modules/recettes/components/recipe-cuisine-view.tsx
    - app/src/modules/recettes/components/recipe-export.css
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/types.ts
    - app/src/modules/recettes/recipe-actions.test.ts
    - app/e2e/recettes.spec.ts

key-decisions:
  - "Une seule résolution, deux surfaces : la carte `photoUrls` de 21-01 alimente `RecipeCuisineView` ET `toRecipePrintModel` — la cuisine et le papier ne peuvent pas afficher autre chose que la fiche, et aucune des deux ne reçoit un chemin brut (T-21-05)"
  - "`stepPhotos` n'est alimenté QUE par la carte résolue (`args.stepPhotoUrls?.[step.id] ?? null`) ; `step.photoPath` n'est jamais lu — le tableau reste parallèle à `stepLines` (même longueur, même index), donc l'image se place sous sa propre ligne (D-09)"
  - "Réduction plutôt que masquage en cuisine (D-08) : `className={isChecked ? 'max-h-[120px]' : undefined}`, chaîne littérale complète au site d'appel (scan statique Tailwind, jamais d'interpolation) ; `cn` = `twMerge(clsx(...))` donc `max-h-[120px]` écrase la base `max-h-[320px]`"
  - "Le plein écran n'est pas redéveloppé : le tap vit déjà dans `StepPhoto` (21-01, D-07) — la vue cuisine n'ajoute que la taille et l'emplacement"
  - "Aucun masquage `onError` côté papier (D-09) : la ligne de texte reste la référence si l'image ne charge pas — le masquage démo vit uniquement sur l'écran (`StepPhoto`)"
  - "Le commentaire de `toRecipePrintModel` et l'en-tête de `recipe-export.css` sont corrigés : ils affirmaient que la photo n'apparaît jamais dans le modèle, ce qui cesse d'être vrai — une affirmation fausse dissuade (§2.7 I)"
  - "L'assertion `expect(JSON.stringify(model)).not.toContain('photo')` de `recipe-actions.test.ts`, devenue fausse par construction, est RÉÉCRITE en assertions positives (stepPhotos `[null,null]` sans carte ; URLs alignées avec carte ; chemin de bucket absent du modèle ; dépôt démo non `http(s)://` ; trois niveaux de nettoyage sans erreur sur `blob:`)"
  - "Aucune dépendance ajoutée : l'impression reste CSS seule (D-09) et la compression passe par `createImageBitmap`/`canvas` déjà en place (T-21-SC non déclenché)"

patterns-established:
  - "Un tableau parallèle dans un modèle de rendu (`stepPhotos` à côté de `stepLines`) se remplit par `map` sur la MÊME source (`args.steps`) que les lignes, donc l'alignement d'index est structurel et non vérifié à la main"
  - "Un test qui dépôt un fichier en démo (`blob:`) doit fournir un tampon PNG VALIDE et décodable (1×1 RGBA) : la compression native de `depositHouseholdFile` refuse un tampon non décodable"
  - "Un test e2e ne dépend pas de l'ordre d'exécution des autres tests du fichier : chaque test repart d'une session neuve (`openDemoSession`)"

requirements-completed: [R3, R5]  # Copié verbatim de `requirements:` du PLAN. Aucun REQUIREMENTS.md dans ce dépôt, donc aucune case à cocher ; R6 est déclaré par 21-01 (non re-réclamé ici, seulement prouvé de bout en bout par la Task 3).

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "En mode cuisine, l'image apparaît sous le texte de l'étape, se RÉDUIT (hauteur bornée) une fois l'étape cochée sans quitter le DOM, s'ouvre en plein écran au tap, et une étape sans photo ne rend aucun élément média ; la vue ne fait aucun appel réseau."
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-cuisine-photo.test.tsx (5 tests : src exact sous le texte, étape nue sans média, réduction au cochage, plein écran ouverture/fermeture, aucun fetch)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`RecipePrintModel.stepPhotos` est parallèle à `stepLines` (même longueur, même index) et alimenté par la carte d'URLs résolues ; le bloc `.recipe-print` de la fiche rend une `<img>` bornée sous chaque ligne numérotée ; la feuille `.recipe-print img` borne largeur et hauteur en CSS seul."
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-actions.test.ts#modèle d'impression (stepPhotos [null,null] / URLs alignées) + app/src/modules/recettes/recette-detail-page.test.tsx (image fiche + image bloc d'impression)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Le modèle d'impression ne porte jamais un chemin de bucket : `stepPhotos` ne reçoit que la carte résolue, un `photoPath` de forme chemin présent dans les étapes n'apparaît jamais dans le modèle (T-21-05)."
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-actions.test.ts#T-21-05 (chemin de bucket absent du modèle ; dépôt démo non http(s):// sur l'adaptateur réel)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Les trois niveaux de nettoyage (`deleteRecipeStep`, `deleteRecipe`, remplacement) sont sans erreur quand il n'y a rien à retirer — arête « empty » de R5."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-actions.test.ts#nettoyage (trois niveaux no-throw sur formes `blob:`)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Le parcours de bout en bout en démo : dépôt d'une photo d'étape (tampon PNG valide), image `blob:` sur la fiche, en mode cuisine, dans le bloc `.recipe-print`, puis masquage de l'aperçu mort après rechargement avec retour de l'invitation « Ajouter une photo » ; une étape nue ne rend aucun média (R6)."
    requirement: "R6"
    verification:
      - kind: e2e
        ref: "playwright:app/e2e/recettes.spec.ts#Recettes — photos d’étapes (démo)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rendu imprimé réel : `window.print()` sort l'image sous sa ligne numérotée et la recette tient sur une page."
    requirement: "R3"
    verification: []
    human_judgment: true
    rationale: "`window.print()` n'est pas exerçable en jsdom (ni Vitest ni Playwright ne prouvent la pagination papier). Vérification manuelle différée déclarée (VALIDATION.md « Manual-Only »)."

# Metrics
duration: ~40min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 04: La photo d'étape en cuisine et à l'impression — une seule résolution, deux surfaces

**Le mode cuisine rend la photo sous le texte de l'étape et la réduit une fois l'étape cochée, le modèle d'impression porte une URL résolue par étape (parallèle aux lignes, jamais un chemin de bucket) et la feuille CSS la borne sur le papier — prouvé par unité et par un parcours e2e en démo qui inclut le masquage de l'aperçu mort après rechargement.**

## Performance

- **Duration:** ~40 min (implémentation des 3 tâches + clôture : vérification de vague, SUMMARY, état)
- **Started:** 2026-10-16T13:43:00Z (approx., début de l'implémentation des tâches)
- **Completed:** 2026-10-16T14:23:26Z
- **Tasks:** 3
- **Files modified:** 8 (6 modifiés, 2 créés)

## Accomplishments

- **Mode cuisine (Task 1, tracer)** : `RecipeCuisineView` gagne `photoUrls?: Record<string, string | null>` (optionnel, défaut `{}` — la page invitée compile sans changement jusqu'à 21-03). Dans la ligne `<li>` de chaque étape, sous le paragraphe de contenu et dans le même conteneur `min-w-0 flex-1`, `StepPhoto` (21-01) rend l'image **seulement si l'URL est non nulle** — une étape sans photo ne rend ni trou ni cadre vide (D-10). Cochée, l'image est **réduite** (`className='max-h-[120px]'`, chaîne littérale) et non masquée (D-08). Le plein écran vit déjà dans `StepPhoto` (D-07), non redéveloppé. La fiche passe la carte `photoUrls` telle quelle à la vue : une seule résolution, deux surfaces.
- **Modèle d'impression (Task 2, tdd)** : `RecipePrintModel.stepPhotos: (string | null)[]` **parallèle** à `stepLines`, calculé par `toRecipePrintModel({ stepPhotoUrls })` en `args.steps.map((step) => args.stepPhotoUrls?.[step.id] ?? null)` — la fonction reste **pure et synchrone**. Le commentaire qui affirmait faussement que la photo n'entre jamais dans le modèle est corrigé. `recipe-export.css` borne `.recipe-print img` (`max-width:100%`, `max-height:120pt`, `object-fit:contain`) dans `@media print` — CSS seul (D-09). La fiche rend une `<img>` bornée sous chaque ligne numérotée du bloc `.recipe-print`, sans masquage `onError` (la ligne de texte reste la référence, D-09).
- **TDD RED→GREEN (Task 2)** : 6 preuves rouges d'abord (dont `stepPhotos` inexistant et le commentaire menteur), puis vertes après implémentation. L'assertion devenue fausse (`not.toContain('photo')`) est réécrite en assertions positives.
- **Parcours e2e démo (Task 3)** : nouveau `test.describe('Recettes — photos d’étapes (démo)')` — dépôt d'un tampon PNG 1×1 valide (70 octets) par `filechooser` + `setFiles`, `src` `blob:` sur la fiche **et** en cuisine, une `<img>` dans `.recipe-print`, puis rechargement → aperçu mort **masqué**, invitation « Ajouter une photo » de retour, étape nue sans média dans les deux modes.
- **Aucune dépendance ajoutée** ; `recipe-export.css` reste CSS seule ; aucune directive de linter introduite ; aucune suppression de fichier.

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1 : Mode cuisine — grande image sous le texte, réduite une fois l'étape cochée** (tracer) - `dfbc741` (feat)
2. **Task 2 : Impression — une URL par étape dans le modèle, une image bornée sur le papier** (auto, tdd) - `5e71238` (feat)
3. **Task 3 : Le parcours de bout en bout en démo, y compris l'aperçu mort après rechargement** (auto) - `acde763` (test)

**Plan metadata:** `skipped_gitignored` — `.planning/` est gitignoré (`.gitignore:74`), aucun commit de métadonnées n'est possible ni souhaité (jamais de `git add -f`).

_Note : la Task 2 est `tdd="true"`. Le cycle RED→GREEN a bien eu lieu (6 échecs attendus d'abord, puis verts après implémentation du modèle et du CSS)._

## Files Created/Modified

- `app/src/modules/recettes/components/recipe-cuisine-view.tsx` — prop `photoUrls` + rendu `StepPhoto` sous le texte, réduit une fois cochée (modifié)
- `app/src/modules/recettes/recette-detail-page.tsx` — carte `photoUrls` passée aux deux surfaces (`RecipeCuisineView` + `toRecipePrintModel`), `<img>` bornée sous chaque ligne du bloc `.recipe-print` (modifié)
- `app/src/modules/recettes/types.ts` — `RecipePrintModel.stepPhotos` parallèle + argument optionnel `stepPhotoUrls`, commentaire corrigé (modifié)
- `app/src/modules/recettes/components/recipe-export.css` — règle `.recipe-print img` bornée en `@media print`, en-tête corrigé (modifié)
- `app/src/modules/recettes/recipe-actions.test.ts` — assertions positives du modèle d'impression + `blob:`/nettoyage (modifié)
- `app/e2e/recettes.spec.ts` — nouveau describe « photos d'étapes (démo) » (modifié)
- `app/src/modules/recettes/recipe-cuisine-photo.test.tsx` — 5 preuves du rendu cuisine (créé)
- `app/src/modules/recettes/recette-detail-page.test.tsx` — 3 preuves fiche/impression/enfant (créé)

## Decisions Made

Toutes les décisions D-07…D-10 et T-21-05 du plan ont été appliquées à la lettre (voir `key-decisions` en frontmatter). Points notables :

- **Une seule résolution, deux surfaces** : la carte `photoUrls` construite en 21-01 alimente à la fois `RecipeCuisineView` et `toRecipePrintModel`. Aucune surface ne reçoit un chemin brut — c'est ce qui ferme T-21-05 par construction, pas par convention.
- **Le tableau parallèle rend l'alignement structurel** : `stepPhotos` se remplit par `map` sur la même source (`args.steps`) que `stepLines`, donc l'image se place sous sa propre ligne sans vérification manuelle d'index.
- **Réduction, pas masquage** (D-08) : `max-h-[120px]` littéral, `cn`/twMerge écrasant la base `max-h-[320px]` — aucun saut de mise en page au cochage.

## Deviations from Plan

### Auto-fixed Issues

Aucune déviation de code : le plan a été exécuté à la lettre.

### Écarts de chaîne (non-déviations de code)

- **`gsd_run` / `gsd-tools` absents de cet hôte** : les verbes `state.advance-plan`, `state.record-metric`, `roadmap.update-plan-progress`, `commit` et `windows.append` ne sont pas disponibles. STATE.md et ROADMAP.md sont mis à jour **manuellement** ; le commit de métadonnées est de toute façon `skipped_gitignored` (`.planning/` est gitignoré).
- **Le plan déclare `requirements: [R3, R5]` mais la Task 3 prouve R6** : R6 est déclaré par 21-01 (déjà exécuté) ; la Task 3 en est la preuve de bout en bout, sans re-réclamation d'identifiant (`requirements-completed: [R3, R5]` reste verbatim).

---

**Total deviations:** 0 auto-fixed (0 code) + 2 écarts de chaîne documentés
**Impact on plan:** Aucun écart de périmètre. Le code livré suit le plan à la lettre.

## Issues Encountered

Pièges de test rencontrés et résolus (sans déviation de code) :

- **Capter le nœud DOM vs sa `className`** : React réutilise le nœud, donc comparer l'élément capturé avant/après ne prouve rien — l'assertion porte sur la chaîne de classe (`toHaveClass`/`className`).
- **L'URL de photo se résout via une `useQuery` séparée** : il faut attendre (`findAllByRole` / `waitFor`) avant d'affirmer la présence de l'image.
- **`.recipe-print` est `aria-hidden="true"`** : `byRole` l'ignore ; le bloc d'impression est donc ciblé par sélecteur, puis on y cherche `img` en comptant exactement.
- **`URL.createObjectURL` absent de jsdom** : le test de dépôt démo réel le stubbe (`vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:apercu-etape') })`), avec `afterEach(() => vi.unstubAllGlobals())`.

Aucun problème bloquant. Les flakes de démarrage à froid notés en 21-01/21-02 ne se sont pas reproduits (e2e 20/20 au premier passage).

## User Setup Required

None - no external service configuration required. (Aucune dépendance ajoutée ; l'impression est CSS seule et la compression passe par l'API native déjà en place.)

## Next Phase Readiness

- **21-03** (surface invitée cliente) peut consommer `steps[].photoUrl` posé par 21-02 : il reste à remplacer le `photoPath: null` de `guest-recipe-page.tsx` par la carte d'URLs et à aligner les fixtures. 21-03 dépend de 21-01 **et** 21-04 (déclaré) — les deux sont désormais exécutés.
- Le rendu écran (fiche + cuisine) et le modèle d'impression sont complets ; le papier reste une vérification manuelle déclarée (VALIDATION.md « Manual-Only »).
- Aucun bloqueur.

---

## Verification Chain (plan-level)

- `cd app && npx vitest run src/modules/recettes/recipe-cuisine-photo.test.tsx src/modules/recettes/recette-detail-page.test.tsx src/modules/recettes/recipe-actions.test.ts` — **vert** (16/16).
- `cd app && npx playwright test e2e/recettes.spec.ts` — **vert** (20/20, chromium + mobile, au premier passage).
- `cd app && npm run typecheck` — **vert** (`tsc --noEmit`, aucune sortie).
- `cd app && npm test` — **vert** (147 fichiers, 1247 tests).
- `cd app && npm run build` — **vert** (PWA `injectManifest`).
- Aucune dépendance ajoutée (`package.json` inchangé) ; `recipe-export.css` reste CSS seule.
- Aucune directive de linter introduite (`grep -rn eslint-disable app/src/modules/recettes/` vide) et **aucune suppression de fichier** (`git diff --diff-filter=D d167e58..HEAD` vide).
- Vérification manuelle différée (VALIDATION.md, « Manual-Only ») : ouvrir la fiche, `window.print()`, vérifier que l'image sort sous sa ligne numérotée et que la recette tient sur une page.

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*

---

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `app/src/modules/recettes/recipe-cuisine-photo.test.tsx`, `app/src/modules/recettes/recette-detail-page.test.tsx`, `21-04-SUMMARY.md`.
- Fichiers modifiés vérifiés présents : `recipe-cuisine-view.tsx`, `recipe-export.css`, `recette-detail-page.tsx`, `types.ts`, `recipe-actions.test.ts`, `app/e2e/recettes.spec.ts`.
- Commits vérifiés présents : `dfbc741` (feat), `5e71238` (feat), `acde763` (test).
- `commits` mesuré par ledger (`git rev-list --count d167e58..HEAD` = 3), `plan_head_before`/`plan_head_after` écrits.
- Commit de métadonnées : `skipped_gitignored` (`.planning/` est dans `.gitignore:74`) — chemin de succès intentionnel, aucun `git add -f`.
