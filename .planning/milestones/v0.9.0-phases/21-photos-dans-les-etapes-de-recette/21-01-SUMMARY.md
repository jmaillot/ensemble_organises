---
phase: 21-photos-dans-les-etapes-de-recette
plan: 01
subsystem: recettes / média du foyer
tags: [supabase, storage, rls, react, vitest, dexie, migration, postgres]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "storedValueOf / resolveHouseholdMediaUrl / replacedMediaPath / householdMediaPathOf — doctrine « chemin de bucket en colonne, URL signée à la lecture » (D-01)"
  - phase: 16-recettes
    provides: "recipe_steps et ses quatre politiques RLS (0122:305-344, écriture sur can_write_household), le motif cover_photo et le bucket privé household-media"
provides:
  - "recipe_steps.photo_path (colonne text nullable) + view_recipe_share recréée rendant la clé photo_path brute par étape"
  - "uploadRecipeStepPhoto / resolveRecipeStepPhotoUrl / resolveRecipeStepPhotoUrls — dépôt et résolution de la photo d'étape"
  - "replaceRecipeStepPhoto / clearRecipeStepPhoto / writeStepPhoto gardé — remplacement qui nettoie l'objet précédent sans annuler la nouvelle photo"
  - "deleteRecipeStep(id, photoPath) et deleteRecipe(…, stepPhotoPaths) — nettoyage Storage piloté client, exhaustif"
  - "StepPhoto / StepPhotoDialog — image pleine largeur, plein écran au tap, affordances ajout/modif/retrait, aperçu démo mort masqué"
affects: [21-02, 21-03, 21-04]

# Actuals (#2632) — pair with the plan's `estimate` (36k tokens / 3 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 16097
  tasks: 3
  commits: 4
  plan_head_before: 2ff80856ca44795858cba848468c68bba5c97457
  plan_head_after: d325a03b1f9d7c425e89420d979b81dcd60b64fc

tech-stack:
  added: []
  patterns:
    - "Nettoyage d'objet best-effort JOURNALISÉ (console.warn « Objet de média non retiré du bucket : … ») — motif exact de notes/cercle/animaux, jamais un .catch muet"
    - "Écriture gardée qui absorbe le DataError d'une ligne disparue (writeStepPhoto) — un succès muet est un échec inexpliqué (§2.7 F)"
    - "Jumeau de dialogue plein écran paramétré par une URL (step-photo-dialog.tsx), jamais une réutilisation inter-domaines du dialogue de fidélité"
    - "Aperçu démo mort masqué par onError, état local rejoué au changement d'url (ajustement pendant le rendu, sans effet)"

key-files:
  created:
    - supabase/migrations/0125_recipe_step_photos.sql
    - supabase/tests/0125_recipe_step_photos.sql
    - app/src/modules/recettes/components/step-photo.tsx
    - app/src/modules/recettes/components/step-photo-dialog.tsx
    - app/src/modules/recettes/recipe-step-photo.test.ts
  modified:
    - app/src/modules/recettes/api.ts
    - app/src/modules/recettes/types.ts
    - app/src/types/database.ts
    - app/src/modules/recettes/hooks/use-recettes.ts
    - app/src/modules/recettes/components/recipe-steps.tsx
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/guest-recipe-page.tsx
    - app/src/modules/recettes/recipe-steps.test.tsx
    - app/src/modules/recettes/recette-cuisine.test.tsx
    - app/src/modules/recettes/recipe-actions.test.ts
    - app/src/modules/recettes/use-screen-wake-lock.test.tsx

key-decisions:
  - "Une colonne, pas une table fille : recipe_steps.photo_path (cardinalité 1, motif cover_photo) — la table porte déjà ses quatre politiques, donc aucune politique nouvelle et la classe *_delete_admin ne peut pas être reproduite (D-01)"
  - "Le dépôt passe par depositHouseholdFile, dossier recipes/<recipeId>/steps/<stepId> : le premier segment reste le householdId, les politiques du bucket continuent de juger le foyer (D-02)"
  - "La colonne porte la valeur de colonne (storedValueOf), jamais l'URL — doctrine D-01 de la phase 19, critère négatif du SPEC (D-03)"
  - "Le nom de dépôt étant aléatoire, un remplacement produit toujours un chemin neuf ; replacedMediaPath rend l'ancien et le nettoyage s'applique, la garde « même chemin → ne rien supprimer » protège l'objet qu'on vient d'écrire (D-04)"
  - "Le SQL en cascade ne touche pas Storage : nettoyage client avec les chemins déjà connus ; un orphelin reste possible si la suppression échoue — limite acceptée, exhaustivité exigée et prouvée (D-05)"
  - "writeStepPhoto absorbe le DataError sans prédicat sur le texte du message : la forme de l'erreur dépend de l'adaptateur, la distinguer par motif serait une garde qui se périmerait en silence (B-2, D-05)"
  - "Une étape sans photo ne rend AUCUN élément média ; l'affordance d'ajout est une invitation discrète, invisible pour un enfant (D-10, D-11)"
  - "Avec photo : un seul bouton sous l'image ouvre le sélecteur (remplacement direct, sans confirmation), le retrait vit dans la barre d'actions secondaire avec confirmation inline (D-12…D-14)"
  - "Mode démo : même colonne, valeur blob: ; après rechargement l'aperçu est mort et masqué (onError), l'étape se rend comme sans photo avec l'invitation d'ajout disponible (D-18)"

patterns-established:
  - "Un remplacement de média ne relâche jamais la valeur neuve : dépôt committé d'abord, retrait de l'ancien objet ensuite, échec journalisé (jamais silencieux, jamais remontant)"
  - "Une écriture qui peut viser une ligne disparue écrit d'abord et absorbe le DataError — pas de lecture préalable d'existence, qui serait la course proscrite par adapter.ts"
  - "Un dialogue plein écran se dérive en jumeau paramétré par une URL plutôt que de réutiliser un dialogue lié à un autre domaine"

requirements-completed: [R1, R2, R3, R5, R6]

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "La colonne recipe_steps.photo_path existe et view_recipe_share la rend brute par étape ; un membre l'écrit, un enfant en est refusé (0 ligne / insert refusé) ; le dépôt Storage sous RLS est accepté au membre et refusé à l'enfant."
    requirement: "R1"
    verification:
      - kind: integration
        ref: "sh scripts/test-db.sh 0125 (supabase/tests/0125_recipe_step_photos.sql)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dépôt et résolution de la photo d'étape (uploadRecipeStepPhoto, resolveRecipeStepPhotoUrl(s)) : chemin de bucket en colonne, URL signée à la lecture, échec fermé, aperçu blob: rendu tel quel."
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#Photo d’étape (R1, D-02/D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Ajouter, remplacer et retirer la photo d'une étape : le remplacement retire l'objet précédent du bucket exactement une fois, un cas sans photo est un no-op, la suppression d'étape et de recette nettoient leurs objets même si l'un échoue, un dépôt après disparition ne lève pas et avertit."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#Photo d’étape — ajouter, remplacer, retirer (R1, R2, R5, D-04/D-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Le rendu sur la fiche membre : image pleine largeur sous le texte, plein écran au tap, invitation d'ajout sur une étape nue, bouton de modification sur une étape photographiée, retrait confirmé inline ; readOnly montre l'image sans aucune commande de photo."
    requirement: "R2"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-steps.test.tsx#Étapes recettes (R7, D-11, D-12)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Mode démo : un aperçu blob: mort après rechargement est masqué (onError), l'étape se rend comme sans photo avec l'invitation d'ajout."
    requirement: "R6"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#Photo d’étape — rendu et aperçu mort (R6, D-18)"
        status: pass
    human_judgment: false
  - id: D6
    description: "La colonne recipe_steps.photo_path ne porte jamais une URL signée : storedValueOf est le seul producteur, le verrou media-path-contract.test.ts reste vert sans modification."
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#en démo, le dépôt rend un blob: que la résolution laisse intact (D-18) + app/src/lib/media-path-contract.test.ts"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 01: La photo d'une étape — de la colonne au rendu, avec nettoyage de l'objet remplacé

**La fiche membre porte la photo d'une étape de bout en bout : colonne `recipe_steps.photo_path`, dépôt/remplacement qui nettoie l'objet précédent, retrait confirmé, plein écran, aperçu démo mort masqué, et un `enfant` qui voit sans commander.**

## Performance

- **Duration:** ~30 min (15:02 → 15:32 +02:00 ; 25 min de plan à l'écriture du SUMMARY, plus la chaîne de vérification plan-level)
- **Started:** 2026-10-16T13:02:37Z
- **Completed:** 2026-10-16T13:32:00Z
- **Tasks:** 3
- **Files modified:** 16 (5 créés, 11 modifiés)

## Accomplishments

- **SQL** : migration `0125` ajoute `recipe_steps.photo_path` (nullable, commentaire français nommant la doctrine) et recrée `view_recipe_share` **verbatim** depuis `0122:561-664` avec une seule addition (`'photo_path', st.photo_path` dans le jsonb d'étape). Aucune politique nouvelle — `recipe_steps` porte déjà ses quatre politiques (écriture sur `can_write_household`, jamais admin-seul). `0122_recettes_full.sql` **jamais retouchée**.
- **Preuves SQL** (`supabase/tests/0125`) : quatre preuves bornées par `testkit.fx` — membre écrit `photo_path` (1 ligne), `enfant` refusé (0 ligne / insert `expect_denied`), dépôt Storage sous RLS accepté au membre et refusé à l'enfant, le RPC rend la clé `photo_path` portant **le chemin brut** et jamais une forme `http…`.
- **API** : `uploadRecipeStepPhoto` (via `depositHouseholdFile` → `storedValueOf`), `resolveRecipeStepPhotoUrl(s)` (échec fermé, TTL du module), `replaceRecipeStepPhoto` / `clearRecipeStepPhoto` / `writeStepPhoto` gardé, `removeStepPhotoObject` **journalisé** ; `deleteRecipeStep(id, photoPath)` et `deleteRecipe(…, stepPhotoPaths)` tentent **tous** les objets.
- **Rendu** : `StepPhoto` (image pleine largeur sous le texte, plein écran au tap via `StepPhotoDialog`, affordance d'ajout sur étape nue, bouton de modification sur étape photographiée, `onError` masquant l'aperçu démo mort) ; `recipe-steps.tsx` câble les commandes et masque tout en `readOnly` ; le retrait passe par la confirmation inline (`pendingPhotoRemoval`, motif `pendingDelete`).
- **Câblage** : `recette-detail-page.tsx` transmet `step.photoPath` à la suppression d'étape et `steps.map(s => s.photoPath ?? null)` à la suppression de recette ; `onAddPhoto`/`onReplacePhoto`/`onRemovePhoto` passent par `guard()` puis `refreshChildren()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Une photo sur une étape — la colonne, le dépôt, le rendu sur la fiche** (tracer) - `4e79a2a` (feat)
2. **Task 2: Ajouter, remplacer, retirer** (TDD) :
   - RED — `3dcbe5f` (test) : les neuf cas d'ajout, remplacement et retrait (observé rouge : `replaceRecipeStepPhoto is not a function`, 9 échecs / 6 passés)
   - GREEN — `8abc13c` (feat) : l'implémentation
3. **Task 3: Mode démo — l'aperçu mort est masqué, l'enfant voit sans commander** - `d325a03` (feat)

**Plan metadata:** skipped — `.planning/` est gitignoré (`skipped_gitignored`), aucun commit de métadonnées n'est possible ni souhaité.

_Note: la Task 2 est TDD (RED `3dcbe5f` → GREEN `8abc13c`) ; le tracer de Task 1 a franchi sa porte de retour (re-exécution de `<verify>`, verte) avant l'expansion._

## Files Created/Modified

- `supabase/migrations/0125_recipe_step_photos.sql` — colonne `photo_path` + `view_recipe_share` recréée avec `photo_path` dans le jsonb d'étape (créé)
- `supabase/tests/0125_recipe_step_photos.sql` — RLS positive et négative, dépôt Storage, RPC rend la référence brute (créé)
- `app/src/modules/recettes/components/step-photo.tsx` — image pleine largeur, plein écran, affordances, masquage `onError` (créé)
- `app/src/modules/recettes/components/step-photo-dialog.tsx` — jumeau plein écran paramétré par une URL (créé)
- `app/src/modules/recettes/recipe-step-photo.test.ts` — résolution, dépôt, remplacement, nettoyage, mode démo (créé)
- `app/src/modules/recettes/api.ts` — dépôt/résolution/remplacement/retrait, nettoyage journalisé, écriture gardée (modifié)
- `app/src/modules/recettes/types.ts` — `RecipeStep.photoPath` (requis) + `toStep` (modifié)
- `app/src/types/database.ts` — `RecipeStepRow.photo_path?` (modifié)
- `app/src/modules/recettes/hooks/use-recettes.ts` — `removeRecipe(recipe, stepPhotoPaths?)` (modifié)
- `app/src/modules/recettes/components/recipe-steps.tsx` — affordances photo, retrait confirmé, `readOnly` (modifié)
- `app/src/modules/recettes/recette-detail-page.tsx` — câblage photo + nettoyage à la suppression (modifié)
- `app/src/modules/recettes/guest-recipe-page.tsx` — `photoPath: null` dans la projection invitée (stub 21-03) (modifié)
- `app/src/modules/recettes/recipe-steps.test.tsx` — fixtures + preuves de rendu, `readOnly`, retrait (modifié)
- `app/src/modules/recettes/recette-cuisine.test.tsx` — alignement `photoPath: null` (modifié)
- `app/src/modules/recettes/recipe-actions.test.ts` — alignement `photoPath: null` (modifié)
- `app/src/modules/recettes/use-screen-wake-lock.test.tsx` — alignement `photoPath: null` (modifié)

## Decisions Made

Toutes les décisions D-01…D-05, D-10…D-14 et D-18 du plan ont été appliquées à la lettre (voir `key-decisions` en frontmatter). Deux points méritent d'être notés :

- **Le nettoyage est journalisé, pas muet** : `removeStepPhotoObject` remplace tout `.catch(() => undefined)` muet par le motif exact de `notes`/`cercle`/`animaux` (`console.warn('Objet de média non retiré du bucket : …', error)`). La couverture de recette (`deleteRecipe`) conserve son comportement inchangé (best-effort silencieux), comme le plan l'exige.
- **`writeStepPhoto` absorbe le `DataError` sans prédicat de message** : l'étape visée peut avoir disparu (cascade ou autre session) ; au niveau de l'adaptateur, « zéro ligne » et un échec transitoire produisent le même `DataError`, donc aucun motif sur le texte n'est écrit — la garde se périmerait en silence. Aucune lecture préalable d'existence : décider après une lecture serait la course proscrite par `adapter.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Le `<verify>` du plan nomme un conteneur qui n'existe pas**
- **Found during:** Task 1 (`<verify>` du tracer)
- **Issue:** Le plan écrit `DB_CONTAINER=supabase-db sh scripts/test-db.sh 0125`. `scripts/test-db.sh` traite `DB_CONTAINER` comme un **nom de service Compose** ; la valeur `supabase-db` (nom de conteneur) échoue avec « service supabase-db is not running ». Le défaut du script, `db`, est la bonne valeur.
- **Fix:** Exécution avec le défaut (`sh scripts/test-db.sh 0125` → service `db`), vert. Aucun fichier modifié — correction d'invocation, pas de code.
- **Files modified:** aucun
- **Verification:** `sh scripts/test-db.sh 0125` → « OK 0125_recipe_step_photos.sql / Tests SQL : 1 fichier(s), tous verts. »
- **Committed in:** n/a (invocation)

### Écarts de chaîne (non-déviations de code)

- **`gsd_run` / `gsd-tools` absents de cet hôte** : les verbes `state.advance-plan`, `state.record-metric`, `roadmap.update-plan-progress`, `commit` et `windows.append` ne sont pas disponibles. STATE.md, ROADMAP.md et WINDOWS.md sont mis à jour **manuellement** ; le commit de métadonnées est de toute façon `skipped_gitignored` (`.planning/` est gitignoré — jamais de `git add -f`).
- **2 échecs e2e, préexistants/environnementaux, prouvés hors périmètre** : `recettes.spec.ts:56` et `recettes-switch-geometry.spec.ts:21` expirent dans le hook `beforeEach` (`openDemoSession` attend « Entrer dans la démonstration » sur `/connexion`), lors du run complet en parallèle. Rejoués seuls (`--project=chromium`) : **10/10 passés**. Ce sont des flakes de démarrage à froid, sans rapport avec la photo d'étape.

---

**Total deviations:** 1 auto-fixed (Rule 3) + 2 écarts de chaîne documentés
**Impact on plan:** Aucun écart de périmètre. Le code livré suit le plan à la lettre ; la déviation Rule 3 est une correction d'invocation (nom de service vs nom de conteneur).

## Issues Encountered

- **Flakes e2e au démarrage à froid** (voir ci-dessus) — résolus par rejeu ciblé, verts 10/10.
- **`test-db.sh` n'applique pas les migrations** : `0125` a été appliquée via `sh scripts/migrate.sh` avant le test (déjà fait en Task 1) ; le test rejoue ensuite la suite sur la base migrée.

## Known Stubs

- `app/src/modules/recettes/guest-recipe-page.tsx` (projection `steps`, `photoPath: null`) — **stub intentionnel** : la surface invitée ne porte pas encore de photo ; elle est livrée par **21-03** (page invitée cliente) et **21-02** (Edge `recipe-invite` signant `photoUrl`). Le plan de 21-01 exige explicitement ce `photoPath: null` pour que la page invitée compile sans changement. Enregistré dans `.planning/WINDOWS.md` (`kind: stub`, phase 21).

## User Setup Required

None - no external service configuration required. (Aucune nouvelle dépendance ; la compression passe par `createImageBitmap`/`canvas` déjà en place.)

## Next Phase Readiness

- **21-02** (Edge `recipe-invite`) peut consommer la clé `photo_path` rendue par `view_recipe_share` : contrat de données posé, l'Edge est fail-closed si la clé est absente.
- **21-03** (surface invitée cliente) peut remplacer le `photoPath: null` de `guest-recipe-page.tsx` par la carte d'URLs signées.
- **21-04** (mode cuisine + impression) dispose du point d'extension `className` de `StepPhoto` (hauteur réduite) et de `RecipeStep.photoPath` pour bâtir `RecipePrintModel.stepPhotos`.
- Aucun bloqueur. `npm run typecheck`, `npm test` (1223/1223), `npm run build`, `check-sql-statique` (0 défaut), `test-db.sh 0125` et e2e (119 passés, 2 flakes rejoués verts, 5 sautés) sont verts.

---

## Verification Chain (plan-level)

- `sh scripts/test-db.sh 0125` — **vert** (`OK 0125_recipe_step_photos.sql`).
- `python3 scripts/check-sql-statique.py` — **vert** (181 fonctions effectives, 0 défaut).
- `cd app && npm run typecheck && npm test && npm run build` — **vert** (typecheck OK ; Vitest **1223/1223** sur 144 fichiers ; build OK).
- `git diff --name-only 2ff8085..HEAD` ne contient **aucun** `supabase/migrations/0122_recettes_full.sql`.
- Aucune directive de linter introduite (`no-eslint-directive.test.ts` vert dans la suite) et **aucun fichier de test supprimé** (`git log --diff-filter=D` vide).
- `cd app && npx playwright test` — 119 passés / 5 sautés / 2 flakes (rejoués 10/10 verts).

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*

---

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `app/src/modules/recettes/components/step-photo.tsx`, `step-photo-dialog.tsx`, `recipe-step-photo.test.ts`, `supabase/migrations/0125_recipe_step_photos.sql`, `supabase/tests/0125_recipe_step_photos.sql`, `21-01-SUMMARY.md`.
- Commits vérifiés présents : `4e79a2a`, `3dcbe5f`, `8abc13c`, `d325a03`.
- `commits` mesuré par ledger (`git rev-list --count 2ff8085..HEAD` = 4), `plan_head_before`/`plan_head_after` écrits.
- Commit de métadonnées : `skipped_gitignored` (`.planning/` est dans `.gitignore:74`, aucun fichier `.planning/` suivi) — chemin de succès intentionnel, aucun `git add -f`.
