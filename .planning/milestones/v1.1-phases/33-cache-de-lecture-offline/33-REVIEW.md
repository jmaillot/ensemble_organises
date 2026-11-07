---
phase: 33-cache-de-lecture-offline
reviewed: 2026-11-04T23:40:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - app/.npmrc
  - app/e2e/offline-shared-device.spec.ts
  - app/fixtures/sw-bon.js
  - app/fixtures/sw-mauvais.js
  - app/package.json
  - app/src/app/app-shell.tsx
  - app/src/components/banners/offline-stale.test.tsx
  - app/src/components/banners/offline-stale.tsx
  - app/src/hooks/use-auth.test.ts
  - app/src/hooks/use-auth.ts
  - app/src/hooks/use-offline-stale-banner.test.ts
  - app/src/hooks/use-offline-stale-banner.ts
  - app/src/lib/offline/query-persistence.test.ts
  - app/src/lib/offline/query-persistence.ts
  - app/src/lib/query-policy.test.ts
  - app/src/lib/query-policy.ts
  - app/src/stores/household-store.test.ts
  - app/src/stores/household-store.ts
  - app/src/stores/session-store.test.ts
  - app/src/stores/session-store.ts
  - docs/BACKEND.md
  - scripts/check-sw-api-cache.sh
  - scripts/test-check-sw-api-cache.sh
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-11-04T23:40:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

La phase 33 pose la persistance offline du cache TanStack Query (IndexedDB namespacée par utilisateur/foyer), la purge à la déconnexion, le changement de foyer avec purge, et le bandeau « dernier état connu ». La qualité d'ensemble est élevée : ordre stop → purge documenté et prouvé par tests, garde `cancelled` sur la traîne du throttle, allowlist à la sérialisation, contrôle statique SW avec contre-preuve vue rouge.

Le défaut principal est un **trou dans la frontière mémoire** : la purge D-05 vide IndexedDB mais ne vide jamais le `queryClient` en mémoire, et le prédicat `shouldDehydrateQuery` filtre par famille sans scoper au foyer ni à l'utilisateur. Conséquence : sur un appareil partagé, les données Tier 1 de l'utilisateur A restent en mémoire après sa déconnexion et sont **ré-sérialisées dans la clé persistée de l'utilisateur B** à sa prochaine sauvegarde — exactement la fuite inter-comptes que D-03/T-33-01 devaient empêcher, par une voie que la preuve D-06 (lecture brute après purge) ne couvre pas.

Le reste : un invariant commenté faux dans `persistNow` (le cancel de l'ancien persister n'est jamais invoqué), des rejets de promesse non gérés sur les `void signOut()` du bootstrap, et un `switchWithPurge` qui laisse l'app sans persister ni cache restauré après le switch.

## Critical Issues

### CR-01: Les données Tier 1 de l'utilisateur A fuient dans le cache persisté de l'utilisateur B (purge mémoire absente + prédicat de sérialisation non scopé)

**File:** `app/src/lib/offline/query-persistence.ts:211-213` (avec `app/src/stores/session-store.ts:47-71`)
**Issue:** Le goulot `signOut` appelle `stopPersisting()` puis `purgeUserCache(userId)` — qui ne vide que les clés IndexedDB de A. Il ne fait **jamais** `queryClient.clear()` ni `removeQueries()` sur le client mémoire (vérifié : aucun `clear()` dans `session-store.ts`, `use-auth.ts`, `router.tsx` ; les seuls `clear()` du dépôt sont dans les panneaux de suppression GDPR/foyer). Or `shouldDehydrateQuery` (`query-persistence.ts:211-213`) ne teste que le préfixe de famille (`familyOf(...) !== undefined`), sans scoper au `householdId` courant.

Scénario concret sur appareil partagé :
1. A consulte ses tâches → `['tasks', householdA, …]` en mémoire.
2. A se déconnecte → IndexedDB purgé, **mais les queries de A restent dans le client mémoire partagé** (`router.tsx`, un singleton).
3. B se connecte → `connectOfflineCache` → `persistNow` → `persistQueryClientSave` sérialise **toutes** les queries allowlistées du cache, y compris `['tasks', householdA, …]` de A, dans la clé `eo-query-cache:<B>:<householdB>`.
4. Le cache hors ligne de B contient désormais les données du foyer de A ; elles sont ré-hydratées en mémoire à chaque restore de B, et survivent à la déconnexion de B (la purge de B supprime sa clé mais les queries de A re-rentrent à la session suivante par le même mécanisme).

C'est la fuite inter-comptes que D-03/D-06/T-33-01 visaient, par la voie mémoire→sérialisation. Le test D-06 ne l'attrape pas : il purge et lit le stockage **avant** qu'un utilisateur B ne re-persiste un client contaminé.
**Fix:**
```ts
// 1. Dans session-store.signOut (ou dans stopPersisting), vider le client mémoire
//    après la purge disque — passer le client, ou l'importer dynamiquement
//    comme le fait use-auth pour éviter le cycle :
const { queryClient } = await import('@/app/router');
queryClient.clear(); // APRÈS purgeUserCache, AVANT set({user:null})

// 2. Défense en profondeur : scoper la sérialisation au foyer courant.
//    Le persister connaît déjà (userId, householdId) — filtrer dessus :
shouldDehydrateQuery: (query) => {
  const family = familyOf(String(query.queryKey[0]));
  if (!family) return false;
  return query.queryKey.includes(householdId); // le 2e élément de clé est le householdId
},
```
La correction 1 est la classe (Pitfall 5 l'exigeait déjà pour `switchWithPurge`, qui fait `client.clear()` — le goulot signOut doit faire de même) ; la 2 empêche toute récurrence si un autre chemin re-persiste un client non nettoyé. Ajouter un test : A persiste → purge signOut → B persiste sur le même client → la clé de B ne contient pas `householdA`.

## Warnings

### WR-01: `persistNow` ne cancel jamais l'ancien persister — commentaire portant un invariant faux

**File:** `app/src/lib/offline/query-persistence.ts:186-188,222-226`
**Issue:** `persistNow` désabonne l'ancienne souscription (`activeUnsubscribe?.()`) mais **n'invoque pas** `activeCancel?.()`. Le commentaire des lignes 223-224 affirme « l'ancienne a été invoquée par le `persistNow` de départ » — c'est faux : aucun chemin de `persistNow` n'invoque le cancel précédent ; seul `stopPersisting` le fait. Si `persistNow` est rappelé (ex. reprise du bootstrap via `retry`, `use-auth.ts:111,244` qui relance l'effet et donc `connectOfflineCache`) alors qu'une traîne de throttle de l'ancien persister est en vol, celle-ci exécute un `setItem` vers **l'ancienne clé** avec l'état courant du client partagé. Le scénario inter-comptes est aujourd'hui bloqué en pratique par `stopPersisting()` au goulot, mais l'invariant documenté n'existe pas dans le code — exactement le type d'affirmation fausse que §2.7 I proscrit.
**Fix:**
```ts
// dans persistNow, avant de recréer :
activeUnsubscribe?.();
activeCancel?.();          // la traîne du throttle de l'ANCIEN persister devient muette
activeUnsubscribe = null;
activeCancel = null;
```
et corriger le commentaire.

### WR-02: Rejets de promesse non gérés sur les `void signOut()` du bootstrap et du listener SIGNED_OUT

**File:** `app/src/hooks/use-auth.ts:150,177,227`
**Issue:** Depuis 33-04, `session-store.signOut()` peut **rejeter** (échec de purge, D-05). Les trois appels `void useSessionStore.getState().signOut()` jettent ce rejet sans handler : un échec IndexedDB au bootstrap (session absente, ligne 150/177) ou sur l'événement `SIGNED_OUT` (ligne 227) produit un `unhandledrejection` silencieux — le §2.7 F du projet exige qu'un échec soit expliqué, pas muet. Le chemin `profile-form` est couvert (toast `error.message`), pas ceux-ci.
**Fix:**
```ts
void useSessionStore.getState().signOut().catch((cause) => {
  console.error('[auth] purge de déconnexion impossible au bootstrap :', cause);
});
```
(aux trois sites ; pour le listener, logger suffit — l'utilisateur est déjà parti côté serveur.)

### WR-03: `switchWithPurge` laisse l'application sans souscription de persistance ni cache restauré après le switch

**File:** `app/src/stores/household-store.ts:84-98`
**Issue:** L'ordre stop → purge → `client.clear()` → `switchHousehold` est correct pour la frontière, mais rien ne rétablit ensuite le persist pour le **nouveau** couple (utilisateur, foyer) : `stopPersisting()` a désabonné et cancel, et aucun `connectOfflineCache`/`persistNow` n'est relancé. Après un changement de foyer, plus aucune écriture de cache ne part vers IndexedDB (le cache offline est mort jusqu'au prochain bootstrap complet), et le cache mémoire du nouveau foyer n'est ni restauré ni rempli. Aucun appelant UI n'existe encore (écart documenté 33-04), mais la fonction est présentée comme LE point d'entrée à appeler — son contrat est incomplet.
**Fix:** après `switchHousehold`, terminer par `await connectOfflineCache(client, userId, newId)` (le client est déjà en paramètre) ; ajouter au contrat JSDoc que l'appelant doit attendre la fonction, et un test d'ordre post-switch (souscription active sur la nouvelle clé).

### WR-04: `pruneExpiredFamilies` écarte aussi les queries jamais chargées (`dataUpdatedAt === 0`) des familles allowlistées

**File:** `app/src/lib/offline/query-persistence.ts:264-272`
**Issue:** Le prédicat calcule `now - query.state.dataUpdatedAt > family.maxAgeMs` sans exclure `dataUpdatedAt === 0`. Une query Tier 1 en attente ou en erreur (jamais chargée, `dataUpdatedAt` = 0) donne `now - 0 > 24h` → vrai → `removeQueries` la supprime. Au bootstrap hors ligne c'est sans grande conséquence (rien à charger), mais au rebranchement ce remove peut annuler une lecture en vol / réinitialiser l'état d'une query déjà montée par le routeur si `pruneExpiredFamilies` était rappelé. Le code de prod ne l'appelle qu'au restore, mais la fonction est exportée et son prédicat est sémantiquement faux (« jamais chargée » traité comme « périmée »).
**Fix:**
```ts
if (query.state.dataUpdatedAt <= 0) return false; // jamais chargée : rien à élaguer
return now - query.state.dataUpdatedAt > family.maxAgeMs;
```

### WR-05: `useSyncExternalStore` avec un `subscribe` recréé à chaque rendu — désabonnement/réabonnement à chaque render du shell

**File:** `app/src/hooks/use-offline-stale-banner.ts:67-71`
**Issue:** La fonction `(onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange)` est créée inline sans mémoïsation : React resouscrit à chaque rendu du composant (monté au niveau `app-shell.tsx`, donc rendu souvent). Pas de fuite (React unsubscribe l'ancienne), mais un churn d'abonnements inutile sur un chemin très rendu, et une dépendance implicite au fait que le cache ne notifie pas pendant la fenêtre de resouscription.
**Fix:** `const subscribe = useCallback((cb) => queryClient.getQueryCache().subscribe(cb), [queryClient]);` passé à `useSyncExternalStore`.

## Info

### IN-01: Assertion e2e tautologique à l'étape 4 du spec appareil partagé

**File:** `app/e2e/offline-shared-device.spec.ts:108-109`
**Issue:** `expect(cles.every((key) => key.startsWith('eo-query-cache:'))).toBe(true)` est vraie par construction — la base `eo-offline-cache` ne contient par conception que des clés de cette forme. L'isolation réelle est documentée comme portée par le test unitaire D-06, mais cette assertion, telle quelle, ne peut pas échouer (§2.7 D : « un test qui ne peut pas échouer n'est pas un test »).
**Fix:** filtrer sur l'absence du `userId` de A (env `E2E_SHARED_USER_A_EMAIL` → id lu après connexion A) : `expect(cles.some((k) => k.includes(userAId))).toBe(false)`.

### IN-02: `check-sw-api-cache.sh` — la vérification 2 peut produire un faux négatif si le minifieur introduit les noms de stratégies dans des chaînes workbox

**File:** `scripts/check-sw-api-cache.sh:49`
**Issue:** Le grep `CacheFirst|StaleWhileRevalidate|NetworkFirst|CacheableResponsePlugin` sur `dist/sw.js` matche aussi d'éventuelles chaînes/messages internes de workbox, pas seulement un `registerRoute(new CacheFirst(...))`. En cas de montage d'une montée de workbox embarquant ces littéraux, le contrôle refuserait à tort (bruit qui Use perdre foi dans le contrôle, §2.7 B). Aujourd'hui vert, donc sans impact immédiat.
**Fix:** si un jour il devient rouge sans cause réelle, resserrer sur `new CacheFirst(` / `new StaleWhileRevalidate(` / `new NetworkFirst(`.

### IN-03: `restoreOfflineCache` duplique la logique de buster au lieu de laisser le persister la porter

**File:** `app/src/lib/offline/query-persistence.ts:244-247`
**Issue:** La comparaison `persisted.buster !== OFFLINE_CACHE_BUSTER` réimplémente le rejet de buster que `persistQueryClient` effectue déjà ; une divergence future entre les deux chemins (restore manuel vs persister) serait silencieuse. Redondance faible mais deux copies de la même règle.
**Fix:** acceptable en l'état (le commentaire T-33-02 documente l'intention) ; si un jour le buster gagne des règles, centraliser dans une fonction unique.

### IN-04: `purgeUserCache` construit le préfixe par `cacheKey(userId, '')` — correct mais dépend d'une convention de format non contrainte par type

**File:** `app/src/lib/offline/query-persistence.ts:146`
**Issue:** Le préfixe repose sur le fait que `cacheKey` concatène naïvement avec `:`. Si `cacheKey` gagne un jour un encodage des segments (ex. userId contenant un `:`), le préfixe `cacheKey(userId, '')` ne matcherait plus les clés réelles et la purge laisserait des données derrière elle — silencieusement. Le garde de classe sur les littéraux existe, pas sur la sémantique du préfixe.
**Fix:** une ligne de test qui épingle la propriété « toute clé produite par `cacheKey(u, h)` commence par `cacheKey(u, '')` » suffirait à verrouiller l'invariant.

### IN-05: `signInDemo` / chemins démo ne passent pas par `connectOfflineCache` — asymétrie correcte mais non documentée au niveau du module

**File:** `app/src/stores/session-store.ts:139-154`
**Issue:** Le mode démo ne branche jamais le cache offline (choix cohérent avec `purgeUserCache(null)` no-op, Pitfall 7), mais cette asymétrie n'est énoncée que dans les commentaires de `purgeUserCache` et du spec e2e ; le module `query-persistence.ts`, qui est la source de vérité du domaine, ne dit pas « démo = jamais de persistance ».
**Fix:** une ligne dans l'en-tête de `query-persistence.ts` : « le mode démo ne branchera jamais ce module (Pitfall 7) ».

---

_Reviewed: 2026-11-04T23:40:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
