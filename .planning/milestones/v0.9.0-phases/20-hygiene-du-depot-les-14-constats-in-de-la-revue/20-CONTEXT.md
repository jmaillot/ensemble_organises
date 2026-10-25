---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
created: 2026-10-16
source: 18-REVIEW.md (section INFO, constats IN-01…IN-14) + un constat neuf (IN-15)
scope: IN-01 … IN-14 + IN-15 (mojibake) — la phase 999.2 du backlog est absorbée ici
---

# Phase 20 — Contexte et décisions

## Origine

La phase 18 a fermé CR-01 et WR-01…WR-06, la phase 19 les 14 WR restants
(WR-07…WR-20). Il reste la section **INFO** de `18-REVIEW.md`, quatorze constats
d'hygiène au sens large : outillage absent, fichiers qui traîneraient dans un
`git add -A`, types dupliqués, une API de plateforme non traitée, des
affordances et des états trompeurs, et deux défauts d'état persistant.

Le périmètre était inscrit au backlog en **phase 999.2** ; il est absorbé ici
(la phase 20 la remplace, cf. ROADMAP).

Chaque constat a été **revérifié sur le code actuel** avant d'être planifié —
l'assertion d'absence d'une revue est une assertion comme une autre (§2.7 I).
Deux écarts en sont sortis :

| Constat | Verdict sur le code actuel |
|---|---|
| IN-01 | 15 directives inertes (la revue en comptait 14) |
| IN-02 | intact — 5 entrées non suivies et non ignorées |
| IN-03 | intact — 4 déclarations, 2 doublons |
| IN-04 | intact — aucun `pushsubscriptionchange` dans `sw.ts` |
| IN-05 | intact — `field.tsx`, astérisque `aria-hidden`, pas d'`aria-required` |
| IN-06 | intact — `folder-tabs.tsx:229` et `:305` |
| IN-07 | intact — branche « pas de session » qui ne vide pas la session persistée |
| IN-08 | intact — `useResource.ts` (`select` hors clé) et `app-shell.tsx:65` |
| IN-09 | intact — `notes-page.tsx` |
| IN-10 | **déplacé** (39 → 47), défaut intact |
| IN-11 | **non reproduit** — voir D-11 |
| IN-12 | intact — `barcode.tsx` : `<svg ref>` absent de l'état `failed` |
| IN-13 | intact — le point du calendrier appelle `openEdit` sur `contact-<uuid>` |
| IN-14 | intact — `place-form-dialog.tsx` |
| **IN-15** | **neuf** — mojibake dans un commentaire, `push.ts:27` |

## Décisions verrouillées

### Hygiène d'outillage et de sources

- **D-01 — IN-01 : une directive qui suppose une règle non vérifiée est une
  affirmation fausse ; on la retire.** Aucun linter n'est installé et la phase
  n'en installe pas : la chaîne prescrite (§2.7) est `typecheck && test && build`
  et elle ne change pas. Les **15** directives
  `// eslint-disable-next-line react-hooks/exhaustive-deps` sont **supprimées**,
  chacune remplacée par un commentaire qui dit **pourquoi** les dépendances sont
  volontairement omises — c'est l'information que la directive escamotait. Une
  phrase est ajoutée à **§2.7 AGENTS.md** : aucun linter n'est configuré, donc
  une directive `eslint-disable` est proscrite (elle ne serait lue par personne).
  Preuve exigée : `grep -rn "eslint-disable" app/src` retourne **0**, et un
  **garde de classe** (test) refuse toute réintroduction — lui-même prouvé rouge
  en ajoutant temporairement une directive (§2.7 B : un contrôle se prouve sur
  un cas qui doit échouer).
- **D-02 — IN-02 : ce qui n'est pas du produit n'entre pas dans le dépôt.** Les
  entrées non suivies et non ignorées sont ignorées **par famille**, pas par
  fichier : les artefacts de workers `.claude/worktrees/`, l'état local `.gsd/`,
  et le script de debug ad hoc `app/shot-toggle-on.mjs`. Le script de debug n'est
  **pas supprimé** : c'est du travail de l'auteur, on le met hors du champ de
  `git add -A`, on ne décide pas à sa place.
- **D-03 — IN-03 : un type, une déclaration.** Les doublons
  `NoteAttachmentRow` (`database.ts:238`/`:249`) et `PetAttachmentRow`
  (`:601`/`:612`) sont fusionnés en **une** déclaration chacun. La fusion
  TypeScript masque une divergence future : si les deux corps diffèrent, on garde
  l'**union** des champs (jamais un sous-ensemble), et `typecheck` le prouve.
- **D-15 — IN-15 : un commentaire illisible est un défaut, pas une scorie.**
  `app/src/modules/parametres/lib/push.ts:27` porte un fragment CJK
  (`ne faisait que这些问题 du serveur`) et `:155` un mot anglais (`distinguishes`)
  dans une phrase française. On corrige **la classe** (§2.7 E) : un balayage de
  `app/src`, `supabase/` et `scripts/` cherche tout autre texte corrompu de la
  même famille, corrige ce qui est trouvé et **compte** ce qui reste.

### Affordances et primitives partagées

- **D-05 — IN-05 : le caractère requis se dit au contrôle, pas seulement à
  l'œil.** `Field` transmet `aria-required` au contrôle quand le champ n'est pas
  `optional` (le `*` visuel reste, il ne remplace pas l'attribut). La propriété
  voyage par le *render prop* **et** par le contexte, pour que les deux voies
  (`children({...})` et `useFieldControl()`) la portent.
- **D-12 — IN-12 : un composant qui ne peut pas se rétablir est un composant qui
  ment.** Dans `BarCode`, le `<svg ref>` doit exister **dans tous les états** :
  en état `failed` ou vide, on affiche le repli rayé *et* on garde le `<svg>`
  monté (masqué), sinon `svgRef.current` reste `null` et l'encodage suivant
  échoue sans que rien n'ait changé. La dépendance de l'effet reste `[value]` :
  c'est le montage du `<svg>` qui doit être stable, pas l'effet qui doit être
  rejoué.
- **D-06 — IN-06 : un rejet de promesse se traite là où il naît.** Dans
  `folder-tabs`, le renommage (`:229`) et la suppression (`:305`) laissent une
  promesse rejetée sans `catch` **alors que le consommateur relance après avoir
  déjà montré le message d'erreur**. On ajoute un `catch` **documenté** qui
  explique que l'erreur a déjà été dite par l'appelant (pas un avaleur muet :
  le commentaire dit qui l'a dite), et l'état d'édition n'est pas refermé sur un
  échec. Preuve : un test dont `onRename`/`onDelete` rejettent — aucun rejet non
  traité, et le dialogue reste ouvert.
- **D-09 — IN-09 : un état vide dit la vérité de ce qui est vide.** Dans
  `notes-page`, l'état « aucun résultat » n'est légitime que si une **recherche**
  ou une catégorie est active. Un **dossier** vide sans recherche affiche son
  propre message (« Ce dossier est vide ») et propose de créer une note quand on
  peut écrire, au lieu d'inviter à « réinitialiser les filtres » — qui ne
  remplirait pas le dossier. Trois états distincts, une preuve par état.
- **D-14 — IN-14 : un dialogue qui se rouvre repart de la cible.** Dans
  `place-form-dialog`, l'état local (`photoPreview`, `pickedFile`) et le
  formulaire sont réinitialisés à chaque ouverture par un effet qui lit
  `open` **et** la cible — le `key` de la page ne suffit pas quand la cible ne
  change pas (même lieu rouvert, photo annulée qui resurgit). Le champ fichier
  est vidé aussi, sinon un fichier abandonné est resoumis.

### État persistant et cache

- **D-07 — IN-07 : la branche « pas de session » doit vider la session
  persistée.** Aujourd'hui elle ne fait que passer le statut à `guest` : la
  session et le foyer persistés survivent, donc un sign-out survenu dans un autre
  onglet (ou pendant que l'onglet était fermé) laisse l'application *paraître*
  connectée. La branche appelle la remise à zéro réelle de la session, **et** la
  déconnexion vide le foyer persisté — un foyer sans session est un état qui
  n'existe pas. Preuve : session **et** foyer amorcés persistés, amorçage sans
  session ⇒ les deux sont vides ; et un `SIGNED_OUT` vide le foyer.
- **D-08 — IN-08 : la clé de cache doit contenir tout ce qui change le
  résultat.** Deux défauts, une seule règle :
  - `useResource` applique `select` dans `queryFn` mais ne le porte pas dans la
    clé : deux appels sur la même table et le même filtre avec des `select`
    différents se partagent une entrée de cache et servent les mauvaises lignes.
    La correction **n'introduit pas la fonction dans la clé** (une flèche en
    ligne change d'identité à chaque rendu ⇒ boucle de rechargement, le piège
    que la revue signale). L'appelant déclare un **`selectKey` stable** avec son
    `select`, le type l'exige par une union discriminée, et la clé porte
    `selectKey`. Tous les sites d'appel avec `select` sont alignés.
  - `app-shell.tsx:65` construit sa clé sous un préfixe maison
    (`['app-shell', …]`) qu'aucune invalidation n'atteint : le badge de tâches
    ouvertes peut rester faux après une mutation d'assignation. La clé est
    ramenée sous le préfixe que les invalidations touchent réellement, et une
    preuve montre qu'une mutation d'assignation invalide le badge.
- **D-11 — IN-11 : la duplication « mot pour mot » n'existe pas ; la règle
  réécrite, si.** Vérifié : aucune ligne de commentaire n'est répétée dans
  `use-auth.ts` (ni maintenant, ni avant `f79d553`). Ce qui subsiste est la
  **même règle** (« un nom vide persisté se répare depuis la ligne membre, on ne
  redemande pas la saisie ») énoncée deux fois, dans `applySession` et dans
  l'amorçage. On consolide : **une** énonciation fait foi, l'autre y renvoie.
  C'est un correctif de documentation, sans effet d'exécution — et le constat de
  la revue est corrigé dans le rapport de phase, pas recopié.
- **D-13 — IN-13 : on n'édite pas ce qu'on ne possède pas.** Dans le calendrier
  des anniversaires, le point d'un anniversaire **d'origine contact**
  (`contact-<uuid>`) appelle `openEdit` : l'utilisateur voit « Modification
  enregistrée. » sans qu'aucune ligne ne change, parce que l'id est synthétique.
  Le comportement de la liste fait déjà foi (un lien vers `/contacts`) : le
  calendrier s'y aligne — un anniversaire d'origine contact **n'ouvre pas** le
  dialogue d'édition, il mène à sa fiche.

### Plateforme

- **D-04 — IN-04 : un abonnement rotaté est renouvelé ET signalé.** `sw.ts`
  n'écoute pas `pushsubscriptionchange` : après une rotation par le navigateur,
  le serveur garde l'ancien endpoint et les rappels partent dans le vide, sans
  aucune trace. Le worker traite l'événement : il retient le nouvel abonnement
  (`event.newSubscription`, sinon il en crée un avec la clé de l'ancien), écrit
  un **reçu durable** dans l'API Cache (le canal qui survit à l'absence
  d'onglet — le worker n'a pas de jeton pour appeler la fonction serveur), et
  **prévient les clients** ouverts par `postMessage`. Côté page, un lecteur du
  reçu l'enregistre via la fonction `push-subscribe` existante. Un échec est
  **écrit** dans le reçu, jamais avalé (§2.7 F : un succès muet est un échec
  inexpliqué). `SW_VERSION` est incrémenté — c'est ce qui permet au panneau de
  détecter un worker actif mais obsolète.
- **D-10 — IN-10 : la sonde de configuration est une seule fonction.** La page
  de jonction teste `VITE_SUPABASE_URL` seul ; le reste de l'application teste
  `isSupabaseConfigured` (URL **et** clé). Une URL sans clé fait donc croire à un
  backend présent, et la branche locale n'est pas prise — alors que le client
  Supabase, lui, n'existe pas. La page utilise la même sonde que tout le monde.

## Preuves attendues

- D-01 : `grep -rn "eslint-disable" app/src` = 0 ; le garde de classe **échoue**
  quand une directive est ajoutée à un fichier source (muté puis restauré).
- D-02 : `git status --porcelain --untracked-files=all` ne montre plus
  `app/shot-toggle-on.mjs`, `.gsd/`, `.claude/worktrees/*` (le fichier existe
  toujours sur le disque).
- D-03 : `typecheck` vert, et `database.ts` ne contient plus qu'une déclaration
  par type (comptage).
- D-04 : un `pushsubscriptionchange` simulé écrit un reçu avec le nouvel
  endpoint et `postMessage` les clients ; la page enregistre ce reçu via
  `push-subscribe` (double d'adaptateur).
- D-05 : un champ requis rend un contrôle portant `aria-required="true"` ; un
  champ `optional` ne le porte pas.
- D-06 : `onRename`/`onDelete` qui rejettent ⇒ aucun rejet non traité.
- D-07 : session + foyer persistés, amorçage sans session ⇒ `user === null` et
  foyer vide.
- D-08 : deux `select` différents sur la même table/filtre ne partagent plus
  d'entrée (deux requêtes distinctes) ; une mutation d'assignation rafraîchit le
  badge de `app-shell`.
- D-09 : trois états vides distincts (aucune note / dossier vide / recherche sans
  résultat), chacun son message.
- D-10 : URL présente + clé absente ⇒ la page se comporte en mode local, comme
  `isSupabaseConfigured` le dit.
- D-11 : une seule énonciation de la règle dans `use-auth.ts`.
- D-12 : valeur non encodable ⇒ repli rayé ; puis valeur valide sur le **même**
  composant monté ⇒ un vrai code-barres, plus de repli.
- D-13 : cliquer le point d'un anniversaire d'origine contact ne produit aucune
  écriture et mène à `/contacts`.
- D-14 : ouvrir, choisir une photo, annuler, fermer, rouvrir le **même** lieu ⇒
  aucun aperçu, aucun fichier en attente.
- D-15 : `push.ts` ne contient plus de caractère hors alphabet français dans ses
  commentaires ; le balayage de classe est compté.
- Chaque correctif porte une preuve **rouge→vert** (assertion mutée puis
  restaurée), comme aux phases 18 et 19.

## Chaîne de vérification

`cd app && npm run typecheck && npm test && npm run build`, puis
`python3 scripts/check-sql-statique.py`, puis `sh scripts/migrate.sh` et
`sh scripts/test-db.sh` (Docker est disponible sur cet hôte ; la phase ne touche
pas au SQL, donc ces deux-là sont un garde de non-régression), puis
`npm run test:e2e` — attendu **121 passés / 5 sautés** (les 5 sauts sont des
`test.skip` conditionnels de viewport, cf. phase 19).

## Hors périmètre

- Les items `deferred-items.md` §1, §3, §5–§9, §16 des phases 18 et 19 restent
  ouverts (ils ne sont pas des constats `IN-*`).
- L'observation d'information sur l'hôte d'URL signée local (`api-gw:8000`) :
  c'est un effet de configuration d'environnement, pas un défaut de code.
- L'ajout d'un linter, d'un formateur ou d'une règle de style : D-01 tranche
  explicitement dans l'autre sens.
