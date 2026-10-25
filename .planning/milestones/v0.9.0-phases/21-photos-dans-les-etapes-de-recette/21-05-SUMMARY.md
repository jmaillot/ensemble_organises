---
phase: 21-photos-dans-les-etapes-de-recette
plan: 05
subsystem: recettes / données (contrat SQL + bornage de valeur + robustesse client)
tags: [postgres, rls, check-constraint, sql-test, react, vitest, playwright, blob-url, recipe-steps]

# Dependency graph
requires:
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-01 — colonne `recipe_steps.photo_path` (migration 0125), helpers Storage (`storedValueOf`, `householdMediaPathOf`, `replacedMediaPath`), `uploadRecipeStepPhoto`/`replaceRecipeStepPhoto`/`clearRecipeStepPhoto`/`writeStepPhoto`, `step-photo.tsx` (masquage `onError` démo) ; 21-02 — Edge `recipe-invite` (signature service-role) ; 21-04 — parcours e2e démo de la photo d'étape"
  - phase: 16-recettes
    provides: "Suite SQL `0001_schema_contract.sql` (contrat de colonnes par table) et le motif de test `testkit` (`_setup.sql`) utilisé par le nouveau test 0126"
provides:
  - "supabase/tests/0001_schema_contract.sql — `'photo_path'` ajouté au tableau attendu de `recipe_steps` (la comparaison est insensible à l'ordre) : la suite SQL complète redevient verte (régression 21-01 fermée)"
  - "supabase/migrations/0126_recipe_step_photos_household.sql — contrainte `recipe_steps_photo_path_household` : `check (photo_path is null or starts_with(photo_path, household_id || '/'))` + commentaire de raison ; correction VERS L'AVANT, `0125` (appliquée) jamais réécrite"
  - "supabase/tests/0126_recipe_step_photos_household.sql — preuve sur quatre cas (chemin du foyer accepté en update ET insert, chemin étranger refusé, `null` accepté, valeur précédente conservée après un refus), chaque assertion bornée à son foyer"
  - "app/src/modules/recettes/api.ts — `writeStepPhoto` rend si l'écriture a atterri ; `replaceRecipeStepPhoto`/`clearRecipeStepPhoto` ne retirent l'objet PRÉCÉDENT que si l'écriture est passée, et `replace` nettoie l'objet NEUF sinon (CR-01) ; `isRecipeCoverPath` supprimé, `recipeCoverPathOf`/`resolveRecipeCoverUrl` passent par `isHouseholdMediaPath` (IN-03)"
  - "app/src/modules/recettes/components/recipe-steps.tsx — « Retirer la photo » suit l'image RENDUE (`step.photoPath && props.photoUrl`) (IN-01)"
  - "app/src/modules/recettes/components/step-photo.tsx — l'ajustement pendant le rendu retombe à `open=false`, donc le plein écran ne se rouvre plus après la mort de l'aperçu (IN-02)"
  - "app/src/types/database.ts — le commentaire de `photo_path` dit le vrai préfixe (`<householdId>/recipes/<recipeId>/steps/<stepId>/<fichier>.<ext>`) (IN-04)"
  - "app/e2e/recettes.spec.ts — l'aperçu `blob:` est RÉVOQUÉ avant `page.reload()` (masquage déterministe, régression 21-04 fermée) ; les helpers `addStep`/`seedTwoSteps` attendent le champ vidé avant la saisie suivante (course fermée)"
affects: []

# Actuals (#2632) — pair with the plan's `estimate` (20k tokens / 3 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff = `git diff <base>..HEAD | wc -c` / 4), never a harness token count.
actuals:
  tokens: 6682
  tasks: 3
  commits: 4
  plan_head_before: 3645c3b0dcf24b96f9b2d952adc8c2cb1ccb5694
  plan_head_after: 75850b1684a8c65a7d73a0b3ac437b7bf061dcf6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un `check` qui borne une valeur écrite par un membre au foyer de sa LIGNE s'appuie sur la dénormalisation posée par un déclencheur (`recipe_steps.household_id` ← recette via `private.align_child_household`, 0122) — les déclencheurs BEFORE s'exécutent avant les contraintes, donc la contrainte peut s'y fier sans supposer la valeur"
    - "Le prédicat d'un préfixe de foyer se dit avec `starts_with(photo_path, household_id || '/')`, jamais `like household_id || '/%'` : `household_id` est un texte `household_<uuid>` qui CONTIENT un `_`, un métacaractère `like` (voir déviation Rule 1 ci-dessous)"
    - "Une écriture dont l'issue décide d'un nettoyage destructif rend un BOOLÉEN d'atterrissage, plutôt qu'un no-op muet : le motif d'erreur (« zéro ligne » vs « ligne disparue ») est indistinguable côté adaptateur, mais le fait « ça n'a pas atterri » suffit à interdire le retrait (CR-01)"
    - "Un test e2e qui dépend d'un aperçu `blob:` MORT après rechargement doit RÉVOQUER l'URL (`URL.revokeObjectURL`) : Chromium garde le magasin vivant à travers un rechargement, donc la prémisse « mort après reload » n'est vraie que si on la provoque"
    - "Un helper e2e qui enchaîne deux saisies attend que le champ soit VIDÉ avant la suivante, quand le composant remet son brouillon à zéro APRÈS un `await` — sinon la remise à zéro efface la saisie suivante"

key-files:
  created:
    - supabase/migrations/0126_recipe_step_photos_household.sql
    - supabase/tests/0126_recipe_step_photos_household.sql
  modified:
    - supabase/tests/0001_schema_contract.sql
    - app/src/modules/recettes/api.ts
    - app/src/modules/recettes/components/recipe-steps.tsx
    - app/src/modules/recettes/components/step-photo.tsx
    - app/src/types/database.ts
    - app/src/modules/recettes/recipe-step-photo.test.ts
    - app/src/modules/recettes/recipe-steps.test.tsx
    - app/e2e/recettes.spec.ts

key-decisions:
  - "Le `check` s'écrit `starts_with(photo_path, household_id || '/')`, PAS `like household_id || '/%'` comme le proposaient le plan et la revue : la prémisse « `household_id` est un uuid, aucun `_` ne peut s'y trouver » est FAUSSE — `household_id` est un texte `household_<uuid>` (`private.new_id('household')`, 0001:36-43) et contient un `_`, métacaractère `like` qui matcherait un caractère quelconque. `starts_with` compare un préfixe LITTÉRAL, sans métacaractère."
  - "La contrainte ferme la CLASSE WR-01a à l'écriture (T-21-06) : un membre ne peut plus persister le chemin d'un objet d'un autre foyer, donc l'Edge `recipe-invite` (service-role) ne peut plus signer qu'un objet du foyer de la recette. La variante WR-01b (`http(s)://` arbitraire, T-21-08) est fermée pour les étapes par la même contrainte."
  - "CR-01 (T-21-07) : `writeStepPhoto` rend `true`/`false` (atterrissage) ; les appelants conditionnent le nettoyage destructif. Quand l'écriture n'atterrit pas, la ligne peut encore référencer `previous`, donc retirer l'ancien détruirait une photo encore affichée — on retire seulement l'objet NEUF (orphelin sinon)."
  - "IN-03 (D-01) : un seul prédicat de forme de média fait foi. `isRecipeCoverPath` (copie plus lâche, `https?:` sans `//`) est supprimé ; `recipeCoverPathOf`/`resolveRecipeCoverUrl` passent par `isHouseholdMediaPath`. Aucun test ne dépendait du comportement plus lâche (vérifié : `recipe-cover.test.ts` n'utilise que `blob:`, `https://` et `null`) — donc pas de checkpoint."
  - "Task 1 est `type=\"tracer\"` : la tranche mince (colonne au contrat + contrainte bornante + preuve SQL) a été prouvée bout en bout (`check-sql-statique.py` + suite SQL complète) AVANT l'expansion ; `<verify>` est automated-only et le mode auto est OFF, donc pas de checkpoint (re-exécution du verify, vert)."

patterns-established:
  - "Le motif du préfixe littéral pour borner un chemin au foyer (`starts_with`, jamais `like`) est réutilisable par tout `check` futur sur `photo_path`/`cover_url`/`photo_url`"
  - "Un test SQL en rôle `postgres` (RLS court-circuitée) borne CHAQUE assertion à son foyer/étape, jamais un total nu (AGENTS.md §2.7 D.2)"

requirements-completed: [R4, R5, R6]  # Copié verbatim de `requirements:` du PLAN. Aucun REQUIREMENTS.md dans ce dépôt, donc aucune case à cocher.

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Le contrat de schéma connaît `recipe_steps.photo_path` : la suite SQL COMPLÈTE (`sh scripts/test-db.sh`, 63 fichiers) est verte, `0001_schema_contract.sql` inclus (régression 21-01 fermée)."
    verification:
      - kind: integration
        ref: "supabase/tests/0001_schema_contract.sql (contrat de colonnes) — `sh scripts/test-db.sh` : 63/63 verts"
        status: pass
    human_judgment: false
  - id: D2
    description: "`recipe_steps.photo_path` ne peut désigner qu'un objet du foyer de la ligne : un chemin d'un autre foyer est refusé par la contrainte `recipe_steps_photo_path_household` (violation de contrainte, update ET insert), `null` et un chemin du foyer sont acceptés, la valeur précédente survit à un refus (WR-01a, T-21-06, R4)."
    requirement: "R4"
    verification:
      - kind: integration
        ref: "supabase/tests/0126_recipe_step_photos_household.sql (quatre cas, chaque assertion bornée à son foyer ; refus prouvés par `testkit.expect_denied`)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Le nettoyage destructif est conditionné à l'atterrissage de l'écriture : quand `photo_path` n'est pas écrit, `replaceRecipeStepPhoto` ne retire PAS l'objet précédent et retire l'objet neuf ; `clearRecipeStepPhoto` ne retire PAS l'objet précédent ; quand l'écriture atterrit, le comportement reste inchangé (CR-01, T-21-07, R5)."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#CR-01 (écriture non atterrie : ancien conservé, neuf nettoyé) + remplacement/retrait inchangés"
        status: pass
    human_judgment: false
  - id: D4
    description: "La commande « Retirer la photo » suit l'image RENDUE (`step.photoPath && props.photoUrl`) : pas de bouton de retrait pour une étape dont l'image n'est pas rendue (IN-01)."
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-steps.test.tsx#ne rend pas « Retirer la photo » pour une étape dont l'image n'est pas rendue"
        status: pass
    human_judgment: false
  - id: D5
    description: "L'état du plein écran ne survit plus à la mort de l'aperçu : une URL neuve ne rouvre pas le dialogue sans geste (IN-02)."
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-step-photo.test.ts#le plein écran ne se rouvre pas après la mort de l'aperçu (IN-02)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Un seul prédicat de forme de média subsiste (`isHouseholdMediaPath`) : `isRecipeCoverPath` est supprimé et `recipeCoverPathOf`/`resolveRecipeCoverUrl` passent par le prédicat unique (IN-03, D-01)."
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-cover.test.ts#distingue chemin bucket et URL + app/src/modules/recettes/recipe-step-photo.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Le commentaire de `photo_path` (`app/src/types/database.ts`) dit le vrai préfixe `<householdId>/recipes/<recipeId>/steps/<stepId>/<fichier>.<ext>` et non `recipes/<id>/steps/…` (IN-04)."
    verification: []
    human_judgment: true
    rationale: "L'exactitude d'un commentaire n'est pas vérifiable automatiquement ; le vérificateur confronte le commentaire à `api.ts:328` → `storage.ts:140` (préfixe de foyer)."
  - id: D8
    description: "Le parcours e2e de l'aperçu mort est déterministe : l'URL `blob:` est révoquée avant rechargement, l'image est masquée, l'invitation d'ajout revient — vert sur 4 répétitions × 2 projets (régression 21-04 fermée, R6)."
    requirement: "R6"
    verification:
      - kind: e2e
        ref: "playwright:app/e2e/recettes.spec.ts#Recettes — photos d’étapes (démo) — `npx playwright test e2e/recettes.spec.ts --repeat-each=4` : 80/80"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 05: Fermeture des écarts — contrat de schéma, bornage de la photo d'étape au foyer, nettoyage conditionné et e2e déterministe

**La colonne `photo_path` entre dans le contrat de schéma (suite SQL complète verte), une contrainte `check` borne la valeur au foyer de la ligne (WR-01a fermée), le nettoyage destructif devient conditionné à l'atterrissage de l'écriture (CR-01 fermé), les commandes d'édition s'accordent et l'e2e de l'aperçu mort devient déterministe par révocation explicite de l'URL `blob:` (régression 21-04 fermée).**

## Performance

- **Duration:** ~20 min (3 tâches : tracer SQL, TDD client, e2e)
- **Started:** 2026-10-16T15:32:52Z
- **Completed:** 2026-10-16T15:52:55Z
- **Tasks:** 3
- **Files modified:** 10 (2 créés, 8 modifiés)

## Accomplishments

- **Task 1 (tracer) — le contrat et le bornage** : `'photo_path'` ajouté au tableau attendu de `recipe_steps` dans `0001_schema_contract.sql` (régression 21-01 fermée : `sh scripts/test-db.sh` repasse à 63/63 verts). Nouvelle migration `0126_recipe_step_photos_household.sql` (correction vers l'avant, `0125` appliquée jamais réécrite) posant `check (photo_path is null or starts_with(photo_path, household_id || '/'))` : un membre ne peut plus persister le chemin d'un objet d'un autre foyer, donc l'Edge `recipe-invite` (service-role) ne peut plus signer qu'un objet du foyer de la recette (WR-01a/T-21-06). Preuve SQL `0126` sur quatre cas, chaque assertion bornée à son foyer.
- **Task 2 (tdd) — la robustesse client** : RED (4 tests rouges) puis GREEN. `writeStepPhoto` rend un booléen d'atterrissage ; `replaceRecipeStepPhoto`/`clearRecipeStepPhoto` ne retirent l'objet précédent que si l'écriture est passée, et `replace` nettoie l'objet neuf sinon — aucune photo encore référencée n'est détruite (CR-01/T-21-07). « Retirer la photo » suit l'image rendue (IN-01) ; le plein écran retombe à fermé quand une URL neuve arrive après la mort de l'aperçu (IN-02) ; `isRecipeCoverPath` supprimé au profit du prédicat unique `isHouseholdMediaPath` (IN-03) ; le commentaire de colonne dit le vrai préfixe (IN-04).
- **Task 3 — l'e2e déterministe** : l'aperçu `blob:` est révoqué (`URL.revokeObjectURL`) juste avant `page.reload()`, car Chromium garde le magasin vivant à travers un rechargement (sonde : 5/6) — la révocation est ce qui rend la prémisse « aperçu mort » vraie et le masquage déterministe (régression 21-04 fermée). Vérifié : `--repeat-each=4` → **80/80** (4 × 10 tests × chromium/mobile).
- **Aucune dépendance ajoutée**, aucune directive de linter introduite, aucune suppression de fichier.

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1 : Le contrat de schéma à jour et la photo d'étape bornée à son foyer** (tracer) - `22dd47b` (feat)
2. **Task 2 : Le nettoyage conditionné à l'écriture et l'accord des commandes d'édition** (auto, tdd) - `c10a601` (test, RED) → `3bb2e45` (feat, GREEN)
3. **Task 3 : L'aperçu mort prouvé de façon déterministe** (auto) - `75850b1` (fix)

**Plan metadata:** `skipped_gitignored` — `.planning/` est gitignoré (`.gitignore:74`), aucun commit de métadonnées n'est possible ni souhaité (jamais de `git add -f`).

_Note : la Task 2 est `tdd="true"`. Le cycle RED→GREEN a bien eu lieu (4 tests rouges d'abord — 2 CR-01, IN-01, IN-02 — puis verts après implémentation)._

## Files Created/Modified

- `supabase/tests/0001_schema_contract.sql` — `'photo_path'` ajouté au tableau attendu de `recipe_steps` (modifié)
- `supabase/migrations/0126_recipe_step_photos_household.sql` — contrainte `recipe_steps_photo_path_household` + commentaire de raison (créé)
- `supabase/tests/0126_recipe_step_photos_household.sql` — preuve sur quatre cas, bornée par foyer (créé)
- `app/src/modules/recettes/api.ts` — `writeStepPhoto` booléen ; nettoyage conditionné ; `isRecipeCoverPath` supprimé (modifié)
- `app/src/modules/recettes/components/recipe-steps.tsx` — bouton de retrait gated sur l'image rendue (modifié)
- `app/src/modules/recettes/components/step-photo.tsx` — `setOpen(false)` dans l'ajustement de rendu (modifié)
- `app/src/types/database.ts` — commentaire de `photo_path` corrigé (modifié)
- `app/src/modules/recettes/recipe-step-photo.test.ts` — CR-01 (×2) + IN-02 (modifié)
- `app/src/modules/recettes/recipe-steps.test.tsx` — IN-01 (modifié)
- `app/e2e/recettes.spec.ts` — révocation de l'aperçu + helpers sans course (modifié)

## Decisions Made

Toutes les décisions du plan ont été appliquées, à une exception près (le motif du `check`, voir déviation Rule 1). Points notables (voir `key-decisions` en frontmatter) :

- **Le préfixe littéral, pas le `like`** : le plan et la revue proposaient `like household_id || '/%'` en justifiant que `household_id` est un uuid sans `_`. C'est FAUX — `household_id` est `household_<uuid>` et contient un `_`. `starts_with` dit exactement ce que la contrainte veut dire, sans métacaractère.
- **Un booléen d'atterrissage, pas un motif d'erreur** : « zéro ligne écrite » et « ligne disparue » sont indistinguables côté adaptateur ; le fait « ça n'a pas atterri » suffit à interdire le retrait destructif.
- **Révocation explicite de l'aperçu** : la prémisse « un `blob:` meurt au rechargement » n'est pas fiable sous Chromium ; on la rend vraie.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Le motif de la contrainte est `starts_with`, pas `like`**

- **Found during:** Task 1 (migration `0126`)
- **Issue:** Le plan (ligne 104) et `21-REVIEW.md` proposaient `check (photo_path is null or photo_path like household_id || '/%')`, en justifiant que « `household_id` est un uuid (hexadécimal et tirets) : aucun caractère `%` ni `_` ne peut s'y trouver ». Vérification faite : `household_id` est un TEXTE de la forme `household_<uuid>` (`private.new_id('household')`, `0001_foundations.sql:36-43`) — il CONTIENT un `_`, métacaractère `like` qui matche un caractère quelconque. Le `like` aurait donc accepté un préfixe légèrement différent (`householdX<uuid>/…`), affaiblissant la borne.
- **Fix:** La contrainte s'écrit `check (photo_path is null or starts_with(photo_path, household_id || '/'))` — préfixe LITTÉRAL, sans métacaractère. La justification fausse est corrigée dans l'en-tête de la migration.
- **Files modified:** `supabase/migrations/0126_recipe_step_photos_household.sql`
- **Verification:** La preuve SQL `0126` (cas (b) : chemin d'un autre foyer refusé) est verte ; `check-sql-statique.py` vert ; suite SQL complète verte.
- **Committed in:** `22dd47b` (Task 1 commit)

**2. [Rule 1 - Bug] Course dans les helpers e2e `addStep`/`seedTwoSteps`**

- **Found during:** Task 3 (`--repeat-each=4` sur la spec complète)
- **Issue:** `submitAdd` (`recipe-steps.tsx`) remet le brouillon à vide APRÈS l'`await onAdd` : un remplissage suivant pouvait être effacé par cette remise à zéro, laissant le bouton « Ajouter une étape » désactivé (échec mesuré : « element is not enabled », 10/80 sous charge). Ce défaut est pré-existant (il frappe aussi le test « mode cuisine »), mais il bloque la vérification exigée (`--repeat-each=4` vert sur les deux projets).
- **Fix:** `addStep`/`seedTwoSteps` attendent `expect(input).toHaveValue('')` avant la saisie suivante — la remise à zéro est absorbée avant que la saisie suivante ne commence.
- **Files modified:** `app/e2e/recettes.spec.ts`
- **Verification:** `npx playwright test e2e/recettes.spec.ts --repeat-each=4` → 80/80 verts.
- **Committed in:** `75850b1` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1)
**Impact on plan:** Les deux auto-corrections sont nécessaires (la première pour que la borne soit réellement fermante, la seconde pour que la vérification exigée soit verte). Aucun écart de périmètre : les deux restent dans les fichiers du plan.

## Issues Encountered

- **`sh scripts/test-db.sh` n'applique pas les migrations** : `0126` a été appliquée d'abord par `sh scripts/migrate.sh` (1 appliquée, 125 déjà connues), puis la suite complète a tourné. Aucun problème bloquant.
- **`--repeat-each=4` sur toute la spec** exécute aussi les tests « mode cuisine » (qui partagent `seedTwoSteps`) : c'est là qu'a été révélée la course du helper, fermée en Task 3.

## User Setup Required

None - no external service configuration required. (Aucune dépendance ajoutée ; la contrainte est une migration, la révocation est une API navigateur native.)

## Next Phase Readiness

- Les deux régressions suivies (`deferred-items.md`) sont fermées : le contrat de schéma connaît `photo_path`, et l'e2e de l'aperçu mort est déterministe.
- Les deux constats de la revue (`21-REVIEW.md`) sont fermés : CR-01 (perte de photo) et WR-01 (signature inter-foyers pour les étapes).
- La phase 21 peut être vérifiée verte : chaîne §2.7 complète (typecheck, Vitest, build, e2e, contrôle statique, suite SQL) au vert.
- Résidu suivi (hors périmètre 21) : la variante `recipes.cover_photo` de WR-01b (couverture de recette) reste une dette déclarée, non muette.

---

## Verification Chain (plan-level)

- `python3 scripts/check-sql-statique.py` — **vert** (0 défaut, 181 fonctions effectives / 126 migrations / 65 tests).
- `sh scripts/test-db.sh` — **vert** (63 fichiers, `0001_schema_contract.sql` et `0126` inclus).
- `cd app && npx vitest run src/modules/recettes/recipe-step-photo.test.ts src/modules/recettes/recipe-steps.test.tsx src/modules/recettes/recipe-actions.test.ts src/modules/recettes/recette-detail-page.test.tsx` — **vert** (41/41).
- `cd app && npm run typecheck` — **vert** (`tsc --noEmit`, aucune sortie).
- `cd app && npm test` — **vert** (147 fichiers, 1256 tests).
- `cd app && npm run build` — **vert** (PWA `injectManifest`).
- `cd app && npx playwright test e2e/recettes.spec.ts --repeat-each=4` — **vert** (80/80, chromium + mobile).
- Aucune migration appliquée réécrite (`0125` intacte, correction dans `0126`).
- Aucune directive de linter introduite et **aucune suppression de fichier** (`git diff --diff-filter=D 3645c3b..HEAD` vide).
- Vérification manuelle différée (inchangée) : Edge déployée non testée par une chaîne (pas de `deno`), l'impression reste `window.print()` manuel.

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*

---

## Self-Check: PASSED

- Fichiers créés vérifiés présents : `supabase/migrations/0126_recipe_step_photos_household.sql`, `supabase/tests/0126_recipe_step_photos_household.sql`, `21-05-SUMMARY.md`.
- Fichiers modifiés vérifiés présents : `0001_schema_contract.sql`, `api.ts`, `recipe-steps.tsx`, `step-photo.tsx`, `database.ts`, `recipe-step-photo.test.ts`, `recipe-steps.test.tsx`, `app/e2e/recettes.spec.ts`.
- Commits vérifiés présents : `22dd47b` (feat), `c10a601` (test), `3bb2e45` (feat), `75850b1` (fix).
- `commits` mesuré par ledger (`git rev-list --count 3645c3b..HEAD` = 4), `plan_head_before`/`plan_head_after` écrits.
- Commit de métadonnées : `skipped_gitignored` (`.planning/` est dans `.gitignore:74`) — chemin de succès intentionnel, aucun `git add -f`.
