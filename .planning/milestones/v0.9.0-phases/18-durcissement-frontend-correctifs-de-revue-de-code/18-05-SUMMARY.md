---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: "05"
subsystem: frontend-adresses-ardoise
tags: [wr-05, wr-06, d-06, d-07, adresses, ardoise, storage, parts-personnalisees, vitest, jsdom]
status: complete

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-01 (c2e655e, 34cd0de), 18-02 (6727e73, 5de0b17, 556a212), 18-03 (e7c5aea, 9d093e4, 80a4351), 18-04 (79c3e69, a184489) : plans précédents de la phase"
provides:
  - "`Place.photoStored` : valeur de colonne `photo_url`, distincte de `photoUrl` (URL signée forgée à la lecture) — c'est la seule grandeur comparable d'une édition à l'autre"
  - "`shouldRemovePreviousPlacePhoto(previousStored, nextStored)` : décision pure et testée du retrait de l'objet de bucket, qui exige une valeur précédente en chemin bucket"
  - "Le dialogue de lieu transporte la valeur STOCKÉE et affiche la valeur RÉSOLUE"
  - "`normalizeShares` refuse une part négative et un total supérieur au montant, hors formulaire compris (API, graines)"
  - "`customSharesTotal` / `SHARE_TOLERANCE` : la règle de somme partagée entre l'écran et le calcul"
  - "Le partage personnalisé exige une somme égale au montant, avec un message qui chiffre l'écart"
affects: [adresses, ardoise, storage-household-media, places-photo-url, expense-participants, revue-de-code-wr-05, revue-de-code-wr-06]

actuals:
  tokens: 7072
  tasks: 3
  commits: 4
plan_head_before: a184489c5297ba5cc79d181f88d66b4d8537bd3e
plan_head_after: f1b002682bb560d2046b7c6802002ed6a2359f25

tech-stack:
  added: []
  patterns:
    - "Séparer la valeur stockée de la valeur affichable dans le type métier, plutôt que de comparer une grandeur dérivée à sa source"
    - "Extraire une décision de suppression en fonction pure (`shouldRemovePreviousPlacePhoto`) pour qu'elle soit prouvable hors du hook et du mode Supabase"
    - "Le calcul est la barrière, l'écran n'est qu'un avertissement : `normalizeShares` refuse ce que le formulaire interdit déjà"
    - "Un helper de somme exporté (`customSharesTotal`) pour que la règle de l'écran et celle du calcul ne puissent pas diverger"
    - "`superRefine` plutôt que `refine` quand le message d'erreur dépend des valeurs (écart chiffré en euros)"

key-files:
  created:
    - app/src/modules/adresses/components/place-form-dialog.test.tsx
  modified:
    - app/src/modules/adresses/types.ts
    - app/src/modules/adresses/api.ts
    - app/src/modules/adresses/hooks/use-adresses.ts
    - app/src/modules/adresses/components/place-form-dialog.tsx
    - app/src/modules/adresses/api.test.ts
    - app/src/modules/ardoise/types.ts
    - app/src/modules/ardoise/components/expense-form-dialog.tsx
    - app/src/modules/ardoise/spent.test.ts
    - app/src/modules/ardoise/components/expense-form-dialog.test.tsx

key-decisions:
  - "`photoStored` est requis sur `Place` : rendre le champ optionnel aurait laissé les littéraux existants compiler, et donc permis à un nouveau chemin d'oublier la valeur stockée — exactement la confusion que D-06 supprime. Le `typecheck` a confirmé que `toPlace` est l'unique constructeur (aucun littéral à corriger)."
  - "La décision de retrait est extraite en fonction pure plutôt que testée à travers le hook : le défaut ne se reproduit qu'en mode Supabase, et une assertion qui ne peut pas échouer n'est pas un test (AGENTS.md §D.6)."
  - "`shouldRemovePreviousPlacePhoto` traite une valeur précédente blanche comme « rien à retirer » : `photo_url` peut valoir des espaces, et `removeHouseholdFile('  ')` serait une suppression d'objet bidon."
  - "Deux refus distincts dans `normalizeShares`, avec deux messages distincts, parce que les causes le sont : une part saisie négative n'est pas une somme qui dépasse, et l'utilisateur ne peut pas corriger la seconde comme la première."
  - "`superRefine` et non `refine` pour la somme : le message doit chiffrer l'écart (« il reste 8,00 € à répartir » / « les parts le dépassent de 10,00 € »), ce qu'un message statique ne peut pas dire."
  - "La somme du formulaire porte sur `values.participants` et non sur les clés de `customShares` : une clé laissée par un participant décoché fausserait le total, et c'est `participants` que `resolveParticipantKeys` consomme."
  - "Le texte d'aide annonce désormais la règle (« la somme doit égaler le montant ») au lieu de décrire une absorption d'écart qui n'a plus lieu."

metrics:
  duration: "20 min"
  completed: "2026-10-15"
  tasks_completed: 3
  files_changed: 10
---

# Phase 18 Plan 05 : comparer la valeur stockée, et borner la somme des parts

Deux pertes silencieuses fermées : éditer un lieu ne détruit plus sa photo et
n'écrit plus d'URL signée en base (WR-05), et un partage personnalisé dont la
somme se trompe est refusé au lieu de produire une part négative persistée
(WR-06) — refus porté par le calcul, donc hors du formulaire aussi.

## Objectif et résultat

**WR-05 — la comparaison fautive.** `editPlace` lisait `previous` = la valeur
**stockée** (chemin bucket) et la comparait au `photoUrl` du dialogue, qui était
l'**URL signée résolue** (`use-adresses.ts` forgeait chemin → URL signée au
memo `places`). Les deux ne sont jamais égales, donc `deletePlacePhoto(previous)`
supprimait l'objet du bucket à chaque enregistrement — même sans toucher à la
photo — et la colonne recevait l'URL signée (éphémère, non rejouable).

**WR-06 — la somme non bornée.** Le schéma validait chaque part `>= 0` mais
jamais leur somme. `normalizeShares` reportait l'écart total sur le **dernier**
participant : 10 € répartis 10 + 10 + 1 donnaient `1 + (10 − 21) = −10`. Le
formulaire était vert, la ligne était écrite (mode démo), et le RPC ne
l'attrapait qu'en ligne.

| Tâche | Type | Résultat |
|---|---|---|
| 1 | tracer | `Place.photoStored`, `shouldRemovePreviousPlacePhoto` (fonction pure), dialogue qui transporte la valeur stockée et affiche la résolue, `editPlace` qui ne compare plus l'incomparable |
| 2 | auto | 6 cas de décision (a)–(e) + intégration « URL signée ⇒ aucun nettoyage », et `place-form-dialog.test.tsx` : la preuve, reproductible en démo, que le formulaire transporte la valeur brute |
| 3 | auto | `normalizeShares` refuse part négative et total supérieur ; `customSharesTotal`/`SHARE_TOLERANCE` ; refine de somme à l'écran avec écart chiffré ; aide corrigée |

## Ce qui a changé, précisément

| Grandeur | Avant | Après |
|---|---|---|
| `Place.photoUrl` | URL signée forgée à la lecture | inchangé (valeur **affichable**) |
| `Place.photoStored` | n'existait pas | valeur de la colonne `photo_url` (chemin bucket, `data:`/`http(s)` hérités, `null`) |
| `defaultValues.photoUrl` (dialogue) | `place?.photoUrl` (URL signée) | `place?.photoStored` (chemin) — l'aperçu garde `photoUrl` |
| Décision de retrait | `previous && previous !== photoUrl` | `shouldRemovePreviousPlacePhoto(previous, photoUrl)`, qui exige un chemin bucket |
| `normalizeShares` (custom) | absorption silencieuse sur le dernier | refus d'une part négative, puis d'un total supérieur au montant |
| Part personnalisée négative | persistée (démo) / rejetée par le RPC (en ligne) | jamais calculée : `normalizeShares` lève |
| Aide « Montants personnalisés » | « le dernier participant absorbe l'écart » | « la somme des parts doit égaler le montant (au centime près) » |

`use-adresses.ts` confirme par ailleurs que l'écrasement du memo ne porte que
sur `photoUrl` (`{ ...toPlace(row), photoUrl }`) : `photoStored` traverse
intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] Une valeur précédente blanche n'est pas un objet de bucket**
- **Found during:** Task 2 (en écrivant le cas (d) de la preuve)
- **Issue:** `placePhotoPathOf('  ')` rend `'  '` — `isPlacePhotoPath` ne
  regarde que le préfixe — donc une colonne blanche faisait « retirer »
  l'objet `'  '`. Le plan ne listait que `previousStored` nul ; l'assertion du
  cas blanc a révélé l'angle mort.
- **Fix:** la décision normalise la valeur précédente (`trim()`) avant de
  décider, comme le reste du module le fait déjà par `toNullable`. Une valeur
  blanche rend faux, donc `deletePlacePhoto` n'est pas appelé du tout.
- **Files modified:** `app/src/modules/adresses/api.ts`
- **Commit:** `5241226`

**2. [Rule 1/3 — `typecheck` rouge] Le mock de soumission du dialogue n'était pas typé**
- **Found during:** Task 3 (le `npm run typecheck` de sa vérification)
- **Issue:** `vi.fn(async () => {})` produit un mock sans paramètre, donc
  `mock.calls[0][0]` est refusé par `tsc` (`TS2493: Tuple type '[]' of length
  '0' has no element at index '0'`) dans les trois cas du nouveau
  `place-form-dialog.test.tsx`. La vérification de la tâche 2 (`npm test` seul)
  ne lançait pas le typecheck : le fichier est parti avec un défaut que la tâche
  suivante a attrapé.
- **Fix:** `vi.fn<(input: PlaceInput) => Promise<void>>(async () => {})` : le
  mock porte le type de son entrée, l'assertion est typée. Commit dédié pour ne
  pas mélanger les modules.
- **Files modified:** `app/src/modules/adresses/components/place-form-dialog.test.tsx`
- **Commit:** `9e6b9c4`

### Écarts assumés, sans correction de code

**3. `photoFile` vaut `null`, pas `undefined`, à la soumission sans dépôt.**
Le plan écrit « `photoFile` indéfini (aucun dépôt) ». Le dialogue passe
`photoFile: pickedFile`, initialisé à `null` : c'est donc `null` qui est
asserti. `editPlace` teste la véracité (`input.photoFile ? … : input.photoUrl`),
où `null` et `undefined` sont équivalents — aucune correction de code, le plan
décrivait l'intention (« aucun dépôt »), pas la valeur littérale.

**4. Le dialogue est bien remonté par lieu — vérifié, pas ajouté.**
`adresses-page.tsx:233` porte `key={editing?.id ?? 'new'}`, donc `defaultValues`
et `photoPreview` sont recalculés à chaque ouverture pour le lieu visé, et sur
`'new'` pour un ajout. Aucun effet de synchronisation n'a été introduit (le plan
le demandait explicitement s'il manquait).

**5. `superRefine` au lieu de `refine` pour la somme.** Voir « Décisions
prises » : le message doit chiffrer l'écart, qu'un message statique ne peut pas
exprimer. La non-négativité par part reste un `refine` statique, inchangé.

**6. Aucun test préexistant n'a eu à être ajusté.** Le plan prévoyait le cas
(« si un test existant soumet des parts personnalisées dont la somme ne tombe
pas juste, corriger la valeur soumise ») : `expense-form-dialog.test.tsx` ne
soumettait aucun partage personnalisé (ses trois cas portent sur le payeur
libre), et aucun autre test n'appelait `normalizeShares`. Les 60 tests du module
Ardoise et les 21 d'Adresses restent verts sans retouche.

## Preuve que les tests peuvent échouer

AGENTS.md §B/§D : une assertion se prouve sur un cas qui doit échouer. Chaque
garde a été mutée, le fichier de test concerné lancé, puis restauré depuis le
commit (`git checkout -- <fichier>`, état final vérifié propre) :

| Mutation | Résultat |
|---|---|
| Dialogue : `place?.photoUrl` au lieu de `photoStored` (le défaut d'origine) | **1 échec / 3** — « photo non touchée : affiche l'URL résolue, soumet le chemin stocké » |
| Décision : plus de filtre « chemin bucket » sur la valeur précédente | **1 échec / 12** — le cas (e) : une URL signée était traitée comme un objet à retirer |
| Calcul : les deux refus retirés de `normalizeShares` | **2 échecs / 12** — les cas (a) part négative et (b) somme supérieure |
| Écran : le refine de somme retiré | **2 échecs / 7** — l'écart chiffré et le restant à répartir ne sont plus signalés |

Les cas (a)–(d) de la décision restent verts sous la mutation « plus de filtre » :
ils ne portent pas sur le défaut mais sur la symétrie de la règle — c'est le cas
(e) qui échoue, et il est le seul à le faire, ce qui est exactement l'attendu.

## Décisions prises

- **`photoStored` requis.** Un champ optionnel aurait laissé compiler les
  lecteurs qui l'ignorent ; c'est précisément ainsi que la confusion WR-05
  s'était installée. Le `typecheck` après l'ajout n'a révélé aucun littéral
  `Place` à corriger : `toPlace` est le seul constructeur, ce qui confirme que
  la valeur stockée ne peut plus être contournée.
- **La décision quitte le hook.** `shouldRemovePreviousPlacePhoto` est pure et
  vit dans `api.ts`, à côté de `placePhotoPathOf` : elle est prouvable sans
  Supabase, sans IndexedDB et sans harnais de hook. La commenter sur le défaut
  d'origine évite qu'un futur lecteur « simplifie » la double condition.
- **Deux refus, deux messages.** « Une part ne peut pas être négative. » (avant
  absorption) et « La somme des parts dépasse le montant de la dépense. »
  (après) : les causes sont différentes, la correction demandée l'est aussi.
- **La tolérance est un demi-centime, et c'est documenté.** Les parts sont des
  chaînes décimales arrondies au centime : une répartition juste peut s'écarter
  d'un arrondi. `SHARE_TOLERANCE` vit dans `types.ts`, à côté de `roundCents`,
  et sert aux deux côtés de la frontière (formulaire et calcul).
- **L'écran n'est pas la barrière.** Le refine empêche la soumission fautive,
  mais l'API et les graines appellent `normalizeShares` directement : c'est le
  calcul qui refuse, et le RPC transactionnel conserve son contrôle différé
  comme filet.

## Vérification

| Contrôle | Résultat |
|---|---|
| Task 1 : `npm run typecheck && npm test -- src/modules/adresses` | typecheck vert, **12 passés** |
| Task 2 : `npm test -- …/api.test.ts …/place-form-dialog.test.tsx` | **15 passés** (12 + 3) |
| Task 3 : `npm run typecheck && npm test -- …/spent.test.ts …/expense-form-dialog.test.tsx` | typecheck vert, **19 passés** (12 + 7) |
| `npm run typecheck` | vert |
| `npm test` (suite complète) | **121 fichiers, 983 tests, tous verts** |
| `npm run build` | vert (`tsc --noEmit` + Vite + PWA `injectManifest`, 103 entrées précachées) |
| `python3 scripts/check-sql-statique.py` | 180 fonctions effectives sur 123 migrations et 62 tests, **aucun défaut** |
| `sh scripts/migrate.sh` | « Toutes les migrations sont déjà appliquées. » |
| `sh scripts/test-db.sh` | **60 fichiers, tous verts** — dont le contrôle différé de la somme des parts (migration 0035 / 0036), que ce correctif rend atteignable côté client au lieu de laisser l'écart passer |
| `npm run test:e2e` | 117 passés, 5 ignorés, **4 échecs préexistants** (2 specs × 2 projets, cf. `deferred-items.md` §2) |

Le plan ne modifie **aucune** migration ni fonction SQL : `test-db.sh` est vert
non pas parce que ce plan l'aurait changé, mais parce que le refus côté client
n'a pas touché au contrat serveur (les deux RPC gardent leur contrôle différé).

Les 4 échecs e2e sont ceux relevés en 18-01 — `critical-paths`
(exigence « Continuer avec Facebook », chaîne retirée le 2026-10-13) et
`voyage-workspace` (exigence d'une `checkbox` là où l'affordance est un
`switch`) — aucun parcours d'adresses ou d'ardoise n'y figure, aucun échec
nouveau, aucun spec modifié.

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucun libellé d'attente, aucun composant
sans source de données : `photoStored` est renseigné par `toPlace` depuis la
ligne réellement lue, et le refus de part est un comportement, pas un
placeholder.

## Threat Flags

Aucun nouveau. Le plan **referme** les trois menaces qu'il visait :

- **T-18-12** (Tampering, `editPlace` → Storage) : la comparaison porte valeur
  stockée ↔ valeur stockée et exige un chemin bucket ; l'URL signée ne peut plus
  déclencher ni retrait d'objet, ni réécriture de colonne. Prouvé par les cas
  (a)–(e) et l'intégration « URL signée ⇒ aucun nettoyage ».
- **T-18-13** (Tampering, `normalizeShares`) : le calcul refuse une part
  négative et un total supérieur au montant, donc les chemins hors formulaire
  (API, graines) sont couverts aussi.
- **T-18-14** (Repudiation, montants persistés) : l'écart est rendu visible
  avant écriture, chiffré en euros, au lieu d'un ajustement silencieux du
  dernier participant.

Aucune route, aucun accès fichier et aucune frontière de confiance n'est
ajouté. Aucun paquet installé (T-18-SC non déclenché).

## Self-Check: PASSED

- `app/src/modules/adresses/components/place-form-dialog.test.tsx` — FOUND
- `app/src/modules/adresses/{types,api}.ts`, `hooks/use-adresses.ts`, `components/place-form-dialog.tsx`, `api.test.ts` — FOUND
- `app/src/modules/ardoise/{types.ts,spent.test.ts}`, `components/{expense-form-dialog.tsx,expense-form-dialog.test.tsx}` — FOUND
- `27b583d`, `5241226`, `9e6b9c4`, `f1b0026` — FOUND
