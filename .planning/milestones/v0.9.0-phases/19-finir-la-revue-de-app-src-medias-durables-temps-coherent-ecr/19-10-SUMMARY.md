---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 10
subsystem: ui
tags: [supabase-storage, react-query, refactor, media, cercle, notes, animaux]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "19-01 — lib/storage.ts (storedValueOf, isHouseholdMediaPath, householdMediaPathOf, resolveHouseholdMediaUrl(s), replacedMediaPath, removeHouseholdFile)"
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "19-07 — displayablePhoto (anniversaires/types) ; animaux/anniversaires/contacts écrivent déjà un chemin, isMutating, compensation d'échec de dépôt"
provides:
  - "Cercle : post_media.url porte le chemin du bucket (écriture), le fil signe à la lecture (échec fermé), removePostCascade retire les objets"
  - "Notes : removeNote et editNote(removedAttachmentIds) retirent les objets des pièces jointes, best-effort, ligne → objet"
  - "Animaux : removePet (portrait + documents), depositPetPhoto (retrait de l'ancien portrait), removePetAttachment"
affects: [19-11, 19-12, 19-13, verify-work, secure-phase]

# Actuals (#2632) — chars/4 over the realized diff (added+removed), never a harness token count.
actuals:
  tokens: 8137
  tasks: 3
  commits: 3
  plan_head_before: 132dad1baa7144d4e85a61a7dec90771c0c9d974
  plan_head_after: 86944da5dd60f21f15c5cfb2a2d0fdbb3d3f9a1f

tech-stack:
  added: []
  patterns:
    - "Compensation ligne → objet : la ligne part d'abord, l'objet ensuite, en best-effort (Promise.allSettled / .catch), l'échec de retrait est signalé (console.warn) sans faire échouer la suppression"
    - "Échec fermé de lecture : un chemin dont la signature est refusée rend null, jamais le chemin brut dans le DOM"

key-files:
  created:
    - app/src/modules/cercle/api.test.ts
  modified:
    - app/src/modules/cercle/api.ts
    - app/src/modules/cercle/hooks/use-cercle.ts
    - app/src/modules/cercle/types.ts
    - app/src/modules/cercle/components/post-card.tsx
    - app/src/modules/cercle/cercle-page.test.tsx
    - app/src/modules/notes/hooks/use-notes.ts
    - app/src/modules/notes/hooks/use-notes.test.tsx
    - app/src/modules/animaux/api.ts
    - app/src/modules/animaux/api.test.ts

key-decisions:
  - "Cercle dépose le chemin SANS passer par depositHouseholdFile : le média est déjà compressé par cercle/lib/media.ts et un second passage le recompresserait ; seul createSignedUrl est retiré de l'écriture."
  - "Retrait d'objet signalé par console.warn (précédent app/src/modules/ardoise/hooks/use-ardoise.ts:290) plutôt que par un rejet : rejeter après une suppression de ligne effective ferait croire à l'utilisateur que la ligne n'a pas été supprimée."
  - "Helper removeStoredObjects local à chaque module plutôt qu'un ajout dans lib/storage.ts — lib/storage.ts est un fichier que les plans frères de la vague 3 peuvent éditer, le laisser intact évite un conflit."
  - "use-animaux.ts laissé inchangé : les helpers de api.ts avalent déjà le retrait, deletePet/removeAttachment délèguent, et la mutation d'un helper qui n'échoue jamais ne produirait aucune preuve rouge."

patterns-established:
  - "Résolution des chemins au fil : useState<Record<string,string>> + useEffect(média.data) filtré par isHouseholdMediaPath, témoin d'annulation, carte passée à composeFeed avant toPostMedia"

requirements-completed: [WR-08, WR-10]

coverage:
  - id: D1
    description: "Le média du Cercle est écrit en chemin dans post_media.url et re-signé à la lecture du fil, en échec fermé (jamais un chemin brut ni src=null dans le DOM) ; l'aperçu blob: optimiste n'est pas re-signé."
    requirement: WR-08
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/api.test.ts#depositMedia rend le chemin du bucket"
        status: pass
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#le fil résout le chemin en URL signée / une signature refusée laisse l'image sans src cassé / un aperçu blob: n'est pas re-signé"
        status: pass
    human_judgment: false
  - id: D2
    description: "Supprimer une note retire du bucket les objets de ses pièces jointes ; retirer une pièce jointe à l'édition retire son objet (ligne → objet, best-effort)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/notes/hooks/use-notes.test.tsx#removeNote / editNote retirent les objets des pièces jointes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Supprimer une fiche animal retire le portrait et les documents du carnet ; remplacer le portrait retire l'ancien ; supprimer une pièce jointe retire son objet (ligne → objet, best-effort)."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/animaux/api.test.ts#removePet / depositPetPhoto / removePetAttachment et l'ordre ligne → objet"
        status: pass
    human_judgment: false
  - id: D4
    description: "Supprimer une publication du Cercle retire du bucket les objets de ses médias, après suppression des lignes."
    requirement: WR-10
    verification:
      - kind: unit
        ref: "app/src/modules/cercle/cercle-page.test.tsx#supprimer une publication retire l'objet du média"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 10: Cercle, Notes et Animaux — la ligne et son objet meurent ensemble Summary

**Le Cercle écrit le chemin du bucket dans `post_media.url` et re-signé à la lecture, et la suppression d'une note, d'une fiche animal ou d'une publication emporte désormais ses objets Storage (portrait et carnet d'ordonnances compris) — ligne d'abord, objet ensuite, en best-effort**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-10-15T20:49:46Z (dernier enregistrement de session avant ce plan)
- **Completed:** 2026-10-15T21:39:41Z
- **Tasks:** 3
- **Files modified:** 10 (9 modifiés, 1 créé)

## Accomplishments

- **Cercle aligné sur D-01 (WR-08)** : `depositMedia` ne signe plus (le `createSignedUrl` à 30 jours et la constante `SIGNED_URL_TTL` ont disparu de l'écriture) ; `post_media.url` porte le chemin `<foyer>/<postId>/…`. Le fil résout les chemins en URL signées au moment de l'affichage (`use-cercle.ts` : carte de résolution + témoin d'annulation, filtrée par `isHouseholdMediaPath`), en **échec fermé** : une signature refusée rend `null`, jamais un chemin brut dans le DOM, et l'aperçu optimiste `blob:` n'est pas re-signé — la publication reste instantanée.
- **Notes (WR-10)** : `removeNote` lit les pièces jointes avant de supprimer les lignes puis retire leurs objets ; `editNote(..., removedAttachmentIds)` retire l'objet de chaque pièce jointe supprimée. Aucun appel de retrait pour une note nue.
- **Animaux (WR-10)** : `removePet` emporte le portrait **et** les documents du carnet ; `depositPetPhoto` retire l'ancien portrait via `replacedMediaPath` ; `removePetAttachment` retire l'objet de la pièce jointe. Fin de l'ordonnance vétérinaire qui survivait indéfiniment à sa fiche dans le volume `household-media`.
- **Cercle — suppression (WR-10)** : `removePostCascade` retire les objets des médias de la publication après les suppressions de lignes.
- **Chaîne verte** : `typecheck` OK, `npm test` **132 fichiers / 1133 tests** (base 1114 → +19), `npm run build` OK, `check-sql-statique` OK (180 fonctions effectives, aucun défaut).

## Task Commits

Chaque tâche a été commitée atomiquement :

1. **Task 1 : Notes — la note et ses pièces jointes meurent ensemble** — `6f3490d` (fix)
2. **Task 2 : Animaux — le portrait et le carnet suivent la fiche** — `06994be` (fix)
3. **Task 3 : Cercle — le média en chemin, re-signé au fil, et supprimé avec la publication** — `86944da` (fix)

_Le commit de métadonnées du plan est omis : `commit_docs: false` (voir « Notes d'exécution »)._

## Files Created/Modified

- `app/src/modules/cercle/api.ts` — `depositMedia` rend le chemin (retrait de `createSignedUrl` + `SIGNED_URL_TTL`) ; `removePostCascade` retire les objets après les lignes
- `app/src/modules/cercle/types.ts` — `PostMedia.url: string | null`, `toPostMedia(row, resolved)` via `displayablePhoto`, `FeedInput.resolvedMedia`
- `app/src/modules/cercle/hooks/use-cercle.ts` — effet de résolution des chemins avant `composeFeed`
- `app/src/modules/cercle/components/post-card.tsx` — garde sur `url` nul (voir déviation)
- `app/src/modules/cercle/cercle-page.test.tsx` — 4 tests ajoutés (résolution, échec fermé, aperçu `blob:`, suppression d'objet)
- `app/src/modules/cercle/api.test.ts` — **créé**, 6 tests du comportement Supabase (écriture/retrait)
- `app/src/modules/notes/hooks/use-notes.ts` — `removeStoredObjects`, `removeNote`, `editNote(removedAttachmentIds)`
- `app/src/modules/notes/hooks/use-notes.test.tsx` — 3 tests ajoutés
- `app/src/modules/animaux/api.ts` — `removePet`, `depositPetPhoto`, `removePetAttachment`
- `app/src/modules/animaux/api.test.ts` — 6 tests ajoutés (dont la preuve d'ordre ligne → objet)

## Decisions Made

- **Pas de `depositHouseholdFile` dans le Cercle** : le média est déjà compressé par `cercle/lib/media.ts` ; un dépôt via le helper partagé le recompresserait. Seule la signature a été retirée de l'écriture, l'upload et `CERCLES_BUCKET` (`household-media`) restent — le chemin reste donc signable par le helper partagé.
- **Échec de retrait signalé par `console.warn`, pas par un rejet** : une fois la ligne supprimée, rejeter ferait croire à l'utilisateur que la suppression n'a pas eu lieu (précédent : `app/src/modules/ardoise/hooks/use-ardoise.ts:290`).
- **Helper `removeStoredObjects` local à chaque module** (hook notes, `animaux/api.ts`, `cercle/api.ts`) plutôt qu'un ajout dans `lib/storage.ts`, pour ne pas éditer un fichier que les plans frères de la vague 3 peuvent modifier.
- **`use-animaux.ts` laissé inchangé** : `deletePet`/`removeAttachment` délèguent déjà à `api.ts`, et les helpers y avalent le retrait après l'avoir signalé — muter un helper qui n'échoue jamais n'aurait produit aucune preuve rouge. Le fichier figure dans `files_modified` du plan mais n'a nécessité aucune modification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `PostMedia.url` devenu `string | null` — garde ajoutée dans `post-card.tsx`**
- **Found during:** Task 3 (Cercle)
- **Issue:** L'échec fermé imposé par le plan (`displayablePhoto` rend `null` quand la signature est refusée) rendait `url` nullable, ce qui cassait le type de `post-card.tsx` qui l'assignait directement à `src`.
- **Fix:** Garde explicite sur `url` nul dans le rendu — l'image est omise au lieu d'émettre `src="null"`.
- **Files modified:** `app/src/modules/cercle/components/post-card.tsx`
- **Verification:** `npm test -- src/modules/cercle` (test « une signature refusée laisse l'image sans src cassé »), `typecheck` OK.
- **Committed in:** `86944da` (Task 3)

**2. [Rule 3 - Blocking] Fichier de test `cercle/api.test.ts` créé**
- **Found during:** Task 3 (Cercle)
- **Issue:** Le comportement d'écriture/retrait du mode Supabase n'était pas testable dans `cercle-page.test.tsx` : mocker `@/lib/supabase/client` avec `isSupabaseConfigured: true` bascule `data` sur `SupabaseAdapter` (`app/src/lib/data/index.ts:16`) et casse les tests de page basés sur la démo.
- **Fix:** Nouveau fichier `app/src/modules/cercle/api.test.ts` (6 tests) qui exerce `api.ts` directement.
- **Files modified:** `app/src/modules/cercle/api.test.ts` (créé)
- **Verification:** `npm test -- src/modules/cercle` vert (28/28).
- **Committed in:** `86944da` (Task 3)

---

**Total deviations:** 2 auto-corrigées (2 bloquantes / Rule 3)
**Impact on plan:** Les deux découlent directement de la mise en œuvre d'un comportement exigé par le plan (échec fermé, preuve du mode Supabase). Aucun élargissement de périmètre. `animaux/hooks/use-animaux.ts` et `notes` n'ont pas eu besoin d'autres fichiers que ceux prévus.

## Preuves rouge → vert (exigées par le plan)

Chaque tâche a été prouvée par mutation puis restauration :

1. **Task 1** — mutation de l'assertion « `remove` appelé avec le chemin » en « non appelé » → échec observé : `expected "vi.fn()" to not be called at all, but actually been called 2 times` → restauration, vert.
2. **Task 2** — mutation de l'assertion « `removePet` retire les documents » en « n'en retire aucun » → échec observé : `called 3 times` → restauration, vert. Le test d'ordre vérifie en plus que la ligne part avant l'objet.
3. **Task 3** — mutation de l'assertion « `post_media.url` reçoit un chemin » en « reçoit l'URL signée » → échec observé : `expected 'hh-1/post-1/media_9fdd9550-…' to match /^https:\/\/signe\.example\//` → restauration, vert.

## Issues Encountered

- **Ordre de montage dans les tests** : semer les lignes démo avec `data.create(...)` **avant** `renderHook`/`render` ; le read React Query se résout au montage, donc des lignes créées après n'apparaissent jamais. Ajusté dans les tests des trois modules.
- Aucun autre blocage. La suite complète est longue (~7 min, vitest bufferise la sortie) : lancée en tâche de fond `chain-19-10.log`.

## Verification Chain

| Étape | Commande | Résultat |
|---|---|---|
| Typecheck | `cd app && npm run typecheck` | OK (exit 0) |
| Tests | `cd app && npm test` | 132 fichiers / **1133** tests passés (base 1114, +19) |
| Build | `cd app && npm run build` | OK (exit 0) |
| Ciblé | `npm test -- src/modules/{cercle,notes,animaux}` | 9 fichiers / 74 tests verts |
| SQL statique | `python3 scripts/check-sql-statique.py` | 180 fonctions effectives, **aucun défaut** (exit 0) |
| Verrou | `grep -rn "deposited.url" app/src/modules/{cercle,notes,animaux}` | vide (verrou 19-13 intact) |

**Pas de levier `migrate.sh` / `test-db.sh` :** ce plan n'ajoute ni ne modifie aucune migration ni fonction SQL — le noyau vérifiable est le frontend. `check-sql-statique.py` a été exécuté comme l'exige la chaîne de phase, mais il ne peut rien apprendre de ce plan. Il n'y a donc rien à dire de `test-db.sh` ici : ni passage obligatoire, ni preuve manquante.

## Threat Flags

None — ce plan **réduit** la surface (T-19-26 et T-19-27 de son propre registre) : les colonnes ne portent plus d'URL signée persistée mais un chemin, et les objets suivent leur ligne. Aucun nouvel endpoint, chemin d'auth, accès fichier ni changement de schéma introduit. Aucun paquet ajouté (T-19-SC non déclenché).

## Known Stubs

None — le balayage des fichiers créés/modifiés n'a trouvé que des attributs HTML `placeholder` légitimes, aucun produit de données vide câblé vers le rendu.

## Notes d'exécution

- **`commit_docs: false`** : tous les commits de tâche sont des commits de **code** uniquement. Ce SUMMARY reste **non commité**, comme le veut la configuration du projet.
- `SIGNED_URL_TTL` et `createSignedUrl` ont disparu de `cercle/api.ts` ; `DepositedFile.url` **n'a pas été retiré** (verrou explicite de 19-13).
- Aucun lecteur de `post_media` ni consommateur de `FeedPost` hors du module Cercle — la bascule chemin/nullable n'a pas d'onde de choc ailleurs dans `app/src` ou `supabase/functions`.
- Fichiers non suivis préexistants laissés intacts : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`.

## Next Phase Readiness

- WR-08 clos côté Cercle ; WR-10 couvert pour notes, animaux et Cercle. Reste aux plans frères de la vague 3 (19-11, 19-12) et à 19-13 (verrou `DepositedFile.url`).
- Prêt pour `/gsd-verify-work` : les quatre livrables ont une couverture unitaire prouvée (voir `coverage:`), aucun jugement humain requis.
- Aucune migration ajoutée : rien à valider côté base.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Fichiers : SUMMARY, `cercle/api.test.ts`, `cercle/components/post-card.tsx`, `animaux/api.ts`, `notes/hooks/use-notes.ts` — tous FOUND
- Commits : `6f3490d`, `06994be`, `86944da` — tous FOUND
- `commits` mesuré (`git rev-list --count plan_head_before..HEAD`) = **3**
