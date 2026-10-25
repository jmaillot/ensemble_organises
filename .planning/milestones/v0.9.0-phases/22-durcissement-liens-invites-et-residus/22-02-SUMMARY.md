# 22-02 — Le lot arrêté de six constats

**Statut :** terminé.

## Ce qui a été fait

Six constats, chacun re-vérifié **ouvert sur le code courant** avant d'être
touché (le lot vient de deux journaux, il a vieilli).

- **(a)** `app/src/modules/cercle/lib/media.ts` — `compressImage` refusait un
  fichier dont le `type` est **vide**, même quand sa seule extension
  l'identifiait (`image/heic` sur certains navigateurs, capture collée). La
  garde devient `file.type !== '' && !file.type.startsWith('image/')` : un type
  vide n'est plus un refus, l'extension tranche. `createImageBitmap` est
  enveloppé d'un `try/catch` qui lève le **même** message amical : un fichier
  non décodable était le seul chemin qui faisait sortir une `DOMException` brute
  du flux.
- **(b)** `app/src/modules/calendrier/calendrier-page.tsx:467` — l'appui long
  est la **cinquième** entrée de création du calendrier, et c'était la seule que
  la garde `isChild` ne bornait pas : un `enfant` ouvrait le dialogue d'ajout.
  `onLongPress={isChild ? undefined : openCreate}` ; dans
  `components/calendar-grid.tsx`, `onLongPress` devient **optionnel** (retour
  anticipé dans `startPress`, indication d'appui long conditionnelle) et
  `calendrier-page.tsx:253` ne promet plus le geste à qui ne l'a pas.
- **(c)** `app/src/hooks/use-notifications.ts:147` — deux instructions sur une
  seule ligne ; séparées.
- **(d)** `app/src/lib/data/useResource.ts` — `rows: query.data ?? []`
  fabriquait un tableau **neuf à chaque rendu** quand la requête est désactivée
  (aucun utilisateur de session). Constante de module `NO_ROWS` (`never[]`,
  assignable à tout `T[]`), utilisée aux deux points de repli. C'était la cause
  amont nommée par le §5 du journal de la phase 19 : le memo `items` de la
  cloche se recalculait pour une raison étrangère.
- **(f)** `app/src/modules/landing/landing-page.tsx:124` — le titre lisait
  « Seize espaces » pour **17** entrées de `lib/modules.ts`. Il lit
  `{modules.length}` : un nombre écrit en toutes lettres est une affirmation qui
  dérive en silence.
- **(g)** `app/src/modules/adresses/api.ts` — `isPlacePhotoPath` et
  `placePhotoPathOf` étaient des **copies locales** du verdict média partagé, et
  elles ne rognaient pas la valeur avant de juger. `isPlacePhotoPath` **est**
  `isHouseholdMediaPath` ; `placePhotoPathOf` délègue à `householdMediaPathOf`.
  Une seule définition du verdict dans le dépôt.

Deux défauts de **forme de la même classe** ont été corrigés au passage : une
accolade et une déclaration collées sur la même ligne (`it(…) => {    const
user = …`) dans `calendrier-page.test.tsx` et `landing-page.test.tsx`.

## Preuves

- Suite **ciblée** (les cinq fichiers touchés) : verte après restauration.
- **Preuve par mutation**, cinq mutations, chacune restaurée ensuite :
  | mutation | assertion qui rougit |
  |---|---|
  | (a) garde de `type` retirée | « accepte une image reconnue par sa seule extension (type vide) » |
  | (b) `onLongPress={openCreate}` | « masque les boutons de création à un enfant, qui tague sans créer (D-06) » |
  | (d) `?? NO_ROWS` → `?? []` | « rend le MÊME tableau entre deux rendus » |
  | (f) titre réécrit à la main | « annonce le nombre RÉEL d'espaces du catalogue » |
  | (g) verdict non rogné | « verdict média : la valeur est rognée avant de juger » |
- **(b), deuxième passe** : la première mutation faisait rougir **cinq** tests —
  l'assertion attendue plus quatre expirations. Cause : `vi.useRealTimers()`
  n'était pas atteint, les minuteries simulées restaient en place et les tests
  suivants expiraient. Les deux appuis longs du fichier passent désormais
  `useRealTimers()` dans un `finally` : la mutation ne fait plus rougir **qu'un**
  test, celui qui annonce la raison (AGENTS.md §2.7 D et F — une assertion qui
  échoue doit échouer pour la seule raison qu'elle annonce).

## Balayage de la classe (AGENTS.md §2.7 E)

La correction de (d) pose la question « quelles autres occurrences de la même
cause restent dans le dépôt ». Un balayage des `?? []` du frontend a été fait :

- **`app/src/modules/voyages/hooks/use-voyages.ts:96`** — `const tripRows =
  tripsQuery.data ?? []`, produit au rendu et consommé comme dépendance d'un
  `useEffect` **et** d'un `useMemo` : même forme que (d). Conséquence
  observable : un effet et un memo recalculés à chaque rendu pendant le
  chargement, **sans qu'aucune donnée ait changé** — et l'effet sort
  immédiatement (`pending.length === 0`). Aucun scénario d'échec concret n'a été
  trouvé. **Non corrigé**, hors du lot arrêté et absent des deux journaux :
  consigné ici plutôt que corrigé en silence, comme le veut la pratique du
  dépôt pour un relevé d'exécution.
- `app/src/modules/ardoise/hooks/use-ardoise.ts:165` (`memberIds`),
  `app/src/modules/voyages/hooks/use-trip-detail.ts:175` (`guests`),
  `app/src/modules/cadeaux/hooks/use-cadeaux.ts:191-192` — produits au rendu,
  mais **aucun** consommateur ne mémoïse dessus (`.map`, `.length`, props) :
  l'identité instable n'a pas d'effet. Rien à corriger.
- Le repli partagé de (d) n'introduit pas de piège de mutation : **aucun**
  consommateur ne modifie `rows` sur place (recherche sur `rows.sort(…)/push(…)
  /reverse(…)/splice(…)` ; les deux seuls `rows.push` du dépôt, `lib/data/seed.ts`
  et `modules/recettes/api.ts`, portent sur des tableaux locaux).

## Ce que le lot ne couvre pas

Les journaux des phases 18/19 contiennent d'autres entrées (§2, §7, §9, §10,
§11, §12, §13, §14, §15, §16) qui **ne sont pas** dans ce lot. Leur statut n'est
ni « ouvert » ni « fermé » ici : l'affirmer supposerait un recensement exhaustif
qui n'a pas été fait (AGENTS.md §2.7 I).

## Hors périmètre, consigné (R3)

Inchangé depuis 22-01 : `gift-list-invite/index.ts:857` et
`ardoise-invite/index.ts:637` signent un chemin brut avec le service-role, sans
borne de foyer — même classe que R1, surfaces distinctes.

> **Note du 2026-10-17 :** ce constat a été **fermé par la phase 23** (migration
> `0128`) — la section décrit l'état au moment du plan 22-02, pas l'état courant.

## Chaîne complète (arbre figé, `main`)

- `cd app && npm run typecheck` → **propre**.
- `cd app && npm test` → **148 fichiers / 1264 tests verts** (1263 avant 22-02 : le
  cas ajouté à `media.test.ts` est bien compté).
- `cd app && npm run build` → **vert** (PWA, 100 entrées précachées).
- `cd app && npm run test:e2e` → **123 passés / 5 ignorés**.
- `python3 scripts/check-sql-statique.py` → **0 défaut** (181 fonctions, 127
  migrations, 66 tests).
- `sh scripts/test-db.sh` → **64/64 fichiers verts** (relancé : `0127` a changé,
  voir l'addendum de 22-01).

Le seul changement d'exécution entre le début de ce passage et le commit est le
cas ajouté à `media.test.ts` ; le compteur de tests le confirme (1263 → 1264).

