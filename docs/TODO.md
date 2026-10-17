# Travaux en cours

Liste de ce qui reste à faire sur le dépôt, avec l'état réel de chaque point.
Elle est courte, et c'est volontaire : une liste qui grossit est une liste que
personne ne lit.

Chaque entrée porte ce qu'il faut pour la reprendre à froid : ce qui est à
faire, pourquoi, et **comment vérifier que c'est fini**. Un travail sans
critère de fin n'est pas terminé, il est en cours.

Dernière mise à jour : 17 octobre 2026.

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

- [ ] **12. Quatre UAT de phase ne sont pas tenues (05, 09, 16, 17)**

**Ce qui est fait.** Le code de ces quatre phases est livré et vérifié, mais
leurs fichiers `NN-UAT.md` sont restés en `status: testing`. Il reste à jouer :

- **05 Cadeaux & contacts** — 1 test bloqué (5 passés sur 6) ;
- **09 PWA offline** — 5 tests en attente (1 passé, 1 sauté, sur 7) ;
- **16 Recettes du foyer** — 2 tests en attente (0 passé sur 5 ; 4 constats
  consignés dans `## Gaps`) ;
- **17 Mode cuisine** — 1 test en attente (3 passés sur 4).

**Ce qu'il faut.** Jouer les scénarios restants sur un vrai appareil, puis
passer chaque fichier en `complete`. Les deux étapes opérateur **M-01** (preuve
push prod) et **M-02** (clés VAPID en production) se jouent dans le même
mouvement ; leur checklist est dans `docs/PWA.md` §« Exploitation push ».

**Qui peut le faire : l'utilisateur.** C'est le seul point bloquant, avec #11.

**Terminé quand** les quatre `NN-UAT.md` sont clos et que `M-01`/`M-02` sont
faits — alors les cases des phases 8 et 9 de `ROADMAP.md` peuvent être cochées.

---

- [ ] **13. Deux scripts d'exploitation mentent sur ce qu'ils font, et l'image ne dit pas d'où elle vient**

**Constats ouverts le 2026-10-17, pendant le déploiement de production** — ancrés, et
chacun re-vérifié ouvert au moment de les écrire :

- `scripts/smoke-functions-serveur.sh:6-7` et `:27` **montrent l'invocation avec le
  secret écrit en clair**. Un secret sur la ligne de commande finit dans l'historique du
  shell, et la documentation d'un script est faite pour être recopiée (AGENTS.md §2.7 H).
  Pire, les noms attendus (`PUBLISHABLE_KEY`, `SECRET_KEY`) **ne sont pas** ceux du `.env`
  de la pile (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) : l'écart pousse à saisir
  la valeur à la main plutôt qu'à la lire. Le bon lecteur existe déjà, deux fichiers plus
  loin (`scripts/smoke-test.sh:49-52`). Et `API` doit être la **racine**
  (`SUPABASE_PUBLIC_URL`, `supabase-project/.env.example:97`) : avec `API_EXTERNAL_URL`
  (`…/auth/v1`), les cinq vérifications rendent `404 page not found`.
  **La classe a été balayée le jour même** : `grep -rn 'smoke-functions-serveur'` sur
  `docs/`, `README.md`, `scripts/`, `app/` et `.planning/` ne trouve que **deux** copies
  de l'invocation — ce script et `docs/DEPLOIEMENT-PROD.md:130-131`, qui enseignait la
  même chose. La seconde est **corrigée** (lecture des valeurs depuis
  `supabase-project/.env`, avec la raison écrite au-dessus) ; reste la première.
- `scripts/deploy-functions.sh` **copie sans recharger** et ne le dit pas. Le
  rechargement vit ailleurs (`supabase-project/run.sh:149`) ; une copie sans `recreate`
  laisse le runtime sur l'ancien code, et rien ne le signale — un succès muet.
- **Rien n'estampille le SHA.** `VITE_APP_VERSION` est lu
  (`app/src/modules/parametres/components/offline-panel.tsx:12`) mais jamais injecté :
  aucun `ARG` dans `app/Dockerfile`, aucune entrée dans `.env.app.example`, aucun `LABEL`.
  Identifier ce qui était servi a demandé une enquête manuelle (`git rev-parse HEAD` du
  clone, `docker image inspect {{.Created}}`, comparaison par empreinte SHA-256 des
  ressources). Aucune version n'était fausse : aucune n'était disponible.

**Ce qu'il faut.** Les deux corrections de script sont de petite portée. L'estampille est
un travail à part, **ouvert comme phase 24** (« Estampille de build et scripts
d'exploitation véridiques », `ROADMAP.md`) et porte les trois constats : une seule liste
de travail, pas deux.

**Terminé quand** `scripts/smoke-functions-serveur.sh` ne présente plus aucun secret en
clair, lit ses trois variables dans le `.env` de la pile et passe **6/6** sans variable
d'environnement saisie à la main ; `scripts/deploy-functions.sh` énonce qu'il copie sans
recharger et nomme la commande de rechargement ; et l'image frontend permet de nommer le
SHA du dépôt construit **sans enquête manuelle** (preuve : la commande qui l'obtient,
exécutée sur l'image servie).

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
