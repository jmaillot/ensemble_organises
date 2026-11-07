# Contexte — 261019-gwh : amorcer l'état réseau depuis le navigateur

## Le défaut

Le bandeau hors ligne livré par `261019-dw6` est **muet sur le scénario même
qu'il devait couvrir** : un démarrage à froid hors ligne. Sur une app déjà
ouverte, il apparaît ; après un rechargement, il disparaît alors que le
navigateur est toujours hors ligne.

## La cause, prouvée deux fois

**1. Dans la source installée** — `@tanstack/query-core/build/modern/onlineManager.js` :

```js
#online = true;                    // valeur initiale, en dur
// …et rien d'autre que deux écouteurs :
const onlineListener  = () => onOnline(true);
const offlineListener = () => onOnline(false);
```

Aucune occurrence de `navigator` dans tout `query-core`. Le commentaire du
paquet dit lui-même : « By default, the `onlineManager` **assumes an active
network connection** ». `setEventListener` ne sonde pas davantage l'état courant.
Donc l'état ne change **que** si un événement `online`/`offline` survient dans le
document courant — or sur un chargement à froid hors ligne, aucun événement
n'arrive : on est déjà hors ligne.

**2. Dans un vrai navigateur** (build local, session de démo, Chromium) :

| Geste | `navigator.onLine` | Bandeau |
|---|---|---|
| Passage hors ligne, app ouverte | `false` | présent |
| Changement de page (navigation interne SPA) | `false` | présent |
| **Rechargement** de la page | `false` | **absent** |
| Même page, un événement `offline` arrive | `false` | présent |

La dernière ligne est la preuve que le composant et son abonnement sont
corrects : c'est l'**état initial** qui est faux, pas la réaction aux
événements.

## Deux conséquences, pas une

1. **Le bandeau manque** exactement quand il est le seul porteur de
   l'explication (l'accueil n'a aucun état d'erreur propre — arbitrage de
   `261019-dw6`).
2. **Le retour du réseau ne recharge rien.** `QueryClient` se recharge à la
   reconnexion sur *notification* d'`onlineManager`, et `setOnline` ne notifie
   que si la valeur **change** (`if (this.#online !== online)`). Sur un
   démarrage à froid hors ligne, l'état vaut déjà `true` : le passage réel à
   `true` n'est donc pas un changement, et `refetchOnReconnect: true` — ajouté
   par `261019-dw6` — ne se déclenche jamais sur ce chemin. Le correctif de
   `dw6` est ainsi neutralisé dans le cas précis qu'il visait.

Le défaut principal de `dw6` **n'est pas** remis en cause : les requêtes partent
quand même (`networkMode: 'always'`) et l'erreur s'affiche. C'est le bandeau, et
le rechargement à la reconnexion, qui manquent.

## Décisions verrouillées

1. **Amorcer `onlineManager` depuis `navigator.onLine` une fois, au démarrage
   de l'application**, et pas dans un effet de composant ni à l'abonnement : le
   premier rendu doit déjà porter la bonne valeur, et l'état doit être juste
   avant que `QueryClient` ne s'abonne (c'est ce qui rend le retour du réseau
   notifiable).
2. **Le point d'appel est le bootstrap (`app/src/main.tsx`)**, avant le rendu —
   même endroit et même nature que `registerSW({ immediate: true })`.
3. **La politique réseau ne change pas** : ni `networkMode`, ni
   `refetchOnReconnect`, ni le bandeau lui-même. Ils sont corrects. Seul l'état
   initial manque.
4. **Ne pas déduire l'état d'un succès réseau** : un GET qui réussit ne prouve
   pas que le réseau est là pour la suivante, et inversement. La source reste
   `navigator.onLine` + les événements, une seule vérité.
5. `navigator.onLine` n'est pas infaillible (il ne dit pas si *notre* backend
   répond). C'est assumé et **écrit** : il ne sert qu'à ne pas mentir sur
   l'existence d'une connexion, jamais à garantir qu'une lecture va aboutir.

## Preuve exigée (rouge avant vert, §2.7 B et I)

- **Test de non-régression du bandeau** : avec `navigator.onLine = false`, après
  amorçage, monter l'app (ou le bandeau) → le message hors ligne est **visible**.
  Ce test doit **échouer sur le code d'aujourd'hui**, où l'état initial vaut
  `true`.
- **Test de la conséquence 2** : après amorçage hors ligne, le retour du réseau
  doit être un **changement** d'état (donc notifiable), sans quoi
  `refetchOnReconnect` reste mort sur ce chemin. La forme exacte est laissée au
  plan, à condition qu'elle échoue vraiment sur le code d'aujourd'hui.
- Les tests existants (`offline-banner.test.tsx`) pilotent `onlineManager`
  directement : ils restent valides et doivent continuer de passer.

## Contraintes de projet

- **Aucun linter** dans ce dépôt, et aucune directive de linter (proscrite,
  `app/src/lib/no-eslint-directive.test.ts` la refuse).
- Chaîne §2.7 : `cd app && npm run typecheck && npm test && npm run build`, puis
  `cd app && npm run test:e2e`. Les lignes SQL/Vault sont sans objet ici.
- `.planning/` est gitignoré : ne jamais forcer son ajout.
- Rédaction et messages de commit **en français**, sans accents dans le sujet.
- Commentaires de code **en français**, et un commentaire qui affirme quelque
  chose de faux est un défaut (§2.7 I) — celui du fichier d'origine a déjà été
  corrigé une fois.
