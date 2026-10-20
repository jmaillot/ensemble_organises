# Travaux en cours

Liste de ce qui reste à faire sur le dépôt, avec l'état réel de chaque point.
Elle est courte, et c'est volontaire : une liste qui grossit est une liste que
personne ne lit.

Chaque entrée porte ce qu'il faut pour la reprendre à froid : ce qui est à
faire, pourquoi, et **comment vérifier que c'est fini**. Un travail sans
critère de fin n'est pas terminé, il est en cours.

Dernière mise à jour : 19 octobre 2026.

---

- [x] **1. L'affichage des notifications, à revalider sur mobile**

**Le 2026-10-19, une notification a été reçue et affichée** dans Firefox
(Linux), après déploiement du correctif `d348309`. Le chemin complet — base,
Edge Function, service Push, déchiffrement, service worker, affichage — est
donc prouvé, mais **sur ce poste seulement**.

**Ce qui bloquait réellement était dans le dépôt.** `push-notify/web-push.ts`
insérait un octet `0x51` entre l'en-tête et le chiffré, que la RFC 8188 §2.1 ne
prévoit pas. Le navigateur lisait le chiffré un cran trop tôt, rejetait le
message au déchiffrement (`Bad encryption`, accusé `101`) et ne réveillait
jamais le worker : ni bannière, ni reçu. Le défaut datait de la création du
fichier (`6bbfbbf`, 26/09) — aucun push émis par l'application n'était
déchiffrable depuis cette date, ce qui explique aussi pourquoi
`delivered: 1` avait pu être pris pour une réception. Elle explique de même
l'observation du 28/09 (« snippet 40 s → `NOTIFICATION REÇUE` ») : une
notification affichée alors ne pouvait pas venir de l'expéditeur de
l'application.

**Pourquoi le test ne l'avait pas vu.** Il attendait un corps de 145 octets au
lieu des **144** publiés par la RFC 8291 : le vecteur avait été ajusté sur
l'implémentation, pas pris dans la RFC. Il porte désormais les octets publiés,
et a été vu **rouge** sur l'ancien code (`expected 144 but got 145`).

**Ce qui reste à jouer : le même parcours sur mobile** — bannière au premier
envoi, puis seconde bannière au renvoi avec le même tag (`renotify`). Rien ne
l'a encore fait.

**Comment trancher.** Sur la page de l'application, lancer le bouton
« Envoyer un test », puis lire `Paramètres → Notifications → Dernier push
reçu` : `shown: true` vaut réception et affichage par le worker. Si la ligne ne
bouge pas, le journal du navigateur (`dom.push.loglevel = Debug`) sépare les
deux étages restants : `Bad encryption` / accusé `101` désigne la trame
envoyée, l'absence de tout message désigne le transport — voir `docs/PWA.md`
§« Exploitation push ».

**Terminé quand** la bannière apparaît sur mobile au premier envoi, et de
nouveau au renvoi avec le même tag.

**Clos le 2026-10-19** : les deux critères sont atteints sur mobile — bannière
système au premier envoi, **et seconde bannière au renvoi avec le même tag**,
donc `renotify` compris. Poste : **Android, Chrome, l'application installée**
(PWA). Le chemin complet est donc prouvé sur deux postes au total
(Firefox/Linux le 2026-10-19, et ce téléphone), et le défaut de trame
`d348309` est soldé des deux côtés.

---

- [x] **2. Le contrôleur de littéraux est sourd dans deux endroits**

**Corrigé et vérifié le 27/09** (preuve en 4 cas d'abord : variable après
`)` non appariée manquée, `format(%L)` silencieuse, conflit de types
détecté, mêmes types silencieux — puis `_masque_litteraux` aux deux sites,
contrôle vert à l'identique : 76 fonctions, 26 migrations, 9 tests).

`check-sql-statique.py` comptait des parenthèses sur un corps `do $$` sans
masquer les littéraux, aux lignes **590** et **669**. Un littéral contenant des
parenthèses non appariées — `'private\.(\w+)\s*\('` en contient deux — décale
le comptage, et le contrôle cherche ensuite dans une structure qu'il n'a jamais
Un troisième site, à la ligne 246, a été corrigé le 26 septembre : c'est lui
qui rendait le contrôle 2 aveugle aux CTE récursifs. Les deux autres
n'ont pas été repris — les contrôles qui les utilisent ont des cas déjà
éprouvés, et je préfère les laisser verts que les corriger sur une
déduction.

**Comment vérifier.** Écrire d'abord un cas qui doit être détecté, et un qui
ne doit pas l'être — sur le modèle des neuf cas du contrôle `recursive`. Puis
appliquer `_masque_litteraux` sur le corps avant de compter, et vérifier que
les cas existants morsent toujours.

**Terminé quand** les deux sites sont masqués et que les cas passent.

---

- [x] **3. Le chemin anniversaires n'a jamais été validé par un envoi**

**Qui peut le faire : l'agent, puis l'utilisateur.** — **Fait le 27 septembre 2026** par `sh scripts/test-dispatch-anniversaires.sh` (écrit pour l'occasion, modèle `test-dispatch-push.sh`, propriété inversée : réannonce au lieu de disparaître) : deux dispatches, `200` et `delivered: 2` les deux fois, `consumed: 0` comme prévu par contrat, tag encore dû avant le second appel, nettoyage vérifié par comptage.

`eo-birthday-alerts` passe chaque matin à 06 h 40 et n'a jamais rien envoyé.
`0006_birthdays.sql` couvre sa logique, et §6.6 explique pourquoi ce chemin ne
peut pas être validé par la disparition d'une ligne : un anniversaire n'a rien
à consommer.

**Ce qu'il faut.** `scripts/test-dispatch-anniversaires.sh`, sur le modèle de
`test-dispatch-push.sh`, avec une propriété **inversée** : puisque rien n'est
consommé, le test vérifie qu'un **second** appel réannonce, au lieu de
vérifier une disparition.

**Deux choses vérifiées avant d'écrire.** Le chemin anniversaires n'est **pas**
conditionné par une préférence : `preference` vaut `null` pour un
anniversaire, et le filtre fait `coalesce(case … end, true)`, donc il passe.
Et la source filtre sur `days_until = 0`, ce qui vaut toute la journée — il
n'y a pas de fenêtre d'une minute à rater.

**Terminé quand** le rapport dit `200` avec `delivered: 1`, et qu'un second
appel est annoncé une seconde fois.

---

- [x] **5. Publication Cercle avec photo : « bucket not found »**

**Validé en usage le 27/09/2026** (rebuild + publication avec photo).
Cause : `CERCLES_BUCKET = 'cercle'`, inexistant ; pointe désormais vers
`household-media`, seul nom que les politiques Storage connaissent
(`app/src/modules/cercle/api.ts:22`).

---

- [x] **6. Tâche/routine avec assigné : « permission denied for function parent_household_id »**

**Validé en usage le 27/09/2026** (tâche et routine avec assigné depuis
l'app) + `test-db.sh` vert avec les premiers chemins heureux en
`authenticated`.
Cause : `0009:68` révoquait `EXECUTE` sur `parent_household_id`, appelée en
direct par les deux politiques d'assignation ; les tests ne faisaient
qu'`expect_denied` (même code 42501 dans les deux cas). Corrigé vers
l'avant en 0026 (enveloppes booléennes DEFINER + tests positifs), doctrine
booléens de `0009:41-43` préservée.

---

- [x] **7. Création d'une liste de cadeaux impossible**

**Validé en usage le 28/09** (`privee` et `foyer` créées depuis l'app).
Cause : `INSERT…RETURNING` refusé car la politique `SELECT` relit la ligne
par son id, invisible dans la même commande (MVCC) ; `createGiftList` insère
désormais sans représentation puis relit (0032 restaure le `SELECT`
historique). Reste en toile de fond l'anomalie transfert inter-membres,
sans chemin applicatif.

---

- [x] **8. Date d'anniversaire affichée en MM/DD/YYYY**

**Validé en usage le 28/09** (saisie `27/09/1990` acceptée et réaffichée).
Champ texte explicite `JJ/MM/AAAA` (`parseFrDate`/`formatFrDate`, contrôle
aller-retour calendaire), conversion ISO à la frontière du dialogue.

---

- [x] **9. Prestataires : « sans type » sans possibilité d'en créer un**

**Résolu le 27/09/2026 sans code : le bouton « Gérer les types » existait
(`prestataires-page.tsx:101`, état vide :159), il avait été manqué.** Les
politiques `provider_types` sont standard et la sauvegarde est câblée avec
toast d'erreur. Reste le vrai manque, en #10.

---

- [x] **10. Types de prestataires proposés par défaut**

**Validé en usage le 27/09/2026** (dix types proposés sur MAILLOT).
`create_household` sème Médecin, Dentiste, Pharmacie, Plombier,
Électricien, Garagiste, Coiffeur, Vétérinaire, Assurance, Banque (0027,
rattrapage sans écraser) ; couvert par `0008_household_defaults.sql`.

---

- [x] **11. Les correctifs de liens invités (phases 21 à 23) sont en production — reste la preuve d'usage**

**Déployé le 2026-10-17** (runbook `docs/DEPLOIEMENT-PROD.md`, clone de production à
`b5038bf`) : `sh scripts/migrate.sh --status` nomme `0128` appliquée (lot `0123`…`0128`,
12:42:36–12:42:39 UTC) ; les fonctions Edge métier sont chargées (copie 12:48:17Z,
conteneur démarré 12:48:35Z, soit 18 s après) et leur identité est **prouvée par
comportement** — `sh scripts/smoke-functions-serveur.sh` rend **6/6**, dont l'oracle
uniforme « Ce code est invalide. » qui n'existe que dans le code de la phase 22 ; l'image
frontend a été construite le même jour (12:49:16Z) et son conteneur démarré à 13:06:45Z.

**Ce qui reste.** Un seul critère de #11 n'était pas un geste d'exploitation : un
**parcours invité réel** (liste de cadeaux partagée **et** ardoise partagée) qui rend une
image signée ou `null` — jamais un chemin brut, jamais une forme `http(s)` relayée. Le
déploiement ne le prouve pas : il rend la preuve possible.

**Qui peut le faire : l'utilisateur.** Appareil réel, session réelle.

**Terminé quand** ce parcours est joué et consigné ici.

**Clos le 2026-10-19** : parcours réel joué en production, sans session
authentifiée, sur les **deux** surfaces — liste de cadeaux partagée et ardoise
partagée. Les photos s'affichent côté invité ; comme la page invitée n'accepte
que des formes `http(s)` (`isServableHttpUrl`), un chemin brut n'aurait rien
rendu : l'image visible est la preuve que l'URL signée a bien été servie.

---

- [x] **12. Une UAT de phase n'est pas tenue (05)**

**Clos le 2026-10-19** : `05-UAT.md` passe à `status: complete` — **6/6, 0
bloqué**. Le dernier item (`test-dispatch-push.sh`) a été joué sur la
production : `{"due": 1, "dispatched": true}`, puis `200 {"delivered": 3,
"failed": 0, "dropped": 0, "consumed": 1}`, `Rappel restant : 0`, nettoyage
effectué — et la **notification est arrivée**.

Le `blocked` d'origine accusait Firefox 156 (« ne déclenche jamais l'événement
push ») : c'était faux. Le navigateur recevait le message et le rejetait au
déchiffrement (`Bad encryption`, accusé `101`), parce que
`push-notify/web-push.ts` insérait un octet `0x51` absent de la RFC 8188 §2.1.
Corrigé par `d348309`.

**Clos depuis** :
- **09 PWA offline** — close le 2026-10-19 : **4 passés, 3 sautés, 0 bloqué**.
  L'item 6 (push + VAPID) a demandé de corriger la trame envoyée (`d348309`) :
  le navigateur rejetait chaque message au déchiffrement, et l'appareil n'y
  était pour rien. L'item 7 garde son critère (`delivered`, jamais `dropped`),
  avec la réserve écrite que cela ne prouve pas une réception lisible.
- **16 Recettes du foyer** — close le 2026-10-19 (**5/5** en usage réel). Les trois
  correctifs jusque-là seulement couverts par les tests automatisés sont confirmés
  en usage : partage qui réaffiche QR + lien sans régénérer et purge à l'arrêt
  (`b867382`), envoi depuis une recette qui **incrémente** la ligne existante au
  lieu de la dupliquer et sélecteur limité aux listes du foyer (`8269d72`),
  réglages ouverts en dialogue sans panneau en bas de page (`0d77842`).
- **24 Estampille de build** — close le 2026-10-19. Les trois items qui relèvent
  de la phase sont mesurés **en production** : `X-App-Version` rend exactement
  `git rev-parse 4e48b3c` à travers Traefik **puis** Cloudflare, `/version.json`
  le nomme sans cache, manifeste et `sw.js` sont en `no-cache`, smoke **6/6**
  contre la pile de prod. Le quatrième (`test-dispatch-push.sh`) ne couvre aucune
  exigence de la phase : il reste en **#1** et dans l'UAT 05, même appareil.
  Le risque `T-24-03` (transit de l'en-tête), classé `accept` au plan, est refermé
  **par la mesure**.
- **17 Mode cuisine** — close le 2026-10-18 (4/4, `status: complete`, les trois
  gaps G-17-1/2/3 résolus).

**Corrections consécutives** : les deux résumés dont l'arithmétique était
fausse ont été corrigés à leur clôture — `09-UAT.md` déclarait `issues: 0`
alors que son T3 portait `result: issue`, et son total ignorait l'item bloqué ;
`16-UAT.md` déclarait `total: 5` pour trois tests, dont deux absents du fichier,
et deux `## Gaps` placés **avant** leurs propres tests.

**Ce qu'il faut / Terminé quand** — sans objet : les deux UAT sont closes et les
deux étapes opérateur **M-01** (preuve push prod) et **M-02** (clés VAPID en
production) sont faites le 2026-10-19. Les cases des phases 8 et 9 de
`ROADMAP.md` peuvent être cochées : la phase 9 (10-notifications) n'a jamais eu
de fichier `10-UAT.md`, donc son verdict repose sur ses plans exécutés et sur la
preuve push de ce jour.

---

- [x] **13. Deux scripts d'exploitation mentent sur ce qu'ils font, et l'image ne dit pas d'où elle vient**

**Clos le 2026-10-18 par la phase 24** (« Estampille de build et scripts
d'exploitation véridiques », commits `6bf4e21`…`b95ef91`) : les trois constats
sont corrigés et **vérifiés** — le smoke lit ses trois variables dans le `.env`
de la pile (exit 1 si le fichier est absent, exit 2 s'il est présent mais
incomplet, **y compris vide**) et ne présente plus aucune invocation porteuse
de clé ; `deploy-functions.sh` énonce sa limite et nomme `sh run.sh recreate
functions` ; un unique `ARG GIT_SHA` alimente les quatre canaux d'estampille,
et sans SHA la valeur est `unknown`. Preuve : `sh scripts/check-version-stamp.sh`
→ `ESTAMPILLE DE BUILD: OK` (quatre canaux au SHA avec estampille, quatre à
`unknown` sans, les deux familles différentes). Vérification de phase : 10/10
must-haves. Le résidu qui restait ouvert — le transit de `X-App-Version` derrière
le proxy — a été **mesuré le 2026-10-19 en production** : `x-app-version` y rend
`4e48b3cdec…`, soit exactement le commit poussé, à travers Traefik **puis**
Cloudflare, et `/version.json` rend le même SHA avec `Cache-Control: no-cache`.

**Constats ouverts le 2026-10-17, pendant le déploiement de production** — ancrés, et
chacun re-vérifié ouvert au moment de les écrire :

- `scripts/smoke-functions-serveur.sh` **montrait, en tête de fichier, l'invocation
  avec le secret écrit en clair** (constat du 2026-10-17) : l'en-tête actuel
  enseigne l'invocation sans clé (`scripts/smoke-functions-serveur.sh:6-11`) et nomme
  le rôle de `SECRET_KEY` (`:27-29`). Un secret sur la ligne de commande finit dans
  l'historique du
  shell, et la documentation d'un script est faite pour être recopiée (AGENTS.md §2.7 H).
  Pire, les noms attendus (`PUBLISHABLE_KEY`, `SECRET_KEY`) **ne sont pas** ceux du `.env`
  de la pile (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) : l'écart pousse à saisir
  la valeur à la main plutôt qu'à la lire. Le bon lecteur existe déjà, deux fichiers plus
  loin (`scripts/smoke-test.sh:49-52`). Et `API` doit être la **racine**
  (`SUPABASE_PUBLIC_URL`, `supabase-project/.env.example:97`) : avec `API_EXTERNAL_URL`
  (`…/auth/v1`), les cinq vérifications rendent `404 page not found`.
  **La classe a été balayée le jour même** : `grep -rn 'smoke-functions-serveur'` sur
  `docs/`, `README.md`, `scripts/`, `app/` et `.planning/` ne trouve que **deux** copies
  de l'invocation — ce script et `docs/DEPLOIEMENT-PROD.md:146`, qui enseignait la
  même chose. La seconde est **corrigée** (lecture des valeurs depuis
  `supabase-project/.env`, `docs/DEPLOIEMENT-PROD.md:138`, avec la raison écrite
  au-dessus) ; la première l'a été par la
  phase 24 (plan 02) : le script lit lui-même les trois valeurs dans le `.env` de la
  pile, refuse tout fichier absent (exit 1) ou présent mais incomplet dont vide
  (exit 2) avant tout appel réseau, et ne présente plus aucune invocation porteuse de clé.
- `scripts/deploy-functions.sh` **copie sans recharger** et ne le dit pas. Le
  rechargement vit ailleurs (`supabase-project/run.sh:149`) ; une copie sans `recreate`
  laisse le runtime sur l'ancien code, et rien ne le signale — un succès muet.
  **Corrigé par la phase 24 (plan 02)** : l'en-tête énonce la limite, et la fin de la
  sortie nomme `sh run.sh recreate functions` — la commande réelle, pas une reformulation.
- **Rien n'estampille le SHA.** `VITE_APP_VERSION` est lu
  (`app/src/modules/parametres/components/offline-panel.tsx:19`) mais jamais injecté :
  aucun `ARG` dans `app/Dockerfile`, aucune entrée dans `.env.app.example`, aucun `LABEL`.
  Identifier ce qui était servi a demandé une enquête manuelle (`git rev-parse HEAD` du
  clone, `docker image inspect {{.Created}}`, comparaison par empreinte SHA-256 des
  ressources). Aucune version n'était fausse : aucune n'était disponible.
  **Corrigé par la phase 24 (plan 01)** : un unique `ARG GIT_SHA` de build alimente le
  bundle (`VITE_APP_VERSION`), le `LABEL org.opencontainers.image.revision`,
  `/version.json` sans cache et l'en-tête `X-App-Version` ; sans SHA la valeur est
  `unknown`, jamais `0.1.0`. La preuve est `scripts/check-version-stamp.sh`.

**Ce qu'il fallait.** Les deux corrections de script étaient de petite portée.
L'estampille était un travail à part, **mené par la phase 24** (« Estampille de
build et scripts d'exploitation véridiques », `ROADMAP.md`), qui a porté les trois
constats : une seule liste de travail, pas deux.

**Terminé le 2026-10-18** : `scripts/smoke-functions-serveur.sh` ne présente plus
aucun secret en clair, lit ses trois variables dans le `.env` de la pile et rend
**6/6** sans variable saisie à la main ; `scripts/deploy-functions.sh` énonce qu'il
copie sans recharger et nomme la commande de rechargement ; et « quelle version
tourne ? » se répond désormais par une commande sur l'image servie
(`sh scripts/check-version-stamp.sh`), sans enquête manuelle.

---

- [x] **14. Le compteur « À faire » peut compter les tâches des autres — course sur les assignations**

**Constats ouverts le 2026-10-18**, découverts pendant la porte de régression de la
phase 24, sur deux tests qui échouent **par intermittence** :

- `src/app/app-shell.test.tsx` › « ne compte que mes tâches ouvertes et celles sans
  assigné » ;
- `src/hooks/use-notifications.test.tsx` › « ne rappelle que les tâches sans assigné
  ou assignées à moi ».

**Mesuré** : 4 passages de la suite complète → **2 verts, 2 avec ces deux-là en
échec** ; 5 passages isolés des deux fichiers → **34/34 verts**. Ce n'est donc pas
du bruit : c'est une course.

**Cause identifiée.** `openTaskCount` (`app/src/app/app-shell.tsx:80-92`) lit
`taskAssigneesQuery.data ?? []` : tant que la requête d'assignation n'a pas rendu,
**toute** tâche compte comme sans assigné. Une lecture qui devance l'écriture de la
graine met en cache un tableau vide, et `use-notifications.ts:140` fait la même
lecture pour la même abstraction (même clé de requête, même `queryFn`). En test, la
graine est écrite par une autre
requête ; en production, le risque est un badge faux au premier rendu, corrigé
seulement à la revalidation suivante.

**Attribution — ce n'est pas une régression de la phase 24.** `git diff
42b76a1..HEAD -- app/src` ne touche que `offline-panel.{tsx,test.tsx}` ;
`app-shell.tsx`, `use-notifications.ts` et leurs tests sont **identiques octet pour
octet** à l'état d'avant la phase.

**Ce qu'il faut.** Trancher le fond, pas seulement le test : soit `taskAssigneesQuery`
expose son état de chargement et le compteur attend la donnée avant de rendre, soit
la requête est préremplie par ce que la graine écrit. La correction doit rendre les
deux tests **incapables d'échouer** pour cette raison, sans les rendre insensibles au
défaut qu'ils visent (`AGENTS.md` §2.7 B).

**Terminé quand** les deux tests passent 10 fois de suite en suite complète, et
qu'une preuve montre que le badge ne peut plus compter la tâche d'un autre membre —
même quand la lecture d'assignations arrive en retard.

**Cause du flake établie le 2026-10-19 : c'est le défaut lui-même.** Les deux gardes
ne mesurent pas une horloge, elles lisent une valeur **dérivée d'une lecture en vol**.
`app-shell.test.tsx` attendait un `findByLabelText` (budget par défaut : 1 s) et
`use-notifications.test.tsx` avait déjà dû relever le sien à 8 s
(`configure({ asyncUtilTimeout: 8000 })`) — deux fichiers, deux budgets, une seule
cause. Tant que la lecture n'a pas rendu, le compteur vaut « toutes les tâches sont
à moi » : le badge portait **3** (les trois tâches ouvertes hors voyage), là où une
seule lui appartient. Ce n'était donc pas une lenteur qui faisait tomber le test,
mais une valeur **fausse et parfaitement stable**.

**L'attribution de la « Cause identifiée » ci-dessus est corrigée ici.** Une lecture
qui devance l'écriture de la graine n'est **pas** le mécanisme : le flake ne dépend
d'aucune course avec l'amorçage, et il se reproduit sans elle. Ce qui reste vrai de
ce paragraphe, c'est que la même abstraction (`data ?? []`) est lue par le shell et
par la cloche.

**La politique réseau n'y est pour rien.** `onlineManager` (source installée,
`query-core`) démarre à `#online = true` **codé en dur** et ne lit **jamais**
`navigator`. `dw6` ne peut donc pas expliquer la disparition du flake, et cette
disparition ne lui est pas attribuée.

**Mesure du 2026-10-19, avant correction** : 16 tentatives sans échec (4 suites
complètes + 12 passages ciblés sous 4 brûleurs CPU) contre 2 échecs sur 4 la veille.
Le flake est rare — ce qui le rendait dangereux : il ne se signalait presque jamais.

**Second défaut, trouvé par cette investigation.** Dans
`app/src/lib/data/local-adapter.ts`, `seedNow()` marquait une table comme amorcée
**avant** son `bulkPut`. Une passe qui échouait laissait donc toutes les tables
marquées : la lecture suivante les sautait, la graine était perdue **sans un mot**,
et l'écran vide se lisait « il n'y a rien » au lieu de « l'amorçage a échoué ».
Mesuré avant correction, après une écriture refusée puis une reprise : `tasks=0`,
`task_assignees=0`, base entière à `rows=0`.

**Corrigé le 2026-10-19** (tâche `261019-n14`, commits `2a74f8b` → `0fcd2b1` pour le
compteur, `9cd3353` → `1a180a3` pour l'amorçage).

1. **Une seule couture** — `app/src/hooks/use-open-task-assignees.ts` — lue par le
   shell ET par la cloche : une requête, une clé (`['all', 'task_assignees', …]`,
   celle que les invalidations d'assignation touchent réellement), une règle.
   L'ambiguïté est portée par le **type** (union discriminée `unknown` / `known`) :
   une lecture qui n'a rien rendu ne peut plus se déguiser en tableau vide.
   `selectTasksForMember` rend `null`, le badge n'affiche rien et la cloche
   n'annonce aucune tâche ; la portée de chaque compteur est inchangée (shell :
   `a_faire` hors voyage ; cloche : non `fait` hors voyage), et la règle « sans
   assigné, ou à moi » est **la même** que celle d'`isOpenForMe` — sous une autre
   forme (des `Task` déjà construits là-bas, des lignes et une lecture
   d'assignations ici), donc deux formes pour une règle, ce qui est écrit dans le
   fichier plutôt que sous-entendu.
2. **L'amorçage marque après avoir écrit** : la marque dit « écrite », donc une passe
   qui échoue ne laisse aucune trace et la lecture suivante reprend tout. L'écriture
   reste unique (une seule `bulkPut`) et le court-circuit `already > 0` est intact.

**Preuve, rouge avant vert.** Neuf gardes rouges écrites d'abord, en deux temps :
G1-G4 (la couture et sa règle) et G6-G9 (le compteur du shell, puis la cloche, en vol
puis en erreur) avec le compteur, G11 (l'amorçage) ensuite. Le rouge porte sur la
**valeur affichée** par le code d'alors — le badge portait `3` sous préconditions
établies (tâches lues, lecture des assignations en vol ou en erreur) — jamais sur un
import manquant. Deux gardes sont vertes dès le départ, et c'est dit : G5 (la règle
sur des assignations connues, inchangée) et G12 (le court-circuit `already > 0`, que
le correctif ne devait pas emporter). Aucune assertion n'a bougé entre le rouge et le
vert ; les deux gardes existantes ont seulement changé de **mode d'attente** — elles
attendent un état du cache, plus un budget d'apparition — et leurs assertions sont
intactes.

**Ce qui remplace le critère « 10 passages complets de suite », et ce qui n'est pas
la même chose.** Sa seconde moitié est remplie : une garde montre désormais que le
badge ne peut plus compter la tâche d'un autre membre, puisqu'il n'affiche rien tant
que la lecture n'a pas abouti, et la valeur connue reste vérifiée par la garde
existante. Sa première moitié — dix suites complètes consécutives — **n'est pas
faite** : la preuve de correction n'est plus statistique mais structurelle (les
gardes échouent de façon **déterministe** sur le code d'alors, ce qui a été vu), et
l'observation sur dix suites, elle, n'a pas été menée. Elle n'est donc pas affirmée.

**Observation du 2026-10-19, non identifiée, et toujours ouverte.** Un passage complet
de `npm test` (tâche `261019-dw6`) a rapporté **1 échec**, dont le nom a été perdu :
la sortie avait été filtrée par un `tail` de l'appelant. C'est une **faute de mesure**,
pas une preuve de bruit — et elle est notée ici plutôt que passée sous silence, parce
qu'un échec inexpliqué n'est pas un succès. Trois passages complets ultérieurs sont
verts (1288/1288, 153 fichiers), et les deux fichiers ci-dessus passent **5/5 en
isolé**. L'échec est donc réel, non attribuable aux deux courses documentées, et non
reproduit. À reprendre si un passage le retrouve : la première chose à faire alors est
de **capturer la sortie entière**, jamais un `tail`.

---

- [x] **15. Hors ligne, l'application affiche « rien » au lieu de dire qu'elle n'a pas pu lire**

**Constat ouvert le 2026-10-19**, en rejouant l'UAT 09 (item 3, réécrit — voir
`09-UAT.md`, constat `G-09-etat-vide-mensonger`). Observation en usage réel,
Firefox, app déployée, `F12` → Réseau → « Hors ligne », navigation par clic :

> « quand je vais dans courses, il me dit aucune liste pour ce foyer »

Ce n'est pas une liste vide : c'est une lecture qui **n'a jamais été tentée**.
Courses avait pourtant l'erreur explicitement prévue (`ErrorState` +
« Réessayer », `courses-page.tsx:247`).

**Cause racine, prouvée.** TanStack Query 5.103.2, `networkMode` **défaut** =
`'online'` : il n'est configuré nulle part dans le dépôt. Quand `navigator.onLine`
est faux, la requête ne part pas — elle reste dans son état courant et passe en
`fetchStatus: 'paused'`. Or `isLoading = isPending && isFetching`, donc
**`isLoading` vaut `false` en pause**, et `isError` aussi. La garde
`!isLoading && !isError && rows.length === 0` s'ouvre, et la page rend son état
vide ordinaire. La documentation TanStack l'écrit noir sur blanc : « Queries can
be in `state: 'pending'`, but `fetchStatus: 'paused'` if they are mounting for the
first time, and you have no network connection. » Le dépôt ne lit **jamais**
`fetchStatus` ni `isPaused` — aucune occurrence hors tests — donc rien ne
distingue « vide » de « en pause ».

**Ce n'est pas un reste d'un ancien mode.** D-10 (2026-10-12) a retiré l'offline
volontairement, et a promis en échange que « les listes vides authentiques et les
**erreurs réseau d'origine** reviennent » (`09-CONTEXT.md:72-79`). Avec le défaut
`'online'`, ces erreurs ne reviennent pas : elles sont retenues, et remplacées par
un état vide qui a l'air normal. Le code ne tient donc pas la décision qu'il
enregistre.

**Étendue mesurée** : 10 gardes `!isLoading && !isError` dans 5 modules (Courses,
Recettes, Prestataires, Animaux, Voyages). S'y ajoute l'accueil
(`dashboard/hooks/use-dashboard.ts`), qui n'expose **aucun** état d'erreur : ses
widgets retombent sur `[]` et affichent « rien » sans le dire.

**Ce qu'il faut.** Trancher la politique, puis l'appliquer partout — les deux
voies sont défendables, et le choix est le fond du sujet :

- `networkMode: 'always'` : la requête part malgré l'absence de réseau et échoue
  comme une autre, donc l'erreur d'origine s'affiche partout sans toucher aux 10
  gardes. C'est la lecture littérale de D-10. À vérifier : le comportement du
  rejeu à la reconnexion (`refetchOnReconnect`) et le bruit visuel sur une simple
  coupure passagère ;
- distinguer « en pause » de « vide » dans l'interface (`isPaused` /`fetchStatus`) :
  plus juste pour l'utilisateur, mais chaque site doit être revu.

Au passage, deux commentaires parlent encore de la file de rejeu supprimée par
D-10 — `app/src/modules/dashboard/hooks/use-dashboard.ts:229` (« la file
rejouera ») et `app/src/app/route-preload.ts:71` (« la file de synchro »). Une
ligne chacun, même famille de résidus.

**Terminé quand** une preuve montre que, hors ligne, chaque zone concernée dit
qu'elle n'a pas pu lire au lieu d'afficher un état vide — et qu'un test rend une
page avec `navigator.onLine = false` en exigeant une **erreur**, pas un état vide
(le test doit échouer sur le code d'aujourd'hui, sans quoi il ne prouve rien).

**Corrigé le 2026-10-19** (tâche `261019-dw6`, commits `f3ee6fc`, `e07c6fd`,
`f1d5191`, `690ae9a`). La politique réseau est désormais unique et partagée —
`app/src/lib/query-policy.ts`, dont dérivent **et** `router.tsx` (le client que
l'application monte) **et** le harnais de test, ce qui rend la non-régression
honnête : elle exerce la politique réelle, pas une politique recopiée.
`networkMode: 'always'` vaut pour les requêtes **et** les mutations, et
`refetchOnReconnect` est remis explicitement à `true` (dans ce mode TanStack le
passe à `false` par défaut). Un bandeau global annonce la coupure, et il porte
seul l'explication puisque l'accueil n'a pas d'état d'erreur propre — arbitrage
explicite, pas un oubli. Les deux commentaires de la file de rejeu sont
corrigés ; le vérificateur en a trouvé un troisième de la même famille
(`use-online-status.ts`), corrigé aussi.

Les gardes sont prouvées **rouge avant vert**, et le vérificateur ne s'est pas
contenté du rapport : il a retiré `networkMode` lui-même pour voir tomber quatre
tests, puis écrit un `new QueryClient` hors politique pour voir tomber le
garde-fou textuel.

**Ce qui reste, et qu'aucun test ne peut faire : le rejeu humain.** Le test de
non-régression déclare l'état hors ligne via `onlineManager` et simule la lecture
en échec — il ne conduit jamais le vrai `navigator.onLine`. Le geste attendu est
celui du constat d'origine, cette fois dans le bon sens : Firefox, `F12` →
« Hors ligne », ouvrir Courses **à froid** → l'erreur et « Réessayer »,
jamais « Aucune liste pour ce foyer ». Cela demande un déploiement (aucune CI
dans ce dépôt).

**Second défaut, trouvé par ce rejeu** (tâche `261019-gwh`, commits `7fa4293`,
`c069437`). La politique ci-dessus corrigeait la lecture, mais le bandeau qui
devait l'expliquer était **muet sur le scénario même de ce constat** : un
démarrage à froid hors ligne. Cause, prouvée deux fois (source installée, puis
reproduction en vrai navigateur) : l'`onlineManager` de TanStack démarre à
`#online = true` **codé en dur** et ne lit **jamais** `navigator.onLine` — son
propre commentaire dit « assumes an active network connection » — il ne change
que sur un événement `online`/`offline` du document courant. Sur un chargement à
froid hors ligne, aucun événement n'arrive : l'application se croit en ligne, le
bandeau ne se rend pas, et le retour réel du réseau n'est pas un changement
d'état, donc **aucune notification** — le `refetchOnReconnect` ajouté ci-dessus
restait mort sur le chemin qu'il visait.

Corrigé par `app/src/lib/online-status.ts` : une fonction `seedOnlineStatus()`
pose l'état initial depuis `navigator.onLine`, appelée **une fois** au bootstrap
(`app/src/main.tsx`) avant le rendu. Un module dédié, et non un effet de
composant, parce que l'état doit être juste avant que `QueryClientProvider`
n'appelle `queryClient.mount()` — c'est cet abonnement qui rend le retour du
réseau notifiable. Quatre gardes, rouges avant vert ; le vérificateur a
**reproduit les quatre rouges lui-même** et confirmé que le fichier de test est
**identique** entre le commit rouge et le commit vert. Sa limite est dite : la
garde de l'appel au bootstrap est **textuelle**, elle attrape le retrait de
l'appel, pas une ligne commentée ni un déplacement. Vérifié hors ligne dans un
vrai navigateur : bandeau **absent** au rechargement avant le correctif, présent
après.

**Observation non élucidée, à ne pas confondre avec un cache applicatif.**
Pendant ce même rejeu, avec le cache du navigateur laissé actif, la liste
**réelle** est apparue hors ligne. Courses ne lit que le backend — le code a été
vérifié, il n'existe aucun repli local — donc une donnée réelle hors ligne ne
peut venir que du cache du navigateur. C'est une **piste, pas une conclusion** :
elle n'a pas été mesurée. Le rejeu doit garder « Désactiver le cache » **coché**,
comme le constat d'origine.

**Clos le 2026-10-19 par le rejeu humain.** Le rejeu a été fait sur
l'application déployée, et le build déployé a été **vérifié avant de conclure** :
`x-app-version` rend `022fca62daf98e9e3d41f589baa5b813f78a38b1`, soit exactement
le commit poussé, et le bundle servi porte l'amorçage (`navigator.onLine`) comme
la politique (`networkMode: 'always'`). Le rejeu est donc attribuable à un build
précis, et non à un « quelque chose de plus récent ». Les deux correctifs ont
donc été livrés ensemble : la lecture dit qu'elle a échoué, le bandeau dit
pourquoi dès le premier rendu, et le retour du réseau recharge sans
rechargement de page.

---

- [x] **16. Trois écrans affichent « sans assigné » tant que la lecture des assignations n'a pas rendu**

**Suite de #14**, trouvée en corrigeant la couture, et **volontairement non
traitée** : trois autres sites lisent les assignations avec `?? []`. Aucun n'est un
compteur d'appartenance, mais tous affirment la même chose fausse pendant la
lecture.

- `app/src/modules/taches/hooks/use-taches.ts:150` —
  `buildTasks(rows, assigneesQuery.data ?? [], remindersQuery.data ?? [], members)` :
  les lignes de la page Tâches, et `taskMetrics.assigneeCount` ;
- `app/src/modules/calendrier/hooks/use-calendrier.ts:138` —
  `const assignees = (assigneesQuery.data ?? [])…` dans le memo `tasks` : les tâches
  affichées au calendrier (pas les événements) ;
- `app/src/modules/voyages/components/trip-tasks-tab.tsx:76` — le regroupement
  d'assignés de l'onglet Tâches d'un voyage, exactement la même forme que
  `use-notifications.ts:138-146` avant #14.

**Conséquence commune** : « sans assigné » est affiché pour des tâches qui en ont,
tant que la lecture est en vol (et, en erreur, définitivement).

**Ce qui reste à décider — c'est la raison pour laquelle ce n'est pas fait** : ce
qu'affiche une **ligne** de tâche quand les assignés sont inconnus. La couture de
#14 répond « rien », et c'est lisible pour un compteur et pour une alerte ; pour une
ligne, l'absence d'avatar est indiscernable d'un « personne n'est assigné ». La
réponse demande un état de ligne explicite (placeholders, « … », ou attente du
rendu), donc un arbitrage d'interface, pas un correctif mécanique.

**Terminé quand** les trois sites distinguent « personne » de « on ne sait pas »,
chaque garde échouant sur le code d'aujourd'hui — la forme de l'attente étant
`waitForQueryStatus` (`app/src/test/render.tsx`), pas un délai.

**Clos le 2026-10-19**, sur la forme choisie en usage réel : **des pastilles
d'attente**. `PendingAssignee` (`app/src/components/shared/pending-assignee.tsx`)
reprend le gabarit de `MemberAvatar` — rond en pointillés, `role="img"`, libellé
« Assignation en cours de chargement » — et ne paraît que tant que la lecture
n'a pas rendu (`isSuccess` faux, **erreur comprise** : l'ignorance ne se dégrade
pas en « personne »). Sur la page Tâches, le compteur « Membres » affiche « … »
au lieu de 0.

Quatre tests, tous vus **rouges** sur le code d'avant : `task-row.test.tsx`,
`agenda-list.test.tsx`, `trip-tasks-tab-pending.test.tsx` (la lecture est
retenue par une promesse qui ne se résout jamais, seule façon d'observer l'état
sans course — `waitForQueryStatus` attend un état **établi** et ne peut donc pas
décrire l'intervalle qui nous intéresse) et `types.test.ts` (le drapeau traverse
bien `buildTasks`).

---

## Plus tard

- **4. Le parcours humain (rappels de tâche) n'a jamais été fait.** Parké le
28/09 : les rappels ne se déclenchent pas du tout en usage (rien n'arrive,
pas seulement un défaut d'affichage). À rouvrir avec, dans l'ordre : le
rappel est-il créé en base (`task_reminders`) ? la fenêtre du dispatch le
couvre-t-elle ? le push part-il (`delivered`, voir #1) ? Voir l'historique
dans git (`TODO.md`).

---

## Ouvert, consigné pendant l'UAT des notifications

- [x] **17. Ouvrir Messages solde un fil qu'on n'a pas ouvert**

`app/src/modules/messages/messages-page.tsx:32-38` choisit d'office
`conversations[0]` quand rien n'est sélectionné, et `:42-44` marque lu tout
`activeId` — y compris celui-là, dès le montage de la page. Le fil le plus
récent perd donc son badge et sa ligne de cloche au simple fait d'ouvrir
Messages, sans avoir été lu. Sous 650 px, `listVisible` démarre à `true` : la
liste est affichée et le fil pourtant déjà soldé — le geste est invisible.

Le fautif n'est pas le marquage à l'ouverture, qui est voulu (D-02), mais la
**sélection implicite** qui le déclenche. Vu en usage réel le 2026-10-19
pendant l'UAT des notifications, et non consigné à ce moment-là.

**Terminé quand** ouvrir Messages ne solde plus rien tant qu'aucune
conversation n'a été choisie, et que la ligne de cloche d'un fil subsiste tant
qu'il n'a pas été ouvert.

**Clos le 2026-10-19** : `messages-page.tsx` ne retombe plus sur
`conversations[0]`, donc `markRead` ne s'exécute qu'après un choix explicite ;
le panneau vide dit « Choisissez une conversation » au lieu d'« Aucune
conversation », qui décrivait un foyer sans fil. Test : « ouvrir Messages ne
solde aucun fil tant qu'aucune conversation n'est choisie (TODO #17) », vu
rouge sur l'ancien code (le fil s'ouvrait et se soldait sans clic).

---

- [x] **20. Deux personnes d'un même navigateur se partagent leurs marques de lecture**

`app/src/lib/notification-reads.ts` rangeait la marque locale sous une clé
unique (`ensemble-organises-messages-read`, `…-cercle-read`), sans le compte :
le second utilisateur d'un navigateur partagé héritait des lignes soldées par
le premier, et la cloche lui masquait ce qu'il n'avait jamais lu. Le masquage
des rappels (`use-notifications.ts`, `eo-notifications-masquees-v1`) avait
exactement le même défaut. C'est la classe que l'enquête de G-10-7 avait
frôlée : une marque locale qui ne dit pas à qui elle appartient.

**Clos le 2026-10-19** : la clé porte le compte (`localReadKey(base, userId)`,
`:anonyme` sans session) et le masquage suit la même règle
(`maskedStorageKey`). Les deux relisent leur carte au changement de compte dans
le même onglet ; sans cela, l'état du précédent restait en mémoire. Les clés
nues antérieures ne sont pas reprises, et c'est voulu : elles mélangeaient les
comptes. Conséquence assumée pour l'existant — une marque locale perdue est
recalculée depuis le serveur (`notification_reads`), et les rappels masqués
avant la mise à jour réapparaissent une fois, puisque le masquage est local.

Quatre gardes, toutes vues rouges sur le code d'avant : trois dans
`notification-reads.accounts.test.tsx` (clé du compte, non-héritage au
changement, relecture de la marque du compte qui prend la session) et une pour
les masques dans `use-notifications.test.tsx`. Les tests qui lisaient la clé
nue lisent désormais les clés exportées par le code, plutôt que d'en recopier
la forme.

---

## Ouvert, consigné pendant la preuve d'usage des liens invités

- [x] **18. Le code de partage d'une liste de cadeaux disparaît à la fermeture — et le message accuse le mauvais appareil**

`app/src/modules/cadeaux/components/gift-share-dialog.tsx:82` garde le code brut
dans un `useState`. Fermer la boîte le perd définitivement : la base ne garde
que `gift_list_invites.token_hash` (`gift-list-invite/index.ts:598`), donc rien
ne peut le réafficher. La boîte dit alors « Code actif créé ailleurs :
régénérez pour l'afficher sur cet appareil » (`:224-232`) — **créé ailleurs**
alors qu'il vient d'être créé ici même. Régénérer invalide le lien déjà
transmis, pour une raison qui n'a rien à voir avec la sécurité.

L'Ardoise a déjà tranché ce point : `ardoise-detail-page.tsx:481-493` mémorise
le code brut dans `localStorage` (`eo:ardoise-code:<id>`), et le commentaire
`:478-480` dit pourquoi (le serveur ne conserve que l'empreinte). Le formulaire
cadeau n'a pas suivi ; c'est la même situation, pas une décision différente.

**Terminé quand** créer un code, fermer la boîte et la rouvrir sur le même
appareil réaffiche le code et son lien, tandis qu'un code créé sur un autre
appareil demande toujours une régénération — et que le libellé ne dit « créé
ailleurs » que dans ce second cas.

**Clos le 2026-10-20** : mémorisé par liste dans `localStorage`
(`eo:cadeaux-code:<id>`) et purgé quand le résumé serveur dit qu'il n'y a plus
de code. Le panneau distingue un chargement de résumé en vol (`summaryBusy`) :
sans cette garde, le résumé d'avant la génération — `hasCode: false` — aurait
purgé le code tout juste créé. Deux tests le tiennent : fermeture puis
réouverture dans la boîte, et le parcours de la page (`cadeaux-page.test.tsx`)
réécrit, qui affirmait l'ancien contrat.

---

- [x] **19. Une photo ajoutée à un article cadeau est stockée en `data:` — l'invité ne la verra jamais**

`app/src/modules/cadeaux/components/gift-form-dialog.tsx:36-55` (`readPhoto`)
encode la photo choisie en `data:` URL, et `submit` la transmet telle quelle :
`cadeaux-page.tsx:172` l'écrit dans `gift_items.photo_url`. Or la surface
invitée ne sert que des chemins bornés au foyer — `0128` rend `null` pour toute
autre forme, et `gift-list-invite/index.ts:865` ne signe qu'un chemin. Un
article dont la photo vient du formulaire n'a donc **jamais** d'image chez
l'invité, quel que soit le soin visible côté membre.

Le seul chemin qui produit un chemin de bucket est la promotion d'une idée
(`cadeaux-page.tsx:199` dépose, `:283-285` recopie `photoStored`) : c'est le
seul cas où `guest-cadeau-page.tsx:371` sert quelque chose. Deux surfaces se
contredisent donc sur ce que signifie `photo_url` pour un article.

**Ce qu'il faut trancher** : déposer les photos d'articles comme celles des
idées (`depositHouseholdFile`, dossier `cadeaux`, `storedValueOf` à l'écriture,
`replacedMediaPath` au remplacement) — c'est ce que la surface invitée
suppose ; ou assumer qu'un article ne porte pas de photo servie et retirer la
branche `<img>` de la page invitée, avec la raison écrite. Le `data:` en
colonne texte a un second coût, indépendant de la question : ni déduplication
ni nettoyage.

**Terminé quand** les deux surfaces disent la même chose et qu'un test le
tient : soit une photo ajoutée par le formulaire d'article sort signée chez
l'invité, soit la page invitée ne prétend plus en afficher une.

**Clos le 2026-10-20**, en faveur du dépôt : le formulaire remet un `File`, la
page le dépose (`depositHouseholdFile`, dossier `cadeaux`) et enregistre le
chemin de colonne, comme pour les idées ; « Retirer » efface la photo. Deux
tests : création (le chemin part en colonne, jamais une URL signée ni un
`data:`) et remplacement (l'ancien objet est retiré, jamais le nouveau). La
page invitée n'a pas eu à changer — elle attendait déjà un chemin, c'est le
formulaire qui ne le lui donnait pas.

---

## Ouvert, consigné pendant la livraison de 0131

- [ ] **21. Un fil dont le dernier membre a supprimé sa ligne reste en base**

`delete_conversation_for_me` (0131) efface **une** ligne d'appartenance. Quand
c'est celle du dernier membre, la conversation disparaît de toutes les listes —
la visibilité dérive de l'appartenance — mais la ligne `conversations` et ses
`messages` subsistent : personne ne peut plus les atteindre, ni les relire, ni
les purger depuis l'application.

Ce n'est pas une fuite : la RLS les rend invisibles. C'est une ligne morte, et
un écart entre ce que le geste annonce (« supprimer pour vous ») et ce qu'il
laisse quand on est seul — le fil était alors l'échange privé de deux
personnes, et il reste en base.

**Terminé quand** la décision est prise et appliquée : soit la suppression de
la dernière appartenance emporte le fil et ses messages, soit la conservation
est assumée et écrite (durée, purge, base légale). Le test `0131` §9 prouve
aujourd'hui l'état actuel — zéro appartenance, ligne conservée — pour que le
changement se voie dans la suite SQL.

---

## Décidé, sans action

**Les listes de privilèges en dur restent.** Elles ne sont pas redondantes avec
le contrôle exhaustif de `0001` §7 bis : elles affirment une troisième chose
qu'il ne regarde pas — que `service_role` **peut** exécuter. C'est la moitié
positive du contrat, et c'est elle qui fait fonctionner les Edge Functions et
les jobs `pg_cron`. Revoquer `service_role` sur `dispatch_birthday_alerts` ne
casserait aucun test d'ici, et casserait le job de 06 h 40. La raison est
écrite dans le fichier de test.

---

## Validé, pour mémoire

Ce qui est établi et ne se re-discute pas, afin qu'on ne le recherche pas
encore :

- les sept suites SQL passent, contrôle exhaustif des privilèges inclus ;
- la chaîne « base → Edge Function → service Push » est validée **consommation
  comprise**, et reproductible ;
- le nettoyage du script de dispatch est vérifié par comptage, plus muet ;
- l'empreinte de l'abonnement en base correspond à celle du navigateur ;
- le bundle déployé contient l'écouteur `push` ;
- `showNotification` fonctionne depuis la console.
