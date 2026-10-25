---
phase: 21-photos-dans-les-etapes-de-recette
plan: 06
subsystem: recettes / tests (isolation d'assertion — RLS SQL et câblage de suppression au niveau page)
tags: [postgres, rls, sql-test, vitest, testing-library, recipe-steps, mutation-proof, nyquist]

# Dependency graph
requires:
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-01 — colonne `recipe_steps.photo_path` (migration 0125) et RLS d'écriture (`can_write_household`) ; 21-05 — contrainte `recipe_steps_photo_path_household` (0126, chemin borné au foyer de la ligne) et câblage `recette-detail-page.tsx:462-465` → `removeRecipe` → `api.ts deleteRecipe`"
provides:
  - "supabase/tests/0125_recipe_step_photos.sql — le cas (b) `enfant` porte un CHEMIN DU FOYER, symétrique du cas (a) membre positif : la contrainte 0126 ne peut plus être la cause du refus, seule `can_write_household` peut l'être (R2, T-21-01)"
  - "app/src/modules/recettes/recette-detail-page.test.tsx — assertion de niveau page que la suppression transmet les chemins de photo des étapes jusqu'à `removeHouseholdFile` (R5, T-21-09)"
affects: []

# Actuals (#2632) — pair with the plan's `estimate` (12k tokens / 2 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff = `git diff <base>..HEAD | wc -c` / 4), never a harness token count.
actuals:
  tokens: 1865
  tasks: 2
  commits: 2
  plan_head_before: 75850b1684a8c65a7d73a0b3ac437b7bf061dcf6
  plan_head_after: d33b3a1e0b69ada88113bfceea13da799c3a7661

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un cas négatif SQL ne vaut que si la SEULE différence avec le cas positif est la variable testée (le rôle) : sur une base entièrement migrée, une valeur étrangère est rejetée par la contrainte de forme (0126) AUSSI, donc `expect_denied` est vert même si la RLS laissait passer — l'assertion ne pouvait pas échouer pour la raison annoncée"
    - "Une assertion de câblage de page vise le point le plus HAUT du trajet (`removeHouseholdFile`, `@/lib/storage`) et non la frontière `api` déjà couverte : un espion partiel de module (`vi.mock` + `importOriginal`, motif `recipe-step-photo.test.ts`) laisse le reste réel"
    - "La graine d'une assertion de nettoyage porte un CHEMIN DE BUCKET (`<householdId>/recipes/<recipeId>/steps/<stepId>/…`), jamais un `blob:` démo : `householdMediaPathOf` rend `null` pour une forme non-chemin, donc un `blob:` ne déclencherait aucun nettoyage et l'assertion serait vacue"
    - "Preuve par mutation d'une assertion SQL sans réécrire de migration : injecter un `alter policy` DANS la transaction du fichier de test (annulée au `rollback`), élargir la RLS à `is_household_member`, constater le rouge, ne rien committer — la base est laissée intacte"

key-files:
  created: []
  modified:
    - supabase/tests/0125_recipe_step_photos.sql
    - app/src/modules/recettes/recette-detail-page.test.tsx

key-decisions:
  - "Task 1 : le cas (b) `enfant` écrit `home_a/recipes/<recipe_r1>/steps/<step_r2>/photo.jpg` — même forme que le cas (a) membre positif (`0125:70-76`) — au lieu du chemin étranger `foyer-x/…`. La contrainte 0126 (`starts_with(photo_path, household_id || '/')`) rejette AUSSI un chemin d'un autre foyer, donc l'ancienne assertion ne pouvait pas échouer pour la raison annoncée. Le commentaire d'en-tête dit désormais la vraie raison (test sur base migrée)."
  - "Task 2 : l'assertion vise l'espion de `removeHouseholdFile` (`@/lib/storage`) — le point le plus haut du trajet, comme le préfère le plan — et non celui de `removeRecipe` du hook ni la frontière `api` (déjà couverte par `recipe-step-photo.test.ts:226-249`). `deleteRecipe` (api.ts:246-254) appelle `removeStepPhotoObject` → `removeHouseholdFile(path)` même en démo (le helper no-op sur `!isSupabaseConfigured` mais est bien APPELÉ), donc l'espion est atteint."
  - "Task 2 : la graine construit le chemin à partir de l'id d'étape réel — l'adaptateur génère l'id, donc on crée l'étape nue puis `adapter.update('recipe_steps', stepId, { photo_path })`. Un `blob:` de démo n'aurait déclenché aucun nettoyage (assertion vacue)."
  - "Aucune preuve par mutation n'a modifié de fichier de production de façon persistante : la mutation SQL est un `alter policy` dans la transaction du test (rollback), la mutation TS est un retrait temporaire de l'argument à `recette-detail-page.tsx:464`, restauré par `git checkout -- <fichier>` avant commit."

patterns-established:
  - "Un cas négatif SQL isole la RLS seulement si sa valeur est SYMÉTRIQUE du cas positif — sinon une contrainte de forme devient une seconde cause de refus et l'assertion se tait"
  - "Une assertion de câblage monte au point le plus haut du trajet et se prouve rouge par mutation du site d'appel, jamais par la seule lecture du code"

requirements-completed: [R2, R5]  # Copié verbatim de `requirements:` du PLAN. Aucun REQUIREMENTS.md dans ce dépôt, donc aucune case à cocher.

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "Le cas négatif `enfant` du test SQL 0125 échoue pour la SEULE raison qu'il annonce — l'absence de `can_write_household` — et non parce qu'une contrainte de forme (0126) rejette une valeur étrangère (R2, T-21-01)."
    requirement: "R2"
    verification:
      - kind: integration
        ref: "supabase/tests/0125_recipe_step_photos.sql (cas (b) : chemin du foyer, symétrique du cas membre) — `sh scripts/test-db.sh 0125` vert ; mutation : `alter policy recipe_steps_{insert,update}_household … is_household_member` → rouge « attendu 0, obtenu 1 »"
        status: pass
    human_judgment: false
  - id: D2
    description: "Le câblage de suppression au niveau PAGE est asserté : supprimer une recette photographiée transmet le chemin de photo de l'étape jusqu'à `removeHouseholdFile` (page → use-recettes → api → removeStepPhotoObject), au-delà de la frontière `api` (R5, T-21-09)."
    requirement: "R5"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recette-detail-page.test.tsx#supprimer la recette transmet le chemin de photo d'étape jusqu'au nettoyage (R5) — vert ; mutation : argument retiré à recette-detail-page.tsx:464 → 1 failed | 3 passed"
        status: pass
    human_judgment: false

# Metrics
duration: ~18min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 06: Fermeture des constats Nyquist — le cas `enfant` isole la RLS, le câblage de suppression est asserté au niveau page

**Deux assertions qui ne pouvaient pas échouer pour la raison annoncée sont devenues isolantes : le cas négatif `enfant` du test SQL 0125 porte désormais un chemin du foyer (la RLS seule peut le refuser), et un test de niveau page prouve que la suppression transmet les chemins de photo des étapes jusqu'à `removeHouseholdFile` — chacune prouvée rouge par mutation.**

## Performance

- **Duration:** ~18 min (2 tâches, chacune `tdd="true"` avec preuve par mutation)
- **Started:** 2026-10-16T16:16:00Z
- **Completed:** 2026-10-16T16:34:00Z
- **Tasks:** 2
- **Files modified:** 2 (aucun fichier de production)

## Accomplishments

- **Task 1 — le cas `enfant` isole la RLS (R2)** : `0125_recipe_step_photos.sql:88-118` fait écrire à l'`enfant` le chemin `home_a/recipes/<recipe_r1>/steps/<step_r2>/photo.jpg` (même forme que le cas (a) membre positif, `0125:70-76`) au lieu du chemin étranger `foyer-x/…`. Sur la base entièrement migrée, la contrainte `recipe_steps_photo_path_household` (0126) rejette AUSSI un chemin étranger : l'ancienne assertion `expect_denied` était donc verte même si la RLS laissait passer. La seule différence entre le vert et le refusé est désormais le ROLE — la contrainte ne peut plus être la cause. Le commentaire d'en-tête dit la vraie raison.
- **Task 2 — le câblage de suppression asserté au niveau page (R5)** : `recette-detail-page.test.tsx` monte la page avec l'adaptateur démo et un espion partiel de `@/lib/storage` (`vi.mock` + `importOriginal`), puis suit le parcours réel « Supprimer la recette » → « Supprimer ». Il asserte que `removeHouseholdFile` est appelé avec le chemin de bucket de l'étape. L'assertion traverse page → `use-recettes.ts` → `api.ts` → `removeStepPhotoObject` → `removeHouseholdFile` : s'arrêter à la frontière `api` aurait retombé sur la couverture déjà existante.
- **Preuves par mutation (les deux rapportées)** : (1) élargir `recipe_steps_insert/update_household` à `is_household_member` rend le cas (b) rouge — `ASSERTION ÉCHOUÉE : un enfant ne pose pas de photo sur une etape (attendu 0, obtenu 1)` ; (2) retirer l'argument à `recette-detail-page.tsx:464` rend le nouveau test rouge — `1 failed | 3 passed`.
- **Aucun fichier de production modifié** : `git diff --name-only 75850b1..HEAD` ne liste que les deux fichiers de test, donc `21-VERIFICATION.md` (31/31) reste valable pour le produit.

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1 : Le cas négatif `enfant` échoue pour la RLS, pas pour la contrainte (R2)** (auto, tdd) - `b8db247` (test)
2. **Task 2 : Le câblage de suppression au niveau page est asserté (R5)** (auto, tdd) - `d33b3a1` (test)

**Plan metadata:** `skipped_gitignored` — `.planning/` est gitignoré (`.gitignore:74`), aucun commit de métadonnées n'est possible ni souhaité (jamais de `git add -f`).

_Note : les deux tâches sont `tdd="true"`. Le cycle a bien eu lieu pour chacune — l'assertion a été écrite et prouvée rouge par mutation, puis vue verte._

## Files Created/Modified

- `supabase/tests/0125_recipe_step_photos.sql` — cas (b) `enfant` : valeur = chemin du foyer (`home_a/…/steps/<step_r2>/…`), commentaire d'en-tête réécrit pour dire la vraie raison (modifié)
- `app/src/modules/recettes/recette-detail-page.test.tsx` — espion partiel de `@/lib/storage` + graine à chemin de bucket + test de câblage de suppression au niveau page (modifié)

## Decisions Made

- **Le cas négatif doit être symétrique du cas positif.** Le plan le disait (`0125:70-76` visé) ; c'est la seule façon d'isoler la RLS d'une contrainte de forme. Appliqué tel quel.
- **L'assertion de câblage vise `removeHouseholdFile`.** Le plan préférait ce point ; il est atteignable en démo parce que `deleteRecipe` appelle bien `removeStepPhotoObject` → `removeHouseholdFile` (le helper no-op en interne, mais est appelé). Aucun checkpoint n'a donc été nécessaire (le plan autorisait à s'arrêter si aucun point ne pouvait être rendu rouge — ce ne fut pas le cas).
- **La graine construit le chemin depuis l'id d'étape réel** (création de l'étape nue puis `adapter.update`), parce que l'adaptateur génère l'id et le chemin doit le contenir. Un `blob:` démo aurait rendu l'assertion vacue (`householdMediaPathOf` → `null`).

## Deviations from Plan

None - plan executed exactly as written. (Aucun fichier de production modifié de façon persistante ; les deux mutations de preuve ont été annulées — `alter policy` dans la transaction du test, retrait d'argument restauré par `git checkout --` avant commit.)

## Issues Encountered

- **`gsd_run` indisponible dans cet environnement** : la garde de branche protégée a été évaluée manuellement (`main` est dans la liste de repli, mais `git.allow_default_branch_commits: true` dans `.planning/config.json` lève la protection). Aucun impact sur la tâche.

## User Setup Required

None - no external service configuration required. (Aucune dépendance ajoutée ; le plan ne touche ni `package.json` ni le lockfile.)

## Next Phase Readiness

- Les deux constats partiels de l'audit Nyquist du 2026-10-16 (`21-VALIDATION.md`, R2 et R5) sont clos : les deux lignes peuvent passer de ⚠️ partiel à ✅ green.
- La phase 21 peut être vérifiée verte : chaîne §2.7 complète (typecheck, Vitest, build, e2e, contrôle statique, suite SQL) au vert au HEAD `d33b3a1`.
- Aucun fichier de production modifié : `21-VERIFICATION.md` (31/31) reste valable ; une re-vérification ciblée des deux assertions suffit.

---

## Verification Chain (plan-level)

- `sh scripts/test-db.sh 0125` — **vert** (avant édition, après édition, et après la mutation annulée).
- `sh scripts/test-db.sh` — **vert** (63 fichiers, `0125` inclus).
- `python3 scripts/check-sql-statique.py` — **vert** (0 défaut, 181 fonctions effectives / 126 migrations / 65 tests).
- `cd app && npx vitest run src/modules/recettes/recette-detail-page.test.tsx` — **vert** (4/4).
- `cd app && npm run typecheck` — **vert** (`tsc --noEmit`, aucune sortie).
- `cd app && npm test` — **vert** (147 fichiers, 1257 tests — +1 le nouveau test).
- `cd app && npm run build` — **vert** (PWA `injectManifest`, 100 entrées précachées).
- `cd app && npm run test:e2e` — **vert** (123 passed, 5 skipped — les sauts sont les tests de glisser-déposer, attendus).
- **Aucun fichier de production modifié** : `git diff --name-only 75850b1..HEAD` = les deux fichiers de test uniquement.
- Aucune migration appliquée réécrite (`0125`/`0126` intactes), aucune directive de linter introduite, aucune suppression de fichier.

---

## Preuves par mutation (rapport détaillé)

### Task 1 — le cas `enfant` peut désormais échouer pour la RLS

Le test tourne sur la base migrée ; la contrainte 0126 rejette un chemin étranger. Preuve : injecter dans la transaction du test un élargissement de la RLS d'écriture à `is_household_member` (jamais committé — le `rollback` du fichier l'annule) :

```sql
alter policy recipe_steps_update_household on public.recipe_steps
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
alter policy recipe_steps_insert_household on public.recipe_steps
  with check (private.is_household_member(household_id));
```

Résultat :

```
ERROR:  ASSERTION ÉCHOUÉE : un enfant ne pose pas de photo sur une etape (attendu 0, obtenu 1)
CONTEXT:  PL/pgSQL function testkit.eq(anyelement,anyelement,text) line 4 at RAISE
```

L'`update` a bien touché 1 ligne : la RLS était la SEULE chose qui retenait l'`enfant` (la valeur est un chemin du foyer, la contrainte ne s'y oppose pas). Sans la correction, un chemin étranger aurait été rejeté par la contrainte et l'assertion n'aurait rien isolé.

### Task 2 — le câblage de suppression est rouge si l'argument disparaît

Mutation temporaire à `recette-detail-page.tsx:464` : `void removeRecipe(recipe, steps.map((step) => step.photoPath ?? null))` → `void removeRecipe(recipe)` (le défaut `stepPhotoPaths = []` compile).

```
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

Le nouveau test tombe (`removeHouseholdFile` jamais appelé avec le chemin de l'étape) ; les 3 tests préexistants restent verts. Argument restauré (`git checkout --`), re-run : `4 passed (4)`.

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*

---

## Self-Check: PASSED

- Fichiers modifiés vérifiés présents : `supabase/tests/0125_recipe_step_photos.sql`, `app/src/modules/recettes/recette-detail-page.test.tsx`.
- Commits vérifiés présents : `b8db247` (test, R2), `d33b3a1` (test, R5).
- `commits` mesuré par ledger (`git rev-list --count 75850b1..HEAD` = 2), `plan_head_before`/`plan_head_after` écrits.
- Aucun fichier de production modifié (vérifié par `git diff --name-only 75850b1..HEAD`).
- Commit de métadonnées : `skipped_gitignored` (`.planning/` est dans `.gitignore:74`) — chemin de succès intentionnel, aucun `git add -f`.
