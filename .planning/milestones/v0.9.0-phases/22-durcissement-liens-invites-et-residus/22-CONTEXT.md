# 22 — Durcissement des liens invités et résidus vérifiés — CONTEXTE

**Type :** phase de fermeture. Elle ne crée pas de fonctionnalité : elle ferme
des constats **déjà consignés et vérifiés ouverts** dans les phases 18, 19 et 21.

**Origine :** les deux risques acceptés de la phase 21 (`21-SECURITY.md`,
AR-21-01 et AR-21-02) et un **lot arrêté de six constats** des journaux des
phases 18/19 (`deferred-items.md`), chacun re-vérifié ouvert sur le code
courant : (a) `cercle/lib/media.ts:76`, (b) `calendrier-page.tsx:467`,
(c) `use-notifications.ts:147`, (d) `lib/data/useResource.ts:146`,
(f) `landing-page.tsx:124`, (g) `adresses/api.ts:81`.

Le septième constat du lot, (e) — course `seedTwoSteps` dans
`app/e2e/recettes.spec.ts` — a été **fermé par 21-05** (attente du champ vide
avant la saisie suivante, course mesurée sous `--repeat-each`) : il est retiré
du lot, pas « reporté ».

**Ce que « lot arrêté » veut dire, et ne veut pas dire.** Les journaux des
phases 18/19 contiennent d'autres entrées (§2, §7, §9, §10, §11, §12, §13,
§14, §15, §16) qui **ne sont pas dans ce lot**. Leur statut n'est **pas**
affirmé ici : ni « ouvert », ni « fermé ». Écrire « les six constats encore
ouverts » supposerait un recensement exhaustif qui n'a pas été fait, et une
absence affirmée est une affirmation (AGENTS.md §2.7 I).

## Ce que la phase ne fait pas

- Pas de photos sur les ingrédients, pas de vidéo/audio, pas de galerie.
- Pas de reprise des deux autres Edge qui signent un chemin brut
  (`gift-list-invite:857`, `ardoise-invite:637`) : même classe, **périmètre
  distinct**, aucune donnée de phase 21. Consigné en R3 (résidu nouveau, avec
  `file:line`), jamais présenté comme clos.
- Pas de contrainte d'écriture sur `recipes.cover_photo` (voir D-02).

## Décisions

- **D-01 — La barrière invité vit dans le RPC, pas dans l'Edge.** Le seul
  chemin par lequel l'Edge `recipe-invite` obtient une valeur à signer est
  `view_recipe_share` (`index.ts:442`, puis `:481` et `toGuestSteps`). La
  fonction connaît le foyer de la recette **par construction** ; l'Edge, non.
  Filtrer là où le savoir est autoritaire vaut mieux que revalider ailleurs une
  valeur déjà rendue. Conséquence : `resolveGuestMediaUrl` **ne change pas** de
  signature, et les cas Vitest existants (passthrough `http(s)`, TTL, échec
  fermé) restent vrais sans retouche.
- **D-02 — `recipes.cover_photo` n'est pas bornée à l'écriture.** La colonne est
  antérieure à la contrainte, sa forme `http(s)` est tolérée (motif couverture
  0118/voyages, `12-03` : « le CHEMIN pour les nouveaux dépôts, et l'URL »), et
  le client réécrit la valeur existante à chaque édition
  (`use-recettes.ts:202`, `coverPhoto: recipe.coverPhoto`). Une contrainte
  casserait l'édition d'une ligne héritée ; `not valid` la rendrait presque
  inerte. Le trou réel n'est pas l'écriture, c'est la **signature service-role
  d'un objet d'un autre foyer** : il est fermé par D-01.
- **D-03 — Le verdict de forme média est unique.** `adresses/api.ts` garde une
  copie locale de `isHouseholdMediaPath` (`:76`, non ancrée) et de
  `householdMediaPathOf` (`:81`, non rognée) ; `deferred-items.md` de la phase
  18 §5 annonçait que 19-13 ferait basculer cet appelant — il ne l'a pas fait.
  Le plan 22-02 bascule `placePhotoPathOf` sur `householdMediaPathOf` et
  `isPlacePhotoPath` sur `isHouseholdMediaPath`.
- **D-04 — Un `..` ne peut pas naître.** La contrainte 0126 est un contrôle de
  **préfixe littéral** : `<homeA>/../<homeB>/x.jpg` la satisfait. 22-01 ajoute
  `strpos(photo_path, '..') = 0` (écriture) **et** le même verdict dans le RPC
  (lecture) : aucun chemin signé ne contient `..`, quelle que soit la
  normalisation que fait Storage (non observable ici, `deno` absent).
- **D-05 — Un nombre écrit en toutes lettres est une affirmation.** « Seize
  espaces » (`landing-page.tsx:124`) compte 17 entrées dans
  `lib/modules.ts:50-68`. Le titre lit désormais `modules.length` : le nombre ne
  peut plus dériver.

## Exigences

- **R1** — Aucun chemin signé par l'Edge `recipe-invite` n'appartient à un autre
  foyer ni ne contient un segment `..` ; une valeur illégitime rend `null`
  (échec fermé), une valeur légitime reste signée à l'identique.
- **R2** — Les six constats du **lot arrêté** ((a) à (g) de 22-CONTEXT.md) sont
  fermés avec preuve, jamais « reportés » sans trace. Les autres entrées des
  journaux 18/19 sont hors lot et leur statut n'est pas affirmé.
- **R3** — La même classe de signature non validée dans `gift-list-invite` et
  `ardoise-invite` est consignée avec `file:line`, hors périmètre.

## Prohibitions

- Ne réécrire aucune migration appliquée (`0125`, `0126`) : corriger vers
  l'avant (`0127`).
- Ne pas introduire de directive de linter : aucun linter n'est configuré dans
  ce dépôt, une directive serait lue par personne.
- Ne pas présenter comme close une assertion qui ne peut pas échouer, ni une
  affirmation non ouverte dans le code.
