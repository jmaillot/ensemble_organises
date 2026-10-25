# Phase 21: Photos dans les étapes de recette - Research

**Researched:** 2026-10-16
**Domain:** Attachment média (photo) sur une table fille existante (`recipe_steps`), bucket privé `household-media`, 4 surfaces de rendu (fiche membre, mode cuisine, lien invité, impression), signature d'URL côté Edge.
**Confidence:** HIGH — les politiques Storage, la RLS de `recipe_steps`, les formes de code (dépôt, résolution, projection invitée, print) et la chaîne de tests ont été lus **dans les fichiers sources cette session**, avec citations verbatim + plages de lignes.

<user_constraints>
## User Constraints (from CONTEXT.md)

> Copie verbatim de `.planning/phases/21-photos-dans-les-etapes-de-recette/21-CONTEXT.md`. Les décisions sont **verrouillées** : la recherche dit *comment* les réaliser, jamais si les remplacer.

### Locked Decisions

**### Modèle de données et dépôt — discrétion de l'agent (zone non sélectionnée)**

- **D-01 — une colonne, pas une table fille.** `recipe_steps` porte une colonne `photo_path text` nullable. La cardinalité est exactement 1 ; `note_attachments` est le motif pour N. Conséquence décisive : la référence meurt avec la ligne, et surtout **aucune politique nouvelle n'est nécessaire** — `recipe_steps` porte déjà ses quatre politiques (`0122:305-344`), donc la classe `*_delete_admin` (`18-§3`) ne peut pas être reproduite par cette phase. *Undo: costly* (migration + code).
- **D-02 — le dépôt passe par `depositHouseholdFile`, sans nouvelle fonction.** Dossier `recipes/<recipeId>/steps/<stepId>` → chemin complet `<householdId>/recipes/<recipeId>/steps/<stepId>/file-<random>.<ext>`. Le premier segment reste le `householdId`, donc les politiques du bucket `household-media` continuent de juger le foyer par le chemin. *Undo: reversible* (chaîne de caractères).
- **D-03 — la colonne porte la VALEUR DE COLONNE, jamais l'URL.** `storedValueOf(deposited)` : chemin de bucket en Supabase, `blob:` en démo. Doctrine **D-01 phase 19**, et critère négatif du SPEC (aucune URL `http(s)://` en colonne). *Undo: costly*.
- **D-04 — un remplacement produit un chemin neuf, donc un nettoyage.** Le nom étant aléatoire, le nouveau chemin diffère toujours de l'ancien ; `replacedMediaPath(previous, next)` (phase 19) rend l'ancien et la suppression s'applique. La garde « même chemin → ne rien supprimer » reste écrite : elle protège l'objet qu'on vient d'écrire si le chemin devenait stable un jour.
- **D-05 — le nettoyage est piloté par le client, avec les chemins qu'il a déjà.** Le SQL en cascade ne touche pas Storage. `deleteRecipe(id, coverPhoto)` prend déjà le chemin de la couverture en argument ; la fiche a `steps` chargées, donc elle connaît tous les chemins d'étape. `deleteRecipeStep(id, photoPath)` suit le même motif. Un objet orphelin reste possible si la suppression échoue ou si une autre session a supprimé l'étape : **limite acceptée, identique à celle de `deleteRecipe` aujourd'hui**. Le SPEC R5 exige l'exhaustivité des tentatives, pas la garantie transactionnelle.

**### Rendu sur les quatre surfaces**

- **D-06 — fiche membre : image pleine largeur sous le texte de l'étape.** L'option « vignette à droite » a été écartée (choix utilisateur). Le motif des vignettes de `note_attachments` n'est donc pas repris.
- **D-07 — plein écran au tap, sur la fiche et en mode cuisine.** Motif déjà présent (`card-code-dialog.tsx`) ; refermable, accessible au clavier.
- **D-08 — mode cuisine : grande image sous le texte, réduite ou masquée une fois l'étape cochée** — cohérent avec le `line-clamp` du texte coché dans `recipe-cuisine-view.tsx`.
- **D-09 — impression : image sous la ligne numérotée, largeur bornée.** Le modèle d'impression doit porter une URL résolue par étape (la ligne de texte reste la référence si l'image ne charge pas). La feuille `recipe-export.css` reste **CSS seule**, aucune dépendance PDF.
- **D-10 — étape sans photo : aucun élément média** sur les quatre surfaces — ni trou, ni cadre vide, ni image cassée (SPEC R3 + arête R3).

**### Affordance d'ajout et de retrait**

- **D-11 — étape sans photo (membre qui écrit) : une invitation discrète sous l'étape** (« Ajouter une photo », style lien discret). Un `enfant` ne la voit pas (SPEC R2). Les options « rien du tout » et « emplacement vide visible » ont été écartées.
- **D-12 — étape avec photo : un seul bouton sous l'image qui ouvre le sélecteur** (« Modifier la photo ») ; le retrait vit dans une barre d'actions secondaire. L'option « croix en surimpression + bouton Remplacer » a été écartée.
- **D-13 — le retrait demande confirmation** (motif `pendingDelete` déjà en place dans `recipe-steps.tsx` pour supprimer une étape) ; le **remplacement non** — il est déjà un geste explicite (SPEC R1 : l'ajout remplace).
- **D-14 — le remplacement est direct** : le sélecteur remplace l'ancienne photo et nettoie l'objet précédent, sans étape intermédiaire.

**### Charge invitée et mode démo**

- **D-15 — `steps[].photoUrl`, URL signée d'une heure ou `null`.** Même nom et même forme que `coverPhotoUrl` au niveau recette ; la projection cliente (`fetchGuestRecipeView`) reste symétrique. Champ ajouté à `GuestRecipeStep` (`api.ts:458`).
- **D-16 — le RPC rend la colonne brute, l'Edge signe.** `view_recipe_share` (`0122:637`) ajoute `photo_path` au jsonb de chaque étape, comme il rend déjà `cover_photo` au niveau recette ; l'Edge `recipe-invite` la transforme via `admin.storage.createSignedUrl`, TTL 1 h (constante existante `GUEST_PHOTO_TTL_SECONDS`), échec fermé → `null`. **Un seul endroit signe, un seul endroit décide du TTL.**
- **D-17 — rendu invité identique à la fiche membre** : image pleine largeur sous le texte, plein écran au tap.
- **D-18 — mode démo : même colonne, valeur `blob:`.** Exactement comme `cover_photo` aujourd'hui ; `resolveHouseholdMediaUrl` rend les formes non-chemin telles quelles ; après rechargement l'aperçu est mort et **masqué (`onError`)**, l'étape se rend comme sans photo avec l'invitation d'ajout (SPEC R6).

**### Arêtes retenues (backstops du SPEC)**

- **B-1 — remplacement concurrent** : deux membres ajoutent une photo à la même étape ; le dernier écrit gagne, l'objet du perdant peut devenir orphelin. Test d'arête à écrire.
- **B-2 — suppression concurrente** : supprimer une recette pendant qu'un dépôt d'étape est en vol peut laisser un objet orphelin. Test d'arête à écrire.

**### Décisions héritées (à ne pas redécouvrir)**

- Phase 19 **D-01** : toute colonne média porte le **chemin**, signé à la lecture par `lib/storage.ts`, point unique.
- Phase 19 **D-03** : la ligne et son objet meurent ensemble — mais le SQL ne touchant pas Storage, la mort de l'objet est **pilotée par le client** (D-05).
- Phase 19 **D-04** : ne jamais inventer un type — `acceptedMimeOf` lit l'extension quand `file.type` est vide.
- Phase 18 **§3** : la classe `*_delete_admin` est **hors périmètre** ici, et **ne doit pas être reproduite** par le schéma de cette phase.
- Phase 20 **D-08(a)** : un `select` non déclaré dans la clé de requête partage une entrée de cache — à considérer si la fiche déclare un `select` sur les étapes.

### the agent's Discretion

CONTEXT.md déclare explicitement la seule zone de discrétion : **« Modèle de données et dépôt — discrétion de l'agent (zone non sélectionnée) »** (D-01…D-05 ci-dessus). Le « quoi » est verrouillé par `21-SPEC.md` ; le « comment » exact du modèle (nom de colonne, dossier de dépôt, forme du jsonb) est à trancher par l'exécutant dans les bornes de ces décisions.

### Deferred Ideas (OUT OF SCOPE)

CONTEXT.md ne contient pas de section « Deferred Ideas ». Le périmètre exclu est verrouillé par `21-SPEC.md` §Boundaries :

- Photos sur les ingrédients — seule l'étape est concernée (décision du 2026-10-16, tour 2).
- Vidéo et audio — image seulement (tour 2).
- Galerie, carrousel, plusieurs photos par étape, réordonnancement d'images — une seule image, cardinalité 1 (tours 1 et 2).
- Légende, crédit ou tout texte associé à la photo — une photo et rien d'autre (tour 3).
- Glisser-déposer d'un fichier depuis le bureau vers une étape — le bouton ouvre le sélecteur de fichiers (tour 3).
- Un export PDF serveur — l'export reste `window.print()` + CSS (état actuel).
- La classe `*_delete_admin` hors de la table de cette phase — le relevé `18-§3` reste ouvert pour les quatorze autres politiques.
- Les sept résidus vérifiés ouverts des registres `deferred-items.md` des phases 18/19 (`compressImage`, appui long du calendrier, stabilité de `useResource.rows`, instabilité de `recettes.spec.ts`, copie de la landing, `placePhotoPathOf`, ligne double de `use-notifications`) — sujets distincts.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (from 21-SPEC.md) | Research Support |
|----|-------------------------------|------------------|
| R1 | Une photo par étape, remplaçable : au plus une photo par étape ; ajouter sur une étape photographiée remplace et supprime l'objet précédent du bucket. | Colonne `photo_path text` nullable sur `recipe_steps` (D-01) garantit la cardinalité 1 ; dépôt via `depositHouseholdFile` (D-02) ; remplacement + nettoyage par `replacedMediaPath` (D-04). Preuve : §Architecture Patterns P1/P2, §Code Examples. |
| R2 | Ajout et retrait par tout membre qui écrit ; l'`enfant` voit sans modifier. | `recipe_steps` porte déjà ses 4 politiques sur `can_write_household` (`0122:305-344`), aucune admin-seule ; côté UI `readOnly` est déjà porté par `recipe-steps.tsx`. Aucune politique nouvelle (D-01). Preuve : §Architecture Patterns P4, §Security Domain. |
| R3 | Affichage sur les quatre surfaces ; étape sans photo = aucun élément média. | Fiche membre : `recipe-steps.tsx` `StepRow` ; cuisine : `recipe-cuisine-view.tsx` ; invité : `guest-recipe-page.tsx` réutilise les mêmes composants ; impression : `recipe-export.css` + `toRecipePrintModel`. Preuve : §Architecture Patterns P3/P5, §Code Examples. |
| R4 | Lien invité signé côté serveur (TTL 1 h), jamais un chemin brut. | `view_recipe_share` rend `photo_path` brut (D-16) ; l'Edge `recipe-invite` signe via `admin.storage.createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS)`, échec fermé → `null`. Preuve : §Architecture Patterns P6, §Code Examples. |
| R5 | Nettoyage du bucket aux trois niveaux (retrait, suppression d'étape, suppression de recette). | Nettoyage piloté client (D-05) : `deleteRecipeStep(id, photoPath)`, `deleteRecipe(id, coverPhoto, stepPaths)` suivent le motif existant `deleteRecipe` (`api.ts:234-238`). Preuve : §Architecture Patterns P2, §Code Examples. |
| R6 | Mode démo local : aperçu `blob:` éphémère, masqué (`onError`) après rechargement. | `depositHouseholdFile` rend `{ url: URL.createObjectURL(blob), path: null, … }` en démo ; `resolveHouseholdMediaUrl` rend les formes non-chemin telles quelles ; `onError` masque l'aperçu mort. Preuve : §Architecture Patterns P7, §Common Pitfalls. |
</phase_requirements>

## Summary

La phase ajoute **une** colonne nullable `photo_path text` à `recipe_steps` (déjà RLS-complète), dépose la photo dans le bucket privé `household-media` sous `<householdId>/recipes/<recipeId>/steps/<stepId>/file-<random>.<ext>`, et l'affiche sur quatre surfaces. Le verdict le plus important : **aucune politique Storage nouvelle n'est nécessaire** — les politiques de `household-media` jugent le foyer par le **premier segment** du chemin (`(storage.foldername(name))[1]`), qui reste le `householdId` ; le dossier `recipes/…` vit sous ce segment. De même, **aucune politique de table nouvelle** : `recipe_steps` porte déjà ses quatre politiques (`select` membre, `insert`/`update`/`delete` sur `can_write_household`), donc la classe `*_delete_admin` (`18-§3`) ne peut pas être reproduite.

Le second verdict structurel : le rendu de l'image doit vivre **dans les composants partagés** (`recipe-steps.tsx` `StepRow`, `recipe-cuisine-view.tsx`) car la page invitée (`guest-recipe-page.tsx`) **réutilise exactement ces composants** — un rendu ajouté une seule fois couvre fiche membre **et** invité (D-17). Le plein écran ne peut **pas** réutiliser `card-code-dialog.tsx` tel quel : sa signature est liée à la carte de fidélité (`card: LoyaltyCard | null`, `onScan`/`onMarkUsed`/`onEdit`/`onDelete`). Il faut un composant jumeau paramétré par une URL.

Le troisième verdict : le RPC `view_recipe_share` rend aujourd'hui `cover_photo` **brut** et les étapes en `{id, content, position}` ; la phase y ajoute `photo_path` (brut) et l'Edge `recipe-invite` — qui signe **déjà** la couverture — signe chaque photo d'étape avec la même constante `GUEST_PHOTO_TTL_SECONDS = 3600` et le même échec fermé → `null`.

**Primary recommendation:** Ajouter la colonne par une **nouvelle** migration (`0125_*`, jamais réécrire `0122`), réutiliser `depositHouseholdFile`/`storedValueOf`/`replacedMediaPath`/`removeHouseholdFile` sans en créer de nouveaux, étendre `view_recipe_share` + `recipe-invite` (une seule signature, un seul TTL), et poser le rendu de l'image **dans les composants partagés** pour couvrir les 4 surfaces d'un coup.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dépôt / remplacement de la photo d'étape | Browser / Client | Database / Storage | `depositHouseholdFile` s'exécute dans le navigateur (compression `createImageBitmap` + `supabase.storage.upload`) ; l'autorisation est la politique `household_media_insert` (RLS Storage). |
| Persistance de la référence (colonne) | Database / Storage | — | La colonne `photo_path` porte le chemin de bucket ; la RLS de `recipe_steps` (`can_write_household`) est la barrière finale. |
| Lecture signée (membre du foyer) | Browser / Client | Database / Storage | `resolveHouseholdMediaUrl` forge l'URL signée avec la session utilisateur (`createSignedUrl`) ; la politique `household_media_read` autorise. |
| Lecture signée (visiteur sans compte) | API / Backend | Database / Storage | Seule l'Edge `recipe-invite` signe (client admin, clé secrète) — le visiteur n'a ni session ni accès Storage direct. |
| Rendu des 4 surfaces | Browser / Client | — | Composants React partagés (fiche, cuisine, invité) + CSS `@media print` (impression) ; aucun serveur de rendu. |
| Nettoyage du bucket (3 niveaux) | Browser / Client | Database / Storage | Piloté par le client avec les chemins connus (D-05) ; le SQL en cascade ne touche pas Storage. |
| Masquage de l'aperçu mort en démo | Browser / Client | — | `onError` sur `<img>` (D-18) ; purement DOM. |

## Project Constraints (from AGENTS.md)

Directives actionnables extraites de `./AGENTS.md` (autorité identique aux décisions verrouillées). La recherche ne recommande rien qui les contredise.

**Chaîne de vérification (§2.7) — la seule, dans cet ordre :**
```sh
cd app && npm run typecheck && npm test && npm run build
cd app && npm run test:e2e
python3 scripts/check-sql-statique.py
sh scripts/test-db.sh          # sur une machine qui a Docker
sh scripts/test-dispatch-push.sh   # en plus, et ce n'est pas équivalent
```
- **Aucun linter n'est configuré** (ni ESLint, ni Biome, ni Prettier) ; une directive de linter est **proscrite** ; `app/src/lib/no-eslint-directive.test.ts` refuse la réintroduction d'une directive. Un effet dont on omet volontairement une dépendance porte un commentaire qui **nomme la raison**, jamais « dépendances volontairement omises ».
- Docker n'est pas toujours disponible : les trois premières étapes suffisent alors, et `test-db.sh` devient un **passage obligatoire** avant de considérer un changement SQL comme validé. Ne pas annoncer « le SQL est bon » parce que la migration s'est appliquée.
- **A. Ne jamais réécrire une migration appliquée** — corriger vers l'avant, dans une nouvelle migration. Ce qui compte est la **définition effective** d'une fonction. `set search_path = ''` n'est pas facultatif, et un `search_path` vide ne résout **aucun** nom : toute table s'écrit `public.recipe_steps`.
- **B. Le contrôle statique SQL** `python3 scripts/check-sql-statique.py` — vert avant tout commit. **Un contrôle se prouve sur un cas qui doit échouer.**
- **C. La frontière du conteneur** : `psql.sh < fichier` (stdin) correct ; `psql.sh -f fichier` échoue ; `psql.sh -c "… $SECRET …"` **jamais**.
- **D. Écrire une assertion à partir de l'implémentation** : lire la fonction avant l'assertion ; **toute assertion borne sa portée** (par foyer, jamais un total nu ; `authenticated` borne par RLS, `postgres` court-circuite) ; **aucune tautologie** ; sur un fichier de test nouveau, un échec est la norme ; `testkit.eq` est `eq(anyelement, anyelement, text)` — les deux valeurs doivent être du **même type** ; `testkit.count('…')` s'exécute dans une fonction séparée (une variable du bloc appelant n'y existe pas). Une assertion qui lit le CODE comme du texte est un instrument faible (`pg_get_functiondef` re-déparse).
- **E. Corriger la classe, pas l'instance.** **F. Un succès muet est un échec inexpliqué.** **G. Le message de commit est vérifié avant le push.** **H. Les secrets** : ni versionnés, ni en ligne de commande, ni dans `cron.job.command`. **I. Une absence affirmée est une affirmation** — la vérifier par un `grep` sur le symbole.

**Sécurité (§2.6) :**
- La RLS est la **frontière d'autorisation finale**. Chaque table métier multi-foyer active la RLS avec des politiques explicites `SELECT`/`INSERT`/`UPDATE`/`DELETE`.
- Les politiques d'écriture vérifient le rôle du foyer ; un membre ne peut pas s'attribuer un autre rôle, foyer ou participant.
- Les buckets Storage sont **privés par défaut** ; leurs politiques vérifient propriétaire et foyer **via le chemin de l'objet** ; aucun bucket média public non justifié.
- Les opérations serveur sensibles s'exécutent **côté serveur avec la clé secrète, jamais depuis le client**.
- **Frontend : clé publiable `SUPABASE_PUBLISHABLE_KEY` uniquement.** `SUPABASE_SECRET_KEY` reste exclusivement dans les services serveur/Edge Functions.

**Edge Functions (§2.2 / §8.4) :** chaque fonction déclare explicitement son mode via `withSupabase` (`auth: 'publishable' | 'user' | 'secret' | 'none'`), une fonction multi-clients accepte un tableau. `recipe-invite` utilise aujourd'hui `withSupabase({ auth: ['user', 'publishable'] }, …)`.

**Stack & dépendances :**
- **Pas de nouvelle dépendance** (SPEC Constraints ; doctrine répétée de la phase 16). La compression passe par `createImageBitmap`/`canvas` déjà en place (`modules/cercle/lib/media`) ; l'impression reste CSS.
- Les **patchs sont épinglés** dans le lockfile ; images Docker par digest. Ne pas utiliser de plages de versions flottantes.
- Imports de routing : `react-router` (jamais `react-router-dom`). `@supabase/supabase-js v2`, TanStack Query v5, Zustand v5, Tailwind v4, dnd-kit modulaire.

**Architecture du projet (§3) :** chaque module suit la même structure interne : `components/`, `hooks/`, `api.ts` (requêtes Supabase), `types.ts`. Les migrations vivent dans `supabase/migrations` (source de vérité du schéma) ; les tests SQL dans `supabase/tests` ; les fonctions métier dans `supabase/functions`.

## Standard Stack

**Aucune nouvelle dépendance n'est introduite par cette phase** (SPEC Constraints ; AGENTS.md §2.5 « Pas de nouvelle dépendance »). La recherche ci-dessous inventorie l'outillage **déjà présent** que la phase doit réutiliser.

### Core (existant, réutilisé tel quel)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | `2.117.2` | Client Storage (`upload`, `createSignedUrl`, `remove`) + Auth | Client officiel typé ; version vérifiée dans `app/package.json` (`"@supabase/supabase-js": "2.117.2"`) |
| `@tanstack/react-query` | v5 | Cache des étapes (`useQuery`), invalidation | Motif établi de `use-recettes.ts` ; clés `queryKeys.tableAll` |
| `@dnd-kit/core` + `/sortable` + `/utilities` | v6/v10/v3 | Réordonnancement des étapes (inchangé) | Déjà monté dans `recipe-steps.tsx` |
| Tailwind CSS | v4 | Style des surfaces | Configuration CSS-first |

### Supporting (helpers internes — à réutiliser, jamais réimplémenter)
| Helper | Fichier | Purpose | When to Use |
|--------|---------|---------|-------------|
| `depositHouseholdFile` | `app/src/lib/storage.ts:109` | Dépose un fichier sous `<householdId>/<folder>/…`, compresse les images, rend `{url, path, name, mime, size}` | Dépôt de la photo d'étape (D-02) |
| `storedValueOf` | `app/src/lib/storage.ts:173` | **Point unique** de la valeur de colonne : `path ?? url` | Écriture de `photo_path` (D-03) |
| `replacedMediaPath` | `app/src/lib/storage.ts:253` | Décision pure « quel objet retirer » au remplacement | Nettoyage de l'objet précédent (D-04) |
| `resolveHouseholdMediaUrl` | `app/src/lib/storage.ts:210` | Forge l'URL affichable (non-chemin rendu tel quel, chemin signé, échec fermé → `null`) | Lecture membre (fiche) |
| `removeHouseholdFile` | `app/src/lib/storage.ts:158` | Supprime un objet (best-effort, no-op si `path` null) | Nettoyage aux 3 niveaux (R5) |
| `householdMediaPathOf` | `app/src/lib/storage.ts:194` | Chemin de bucket d'une valeur stockée, `null` sinon | Nettoyage / détection |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Colonne `photo_path` sur `recipe_steps` | Table fille `recipe_step_photos` (cardinalité 1 contrainte) | **Écarté par D-01** : le motif N est `note_attachments`, dont la politique `delete` est admin-seule (`18-§3`) — reproduire la classe est interdit. Une table fille à cardinalité 1 serait plus lourde pour un atout unique. |
| Nettoyage piloté client (D-05) | `supabase.storage.list()` par préfixe + `remove` en boucle | **Non retenu** : `storage.list()` n'est utilisé **nulle part** dans le dépôt (seuls `upload`/`createSignedUrl`/`remove` sont employés) ; D-05 est verrouillée ; la limite (objet orphelin possible) est la même que celle de `deleteRecipe` aujourd'hui. |
| Composant plein écran jumeau | Réutiliser `card-code-dialog.tsx` | **Impossible tel quel** : signature liée à la carte (`card: LoyaltyCard \| null`, `onScan`/`onMarkUsed`/`onEdit`/`onDelete`). Voir §Architecture Patterns P7. |
| Signer la photo invité côté client | Signer dans l'Edge (`recipe-invite`) | Le visiteur n'a **pas** de session : il ne peut pas signer. L'Edge signe avec le client admin (D-16). |

**Installation:** aucune — zéro paquet ajouté.

**Version verification:** `app/package.json` → `"@supabase/supabase-js": "2.117.2"`. Les helpers internes sont cités par plage de lignes et lus cette session.

## Package Legitimacy Audit

**Aucun paquet externe n'est installé par cette phase.** Le tableau est vide par construction (SPEC Constraints : « Pas de nouvelle dépendance » ; AGENTS.md §2.5).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | Aucun paquet ajouté |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*La porte de légitimité ne s'applique pas : la phase ne fait qu'ajouter une colonne, une migration, du code d'application et des tests. Si le plan découvrait un besoin de paquet, il devrait passer la porte avant tout `npm install`.*

## Architecture Patterns

### System Architecture Diagram

```
[Membre qui écrit]                 [Visiteur sans compte]
       │                                    │
       │ choisit un fichier                 │ ouvre /invitation/recette?code=…
       ▼                                    ▼
┌──────────────────────────┐        ┌───────────────────────────┐
│ recipe-steps.tsx         │        │ guest-recipe-page.tsx      │
│  StepRow (partagé)       │        │  fetchGuestRecipeView()    │
│  · invite « Ajouter une  │        │  (Edge link-view)          │
│    photo » (D-11)        │        └──────────────┬────────────┘
│  · bouton « Modifier la  │                       │ steps[].photoUrl (signée 1 h | null)
│    photo » (D-12)        │                       ▼
│  · retrait + confirm     │        ┌───────────────────────────┐
│    (D-13)                │        │ RecipeSteps / RecipeCuisine│
└────────┬─────────────────┘        │ View (MÊMES composants)    │
         │ depositHouseholdFile      └───────────────────────────┘
         ▼
┌──────────────────────────────┐   ┌────────────────────────────────────┐
│ lib/storage.ts               │   │ Edge recipe-invite/index.ts         │
│  compressImage (canvas)      │   │  view_recipe_share(share_hash)      │
│  upload → household-media/   │   │   → jsonb steps {…, photo_path}     │
│   <householdId>/recipes/     │   │  resolveGuestPhotoUrl(admin, raw)   │
│   <recipeId>/steps/<stepId>/ │   │   → createSignedUrl(path, 3600)     │
│   file-<random>.<ext>        │   │   → null si échec (fermé)           │
│  storedValueOf → colonne     │   └────────────────────────────────────┘
└────────┬─────────────────────┘                    ▲
         │ UPDATE recipe_steps.photo_path            │ RPC (service_role)
         ▼                                          │
┌──────────────────────────────┐        ┌───────────┴────────────────────┐
│ PostgreSQL                   │        │ view_recipe_share (0122:561)   │
│  recipe_steps (+photo_path)  │◄───────┤  steps jsonb (0122:628)        │
│  RLS: select membre /        │        └────────────────────────────────┘
│       write can_write_household
└────────┬─────────────────────┘
         │ lecture membre : resolveHouseholdMediaUrl(path, TTL)
         ▼
┌──────────────────────────────┐   ┌────────────────────────────────────┐
│ Fiche membre (StepRow img)   │   │ Impression : window.print() + CSS  │
│ Mode cuisine (img sous texte)│   │  recipe-export.css @media print    │
└──────────────────────────────┘   └────────────────────────────────────┘
```

Chemin de la donnée : un fichier entre par le navigateur → compressé → déposé dans `household-media` sous le `householdId` → la colonne `recipe_steps.photo_path` reçoit le **chemin** (`storedValueOf`). À la lecture, le membre signe via `resolveHouseholdMediaUrl` ; le visiteur reçoit l'URL signée de l'Edge. Les quatre surfaces rendent la même valeur résolue.

### Recommended Project Structure (delta de cette phase)

```
app/src/modules/recettes/
├── api.ts                       # + uploadRecipeStepPhoto, deleteRecipeStep(id, photoPath),
│                                #   resolveRecipeStepPhotoUrl, deleteRecipe(id, cover, stepPaths)
├── types.ts                     # + RecipeStep.photoPath, RecipePrintModel.stepPhotos,
│                                #   toStep(row) mappe photo_path, toRecipePrintModel porte l'URL par étape
├── components/
│   ├── recipe-steps.tsx         # + image pleine largeur + affordance (D-06, D-11, D-12, D-13)
│   ├── recipe-cuisine-view.tsx  # + grande image sous texte, réduite/masquée si cochée (D-08)
│   ├── recipe-export.css        # + règle d'impression pour l'image (D-09)
│   └── step-photo-dialog.tsx    # NOUVEAU : plein écran paramétré par URL (D-07, jumeau de card-code-dialog)
├── guest-recipe-page.tsx        # mappe photoUrl dans les steps (D-15, D-17) — réutilise les composants
├── hooks/use-recettes.ts        # rien de neuf (les étapes sont déjà chargées et groupées)
└── recipe-detail-page.tsx       # passe les callbacks photo + stepPaths à deleteRecipe

supabase/
├── migrations/0125_*.sql        # NOUVELLE : alter table recipe_steps add column photo_path text;
│                                #   + view_recipe_share recréée avec photo_path dans le jsonb
├── functions/recipe-invite/index.ts   # + resolveGuestPhotoUrl + steps projection {…, photoUrl}
└── tests/0125_*.sql             # NOUVEAU : RLS positive/négative + storage.objects insert
```

### Pattern 1: Dépôt avec valeur de colonne (D-02, D-03)

**What:** Le dépôt passe par le helper partagé et la colonne reçoit `storedValueOf(deposited)` (chemin en Supabase, `blob:` en démo).
**When to use:** tout ajout/remplacement de photo d'étape.
**Example:**
```ts
// Source: app/src/lib/storage.ts:109-151 (lu cette session)
// `folder` = `recipes/${recipeId}/steps/${stepId}` → chemin complet
// `${householdId}/${folder}/${randomId('file')}.${extensionFor(storedMime, file.name)}`
export async function uploadRecipeStepPhoto(householdId: string, recipeId: string, stepId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `recipes/${recipeId}/steps/${stepId}`, file });
  return storedValueOf(deposited); // chemin bucket (Supabase) ou `blob:` (démo)
}
```
Le dépôt du module de recettes suit exactement `uploadRecipeCover` (`api.ts:255-258`) : `folder: 'recipes/' + recipeId`.

### Pattern 2: Remplacement + nettoyage piloté client (D-04, D-05, R5)

**What:** Le nouveau chemin étant aléatoire, il diffère toujours de l'ancien ; `replacedMediaPath(previous, next)` rend l'ancien et `removeHouseholdFile` le retire. La garde « même chemin → ne rien supprimer » reste écrite.
**When to use:** ajout sur une étape déjà photographiée ; retrait ; suppression d'étape ; suppression de recette.
**Example:**
```ts
// Source: app/src/lib/storage.ts:253-258 (lu cette session) + api.ts:234-238 (motif deleteRecipe)
const previous = step.photoPath;
const next = await uploadRecipeStepPhoto(householdId, recipeId, step.id, file);
await data.update(RECIPE_STEPS_TABLE, step.id, { photo_path: next });
const orphan = replacedMediaPath(previous, next); // l'ancien, ou null
if (orphan) await removeHouseholdFile(orphan).catch((error) => console.warn(`Objet de média non retiré du bucket : ${orphan}`, error)); // best-effort, jamais silencieux
```
Suppression d'étape : `deleteRecipeStep(id, photoPath)` suit `deleteRecipe` :
```ts
// Source: app/src/modules/recettes/api.ts:234-238 (lu cette session)
export async function deleteRecipe(id: string, coverPhoto: string | null): Promise<void> {
  await data.remove(RECIPES_TABLE, id);
  const path = recipeCoverPathOf(coverPhoto);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
```
Suppression de recette : la fiche a `steps` chargées, donc elle connaît tous les chemins d'étape ; `deleteRecipe(id, coverPhoto, stepPhotoPaths)` doit tenter **tous** les objets même si l'un échoue (R5, arête « ordering »).

### Pattern 3: Rendu partagé (couvre fiche membre ET invité) (D-06, D-17, R3)

**What:** L'image vit dans `StepRow` de `recipe-steps.tsx` et dans `recipe-cuisine-view.tsx` — les composants **déjà partagés** par `recette-detail-page.tsx` **et** `guest-recipe-page.tsx`. Un seul ajout couvre les deux surfaces.
**When to use:** toute modification du rendu d'étape.
**Example:** la page invitée mappe `photoUrl` dans les `steps` puis rend **les mêmes composants** :
```tsx
// Source: app/src/modules/recettes/guest-recipe-page.tsx:76-80, 171 (lu cette session)
const steps: RecipeStep[] = (view?.steps ?? []).map((entry) => ({
  id: entry.id, content: entry.content, position: entry.position,
})); // + photoPath: entry.photoUrl  (D-15/D-17)
// … puis :
<RecipeSteps steps={steps} readOnly onAdd={noop} onUpdate={noop} onDelete={noop} onReorder={noop} />
```
`RecipeSteps` reçoit `readOnly` et masque déjà saisie/drag pour l'`enfant` (`recipe-steps.tsx:22-23, 123, 133`).

### Pattern 4: Aucune politique nouvelle — table et bucket déjà couverts (D-01, R2)

**What:** `recipe_steps` porte déjà ses 4 politiques ; le bucket `household-media` juge le foyer par `(storage.foldername(name))[1]`.
**When to use:** comprendre pourquoi la migration ne fait qu'un `alter table … add column` (+ `view_recipe_share`).
**Example:**
```sql
-- Source: supabase/migrations/0122_recettes_full.sql:305-346 (lu cette session)
-- Boucle sur recipe_steps : `*_select_household` (is_household_member),
-- `*_insert_household`/`*_update_household`/`*_delete_household` (can_write_household).
```
```sql
-- Source: supabase/migrations/0099_message_child_upload.sql:53-64 (lu cette session) — insert EFFECTIF
create policy household_media_insert on storage.objects
  for insert with check (
    bucket_id in ('household-media', 'household-avatars')
    and (
      private.can_write_household((storage.foldername(name))[1])
      or (bucket_id = 'household-media' and private.can_deposit_message_media(name))
    )
  );
```
Le chemin `recipes/<recipeId>/steps/<stepId>/file-x.jpg` a `foldername[1] = householdId` → `can_write_household` s'applique (admin/membre ; **exclut `enfant`**). La branche `messages` exige `foldername[2] = 'messages'` → inapplicable.

### Pattern 5: Impression CSS seule (D-09, R3)

**What:** L'image s'ajoute au bloc `.recipe-print` rendu par la fiche ; `recipe-export.css` porte une règle `@media print` qui borne la largeur.
**When to use:** la surface impression.
**Example:** le modèle d'impression doit porter l'URL résolue par étape (voir Pattern 6 pour la signature) ; la ligne de texte reste la référence si l'image ne charge pas.
```tsx
// Source: app/src/modules/recettes/recette-detail-page.tsx:457-462 (lu cette session)
<h3>Étapes</h3>
<ol>{printModel.stepLines.map((line) => <li key={line}>{line}</li>)}</ol>
```
```css
/* Source: app/src/modules/recettes/components/recipe-export.css:17-55 (lu cette session) */
@media print {
  body .recipe-print { display: block !important; color: #000; font-size: 12pt; line-height: 1.45; }
  .recipe-print li { margin-bottom: 4pt; }
  /* + .recipe-print img { max-width: 100%; max-height: 120pt; } — largeur bornée (D-09) */
}
```
`toRecipePrintModel` (`types.ts:241-263`) rend aujourd'hui `stepLines: string[]` (texte seul) ; il doit porter une URL résolue par étape (D-09) — la signature est asynchrone, donc le modèle reçoit les URLs résolues en entrée.

### Pattern 6: Un seul endroit signe pour l'invité (D-16, R4)

**What:** Le RPC rend `photo_path` **brut** ; l'Edge signe. `view_recipe_share` rend déjà `cover_photo` brut (`0122:657`) et le RPC rend les étapes en `{id, content, position}` — la phase y ajoute `photo_path`.
**When to use:** la surface invitée.
**Example:**
```sql
-- Source: supabase/migrations/0122_recettes_full.sql:628-638 (lu cette session) — à étendre
select coalesce(jsonb_agg(
         jsonb_build_object('id', st.id, 'content', st.content, 'position', st.position
                            /* + 'photo_path', st.photo_path */)
         order by st.position, st.id), '[]'::jsonb)
  into v_steps
  from public.recipe_steps st where st.recipe_id = v_share.recipe_id;
```
```ts
// Source: supabase/functions/recipe-invite/index.ts:446-460 (lu cette session) — resolveGuestCoverUrl
// même forme, TTL GUEST_PHOTO_TTL_SECONDS = 3600 (:430), échec fermé → null.
// steps projection (:501-507) à étendre avec `photoUrl: await resolveGuestPhotoUrl(admin, step.photo_path)`.
```

### Pattern 7: Plein écran — jumeau, pas réutilisation (D-07)

**What:** `card-code-dialog.tsx` est un motif plein écran mais sa signature est liée à la carte de fidélité. Un composant **jumeau** paramétré par une URL est nécessaire.
**When to use:** tap sur une image d'étape (fiche + cuisine).
**Example:**
```tsx
// Source: app/src/modules/fidelite/components/card-code-dialog.tsx:9-18 (lu cette session)
export interface CardCodeDialogProps {
  card: LoyaltyCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMutating: boolean;
  onScan: () => void;
  onMarkUsed: () => void;
  onEdit: () => void;
  onDelete: () => void;
}
```
Signature **incompatible** avec « afficher une image » → créer `step-photo-dialog.tsx` (`{ src, alt, open, onOpenChange }`) sur le même `Dialog`/`DialogContent` (refermable, clavier — D-07).

### Pattern 8: Mode démo — `blob:` + masquage `onError` (D-18, R6)

**What:** En démo, `depositHouseholdFile` rend `path: null` et une URL `blob:` ; `resolveHouseholdMediaUrl` rend les formes non-chemin **telles quelles** (donc `blob:` tel quel) ; après rechargement l'aperçu est mort → `onError` masque l'image.
**When to use:** mode démo (Vitest tourne en Dexie/IndexedDB).
**Example:**
```ts
// Source: app/src/lib/storage.ts:136-138 (lu cette session)
if (!isSupabaseConfigured || !supabase) {
  return { url: URL.createObjectURL(blob), path: null, name: file.name, mime: storedMime, size: blob.size };
}
```

### Anti-Patterns to Avoid
- **Persister une URL signée en colonne** : la colonne doit porter `storedValueOf(deposited)` (chemin), jamais `deposited.url`. Critère négatif du SPEC (prohibition gravée). `app/src/lib/media-path-contract.test.ts` garde déjà cette propriété pour les autres modules — **vérifier qu'il couvre le nouveau site d'écriture** (voir §Common Pitfalls P-1).
- **Réécrire `0122`** : interdiction absolue (AGENTS.md §2.7 A). Corriger vers l'avant dans `0125`.
- **Reproduire `*_delete_admin`** : la politique `delete` de `recipe_steps` reste sur `can_write_household` (D-01, phase 18 §3).
- **Créer un helper de dépôt/résolution neuf** : `depositHouseholdFile`/`storedValueOf`/`replacedMediaPath`/`resolveHouseholdMediaUrl`/`removeHouseholdFile` sont les points uniques.
- **Signer la photo invité côté client** : le visiteur n'a pas de session.
- **Rendre l'image dans `recette-detail-page.tsx` seulement** : la page invitée réutilise les composants partagés — le rendu doit vivre dedans.
- **`storage.list()` pour le nettoyage** : non employé dans le dépôt, D-05 est verrouillée.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compression image avant upload | Un encodeur/canvas maison | `depositHouseholdFile` (appelle `compressImage`, `modules/cercle/lib/media`) | WebP/JPEG natif, zéro dépendance, déjà éprouvé (WR-16) |
| Détection du type MIME | Une seconde table extension→type | `acceptedMimeOf` dans `lib/storage.ts` | Deux tables divergentes rouvriraient WR-16 ; le bucket n'admet que `ACCEPTED_MIMES` |
| Valeur de colonne média | Lire `deposited.url` soi-même | `storedValueOf` (point unique D-01) | Lire `url` persisterait une URL signée éphémère (famille WR-08) |
| Décision de nettoyage au remplacement | Comparer les chaînes à la main | `replacedMediaPath` (décision pure, garde « même chemin ») | Protège l'objet qu'on vient d'écrire |
| Signature d'URL | Appeler `createSignedUrl` directement dans un module | `resolveHouseholdMediaUrl` (membre) / `resolveGuestCoverUrl` (Edge) | Point unique de lecture ; échec fermé ; TTL centralisé |
| Affichage plein écran | Réutiliser le dialogue de fidélité | Composant jumeau `step-photo-dialog.tsx` | La signature de `card-code-dialog` est liée à la carte |
| Résolution RLS / appartenance au foyer | Une fonction `SECURITY DEFINER` maison | `private.is_household_member` / `can_write_household` | Déjà en place (`0006`), `search_path` fixe, privilèges minimaux |
| Import d'un composant dialogue | Réimplémenter une modale | `components/ui/dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`) | Primitives Radix accessibles (WAI-ARIA) |

**Key insight:** tout le socle média de ce dépôt est déjà centralisé dans `lib/storage.ts` (phase 19). Le risque de cette phase n'est pas l'absence d'outil, mais la tentation d'écrire un chemin de dépôt ou une résolution parallèle — ce que le test de contrat `media-path-contract.test.ts` sanctionne.

## Common Pitfalls

### Pitfall P-1: Écrire `deposited.url` au lieu de `storedValueOf(deposited)`
**What goes wrong:** la colonne persiste une URL signée éphémère ; la prohibition gravée du SPEC est violée et le critère négatif (acceptation 6) échoue.
**Why it happens:** `DepositedFile` expose `url` et `path` ; `url` est plus commode à afficher.
**How to avoid:** toujours `storedValueOf(deposited)`. Si le nouveau site d'écriture vit dans un **fichier neuf**, ajouter ce fichier à `ALIGNED_WRITE_SITES` (`app/src/lib/media-path-contract.test.ts:75-89`) — sinon le verrou ne le regarde pas. `modules/recettes/api.ts` y est déjà.
**Warning signs:** `grep -n "deposited.url" app/src/modules/recettes/` doit rendre vide ; le test `media-path-contract` rougit.

### Pitfall P-2: Réécrire `0122` ou modifier une migration appliquée
**What goes wrong:** la base de production diverge ; AGENTS.md §2.7 A l'interdit ; `check-sql-statique` condamne les définitions dépassées.
**Why it happens:** le réflexe « j'édite la table là où elle est définie ».
**How to avoid:** **nouvelle** migration `0125_*.sql` qui fait `alter table public.recipe_steps add column photo_path text;` et **recrée** `view_recipe_share` (`create or replace function`, définition effective = la dernière).
**Warning signs:** un diff sur `0122_recettes_full.sql`.

### Pitfall P-3: Oublier `photo_path` dans le jsonb de `view_recipe_share`
**What goes wrong:** la charge invitée ne porte aucune photo ; R4 échoue silencieusement (le visiteur ne voit rien).
**Why it happens:** le RPC est long et la projection d'étapes est un bloc `jsonb_build_object` parmi d'autres.
**How to avoid:** étendre `0122:628-638` (`'photo_path', st.photo_path`) **et** la projection de l'Edge (`recipe-invite/index.ts:501-507`) **et** `GuestRecipeStep` (`api.ts:456-460`) **et** `toGuestStep` (`api.ts:495-502`). Les quatre vont ensemble.
**Warning signs:** le test SQL `jsonb_array_length` passe mais aucune clé `photo_path` ; le payload invité n'a pas `photoUrl`.

### Pitfall P-4: `set search_path = ''` sans qualifier les tables
**What goes wrong:** la fonction recréée (`view_recipe_share`) échoue à l'exécution (« relation does not exist ») — invisible à la création.
**Why it happens:** `set search_path = ''` ne résout aucun nom ; toute table s'écrit `public.recipe_steps`.
**How to avoid:** préfixer **chaque** table par `public.` dans la fonction ; lancer `python3 scripts/check-sql-statique.py` (contrôle 1).
**Warning signs:** `check-sql-statique` signale « nom non qualifié ».

### Pitfall P-5: CTE qui masque une table du même nom / référence non qualifiée à une colonne `returns table`
**What goes wrong:** `view_recipe_share` est `returns jsonb` (pas `returns table`) → le contrôle 4 ne s'applique pas, mais le contrôle 2 (CTE auto-joint) reste actif si un `with steps as (…)` joint `recipe_steps` **dans** le CTE `steps`.
**Why it happens:** nommer un CTE comme la table qu'il lit est naturel.
**How to avoid:** nommer les CTE `v_*`/`*_rows`, jamais comme une table ; `python3 scripts/check-sql-statique.py`.
**Warning signs:** « recursive reference to query » à l'exécution.

### Pitfall P-6: Rendre l'image seulement dans la fiche membre
**What goes wrong:** la page invitée ne montre pas la photo (R3/R4/D-17 échouent).
**Why it happens:** on édite `recette-detail-page.tsx` (le site le plus visible) au lieu des composants partagés.
**How to avoid:** rendre dans `recipe-steps.tsx` `StepRow` et `recipe-cuisine-view.tsx` — la page invitée les réutilise.
**Warning signs:** le test de la fiche passe, celui de la page invitée non.

### Pitfall P-7: Confondre « aperçu démo mort » et « image cassée »
**What goes wrong:** après rechargement en démo, l'`<img src="blob:…">` affiche une icône cassée — R6/D-18 exigent un rendu **comme sans photo**.
**Why it happens:** aucun `onError` n'existe aujourd'hui dans `app/src` (vérifié : `grep -rn "onError=" app/src` rend vide). C'est du travail **neuf**.
**How to avoid:** `onError` sur l'`<img>` qui bascule l'état local vers « pas de photo » (donc pas d'élément média, invitation d'ajout disponible pour un membre).
**Warning signs:** le test démo « après rechargement » observe une image cassée au lieu d'aucun élément média.

### Pitfall P-8: Supprimer la recette sans nettoyer les photos d'étapes
**What goes wrong:** objets orphelins dans le bucket (R5 échoue) — le SQL en cascade ne touche pas Storage.
**Why it happens:** `deleteRecipe` ne prenait que la couverture ; on oublie d'ajouter les chemins d'étape.
**How to avoid:** `deleteRecipe(id, coverPhoto, stepPhotoPaths)` tente **tous** les objets même si l'un échoue (arête « ordering ») ; `replacedMediaPath` garde la propriété idempotente.
**Warning signs:** le test de nettoyage de recette ne vérifie que la couverture.

### Pitfall P-9: Un test qui ne peut pas échouer (tautologie / contrôle qui ne regarde rien)
**What goes wrong:** AGENTS.md §2.7 B/F : « un succès muet est un échec inexpliqué » ; « un contrôle qui ne regarde rien est vert et muet ».
**Why it happens:** assertion non bornée (total nu au lieu de par foyer), `expect_true(true)`, ou test qui ne vérifie pas la présence d'un élément.
**How to avoid:** borner chaque assertion au foyer/recette/étape (`testkit.fx`) ; prouver chaque nouveau test rouge avant vert ; sur la base `postgres`, borner à la main (RLS court-circuitée) ; sous `authenticated`, la RLS borne déjà.
**Warning signs:** un fichier de test nouveau qui n'a jamais rien refusé.

### Pitfall P-10: `testkit.eq` avec deux types différents
**What goes wrong:** « function testkit.eq(bigint, integer, unknown) does not exist » — message qui ne parle ni de l'assertion ni de ce qu'elle vérifie.
**Why it happens:** `testkit.count()` rend `bigint` ; une variable `integer` est acceptée à l'affectation.
**How to avoid:** aligner les types (`…::bigint` sur les deux côtés) ; `check-sql-statique` contrôle 5 le détecte.
**Warning signs:** le message d'erreur ne nomme pas la valeur comparée.

### Pitfall P-11: Variable plpgsql dans du SQL dynamique
**What goes wrong:** `testkit.count('… v_x …')` échoue car le texte s'exécute dans une **autre** fonction.
**Why it happens:** la variable est déclarée trois lignes plus haut, la chaîne se lit comme du SQL ordinaire.
**How to avoid:** sous-requête paramétrée `(select count(*) from … where col = v_x)`, ou `format(… %L …)` (légitime). Contrôle 6.
**Warning signs:** « column "v_alice" does not exist ».

### Pitfall P-12: Migration qui fait DML puis ALTER sur la même table à trigger différé
**What goes wrong:** « cannot ALTER TABLE … because it has pending trigger events » — passe sur table vide, échoue en réel.
**Why it happens:** backfill puis contrainte dans la même transaction.
**How to avoid:** séparer par `commit; begin;` ; contrôle 8. **Note :** `recipe_steps` ne porte **pas** de `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` (aucun dans `0122`) — le risque est faible ici, mais un `alter table … add column` après un backfill de `photo_path` dans la même transaction reste à séparer par prudence.
**Warning signs:** vert en local, rouge sur le distant.

### Pitfall P-13: `select` non déclaré dans la clé de requête (phase 20 D-08(a))
**What goes wrong:** deux `select` différents sur la même table partagent une entrée de cache.
**Why it happens:** `useResource` exige un `selectKey` stable dès qu'un `select` est déclaré.
**How to avoid:** **vérifié cette session** — les étapes ne passent pas par `useResource` mais par un `useQuery` direct (`use-recettes.ts:89-93`) avec la clé `queryKeys.tableAll(RECIPE_STEPS_TABLE)` = `['all', table]`, **sans `select`**. Ajouter `photo_path` ne requiert **aucun** `select` : `toStep` mappe simplement la colonne. **D-08(a) ne mord pas ici.**
**Warning signs:** un `select` introduit sur les étapes sans `selectKey`.

### Pitfall P-14: Directive de linter ou dépendance omise sans raison nommée
**What goes wrong:** aucun linter n'est configuré ; une directive `eslint-disable` est proscrite et `no-eslint-directive.test.ts` rougit.
**Why it happens:** réflexe d'outillage externe.
**How to avoid:** jamais de directive ; un `useEffect`/`useMemo` à dépendances réduites porte un commentaire qui **nomme la raison** (jamais « dépendances volontairement omises »).
**Warning signs:** le test `no-eslint-directive` rougit.

## Code Examples

### Dépôt + valeur de colonne (D-02, D-03)
```ts
// Source: app/src/lib/storage.ts:109-151 + api.ts:255-258 (lus cette session)
export async function uploadRecipeStepPhoto(
  householdId: string, recipeId: string, stepId: string, file: File,
): Promise<string> {
  const deposited = await depositHouseholdFile({
    householdId,
    folder: `recipes/${recipeId}/steps/${stepId}`,
    file,
  });
  return storedValueOf(deposited); // chemin bucket en Supabase, `blob:` en démo
}
```

### Remplacement avec nettoyage (D-04)
```ts
// Source: app/src/lib/storage.ts:253-258 (lu cette session)
const previous = step.photoPath;                     // valeur déjà en base
const next = await uploadRecipeStepPhoto(householdId, recipeId, step.id, file);
await data.update(RECIPE_STEPS_TABLE, step.id, { photo_path: next });
const orphan = replacedMediaPath(previous, next);    // l'ancien si chemin distinct, sinon null
if (orphan) await removeHouseholdFile(orphan).catch(() => undefined);
```

### Suppression d'étape avec nettoyage (R5)
```ts
// Motif : app/src/modules/recettes/api.ts:234-238 (lu cette session)
export async function deleteRecipeStep(id: string, photoPath: string | null): Promise<void> {
  await data.remove(RECIPE_STEPS_TABLE, id);
  const path = householdMediaPathOf(photoPath);      // lib/storage.ts:194
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
```

### Projection invitée symétrique (D-15)
```ts
// Source: app/src/modules/recettes/api.ts:456-460, 495-502 (lus cette session)
export interface GuestRecipeStep {
  id: string;
  content: string;
  position: number;
  photoUrl: string | null;   // AJOUT (D-15) — même forme que coverPhotoUrl
}
function toGuestStep(entry: unknown): GuestRecipeStep {
  const row = (entry ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    content: String(row.content ?? ''),
    position: typeof row.position === 'number' ? row.position : 0,
    photoUrl: asGuestText(row.photoUrl),   // asGuestText: api.ts:478-482
  };
}
```

### Signature côté Edge (D-16)
```ts
// Source: supabase/functions/recipe-invite/index.ts:446-460 (lu cette session)
async function resolveGuestPhotoUrl(admin: AdminClient, raw: unknown): Promise<string | null> {
  const value = asTextOrNull(raw);
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  try {
    const path = value.replace(/^\/+/, '');
    const { data, error } = await admin.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)                    // 'household-media' (:428)
      .createSignedUrl(path, GUEST_PHOTO_TTL_SECONDS); // 3600 (:430)
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch { return null; }
}
```

### Test Storage sous RLS (forme à copier)
```sql
-- Source: supabase/tests/0038_conversation_matrix.sql:80-100 (lu cette session)
select testkit.as_user(user_id, 'r16-bob@example.fr') from testkit.fx where key = 'bob';
set local role authenticated;
select testkit.eq(testkit.affected(format(
  'insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
  'household-media',
  (select household_id from testkit.fx where key = 'home_a')
    || '/recipes/' || (select row_id from testkit.fx where key = 'recipe_r1')
    || '/steps/' || (select row_id from testkit.fx where key = 'step_r1') || '/photo.jpg',
  (select user_id from testkit.fx where key = 'bob'))), 1::bigint,
  'un membre depose une photo d''etape dans son foyer');
reset role;
```

### Test RLS négatif (enfant) — forme à copier
```sql
-- Source: supabase/tests/0054_recettes_full.sql:210-221 (lu cette session)
select testkit.expect_denied(format(
  'insert into public.recipe_steps (recipe_id, household_id, content) values (%L, %L, %L)',
  (select row_id from testkit.fx where key = 'recipe_r1'),
  (select household_id from testkit.fx where key = 'home_a'),
  'Etape interdite'),
  'un enfant n''insere pas d''etape');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Colonne média portant une URL signée | Colonne portant un **chemin** de bucket, signé à la lecture | Phase 19 (D-01, WR-08) | Le dépôt rend `path` ; la lecture passe par `lib/storage.ts` ; verrou `media-path-contract.test.ts` |
| Nettoyage Storage implicite au SQL | Nettoyage **piloté client** avec les chemins connus | Phase 19 (D-03) | Le SQL en cascade ne touche pas Storage ; `deleteRecipe`/`deleteRecipeStep` prennent les chemins en argument |
| `note_attachments` : politique `delete` admin-seule | `recipe_steps` : `delete` sur `can_write_household` | 0122 (phase 16) | La classe `*_delete_admin` (`18-§3`) **n'est pas reproduite** |
| `select` de transformation non clé | `selectKey` **stable** obligatoire dès qu'un `select` est déclaré | Phase 20 (D-08) | Une flèche inline bouclerait le rechargement ; le type l'exige |

**Deprecated/outdated:**
- Persister `deposited.url` : interdit (D-01/WR-08), gardé par `media-path-contract.test.ts`.
- Réécrire une migration appliquée : interdit (AGENTS.md §2.7 A) — corriger vers l'avant.
- Directive de linter : proscrite (aucun linter configuré ; `no-eslint-directive.test.ts`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Le chemin `recipes/<recipeId>/steps/<stepId>/…` **passe sans politique Storage nouvelle** parce que `foldername[1]` reste le `householdId`. | Architecture Patterns P4 | **Faible** : vérifié en lisant `0010:34-39` et `0099:53-64`. Le seul doute est comportemental (que `foldername` rende bien le premier dossier) — prouvé par le test SQL à écrire (forme `0038`). Si faux, il faudrait une politique Storage nouvelle (contredisant D-01/D-02). |
| A2 | `supabase.storage.list()` serait utilisable côté client sous RLS pour un nettoyage par préfixe. | Alternatives Considered | **Faible** : non retenu, non vérifié en exécution. D-05 est verrouillée et `storage.list()` n'est employé nulle part — la voie D-05 reste la seule retenue. Aucune action requise. |
| A3 | `toRecipePrintModel` peut porter l'URL résolue par étape en **entrée** (la signature est asynchrone, le modèle reste pur). | Architecture Patterns P5 | **Moyen** : la forme exacte (champ `stepPhotos` parallèle à `stepLines`, ou `stepLines` remplacés par des objets) est une décision de plan. Le SPEC D-09 dit seulement « le modèle doit porter une URL résolue par étape ». |
| A4 | Le composant plein écran doit être un **jumeau** de `card-code-dialog.tsx`, pas une réutilisation. | Architecture Patterns P7 | **Faible** : signature de `card-code-dialog` lue (`:9-18`), incompatible. Un composant générique partagé reste possible mais n'existe pas aujourd'hui. |
| A5 | La suppression de recette connaît tous les chemins d'étape via `steps` chargées. | Architecture Patterns P2 | **Faible** : `recette-detail-page.tsx:84` charge `steps` (`stepsByRecipe[recipe.id]`). La limite (orphelin possible) est acceptée par D-05. |

**Note :** A1–A5 sont des choix de conception à l'intérieur de décisions verrouillées, pas des alternatives aux décisions. Aucune n'exige une confirmation utilisateur ; elles cadrent le plan.

## Open Questions (RESOLVED)

1. **RESOLVED — Numéro et nom exacts de la migration.**
   - What we know: la dernière migration est `0124_media_path_backfill.sql` ; la convention est `NNNN_nom.sql`.
   - What's unclear: le numéro exact (`0125`) — à confirmer par le planificateur au moment de l'écriture (aucune autre phase ne doit insérer entre-temps).
   - Recommendation: `0125_recipe_step_photos.sql`.

2. **RESOLVED — Forme du modèle d'impression (A3).**
   - What we know: `RecipePrintModel.stepLines: string[]` (`types.ts:229-234`) ; D-09 veut une URL résolue par étape.
   - What's unclear: `stepLines` (strings) + `stepPhotos` (URL\|null par index) vs un tableau d'objets `{line, photoUrl}`.
   - Recommendation: ajouter `stepPhotos: (string | null)[]` parallèle à `stepLines`, pour ne pas casser le rendu `stepLines.map` existant ni les tests.

3. **RESOLVED — Rendu de l'image en mode cuisine quand l'étape est cochée (D-08).**
   - What we know: le texte coché passe en `line-clamp-2` + `text-muted` (`recipe-cuisine-view.tsx:85`).
   - What's unclear: « réduite ou masquée » — D-08 laisse le choix.
   - Recommendation: réduire (hauteur bornée) plutôt que masquer, pour ne pas faire sauter la mise en page ; documenter le choix dans le plan.

4. **RESOLVED — Confirmation du retrait : modale ou inline ?**
   - What we know: D-13 renvoie au motif `pendingDelete` de `recipe-steps.tsx` (inline `role="alertdialog"`, `:159-181`).
   - Recommendation: réutiliser l'idiome inline existant (pas de `ConfirmDialog`) — cohérent avec la suppression d'étape.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / typecheck / Vitest | ✓ | v24.21.0 | — |
| npm | Dépendances / scripts | ✓ | 11.19.0 | — |
| python3 | `check-sql-statique.py` | ✓ | 3.14.4 | — |
| Docker (daemon) | `test-db.sh`, stack Supabase | ✓ | 29.8.2 (daemon actif) | — |
| Conteneur `supabase-db` | `test-db.sh` (SQL en base) | ✓ | en cours d'exécution | — |
| Conteneur `supabase-storage` | Vérification bucket `household-media` | ✓ | en cours d'exécution | — |
| `psql` sur l'hôte | — | ✗ | — | **Sans objet** : `scripts/psql.sh` exécute `psql` **dans** le conteneur `db`; l'absence sur l'hôte est la norme et n'est pas un blocage |

**Missing dependencies with no fallback:**
- Aucune.

**Missing dependencies with fallback:**
- `psql` hôte absent → tous les accès SQL passent par le conteneur (`scripts/psql.sh`), conformément à §2.7 C.

**Point d'attention d'exécution :** `scripts/test-db.sh` lit `DB_CONTAINER` (défaut `db`, `test-db.sh:22`). Le conteneur réellement en cours est `supabase-db` : exécuter `DB_CONTAINER=supabase-db sh scripts/test-db.sh`. Sans cette variable, le script échoue à trouver le service — échec d'environnement, pas de défaut du changement.

## Validation Architecture

> `workflow.nyquist_validation` est **absent** de `.planning/config.json` → section incluse (traité comme activé). Vérifié le 2026-10-16 : le fichier ne contient que `workflow._auto_chain_active` et `git.allow_default_branch_commits`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (`app/package.json`) + Testing Library (`@testing-library/react` 16.3.3, `user-event` 14.6.7), MSW 2.15.0, fake-indexeddb 6.2.5 |
| Config file | `app/vite.config.ts` (bloc `test:`, l.65-78) + `app/src/test/setup.ts` ; `environment: 'jsdom'`, `include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']` |
| Quick run command | `cd app && npx vitest run src/modules/recettes/recipe-steps.test.tsx` |
| Full suite command | `cd app && npm test` |
| E2E | `cd app && npm run test:e2e` (Playwright 1.63.0) |
| SQL (conteneur) | `DB_CONTAINER=supabase-db sh scripts/test-db.sh` |
| Contrôle statique SQL | `python3 scripts/check-sql-statique.py` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1 | Au plus une photo par étape ; ajouter sur une étape photographiée écrase et supprime l'objet précédent | SQL (colonne + remplacement) + unit (résolution chemin) | `DB_CONTAINER=supabase-db sh scripts/test-db.sh` ; `cd app && npx vitest run src/modules/recettes/recipe-step-photo.test.ts` | ❌ Wave 0 (SQL `supabase/tests/0125_recipe_step_photos.sql` ; unité à créer) |
| R2 | Ajout/retrait rendus aux membres qui écrivent ; `enfant` voit sans commande | Component | `cd app && npx vitest run src/modules/recettes/recipe-steps.test.tsx` | ✅ (fichier existant — étendre) |
| R3 | Photo rendue sur les 4 surfaces ; étape sans photo = zéro élément média | Component ×4 | `cd app && npx vitest run src/modules/recettes/recette-detail-page.test.tsx src/modules/recettes/recipe-cuisine.test.tsx src/modules/recettes/guest-recipe-page.test.tsx` | ❌ Wave 0 (`recette-detail-page.test.tsx` à créer/étendre ; cuisine + invité existent) |
| R4 | Vue invitée : URL signée 1 h forgée par l'Edge, jamais de chemin brut | Unit (Edge) + SQL (RPC) | `cd app && npx vitest run ../supabase/functions/recipe-invite/guest-steps.test.ts` ; `DB_CONTAINER=supabase-db sh scripts/test-db.sh` | ❌ Wave 0 (module pur `guest-steps.ts` + son test à créer ; SQL `0125_…sql`) |
| R5 | Nettoyage bucket aux 3 niveaux (retrait photo, suppression étape, suppression recette) | Unit + contract | `cd app && npx vitest run src/modules/recettes/recipe-actions.test.ts src/lib/media-path-contract.test.ts` | ✅ (fichiers existants — étendre) |
| R6 | Mode démo : aperçu `blob:` éphémère ; aperçu mort masqué, étape rendue sans média | Unit/Component | `cd app && npx vitest run src/modules/recettes/recipe-step-photo.test.ts` | ❌ Wave 0 (à créer) |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run <fichier touché>` puis `cd app && npm run typecheck`.
- **Per wave merge:** `cd app && npm run typecheck && npm test && npm run build`.
- **Phase gate:** chaîne complète §2.7 verte avant `/gsd-verify-work` : `typecheck && test && build`, `test:e2e`, `python3 scripts/check-sql-statique.py`, `DB_CONTAINER=supabase-db sh scripts/test-db.sh`.

### Wave 0 Gaps
- [ ] `supabase/tests/0125_recipe_step_photos.sql` — couvre R1 (colonne + remplacement), R4 (RPC `view_recipe_share` rend `photo_path` brut), R5 (cascade), et l'insertion Storage sous RLS (forme `0038_conversation_matrix.sql:80-100`). **Prouver le cas qui doit échouer** : un `enfant` (rôle hors `can_write_household`) ne peut pas déposer.
- [ ] `app/src/modules/recettes/recipe-step-photo.test.ts` — couvre R1 (résolution chemin/`null`), R6 (aperçu `blob:` rendu, aperçu mort masqué).
- [ ] `app/src/modules/recettes/recette-detail-page.test.tsx` — couvre R3 (surface fiche + impression via `toRecipePrintModel`).
- [ ] `supabase/functions/recipe-invite/guest-steps.test.ts` — couvre R4 (projection `steps[].photoUrl` signée ou `null`). **Raffinement justifié (supplante `index.test.ts`)** : `index.ts` porte des imports Deno/`npm:` et n'est exécutable par aucune chaîne du dépôt ; la logique de signature est extraite dans le module PUR `guest-steps.ts` (doctrine `child-guard.ts`), seul testable par Vitest. L'Edge **déployée** reste couverte par la ligne « Manual-Only ».
- [ ] Étendre `ALIGNED_WRITE_SITES` dans `app/src/lib/media-path-contract.test.ts:75-89` **si** un nouveau fichier devient un site d'écriture de chemin.
- [ ] Framework : déjà installé — aucune installation requise.

*(Note : le socle de tests existe ; les gaps sont des fichiers neufs/étendus, pas de l'outillage.)*

## Security Domain

> `security_enforcement` non désactivé dans `.planning/config.json` → section requise.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Inchangé : `recipe-invite` utilise `withSupabase({ auth: ['user','publishable'] }, …)` ; le lien invité est déjà géré (phase 20) |
| V3 Session Management | no | Inchangé |
| V4 Access Control | **yes** | RLS `recipe_steps` (4 politiques via boucle, `0122:305-346`) + politique Storage `household-media` (`0010:27-58`, effective `0099:53-64`) : `can_write_household(foldername[1])` **exclut** le rôle `enfant` |
| V5 Input Validation | **yes** | Zod côté formulaire ; `isRecipeCoverPath` / `recipeCoverPathOf` comme garde « est-ce un chemin ? » ; extension à la photo d'étape |
| V6 Cryptography | **yes (délégué)** | Ne jamais signer à la main : `resolveHouseholdMediaUrl` (TTL courte) côté client, `resolveGuestCoverUrl` (TTL 1 h) côté Edge. Aucun crypto maison |

### Known Threat Patterns for Supabase Storage + RLS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fuite d'un chemin de bucket brut dans la charge invitée | Information Disclosure | L'Edge signe ; le RPC rend la référence brute **au serveur seul** ; le test R4 vérifie qu'aucune sous-chaîne de chemin n'apparaît côté client |
| Écriture Storage par un membre hors foyer / `enfant` | Elevation of Privilege | `can_write_household(foldername[1])` sur `household-media` ; le chemin `<householdId>/recipes/…` garde `foldername[1]` = householdId |
| Objet orphelin (photo remplacée non nettoyée) | (données résiduelles) | D-04/D-05 : `replacedMediaPath` + suppression client ; test SQL R5 prouve le retrait |
| URL signée qui fuit / TTL trop long | Information Disclosure | TTL court module (client) et 1 h (invité) ; jamais de bucket public |
| `storage.list()` sous RLS pour énumérer un préfixe | Information Disclosure | **Non retenu** (D-05) : nettoyage par chemins connus (`steps` chargées), pas d'énumération |

**Barrière finale :** la RLS `recipe_steps` et la politique Storage `household-media` sont la frontière d'autorisation ; l'état de session frontend n'y suffit jamais (§2.6 AGENTS.md).

## Sources

### Primary (HIGH confidence)
- Sources **in-repo** lues cette session (source de vérité du projet) :
  - `supabase/migrations/0122_recettes_full.sql` — table `recipe_steps` (114-121), boucle RLS (305-346), `view_recipe_share` (561-664, étapes jsonb 628-638, couverture brute 657).
  - `supabase/migrations/0010_storage_and_realtime.sql` — politiques `household-media` (27-58).
  - `supabase/migrations/0099_message_child_upload.sql` — politique `household_media_insert` effective (53-64).
  - `app/src/lib/storage.ts` — `depositHouseholdFile` (109-151, chemin 140), `storedValueOf` (173-175), `householdMediaPathOf` (194-199), `resolveHouseholdMediaUrl` (210-227), `replacedMediaPath` (253-258), `removeHouseholdFile` (158-162).
  - `supabase/functions/recipe-invite/index.ts` — `GUEST_PHOTO_TTL_SECONDS` (430), `resolveGuestCoverUrl` (446-460), projection des étapes (501-507).
  - `app/src/modules/recettes/api.ts` — `GuestRecipeStep` (456-460), `toGuestStep` (495-502), `fetchGuestRecipeView` (511-538), `recipeCoverPathOf` (250-252), `uploadRecipeCover` (255-258), `resolveRecipeCoverUrl` (273-281), `deleteRecipe` (234-238).
  - `app/src/modules/recettes/types.ts` — `RecipeStep` (68-72), `RecipePrintModel` (229-234), `toRecipePrintModel` (241-263), `toStep` (219-223).
  - `app/src/types/database.ts:390-396` — `RecipeStepRow` (à étendre de `photo_path`).
  - `app/src/modules/recettes/components/recipe-steps.tsx` — `StepRow`, `readOnly`, `pendingDelete` inline `role="alertdialog"` (159-181).
  - `app/src/lib/media-path-contract.test.ts:75-89` — `ALIGNED_WRITE_SITES`.
  - `supabase/tests/0038_conversation_matrix.sql:80-100` — forme du test d'insertion Storage sous RLS.
  - `scripts/test-db.sh:22` — `DB_CONTAINER` (défaut `db`).
  - `.planning/config.json` — absence de `workflow.nyquist_validation`.
- Documentation officielle du projet : `AGENTS.md` §2.6 (RLS/Storage), §2.7 (chaîne de vérification), §10 (sources officielles épinglées).

### Secondary (MEDIUM confidence)
- Supabase self-hosting — Storage et politiques : https://supabase.com/docs/guides/self-hosting/docker (référencé par `AGENTS.md` §10, non re-fetché cette session).
- Supabase Edge Functions — authentification : https://supabase.com/docs/guides/functions/auth (idem).

### Tertiary (LOW confidence)
- Aucune. Toutes les affirmations de comportement de code reposent sur des fichiers lus cette session ; les seules incertitudes sont consignées en Assumptions Log (A1–A5) et Open Questions.

## Metadata

**Confidence breakdown:**
- Standard Stack : HIGH — aucune dépendance nouvelle ; la pile est celle du dépôt, lue dans `app/package.json` et les fichiers source.
- Architecture : HIGH — les points d'ancrage (colonnes, politiques RLS, RPC, Edge, adaptateurs, composants) ont été ouverts cette session avec citation et plage de lignes.
- Pitfalls : HIGH pour les pièges issus de la lecture directe (RLS, Storage, déparse SQL, `search_path`) ; MEDIUM pour la forme exacte du modèle d'impression (A3, décision de plan).
- Validation : HIGH — infrastructure de test existante, gap list Wave 0 établie par inventaire des fichiers.

**Research date:** 2026-10-16
**Valid until:** 2026-11-15 (30 jours — domaine stable ; le dépôt bouge vite mais les ancrages sont des fichiers versionnés).

**Note de provenance :** toute valeur discrète in-repo (nom de colonne, politique, constante, chemin) citée dans ce document provient d'une **lecture de fichier cette session** avec citation de plage de lignes ; les affirmations de conception non vérifiables en exécution sont en Assumptions Log (A1–A5), étiquetées `[ASSUMED]`.
