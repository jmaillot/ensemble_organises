---
phase: 21-photos-dans-les-etapes-de-recette
plan: 03
subsystem: recettes / page invitée / média signé
tags: [react, typescript, vitest, signed-url, fail-closed, guest-surface]

# Dependency graph
requires:
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-01 — rendu de la photo d'étape par les composants partagés (`StepPhoto`, `RecipeSteps.photoUrls`) et masquage de l'aperçu démo mort (D-18)"
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-02 — l'Edge `recipe-invite` sert `steps[].photoUrl` (URL signée d'une heure, ou `null`), le chemin brut ne quitte jamais la fonction"
  - phase: 21-photos-dans-les-etapes-de-recette
    provides: "21-04 — `RecipeCuisineView.photoUrls` et la photo réduite en mode cuisine, l'impression par étape"
  - phase: 16-recettes
    provides: "`GuestRecipeView` / `fetchGuestRecipeView` (action `link-view`) et la forme de charge invitée dont `coverPhotoUrl` est le modèle (D-15)"
provides:
  - "app/src/modules/recettes/api.ts — `GuestRecipeStep.photoUrl: string | null` REQUIS, normalisé par `toGuestStep` via `asGuestText(row.photoUrl)` (jamais `photo_path`)"
  - "app/src/modules/recettes/guest-recipe-page.tsx — carte d'URLs d'affichage (`Record<string, string | null>`) construite depuis `entry.photoUrl`, passée TELLE QUELLE aux deux surfaces (`RecipeSteps` + `RecipeCuisineView`)"
  - "app/src/modules/recettes/guest-recipe-page.test.tsx — preuve de rendu de l'image signée + quatre preuves d'échec fermé"
affects: [21-05, verify-work]

# Actuals (#2632) — pair with the plan's `estimate` (16k tokens / 2 tasks) to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff = `git diff <base>..HEAD | wc -c` / 4), never a harness token count.
actuals:
  tokens: 3650
  tasks: 2
  commits: 2
  plan_head_before: acde76343ba091ee086737d3efb7f53c16518f65
  plan_head_after: 3645c3b0dcf24b96f9b2d952adc8c2cb1ccb5694

tech-stack:
  added: []
  patterns:
    - "La projection cliente lit le nom de la CHARGE servie (`photoUrl`), jamais le nom de la COLONNE (`photo_path`) : symétrie exacte avec `coverPhotoUrl` (D-15), donc une charge qui ne porterait que le chemin brut rend `null` (échec fermé, T-21-04)"
    - "Une seule carte d'URLs d'affichage alimente les DEUX surfaces invitées (liste + mode cuisine) : la page invitée et la fiche membre partagent littéralement le même rendu (D-17, R3)"
    - "Le champ `photoUrl` est REQUIS : la chaîne §2.7 (`npm run typecheck`) force chaque producteur de fixture à le renseigner, un producteur oublié ne peut pas passer silencieusement"

key-files:
  created: []
  modified:
    - app/src/modules/recettes/api.ts
    - app/src/modules/recettes/guest-recipe-page.tsx
    - app/src/modules/recettes/guest-recipe-page.test.tsx
    - app/src/modules/recettes/guest-recipe-cuisine.test.tsx
    - app/src/modules/recettes/recette-cuisine-panel.test.tsx
    - app/src/modules/recettes/recette-cuisine.test.tsx

key-decisions:
  - "`GuestRecipeStep.photoUrl` est requis (`string | null`) : l'exigence de type est ce qui force les quatre fixtures invitées à l'aligner — `typecheck` devient le vérificateur, pas un test qu'on peut oublier d'écrire"
  - "La page invitée garde `photoPath: null` sur ses étapes (aucun chemin brut ne lui est transmis) et bâtit une SECONDE projection (la carte d'URLs) : la photo d'affichage ne vit jamais dans `photoPath`, donc un chemin ne peut pas s'y glisser"
  - "La carte d'URLs est construite par `Object.fromEntries` sur `view.steps` — une entrée par étape, `null` compris : la page ne signe rien et ne complète aucune valeur absente (T-21-04)"
  - "Le mode cuisine invité reçoit la même carte que la vue étapes : une seule projection alimente les deux surfaces, donc le TTL/la forme d'URL ne peuvent pas diverger d'une surface invitée à l'autre"

patterns-established:
  - "Une surface cliente qui n'a jamais le droit de recevoir une valeur brute (ici un chemin de bucket) projette cette valeur dans une carte séparée plutôt que dans l'objet métier partagé : la séparation rend la fuite structurellement impossible, pas seulement testée"
  - "Le champ requis + les fixtures existantes transforment la chaîne de typage en garde de complétude : ajouter un producteur de charge sans renseigner `photoUrl` casse `npm run typecheck`"

requirements-completed: [R3, R4]  # Copié verbatim de `requirements:` du PLAN. R4 est partagé avec 21-02 (dont le SUMMARY le laisse ouvert en attendant 21-03) : ce plan est le DERNIER à le déclarer, donc il le clôt ici. Aucun REQUIREMENTS.md dans ce dépôt, donc aucune case à cocher.

# Coverage metadata (#1602) — drives DETERMINISTIC UAT routing in verify-work.
coverage:
  - id: D1
    description: "La projection invitée porte `GuestRecipeStep.photoUrl` (requis, `string | null`), normalisé par `toGuestStep` via `asGuestText(row.photoUrl)` — jamais `photo_path`."
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-page.test.tsx#affiche la photo signée d’une étape, sous son texte, en lecture seule"
        status: pass
    human_judgment: false
  - id: D2
    description: "La page invitée affiche la photo d'une étape en pleine largeur sous son texte, exactement comme la fiche membre : une carte d'URLs d'affichage alimente les DEUX surfaces (liste `RecipeSteps` et mode cuisine `RecipeCuisineView`), en lecture seule (aucune commande d'édition)."
    requirement: "R3"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-page.test.tsx#affiche la photo signée d’une étape, sous son texte, en lecture seule"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-cuisine.test.tsx + recette-cuisine-panel.test.tsx + recette-cuisine.test.tsx (surfaces mode cuisine invitées, vertes après alignement)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Échec fermé : une charge dont une étape porte `photoUrl: null` rend zéro élément média ; une charge qui ne porte que `photo_path` rend `photoUrl: null` et aucun `src` du DOM ne contient le chemin de bucket ; une recette mêlant étape photographiée et étape nue rend exactement une image."
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/guest-recipe-page.test.tsx#une étape dont la charge porte photoUrl: null ne rend aucun élément média / #une charge qui ne porte que photo_path rend photoUrl: null, sans laisser le chemin dans le DOM / #une recette mêlant une étape photographiée et une étape nue rend exactement une image / #la carte d’affichage porte une entrée par étape : l’étape nue reste null, aucune URL fabriquée"
        status: pass
    human_judgment: false
  - id: D4
    description: "La page invitée DÉPLOYÉE : ouvrir `/invitation/recette?code=…`, l'image d'étape s'affiche sous son texte et le HTML ne contient aucun chemin de bucket."
    requirement: "R3"
    verification: []
    human_judgment: true
    rationale: "Le comportement de la page invitée servie en production dépend de l'Edge déployée et d'un lien réel ; la chaîne automatisée n'exerce que la page avec `fetch` remplacé. Vérification manuelle déclarée."

duration: ~34min
completed: 2026-10-16
status: complete
---

# Phase 21 Plan 03: La photo d'étape traverse la projection invitée jusqu'à l'image

**L'URL signée servie par l'Edge (`steps[].photoUrl`) devient une carte d'URLs d'affichage qui alimente les deux surfaces partagées de la page invitée — l'image d'étape s'affiche sous son texte exactement comme sur la fiche membre, et la projection lit le nom de la charge (`photoUrl`), jamais la colonne (`photo_path`), donc aucune URL n'est fabriquée depuis un chemin brut.**

## Performance

- **Duration:** ~34 min (14:26 → 15:00 UTC ; les deux tâches ont été committées en ~3 min par une exécution antérieure interrompue avant le SUMMARY ; cette exécution est la clôture : investigation e2e, vérification de la chaîne, SUMMARY, état)
- **Started:** 2026-10-16T14:26:39Z
- **Completed:** 2026-10-16T15:00:42Z
- **Tasks:** 2
- **Files modified:** 6 (0 créé, 6 modifié)

## Accomplishments

- **`GuestRecipeStep.photoUrl` requis** (`app/src/modules/recettes/api.ts`) : `toGuestStep` mappe `photoUrl: asGuestText(row.photoUrl)` — le nom de la CHARGE servie, jamais `photo_path` (le nom de la colonne). C'est la symétrie exacte de `coverPhotoUrl` (D-15), et c'est ce qui fait qu'une charge ne portant que le chemin brut rend `null` (échec fermé, T-21-04).
- **Carte d'URLs d'affichage** (`app/src/modules/recettes/guest-recipe-page.tsx`) : les étapes gardent `photoPath: null` (l'invité ne reçoit aucun chemin brut) ; une seconde projection (`Object.fromEntries` sur `view.steps`) construit `Record<string, string | null>` — une entrée par étape, `null` compris — et la passe **telle quelle** aux DEUX surfaces : `RecipeSteps` (prop posée par 21-01) et `RecipeCuisineView` (prop posée par 21-04). Une seule projection alimente les deux, donc la page invitée et la fiche membre partagent littéralement le même rendu (D-17, R3).
- **Alignement des quatre fixtures invitées** (`guest-recipe-page.test.tsx`, `guest-recipe-cuisine.test.tsx`, `recette-cuisine-panel.test.tsx`, `recette-cuisine.test.tsx`) : `photoUrl: null` partout, et une URL signée factice reconnaissable (`https://signe.example/step-s1`) là où le test doit VOIR l'image.
- **Preuve de rendu** : ouvrir un lien dont une étape porte une URL signée fait apparaître une `<img>` dont le `src` vaut exactement cette URL, dans la liste des étapes, en lecture seule — plus les surfaces mode cuisine invitées restées vertes.
- **Quatre preuves d'échec fermé** : `photoUrl: null` → zéro média (comptage exact) ; charge ne portant que `photo_path` → `photoUrl: null` et aucun `src` du DOM ne contient le chemin de bucket ; recette mixte → exactement une image ; carte d'affichage non complétée.

## Task Commits

Each task was committed atomically:

1. **Task 1 : L'URL signée traverse la projection invitée jusqu'à l'image** - `c6611ce` (feat)
2. **Task 2 : Échec fermé — une charge sans `photoUrl` n'affiche rien** - `3645c3b` (test)

**Plan metadata:** skipped (`.planning/` est gitignoré — commit de métadonnées `skipped_gitignored`, chemin de succès ; voir « Issues Encountered »)

_Note : la Task 1 est `type="tracer"`, la Task 2 est `tdd="true"` — voir « TDD Gate Compliance » plus bas._

## Files Created/Modified

- `app/src/modules/recettes/api.ts` - `GuestRecipeStep.photoUrl` (requis, `string | null`) ; `toGuestStep` lit `row.photoUrl` via `asGuestText`
- `app/src/modules/recettes/guest-recipe-page.tsx` - carte d'URLs d'affichage (`photoUrls`) construite depuis `entry.photoUrl`, transmise aux deux surfaces partagées
- `app/src/modules/recettes/guest-recipe-page.test.tsx` - preuve de rendu de l'image signée + quatre preuves d'échec fermé ; fixture `signedStepViewPayload`
- `app/src/modules/recettes/guest-recipe-cuisine.test.tsx` - fixture alignée (`photoUrl: null`)
- `app/src/modules/recettes/recette-cuisine-panel.test.tsx` - fixture alignée (`photoUrl: null`)
- `app/src/modules/recettes/recette-cuisine.test.tsx` - fixture `GUEST_STICKY_VIEW` alignée (`photoUrl: null`)

## Decisions Made

- **`photoUrl` requis plutôt qu'optionnel** : l'exigence de type est le vérificateur de complétude — `npm run typecheck` casse si un producteur de charge invitée oublie le champ, ce qu'un test ne garantit pas.
- **Deux projections distinctes côté page invitée** : `photoPath: null` sur l'étape métier (aucun chemin brut) et la carte d'URLs séparée (la photo d'affichage). La séparation rend la fuite de chemin structurellement impossible.
- **Une seule carte pour les deux surfaces** : `RecipeSteps` et `RecipeCuisineView` reçoivent la même `photoUrls`, donc la forme d'URL invité ne peut pas diverger entre liste et mode cuisine.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- **Task 1 (`type="tracer"`)** : exécutée et committée comme une tâche `auto` (production, jamais une maquette). Le portail de retour tracer (gate interactif, `human_verify_mode=end-of-phase`, `<verify>` purement automatisé) a été franchi en **ré-exécutant `<verify>` bout en bout** — vert (4 fichiers / 36 tests + `typecheck`) — donc aucun checkpoint (« ⚡ Tracer verified end-to-end — expanding »).
- **Task 2 (`tdd="true"`) sans RED séparé** : le comportement d'échec fermé était **déjà implémenté par la Task 1** (le tracer a posé `toGuestStep` lisant `row.photoUrl` et la carte d'URLs). Les quatre preuves de la Task 2 s'exercent donc sur un comportement déjà présent et ne peuvent pas échouer d'abord. Précédent suivi : 21-02 (même situation), preuves committées vertes (`test`) et **pouvoir de refus prouvé par mutation** — voir « Issues Encountered ». Aucun faux RED fabriqué.

## Issues Encountered

- **Preuve par mutation de la Task 2** : `toGuestStep` modifié temporairement pour lire `row.photo_path` au lieu de `row.photoUrl` → 4 échecs / 7 succès, avec fuite du chemin de bucket `src="foyer-1/recipes/r-1/steps/s-2/file-b9e1.jpg"` dans le DOM. Restauré (`git diff` vide), 11/11 verts. Les assertions de la Task 2 refusent donc réellement la mauvaise clé.
- **Chaîne §2.7 (plan)** : `npm run typecheck` OK ; `npm test` **147 fichiers / 1252 tests passés** ; `npm run build` OK ; `python3 scripts/check-sql-statique.py` **0 défaut**. Aucune dépendance ajoutée, aucune directive de linter, aucun fichier supprimé.
- **`sh scripts/test-db.sh` (suite complète) — ÉCHEC PRÉ-EXISTANT, hors périmètre** : `supabase/tests/0001_schema_contract.sql:52` déclare les colonnes de `recipe_steps` sans `photo_path` (ajouté par `0125_recipe_step_photos.sql`, plan 21-01). Introduit par 21-01 (qui n'a exécuté que `test-db.sh 0125`). 21-03 ne touche aucun SQL. Journalisé dans `deferred-items.md`, **non corrigé** (scope boundary).
- **`app/e2e/recettes.spec.ts:270` — FLAKE PRÉ-EXISTANT, hors périmètre** : le test « dépôt, image sur les trois surfaces, puis aperçu mort masqué après rechargement » attend qu'un aperçu `blob:` soit masqué après `page.reload()`, mais Chromium ne révoque pas l'URL `blob:` de façon déterministe au rechargement — l'image reste chargée (cache), `onError` ne se déclenche pas, et 1 image subsiste. Mesuré au HEAD (21-03) : **3 échecs / 6** (`--repeat-each=6`). Prouvé pré-existant : même `--repeat-each=6` sur un worktree à `acde763` (21-04, avant tout commit de 21-03) donne **3 échecs / 6** ; et `git diff acde763..HEAD` ne touche que la surface invitée (aucun fichier du chemin démo/membre). Introduit par 21-04. Journalisé dans `deferred-items.md`, **non corrigé** (scope boundary).
- **`gsd_run` / `gsd-tools` absents sur cet hôte** : les verbes `state.*`, `roadmap.*`, `requirements.*` et `commit` sont indisponibles ; STATE.md/ROADMAP.md ont été édités manuellement et le commit de métadonnées est un `skipped_gitignored` (`.planning/` gitignoré, `.gitignore:74`) — chemin de succès, jamais de `git add -f` d'un chemin `.planning`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Les quatre surfaces de la phase 21 (fiche membre 21-01, impression 21-04, mode cuisine 21-04, page invitée 21-03) rendent désormais la photo d'étape, toutes alimentées par la même doctrine « chemin en colonne, URL signée à la lecture, échec fermé ».
- R3 et R4 sont clôturés (R4, partagé avec 21-02, est déclaré complet ici — dernier plan à le déclarer).
- Deux défauts pré-existants restent ouverts et consignés dans `deferred-items.md` : le contrat de schéma `0001_schema_contract.sql:52` (introduit par 21-01) et le flake e2e `recettes.spec.ts:270` (introduit par 21-04). Aucun ne bloque la phase, mais tous deux bloqueront `/gsd-ship` tant qu'ils restent `open`.

---

## Self-Check: PASSED

- `app/src/modules/recettes/api.ts` — FOUND
- `app/src/modules/recettes/guest-recipe-page.tsx` — FOUND
- `app/src/modules/recettes/guest-recipe-page.test.tsx` — FOUND
- Commit `c6611ce` — FOUND
- Commit `3645c3b` — FOUND

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Completed: 2026-10-16*
