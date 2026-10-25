# 22-01 — Une référence média rendue à un invité est bornée à son foyer

**Statut :** terminé. **Commits :** `supabase/migrations/0127_guest_media_household.sql`,
`supabase/tests/0127_guest_media_household.sql`.

## Ce qui a été fait

Fermeture des deux risques acceptés de la phase 21 (`21-SECURITY.md`) :

- **AR-21-02** — la contrainte `recipe_steps_photo_path_household` (0126) est un
  contrôle de préfixe **littéral** : `<homeA>/../<homeB>/x.jpg` la satisfaisait.
  `0127` la recrée avec `strpos(photo_path, '..') = 0` (même nom, définition
  effective = la dernière, AGENTS.md §2.7 A.2).
- **AR-21-01** — `recipes.cover_photo` n'avait aucune borne, et le RPC rendait la
  valeur brute. `view_recipe_share` recopiée de `0125` avec un `case` sur
  `cover_photo` **et** sur chaque `photo_path` d'étape : ne sort du RPC qu'une
  valeur qui commence par `<foyer de la recette>/` et ne contient pas `..`.

## Pourquoi le verdict vit dans le RPC et pas dans l'Edge

Le RPC est le **seul** chemin par lequel l'Edge `recipe-invite` obtient une
valeur à signer (`index.ts:442` → `:481` et `toGuestSteps`), et il connaît le
foyer de la recette **par construction** — l'Edge, non. Filtrer là où le savoir
est autoritaire évite de changer la signature de `resolveGuestMediaUrl` (dont
les preuves Vitest restent vraies sans retouche).

Pourquoi pas de contrainte d'écriture sur `recipes.cover_photo` : la colonne est
antérieure à toute borne, sa forme `http(s)` est tolérée (motif 0118/voyages) et
le client réécrit la valeur existante à chaque édition (`use-recettes.ts:202`) —
une contrainte refuserait l'édition d'une ligne héritée, et `not valid` la
rendrait presque inerte. Le trou était la **signature** service-role, fermée à
la lecture, y compris sur une ligne héritée.

## Preuves

- `sh scripts/test-db.sh` → **64/64** fichiers verts (le nouveau inclus).
- `python3 scripts/check-sql-statique.py` → **0 défaut** (181 fonctions, 127
  migrations, 66 tests).
- **Mutation 1** — contrainte sans `strpos` : le cas (a2) rougit
  (« un chemin qui remonte par `..` est refuse »).
- **Mutation 2** — `cover_photo` rendue brute : le cas (b2) rougit
  (« une couverture d'un autre foyer ne sort pas du RPC »).
- **Mutation 3** — `photo_path` rendu brut : le cas (c) rougit
  (« une photo d'etape d'un autre foyer ne sort pas du RPC »).
- Les trois mutations ont été appliquées puis la définition vraie restaurée
  avant le passage complet.

## Ce que le test (c) a exigé

La contrainte d'écriture rend l'état « ligne héritée pointant un autre foyer »
**inatteignable** aujourd'hui : le test retire donc la contrainte le temps de
l'écriture, puis la restaure **telle quelle, lue depuis le catalogue**
(`pg_get_constraintdef`) — jamais recopiée à la main, sinon la restauration
dériverait en silence. Sans cette mise de côté, l'assertion aurait été
incapable d'échouer, donc inutile (AGENTS.md §2.7 D).

## Hors périmètre, consigné (R3)

`gift-list-invite/index.ts:857` et `ardoise-invite/index.ts:637` signent aussi un
chemin brut avec le service-role, sans borne de foyer — même classe, surfaces
distinctes, aucune donnée de la phase 21. Le foyer y est disponible sur le site
d'appel (`gift-list-invite/index.ts:750`, `ardoise-invite/index.ts:532`).

> **Note du 2026-10-17 :** ce constat a été **fermé par la phase 23** (migration
> `0128`) — la section décrit l'état au moment du plan 22-01, pas l'état courant.

## Addendum (2026-10-16, commit `c02d9bf`) — une clause n'était prouvée par rien

Relevé pendant la rédaction de `22-VERIFICATION.md`, en relisant le test pour le
décrire : le filtre de lecture des étapes porte **deux** conditions —
`starts_with(st.photo_path, v_recipe_household || '/')` **et**
`strpos(st.photo_path, '..') = 0`. Le cas (c) écrit un chemin d'un autre foyer,
que `starts_with` seul rejette déjà : la clause `strpos` n'était donc exercée par
**rien**. Or c'est elle qui retient une ligne héritée du type
`<homeA>/../<homeB>/…` — valeur que la contrainte 0126 laissait passer à
l'écriture, et que l'Edge service-role aurait ensuite signée. Sans elle, AR-21-02
se rouvrait par le chemin de **lecture**, alors que (a2) le ferme à l'écriture.

Le cas **(c2)** ajouté écrit cette ligne héritée (même mise de côté de la
contrainte que (c)) et exige `null` du RPC. Preuve par mutation, **clause par
clause**, sur la fonction en base :

- `strpos` retirée des étapes → (c2) rougit : « une photo d'etape qui remonte par
  `..` ne sort pas du RPC » ;
- `starts_with` retiré des étapes → (c) rougit : « une photo d'etape d'un autre
  foyer ne sort pas du RPC ».

Dans les deux mutations la clause de **couverture** reste intacte, et la
définition vraie est restaurée depuis la migration avant le passage complet.

**Ce que la première tentative a appris.** La première mutation de cette clause
n'a rien fait rougir — elle écrivait `fn`, la fonction **non mutée** (le
`.replace()` avait été oublié). Le test est alors resté vert, ce qui se lit
exactement comme « l'assertion est vide, donc inutile ». C'était faux : c'était
la mutation qui n'existait pas. Une mutation doit **prouver qu'elle a atterri**
avant qu'on interprète son résultat :

```sql
select position('strpos(st.photo_path' in prosrc) as clause_etapes,
       position('strpos(v_recipe_cover' in prosrc) as clause_couverture
  from pg_proc where proname = 'view_recipe_share';
```

Attendu sous mutation des étapes : `0` et `> 0`. Sans cette vérification, le
verdict « le test ne sait pas rougir » était une conclusion juste sur une
observation fausse (AGENTS.md §2.7 F).
