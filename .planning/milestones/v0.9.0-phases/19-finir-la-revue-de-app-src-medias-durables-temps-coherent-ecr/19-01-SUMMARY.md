---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 01
subsystem: storage
tags: [storage, media, supabase, notes, mime, d01, d04, wr-08, wr-16]

# Dependency graph
requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "correction WR-05 (`shouldRemovePreviousPlacePhoto`), `upsert`/`DataError` des adaptateurs"
provides:
  - "`lib/storage.ts:storedValueOf` — point unique de la valeur de colonne d'un média (D-01)"
  - "`isHouseholdMediaPath` / `householdMediaPathOf` / `resolveHouseholdMediaUrl(s)` — point unique de la lecture, en échec fermé"
  - "`replacedMediaPath` — décision pure de remplacement d'un média (consommée par 19-08 et 19-09)"
  - "module Notes aligné : `file_url` = chemin, `toNoteAttachment(row, url)` porte `storedUrl` + `url` affichable, hook qui re-signe à la lecture"
  - "déduction du type d'un fichier par une table extension → MIME unique (D-04)"
affects: [19-07, 19-08, 19-09, 19-10, 19-13]

actuals:
  tokens: 7713
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "chemin de bucket = valeur de colonne ; URL signée forgée à la lecture (D-01)"
    - "résolution en échec fermé : toute erreur de forge rend `null`, jamais un lien mort"
    - "une seule table extension → MIME pour reconnaître un fichier et le déposer (D-04)"

key-files:
  created:
    - app/src/modules/notes/api.test.ts
  modified:
    - app/src/lib/storage.ts
    - app/src/lib/storage.test.ts
    - app/src/modules/adresses/api.ts
    - app/src/modules/notes/api.ts
    - app/src/modules/notes/types.ts
    - app/src/modules/notes/hooks/use-notes.ts
    - app/src/modules/notes/notes-page.tsx
    - app/src/modules/notes/components/note-form-dialog.tsx

key-decisions:
  - "La forme de `DepositedFile` ne bouge pas : le verrou de D-01 est le test de contrat de 19-13, pas un renommage de champ (huit doubles de test fournissent `url`/`path`)."
  - "`isAccepted` est replié dans `acceptedMimeOf` : une seule fonction résout le type, donc aucune seconde table ne peut diverger (D-04)."
  - "`householdMediaPathOf` rogne la valeur avant le verdict : le constat §5 de `deferred-items.md` (phase 18) est fermé pour tous les appelants du helper, pas seulement pour la décision de remplacement."
  - "Le rendu de notes guarde une URL nulle (échec fermé) au lieu de recevoir un chemin brut : deux composants suivent désormais le motif de `provider-form-dialog`."

patterns-established:
  - "Média durable : `storedValueOf` à l'écriture, `resolveHouseholdMediaUrl(s)` à la lecture, `replacedMediaPath` au remplacement."
  - "Refus explicite d'un type indéterminé avant tout upload, message nommant le fichier."

requirements-completed: [WR-08, WR-16]

coverage:
  - id: D1
    description: "Une pièce jointe de note persistée porte le CHEMIN du bucket dans `note_attachments.file_url`, jamais l'URL signée (WR-08/D-01)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/notes/api.test.ts#écrit le chemin du bucket dans file_url, jamais l'URL signée"
        status: pass
      - kind: unit
        ref: "app/src/lib/storage.test.ts#le chemin du bucket est la valeur de colonne ; l'URL ne sert qu'en démo"
        status: pass
    human_judgment: false
  - id: D2
    description: "Le rendu d'une note affiche une URL signée obtenue à la lecture, forgée par un point unique, en échec fermé."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/lib/storage.test.ts#forge une URL signée à la lecture, en échec fermé"
        status: pass
      - kind: unit
        ref: "app/src/lib/storage.test.ts#forge impossible → null, jamais un lien mort vers le DOM"
        status: pass
      - kind: integration
        ref: "app/src/modules/notes/notes-page.test.tsx (suite du module, inchangée)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un `File` à `type` vide et extension `.jpg` est déposé en image (`contentType: image/jpeg`, extension `.jpg`), pas en `application/pdf` (WR-16/D-04)."
    requirement: WR-16
    verification:
      - kind: unit
        ref: "app/src/lib/storage.test.ts#un JPEG mobile (type vide) part en image/jpeg, jamais en application/pdf"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un fichier dont le type reste indéterminé est refusé avec un message explicite, sans aucun appel à `upload` (WR-16/D-04)."
    requirement: WR-16
    verification:
      - kind: unit
        ref: "app/src/lib/storage.test.ts#un type indéterminé est refusé avant tout envoi, jamais deviné"
        status: pass
    human_judgment: false
  - id: D5
    description: "La décision « quel objet retirer quand un média en remplace un autre » vit dans un seul helper partagé et rend `null` pour une forme non-chemin (généralisation de WR-05)."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/lib/storage.test.ts#remplacement : le chemin précédent est retiré tant qu'il diffère de la suite"
        status: pass
      - kind: unit
        ref: "app/src/modules/adresses/api.test.ts (cas WR-05 existants, inchangés)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-15
status: complete
plan_head_before: f79d553fe8f5887f25ab46ee9f10d6922f76ab35
plan_head_after: c6add75e0f61e2661f593a5398ab0e2d0c329677
---

# Phase 19 Plan 01: Une pièce jointe de note durable, et le type d'un fichier qui ne s'invente plus

**Le trancheur vertical des médias du foyer est ouvert : `note_attachments.file_url` porte le chemin du bucket, l'URL signée naît à la lecture par un point unique en échec fermé, et un fichier à `type` vide se déduit par son extension ou se refuse — il n'est plus déposé en `application/pdf`.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-15T18:32Z
- **Completed:** 2026-10-15T18:44Z
- **Tasks:** 2/2
- **Files modified:** 9 (8 modifiés, 1 créé)

## Accomplishments

- `lib/storage.ts` porte les cinq helpers de la famille média : `storedValueOf` (valeur de
  colonne), `isHouseholdMediaPath`, `householdMediaPathOf` (rogne la valeur — ferme le constat
  §5 de `deferred-items.md` phase 18 pour tous ses appelants), `resolveHouseholdMediaUrl` /
  `resolveHouseholdMediaUrls` (lecture en échec fermé) et `replacedMediaPath` (remplacement).
- Le module Notes est aligné de bout en bout : écriture du chemin, `toNoteAttachment(row, url)`
  qui porte `storedUrl` (colonne) **et** `url` (affichable), hook qui re-signe les chemins après
  annulation stricte. Aucune copie locale de `createSignedUrl` dans `modules/notes`.
- `shouldRemovePreviousPlacePhoto` (adresses) n'est plus qu'une délégation à `replacedMediaPath` :
  la règle WR-05 n'existe plus en double, et 19-08 / 19-09 la réutilisent telle quelle.
- WR-16 fermé dans le même fichier : table **unique** extension → MIME, suppression du repli
  `application/pdf`, refus explicite avant tout `upload`, et l'image reconnue par sa seule
  extension passe quand même par `compressImage`.

## Task Commits

Chaque tâche est committée atomiquement (Task 2 suit le cycle TDD : rouge puis vert) :

1. **Task 1 : Une pièce jointe de note de bout en bout (tracer)** — `d6854f4` (fix)
2. **Task 2 : WR-16 — le type d'un fichier ne s'invente pas** — `88664e8` (test, ROUGE) puis
   `c6add75` (fix, VERT)

**Plan metadata:** skipped (`commit_docs: false` — les artefacts `.planning/` ne sont pas committés).

## Preuves rouge → vert

**Task 1 — le chemin persisté.** Mutation appliquée dans `modules/notes/api.ts` :
`file_url: storedValueOf(deposited)` → `file_url: deposited.url`.

```
FAIL src/modules/notes/api.test.ts > pièces jointes de notes — chemin persisté (D-01)
      > écrit le chemin du bucket dans file_url, jamais l'URL signée
AssertionError: expected 'https://signe.example/notes/ordonnanc…' to be 'foyer-1/notes/note-1/ordonnance.pdf'
 Expected: "foyer-1/notes/note-1/ordonnance.pdf"
 Received: "https://signe.example/notes/ordonnance.pdf?token=expire"
 Test Files  1 failed (1) | Tests  1 failed | 1 passed (2)
```

Fichier restauré (`cp` du binaire d'origine), même commande relancée : `Test Files 1 passed (1) |
Tests 2 passed (2)`.

**Task 2 — le type déduit et le refus.** Tests écrits **avant** le correctif, sur le code de la
veille :

```
FAIL  > un JPEG mobile (type vide) part en image/jpeg, jamais en application/pdf
AssertionError: expected 'application/pdf' to be 'image/jpeg'

FAIL  > un type indéterminé est refusé avant tout envoi, jamais deviné
AssertionError: expected [Function] to throw error matching /indéterminé/i but got
  'Seules les images et les PDF sont acceptés.'

 Test Files  1 failed (1) | Tests  2 failed | 16 passed (18)
```

Ces deux échecs sont les assertions visées (INVALID_RED exclu : aucun crash de fixture, aucun
test aval). Après le correctif : `Tests 18 passed (18)`. Les deux cas « déjà corrects »
(`scan.pdf` en PDF, `image/png` déclaré conservé) passaient avant comme après — ils prouvent
l'absence de régression, pas le correctif.

## Files Created/Modified

- `app/src/lib/storage.ts` — `storedValueOf`, helpers de chemin/résolution, `replacedMediaPath`,
  table `EXTENSION_MIMES`, `acceptedMimeOf` / `extensionMime` / `refusalMessage`, dépôt sans repli PDF.
- `app/src/lib/storage.test.ts` — 11 cas neufs (valeur de colonne, formes non-chemin, valeur
  blanche, échec fermé, résolution en une passe, remplacement, MIME déduit, refus).
- `app/src/modules/notes/api.ts` — `file_url: storedValueOf(deposited)`.
- `app/src/modules/notes/types.ts` — `NoteAttachment.storedUrl`, `url: string | null`,
  `toNoteAttachment(row, url = null)`.
- `app/src/modules/notes/hooks/use-notes.ts` — état `attachmentUrls` + `useEffect` d'annulation
  stricte, regroupement par note avec URL résolue.
- `app/src/modules/notes/notes-page.tsx`, `.../components/note-form-dialog.tsx` — garde sur une
  URL nulle (déviation 1).
- `app/src/modules/adresses/api.ts` — `shouldRemovePreviousPlacePhoto` délègue à `replacedMediaPath`.
- `app/src/modules/notes/api.test.ts` — **créé** : preuve du chemin persisté (lecture de la ligne
  réelle par l'adaptateur local, pas de l'argument d'un appel) et du repli démo.

## Decisions Made

- **La forme de `DepositedFile` est inchangée** (décision de la phase, non rediscutée) : le verrou
  de D-01 est le test de contrat de 19-13. Aucun des huit doubles de test du dépôt n'a été touché.
- **`isAccepted` est replié dans `acceptedMimeOf`.** Le plan nommait `isAccepted` comme co-lecteur
  de la table ; garder les deux aurait laissé deux fonctions à faire diverger, et `isAccepted`
  devenait inutilisée (donc refusée par `noUnusedLocals`). Une seule fonction résout le type :
  la propriété visée (« deux règles qui divergent rouvriraient le défaut ») est satisfaite par
  construction. Voir déviation 2.
- **`householdMediaPathOf` rogne avant de juger**, et `resolveHouseholdMediaUrl('  ')` rend `null`
  sans tenter de signature : le constat §5 de la phase 18 est fermé ici pour tous les appelants du
  helper (les autres modules basculeront dessus en 19-13).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Le type `NoteAttachment.url` devenu nullable casse deux composants**
- **Found during:** Task 1 (`npm run typecheck`)
- **Issue:** `toNoteAttachment(row, url: string | null)` rendait `url` nullable (échec fermé), mais
  `notes-page.tsx:247,254` passait `href={attachment.url}` / `src={attachment.url}` et
  `note-form-dialog.tsx:200` `src={attachment.url}` : `strict: true` refuse `null` sur `href`/`src`.
- **Fix:** garde explicite sur les deux attributs, exactement le motif déjà en place côté
  prestataires (`provider-form-dialog.tsx:166`) : `href={attachment.url ?? undefined}` et
  `isImageMime(...) && attachment.url ? <img …/> : <puce fichier/>`.
- **Files modified:** `app/src/modules/notes/notes-page.tsx`,
  `app/src/modules/notes/components/note-form-dialog.tsx`
- **Vérification:** `npm run typecheck` vert ; `npm test -- src/modules/notes` vert (la suite de la
  page et le dialogue couvrent le rendu).
- **Committed in:** `d6854f4` (commit de la Task 1)
- **Note de périmètre:** ces deux fichiers n'étaient dans le `files_modified` d'**aucun** plan de la
  phase (vérifié sur les 13 plans) — aucun risque de collision avec une autre vague.

**2. [Rule 3 - Blocking] `isAccepted` devient inutilisée après la résolution du type**
- **Found during:** Task 2 (implémentation du correctif)
- **Issue:** le plan demandait que `isAccepted` et la nouvelle résolution partagent la même table ;
  une fois le dépôt passé à `acceptedMimeOf`, `isAccepted` n'était plus appelée et `noUnusedLocals`
  faisait échouer le typecheck.
- **Fix:** `isAccepted` est repliée dans `acceptedMimeOf` (une seule fonction, une seule table) ;
  le refus est produit par `refusalMessage(file)`.
- **Files modified:** `app/src/lib/storage.ts`
- **Vérification:** `npm run typecheck` vert ; le cas « refus avant tout envoi » reste prouvé.
- **Committed in:** `c6add75` (commit vert de la Task 2)

---

**Total deviations:** 2 auto-corrigées (2 blocages)
**Impact on plan:** Aucun écart de comportement ni de périmètre. La déviation 1 est la conséquence
mécanique de l'échec fermé exigé par D-01 ; la déviation 2 renforce la propriété que le plan
recherchait (une seule table, une seule règle).

## Issues Encountered

- Aucun blocage. À noter pour la suite : `modules/notes/hooks/use-notes.ts` est aussi modifié par
  19-10 (wave 3, `depends_on: [19-01, 19-07]`) pour la compensation de suppression ; le hook porte
  désormais `attachmentRows` et `attachmentUrls` comme noms locaux — 19-10 doit étendre ces blocs,
  pas les réécrire.

## User Setup Required

None — aucune configuration externe, aucun paquet ajouté.

## Verification chain (mesurée)

| Commande | Résultat |
|---|---|
| `cd app && npm run typecheck` | vert |
| `cd app && npm test` | **123 fichiers / 1005 tests, tous verts** (base : 122 / 992 ; +1 fichier, +13 tests) |
| `cd app && npm run build` | vert (`dist/sw.js` généré, 103 entrées de précache) |
| `cd app && npm test -- src/lib/storage.test.ts src/modules/notes` | vert (5 fichiers, 24 tests) |
| `python3 scripts/check-sql-statique.py` | `aucun défaut` (exit 0, 180 définitions effectives) |

**Ce que cette chaîne ne prouve pas :** ce plan n'ajoute **aucune migration** et ne touche aucun
fichier SQL. `sh scripts/migrate.sh` et `sh scripts/test-db.sh` n'ont donc **aucun levier** ici —
ni l'un ni l'autre n'a été exécuté, et leur exécution n'aurait rien validé du changement. Le
contrôle statique SQL est vert parce que le dépôt l'est, pas parce que ce plan l'a exercé.
La migration de rattrapage (D-02) vit dans 19-12.

## Next Phase Readiness

- Les plans 19-07 (anniversaires, contacts, animaux), 19-08 (produits, cadeaux), 19-09 (couvertures
  d'ardoise), 19-10 (Cercle, suppression de pièces jointes) et 19-11 peuvent consommer tel quel :
  `storedValueOf`, `isHouseholdMediaPath`, `householdMediaPathOf`, `resolveHouseholdMediaUrl(s)`,
  `replacedMediaPath`.
- 19-13 pourra remplacer les quatre copies locales de `createSignedUrl` par
  `resolveHouseholdMediaUrl(stored, <TTL locale>)` et poser le test de contrat : les six
  réintroductions restantes de `deposited.url`/`deposited.path` sont hors de ce plan et listées
  ci-dessus dans le relevé (`modules/recettes`, `modules/ardoise`, `modules/courses`,
  `modules/cadeaux`, `modules/contacts`, `modules/animaux`, `modules/anniversaires`,
  `modules/voyages`, `modules/prestataires`, `modules/adresses`).

## Self-Check: PASSED

- Fichiers vérifiés présents : `app/src/lib/storage.ts`, `app/src/lib/storage.test.ts`,
  `app/src/modules/notes/api.test.ts`, `app/src/modules/notes/types.ts`.
- Commits vérifiés présents dans l'historique : `d6854f4`, `88664e8`, `c6add75`.
- `commits: 3` mesuré depuis le registre du plan (`plan_head_before: f79d553…`,
  `plan_head_after: c6add75…`).
