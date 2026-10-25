---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
created: 2026-10-15
source: 18-REVIEW.md (revue du frontend app/src) — familles restantes
scope: WR-07 … WR-20 (les 14 info IN-01…IN-14 partent au backlog, phase 999.2)
---

# Phase 19 — Contexte et décisions

## Origine

La phase 18 a fermé CR-01 et WR-01…WR-06. Le reste de la revue (`18-REVIEW.md`) est
ici, réparti en quatre familles qui partagent chacune **une seule cause** :

| Famille | Findings | Cause commune |
|---|---|---|
| Médias du foyer | WR-08, WR-10, WR-16 | une URL signée éphémère est traitée comme une référence durable, et les objets du bucket ne suivent pas la vie de leur ligne |
| Temps affiché | WR-07, WR-12, WR-14 | un instant est converti « à la main » au lieu de passer par un helper unique, et un panneau liste ce qu'il ne filtre pas |
| Écritures composées | WR-09, WR-11, WR-20 | une opération en deux temps (créer + déposer, ou répartir + appeler) n'a pas de compensation ni d'état d'avancement vrai |
| Affordances et gardes | WR-13, WR-17, WR-18, WR-19 | l'interface expose une capacité que le serveur ou le tri refuse, ou une garde conclut sur une lecture qui a échoué |

## Décisions verrouillées

- **D-01 — WR-08 : convention unique, le chemin est la référence.** Toute colonne média
  stocke le **chemin** du bucket ; l'URL signée est produite **à la lecture**, jamais
  persistée. Les six modules déjà corrects (recettes, voyages, prestataires, adresses,
  courses, cadeaux) sont le modèle ; notes, anniversaires, contacts, animaux et cercle
  s'y alignent. La résolution passe par un seul point (helper ou hook), pas par cinq
  copies d'un `storage.from(...).createSignedUrl(...)`. Un seul module ne doit pas
  pouvoir réintroduire l'URL en le faisant « à la main » : la fonction de dépôt ne
  renvoie donc plus d'`url` utilisable comme valeur de colonne, ou son usage est
  verrouillé par un test.
- **D-02 — WR-08 : les lignes existantes sont réparées, pas abandonnées.** Une URL
  signée Supabase porte son chemin (`…/storage/v1/object/sign/<bucket>/<chemin>?token=…`).
  Une migration de rattrapage extrait le chemin et réécrit la colonne, dans les cinq
  modules concernés. Les valeurs non analysables (saisie manuelle, URL externe) sont
  **laissées telles quelles** et comptées dans le rapport de migration — pas de
  conversion hasardeuse. Sans ce rattrapage, les photos déjà en base restent mortes et la
  phase ne répare que le futur.
- **D-03 — WR-10 : la ligne et son objet meurent ensemble.** Supprimer une entité
  supprime ses objets du bucket : notes (pièces jointes), animaux (portrait **et**
  documents), cercle (médias), courses (image produit), ardoise (justificatifs si le
  bucket les porte). Un dépôt qui **remplace** un média supprime l'ancien. La
  compensation vit au même endroit que la suppression de ligne, jamais dans le
  composant. Une suppression partielle (objet supprimé, ligne conservée) doit être
  impossible : la ligne part d'abord, l'objet ensuite, et l'échec du second est
  signalé sans faire échouer le premier.
- **D-04 — WR-16 : ne jamais inventer un type.** Quand `file.type` est vide, le type se
  déduit de l'extension (chemin déjà emprunté par `isAccepted`), jamais forcé à
  `application/pdf`. Un fichier dont le type reste indéterminé est refusé avec un
  message, plutôt qu'accepté sous un type faux.
- **D-05 — WR-07 : un seul helper de conversion, et il est partagé.** `datetime-local`
  est du **local** ; les valeurs stockées sont des instants. La conversion vit dans un
  helper commun (aller et retour) utilisé par les tâches **et** les routines — et
  l'audit porte sur **tous** les `<input type="datetime-local">` du dépôt, pas seulement
  les deux cités. Les données déjà stockées sont corrigées par le même helper (la
  relecture redevient juste), sans migration de backfill.
- **D-06 — WR-12 : le calcul de date passe par `date-fns`.** Le prochain anniversaire
  se calcule avec les fonctions de date (année bissextile gérée par la bibliothèque),
  jamais par concaténation de chaîne. Le 29 février doit tomber sur le 28 ou le 29 selon
  l'année, sans jamais produire `NaN`.
- **D-07 — WR-14 : un panneau ne liste que ce qu'il annonce.** « Rappels du jour » se
  borne à la journée. La doctrine à trancher est celle du devenir d'un rappel passé :
  les rappels passés **ne s'accumulent pas** en tête de liste, et la phase doit dire
  explicitement ce qu'il advient d'eux (filtrage, ou nettoyage) plutôt que de laisser la
  liste grossir indéfiniment.
- **D-08 — WR-09 : une opération en deux temps porte sa compensation.** Créer puis
  déposer laisse un doublon à la réédition quand le dépôt échoue. Chaque site
  (voyages, recettes, anniversaires, création de foyer) annule la ligne créée quand
  l'étape suivante échoue — le chemin de dépôt a besoin de l'identifiant, donc c'est la
  compensation qui est retenue, pas l'inversion de l'ordre. La preuve exigée simule
  l'échec du dépôt et vérifie qu'aucune ligne ne subsiste.
- **D-09 — WR-11 : les drapeaux de mutation disent la vérité.** Les écritures d'Animaux
  passent par les mutations du hook (comme partout ailleurs) au lieu d'appeler `../api`
  directement, pour que `isMutating`/`uploading` cessent d'être structurellement `false`.
  Le double envoi et l'absence de retour d'envoi en découlent.
- **D-10 — WR-20 : le reliquat du partage invité suit la règle des membres.** Le partage
  égal répartit en centimes entiers et reporte le reliquat sur une part, exactement comme
  le chemin membre, au lieu d'arrondir chaque part identiquement et de laisser un écart
  que le RPC refuse.
- **D-11 — WR-13 : l'ordre manuel gouverne, le retard est épinglé.** Le glisser-déposer
  doit changer ce que l'utilisateur voit. Le tri d'affichage devient : statut, puis
  **tâches en retard d'abord**, puis l'ordre manuel saisi (`priority_order`). L'échéance
  reste visible en badge. C'est ce qui satisfait à la fois la doctrine AGENTS.md §6
  (« tri automatique par échéance, retard en rouge en haut » **et** « glisser-déposer
  pour changer la priorité manuelle ») — aujourd'hui les deux se contredisent.
- **D-12 — WR-17 : une garde ne conclut pas sur une lecture qui a échoué.**
  `RequireAttestation` ne montre la modale que si la lecture a **réussi** et dit « non
  attesté » ; une erreur de lecture ne doit pas bloquer un utilisateur déjà attesté.
  `/foyer/nouveau` et `/foyer/rejoindre` passent sous `RequireAuth` comme `/foyer`.
  `LazyRoute` cesse d'attribuer toute erreur de rendu à la connexion et cesse de rejouer
  la même page à chaque « Réessayer ».
- **D-13 — WR-18 : le gating enfant couvre aussi ce qui existe déjà.**
  `calendrier-page` borne `onEdit`/`onDelete` comme les entrées de création. La doctrine
  D-06 (« lecture seule partout ») n'est pas seulement serveur.
- **D-14 — WR-19 : les dépendances du memo disent ce qu'il lit.** `use-notifications`
  déclare `assigneesByTask` et `currentMember` ; le compteur de la barre et la cloche ne
  peuvent plus se contredire.

## Preuves attendues

- WR-08 : une ligne écrite porte un chemin (jamais une URL signée) ; le rendu résout le
  chemin ; la migration de rattrapage convertit une URL signée stockée et **compte** les
  valeurs non analysables.
- WR-10 : supprimer une note/un animal/un média de cercle/un produit retire ses objets
  du bucket (mock d'adaptateur de stockage, assertion sur les appels `remove`).
- WR-16 : un `File` à `type` vide et extension `.jpg` est déposé en image, pas en PDF.
- WR-07/WR-12 : un rappel à 18:30 heure locale survit à un aller-retour
  affichage → enregistrement ; un anniversaire au 29 février affiche un nombre de jours
  fini sur trois années consécutives.
- WR-09 : dépôt en échec ⇒ aucune ligne créée (par site).
- WR-20 : 50 € entre 6 répartit sans écart rejeté par le RPC.
- Chaque correctif porte une preuve **rouge→vert** (assertion mutée puis restaurée).

## Chaîne de vérification

`cd app && npm run typecheck && npm test && npm run build`, puis
`python3 scripts/check-sql-statique.py` (une migration de rattrapage est ajoutée),
puis `sh scripts/migrate.sh` et `sh scripts/test-db.sh` — Docker est disponible sur cet
hôte, donc le SQL doit être validé contre une vraie base, pas seulement appliqué
(AGENTS.md §2.7). Puis `npm run test:e2e` : seuls les 4 échecs préexistants connus
(specs périmés `critical-paths` et `voyage-workspace`) sont admis — et la phase devra
trancher s'ils sont corrigés ici ou dans une tâche rapide dédiée.

## Hors périmètre

Les 14 constats `IN-*` (hygiène : linter, fichiers non suivis, types dupliqués,
`pushsubscriptionchange`, `aria-required`, rejets de promesse, clés de requête, états
vides, sonde de configuration, `BarCode`, anniversaire d'origine contact, réinitialisation
de dialogue) sont inscrits au backlog en phase 999.2. Les items `deferred-items.md` §2,
§3, §5, §6 et §7 de la phase 18 restent ouverts et ne sont pas absorbés ici, sauf les
e2e périmés si la phase décide de les traiter.
