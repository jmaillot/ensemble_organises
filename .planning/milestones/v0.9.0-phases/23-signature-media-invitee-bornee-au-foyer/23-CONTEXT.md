# 23 — Signature média invitée bornée au foyer — CONTEXTE

**Type :** phase de fermeture. Elle ne crée pas de fonctionnalité : elle ferme
le résidu **R3** de `21-SECURITY.md`, re-vérifié ouvert sur le code du
2026-10-17.

**Origine :** la phase 22 a fermé la classe `recipe-invite` (`0127`, plan 22-01)
et a consigné le reste avec `file:line` plutôt que de le présenter comme clos
(`22-CONTEXT.md` §« Ce que la phase ne fait pas », R3). Il restait **deux**
signeurs invités non bornés. Le dépouillement du 2026-10-17 le confirme :
`grep -rn createSignedUrl supabase/functions/` ne rend que trois sites, dont
deux ouverts — `gift-list-invite/index.ts:865` et `ardoise-invite/index.ts:645`.

**Ce que « deux surfaces » veut dire ici.** Les deux trous ont la **même**
cause (un chemin brut signé en service-role, hors politique du bucket
`(storage.foldername(name))[1]`, pour un visiteur sans compte que la RLS ne
protège pas) mais **deux remèdes distincts**, parce que le foyer n'est pas
connu au même endroit : dans le RPC pour les cadeaux, dans l'Edge pour
l'ardoise. Prétendre à un remède unique supposerait un savoir qui n'est pas là.

## Ce que la phase ne fait pas

- Pas de contrainte d'écriture sur `gift_items.photo_url` ni sur
  `ardoises.cover_url` (voir D-02).
- Pas de touche à `recipe-invite` : la phase 22 l'a fermé (`0127`), son RPC
  `view_recipe_share` ne rend plus aucune forme `http(s)`. Le périmètre reste
  celui du résidu R3.
- Pas de refonte de la vue invitée de l'ardoise en fonction serveur : il n'y a
  aujourd'hui **aucun** RPC à border — l'Edge compose la vue — et le refactor
  n'est pas justifié par le trou.
- Pas de reprise des 14 politiques `*_delete_admin` (18-§3, décision déjà
  assumée), ni de la passe documentaire 18/19 restante.

## Décisions

- **D-01 — Le verdict cadeaux vit dans le RPC `guest_view_gift_list`, pas dans
  l'Edge.** Le foyer est connu **dans la fonction** par construction
  (`v_invite.list_id` → `public.gift_lists.household_id`, vérifié présent), et
  c'est le seul chemin par lequel l'Edge obtient une valeur à signer
  (`handleGuestView`, `index.ts:873`). Le foyer sert au verdict et **n'est
  jamais rendu** : la réponse ne gagne aucune clé de foyer. Même raisonnement
  que D-01 de la phase 22 — filtrer là où le savoir est autoritaire.
- **D-02 — Aucune contrainte d'écriture sur les deux colonnes.** `gift_items.photo_url`
  et `ardoises.cover_url` tolèrent une forme non-chemin (`http(s)` héritée,
  `data:` : `cadeaux/types.ts:51`, `ardoise/api.test.ts:131,161`), et le client
  réécrit la valeur existante à chaque édition. Une contrainte refuserait cette
  édition ; `not valid` la rendrait presque inerte. C'est `0127:24-32` et D-02
  de la phase 22, transposés — décision utilisateur du 2026-10-17 : « fais au
  mieux pour garder le comportement attendu ».
- **D-03 — La forme non-chemin n'est plus rendue sur une surface invitée.**
  Décision utilisateur du 2026-10-17 : la photo vient d'un **dépôt**
  (galerie/appareil), « pas de chemin https ». Le verdict de lecture refuse donc
  la forme `http(s)` comme le fait `0127:187-195` pour la recette. La perte est
  nulle : le formulaire cadeau n'offre qu'un sélecteur de fichier pour la photo
  — l'URL distante a sa propre colonne `gift_items.url` — et la forme héritée
  n'est qu'un reliquat antérieur à la doctrine média de la phase 19 (D-01).
- **D-04 — Le bornage de la surface ardoise est une fonction pure, prouvable
  sans `deno`.** `deno` est absent de cet hôte : un `index.ts` d'Edge n'est pas
  importable par une suite. Le prédicat (valeur × foyer → chemin borné ou
  `null`) vit donc dans un module **pur** — aucun import Deno ni `npm:` — à
  l'image de `recipe-invite/guest-steps.ts` (doctrine D-16 de la phase 21), et
  un `*.test.ts` placé à côté est découvert par `app/vite.config.ts:71`. Le
  même raisonnement s'applique au RPC : il est prouvé par `test-db.sh`.
- **D-05 — `guest-steps.ts` n'est pas touché, et l'asymétrie est consignée.**
  Le module de la phase 22 garde son relais `http(s)` — branche désormais
  **morte** pour la recette, puisque `view_recipe_share` n'émet plus la forme.
  Le phase-23 ne la reprend pas : ses deux surfaces refusent la forme **au
  verdict**, avant le signeur. Conséquence assumée et écrite : trois signeurs,
  dont un seul (celui de la recette) porte encore un relais inatteignable.
  Le retirer serait un changement de la phase 22, hors périmètre et sans
  effet observable ; il est consigné comme résidu cosmétique, jamais comme
  protection.

## Exigences

- **R1** — Aucune valeur rendue par la vue invitée de `gift-list-invite` ou
  d'`ardoise-invite` ne désigne un objet d'un autre foyer : hors du préfixe du
  foyer, ou en présence d'un segment `..`, la valeur rend `null` (échec fermé).
- **R2** — La forme non-chemin (`http(s)://…`) n'est plus rendue par ces deux
  surfaces ; seule une valeur de chemin borné est signée.
- **R3** — Le foyer de la ressource n'est jamais rendu au visiteur : il sert au
  verdict, il ne figure dans aucune clé de la réponse.
- **R4** — Le verdict est prouvable automatiquement sur cet hôte : RPC couvert
  par `test-db.sh`, surface ardoise couverte par Vitest via un module pur.

## Prohibitions

- Ne réécrire aucune migration appliquée (`0122` et les autres) : corriger vers
  l'avant, dans `0128`.
- Ne pas introduire de directive de linter : aucun linter n'est configuré dans
  ce dépôt, une directive serait lue par personne.
- Ne pas présenter comme close une assertion qui ne peut pas échouer, ni une
  affirmation non ouverte dans le code.
- Ne pas relayer une valeur `http(s)` sur une surface invitée, ni rendre le
  foyer de la ressource.
