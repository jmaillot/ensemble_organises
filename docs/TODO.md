# Travaux en cours

Liste de ce qui reste à faire sur le dépôt, avec l'état réel de chaque point.
Elle est courte, et c'est volontaire : une liste qui grossit est une liste que
personne ne lit.

Chaque entrée porte ce qu'il faut pour la reprendre à froid : ce qui est à
faire, pourquoi, et **comment vérifier que c'est fini**. Un travail sans
critère de fin n'est pas terminé, il est en cours.

Dernière mise à jour : 19 octobre 2026.

---

- [ ] **1. L'affichage des notifications, à revalider sur mobile**

**Établi le 28/09 : la remise fonctionne** (snippet 40 s → `NOTIFICATION
REÇUE`). Le silence venait de deux couches : abonnement navigateur disparu
(`getSubscription() → null`, `granted` pourtant) pendant que le serveur
gardait l'orphelin — *`delivered` signifie « accepté par le service »,
jamais « reçu »* — puis remplacement silencieux même tag (pas de `renotify`
dans `sw.ts`, corrigé + typé, en attente de rebuild).
**Mis de côté à la demande : retest sur mobile au moment opportun**
(bannière au 1er envoi, puis seconde bannière au renvoi même tag).

**Qui peut le faire : l'utilisateur.** C'est le seul point bloquant.

**Ce qui est établi.** Le chemin « base → Edge Function → service Push » est
validé et reproductible par `sh scripts/test-dispatch-push.sh` : rapport
`{ notifications: 1, delivered: 1, failed: 0, dropped: 0, consumed: 1 }`, et la
ligne de rappel supprimée de `public.task_reminders`. Côté navigateur,
l'abonnement existe, l'empreinte de l'endpoint correspond à celle de la base
(`dfd1d16ba4985a4d`), le bundle déployé contient l'écouteur `push`, et
`showNotification` appelé depuis la console affiche bien une bannière.

**Ce qui ne l'est pas.** Qu'un `push` atteigne réellement le service worker.
`delivered: 1` signifie que Mozilla a *accepté* l'envoi en file, pas qu'il a
été distribué. La nuance est écrite dans `docs/BACKEND.md` §6.6, et j'en ai
fait une étape d'une chaîne « validée de bout en bout » alors que seule la
remise l'était.

**Comment trancher.** Dans la console Firefox, sur la page de l'application,
puis cliquer « Envoyer un test » dans les 40 secondes :

```js
(async () => {
  const r = await navigator.serviceWorker.ready;
  let vus = 0;
  const t = setInterval(async () => {
    const ns = await r.getNotifications({ includeInvisible: true });
    if (ns.length > vus) {
      vus = ns.length;
      console.log('NOTIFICATION REÇUE ->', ns.map(n => n.title));
    }
  }, 500);
  setTimeout(() => {
    clearInterval(t);
    console.log('fin. notifications aperçues :', vus);
  }, 40000);
})()
```

- `NOTIFICATION REÇUE` → la remise fonctionne, et le problème est
  l'affichage par GNOME. Aucun correctif côté dépôt.
- `0` → le `push` n'arrive pas. `about:debugging` → Service Workers →
  Inspecter → Console : un `push` reçu y apparaîtrait, et son absence est la
  preuve.

**Terminé quand** le point 4 a été fait, ou que la remise est prouvée.

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

- [ ] **11. Les correctifs de liens invités (phases 21 à 23) sont en production — reste la preuve d'usage**

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

---

- [ ] **12. Deux UAT de phase ne sont pas tenues (05, 09)**

**Ce qui est fait.** Le code de ces phases est livré et vérifié, mais
leurs fichiers `NN-UAT.md` sont restés en `status: testing`. Il reste à jouer :

- **05 Cadeaux & contacts** — 1 test bloqué (5 passés sur 6) ;
- **09 PWA offline** — **4** tests en attente (sur 7 : 1 passé, 1 sauté, 1 en
  `issue`, 4 en attente).

**Clos depuis** :
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

**Corrections consécutives** (le 2026-10-18) : le résumé de `09-UAT.md`
déclarait `issues: 0` alors que son T3 porte `result: issue` — arithmétique
fausse à corriger à la clôture ; celui de `16-UAT.md` déclarait `total: 5`
pour trois tests, dont deux absents du fichier et deux `## Gaps` placés
**avant** leurs propres tests — reconstruit (5 sections réelles).

**Ce qu'il faut.** Jouer les scénarios restants sur un vrai appareil, puis
passer chaque fichier en `complete`. Les deux étapes opérateur **M-01** (preuve
push prod) et **M-02** (clés VAPID en production) se jouent dans le même
mouvement ; leur checklist est dans `docs/PWA.md` §« Exploitation push ».

**Qui peut le faire : l'utilisateur.** C'est le seul point bloquant, avec #11.

**Terminé quand** les trois `NN-UAT.md` sont clos et que `M-01`/`M-02` sont
faits — alors les cases des phases 8 et 9 de `ROADMAP.md` peuvent être cochées.

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

- [ ] **14. Le compteur « À faire » peut compter les tâches des autres — course sur les assignations**

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

---

- [ ] **15. Hors ligne, l'application affiche « rien » au lieu de dire qu'elle n'a pas pu lire**

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

---

## Plus tard

- **4. Le parcours humain (rappels de tâche) n'a jamais été fait.** Parké le
28/09 : les rappels ne se déclenchent pas du tout en usage (rien n'arrive,
pas seulement un défaut d'affichage). À rouvrir avec, dans l'ordre : le
rappel est-il créé en base (`task_reminders`) ? la fenêtre du dispatch le
couvre-t-elle ? le push part-il (`delivered`, voir #1) ? Voir l'historique
dans git (`TODO.md`).

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
