---
phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
plan: '02'
subsystem: frontend-recettes
tags: [react, tanstack-query, dnd-kit, vitest, storage, rhf-zod]
requires:
  - phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage
    provides: [socle serveur Recettes 16-01 (schema + RLS + RPC + Edge recipe-invite)]
provides:
  - Parcours membre complet grille vers fiche (scaler, DnD, couverture, recherche/filtres/favoris, parametres)
  - Suites Vitest recettes figees (scaler/search/steps/cover, 24 tests)
affects: [16-03-partage-export-courses]
actuals:
  tokens: 34000
  tasks: 3
  commits: 3
tech-stack:
  added: []
  patterns: [useRecettes calque use-taches (canWrite enfant + enfants RLS), cover depose/signee/cleanup calque voyages, recherche NFD client, DnD bulle useSortable + boutons 44px]
key-files:
  created:
    - app/src/modules/recettes/api.ts
    - app/src/modules/recettes/hooks/use-recettes.ts
    - app/src/modules/recettes/recette-detail-page.tsx
    - app/src/modules/recettes/components/recipe-card.tsx
    - app/src/modules/recettes/components/recipe-form-dialog.tsx
    - app/src/modules/recettes/components/ingredient-list.tsx
    - app/src/modules/recettes/components/recipe-steps.tsx
    - app/src/modules/recettes/components/recipe-settings.tsx
    - app/src/modules/recettes/recettes-scaler.test.ts
    - app/src/modules/recettes/recettes-search.test.ts
    - app/src/modules/recettes/recipe-steps.test.tsx
    - app/src/modules/recettes/recipe-cover.test.ts
  modified:
    - app/src/modules/recettes/types.ts
    - app/src/modules/recettes/recettes-page.tsx
    - app/src/modules/recettes/recettes-page.test.tsx
    - app/src/types/database.ts
    - app/src/lib/data/keys.ts
    - app/src/lib/data/seed.ts
    - app/src/app/router.tsx
    - app/src/app/route-preload.ts
    - app/src/app/route-preload.test.tsx
key-decisions:
  - "Champs numeriques du formulaire en string + conversion manuelle : z.coerce casse le typage zodResolver installe (aucun precedent coerce dans le depot)"
  - "Poignee drag hors aria-hidden : le wrapper bulle+point masquait la poignee aux lecteurs d'ecran (trouve par le test, corrige)"
  - "Favori desactive pour enfant : recipe_favorites ecrit via can_write_household, serveur refuse ; UI masquee comme les autres ecritures"
  - "Partage/export/Courses exclus de la fiche : scope 16-03, aucune section stub"
patterns-established:
  - "Recipe child writes: api.ts + useRecettes (refreshChildren invalide les 6 tables enfants)"
  - "Cover recette: uploadRecipeCover/resolveRecipeCoverUrl/delete couple a deleteRecipe (TTL 3600, fail-closed)"
requirements-completed: [R1, R3, R5, R8, R9, R13]
coverage:
  - id: D1
    description: "Grille 3 cartes / 2 sections (foyer d'abord), clic carte vers fiche par recipe_id"
    requirement: "R1"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recettes-page.test.tsx (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Creation Gratin pour 4 (30+45) affiche 1h15 ; formulaire 7 champs nom 1-200"
    requirement: "R3"
    verification:
      - kind: unit
        ref: "recettes-page.test.tsx#creer + scaler formatTotalTime"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fiche defilement unique header/curseur/ingredients/etapes/actions avec bons contenus"
    requirement: "R5"
    verification:
      - kind: unit
        ref: "recettes-page.test.tsx#fiche"
        status: pass
    human_judgment: false
  - id: D4
    description: "Scaler ref impaire 3 vers 4, paires 2-12, 1 oeuf/4 vers 0.5/2 vers 2/8, NULL intact, accord +s/+x"
    requirement: "R8"
    verification:
      - kind: unit
        ref: "recettes-scaler.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Couverture visible carte+fiche, URL signee 1h fail-closed, suppression sans orphelin Storage"
    requirement: "R9"
    verification:
      - kind: unit
        ref: "recipe-cover.test.ts (7 tests, mock calque voyages)"
        status: pass
    human_judgment: false
  - id: D6
    description: "DnD 3 vers 1 persiste positions denses, bulles 1-2-3, boutons clavier 44px, cases locales"
    requirement: "R7"
    verification:
      - kind: unit
        ref: "recipe-steps.test.tsx (5 tests, persistance via adaptateur local)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Recherche gratin sans accent (nom+ingredient), filtres categorie/tags/favoris combinables, rename tag repercute"
    requirement: "R13"
    verification:
      - kind: unit
        ref: "recettes-search.test.ts (3 tests)"
        status: pass
    human_judgment: false
duration: 30min
completed: 2026-10-14
status: complete
---

# Phase 16 Plan 02 : Grille + fiche + édition Recettes Summary

**Grille sectionnée + fiche défilement unique avec scaler pair, DnD étapes, couverture sans orphelin, recherche/filtres/favoris et paramètres — 24 tests Vitest verts, typecheck + build verts**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-10-14T08:20Z (approx)
- **Completed:** 2026-10-14T08:45Z
- **Tasks:** 3 (tracer + recherche/parametres + preuves figees)
- **Files modified:** 21 (12 created, 9 modified)

## Accomplishments

- Grille groupée par catégorie (Recettes du foyer d'abord), cartes photo plein fond (nom haut, tags bas-droite, cœur haut-droite, temps total), navigation vers `/recettes/:id` (34e morceau de route)
- Fiche défilement unique : header photo/nom/méta → curseur personnes → ingrédients recalculés → étapes → actions (modifier/supprimer confirmée)
- Scaler D-06/D-07 pur client : pas de 2 sur 2–12, init référence arrondie au pair, décimaux + accord +s/+x, NULL « au goût » intact
- Étapes dnd-kit : bulle = poignée (`useSortable` + `sortableKeyboardCoordinates`) + boutons monter/descendre 44px, point de liaison, cases cuisson locales, renumérotation serveur dense
- Couverture : dépôt `recipes/<id>` compressé, URL signée TTL 3600 fail-closed, cleanup couplé à la suppression (0 orphelin)
- Formulaire 7 champs (nom 1–200 Zod, couverture optionnelle, tags pastilles + volée, catégorie défaut + inline, servings, prépa/cuisson h/min optionnels)
- Recherche NFD insensible aux accents (nom + ingrédients) + filtres catégorie/tags/favoris combinables ; paramètres catégories (rename/suppr. pleine → défaut) + tags
- Enfant : actions masquées + garde `Votre rôle ne permet pas d'écrire ici` + favori désactivé (serveur refuse déjà en 16-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer grille vers fiche** - `4c613de` (feat)
2. **Task 2: Recherche filtres favoris + paramètres** - `d48d58a` (feat)
3. **Task 3: Preuves figées scaler/steps/cover** - `5fd395d` (test)

**Commits notes :** sequential run sur l'arbre main par consigne orchestrateur (même régime que 16-01) ; commits normaux avec hooks, aucun `--no-verify`.

## Files Created/Modified

- `app/src/modules/recettes/api.ts` - Écritures (catégories/tags/liens/ingrédients/étapes/favoris + cover), garde enfant par mutation via le hook
- `app/src/modules/recettes/hooks/use-recettes.ts` - Ressources + enfants + `canWrite = role !== 'enfant'` (calque use-taches)
- `app/src/modules/recettes/types.ts` - Domaine + scaler + recherche/filtres + assembleurs (réécrit du placeholder)
- `app/src/modules/recettes/recettes-page.tsx` - Grille sections + barre recherche/filtres + paramètres (placeholder remplacé)
- `app/src/modules/recettes/recette-detail-page.tsx` - Fiche `/recettes/:id` (nouveau)
- `app/src/modules/recettes/components/recipe-card.tsx` - Carte esprit voyages D-01 (nouveau)
- `app/src/modules/recettes/components/recipe-form-dialog.tsx` - Formulaire 7 champs D-05/D-08/D-09 (nouveau)
- `app/src/modules/recettes/components/ingredient-list.tsx` - Curseur + CRUD inline ingrédients (nouveau)
- `app/src/modules/recettes/components/recipe-steps.tsx` - Bulles DnD + cases locales D-11/D-12 (nouveau)
- `app/src/modules/recettes/components/recipe-settings.tsx` - Catégories + tags R2/R4 (nouveau)
- `app/src/types/database.ts` - `RecipeRow` étendue (servings/prépa/cuisson/cover/category) + 6 lignes enfants
- `app/src/lib/data/keys.ts` - `recipe_tag_links` + `recipe_favorites` sans `id` (clé composite)
- `app/src/lib/data/seed.ts` - Catégorie défaut + 14 tags + tables vides (mode démo)
- `app/src/app/router.tsx` + `route-preload.ts` + `route-preload.test.tsx` - Route fiche, 33 → 34 morceaux
- 5 suites recettes : scaler (6), page grille/fiche (3), search (3), steps (5), cover (7)

## Decisions Made

- Champs numériques du formulaire en `string` + conversion manuelle : `z.coerce` casse le typage du `zodResolver` installé (erreur `ResolverOptions.names`), aucun précédent `coerce` dans le dépôt
- Poignée drag sortie de `aria-hidden` : le wrapper bulle+point la masquait aux lecteurs d'écran — trouvé par le test steps (Rule 1), corrigé (point seul reste masqué)
- Favori désactivé pour le rôle enfant : `recipe_favorites` s'écrit via `can_write_household`, le serveur refuse ; UI alignée sur les autres écritures plutôt qu'un toast d'erreur
- Partage invité / export print / envoi Courses exclus de la fiche : scope 16-03, aucune section stub laissée en place
- `route-preload.test.tsx` 33 → 34 : compteur intentionnel, pas un contournement

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Poignée DnD invisible aux lecteurs d'écran**
- **Found during:** Task 3 (test steps rouge : bouton `Réordonner` introuvable)
- **Issue:** Le `<span aria-hidden>` entourant bulle + point masquait aussi la poignée `<button>`, pourtant opérable au clavier via dnd-kit
- **Fix:** `aria-hidden` retiré du conteneur, reporté sur le seul point de liaison
- **Files modified:** app/src/modules/recettes/components/recipe-steps.tsx
- **Verification:** recipe-steps.test.tsx 5/5 vert
- **Committed in:** 5fd395d (part of task commit)

**2. [Rule 3 - Blocking] `z.coerce` incompatible avec le resolver installé**
- **Found during:** Task 1 (typecheck rouge sur recipe-form-dialog)
- **Issue:** `zodResolver` installé attend des clés exactes ; `coerce` (input `unknown` → output `number`) casse `ResolverOptions.names`, aucun précédent dans le dépôt
- **Fix:** Champs numériques en `z.string()` + `toFormValues` convertissant vers `RecipeFormValues`
- **Files modified:** app/src/modules/recettes/components/recipe-form-dialog.tsx
- **Verification:** typecheck vert
- **Committed in:** 4c613de (part of task commit)

**3. [Rule 2 - Missing critical] Fiche sans route + compteur de morceaux**
- **Found during:** Task 1 (la carte doit naviguer vers la fiche)
- **Issue:** Le plan listait la fiche mais ni la route `/recettes/:id`, ni l'entrée `route-preload`, ni la MAJ du compteur 33
- **Fix:** Route + `recetteDetail` chunk + compteur 33 → 34
- **Files modified:** app/src/app/router.tsx, route-preload.ts, route-preload.test.tsx
- **Verification:** test navigation grille → fiche vert, preload test vert
- **Committed in:** 4c613de (part of task commit)

**4. [Rule 2 - Missing critical] Tables enfants absentes du mode démo**
- **Found during:** Task 1 (useResource sur tables inconnues + catégorie défaut requise pour le groupement)
- **Issue:** `recipe_categories`/`recipe_tags`/enfants absents de `seed.ts` ; `recipe_tag_links`/`recipe_favorites` (sans `id`) non déclarées sans-clé → `create` local injecterait un `id` fantôme
- **Fix:** Seeds défaut + 14 tags + tables vides ; 2 entrées `KEYLESS_TABLES`
- **Files modified:** app/src/lib/data/seed.ts, app/src/lib/data/keys.ts
- **Verification:** suite recettes verte en adaptateur local, full suite sans régression liée
- **Committed in:** 4c613de (part of task commit)

**5. [Rule 2 - Missing critical] `categoryId === '__nouvelle__'` stockable tel quel**
- **Found during:** Task 1 (relecture avant commit)
- **Issue:** La valeur sentinelle du select « + Nouvelle catégorie » aurait été persistée en `category_id` sans garde
- **Fix:** Garde hook (`NEW_CATEGORY_VALUE` + nom vide → throw) + `superRefine` dialogue
- **Files modified:** hooks/use-recettes.ts, components/recipe-form-dialog.tsx
- **Verification:** typecheck + tests verts
- **Committed in:** 4c613de (part of task commit)

---

**Total deviations:** 5 auto-fixed (1 bug a11y, 1 bug resolver, 3 missing critical)
**Impact on plan:** Tous nécessaires au vert et à la justesse. Aucun élargissement de scope (photos d'étape, PDF, partage : toujours exclus, 0 stub).

## Issues Encountered

- **Échec pré-existant hors scope :** `src/hooks/use-notifications.test.tsx` (4 timeouts 5 s) échoue aussi sur l'arbre sans mes changements (worktree baseline `23ce9a8` : 3–4 échecs identiques, variable selon la charge). Non causé par ce plan (le hook n'importe aucun fichier touché), non corrigé per scope boundary. À signaler au vérificateur.
- `getByLabelText('Nom')` ne matche pas `Field` (libellé rendu « Nom * ») : tests passés en regex, précédent notes.

## Auth Gates

None - aucun.

## Known Stubs

None - aucun marqueur TODO/FIXME/placeholder dans les fichiers créés ; vérifié par relecture (partage/export/Courses volontairement absents = scope 16-03, pas des stubs).

## Threat Flags

None - aucune surface hors modèle du plan : bucket privé + signée TTL court + cleanup (T-16-07), renumérotation dense (T-16-08), garde enfant UI + throw (T-16-06), 0 paquet neuf (T-16-SC tient, `npm install` inutile).

## User Setup Required

None - pas de USER-SETUP.md.

## Self-Check: PASSED

- Fichiers : api.ts, use-recettes.ts, recette-detail-page.tsx, 5 composants, 5 suites existent ; recettes-page.tsx ne contient plus le placeholder
- Commits : 4c613de + d48d58a + 5fd395d existent (`git log`)
- Preuves : typecheck vert, `npm test -- recettes` 24/24 vert (5 fichiers), `npm run build` vert (precache 97 entrées)
- Full suite : 872/876 — les 4 échecs sont le fichier notifications pré-existant (prouvé sur baseline sans mes changements)

## Next Phase Readiness

- 16-03 peut construire : fiche existante (point d'ancrage partage/export/Courses), Edge `recipe-invite` prête (16-01), `createShoppingItem` identifié (courses/api.ts)
- Enfant lecture seule prouvée UI ; serveur déjà refusé en 16-01 (R10 complet)
- Aucun bloqueur

---
*Phase: 16-recettes-du-foyer-grille-fiche-ingr-dients-tapes-partage*
*Completed: 2026-10-14*
