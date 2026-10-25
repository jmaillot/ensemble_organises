---
phase: 21-photos-dans-les-etapes-de-recette
created: 2026-10-16
source: 17-UAT.md (suivi différé du 2026-10-14) — backlog 999.1, absorbé ici
scope: 21-SPEC.md — 6 exigences verrouillées, ambiguïté 0,14
---

# Phase 21 — Contexte et décisions

## Origine

La remontée UAT de la phase 17 (« Possibilité de mettre des photos dans les
étapes de recette », `17-UAT.md`, différée le 2026-10-14) n'a jamais été
traitée : reportée au backlog **999.1**, absorbée ici (cf. ROADMAP).

Le **`21-SPEC.md`** verrouille le « quoi » (6 exigences, ambiguïté 0,14, 11/11
arêtes résolues, 1 prohibition gravée). Ce document-ci ne traite que le
« comment ».

**État vérifié du code au 2026-10-16 :**

| Point | Verdict |
|---|---|
| `recipe_steps` (`0122:114`) | `id, recipe_id, household_id, content, position, created_at` — **aucun média** |
| RLS de `recipe_steps` (`0122:305-344`) | `select` membre ; `insert`/`update`/`delete` sur `can_write_household` — **aucune politique admin-seule**, donc pas de reproduction possible de la classe `18-§3` |
| Précédent de cardinalité 1 | `recipes.cover_photo` — une colonne, un chemin, signé à la lecture |
| Précédent de cardinalité N | `note_attachments` (`0043:80`) — table fille ; sa politique `delete` est **admin-seule** (classe `18-§3`, hors périmètre ici) |
| `depositHouseholdFile` (`lib/storage.ts`) | nom aléatoire par dépôt (`<householdId>/<folder>/file-<random>.<ext>`) ; rend `path` (Supabase) ou `url` `blob:` (démo) |
| Lien invité | `recipe-invite/index.ts:454` signe **déjà** la couverture, `GUEST_PHOTO_TTL_SECONDS = 3600` (`:430`), échec fermé |
| `view_recipe_share` (`0122:637`) | rend les étapes en jsonb `{id, content, position}` — **sans photo** |
| `toRecipePrintModel` (`types.ts:241`) | rend `stepLines: string[]` — **texte seul** |
| Plein écran existant | `modules/fidelite/components/card-code-dialog.tsx` — motif de dialogue plein écran réutilisable |
| `RecipeSteps` monté | fiche détail uniquement (`recette-detail-page.tsx:308`) ; le dialogue de création ne gère pas d'étapes |

## Decisions verrouillées

### Modèle de données et dépôt — discrétion de l'agent (zone non sélectionnée)

- **D-01 — une colonne, pas une table fille.** `recipe_steps` porte une colonne
  `photo_path text` nullable. La cardinalité est exactement 1 ; `note_attachments`
  est le motif pour N. Conséquence décisive : la référence meurt avec la ligne, et
  surtout **aucune politique nouvelle n'est nécessaire** — `recipe_steps` porte
  déjà ses quatre politiques (`0122:305-344`), donc la classe `*_delete_admin`
  (`18-§3`) ne peut pas être reproduite par cette phase. *Undo: costly* (migration
  + code).
- **D-02 — le dépôt passe par `depositHouseholdFile`, sans nouvelle fonction.**
  Dossier `recipes/<recipeId>/steps/<stepId>` → chemin complet
  `<householdId>/recipes/<recipeId>/steps/<stepId>/file-<random>.<ext>`. Le
  premier segment reste le `householdId`, donc les politiques du bucket
  `household-media` continuent de juger le foyer par le chemin. *Undo: reversible*
  (chaîne de caractères).
- **D-03 — la colonne porte la VALEUR DE COLONNE, jamais l'URL.**
  `storedValueOf(deposited)` : chemin de bucket en Supabase, `blob:` en démo.
  Doctrine **D-01 phase 19**, et critère négatif du SPEC (aucune URL `http(s)://`
  en colonne). *Undo: costly*.
- **D-04 — un remplacement produit un chemin neuf, donc un nettoyage.**
  Le nom étant aléatoire, le nouveau chemin diffère toujours de l'ancien ;
  `replacedMediaPath(previous, next)` (phase 19) rend l'ancien et la suppression
  s'applique. La garde « même chemin → ne rien supprimer » reste écrite : elle
  protège l'objet qu'on vient d'écrire si le chemin devenait stable un jour.
- **D-05 — le nettoyage est piloté par le client, avec les chemins qu'il a déjà.**
  Le SQL en cascade ne touche pas Storage. `deleteRecipe(id, coverPhoto)` prend
  déjà le chemin de la couverture en argument ; la fiche a `steps` chargées, donc
  elle connaît tous les chemins d'étape. `deleteRecipeStep(id, photoPath)` suit le
  même motif. Un objet orphelin reste possible si la suppression échoue ou si une
  autre session a supprimé l'étape : **limite acceptée, identique à celle de
  `deleteRecipe` aujourd'hui**. Le SPEC R5 exige l'exhaustivité des tentatives,
  pas la garantie transactionnelle.

### Rendu sur les quatre surfaces

- **D-06 — fiche membre : image pleine largeur sous le texte de l'étape.**
  L'option « vignette à droite » a été écartée (choix utilisateur). Le motif des
  vignettes de `note_attachments` n'est donc pas repris.
- **D-07 — plein écran au tap, sur la fiche et en mode cuisine.** Motif déjà
  présent (`card-code-dialog.tsx`) ; refermable, accessible au clavier.
- **D-08 — mode cuisine : grande image sous le texte, réduite ou masquée une fois
  l'étape cochée** — cohérent avec le `line-clamp` du texte coché dans
  `recipe-cuisine-view.tsx`.
- **D-09 — impression : image sous la ligne numérotée, largeur bornée.** Le
  modèle d'impression doit porter une URL résolue par étape (la ligne de texte
  reste la référence si l'image ne charge pas). La feuille `recipe-export.css`
  reste **CSS seule**, aucune dépendance PDF.
- **D-10 — étape sans photo : aucun élément média** sur les quatre surfaces — ni
  trou, ni cadre vide, ni image cassée (SPEC R3 + arête R3).

### Affordance d'ajout et de retrait

- **D-11 — étape sans photo (membre qui écrit) : une invitation discrète sous
  l'étape** (« Ajouter une photo », style lien discret). Un `enfant` ne la voit
  pas (SPEC R2). Les options « rien du tout » et « emplacement vide visible » ont
  été écartées.
- **D-12 — étape avec photo : un seul bouton sous l'image qui ouvre le
  sélecteur** (« Modifier la photo ») ; le retrait vit dans une barre d'actions
  secondaire. L'option « croix en surimpression + bouton Remplacer » a été
  écartée.
- **D-13 — le retrait demande confirmation** (motif `pendingDelete` déjà en place
  dans `recipe-steps.tsx` pour supprimer une étape) ; le **remplacement non** —
  il est déjà un geste explicite (SPEC R1 : l'ajout remplace).
- **D-14 — le remplacement est direct** : le sélecteur remplace l'ancienne photo
  et nettoie l'objet précédent, sans étape intermédiaire.

### Charge invitée et mode démo

- **D-15 — `steps[].photoUrl`, URL signée d'une heure ou `null`.** Même nom et
  même forme que `coverPhotoUrl` au niveau recette ; la projection cliente
  (`fetchGuestRecipeView`) reste symétrique. Champ ajouté à `GuestRecipeStep`
  (`api.ts:458`).
- **D-16 — le RPC rend la colonne brute, l'Edge signe.** `view_recipe_share`
  (`0122:637`) ajoute `photo_path` au jsonb de chaque étape, comme il rend déjà
  `cover_photo` au niveau recette ; l'Edge `recipe-invite` la transforme via
  `admin.storage.createSignedUrl`, TTL 1 h (constante existante
  `GUEST_PHOTO_TTL_SECONDS`), échec fermé → `null`. **Un seul endroit signe, un
  seul endroit décide du TTL.**
- **D-17 — rendu invité identique à la fiche membre** : image pleine largeur sous
  le texte, plein écran au tap.
- **D-18 — mode démo : même colonne, valeur `blob:`.** Exactement comme
  `cover_photo` aujourd'hui ; `resolveHouseholdMediaUrl` rend les formes
  non-chemin telles quelles ; après rechargement l'aperçu est mort et **masqué
  (`onError`)**, l'étape se rend comme sans photo avec l'invitation d'ajout
  (SPEC R6).

## Arêtes retenues (backstops du SPEC)

- **B-1 — remplacement concurrent** : deux membres ajoutent une photo à la même
  étape ; le dernier écrit gagne, l'objet du perdant peut devenir orphelin. Test
  d'arête à écrire.
- **B-2 — suppression concurrente** : supprimer une recette pendant qu'un dépôt
  d'étape est en vol peut laisser un objet orphelin. Test d'arête à écrire.

## Décisions héritées (à ne pas redécouvrir)

- Phase 19 **D-01** : toute colonne média porte le **chemin**, signé à la lecture
  par `lib/storage.ts`, point unique.
- Phase 19 **D-03** : la ligne et son objet meurent ensemble — mais le SQL ne
  touchant pas Storage, la mort de l'objet est **pilotée par le client** (D-05).
- Phase 19 **D-04** : ne jamais inventer un type — `acceptedMimeOf` lit
  l'extension quand `file.type` est vide.
- Phase 18 **§3** : la classe `*_delete_admin` est **hors périmètre** ici, et
  **ne doit pas être reproduite** par le schéma de cette phase.
- Phase 20 **D-08(a)** : un `select` non déclaré dans la clé de requête partage
  une entrée de cache — à considérer si la fiche déclare un `select` sur les
  étapes.

## Ce que le chercheur doit vérifier

- La forme exacte des politiques Storage du bucket `household-media` : le foyer
  est-il jugé par le premier segment du chemin ? Un dossier
  `recipes/<id>/steps/<stepId>` y passe-t-il sans politique nouvelle ?
- `supabase.storage.list()` est-il utilisable côté client sous RLS (nettoyage par
  préfixe, alternative à D-05) — sinon confirmer que D-05 est la seule voie.
- Où insérer l'image dans `recipe-export.css` pour qu'elle s'imprime sans casser
  la pagination.
- La forme exacte du jsonb de `view_recipe_share` (`0122:637`) pour y ajouter
  `photo_path`, et la projection de `fetchGuestRecipeView` (`api.ts:520-535`).
- Où insérer l'image d'étape dans `guest-recipe-page.tsx` (rendu identique à la
  fiche, D-17).
- Si `card-code-dialog.tsx` (Fidélité) est réutilisable tel quel pour le plein
  écran, ou s'il faut un composant jumeau.

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Contexte recueilli : 2026-10-16*
*Étape suivante : /gsd-plan-phase 21*
