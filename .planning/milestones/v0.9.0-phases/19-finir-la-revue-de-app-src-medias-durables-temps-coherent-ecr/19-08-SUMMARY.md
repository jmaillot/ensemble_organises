---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 08
subsystem: ui/api
tags: [supabase, storage, signed-url, react-query, d-01, d-03, wr-08, wr-10]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: app/src/lib/storage.ts — storedValueOf, isHouseholdMediaPath, householdMediaPathOf, replacedMediaPath, resolveHouseholdMediaUrls (point unique de 19-01)
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: app/src/modules/anniversaires/types.ts — displayablePhoto(stored, resolved, key) (point unique de la valeur affichable, 19-07)
provides:
  - "Courses : `products.photo_url` porte le CHEMIN du bucket, le catalogue et la fiche re-signent à la lecture (resolveProductPhotoUrls), le repli off_data.image_url reste prioritaire après la photo locale"
  - "Cadeaux : `gift_ideas.photo_url` / `gift_items.photo_url` portent le chemin ; la promotion idée→article copie la même nature ; le remplacement retire l'objet précédent (D-03)"
  - "toGiftItem/toGiftIdea exposent `photoStored` (valeur de colonne) à côté de `photoUrl` (valeur affichable), motif hérité de 19-07"
affects: [19-09, 19-11, 19-12, 19-13]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 12760
  tasks: 2
  commits: 2
  plan_head_before: 0363bbc458235a33ad9b3531d7d9d9b7753efbd9
  plan_head_after: 1db145110111dc1ed8cb5c353f8db55982a90556

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Écriture d'un média : storedValueOf(deposited) dans la colonne (jamais deposited.url)"
    - "Lecture d'un média : isHouseholdMediaPath → resolveHouseholdMediaUrls → displayablePhoto (échec fermé), carte de résolution passée en paramètre aux mappers"
    - "Remplacement d'un média : décision PRISE sur la valeur de colonne (replacedMediaPath), retirée en best-effort après succès, jamais sur l'URL affichable"
    - "Copie idée→article : la valeur transportée est photoStored (colonne), la copie garde la même nature"

key-files:
  created: []
  modified:
    - app/src/modules/courses/products-api.ts
    - app/src/modules/courses/components/product-sheet.tsx
    - app/src/modules/courses/components/product-catalog.tsx
    - app/src/modules/courses/components/shopping-group-card.tsx
    - app/src/modules/courses/courses-page.tsx
    - app/src/modules/courses/product-catalog-page.tsx
    - app/src/modules/courses/hooks/use-courses.ts
    - app/src/modules/courses/products-photo.test.ts
    - app/src/modules/courses/product-sheet-cleanup.test.tsx
    - app/src/modules/cadeaux/types.ts
    - app/src/modules/cadeaux/cadeaux-page.tsx
    - app/src/modules/cadeaux/hooks/use-cadeaux.ts
    - app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx
    - app/src/modules/cadeaux/components/gift-form-dialog.tsx
    - app/src/modules/cadeaux/cadeaux-page.test.tsx

key-decisions:
  - "La carte de résolution descent jusqu'aux cartes (ProductCatalog, ShoppingGroupCard) : le plan supposait à tort que ces composants consommaient déjà `entry.photoUrl` — ils lisaient la valeur brute."
  - "`photoStored` ajouté à GiftItem et GiftIdea (valeur de colonne), à côté de `photoUrl` : seule grandeur comparable d'une édition à l'autre, donc seule que le dialogue transporte quand la photo n'est pas touchée."
  - "`handlePromote` transmet `promotedIdea.photoStored` : `cadeaux/api.ts` (promoteIdeaToItem) reste inchangé et copie une colonne de même nature."
  - "`GiftFormDialog` (articles) ne dépose pas au bucket : il écrit un `data:`/`blob:` via `readPhoto`. On sépare `photoUrl` (valeur soumise) de `photoPreview` (aperçu affichable) plutôt que de les confondre."

patterns-established:
  - "read-side media resolution: isHouseholdMediaPath → resolveHouseholdMediaUrls → displayablePhoto, annulation stricte via témoin, useMemo déclare la carte en dépendance"
  - "replacement removal: replacedMediaPath(previousStored, nextStored) décide AVANT l'écriture, removeHouseholdFile best-effort APRÈS succès"

requirements-completed: [WR-08, WR-10]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Une photo de produit déposée porte le CHEMIN dans products.photo_url ; le catalogue et la fiche re-signent à la lecture, en échec fermé (D-01)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/courses/products-photo.test.ts#upload photo.jpg : dépôt en dossier products et photo_url = chemin du bucket"
        status: pass
      - kind: unit
        ref: "app/src/modules/courses/products-photo.test.ts (productPhotoUrl — valeur affichable)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Remplacer la photo d'un produit retire l'objet précédent du bucket, jamais le nouveau (D-03)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/courses/products-photo.test.ts#produit déjà connu : la nouvelle photo remplace et retire l’objet précédent (D-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Une photo d'idée cadeau déposée porte le CHEMIN dans gift_ideas.photo_url ; l'écran Cadeaux re-signe à la lecture via displayablePhoto (D-01)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/cadeaux-page.test.tsx#ajouter une idée avec photo : gift_ideas.photo_url porte le CHEMIN du bucket"
        status: pass
      - kind: unit
        ref: "app/src/modules/cadeaux/cadeaux-page.test.tsx#toGiftIdea : un chemin se signe, un data: hérité passe tel quel (D-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Remplacer la photo d'une idée cadeau pose le nouveau chemin et retire l'objet précédent du bucket (D-03)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/cadeaux-page.test.tsx#changer la photo d’une idée pose le nouveau chemin et retire l’objet précédent (D-03)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Promouvoir une idée à photo copie le CHEMIN (valeur de colonne) en article, jamais l'URL affichable (D-01, D-05)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/cadeaux/cadeaux-page.test.tsx#promouvoir une idée à photo copie le CHEMIN en article, pas l’URL affichée (D-01, D-05)"
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 08: Courses et Cadeaux — médias durables (le chemin en colonne, l'URL à la lecture) Summary

**Courses et Cadeaux écrivent le CHEMIN du bucket dans leurs colonnes média (`products.photo_url`, `gift_ideas.photo_url`, `gift_items.photo_url`) et re-signent à la lecture via le point unique de 19-01 (D-01, WR-08) ; remplacer un média retire l'objet précédent (D-03, WR-10) et la promotion idée→article copie une colonne de même nature.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-10-15T~21:55+02:00 (Task 1)
- **Completed:** 2026-10-15T22:36:36+02:00 (commit Task 2)
- **Tasks:** 2
- **Files modified:** 15 (dans `app/src`)

## Accomplishments
- `products.photo_url` reçoit désormais un **chemin de bucket** (`storedValueOf(deposited)`), jamais l'URL signée éphémère du dépôt. La fiche et le catalogue re-signent à la lecture via `resolveProductPhotoUrls` (D-01, WR-08) : à J+31, plus de photo produit morte.
- `gift_ideas.photo_url` reçoit le chemin ; l'écran Cadeaux le re-signe à la lecture via `displayablePhoto` (19-07), et `toGiftItem`/`toGiftIdea` exposent `photoStored` (colonne) à côté de `photoUrl` (affichable).
- Remplacer la photo d'un produit **ou** d'une idée cadeau retire l'objet précédent (`replacedMediaPath` décidé sur la valeur de colonne, retiré en best-effort après succès) — jamais le nouveau (D-03, WR-10).
- La promotion idée→article transmet `promotedIdea.photoStored` : la copie garde la même nature (chemin → chemin). `cadeaux/api.ts` reste inchangé.
- Le repli d'affichage `off_data.image_url` reste prioritaire après la photo locale ; une valeur non-chemin (URL externe héritée, `data:`) est rendue telle quelle et n'est jamais un objet de bucket à retirer.

## Task Commits

Each task was committed atomically:

1. **Task 1: Courses — photo produit en chemin, catalogue re-signé** - `4a67e99` (fix)
2. **Task 2: Cadeaux — colonne en chemin, promotion copie de même nature** - `1db1451` (fix)

**Plan metadata:** aucun commit de plan dédié — `.planning/` est gitignoré (`.gitignore:58`), le SUMMARY reste non commité par choix de configuration (`commit_docs: false`).

## Files Created/Modified
- `app/src/modules/courses/products-api.ts` - `productPhotoUrl(row, resolved)` via `householdMediaPathOf`, `resolveProductPhotoUrls`, repli `off_data.image_url` sur la valeur résolue
- `app/src/modules/courses/components/product-sheet.tsx` - `storedValueOf(deposited)`, retrait de l'objet remplacé
- `app/src/modules/courses/components/product-catalog.tsx` - prop `photoUrls`, aperçu de grille + édition, `storedValueOf`, remplacement + compensation
- `app/src/modules/courses/components/shopping-group-card.tsx` - transporte `photoUrls` jusqu'à la carte d'article
- `app/src/modules/courses/courses-page.tsx` - câblage `productPhotoUrls` → `ShoppingGroupCard`
- `app/src/modules/courses/product-catalog-page.tsx` - câblage `productPhotoUrls` → `ProductCatalog`
- `app/src/modules/courses/hooks/use-courses.ts` - état + effet de résolution (témoin d'annulation), `productPhotoUrls` exposé
- `app/src/modules/courses/products-photo.test.ts` - colonne = chemin, remplacement retire l'ancien, `productPhotoUrl` affichable
- `app/src/modules/courses/product-sheet-cleanup.test.tsx` - mock `@/lib/storage` élargi (importOriginal)
- `app/src/modules/cadeaux/types.ts` - `photoStored` sur `GiftItem`/`GiftIdea`, `toGiftItem`/`toGiftIdea` par `displayablePhoto`
- `app/src/modules/cadeaux/cadeaux-page.tsx` - `storedValueOf`, `replacedMediaPath`, `photoStored` transmis à la promotion
- `app/src/modules/cadeaux/hooks/use-cadeaux.ts` - résolution articles + idées (`isHouseholdMediaPath` → `resolveHouseholdMediaUrls`)
- `app/src/modules/cadeaux/components/gift-idea-form-dialog.tsx` - transporte `idea.photoStored` (colonne) si la photo n'est pas touchée
- `app/src/modules/cadeaux/components/gift-form-dialog.tsx` - sépare `photoUrl` (valeur soumise) de `photoPreview` (aperçu affichable)
- `app/src/modules/cadeaux/cadeaux-page.test.tsx` - mock `@/lib/storage` + cas « photos en colonne » (5 tests)

## Decisions Made
- **La carte de résolution descend jusqu'aux cartes.** Le plan affirmait que `ProductCatalog` et les suggestions « consomment déjà `entry.photoUrl` » : c'est **factuellement faux** — ils lisaient la valeur stockée brute. Il a fallu enfiler `photoUrls: Record<string,string>` de `use-courses.ts` jusqu'à `ProductCatalog` et `ShoppingGroupCard`, sinon le chemin brut (non signé) serait tombé dans le DOM.
- **`photoStored` ajouté aux deux types cadeaux.** Le plan disait « aucun autre champ ne change » ; sans `photoStored`, l'édition d'une photo non retouchée aurait re-soumis `photoUrl` (URL signée) et rouvert WR-08 — le motif exact que 19-07 a posé sur `Birthday`/`Contact`/`Pet`.
- **`handlePromote` transmet `photoStored`.** `cadeaux/api.ts:promoteIdeaToItem` copie `idea.photo_url` ; il reste inchangé et reçoit une colonne. Transmettre `photoUrl` aurait copié une URL signée (ou `null` en démo).
- **`GiftFormDialog` : deux états séparés.** Ce formulaire (articles) n'appelle pas `depositHouseholdFile` — il écrit un `data:`/`blob:` via `readPhoto`. On sépare la valeur soumise (`photoUrl`, colonne) de l'aperçu (`photoPreview`, affichable) ; aucun retrait d'objet au remplacement (le chemin appartient à la photo partagée de l'idée).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] La carte de résolution devait être enfilée jusqu'aux cartes (Task 1)**
- **Found during:** Task 1 (Courses)
- **Issue:** Le plan affirmait que `ProductCatalog` et les suggestions consommaient déjà `entry.photoUrl`. En réalité ils lisaient la valeur brute de la colonne. Une fois la colonne passée au chemin, le DOM aurait reçu un chemin brut non signé (image morte) — l'inverse du but de D-01.
- **Fix:** Exposer `productPhotoUrls` depuis `use-courses.ts`, le faire descendre par `courses-page.tsx` → `ShoppingGroupCard` et `product-catalog-page.tsx` → `ProductCatalog` ; les composants lisent la valeur résolue.
- **Files modified:** `app/src/modules/courses/hooks/use-courses.ts`, `courses-page.tsx`, `product-catalog-page.tsx`, `components/product-catalog.tsx`, `components/shopping-group-card.tsx`
- **Verification:** `npm test -- src/modules/courses` vert ; `npm run typecheck` vert ; preuve rouge sur l'assertion de chemin.
- **Committed in:** `4a67e99` (Task 1 commit)

**2. [Rule 2 - Missing critical] `photoStored` ajouté à `GiftItem`/`GiftIdea` (Task 2)**
- **Found during:** Task 2 (Cadeaux)
- **Issue:** Le plan disait « aucun autre champ ne change » dans `types.ts`. Sans une valeur de colonne distincte de l'affichable, éditer une idée sans toucher sa photo aurait re-soumis `photoUrl` (URL signée forgée à la lecture) — soit WR-08 rouvert par la porte de l'édition.
- **Fix:** Ajouter `photoStored: string | null` aux deux interfaces, alimenté par `row.photo_url` ; `toGiftItem`/`toGiftIdea` passent par `displayablePhoto`. Le motif est identique à `Birthday`/`Contact`/`Pet`. `handlePromote` transmet `photoStored`.
- **Files modified:** `app/src/modules/cadeaux/types.ts`, `cadeaux-page.tsx`
- **Verification:** `npm test -- src/modules/cadeaux` vert (85 tests) ; `npm run typecheck` vert ; preuve rouge sur la promotion.
- **Committed in:** `1db1451` (Task 2 commit)

**3. [Rule 3 - Blocking] Mocks de `@/lib/storage` élargis pour prouver le chemin (Tasks 1 et 2)**
- **Found during:** Tasks 1 et 2 (tests)
- **Issue:** En démo, `depositHouseholdFile` rend `path: null` : sans mock du dépôt, un chemin ne peut pas être observé en colonne, et `removeHouseholdFile` n'est jamais appelé. Par ailleurs, un mock naïf (sans `importOriginal`) rendrait `storedValueOf`/`replacedMediaPath`/résolution `undefined`.
- **Fix:** `vi.mock('@/lib/storage', …)` avec `importOriginal` étalé, en ne remplaçant que `depositHouseholdFile`/`removeHouseholdFile` ; jsdom n'a pas `URL.createObjectURL`, stubé par `Object.assign(URL, {…})` (sans casser `new URL`).
- **Files modified:** `app/src/modules/courses/products-photo.test.ts`, `app/src/modules/courses/product-sheet-cleanup.test.tsx`, `app/src/modules/cadeaux/cadeaux-page.test.tsx`
- **Verification:** suites ciblées vertes ; `npm test` complet vert.
- **Committed in:** `4a67e99` (Task 1) et `1db1451` (Task 2)

**4. [Rule 2 - Missing critical] Extension de `cadeaux-page.test.tsx` (fichier hors liste implicite du plan)**
- **Found during:** Task 2 (Cadeaux)
- **Issue:** Le plan listait `cadeaux-page.test.tsx` comme fichier modifié mais ne décrivait pas de cas ; le `<behavior>` exige la preuve « colonne = chemin », « remplacement ⇒ retrait », « promotion copie de même nature ».
- **Fix:** Ajout d'un bloc `describe('CadeauxPage — photos en colonne …')` : 2 cas unitaires (`toGiftItem`/`toGiftIdea`) + 3 cas d'écran (création idée, remplacement, promotion), avec mock `@/lib/storage` et stub `URL.createObjectURL`.
- **Files modified:** `app/src/modules/cadeaux/cadeaux-page.test.tsx`
- **Verification:** `npx vitest run src/modules/cadeaux` vert (5 fichiers / 85 tests).
- **Committed in:** `1db1451` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (4 missing-critical Rule 2, dont 1 blocage Rule 3 intégré)
**Impact on plan:** Nécessaires à la correction et à la preuve. Aucune dérive de périmètre : le code suit l'objectif du plan (D-01/D-03/WR-08/WR-10) ; trois fichiers de composants courses et un type cadeaux ont été ajoutés pour que la règle tienne jusqu'à l'affichage et jusqu'à l'édition.

## Issues Encountered
- **Course test → assertion (Tasks 1 et 2).** La première version du test de remplacement asserait `removeHouseholdFile` juste après un `waitFor` sur la valeur en base : le `waitFor` se libérait **avant** que le handler asynchrone n'atteigne le retrait (l'écriture précède le retrait). Diagnostiqué par instrumentation temporaire (les logs ont montré `previousPath` non nul et le retrait non encore exécuté). Corrigé en attendant explicitement l'appel du retrait (`await waitFor(() => expect(removeMock)…)`). Aucun code applicatif n'était en cause.
- **`gsd_run` indisponible en shell.** Le wrapper `gsd_run` du prompt n'existe pas dans ce shell ; les verbes GSD ont été invoqués via `node …/gsd-tools.cjs query …`. `git.base-branch --is-protected main` rend `false` (grâce à `git.allow_default_branch_commits: true`), d'où commit sur `main` assumé (aligné sur 19-07).

## Red Proofs (preuve rouge→vert)
- **Task 1** : assertion « la colonne produit contient un chemin » mutée en « l'URL du mock » → échec constaté, restaurée → vert.
- **Task 2 — retrait** : ligne `if (previousPath) await removeHouseholdFile(previousPath)` neutralisée → échec constaté (`Number of calls: 0`), restaurée → vert.
- **Task 2 — promotion** : `photo_url: promotedIdea.photoStored` mutée en `promotedIdea.photoUrl` → échec constaté (`expected null to be 'household-martin/cadeaux/idee.webp'`), restaurée → vert.
- **Task 2 — écriture** : `photoUrl = storedValueOf(deposited)` mutée en `deposited.url` → échec constaté (`expected 'https://signed.example/…' to be 'household-martin/cadeaux/fichier.webp'`), restaurée → vert.
- Aucun résidu d'instrumentation : `grep -rn "deposited.url\|RED-PROOF\|DBG" app/src/modules/{courses,cadeaux}` **vide**.

## Verification Chain (résultats réels)

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | vert (exit 0) |
| Suite complète | `cd app && npm test` | vert — **131 fichiers / 1102 tests** passés, `EXIT=0` (base : 131 / 1092) |
| Tests ciblés cadeaux | `npx vitest run src/modules/cadeaux` | vert — 5 fichiers / 85 tests |
| Tests ciblés courses | `npx vitest run src/modules/courses` | vert — 11 fichiers / 143 tests (Task 1) |
| Build | `cd app && npm run build` | vert (exit 0) |
| E2E | `cd app && npm run test:e2e` | vert — **121 passés / 5 ignorés** (inchangé) |
| SQL statique | `python3 scripts/check-sql-statique.py` | vert (exit 0) — « 180 fonction(s) effective(s) … aucun défaut » |
| Verrou non-régression | `grep -rn "deposited.url" app/src/modules/{courses,cadeaux}` | **vide** |

**Leverage SQL** : ce plan n'ajoute **aucune migration** — `scripts/migrate.sh`, `sh scripts/test-db.sh` et `sh scripts/test-dispatch-push.sh` n'ont **aucun levier** ici ; le contrôle statique suffit, et il est vert. Docker est disponible mais rien de ce plan ne s'y exécute : le dire, plutôt que de laisser croire à une validation SQL.

## Threat Surface Scan
Aucune surface nouvelle : les colonnes média existaient déjà, seule leur **valeur** change (chemin au lieu d'URL signée). Les mitigations du plan sont implémentées — T-19-17 (plus d'URL signée persistée), T-19-18 (chemin fourni par le client reste `accept`, la signature ne franchit pas la RLS). Aucun paquet ajouté (T-19-SC respectée). Aucun `threat_flag` nouveau.

## Next Phase Readiness
- Courses et Cadeaux sont alignés sur le point unique de 19-01 ; D-01 est une règle de classe tenue jusqu'à l'affichage et jusqu'à l'édition.
- `photoStored` est en place côté Cadeaux, comme il l'est côté Anniversaires/Contacts/Animaux (19-07) — motif réutilisable par 19-09/19-11/19-12/19-13.
- Laissé intact volontairement (hors périmètre de ce plan) : `cadeaux/api.ts` (`promoteIdeaToItem` inchangé, reçoit une colonne), les suppressions compensatoires des autres modules (→ 19-09).
- Fichiers non suivis préexistants laissés intacts : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs` (déjà relevés en `deferred-items.md` §9).

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED
- FOUND: `.planning/phases/19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr/19-08-SUMMARY.md`
- FOUND: commits `4a67e99`, `1db1451`
- FOUND: `app/src/modules/courses/products-api.ts`, `app/src/modules/cadeaux/types.ts`, `app/src/modules/cadeaux/cadeaux-page.test.tsx`
- Measured commit count over `0363bbc..HEAD` = 2 ; full suite: 131 files / 1102 tests, EXIT=0
