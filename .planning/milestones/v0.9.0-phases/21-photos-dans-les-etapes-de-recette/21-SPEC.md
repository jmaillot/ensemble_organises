# Phase 21: Photos dans les étapes de recette — Specification

**Created:** 2026-10-16
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

Une étape de recette peut porter une photo illustrative, affichée sur la fiche
du foyer, dans le mode cuisine, sur le lien invité et à l'impression ; l'ajouter
à une étape qui en a déjà une remplace la précédente et nettoie l'objet
remplacé du bucket.

## Background

La remontée UAT de la phase 17 (« Possibilité de mettre des photos dans les
étapes de recette », `17-UAT.md` §Deferred Follow-Ups, différée le 2026-10-14)
n'a jamais été traitée : elle a été reportée au backlog 999.1 puis absorbée par
cette phase.

État vérifié du code aujourd'hui :

- `public.recipe_steps` (migration `0122_recettes_full.sql:114`) porte
  `id, recipe_id, household_id, content, position, created_at` — **aucun
  média**. Le commentaire de table dit « Etapes numerotees (R7) : numero = rang
  par position, persistance serveur du DnD ».
- Le précédent d'attachement du dépôt est `public.note_attachments`
  (`0043_media_attachments.sql:80`) : table fille, colonne `file_url` portant un
  **chemin de bucket**, RLS `select` membre / `insert`+`update` écrivant /
  `delete` **admin** — cette dernière politique appartient à la classe
  `*_delete_admin` relevée en `18-§3` (l'interface offre ce que RLS refuse).
- `recipes.cover_photo` suit la doctrine média de la phase 19 (D-01) : la
  colonne porte un chemin, signé à la lecture par `lib/storage.ts`
  (`depositHouseholdFile`, `resolveHouseholdMediaUrl`, `householdMediaPathOf`,
  `replacedMediaPath`), déposé dans `recipes/<recipeId>`.
- Le **lien invité est déjà signé côté serveur** : l'Edge
  `supabase/functions/recipe-invite/index.ts` forge la couverture via
  `resolveGuestCoverUrl` (TTL 1 h, échec fermé). Le précédent existe donc pour
  la vue invitée.
- `view_recipe_share` (RPC `service_role`, `0122:637`) rend les étapes en jsonb
  `{id, content, position}` — **sans photo**.
- `recipe-cuisine-view.tsx` reçoit `steps` déjà chargées par la fiche : zéro
  appel réseau supplémentaire pour y afficher une photo.
- L'export est `window.print()` (`recette-detail-page.tsx:358`) + une feuille
  `@media print` (`recipe-export.css`), alimentée par `toRecipePrintModel`, qui
  **ne porte aujourd'hui aucune photo** — le commentaire de la feuille le dit.
- `recipe-steps.tsx` a un mode `readOnly` pour le rôle `enfant` (saisie et drag
  masqués, cases conservées).

Le delta : il n'existe **aucun** champ, aucune surface, aucun chemin de
signature invité et aucun nettoyage pour une photo d'étape.

## Requirements

1. **Une photo par étape, remplaçable** : une étape porte au plus une photo ;
   en ajouter une à une étape qui en a déjà une remplace la précédente et
   supprime l'objet remplacé du bucket.
   - Current: `recipe_steps` n'a aucune colonne média ; rien ne garantit ni
     n'interdit une photo par étape.
   - Target: le schéma garantit « au plus une photo par étape » (colonne dédiée
     ou table fille à cardinalité 1 contrainte) ; l'ajout sur une étape
     photographiée écrase la valeur et supprime l'ancien objet.
   - Acceptance: après deux ajouts successifs sur la même étape, la base ne
     porte qu'une seule référence et l'objet du premier dépôt a été retiré du
     bucket.

2. **Ajout et retrait par tout membre qui écrit ; l'enfant voit sans modifier** :
   tout membre du foyer en droit d'écrire peut ajouter ou retirer la photo d'une
   étape ; un membre en lecture seule (rôle `enfant`) voit la photo sans
   pouvoir l'ajouter ni la retirer.
   - Current: `recipe-steps.tsx` masque déjà saisie et drag au rôle `enfant`
     (`readOnly`), mais aucune affordance photo n'existe.
   - Target: le bouton d'ajout et de retrait n'apparaît qu'aux membres qui
     écrivent ; un `enfant` voit l'image rendue, sans commande.
   - Acceptance: en session `enfant`, aucune commande d'ajout ni de retrait
     n'est rendue et l'image reste visible ; en session membre, les deux
     commandes sont rendues et fonctionnelles.

3. **Affichage sur les quatre surfaces** : la photo d'étape s'affiche sur la
   fiche recette du foyer, dans le mode cuisine plein écran, sur le lien de
   partage sans compte, et à l'impression.
   - Current: aucune surface ne rend de photo d'étape ; `toRecipePrintModel`
     ne porte aucune photo.
   - Target: les quatre surfaces rendent l'image de l'étape ; une étape sans
     photo ne laisse ni trou ni image cassée sur aucune des quatre.
   - Acceptance: un test par surface observe l'image de l'étape ; sur une étape
     sans photo, les quatre surfaces rendent sans élément média.

4. **Lien invité signé côté serveur** : la vue invitée sans compte reçoit une
   URL signée éphémère (1 h) forgée par l'Edge `recipe-invite` ; elle ne reçoit
   jamais un chemin de bucket brut.
   - Current: `view_recipe_share` rend les étapes sans photo ; l'Edge ne signe
     que la couverture.
   - Target: la charge invitée porte, par étape, une URL signée d'une heure ou
     `null` en échec fermé ; aucun chemin brut ne quitte le serveur.
   - Acceptance: le RPC rend la référence brute, l'Edge la transforme en URL
     signée ; une signature en échec rend `null` et la charge ne contient
     aucune sous-chaîne de chemin de bucket.

5. **Nettoyage du bucket aux trois niveaux** : retirer la photo d'une étape,
   supprimer une étape et supprimer la recette retirent les objets du bucket.
   - Current: `deleteRecipe` nettoie la seule couverture ; le SQL en cascade ne
     touche pas Storage, donc les objets d'étapes seraient orphelins.
   - Target: les trois chemins de suppression retirent les objets
     correspondants ; un échec de retrait n'empêche pas les autres et n'est pas
     silencieux.
   - Acceptance: après chacune des trois suppressions, le bucket ne contient
     plus l'objet ; supprimer une étape sans photo ou une recette sans photo
     d'étape est un no-op sans erreur.

6. **Mode démo local** : en mode démo (Dexie/IndexedDB), la photo d'étape est
   un aperçu local éphémère, perdu au rechargement ; le parcours reste
   utilisable et testable sans backend.
   - Current: en démo, la couverture de recette est un `blob:` local, rendu tel
     quel après rechargement (aperçu mort → image cassée).
   - Target: le dépôt et le remplacement fonctionnent en démo ; un aperçu mort
     est masqué et l'étape se rend comme sans photo, avec l'ajout disponible.
   - Acceptance: en démo, ajouter puis remplacer une photo fonctionne ; après
     rechargement, l'étape se rend sans élément média visible et sans erreur.

## Boundaries

**In scope:**
- Le modèle de données garantissant au plus une photo par étape, avec sa RLS
  (lecture membre, écriture par les membres qui écrivent, **suppression par les
  mêmes** — pas de politique `*_delete_admin`).
- Le dépôt, le remplacement et le retrait de la photo d'une étape, avec
  compression native partagée (`depositHouseholdFile`).
- L'affichage sur les quatre surfaces nommées en R3.
- La signature côté serveur dans l'Edge `recipe-invite` (TTL 1 h) et
  l'extension du RPC `view_recipe_share` et de la projection cliente
  `fetchGuestRecipeView`.
- Le nettoyage du bucket aux trois niveaux de R5.
- Le parcours en mode démo (aperçu `blob:`).
- Les tests : SQL (RLS positive et négative), unitaires (dépôt, remplacement,
  nettoyage, rendu des quatre surfaces), e2e du parcours membre et invité.

**Out of scope:**
- Photos sur les ingrédients — seule l'étape est concernée (décision du
  2026-10-16, tour 2).
- Vidéo et audio — image seulement (tour 2).
- Galerie, carrousel, plusieurs photos par étape, réordonnancement d'images —
  une seule image, cardinalité 1 (tours 1 et 2).
- Légende, crédit ou tout texte associé à la photo — une photo et rien d'autre
  (tour 3).
- Glisser-déposer d'un fichier depuis le bureau vers une étape — le bouton
  ouvre le sélecteur de fichiers (tour 3).
- Un export PDF serveur — l'export reste `window.print()` + CSS (état actuel).
- La classe `*_delete_admin` hors de la table de cette phase — le relevé
  `18-§3` reste ouvert pour les quatorze autres politiques.
- Les sept résidus vérifiés ouverts des registres `deferred-items.md` des
  phases 18/19 (`compressImage`, appui long du calendrier, stabilité de
  `useResource.rows`, instabilité de `recettes.spec.ts`, copie de la landing,
  `placePhotoPathOf`, ligne double de `use-notifications`) — sujets distincts.

## Constraints

- **Doctrine média (phase 19, D-01)** : la colonne porte un **chemin de bucket**,
  jamais une URL signée ; la signature est faite à la lecture, par
  `lib/storage.ts`, point unique. Le remplacement s'appuie sur `replacedMediaPath`.
- **Pas de nouvelle dépendance** : la compression passe par
  `createImageBitmap`/`canvas` déjà en place ; l'impression reste CSS.
- **Migrations** : une migration appliquée n'est jamais réécrite ; le schéma
  change par une nouvelle migration, et `python3 scripts/check-sql-statique.py`
  doit rester vert (nom de table qualifié sous `search_path` vide, etc.).
- **RLS** : la politique de suppression de la table de cette phase s'aligne sur
  `can_write_household`, **pas** sur `is_household_admin` — la classe `18-§3`
  n'est pas reproduite.
- **Secrets** : la signature invitée utilise la clé secrète côté Edge
  uniquement ; `RECIPE_INVITE_HMAC_SECRET` et les clés ne sortent pas du
  serveur.
- **Mode démo** : les tests Vitest tournent en mode démo (Dexie/IndexedDB) — ni
  `CHECK` SQL, ni RLS, ni Storage réel ; la vérification SQL passe par
  `test-db.sh`, la signature invitée par la chaîne Edge.
- **Chaîne de vérification** (AGENTS.md §2.7) : `cd app && npm run typecheck &&
  npm test && npm run build`, `python3 scripts/check-sql-statique.py`,
  `sh scripts/test-db.sh`, `cd app && npm run test:e2e`.

## Acceptance Criteria

- [ ] Le schéma garantit « au plus une photo par étape » et la migration est
      appliquée sans réécrire une migration existante.
- [ ] Après deux ajouts successifs sur la même étape, une seule référence
      subsiste et l'objet du premier dépôt a été retiré du bucket.
- [ ] En session membre, les commandes d'ajout et de retrait sont rendues ; en
      session `enfant`, aucune ne l'est et l'image reste visible.
- [ ] Les quatre surfaces (fiche membre, mode cuisine, lien invité, impression)
      rendent l'image de l'étape ; une étape sans photo ne laisse ni trou ni
      image cassée sur aucune des quatre.
- [ ] La charge invitée porte une URL signée d'une heure ou `null` ; elle ne
      contient aucune sous-chaîne de chemin de bucket, même en échec de
      signature.
- [ ] **Critère négatif** : après un dépôt, la colonne contient un chemin de
      bucket et jamais une URL `http(s)://` signée.
- [ ] Retirer la photo d'une étape, supprimer une étape et supprimer la recette
      retirent chacune les objets du bucket ; les cas sans photo sont des
      no-op sans erreur.
- [ ] En mode démo, l'aperçu mort après rechargement est masqué et l'étape se
      rend comme sans photo.
- [ ] `npm run typecheck`, `npm test`, `npm run build`,
      `python3 scripts/check-sql-statique.py`, `sh scripts/test-db.sh` et
      `npm run test:e2e` sont verts.

## Edge Coverage

**Coverage:** 11/11 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified (revue manuelle) | R1 | ✅ covered | Le dépôt de la nouvelle photo est committé d'abord ; la suppression de l'ancien objet est best-effort, n'annule jamais la nouvelle photo, et un échec est journalisé — jamais silencieux (motif `console.warn('Objet de média non retiré du bucket : <path>', error)` de `notes`/`cercle`/`animaux`). Le `deleteRecipe` du module `recettes` avale aujourd'hui ses propres nettoyages en silence — c'est l'écart que cette phase comble, pas le motif à recopier. Critère d'acceptation 2 et 7. |
| idempotency | R2 | ✅ covered | Le nettoyage ne supprime l'objet précédent que si le nouveau chemin diffère de l'ancien (`replacedMediaPath`) : remplacer par la même valeur ne détruit pas l'objet qu'on vient d'écrire. |
| concurrency | R2 | 🧪 backstop | Deux membres ajoutent une photo à la même étape simultanément : le dernier écrit gagne, l'objet du perdant peut devenir orphelin. Test d'arête retenu pour le plan. |
| unclassified (revue manuelle) | R3 | ✅ covered | Une étape sans photo ne rend aucun élément média sur les quatre surfaces ; un échec de signature sur le lien invité laisse le reste de la recette intact (échec fermé, forme 06-04). |
| unclassified (revue manuelle) | R4 | ✅ covered | La vue invitée reçoit `null` en échec de signature et jamais un chemin brut ; TTL 1 h, identique à la couverture. Critère d'acceptation 5. |
| empty | R5 | ✅ covered | Supprimer une étape sans photo, ou une recette dont aucune étape n'a de photo, est un no-op sans erreur. |
| adjacency | R5 | ⛔ dismissed | Un chemin de photo d'étape ne peut pas être confondu avec un autre média du foyer : la valeur est un chemin de bucket distinct (`recipes/<recipeId>/…`), et `householdMediaPathOf` ne juge que la forme (préfixe), pas la cible. Aucun cas de « deux choses qui se touchent » n'existe ici. |
| ordering | R5 | ✅ covered | La suppression d'une recette tente **tous** les objets de ses étapes même si l'un échoue ; l'ordre est sans effet, seule l'exhaustivité compte. |
| idempotency | R5 | ✅ covered | Retirer deux fois la photo de la même étape : la seconde est un no-op (la valeur est déjà `null`, `householdMediaPathOf` rend `null`). |
| concurrency | R5 | 🧪 backstop | Supprimer une recette pendant qu'un dépôt de photo d'étape est en vol : l'objet déposé après la cascade peut devenir orphelin. Test d'arête retenu pour le plan. |
| unclassified (revue manuelle) | R6 | ✅ covered | Un aperçu `blob:` mort après rechargement est masqué (`onError`) et l'étape se rend comme sans photo, bouton d'ajout disponible. Critère d'acceptation 8. |

## Prohibitions (must-NOT)

**Coverage:** 1/1 applicable prohibition resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT persister une URL signée dans la colonne : après un dépôt, la valeur est un chemin de bucket, jamais une URL `http(s)://`. | R1 | resolved | verification: **test** — critère négatif d'acceptation 6 ; test unitaire sur le dépôt (`check_kind: node-test`). Le chemin du test est fixé par le plan (descripteur laissé vide ici : le nommer maintenant serait un chemin inventé). |

**Graines canoniques écartées (non gravées ici, propriétaires ailleurs)** — une
ligne de renvoi, pas une prohibition de cette phase :

- *Exposition d'un chemin brut à un visiteur sans compte* → sécurité canon
  (contrôle d'accès) ; R4 le couvre **positivement**, et `/gsd-secure-phase`
  en est propriétaire.
- *Un `enfant` qui ajoute ou retire une photo* → contrôle d'accès canon ; R2 le
  couvre positivement.
- *Fuite d'une photo d'un autre foyer (RLS)* → contrôle d'accès canon ;
  propriété des tests SQL négatifs de `test-db.sh` et de `/gsd-secure-phase`.
- *Dépôt non authentifié* → canon ; propriété de la clé publiable et de la RLS.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                            |
|--------------------|-------|------|--------|------------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Unité (une photo par étape, remplaçable) et surfaces verrouillées |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | Exclusions explicites (ingrédients, vidéo, galerie, légende, DnD) |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Doctrine média, TTL 1 h, mode démo, pas de dépendance            |
| Acceptance Criteria| 0.70  | 0.70 | ✓      | 9 critères pass/fail, dont 1 négatif                             |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      |                                                                  |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective     | Question summary                                    | Decision locked                                                                 |
|-------|-----------------|-----------------------------------------------------|---------------------------------------------------------------------------------|
| 1     | Researcher      | Quelle est l'unité ?                                 | Une photo par étape, remplaçable (pas N pièces jointes, pas une photo du plat)   |
| 1     | Researcher      | Sur quelles surfaces ?                               | Les quatre : fiche membre, mode cuisine, lien invité, export/impression          |
| 1     | Researcher      | Qui ajoute et retire ?                               | Tout membre qui écrit ; pas d'`is_household_admin` (classe `18-§3` non reproduite) |
| 2     | Researcher      | Que fait le mode démo ?                              | Les deux : aperçu `blob:` local en démo, chemin signé en Supabase                |
| 2     | Simplifier      | Ajout sur une étape déjà photographiée ?             | Remplace et nettoie l'objet précédent                                            |
| 2     | Boundary Keeper | Qu'est-ce qui est exclu ?                            | Ingrédients, vidéo/audio, galerie/multiples photos                               |
| 3     | Boundary Keeper | Légende et glisser-déposer ?                         | Tous deux hors périmètre (choix, pas oubli)                                      |
| 3     | Failure Analyst | Que fait un `enfant` ?                               | Voit la photo, ne peut ni ajouter ni retirer                                      |
| 3     | Failure Analyst | Jusqu'où va le nettoyage du bucket ?                 | Aux trois niveaux : retrait, suppression d'étape, suppression de recette         |
| 4     | Failure Analyst | Échec de la suppression de l'ancien objet ?          | Best-effort après commit ; la nouvelle photo n'est jamais annulée, l'échec est dit |
| 4     | Failure Analyst | TTL du lien signé invité ?                           | 1 heure, comme la couverture                                                     |
| 4     | Failure Analyst | Aperçu `blob:` mort en démo ?                        | Masqué (`onError`) ; l'étape se rend comme sans photo                            |
| 4     | Failure Analyst | Graver l'interdiction « pas d'URL signée en colonne » ? | Oui — critère négatif vérifiable par test                                     |

---

*Phase: 21-photos-dans-les-etapes-de-recette*
*Spec created: 2026-10-16*
*Next step: /gsd-discuss-phase 21 — implementation decisions (modèle de données exact, dossier de dépôt, rendu des quatre surfaces)*
