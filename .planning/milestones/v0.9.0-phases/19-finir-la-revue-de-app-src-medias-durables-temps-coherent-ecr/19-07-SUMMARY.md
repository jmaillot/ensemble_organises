---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 07
subsystem: ui/api
tags: [supabase, storage, signed-url, react-query, mutations, d-01, wr-08, wr-11, d-09]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: app/src/lib/storage.ts — storedValueOf, isHouseholdMediaPath, resolveHouseholdMediaUrls (point unique de 19-01)
provides:
  - "displayablePhoto(stored, resolved, key) — point unique de la valeur affichable d'un média (échec fermé), exporté par anniversaires/types.ts"
  - "Anniversaires, Contacts et Animaux : les colonnes média portent le chemin du bucket, l'URL signée est forgée à la lecture"
  - "Animaux : isMutating dit la vérité pendant les écritures ; addFiles rapporte un envoi partiel comme partiel et invalide toujours"
affects: [19-08, 19-09, 19-11, 19-12, 19-13]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 15188
  tasks: 3
  commits: 3
  plan_head_before: 8cbe258bc1d32bdb5bcae1c5df60770879caebda
  plan_head_after: 0363bbc458235a33ad9b3531d7d9d9b7753efbd9

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lecture d'un média : isHouseholdMediaPath → resolveHouseholdMediaUrls → displayablePhoto (échec fermé, jamais le chemin brut ni un lien mort)"
    - "Écriture d'un média : storedValueOf(deposited) dans la colonne (jamais deposited.url)"
    - "Drapeaux d'écriture : useMutation par hook, isMutating = Σ isPending (jamais resource.isMutating)"

key-files:
  created:
    - app/src/modules/animaux/hooks/use-animaux.test.tsx
  modified:
    - app/src/modules/anniversaires/types.ts
    - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
    - app/src/modules/anniversaires/hooks/use-anniversaires.ts
    - app/src/modules/anniversaires/types.test.ts
    - app/src/modules/anniversaires/anniversaires-aggregation.test.tsx
    - app/src/modules/contacts/types.ts
    - app/src/modules/contacts/components/contact-form-dialog.tsx
    - app/src/modules/contacts/hooks/use-contacts.ts
    - app/src/modules/contacts/api.test.ts
    - app/src/modules/animaux/api.ts
    - app/src/modules/animaux/types.ts
    - app/src/modules/animaux/hooks/use-animaux.ts
    - app/src/modules/animaux/api.test.ts
    - app/src/modules/animaux/components/pet-attachments-panel.tsx
    - app/src/modules/animaux/components/pet-form-dialog.tsx

key-decisions:
  - "displayablePhoto reste unique : Anniversaires l'exporte, Contacts et Animaux l'importent (même doctrine que normalizeContactName → normalizePersonName)."
  - "L'édition transporte la valeur de COLONNE (photoStored), jamais l'URL affichée : re-soumettre une URL signée rouvrirait WR-08."
  - "addFiles tente TOUS les fichiers, invalide dans tous les cas, puis lève une erreur nommant le nombre d'échecs — un succès partiel se dit partiel."

patterns-established:
  - "read-side media resolution: isHouseholdMediaPath → resolveHouseholdMediaUrls → displayablePhoto, annulation stricte via témoin, useMemo déclare la carte en dépendance"
  - "write flags via useMutation: chaque hook expose isMutating = save.isPending || delete.isPending"

requirements-completed: [WR-08, WR-11]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Une photo d'anniversaire déposée porte le chemin dans birthdays.photo_url ; l'écran Anniversaires et la vue agrégée re-signent à la lecture (D-13), en échec fermé."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/anniversaires/types.test.ts (displayablePhoto, toBirthday)"
        status: pass
      - kind: unit
        ref: "app/src/modules/anniversaires/anniversaires-aggregation.test.tsx#priorise la photo du contact, avec repli sur la photo birthday"
        status: pass
    human_judgment: false
  - id: D2
    description: "Une photo de contact déposée porte le chemin dans contacts.photo_url ; l'écran Contacts re-signe à la lecture via displayablePhoto (règle partagée)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/contacts/api.test.ts (colonne = chemin, createSignedUrl non appelé à l'écriture)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Le portrait d'un animal et une pièce jointe de carnet portent le chemin (pets.photo_url, pet_attachments.file_url) et se re-signent à la lecture, null en échec fermé."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/animaux/api.test.ts (chemins en colonne, toPet/toPetAttachment résolus)"
        status: pass
    human_judgment: false
  - id: D4
    description: "isMutating d'Animaux est vrai pendant savePet/deletePet/addFiles/removeAttachment (faux au repos) ; addFiles partiel est rapporté comme partiel et invalide quand même."
    requirement: WR-11
    verification:
      - kind: unit
        ref: "app/src/modules/animaux/hooks/use-animaux.test.tsx (isMutating dit la vérité ; envoi partiel dit partiel)"
        status: pass
    human_judgment: false

# Metrics
duration: 41min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 07: Anniversaires, Contacts, Animaux — médias durables et drapeaux vrais Summary

**Anniversaires, Contacts et Animaux écrivent le CHEMIN du bucket dans leurs colonnes média (`photo_url`, `file_url`) et re-signent à la lecture via le point unique de 19-01 (D-01, WR-08) ; les drapeaux d'écriture d'Animaux passent par `useMutation` et cessent de mentir (D-09, WR-11).**

## Performance

- **Duration:** ~41 min (de la Task 1 au commit final) — exécution interrompue par une coupure rate-limit puis reprise (voir Issues Encountered)
- **Started:** 2026-10-15T21:18:24+02:00 (premier commit de plan)
- **Completed:** 2026-10-15T21:59:12+02:00 (commit final)
- **Tasks:** 3
- **Files modified:** 16 (dans `app/src`)

## Accomplishments
- `birthdays.photo_url`, `contacts.photo_url`, `pets.photo_url` et `pet_attachments.file_url` reçoivent désormais un **chemin de bucket**, jamais une URL signée éphémère — à J+31, plus de lien mort sur des portraits de proches ou des ordonnances vétérinaires.
- `displayablePhoto(stored, resolved, key)` créé comme **point unique** de la valeur affichable (échec fermé : un chemin non résolu rend `null`, jamais le chemin brut). Anniversaires l'exporte, Contacts et Animaux l'importent — pas de règle dupliquée.
- Les trois écrans re-signent à la lecture via `resolveHouseholdMediaUrls` (19-01), avec témoin d'annulation et `useMemo` dépendant de la carte de résolution. La priorité D-13 de la vue agrégée s'applique sur les **valeurs résolues**.
- `isMutating` d'Animaux vaut vrai pendant les écritures (`savePet`, `deletePet`, `saveRecord`, `deleteRecord`, `addFiles`, `removeAttachment`) : `saving`/`uploading` de la page deviennent structurellement vrais, ce qui ferme le double envoi (T-19-19).
- `addFiles` tente tous les fichiers, **invalide dans tous les cas**, puis lève « n pièce(s) jointe(s) sur m n'ont pas pu être envoyées » — un envoi partiel se dit partiel, jamais un échec total trompeur.

## Task Commits

Each task was committed atomically:

1. **Task 1: Anniversaires — la colonne porte le chemin, la vue agrégée re-signe** - `4032fd1` (fix)
2. **Task 2: Contacts — même colonne, même résolution** - `eea4a45` (fix)
3. **Task 3: Animaux — portrait et carnet en chemin, drapeaux d'écriture vrais** - `0363bbc` (fix)

**Plan metadata:** aucun commit de plan dédié — `.planning/` est gitignoré (`commit_docs: false`), le SUMMARY reste non commité par choix de configuration.

_Note : Tasks 1 et 2 ont été livrées lors de la session interrompue ; Task 3 et ce SUMMARY l'ont été après reprise._

## Files Created/Modified
- `app/src/modules/anniversaires/types.ts` - `displayablePhoto` (point unique), `toBirthday(row, members, resolved)`, `aggregateBirthdays(..., resolved)` (D-13 sur valeurs résolues)
- `app/src/modules/anniversaires/components/birthday-form-dialog.tsx` - dépose `storedValueOf(deposited)`, transporte `photoStored`
- `app/src/modules/anniversaires/hooks/use-anniversaires.ts` - résolution à la lecture (`isHouseholdMediaPath` → `resolveHouseholdMediaUrls`)
- `app/src/modules/anniversaires/types.test.ts` - cas purs `displayablePhoto`/`toBirthday`
- `app/src/modules/anniversaires/anniversaires-aggregation.test.tsx` - priorité D-13 sur valeurs résolues
- `app/src/modules/contacts/types.ts` - `toContact(row, members, resolved)` via `displayablePhoto` importé
- `app/src/modules/contacts/components/contact-form-dialog.tsx` - `storedValueOf(deposited)`
- `app/src/modules/contacts/hooks/use-contacts.ts` - résolution à la lecture
- `app/src/modules/contacts/api.test.ts` - colonne = chemin, `createSignedUrl` non appelé à l'écriture
- `app/src/modules/animaux/api.ts` - `depositPetPhoto`/`createPetAttachment` écrivent `storedValueOf(deposited)`
- `app/src/modules/animaux/types.ts` - `toPet(row, resolved)`/`toPetAttachment(row, resolved)`, `Pet.photoStored`
- `app/src/modules/animaux/hooks/use-animaux.ts` - résolution à la lecture + écritures via `useMutation` + `addFiles` partiel
- `app/src/modules/animaux/api.test.ts` - chemins en colonne + `toPet`/`toPetAttachment` résolus
- `app/src/modules/animaux/hooks/use-animaux.test.tsx` - **créé** : `isMutating` tenu en vol, échec partiel
- `app/src/modules/animaux/components/pet-attachments-panel.tsx` - garde sur `url: string | null`
- `app/src/modules/animaux/components/pet-form-dialog.tsx` - l'édition renvoie `pet.photoStored`

## Decisions Made
- **`displayablePhoto` unique** : créé dans `anniversaires/types.ts`, importé par `contacts/types.ts` et `animaux/types.ts`. Même doctrine que `normalizeContactName` qui réexporte déjà `normalizePersonName` — la règle est identique, elle doit rester unique.
- **`Pet.photoStored`** : `photoUrl` est l'affichable (résolu à la lecture), `photoStored` est la valeur de colonne. Seule la seconde est comparable d'une édition à l'autre, donc c'est elle que le formulaire transporte quand la photo n'est pas retouchée.
- **`addFiles` partiel** : collecter les erreurs par fichier, invalider avant de lever, et lever une erreur nommant le nombre d'échecs. Un succès partiel se dit partiel ; le fichier valide reste visible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Garde sur `attachment.url` nul dans `pet-attachments-panel.tsx`**
- **Found during:** Task 3 (Animaux)
- **Issue:** `PetAttachment.url` devient `string | null` (échec fermé). Le panneau rendait `<img src={attachment.url}>` et surtout `<a href={attachment.url}>` sans garde : une pièce jointe non résolue produirait un `<a href="null">` (lien cassé, naviguant vers `/null`).
- **Fix:** Conditionner l'image à `isImageMime(...) && attachment.url`, et ne rendre l'ancre que si `attachment.url`.
- **Files modified:** `app/src/modules/animaux/components/pet-attachments-panel.tsx`
- **Verification:** `npm test -- src/modules/animaux` vert ; `npm run typecheck` vert.
- **Committed in:** `0363bbc` (Task 3 commit)

**2. [Rule 1 - Bug] `pet-form-dialog.tsx` re-soumettait l'URL affichée à l'édition**
- **Found during:** Task 3 (Animaux)
- **Issue:** Le dialogue transmettait `pet?.photoUrl ?? null` au brouillon. Après la résolution à la lecture, `photoUrl` est une URL **signée** : éditer une fiche sans retoucher la photo aurait persisté une URL éphémère dans `pets.photo_url` — soit exactement WR-08 rouvert par la porte de l'édition.
- **Fix:** Le brouillon porte `pet?.photoStored ?? null` (valeur de colonne). `toDraft` renomme son paramètre en conséquence.
- **Files modified:** `app/src/modules/animaux/components/pet-form-dialog.tsx`
- **Verification:** `npm run typecheck` vert ; `npm test -- src/modules/animaux` vert.
- **Committed in:** `0363bbc` (Task 3 commit)

**3. [Rule 2 - Missing critical] Ajout d'un fichier de test `use-animaux.test.tsx` non prévu au plan**
- **Found during:** Task 3 (Animaux)
- **Issue:** Le plan ne listait que `animaux/api.test.ts`, mais les comportements exigés par `<behavior>` (drapeaux `isMutating` tenus en vol, envoi partiel rapporté comme partiel, invalidation malgré l'échec) ne se prouvent qu'au niveau du hook.
- **Fix:** Création de `app/src/modules/animaux/hooks/use-animaux.test.tsx` (4 tests, promesses pilotées pour observer `isPending`).
- **Files modified:** `app/src/modules/animaux/hooks/use-animaux.test.tsx` (créé)
- **Verification:** `npm test -- src/modules/animaux` vert (3 fichiers / 27 tests).
- **Committed in:** `0363bbc` (Task 3 commit)

**4. [Rule 2 - Missing critical] Extension du test d'agrégation Anniversaires (fichier hors liste du plan)**
- **Found during:** Task 1 (Anniversaires)
- **Issue:** Le plan listait `types.test.ts`, mais la priorité D-13 « sur valeurs résolues » se vérifie dans `anniversaires-aggregation.test.tsx`, qui portait les assertions sur les valeurs brutes.
- **Fix:** Mise à jour des assertions pour la carte de résolution (`b1`/`c1` → URL signées).
- **Files modified:** `app/src/modules/anniversaires/anniversaires-aggregation.test.tsx`
- **Verification:** `npm test -- src/modules/anniversaires` vert.
- **Committed in:** `4032fd1` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (1 bug Rule 1, 3 missing-critical Rule 2)
**Impact on plan:** Toutes nécessaires à la correction et à la preuve des comportements demandés. Aucune dérive de périmètre : le code suit les `<behavior>` du plan ; seuls deux fichiers d'implémentation (non listés) et un fichier de test (non listé) ont été ajoutés pour que la règle D-01 tienne jusqu'à l'édition et que les types `null` soient rendus sans lien cassé.

## Issues Encountered
- **Coupure rate-limit en cours de Task 3.** L'exécution initiale a été tuée alors que `animaux/api.ts` et `animaux/types.ts` étaient modifiés mais non commités. La reprise a vérifié les commits `4032fd1` (Task 1) et `eea4a45` (Task 2) présents, ré-exécuté leurs `<verify>` (verts), puis terminé Task 3 et produit ce SUMMARY. Aucun commit n'a été réécrit ni amendé.
- **Deux exécutions de la suite complète interrompues par timeout (120 s, 400 s) en premier plan.** Vitest met en tampon sa sortie jusqu'à la fin ; la suite fait 131 fichiers / 1092 tests et dure ~7 min. Lancée en arrière-plan, elle s'est terminée verte (`EXIT=0`).

## Red Proofs (preuve rouge→vert)
- **Task 3** : assertion « `isMutating` est vrai pendant `savePet` » mutée en `resource.isMutating` → échec constaté (`expected true, got false`), restaurée → vert.
- **Task 1** : assertion « chemin + carte vide → `null` » mutée en « → chemin brut » → échec constaté, restaurée → vert.
- **Task 2** : assertion « la colonne contient un chemin » mutée en « contient l'URL signée du mock » → échec constaté, restaurée → vert.
- Aucun résidu `RED-PROOF` dans `app/src` (scan `grep` vide).
- **Honnêteté de reprise** : Task 3 a été terminée dans cette session (preuve rouge dérivée et restaurée ici). Tasks 1 et 2 furent **héritées** de la session interrompue : leurs vitesses rouges ci-dessus ont été re-dérivées et restaurées pendant la reprise, mais les commits `4032fd1`/`eea4a45` eux-mêmes n'ont pas été rejoués — seuls leurs `<verify>` ont été ré-exécutés (verts).

## Verification Chain (résultats réels)

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | vert (exit 0) |
| Suite complète | `cd app && npm test` | vert — **131 fichiers / 1092 tests** passés, `EXIT=0` (base : 130 / 1070) |
| Tests ciblés | `cd app && npm test -- src/modules/anniversaires src/modules/contacts src/modules/animaux` | vert — 8 fichiers / 74 tests |
| Build | `cd app && npm run build` | vert (exit 0) |
| SQL statique | `python3 scripts/check-sql-statique.py` | vert (exit 0) — « 180 fonction(s) effective(s) … aucun défaut » |
| Verrou non-régression | `grep -rn "deposited.url" app/src/modules/{anniversaires,contacts,animaux}` | **vide** (NONE) |

**Leverage SQL** : ce plan n'ajoute aucune migration — `scripts/migrate.sh` et `sh scripts/test-db.sh` n'ont **aucun levier** ici ; le contrôle statique suffit, et il est vert. La chaîne `test-dispatch-push.sh` ne s'applique pas (aucun changement de migration, de Vault ni d'Edge Function).

## Threat Surface Scan
Aucune surface nouvelle : les colonnes média existaient déjà, seule leur **valeur** change (chemin au lieu d'URL). Les mitigations du plan sont implémentées — T-19-17 (plus d'URL signée persistée), T-19-19 (drapeaux d'écriture réels). T-19-18 (chemin fourni par le client) reste `accept`, la signature ne franchit pas la RLS. Aucun paquet ajouté (T-19-SC respectée). Aucun `threat_flag` nouveau.

## Next Phase Readiness
- Les trois modules sont alignés sur le point unique de 19-01 ; D-01 est désormais une règle de classe tenue jusqu'à l'édition.
- `displayablePhoto` est en place pour les plans suivants (19-08, 19-09, 19-12, 19-13) qui traitent la même famille.
- Points laissés intacts volontairement : `removePet`/`removePetAttachment`/`removePetRecord` (compensation suppression, WR-10 → 19-09) ; cas WR-09 du hook Anniversaires (→ 19-11) ; `animaux-page.tsx` (ses props deviennent vraies sans modification).
- Non liés au plan, laissés en place (signalés seulement) : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs` (script Playwright de débogage orphelin). Doublon préexistant de `PetAttachmentRow` dans `app/src/types/database.ts` — hors périmètre.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED
- FOUND: `.planning/phases/19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr/19-07-SUMMARY.md`
- FOUND: commits `4032fd1`, `eea4a45`, `0363bbc`
- FOUND: `app/src/modules/animaux/hooks/use-animaux.test.tsx`, `.../hooks/use-animaux.ts`, `app/src/modules/anniversaires/types.ts`
- Measured commit count over `8cbe258..HEAD` = 3 (unit test files: 8 / 74 tests) ; full suite: 131 files / 1092 tests, EXIT=0
