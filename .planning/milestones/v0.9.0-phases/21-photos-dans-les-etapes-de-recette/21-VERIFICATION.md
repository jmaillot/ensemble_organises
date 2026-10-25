---
phase: 21-photos-dans-les-etapes-de-recette
verified: 2026-10-16T16:39:45Z
status: passed
score: 31/31 must-haves verified
covered_files:
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-01-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-01-SUMMARY.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-02-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-02-SUMMARY.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-03-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-03-SUMMARY.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-04-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-04-SUMMARY.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-05-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-05-SUMMARY.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-06-PLAN.md
  - .planning/phases/21-photos-dans-les-etapes-de-recette/21-06-SUMMARY.md
  - app/e2e/recettes.spec.ts
  - app/src/modules/recettes/api.ts
  - app/src/modules/recettes/components/recipe-cuisine-view.tsx
  - app/src/modules/recettes/components/recipe-export.css
  - app/src/modules/recettes/components/recipe-steps.tsx
  - app/src/modules/recettes/components/step-photo-dialog.tsx
  - app/src/modules/recettes/components/step-photo.tsx
  - app/src/modules/recettes/guest-recipe-cuisine.test.tsx
  - app/src/modules/recettes/guest-recipe-page.test.tsx
  - app/src/modules/recettes/guest-recipe-page.tsx
  - app/src/modules/recettes/hooks/use-recettes.ts
  - app/src/modules/recettes/recette-cuisine-panel.test.tsx
  - app/src/modules/recettes/recette-cuisine.test.tsx
  - app/src/modules/recettes/recette-detail-page.test.tsx
  - app/src/modules/recettes/recette-detail-page.tsx
  - app/src/modules/recettes/recipe-actions.test.ts
  - app/src/modules/recettes/recipe-cuisine-photo.test.tsx
  - app/src/modules/recettes/recipe-step-photo.test.ts
  - app/src/modules/recettes/recipe-steps.test.tsx
  - app/src/modules/recettes/types.ts
  - app/src/modules/recettes/use-screen-wake-lock.test.tsx
  - app/src/types/database.ts
  - supabase/functions/recipe-invite/guest-steps.test.ts
  - supabase/functions/recipe-invite/guest-steps.ts
  - supabase/functions/recipe-invite/index.ts
  - supabase/migrations/0125_recipe_step_photos.sql
  - supabase/migrations/0126_recipe_step_photos_household.sql
  - supabase/tests/0001_schema_contract.sql
  - supabase/tests/0125_recipe_step_photos.sql
  - supabase/tests/0126_recipe_step_photos_household.sql
covered_digest: "v2:sha256:35ff3aee13fdb713472129b82b05116497fce00ceec15dbd9346dae932477828"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 31/31
  gaps_closed:
    - "R2 (partiel) — le cas négatif `enfant` du test SQL 0125 portait un chemin étranger, que la contrainte 0126 rejette aussi : l'assertion ne pouvait pas échouer pour la RLS seule. Clos par 21-06 (`b8db247`)."
    - "R5 (partiel) — le câblage de suppression au niveau PAGE n'était asserté qu'à la frontière `api` ; retirer l'argument compilait (défaut `stepPhotoPaths = []`) et restait vert. Clos par 21-06 (`d33b3a1`)."
  gaps_remaining: []
  regressions: []
---

# Phase 21: Photos dans les étapes de recette — Verification Report

**Phase Goal:** Une étape de recette peut porter une photo illustrative, affichée sur la fiche du foyer, dans le mode cuisine, sur le lien invité et à l'impression ; l'ajouter à une étape qui en a déjà une remplace la précédente et nettoie l'objet remplacé du bucket.

**Verified:** 2026-10-16T16:39:45Z (HEAD `d33b3a1`)
**Status:** passed
**Re-verification:** Yes — refresh triggered by a **stale `covered_digest` (#4682)**, not by a gap. The previous report (2026-10-16T16:08:44Z) recorded `covered_digest: v2:sha256:9c20f37…` over its `covered_files`, one of which (`app/src/modules/recettes/recette-detail-page.test.tsx`) changed afterwards under the test-only plan `21-06` (commits `b8db247`, `d33b3a1`). This pass re-computes the fingerprint over the current file set and re-confirms the product, which is **unchanged**.

> **Stale-digest note.** `git diff --name-only 75850b1..HEAD` returns exactly two files, both tests:
> `app/src/modules/recettes/recette-detail-page.test.tsx` and `supabase/tests/0125_recipe_step_photos.sql`.
> **No production file changed.** The 31 must-haves therefore rest on the same code as the previous
> pass; the two test files strengthen the *isolation* of two assertions (R2, R5) that the Nyquist
> audit had flagged PARTIAL.

---

## Goal Achievement

### Observable Truths

All truths come from the five original plans' `must_haves.truths` (merged, deduplicated). This pass
re-opened, against the code, the truths touched by `21-06` — **#4 (R2, SQL negative case)** and **#3/#25
(R5, deletion wiring)** — and re-confirmed the rest by re-running the phase's targeted suite (8 files,
73 tests) plus the two SQL files. The two truths below marked **(21-06)** are the gap-closure
assertions of plan `21-06`; they are evidence strengthening #4 and #3, listed separately so the
headline count stays comparable to the phase's 31 must-haves.

| # | Truth (plan) | Status | Evidence |
|---|--------------|--------|----------|
| 1 | Une étape porte au plus une photo : `recipe_steps.photo_path` unique par ligne (21-01, R1, D-01) | ✓ VERIFIED | `supabase/migrations/0125_recipe_step_photos.sql:17` (colonne `text` unique) ; `supabase/tests/0125_recipe_step_photos.sql:58-61` — test SQL vert (re-joué) |
| 2 | Ajouter sur une étape photographiée remplace la valeur et retire l'objet précédent ; même chemin → rien retiré ; dépôt committé d'abord ; retrait best-effort non silencieux (21-01, R1, D-04) | ✓ VERIFIED | `api.ts:417-431` (replace → `writeStepPhoto` → `removeStepPhotoObject(replacedMediaPath(...))`) ; `storage.ts:253-257` (`replacedMediaPath`) ; tests `recipe-step-photo.test.ts` (verts) |
| 3 | Retirer la photo, supprimer l'étape et supprimer la recette retirent chacun leurs objets ; cas sans photo = no-op ; `deleteRecipe` tente **tous** les objets même si l'un échoue (21-01, R5, D-05) | ✓ VERIFIED | `api.ts:226-229` (delete step), `246-255` (delete recipe, `Promise.all` + catch interne `372-380`), `441-445` (clear) ; **nouveau** test de niveau page `recette-detail-page.test.tsx:166-181` (R5, voir 21-06 ci-dessous) ; tests `recipe-step-photo.test.ts`, `recipe-actions.test.ts` |
| 4 | Un membre qui écrit voit « Ajouter/Modifier la photo » ; un `enfant` voit l'image et aucune commande (21-01, R2, D-11/D-12) | ✓ VERIFIED | `recipe-steps.tsx:315-323` (`onSelectPhoto` absent en `readOnly`), `354` (retrait gardé) ; `use-recettes.ts:78` (`canWrite = role !== 'enfant'`) ; SQL `0125:106-122` — **cas négatif désormais isolant** (21-06, voir ci-dessous) |
| 5 | Image pleine largeur sous le texte, plein écran au tap ; étape sans photo → aucun élément média (21-01, D-06/D-07/D-10) | ✓ VERIFIED | `step-photo.tsx:67-99` (img + `StepPhotoDialog`), `101-102` (`return null` sans URL) ; tests `recipe-step-photo.test.ts` |
| 6 | Mode démo : aperçu `blob:` mort masqué après rechargement, étape rendue comme sans photo, invitation d'ajout de retour (21-01, R6, D-18) | ✓ VERIFIED | `step-photo.tsx:33,80` (`onError → setDead`) ; tests `recipe-step-photo.test.ts` ; e2e `recettes.spec.ts:274-290` |
| 7 | (backstop) Deux membres ajoutent simultanément : le dernier écrit gagne, une seule référence subsiste (21-01, R2, B-1) | ✓ VERIFIED | test `recipe-step-photo.test.ts` (assertion sur la référence unique) |
| 8 | (backstop) Supprimer la recette pendant un dépôt en vol : pas de levée, aucune référence sur une étape disparue (21-01, R5, B-2) | ✓ VERIFIED | test `recipe-step-photo.test.ts` |
| 9 | La charge `link-view` porte `steps[].photoUrl` : URL signée 1 h ou `null` (21-02, R4, D-15/D-16) | ✓ VERIFIED | `guest-steps.ts:93-110` (`toGuestSteps`) ; `index.ts:472,484` ; tests `guest-steps.test.ts` |
| 10 | Un chemin brut de bucket ne quitte jamais l'Edge : la valeur signée **remplace** le chemin (21-02, T-21-02) | ✓ VERIFIED | `index.ts:470-472` (`steps` = résultat de `toGuestSteps`, aucun `photo_path` recopié) ; tests `guest-steps.test.ts` (`not.toHaveProperty('photo_path')`) |
| 11 | Échec de signature → `null`, sans erreur remontée ni journalisation du code/URL (21-02, R4) | ✓ VERIFIED | `guest-steps.ts:63-75` (`catch { return null }`, aucun log) ; tests `guest-steps.test.ts` |
| 12 | Un seul endroit signe et un seul endroit décide du TTL (21-02, D-16) | ✓ VERIFIED | `guest-steps.ts:23` (`GUEST_PHOTO_TTL_SECONDS = 3600`), `59-76` ; `index.ts:68` importe le module (aucune constante locale ni `resolveGuestCoverUrl`) ; test `guest-steps.test.ts` |
| 13 | Une étape dont le RPC ne rend pas `photo_path` rend `photoUrl: null` sans lever (21-02, R4 empty) | ✓ VERIFIED | `guest-steps.ts:26-30` (`asTextOrNull(undefined)` → `null`) ; test `guest-steps.test.ts` |
| 14 | La page invitée affiche la photo d'une étape, pleine largeur sous le texte, comme la fiche membre (21-03, R3, D-17) | ✓ VERIFIED | `guest-recipe-page.tsx:188-191` (`RecipeSteps` `readOnly` + `photoUrls`) ; test `guest-recipe-page.test.tsx` |
| 15 | `GuestRecipeStep.photoUrl` est requis (URL signée ou `null`) ; projection symétrique du handler Edge (21-03, R4, D-15) | ✓ VERIFIED | `api.ts:604-617` (champ non optionnel), `652-664` (`toGuestStep` lit `photoUrl`) ; `npm run typecheck` vert (chaîne §2.7) |
| 16 | Étape invitée sans photo → aucun média ; charge ne portant que `photo_path` → `photoUrl: null` (21-03, T-21-04) | ✓ VERIFIED | `api.ts:658-662` ; tests `guest-recipe-page.test.tsx` (le chemin brut n'apparaît dans aucun `src`) |
| 17 | Le mode cuisine invité reçoit la même carte d'URLs que la vue étapes (21-03, R3) | ✓ VERIFIED | `guest-recipe-page.tsx:90-91` (carte unique), `181-185` + `188-191` (les deux surfaces) |
| 18 | Mode cuisine : image grande sous le texte, réduite une fois l'étape cochée (21-04, R3, D-08) | ✓ VERIFIED | `recipe-cuisine-view.tsx:101-111` (`max-h-[120px]` si cochée) ; test `recipe-cuisine-photo.test.tsx` |
| 19 | Mode cuisine comme fiche : taper l'image ouvre le plein écran ; étape sans photo → aucun média (21-04, R3, D-07/D-10) | ✓ VERIFIED | `recipe-cuisine-view.tsx:101-111` (`StepPhoto` → dialogue) ; tests `recipe-cuisine-photo.test.tsx` |
| 20 | Le modèle d'impression porte une URL résolue par étape, parallèle à `stepLines` ; la ligne reste la référence (21-04, R3, D-09) | ✓ VERIFIED | `types.ts:241,276` (`stepPhotos[i]` aligné sur `stepLines[i]`) ; `recette-detail-page.tsx:131-139` ; tests `recipe-actions.test.ts`, `recette-detail-page.test.tsx` |
| 21 | La feuille d'impression borne la largeur/hauteur de l'image, CSS seul (21-04, R3, D-09) | ✓ VERIFIED | `recipe-export.css:59-63` (`max-width:100% ; max-height:120pt ; object-fit:contain`) |
| 22 | Le modèle d'impression ne porte jamais un chemin de bucket (21-04, T-21-05) | ✓ VERIFIED | `types.ts:253-276` (lit `stepPhotoUrls`, jamais `step.photoPath`) ; test `recipe-actions.test.ts` (`stepPhotos` = `[null]`, `foyer-1/` absent du modèle) |
| 23 | La suite SQL complète est verte : `0001_schema_contract.sql` connaît `photo_path` (21-05) | ✓ VERIFIED | `supabase/tests/0001_schema_contract.sql:52` (`'photo_path'` présent) ; `sh scripts/test-db.sh` 63/63 (orchestrateur) ; `0125`/`0126` re-joués verts par ce vérificateur |
| 24 | `photo_path` ne peut désigner qu'un objet du foyer de la ligne : contrainte, `null` accepté (21-05, WR-01a, R4) | ✓ VERIFIED | `supabase/migrations/0126_recipe_step_photos_household.sql:35-37` (`check … starts_with(photo_path, household_id \|\| '/')`) ; test `0126:82-94` (étranger refusé), `100-103` (null) — vert (re-joué) |
| 25 | Écriture non atterrie (`DataError` absorbé) → objet PRÉCÉDENT conservé, objet NEUF retiré (21-05, CR-01, R5) | ✓ VERIFIED | `api.ts:395-404` (rend `boolean`), `417-431` (`!landed` → retire `next`, pas `previous`), `441-445` (`!landed` → retour sans retrait) ; tests `recipe-step-photo.test.ts` |
| 26 | La commande de retrait et l'affordance s'accordent : pas de « ✕ Retirer » sans image rendue (21-05, IN-01) | ✓ VERIFIED | `recipe-steps.tsx:354` (`step.photoPath && props.photoUrl`) ; test `recipe-steps.test.tsx` |
| 27 | Le test e2e de l'aperçu mort est déterministe : l'URL `blob:` est révoquée avant rechargement (21-05, R6) | ✓ VERIFIED | `app/e2e/recettes.spec.ts:274-290` (`URL.revokeObjectURL` puis `page.reload()`) ; e2e vert (orchestrateur) |

### Gap-closure assertions (21-06) — both verified, both able to fail

The two assertions that the Nyquist audit (`21-VALIDATION.md`) flagged **PARTIAL** are now isolating.
They are refinements of truths #4 (R2) and #3 (R5); counted separately to keep the 31-must-have score
comparable, and **both green at HEAD**.

| # | Truth (21-06) | Status | Evidence |
|---|---------------|--------|----------|
| G1 | Le cas négatif `enfant` du test SQL 0125 échoue pour la SEULE raison annoncée — l'absence de `can_write_household` — et non parce qu'une contrainte de forme (0126) rejette une valeur étrangère (R2) | ✓ VERIFIED | `supabase/tests/0125_recipe_step_photos.sql:106-122` : la valeur écrite est désormais un **chemin du foyer** (`home_a/recipes/<recipe_r1>/steps/<step_r2>/photo.jpg`), même forme que le cas (a) positif `0125:70-76` ; `sh scripts/test-db.sh 0125` vert (re-joué). La contrainte `0126:35-37` (`starts_with(photo_path, household_id \|\| '/')`) est **satisfaite** par cette valeur, donc elle ne peut plus être la cause du refus. Voir « Isolation du cas `enfant` » ci-dessous. |
| G2 | Le câblage de suppression au niveau PAGE est asserté : retirer l'argument des chemins de photo à `recette-detail-page.tsx` rend un test rouge (R5) | ✓ VERIFIED | `app/src/modules/recettes/recette-detail-page.test.tsx:166-181` : espion partiel de `@/lib/storage` (`:18-25`) ; graine à chemin de bucket (`:75-98`) ; parcours « Supprimer la recette » → « Supprimer » ; `expect(removeHouseholdFileMock).toHaveBeenCalledWith(stepPath)`. `npx vitest run …recette-detail-page.test.tsx` → 4/4 vert (re-joué). Voir « Isolation du câblage de suppression » ci-dessous. |

### Prohibitions (must-NOT)

| # | Prohibition | Status | Evidence |
|---|-------------|--------|----------|
| P1 | MUST NOT persister une URL signée dans `recipe_steps.photo_path` — la valeur est un chemin de bucket, jamais `http(s)://` (21-01, R1, D-03 ; `verification: test`) | ✓ VERIFIED | `api.ts:324-334` (`storedValueOf`) ; `storage.ts:173-175` ; test `recipe-actions.test.ts` (chaîne réelle `uploadRecipeStepPhoto`→`storedValueOf`, `!/^https?:\/\//`) ; `media-path-contract.test.ts` (aucun `deposited.url` hors `storage.ts`) ; SQL `0125:174` (`photo_path !~ '^https?://'`) |
| P2 | Ne jamais réécrire une migration appliquée : `0125` corrigée VERS L'AVANT dans `0126` (21-05) | ✓ VERIFIED | `git log -- supabase/migrations/0125_…` → un seul commit (`4e79a2a`, 21-01) ; `0126` est une migration nouvelle (`22dd47b`, 21-05) |
| P3 | Ne pas ajouter de directive de linter (aucun linter configuré) (21-05) | ✓ VERIFIED | `grep -rn eslint-disable` sur les fichiers de la phase → 0 occurrence ; `app/src/lib/no-eslint-directive.test.ts` vert dans `npm test` |
| P4 | Ne pas signer côté Edge un préfixe de foyer : `guest-steps.ts` reste sans import Deno et sans accès au foyer (21-05) | ✓ VERIFIED | `guest-steps.ts` : aucun `import`/`require`/`npm:` (seulement des mentions en commentaires) ; le bornage de foyer est fait par la contrainte `0126`, pas par le signeur |

**Score:** 31/31 must-haves verified (27 truths + 4 prohibitions) · **+2 gap-closure assertions (G1, G2) both verified** · 0 behavior-unverified · 0 overrides

### Isolation du cas `enfant` (G1 / R2) — l'assertion peut échouer

**Le défaut, mesuré.** Avant `21-06`, le cas (b) écrivait un chemin **étranger** (`foyer-x/…`). Le test
tourne sur la base **entièrement migrée** : la contrainte `recipe_steps_photo_path_household`
(`0126:35-37`) rejette **aussi** un chemin d'un autre foyer. L'`insert` négatif (`expect_denied`) était
donc vert même si la RLS laissait passer l'`enfant` ; l'`update` (`affected = 0`) échouait pour la
mauvaise raison.

**La correction.** Le cas (b) porte désormais la **même forme de valeur** que le cas (a) positif
(`0125:106-122`) : `home_a/recipes/<recipe_r1>/steps/<step_r2>/photo.jpg`. Vérifié : la valeur satisfait
la contrainte (`starts_with('home_a/…', 'home_a' || '/')` → vrai, `0126:37`), donc la seule différence
entre le cas vert et le cas refusé est **le rôle**.

**Pourquoi la mutation peut la faire échouer (reproductible).** `private.can_write_household`
(`0006:77-85`) vaut `household_role in ('admin','membre')` — l'`enfant` est exclu ; `is_household_member`
(`0006:20-33`) l'inclut. Les politiques `recipe_steps_update_household` / `recipe_steps_insert_household`
sont générées en `0122:326-343` sur `can_write_household`. Élargir temporairement ces deux politiques à
`is_household_member` **dans la transaction du fichier de test** (annulée au `rollback`, jamais
committée — le SQL est donné verbatim en `21-06-SUMMARY.md:159-165`) fait passer l'`update` de 0 à 1
ligne : l'assertion `testkit.eq(..., 0::bigint, 'un enfant ne pose pas de photo sur une etape')` tombe
avec « attendu 0, obtenu 1 » (`21-06-SUMMARY.md:167-174`). L'`insert` négatif, lui, réussit alors sous
RLS et n'est plus refusé par la contrainte (valeur du foyer) → `expect_denied` lève. Le contraste
membre positif est `0125:70-76` (même forme, rôle `membre`, assertion `= 1`).

### Isolation du câblage de suppression (G2 / R5) — l'assertion peut échouer

**Le défaut.** `recette-detail-page.tsx:462-465` passe bien `steps.map((step) => step.photoPath ?? null)`,
mais `api.ts deleteRecipe(id, cover, stepPhotoPaths = [])` a un **défaut `[]`** (`api.ts:246-250`) :
retirer l'argument compile et laisse toute la suite verte, en orphelinant silencieusement chaque objet
d'étape. `recipe-step-photo.test.ts` ne couvrait que la frontière `api`.

**L'assertion.** `recette-detail-page.test.tsx:166-181` monte la page avec l'adaptateur démo et un
**espion partiel** de `@/lib/storage` (`vi.mock` + `importOriginal`, `:18-25`), sème une recette dont
l'étape porte un **chemin de bucket** (`:75-98`), déroule « Supprimer la recette » → « Supprimer », et
asserte que `removeHouseholdFile` reçoit le chemin de l'étape. Le trajet traversé est page →
`use-recettes.ts:243-246` (`removeRecipe`) → `api.ts:246-255` (`deleteRecipe`) →
`removeStepPhotoObject` (`api.ts:372-380`) → `removeHouseholdFile` (`storage.ts:158`).

**Pourquoi la graine est un chemin et non un `blob:`.** `householdMediaPathOf` (`storage.ts:194-199`)
rend `null` pour toute forme non-chemin (`isHouseholdMediaPath`, `:182-184`, rejette `blob:`/`data:`/
`http(s)://`/`/…`). Un aperçu démo `blob:` ne déclencherait donc **aucun** nettoyage et l'assertion
serait vraie sans rien regarder — la graine construit explicitement
`${DEMO_HOUSEHOLD_ID}/recipes/<recipeId>/steps/<stepId>/photo.jpg` (`:95`).

**Pourquoi la mutation peut la faire échouer (reproductible).** Retirer l'argument à
`recette-detail-page.tsx:464` (`void removeRecipe(recipe, …)` → `void removeRecipe(recipe)`) compile
grâce au défaut `[]` ; `Promise.all([])` ne touche alors aucun objet, l'espion n'est jamais appelé, et
`toHaveBeenCalledWith(stepPath)` échoue. C'est le `1 failed | 3 passed` rapporté en
`21-06-SUMMARY.md:180-185`. La recette semée n'a pas de couverture, donc `removeHouseholdFile` n'est
appelé que pour le chemin d'étape (assertion non ambiguë).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0125_recipe_step_photos.sql` | Colonne `photo_path` + `view_recipe_share` recréée avec `photo_path` brut par étape | ✓ VERIFIED | `:17` colonne, `:93-104` jsonb d'étape, `:31` `search_path = ''` + noms qualifiés |
| `supabase/migrations/0126_recipe_step_photos_household.sql` | Contrainte de bornage au foyer | ✓ VERIFIED | `:35-37` |
| `supabase/tests/0125_recipe_step_photos.sql` | RLS positive/négative isolante, RPC rend le brut | ✓ VERIFIED | vert (re-joué) ; cas négatif `:106-122` (21-06) |
| `supabase/tests/0126_recipe_step_photos_household.sql` | Foyer accepté, étranger refusé, `null` accepté | ✓ VERIFIED | vert (re-joué) |
| `supabase/tests/0001_schema_contract.sql` | `'photo_path'` ajouté au contrat | ✓ VERIFIED | `:52` |
| `app/src/modules/recettes/components/step-photo.tsx` | Image pleine largeur, masquage `onError`, plein écran | ✓ VERIFIED | `:33,67-102` |
| `app/src/modules/recettes/components/step-photo-dialog.tsx` | Jumeau plein écran paramétré par URL | ✓ VERIFIED | présent (utilisé par `step-photo.tsx:4,96`) |
| `app/src/modules/recettes/recipe-step-photo.test.ts` | Résolution, dépôt, remplacement, nettoyage, démo, CR-01 | ✓ VERIFIED | vert (re-joué) |
| `supabase/functions/recipe-invite/guest-steps.ts` | Module pur (aucun import Deno/npm) | ✓ VERIFIED | `:1-110` |
| `supabase/functions/recipe-invite/guest-steps.test.ts` | Signature, échec fermé, TTL unique, projection | ✓ VERIFIED | vert (re-joué) |
| `supabase/functions/recipe-invite/index.ts` | Importe le module, signe chaque étape | ✓ VERIFIED | `:68,472,484` |
| `app/src/modules/recettes/guest-recipe-page.tsx` | Carte d'URLs aux deux surfaces | ✓ VERIFIED | `:90-91,181-191` |
| `app/src/modules/recettes/guest-recipe-page.test.tsx` | Rendu image invitée + échec fermé | ✓ VERIFIED | vert (re-joué) |
| `app/src/modules/recettes/components/recipe-cuisine-view.tsx` | `photoUrls` + image réduite une fois cochée | ✓ VERIFIED | `:18,101-111` |
| `app/src/modules/recettes/components/recipe-export.css` | `.recipe-print img` bornée | ✓ VERIFIED | `:59-63` |
| `app/src/modules/recettes/types.ts` | `RecipePrintModel.stepPhotos` parallèle | ✓ VERIFIED | `:241,276` |
| `app/src/modules/recettes/recipe-cuisine-photo.test.tsx` | Cuisine, réduction, plein écran, absence | ✓ VERIFIED | vert (re-joué) |
| `app/src/modules/recettes/recette-detail-page.test.tsx` | Fiche, impression, `enfant`, **câblage de suppression (R5, 21-06)** | ✓ VERIFIED | `:166-181` (nouveau) ; 4/4 vert (re-joué) |
| `app/e2e/recettes.spec.ts` | Parcours démo + révocation `blob:` | ✓ VERIFIED | `:222-291` |
| `app/src/types/database.ts` | `photo_path` documenté | ✓ VERIFIED | chemin complet `<householdId>/…` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `uploadRecipeStepPhoto` | `depositHouseholdFile` → `storedValueOf` | valeur de colonne par le point unique | ✓ WIRED | `api.ts:330-333` |
| `replaceRecipeStepPhoto` | `replacedMediaPath` → `removeStepPhotoObject` → `removeHouseholdFile` | retrait de l'ancien objet gardé, journalisé | ✓ WIRED | `api.ts:417-431`, `372-380` |
| `writeStepPhoto` | `replaceRecipeStepPhoto`/`clearRecipeStepPhoto` | le booléen `landed` décide du nettoyage destructif (CR-01) | ✓ WIRED | `api.ts:425-429`, `442-444` |
| **`recette-detail-page` bouton « Supprimer »** | **`removeRecipe(recipe, steps.map(step.photoPath))` → `deleteRecipe` → `removeStepPhotoObject` → `removeHouseholdFile`** | **le câblage de page désormais asserté (R5, 21-06)** | **✓ WIRED** | `recette-detail-page.tsx:462-465` ; `use-recettes.ts:243-246` ; `api.ts:246-255` ; test `recette-detail-page.test.tsx:166-181` |
| `RecipeSteps.photoUrls` | `StepPhoto` | URL affichable, jamais un chemin brut | ✓ WIRED | `recipe-steps.tsx:109,313-324` |
| `handleLinkView` | `toGuestSteps(admin, view.steps)` → `resolveGuestMediaUrl` | seule signature d'étape, jumelle de la couverture | ✓ WIRED | `index.ts:472,481` ; `guest-steps.ts:59-110` |
| `guest-steps.ts` | `index.ts` | `GUEST_PHOTO_TTL_SECONDS` unique | ✓ WIRED | `index.ts:68` (aucune constante locale) |
| Edge `steps[].photoUrl` | `toGuestStep` → carte `photoUrls` → `RecipeSteps`/`RecipeCuisineView` | l'URL signée traverse sans redevenir un chemin | ✓ WIRED | `api.ts:652-664` ; `guest-recipe-page.tsx:90-91,181-191` |
| `recette-detail-page` carte `photoUrls` | `RecipeCuisineView` + `toRecipePrintModel` | une seule résolution, deux surfaces | ✓ WIRED | `recette-detail-page.tsx:99-103,131-139,319,325` |
| contrainte SQL `0126` | Edge `recipe-invite` | porte autoritaire à l'écriture ; le signeur n'a plus à valider un préfixe | ✓ WIRED | `0126:35-37` ; test `0126:82-94` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `recette-detail-page.tsx` fiche/cuisine/print | `photoUrls` | `resolveRecipeStepPhotoUrls(steps)` (useQuery, clé = chemins) → `createSignedUrl` | Oui (chemin de colonne → URL signée) | ✓ FLOWING |
| `guest-recipe-page.tsx` (les deux surfaces) | `photoUrls` | `view.steps[].photoUrl` (Edge-signed) | Oui | ✓ FLOWING |
| `recipe-cuisine-view.tsx` | `photoUrls[step.id]` | prop (fiche ou page invitée) | Oui | ✓ FLOWING |
| `toRecipePrintModel` | `stepPhotos` | `args.stepPhotoUrls?.[step.id]` (URL résolue) | Oui (jamais `photoPath`) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Tests unitaires ciblés de la phase (8 fichiers) | `npx vitest run …recipe-step-photo.test.ts …recipe-steps.test.tsx …guest-recipe-page.test.tsx …recipe-cuisine-photo.test.tsx …recette-detail-page.test.tsx …recipe-actions.test.ts src/lib/media-path-contract.test.ts ../supabase/functions/recipe-invite/guest-steps.test.ts` | **8 files / 73 tests passed** | ✓ PASS |
| **R5 — câblage de suppression au niveau page (nouveau test 21-06)** | `npx vitest run src/modules/recettes/recette-detail-page.test.tsx` | **4 passed (4)** | ✓ PASS |
| SQL 0125 (colonne + RLS enfant **isolante** + RPC brut) | `sh scripts/test-db.sh 0125` | `OK 0125_recipe_step_photos.sql` | ✓ PASS |
| SQL 0126 (contrainte de foyer) | `sh scripts/test-db.sh 0126` | `OK 0126_recipe_step_photos_household.sql` | ✓ PASS |
| `0001_schema_contract` connaît `photo_path` | `grep` + suite complète (orchestrateur) | `:52` présent ; 63/63 verts | ✓ PASS |
| Chaîne §2.7 (typecheck / `npm test` / build / e2e) | orchestrateur (HEAD `d33b3a1`) | 1257 tests / 147 fichiers ; build vert ; e2e 123 passed / 5 skipped | ✓ PASS (établi, non re-joué ici) |

### Probe Execution

Sans objet : la phase n'est ni une migration isolée ni un outil CLI, et aucune sonde `scripts/*/tests/probe-*.sh` n'est déclarée ni conventionnelle ici.

### Requirements Coverage

Les six exigences proviennent de `21-SPEC.md` (ce projet n'a pas de `REQUIREMENTS.md` global). Chaque ID est revendiqué par au moins un plan ; aucune exigence orpheline. **R2 et R5, précédemment PARTIAL au sens Nyquist, sont désormais pleinement couvertes (21-06).**

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| R1 | 21-01, 21-05 | Une photo par étape, remplaçable ; ajout sur une étape photographiée écrase et nettoie l'ancien objet | ✓ SATISFIED | `0125:17` ; `api.ts:417-431` ; tests `recipe-step-photo.test.ts` ; P1 |
| R2 | 21-01, 21-05, **21-06** | Ajout/retrait par tout membre qui écrit ; `enfant` voit sans modifier | ✓ **SATISFIED (isolante)** | `recipe-steps.tsx:315-323,354` ; `use-recettes.ts:78` ; SQL `0125:106-122` (**cas négatif désormais isolant**, G1) + contrainte `0126:35-37` ; tests `recipe-steps.test.tsx`, `recette-detail-page.test.tsx:152-164` |
| R3 | 21-01, 21-03, 21-04 | Affichage sur les quatre surfaces ; étape sans photo → aucun média | ✓ SATISFIED | fiche `recette-detail-page.tsx:319-325` + `recette-detail-page.test.tsx:116-150` ; cuisine `recipe-cuisine-view.tsx:101-111` + `recipe-cuisine-photo.test.tsx` ; invité `guest-recipe-page.tsx:181-191` + `guest-recipe-page.test.tsx` ; impression `types.ts:241,276` + `recipe-export.css:59-63` + `recette-detail-page.test.tsx:132-150` |
| R4 | 21-02, 21-03, 21-05 | Lien invité signé serveur, TTL 1 h, chemin brut jamais transmis | ✓ SATISFIED | `guest-steps.ts:23,59-110` ; `index.ts:472,481` ; `api.ts:604-617,652-664` ; `guest-steps.test.ts` ; contrainte `0126` |
| R5 | 21-01, 21-05, **21-06** | Nettoyage du bucket aux trois niveaux ; cas sans photo = no-op | ✓ **SATISFIED (isolante)** | `api.ts:226-229,246-255,441-445` ; tests `recipe-step-photo.test.ts` ; **`recette-detail-page.test.tsx:166-181` (câblage de page, G2)** ; `recipe-actions.test.ts` |
| R6 | 21-01, 21-04, 21-05 | Mode démo : aperçu `blob:` local, aperçu mort masqué après rechargement | ✓ SATISFIED | `step-photo.tsx:33,80` ; tests `recipe-step-photo.test.ts` ; e2e `recettes.spec.ts:274-290` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (aucun) | — | `TBD`/`FIXME`/`XXX` dans les fichiers modifiés par la phase | — | 0 occurrence (grep, y compris les deux fichiers 21-06) |
| (aucun) | — | `TODO`/`HACK`/`coming soon`/`not implemented` | — | 0 occurrence ; les deux `placeholder=` trouvés (`recipe-steps.tsx:165`, `guest-recipe-page.tsx:115`) sont des attributs de champ, pas des marqueurs de dette |
| (aucun) | — | `eslint-disable` résiduel | — | 0 occurrence ; interdit par `no-eslint-directive.test.ts` |
| (aucun) | — | Implémentations vides (`return null` de complaisance, props vides) | — | Les `return null` de `step-photo.tsx:102` sont l'état « étape sans photo » (D-10), non un stub |

### Defects Introduced

Aucun défaut bloquant introduit. Les cinq constats de la revue sont fermés et vérifiés :
- **CR-01** (BLOCKER) — `writeStepPhoto` rend un booléen `landed`, les appelants conditionnent le nettoyage destructif (`api.ts:395-445`) ; tests `recipe-step-photo.test.ts`.
- **WR-01** (WARNING) — contrainte `0126` bornant `photo_path` au foyer de la ligne ; test SQL négatif `0126:82-94`.
- **IN-01** — retrait gardé sur `step.photoPath && props.photoUrl` (`recipe-steps.tsx:354`) ; test `recipe-steps.test.tsx`.
- **IN-02** — `setOpen(false)` à l'ajustement de rendu (`step-photo.tsx:42`).
- **IN-03** — `recipeCoverPathOf` réutilise `isHouseholdMediaPath` (`api.ts:268-271`).
- **IN-04** — commentaire `database.ts` corrigé (préfixe `<householdId>`).

Les deux régressions suivies dans `deferred-items.md` sont fermées : `0001_schema_contract.sql:52` (`photo_path`) et la révocation `blob:` de `recettes.spec.ts:274-290`.

### Declared Manual-Only Limits (NOT must-have gaps)

Aucune vérification humaine **requise pour valider une must-have** : les 31 must-haves sont adossées à un test qui exerce le comportement (unitaires, SQL, e2e). Deux confirmations manuelles restent **déclarées d'avance** dans `21-VALIDATION.md` §Manual-Only (limites d'environnement, pas des écarts) :

- **Edge `recipe-invite` déployée (R4)** — `deno` absent ; aucun test du dépôt n'importe un `index.ts` d'Edge. La logique de signature est prouvée sur le module pur `guest-steps.ts`. Confirmation : déployer, ouvrir `/invitation/recette?code=…`, vérifier que l'image d'étape s'affiche et que le HTML ne contient aucun chemin de bucket.
- **Impression papier (R3)** — `window.print()` n'est pas exerçable en jsdom. Confirmation : ouvrir la fiche, `window.print()`, vérifier que l'image sort sous sa ligne et que la recette tient sur une page.

### Notes / Observations (non bloquantes)

- **ℹ️ Re-run déclenché par un digest périmé (#4682), pas par un écart.** `21-06` est un plan de fermeture de couverture **test-only** ; aucun fichier de production n'a changé (`git diff --name-only 75850b1..HEAD` = les deux fichiers de test). Les deux nouvelles assertions sont vertes et **peuvent échouer** (G1/G2 ci-dessus).
- **ℹ️ `sh scripts/test-dispatch-push.sh` n'a pas tourné** (aucun abonnement de push réel sur cet hôte) — jambe `base → Edge → Push` non validée, **hors périmètre** de la phase 21.
- **ℹ️ Le comportement de l'Edge déployée et `window.print()` sont « non validés », pas « absents »** (AGENTS.md §2.7 I) : le code qui les porte existe et est testé au niveau de sa logique pure ; seul le trajet d'exécution réel échappe à la chaîne.
- **ℹ️ `21-VALIDATION.md` reste en `status: draft` / `nyquist_compliant: false`** — la signature Nyquist n'est pas portée dans ce fichier ; le présent rapport ne la remplace pas. Les deux constats partiels (R2, R5) sont désormais clos dans le corps du fichier (colonne « Status »), mais l'en-tête n'a pas été re-signé.
- **ℹ️ `21-SECURITY.md` reste cohérent** : `threats_open: 0`, 9/9 clos ; les deux risques acceptés (AR-21-01 couverture hors périmètre, AR-21-02 normalisation `..` non tranchable sans runtime Storage) sont inchangés par `21-06` (aucun fichier de production touché).
- **ℹ️ Métadonnées ROADMAP/STATE en retard** (`state.advance-plan` non suivi pour 18/19/20/21) — relève de l'orchestrateur, pas du code.

### Gaps Summary

**Aucun écart.** La phase 21 livre le modèle de données (`photo_path` + contrainte de foyer), le
dépôt/remplacement/retrait avec nettoyage du bucket aux trois niveaux, le rendu sur les quatre surfaces
(fiche membre, mode cuisine, lien invité, impression), la signature serveur invité (module pur, TTL
unique 1 h, chemin brut jamais transmis), le parcours démo (aperçu `blob:`, aperçu mort masqué), et la
fermeture des cinq constats de revue et des deux régressions suivies.

Le plan de fermeture `21-06` a rendu **isolantes** les deux assertions que l'audit Nyquist avait
marquées PARTIAL : le cas négatif `enfant` du test SQL 0125 porte désormais un chemin du foyer (seule la
RLS peut le refuser — G1), et un test de niveau page prouve que la suppression transmet les chemins de
photo des étapes jusqu'à `removeHouseholdFile` (G2). Chacune est prouvée rouge par mutation, décrite de
façon reproductible dans `21-06-SUMMARY.md`.

Les 31 must-haves sont vérifiés ; les 8 fichiers de tests unitaires ciblés (73 tests), les tests SQL
`0125`/`0126` et la chaîne complète (§2.7) sont verts au HEAD `d33b3a1`. Seules deux confirmations
manuelles pré-déclarées subsistent, sans effet sur l'atteinte de l'objectif.

---

_Verified: 2026-10-16T16:39:45Z_
_Verifier: the agent (gsd-verifier)_
_Re-run: stale digest (#4682) after the test-only plan 21-06 (`b8db247`, `d33b3a1`)_
