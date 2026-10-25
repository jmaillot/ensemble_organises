---
status: complete
phase: 09-pwa-offline
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-10-09T00:00:00Z
updated: 2026-10-19T00:00:00Z
---

## Current Test

[testing complete — 4 items passés, 3 sautés, 0 bloqué]

## Tests

### 1. Install Android (09-02)
expected: "Installer l'app" button → standalone launch, correct icon.
result: pass
note: "Rejoué le 2026-10-09. Le bouton vit désormais dans Paramètres → « Données et mode de fonctionnement » (le panneau n'a plus de nom « hors ligne », cf. item 5)."

### 2. Install iPhone (09-02)
expected: Share → Home Screen → standalone launch, iOS limitations noted.
result: skipped
reason: "No iPhone available to test."

### 3. Hors ligne — l'erreur s'affiche, jamais un écran muet
expected: |
  Connexion coupée (mode avion, ou « Offline » dans les outils du navigateur) :
  1) ouvrir une zone non encore chargée dans cette session → erreur explicite
  avec un bouton « Réessayer », pas une liste vide sans explication ;
  2) tenter d'ajouter un article à une liste → un message d'erreur apparaît et
  la ligne n'est pas présentée comme enregistrée ;
  3) Paramètres → « Données et mode de fonctionnement » énonce qu'une connexion
  est nécessaire.
result: pass
reported: "si je fais les 5 etapes, quand je vais dans courses, il me dit aucune liste pour ce foyer"
severity: major
note: |
  **Rejoué en usage réel le 2026-10-19** (Firefox, app déployée, fenêtre normale,
  `F12` → Réseau → « Hors ligne », navigation par clic). Courses affiche
  **« Aucune liste pour ce foyer »** — l'état vide ordinaire — au lieu de l'erreur
  prévue par le code (`ErrorState` + « Réessayer », `courses-page.tsx:247`).
  Ce n'est pas la page qui est en cause : **la requête n'a jamais été tentée**.
  Voir le gap ci-dessous, cause racine prouvée.
note_rewrite: |
  **Item réécrit le 2026-10-19** avant rejeu. Le constat d'origine
  (`result: issue`, 2026-10-09) portait : « En avion sans visite préalable (cache
  vide) : liste vide muette, rien du serveur (normal), et l'ajout en file peu
  visible. » Il est **clos par décision** — D-10 a retiré la file et les états
  hors ligne, donc l'attente d'origine n'a plus d'objet. La question a été
  retournée : non plus « montrer la file », mais « ne pas faire semblant ».
  Et c'est précisément là que ça échoue encore, pour une raison différente.
  L'observation est d'autant plus solide qu'elle a été faite **après** avoir écarté
  deux fausses pistes : fenêtre privée (`privateBrowsingId=1`, où service worker
  et cache sont jetés en fin de session) puis service worker « Arrêté » (simple
  sommeil d'inactivité). Le service worker déployé précache bien `index.html`
  (100 entrées, repli de navigation enregistré) — l'app s'ouvre, donc l'écran muet
  n'est pas un problème de PWA.
result_note: |
  **Rejoué le 2026-10-19 et concluant, sur l'application déployée.** Le build a
  été vérifié **avant** de conclure, pour que le rejeu soit attribuable :
  `x-app-version` rend `022fca62daf98e9e3d41f589baa5b813f78a38b1`, exactement le
  commit poussé, et le bundle servi porte l'amorçage de l'état réseau
  (`navigator.onLine`) comme la politique (`networkMode: 'always'`). Hors ligne,
  avec « Désactiver le cache » coché comme dans le constat d'origine, Courses dit
  qu'il n'a pas pu lire au lieu d'afficher « Aucune liste pour ce foyer », et le
  bandeau annonce la coupure **dès le rechargement**.

  Le `result: issue` et le `reported:` ci-dessus **ne sont pas réécrits** : ils
  décrivent ce qui a été mesuré le jour du constat. C'est le champ `result` qui
  porte l'état courant, et il vaut `pass` parce que le rejeu a eu lieu — la
  raison pour laquelle le gap était resté `failed` (rejeu non fait) a disparu.

### 4. Rejeu des écritures hors ligne (09-01) — RETIRÉ
expected: (sans objet — fonctionnalité retirée)
result: skipped
reason: "Retiré par D-10 (2026-10-12, à la demande de l'utilisateur pendant cette UAT) : plus de file, plus de rejeu à la reconnexion, plus de toast de synchronisation. Le comportement décrit n'existe plus dans l'application ; il n'y a rien à rejouer."

### 5. Honnêteté du panneau hors ligne (09-01) — RETIRÉ
expected: (sans objet — panneau réécrit)
result: skipped
reason: "D-10 a réécrit le panneau : plus d'« en attente », plus de « dernière synchro », plus de bannière. Il s'appelle « Données et mode de fonctionnement » et affiche le mode de données, la version de build et l'exigence de connexion (`app/src/modules/parametres/components/offline-panel.tsx`). L'attente d'origine (« Pending visible even online, last sync shown ») porte sur des éléments qui ont été supprimés volontairement."

### 6. Push + VAPID (M-02)
expected: clés VAPID dans le `.env` de la pile + `recreate functions`, notifications activées, push reçu sur l'appareil.
result: pass
reason: "Notification **affichée sur l'appareil le 2026-10-19**, après déploiement du correctif de trame (`d348309`). La cause du blocage était dans le dépôt, pas sur l'appareil : voir ci-dessous. Même appareil que l'item 7 et que l'item bloqué de l'UAT 05."

L'exploitation et l'enregistrement sont faits (mesurés le 2026-10-19 sur la
production, `ubuntu1:/docker/ensemble_organises`) : trois occurrences `VAPID`
dans le `.env`, **trois vues par le conteneur `functions`** (donc recréée depuis,
puisque c'est `docker-compose.local.yml` qui les injecte), et les deux secrets
`project_url` + `service_role_key` présents dans Vault depuis le 26/09.

Côté appareil, `push_subscriptions` contient **quatre abonnements réels** (vrais
`user_agent`, aucun endpoint factice), dont le dernier créé **ce jour** —
*Firefox · Linux*. « Notifications activées » est donc acquis.

**Ce qui manque est le dernier mot de l'attendu : « push reçu sur
l'appareil ».** Deux envois y ont pourtant été acheminés le 2026-10-19
(`13:23:35Z` par le bouton de test du panneau, `13:24:38Z` par le script) : trois
abonnements sont passés à `last_success_at = 13:23:35Z`, et la réponse de la
fonction pour le second porte `delivered: 3, failed: 0, dropped: 0`. Le
**transport** est donc prouvé ; l'**affichage** ne l'est pas — aucune bannière ni
toast n'a été observé.

C'est le reçu du service worker qui tranchera, et il dit trois choses
différentes : absent → le push n'est jamais arrivé jusqu'au worker ; `shown:
false` avec `error` → arrivé, affichage refusé ; `affiché` → arrivé et affiché,
et c'est alors le canal in-app qu'il faut regarder. Il se lit dans
`Paramètres → Notifications` sous « Dernier push reçu » — **au chargement de la
page**, donc après un rechargement — ou directement dans
`DevTools → Application → Cache Storage → eo-push-log → /__push_last__`.

Vérifié depuis l'extérieur, pour que l'absence d'affichage ne soit pas mise au
compte d'un build ancien : le `sw.js` déployé porte `renotify` (le correctif de
`TODO #1`) et le bundle servi porte le relais `EO_PUSH` vers la page **et** la
lecture du reçu. Le chemin d'affichage est donc en ligne. `TODO #1` reste ouvert
malgré cela : il porte le cas d'un appareil dont l'abonnement navigateur a
disparu, que ce reçu ne couvre pas.

**Cause trouvée le 2026-10-19 — elle est dans ce dépôt.** Le journal du
navigateur (`dom.push.loglevel = Debug`) montre le message **arriver**, puis
être rejeté : `PushService: receivedPushMessage()` → `decryptAndNotifyApp:
Error decrypting message … Error: Bad encryption` → accusé `"code":101`. Le
worker n'est donc jamais réveillé, ce qui explique à la fois l'absence de reçu
et l'absence de notification. La trame envoyée insérait un octet `0x51` entre
l'en-tête et le chiffré, que la RFC 8188 §2.1 ne prévoit pas : le récepteur
lisait le chiffré un cran trop tôt, et l'authentification AEAD échouait. Le
test du vecteur RFC 8291 ne l'avait pas vu parce que son corps attendu était
celui de la RFC **avec cet octet inséré** — 145 octets au lieu des 144 publiés :
il comparait l'implémentation à elle-même.

Corrigé et poussé le 2026-10-19 (`d348309`, `05e21f1`) ; le test reprend les
144 octets publiés et a été **vu rouge** sur l'ancien code (`expected 144 but
got 145`). Déployé sur la production, puis **notification reçue et affichée sur
l'appareil** : c'est le premier push de ce projet qui franchit réellement le
déchiffrement du navigateur.

**Ce que le défaut impliquait.** `web-push.ts` a été créé le 26/09 (`6bbfbbf`)
avec cet octet : depuis cette date, aucun message émis par l'application n'était
déchiffrable, sur aucun appareil. Un `201` et un compteur `delivered` ne
pouvaient donc jamais valoir « reçu » — seule l'observation du navigateur le
pouvait, et elle manquait.

### 7. Dispatch-push proof (M-01)
expected: `test-dispatch-push.sh` avec un appareil réellement abonné → `delivered`, jamais `dropped`.
result: pass
reason: "Le script exige un abonnement push réel et s'arrange pour le dire : un endpoint factice produit `dropped`, donc un chiffre juste et une preuve fausse. Également listé dans l'UAT 05 et dans TODO #1."

Rejoué le 2026-10-19 sur la production, avec quatre abonnements réels en base —
la condition que le script exige, et qui manquait jusque-là. Sortie :

```
  Rapport       {"due": 1, "dispatched": true, "generated_at": "2026-10-19T13:24:38.75929+00:00"}
  Réponse       200  {"scope":"rappels","notifications":1,"delivered":3,"failed":0,"dropped":0,"consumed":1}
  Rappel restant : 0
  Nettoyage     tâche et rappel supprimés.
  OK            base → Edge Function → service Push, et retour consommé.
```

Les trois faits que le script vérifie y sont, plus le nettoyage : `due: 1` (le
dispatch de la fonction est bien celui du script, pas un job `pg_cron`
intercurrent), `consumed: 1` (la boucle se ferme : le rappel ne se répétera pas),
`delivered: 3` avec **`dropped: 0`** — la preuve demandée porte sur `delivered`,
jamais sur un chiffre que seul un endpoint factice expliquerait. La tâche et le
rappel semés ont été supprimés, et la base le confirme (`Rappel restant : 0`).

**Ce que `delivered` ne disait pas** : le même journal qui a établi la cause de
l'item 6 montre que ces messages, acceptés par le service, étaient ensuite
rejetés par le navigateur au déchiffrement. Le critère de cet item — le service
accepte, rien n'est `dropped` — est bien rempli, mais il ne prouve pas qu'un
message soit lisible. La preuve d'un push réellement reçu reste celle de
l'item 6.

## Summary

total: 7
passed: 4
issues: 0
pending: 0
skipped: 3
blocked: 0

Trois items retirés ou réécrits le 2026-10-19 après vérification du code : les
items 4 et 5 testaient un mode offline supprimé par D-10 le 2026-10-12, et
l'item 3 a été réécrit pour interroger ce que l'application promet désormais —
ce qu'il révèle alors est un **vrai défaut**, pas un reste de l'ancien mode.
L'arithmétique du résumé est corrigée au passage : elle déclarait `issues: 0`
alors que l'item 3 portait `result: issue`.

**L'item 3 est passé le 2026-10-19**, après le rejeu humain sur un build dont le
SHA a été vérifié (`022fca6…`). **L'item 7 est passé le même jour**, sur la
production et avec quatre abonnements réels : la condition qui le bloquait
(« un appareil réellement abonné ») n'existe plus, et la sortie porte
`delivered: 3` sans le moindre `dropped`. **L'item 6 est passé le même jour**,
et pas par chance : le push a d'abord été rejeté par le navigateur (`Bad
encryption`, accusé 101), la cause était un octet inséré dans la trame envoyée,
et il a fallu corriger le fond (`d348309`) puis déployer pour que la
notification s'affiche enfin. L'item 7 garde son critère — le service accepte,
rien n'est `dropped` — mais son texte dit désormais que ce n'est pas la preuve
d'une réception lisible.

## Gaps

- gap_id: G-09-etat-vide-mensonger
  truth: "Hors ligne, une lecture impossible affiche une erreur explicite — jamais un état vide qui a l'air normal"
  status: resolved
  resolved_by: "261019-dw6 (politique réseau + bandeau) puis 261019-gwh (état initial), rejeu humain concluant"
  resolved_at: 2026-10-19
  reason: "User reported: si je fais les 5 etapes, quand je vais dans courses, il me dit aucune liste pour ce foyer"
  severity: major
  test: 3
  root_cause: |
    Le défaut n'est pas dans la page mais dans la requête, qui n'est jamais tentée.
    TanStack Query 5.103.2, `networkMode` **défaut** = `'online'` (`networkMode`
    n'est configuré nulle part dans le dépôt) : quand `navigator.onLine` est faux,
    la requête reste dans son état courant et passe en `fetchStatus: 'paused'`
    au lieu de partir et d'échouer. Or `isLoading = isPending && isFetching`
    (`queryObserver.ts`), donc **`isLoading` vaut `false` en pause**, et
    `isError` aussi. La garde `!isLoading && !isError && rows.length === 0`
    s'ouvre alors, et la page rend son état vide ordinaire. La
    documentation TanStack le dit explicitement : « Queries can be in
    `state: 'pending'`, but `fetchStatus: 'paused'` if they are mounting for the
    first time, and you have no network connection. »
    Le dépôt ne lit **jamais** `fetchStatus` ni `isPaused` (aucune occurrence
    hors tests), donc rien ne distingue « vide » de « en pause ».
    Contradiction interne : D-10 (09-CONTEXT.md:72-79) promet que « les listes
    vides authentiques et les **erreurs réseau d'origine** reviennent ». Avec le
    défaut `'online'`, ces erreurs ne reviennent pas — elles sont retenues et
    remplacées par un état vide qui a l'air normal.
  artifacts:
    - path: "app/src/app/router.tsx:19-26"
      issue: "defaultOptions sans networkMode : le défaut 'online' s'applique à tout le dépôt"
    - path: "app/src/lib/data/useResource.ts"
      issue: "expose isError mais pas fetchStatus/isPaused ; rows retombe sur NO_ROWS"
    - path: "app/src/modules/courses/courses-page.tsx:247-259"
      issue: "la garde !isLoading && !isError rend l'état vide alors que la lecture est en pause"
    - path: "app/src/modules/dashboard/hooks/use-dashboard.ts"
      issue: "l'accueil n'expose aucun état d'erreur : ses widgets affichent « rien » sans le dire"
  missing:
    - "Décider la politique : réessayer malgré l'absence de réseau (networkMode 'always', conforme à D-10) ou distinguer « en pause » de « vide » (isPaused/fetchStatus) dans l'interface"
    - "Couvrir les 10 gardes `!isLoading && !isError` de 5 modules, plus l'accueil"
    - "Preuve de non-régression : un test qui rend la page avec navigator.onLine=false et exige une erreur, pas un état vide"
  debug_session: ""

### Résolution — 2026-10-19

Le constat ci-dessus a été **corrigé** par la tâche `261019-dw6` (commits
`f3ee6fc`, `e07c6fd`, `f1d5191`, `690ae9a`), dont les artefacts sont dans
`.planning/quick/261019-dw6-corriger-15-hors-ligne-l-app-affiche-un-/`.

Son `status: failed` a d'abord été **conservé** : il décrivait l'état au moment
du constat. Il passe à `resolved` le 2026-10-19, quand le rejeu a eu lieu — car
c'est le rejeu qui clôt l'item, pas le correctif, et la raison qui le maintenait
ouvert (« rejeu non fait ») avait alors disparu. Le `result: issue` d'origine et
le `reported:` de l'item 3, eux, **restent** : ils sont l'histoire, et une
histoire ne se réécrit pas. La correction, elle, se lit ainsi —
`networkMode: 'always'` pour les requêtes **et** les mutations, plus
`refetchOnReconnect: true` explicite, posés une seule fois dans
`app/src/lib/query-policy.ts`, dont dérivent le client de l'application **et**
celui du harnais de test. Les dix gardes `!isLoading && !isError` n'ont pas été
touchées : elles étaient correctes, c'est la politique réseau qui les faisait
mentir (AGENTS.md §2.7 E — la classe, pas l'instance). Un bandeau global annonce
désormais la coupure, et il porte seul l'explication puisque l'accueil n'a pas
d'état d'erreur propre — arbitrage explicite de l'utilisateur.

**L'item 3 a été rejoué en usage réel le 2026-10-19, et il est concluant.** Le
build déployé a été vérifié **avant** de conclure — `x-app-version` rend
`022fca62daf98e9e3d41f589baa5b813f78a38b1`, exactement le commit poussé, et le
bundle servi porte la politique réseau comme le bandeau — donc le rejeu est
attribuable à un build précis, et non à « quelque chose de plus récent ». Ce
rejeu a en outre révélé un second défaut, corrigé dans la foulée (ci-dessous) :
c'est lui qui a fait passer l'item, une fois les deux correctifs déployés.

**Second correctif, né de ce rejeu** — tâche `261019-gwh` (commits `7fa4293`,
`c069437`), artefacts dans
`.planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/`.

Le rejeu humain a montré que le bandeau ajouté par `dw6` était **muet au
démarrage à froid hors ligne** — le scénario même de ce constat — parce que
l'`onlineManager` de TanStack démarre à `true` en dur et ne lit jamais
`navigator.onLine`. L'état est désormais amorcé une fois au bootstrap
(`app/src/lib/online-status.ts`, appelé par `app/src/main.tsx` avant le rendu).
Conséquence indirecte réparée au passage : le retour du réseau redevient un
**changement** d'état notifiable, donc `refetchOnReconnect: true` reprend vie sur
ce chemin. Le rejeu a aussi noté qu'une liste **réelle** peut apparaître hors
ligne si le cache du navigateur est laissé actif : le protocole de rejeu garde
« Désactiver le cache » **coché**, comme le constat d'origine. Fixé dans
`docs/TODO.md` #15, désormais clos.
