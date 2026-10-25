---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 11
subsystem: données
tags: [compensation, écritures-composées, supabase, react-query, ardoise, split-equal, voyages, recettes, anniversaires, foyer]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "19-07 — recettes/anniversaires déposent déjà via le helper partagé (isMutating, chemin, échec fermé) ; 19-08 — primitive upsert/remove du client de données"
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18 — primitives data.upsert/remove/removeWhere (DataError sur 0 ligne sauf { ifMissing: 'ignore' })"
provides:
  - "WR-09 — la seconde étape en échec annule la première : créer un voyage / une recette / un anniversaire / un foyer sans son second temps (couverture, contact miroir, token) ne laisse AUCUNE ligne après coup"
  - "WR-20 — le partage égal invité utilise splitEqual (centimes entiers, reliquat reporté sur la dernière part), la même règle que le chemin membre de l'Ardoise ; plus d'écart rejeté par le RPC create_trip_guest_expense"
affects: [verify-work, secure-phase, 19-12, 19-13]

# Actuals (#2632) — chars/4 over the realized diff (added+removed), never a harness token count.
actuals:
  tokens: 7846
  tasks: 3
  commits: 3
  plan_head_before: 86944da5dd60f21f15c5cfb2a2d0fdbb3d3f9a1f
  plan_head_after: 99bc8ce05b4384828afb424cb51eb08571657a9f

tech-stack:
  added: []
  patterns:
    - "Compensation ligne → ligne : la seconde étape en échec annule la première (deleteTrip / deleteRecipe / deleteBirthday / data.remove + household-store.reset), en try interne tentée puis avalée — c'est toujours l'erreur D'ORIGINE qui remonte, la compensation ne masque rien"
    - "Compensation conditionnelle à la création : une ligne préexistante (édition) n'est JAMAIS supprimée par la compensation ; seule une ligne créée dans le même appel est rattrapée"
    - "Preuve rouge→vert par mutation d'assertion sur une relecture de table, pas sur un mock : la propriété assertée est « la ligne ne subsiste pas », pas « remove a été appelé »"

key-files:
  created:
    - app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx
    - app/src/modules/landing/create-household-page.test.tsx
  modified:
    - app/src/modules/voyages/api.ts
    - app/src/modules/recettes/hooks/use-recettes.ts
    - app/src/modules/voyages/trip-create-dialog.test.tsx
    - app/src/modules/recettes/recipe-cover.test.ts
    - app/src/modules/anniversaires/hooks/use-anniversaires.ts
    - app/src/modules/landing/create-household-page.tsx
    - app/src/modules/voyages/components/trip-budget-tab.tsx
    - app/src/modules/voyages/trip-budget-tab.test.tsx

key-decisions:
  - "D-08 appliqué à la lettre : compensation, pas inversion d'ordre — le second temps (dépôt de couverture, token, contact miroir) a besoin de l'identifiant rendu par le premier, donc la ligne part d'abord et se rattrape en cas d'échec"
  - "L'erreur d'origine remonte TOUJOURS : la compensation est tentée dans un try/catch interne puis avalée ; l'échec d'une compensation ne remplace jamais la cause réelle présentée à l'utilisateur (T-19-31)"
  - "splitEqual importé de @/modules/ardoise/types, jamais recopié dans voyages/ (D-10) : deux copies de la même règle divergeraient, et le RPC vérifie la somme au centime"
  - "createTrip compense dans LES DEUX modes (Supabase et démo) : en démo, deleteTrip(tripId) remplace le nettoyage partiel qui retirait l'objet Storage sans retirer la ligne"
  - "Foyer : la compensation retire la ligne + l'appartenance locale (removeWhere ifMissing:ignore) + household-store.reset(), sinon la session pointerait vers un foyer supprimé"

patterns-established:
  - "Le partage invité indexe la part sur la liste concaténée [...selectedMembers, ...selectedGuests] : la part majorée revient toujours à un participant réellement sélectionné, jamais à un index hors liste"

requirements-completed: [WR-09, WR-20]

coverage:
  - id: D1
    description: "Créer un voyage dont le dépôt de couverture échoue ne laisse aucune ligne : le voyage créé est annulé (deleteTrip) dans les deux modes, et l'erreur d'origine remonte ; sans fichier de couverture, aucun retrait."
    requirement: WR-09
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/trip-create-dialog.test.tsx#retire le voyage créé (deleteTrip) et propage l'erreur d'origine"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/trip-create-dialog.test.tsx#sans fichier de couverture, aucun retrait (rien à compenser)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Créer une recette dont le dépôt de couverture échoue ne laisse aucune ligne : la recette créée est supprimée et l'erreur remonte ; une recette ÉDITÉE n'est jamais supprimée (elle préexistait)."
    requirement: WR-09
    verification:
      - kind: unit
        ref: "app/src/modules/recettes/recipe-cover.test.ts#recette NOUVELLE : un dépôt en échec supprime la recette créée"
        status: pass
      - kind: unit
        ref: "app/src/modules/recettes/recipe-cover.test.ts#recette EXISTANTE : un dépôt en échec ne la supprime pas"
        status: pass
    human_judgment: false
  - id: D3
    description: "Créer un anniversaire avec contact miroir dont la création échoue ne laisse aucune ligne : l'anniversaire créé est supprimé et l'erreur remonte ; sans contact demandé, l'anniversaire est conservé."
    requirement: WR-09
    verification:
      - kind: unit
        ref: "app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx#retire l'anniversaire créé quand le contact miroir échoue"
        status: pass
      - kind: unit
        ref: "app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx#sans contact demandé, l'anniversaire est conservé"
        status: pass
    human_judgment: false
  - id: D4
    description: "Créer un foyer dont la génération du token échoue ne laisse aucune ligne : le foyer créé est retiré, le store de foyer remis à vide, l'écran « Votre foyer est prêt » n'apparaît pas et l'erreur remonte."
    requirement: WR-09
    verification:
      - kind: unit
        ref: "app/src/modules/landing/create-household-page.test.tsx#token en échec : le foyer est retiré, le store remis à vide, l'erreur affichée"
        status: pass
      - kind: unit
        ref: "app/src/modules/landing/create-household-page.test.tsx#création réussie : affiche « Votre foyer est prêt » et le token"
        status: pass
    human_judgment: false
  - id: D5
    description: "Le partage égal invité répartit en centimes entiers par splitEqual (reliquat reporté sur la dernière part) : la somme vaut exactement le montant, le nombre de parts vaut le nombre de participants, et un montant indivisible reste refusé par la validation existante."
    requirement: WR-20
    verification:
      - kind: unit
        ref: "app/src/modules/voyages/trip-budget-tab.test.tsx#50 € entre 6 : la somme des parts vaut exactement 50,00 (reliquat reporté)"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/trip-budget-tab.test.tsx#10 € entre 3 : aucun centime non alloué"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/trip-budget-tab.test.tsx#cas mixte membres + invités : somme = montant, reliquat au dernier participant"
        status: pass
      - kind: unit
        ref: "app/src/modules/voyages/trip-budget-tab.test.tsx#montant indivisible (0,01 € entre 2) : refusé par la validation, aucune part inventée"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-10-16
status: complete
---

# Phase 19 Plan 11: Écritures composées et partage égal — la seconde étape qui échoue annule la première Summary

**Les quatre sites d'écriture en deux temps (voyage, recette, anniversaire, foyer) rattrapent désormais la ligne créée quand leur second temps échoue — la couverture, le contact miroir ou le token — et le partage égal invité emprunte `splitEqual`, la règle déjà en vigueur chez les membres**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-15T21:41:00Z (juste après la clôture de 19-10)
- **Completed:** 2026-10-16T00:13:38+02:00
- **Tasks:** 3
- **Files modified:** 10 (8 modifiés, 2 créés)

## Accomplishments

- **WR-09 — Voyages (Task 1)** : `createTrip` (`voyages/api.ts`) compense désormais dans **les deux** chemins. En Supabase, un `uploadTripCover` en échec appelle `await deleteTrip(tripId)` avant de relancer l'erreur d'origine ; en démo, `deleteTrip(tripId)` remplace le nettoyage partiel qui ne retirait que l'objet Storage — la ligne du voyage subsistait, c'est le doublon que la revue décrivait. Sans fichier de couverture, aucun appel de suppression (rien à compenser).
- **WR-09 — Recettes (Task 1)** : `saveRecipe` (`recettes/hooks/use-recettes.ts`) distingue création et édition. Sur une recette **nouvelle**, l'échec du dépôt de couverture supprime la recette créée (`deleteRecipe(saved.id, null)`) ; sur une recette **existante**, elle est conservée et seul le dépôt neuf est retiré. L'erreur de l'upload reste celle qui remonte.
- **WR-09 — Anniversaires (Task 2)** : dans `saveMutation` (`anniversaires/hooks/use-anniversaires.ts`), le `catch` autour de `createContactFromBirthday` appelle `deleteBirthday(row.id)` avant de relancer. Fini le « Anniversaire enregistré, mais le contact n'a pas pu être créé » qui, en resoumettant, créait un **second** anniversaire. Seul le cas création (`!id`) est compensé ; l'édition conserve la ligne préexistante.
- **WR-09 — Foyer (Task 2)** : `create-household-page.tsx`, si la génération du token échoue après la création du foyer, `onSubmit` retire la ligne (`data.remove('households', household.id)`), retire l'appartenance locale (`data.removeWhere('household_members', { household_id }, { ifMissing: 'ignore' })`) et remet `useHouseholdStore.getState().reset()`. L'écran « Votre foyer est prêt » n'apparaît jamais sur un token en échec, et l'utilisateur peut réessayer sans créer un second foyer.
- **WR-20 — Partage invité (Task 3)** : `trip-budget-tab.tsx` remplace `const share = Math.round((parsed / sharers) * 100) / 100` (attribué **identiquement** à chaque part, ce qui laissait un reliquat rejeté par le RPC `create_trip_guest_expense`) par `splitEqual(parsed, sharers)` importé de `@/modules/ardoise/types` — la fonction du chemin membre. La part d'indice `i` revient au participant d'indice `i` de `[...selectedMembers, ...selectedGuests]`, donc la part majorée tombe toujours sur un participant réellement sélectionné. 50 € entre 6 somme désormais exactement 50,00 (au lieu de 49,98).
- **Chaîne verte** : `typecheck` OK, cible 4 modules **34 fichiers / 231 tests** verts, suite complète **134 fichiers / 1145 cas** (base 132 / 1133 ; +2 fichiers, +12 cas), `build` OK, `test:e2e` **121 passés / 5 ignorés / 0 échec**, `check-sql-statique.py` **aucun défaut**.

## Task Commits

Chaque tâche a été commitée atomiquement :

1. **Task 1 : Voyages et recettes — la couverture en échec emporte la ligne** — `517eebf` (fix)
2. **Task 2 : Anniversaire et foyer — la seconde étape qui échoue annule la première** — `2236b82` (fix)
3. **Task 3 : Le partage égal invité suit la règle des membres (WR-20, D-10)** — `99bc8ce` (fix)

_Le commit de métadonnées du plan est omis : `commit_docs: false` (voir « Notes d'exécution »)._

## Files Created/Modified

- `app/src/modules/voyages/api.ts` — `createTrip` : compensation `deleteTrip(tripId)` dans les deux modes avant de propager l'erreur d'origine
- `app/src/modules/recettes/hooks/use-recettes.ts` — `saveRecipe` : `deleteRecipe(saved.id, null)` sur création en échec de couverture, recette éditée conservée
- `app/src/modules/anniversaires/hooks/use-anniversaires.ts` — `saveMutation` : `deleteBirthday(row.id)` dans le `catch` du contact miroir, cas création uniquement
- `app/src/modules/landing/create-household-page.tsx` — `onSubmit` : compensation foyer + appartenance locale + `household-store.reset()` quand le token échoue
- `app/src/modules/voyages/components/trip-budget-tab.tsx` — soumission invité par `splitEqual(parsed, sharers)` indexé sur la liste concaténée membres + invités
- `app/src/modules/voyages/trip-create-dialog.test.tsx` — 2 cas ajoutés : retrait du voyage créé + propagation, et absence de retrait sans couverture
- `app/src/modules/recettes/recipe-cover.test.ts` — 2 cas ajoutés : recette nouvelle supprimée, recette existante conservée
- `app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx` — **créé** (déviation) : 2 cas, anniversaire retiré sur échec du contact, conservé sans contact
- `app/src/modules/landing/create-household-page.test.tsx` — **créé** : 2 cas, création réussie (token + QR) et token en échec (foyer retiré, store vide, erreur affichée)
- `app/src/modules/voyages/trip-budget-tab.test.tsx` — 4 cas ajoutés : 50/6, 10/3, mixte membres+invités, indivisible refusé

## Decisions Made

- **D-08 : compensation, pas inversion d'ordre.** Le second temps a besoin de l'identifiant rendu par le premier (le chemin de couverture, le token, le contact). Réordonner est impossible ; on rattrape donc la ligne créée en cas d'échec.
- **L'erreur d'origine est sacrée.** La compensation est tentée dans un `try/catch` interne puis avalée : un échec de la compensation ne remplace jamais la cause réelle (T-19-31). L'utilisateur garde toujours la cause réelle de l'échec.
- **Compensation conditionnelle à la création.** Sur une édition (recette existante, anniversaire préexistant), la ligne n'est jamais supprimée — seul un dépôt neuf partiel est retiré.
- **`splitEqual` importé, jamais recopié** (D-10). La fonction vit dans `@/modules/ardoise/types` ; `voyages/` l'importe. Deux copies divergeraient et le RPC vérifie la somme au centime.
- **`createTrip` compense en démo aussi.** `deleteTrip(tripId)` remplace le nettoyage partiel qui retirait l'objet sans la ligne — c'est précisément le défaut.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fichier de test `anniversaires/hooks/use-anniversaires.test.tsx` créé**
- **Found during:** Task 2 (Anniversaire et foyer)
- **Issue:** Le `<done>` de la tâche exige que la compensation de l'anniversaire soit « prouvée par un test », mais `files_modified` du plan ne liste aucun fichier de test pour le module anniversaires (seul `create-household-page.test.tsx` y figure). Aucun harnais n'existait pour prouver « l'anniversaire ne subsiste pas ».
- **Fix:** Nouveau `app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx` (2 cas) qui exerce `saveMutation` directement avec `createContactFromBirthday` en échec.
- **Files modified:** `app/src/modules/anniversaires/hooks/use-anniversaires.test.tsx` (créé)
- **Verification:** `npm test -- src/modules/anniversaires` vert ; la preuve rouge a été capturée (voir ci-dessous).
- **Committed in:** `2236b82` (Task 2)

**2. [Rule 3 - Blocking] Preuve du chemin Supabase de `createTrip` par getter hissé + `vi.spyOn`**
- **Found during:** Task 1 (Voyages)
- **Issue:** Le chemin Supabase de `createTrip` n'était pas prouvable en important simplement `api.ts` : `data` (adaptateur) est lié **une fois** à la résolution d'import (`app/src/lib/data/index.ts`) selon `isSupabaseConfigured`, alors que `createTrip` lit ce drapeau au moment de l'appel. Un `vi.mock` posé après import ne basculerait donc pas l'adaptateur déjà capturé.
- **Fix:** `isSupabaseConfigured` hissé en getter mutable dans `vi.hoisted`, et `vi.spyOn(data, 'remove')` pour observer le retrait effectif ; le test « retire le voyage créé (deleteTrip) » exerce ainsi le chemin Supabase réel.
- **Files modified:** `app/src/modules/voyages/trip-create-dialog.test.tsx`
- **Verification:** le cas vert observe `deleteTrip` appelé avec l'identifiant du voyage créé ; la mutation d'assertion le rend rouge (voir Preuves).
- **Committed in:** `517eebf` (Task 1)

---

**Total deviations:** 2 auto-corrigées (2 bloquantes / Rule 3)
**Impact on plan:** Les deux découlent directement de l'exigence du plan (preuve « aucune ligne ne subsiste », site par site). Aucun élargissement de périmètre ; les fichiers de production touchés sont exactement ceux de `files_modified` (plus un fichier de test créé, sans lequel la preuve exigée était impossible).

## Preuves rouge → vert (exigées par le plan)

Chaque correction a été prouvée par mutation puis restauration. La propriété assertée est **« la ligne ne subsiste pas »** (relecture de table), pas « la suppression a été appelée » :

1. **Task 1 — Voyages** : sur le code d'avant, la compensation n'existait pas — l'assertion « le voyage créé n'existe plus » échouait (le voyage **subsistait** après échec de couverture ; l'observation `deleteTrip` restait à **0 appel**). Après correction : `deleteTrip` appelé avec l'identifiant, ligne absente → vert.
2. **Task 1 — Recettes** : sur le code d'avant, la recette **nouvelle subsistait** après un dépôt de couverture en échec → l'assertion « la ligne a disparu » échouait. Après : la ligne est partie → vert. Le cas édition reste vert (la recette préexistante n'est pas supprimée).
3. **Task 2 — Anniversaires** : sur le code d'avant, l'anniversaire **subsistait** après échec du contact miroir → l'assertion échouait. Après : `deleteBirthday(row.id)` → ligne absente → vert.
4. **Task 2 — Foyer** : sur le code d'avant, le foyer **subsistait** après échec du token (et la session pointait vers lui) → l'assertion échouait. Après : foyer retiré, store vide → vert.
5. **Task 3 — Partage invité** : sur le code d'avant, la somme des 6 parts de 50 € valait **49,98** → l'assertion « la somme vaut 50,00 » échouait. Après : `splitEqual` reporte le reliquat → **50,00** exactement → vert.

## Issues Encountered

- **Chemin Supabase de `createTrip` non exposé par un simple import** : résolu par le getter hissé + `vi.spyOn` (déviation 2 ci-dessus). C'est un problème de harnais de test, pas de code de production.
- **Suite complète longue** (~7–8 min) : lancée en tâche de fond ; le seul échec est préexistant et étranger au plan (voir ci-dessous).

## Verification Chain

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | OK (exit 0) |
| Ciblé | `cd app && npm test -- src/modules/voyages src/modules/recettes src/modules/anniversaires src/modules/landing` | **34 fichiers / 231 tests** verts |
| Tests complets | `cd app && npm test` | 134 fichiers / 1145 cas — **4 échecs préexistants** (`use-notifications.test.tsx`, §11 de `deferred-items.md`), étrangers au plan |
| Build | `cd app && npm run build` | OK (exit 0) |
| E2E | `cd app && npm run test:e2e` | 121 passés / 5 ignorés / **0 échec** |
| SQL statique | `python3 scripts/check-sql-statique.py` | **aucun défaut** |

**Les 4 échecs de `npm test` ne sont pas de ce plan.** Reproduits **en isolation** et sur `HEAD` = **86944da** (avant tout commit de 19-11, dans un worktree jetable) à l'identique : ce sont 4 `Test timed out in 5000ms` de `app/src/hooks/use-notifications.test.tsx`, un fichier que ce plan ne touche pas. Consigné en §11 de `deferred-items.md`. Sur ses propres périmètres (voyages, recettes, anniversaires, landing), 19-11 est entièrement vert.

**Pas de levier `migrate.sh` / `test-db.sh` :** ce plan ne modifie **aucune** migration ni fonction SQL. Le RPC `create_trip_guest_expense` (`0056_ardoise_guests_parts.sql`) est côté serveur inchangé — c'est justement parce qu'il vérifie la somme au centime que le client doit désormais produire des centimes entiers. `check-sql-statique.py` a été exécuté comme l'exige la chaîne de phase, mais il n'a rien à apprendre de ce plan : ni passage obligatoire, ni preuve manquante à déclarer pour `test-db.sh`.

## Threat Flags

None — ce plan **réduit** la surface de son propre registre : T-19-29 (ligne créée sans compensation) fermé par les compensations des Tasks 1-2, T-19-30 (somme des parts) fermé par `splitEqual` (Task 3), T-19-31 (compensation qui masque l'erreur) traité par la doctrine « l'erreur d'origine remonte toujours ». Aucun nouvel endpoint, chemin d'auth, accès fichier ni changement de schéma. Aucun paquet ajouté (T-19-SC non déclenché).

## Known Stubs

None — le balayage des fichiers créés/modifiés n'a trouvé ni valeur vide codée en dur alimentant un rendu, ni texte de remplacement, ni composant sans source de données. Les `placeholder` HTML des champs de formulaire sont légitimes.

## Notes d'exécution

- **`commit_docs: false`** : tous les commits de tâche sont des commits de **code** uniquement. Ce SUMMARY reste **non commité**, comme le veut la configuration du projet (`.planning/` est par ailleurs gitignoré — voir `.gitignore:58`).
- **`deferred-items.md` mis à jour** (non commité) : §11 (les 4 timeouts préexistants de `use-notifications.test.tsx`) et §12 (réconciliation du décompte `npm test` : base 132/1133 → 134/1145, dont +2 fichiers et +12 cas de ce plan).
- **Arithmétique du plan corrigée** : la prose de Task 3 annonce « 5 × 8,34 + 8,30 » pour 50/6 ; c'est inexact. `splitEqual(50, 6)` produit `5 × 8,33 + 8,35 = 50,00`. Les tests assertent **la somme** (50,00) et le **nombre de parts**, pas une distribution particulière — c'est la propriété que le RPC vérifie.
- **Indivisibilité bornée** : `0,01 € entre 2` donne une part ≤ 0, que `toTripGuestExpenseBody` refuse (`'Part invalide.'`). Ce comportement de validation existant est conservé, jamais contourné par une part négative ou nulle inventée.
- Fichiers non suivis préexistants laissés intacts : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`.

## Next Phase Readiness

- WR-09 clos côté frontend : les quatre sites d'écriture composée (voyages, recettes, anniversaires, foyers) portent une compensation prouvée « aucune ligne ne subsiste ».
- WR-20 clos : le partage égal invité partage l'unique règle `splitEqual` avec le chemin membre.
- Prêt pour `/gsd-verify-work` : les cinq livrables ont une couverture unitaire prouvée (voir `coverage:`), aucun jugement humain requis.
- Aucune migration ajoutée : rien à valider côté base. `use-notifications.test.tsx` (§11) reste à porter par la phase/plan qui possède ce hook — hors périmètre 19-11.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-16*

## Self-Check: PASSED

- Fichiers : SUMMARY, `voyages/api.ts`, `recettes/hooks/use-recettes.ts`, `anniversaires/hooks/use-anniversaires.ts`, `anniversaires/hooks/use-anniversaires.test.tsx`, `landing/create-household-page.tsx`, `landing/create-household-page.test.tsx`, `voyages/components/trip-budget-tab.tsx` — tous FOUND
- Commits : `517eebf`, `2236b82`, `99bc8ce` — tous FOUND
- `commits` mesuré (`git rev-list --count 86944da..HEAD`) = **3**
