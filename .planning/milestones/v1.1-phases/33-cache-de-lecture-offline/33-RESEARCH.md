# Phase 33: Cache de lecture offline - Research

**Researched:** 2026-11-04
**Domain:** Persistance du cache TanStack Query v5 (IndexedDB), namespacing par utilisateur, purge à la déconnexion, contrôle statique du service worker
**Confidence:** HIGH

## Summary

Cette phase ajoute un cache de **lecture** offline sans toucher le backend, sans toucher le SW (hormis sa preuve statique OFFR-05) et sans toucher un seul des 22 modules branchés sur `useResource`. Le consensus de la recherche jalon (`.planning/research/SUMMARY.md`, HIGH) et la doc officielle TanStack convergent : `persistQueryClient` + `createAsyncStoragePersister` + IndexedDB (`idb-keyval`) est la recette standard, et elle se greffe sur les points d'ancrage déjà posés — `queryClient` exporté par `router.tsx`, `useAuthBootstrap` qui gâte déjà le premier rendu dans `main.tsx`, `session-store.signOut()` qui vide déjà les stores, `banner-store` de la 32-02.

Les décisions D-01…D-13 sont toutes implémentables avec l'API publique de TanStack v5, avec **deux points durs documentés** ci-dessous : (1) le `maxAge` de `persistQueryClient` est **global et silencieux** — il jette tout le cache sans état honnête, ce qui contredit D-09 ; le filtrage par famille se fait donc au `dehydrateOptions.shouldDehydrateQuery` (écriture) et en `removeQueries` post-restore (lecture) ; (2) le `gcTime: 5 * 60_000` actuel de `QUERY_POLICY` est incompatible avec un cache persisté — les queries hydratées seraient collectées avant la prochaine sauvegarde ; la politique doit monter `gcTime` (≥ 7 jours, dans `query-policy.ts`, source unique).

Le piège de rendu le plus cher (OFFR-01 vs OFFR-03) : avec `networkMode: 'always'`, une query restaurée puis échouée hors ligne porte **à la fois** `isError: true` **et** `data` restaurée. Les pages qui rendent `ErrorState` sur `isError` afficheraient une erreur malgré des données cachées disponibles — le comportement honnête voulu hors allowlist, et le comportement à corriger sur les modules Tier 1. Le critère de partition est « `data` présente ? », pas `isError`.

**Primary recommendation:** persister via `persistQueryClient` (clé de stockage `eo-query-cache:<userId>:<householdId>`, allowlist filtrée au dehydrate, buster = build hash), restaurer dans la chaîne `await` de `useAuthBootstrap` avant `setReady(true)`, purger attendu dans le point de déconnexion unique, bandeau horodaté depuis `MIN(dataUpdatedAt)` dans le slot bannières, et contrôle statique `scripts/check-sw-api-cache.sh` + sa contre-preuve vue rouge.

<user_constraints>
## User Constraints (from CONTEXT.md 33)

### Locked Decisions
- **D-01:** Mécanisme = `persistQueryClient` + `createAsyncStoragePersister` (TanStack v5), restauré via `restoreQueries` avant le premier rendu des routes protégées (OFFR-01). Restriction par allowlist **au moment de la sérialisation** (filtre dehydrate/persist), pas au moment de la lecture.
- **D-02:** Support de stockage = IndexedDB (idb-keyval ou wrapper léger), pas localStorage.
- **D-03:** Une **clé de stockage par couple (user_id, household_id)** ; la déconnexion purge **toutes** les clés de l'utilisateur.
- **D-04:** Purge **systématique** au changement de foyer (clé persistée du foyer quitté + `queryClient.clear()`), pas de rétention inter-foyers.
- **D-05:** Purge **awaitée dans `signOut()`** (`use-auth.ts`) **avant** navigation vers la landing ; échec de purge bloque la déconnexion avec toast d'erreur. Pas de fire-and-forget.
- **D-06:** Preuve appareil partagé = test automatisé **fake-indexeddb** : user A consulte, déconnexion attendue, user B se connecte, lecture du stockage brut prouvant qu'aucune entrée de A ne survit. Rejouable dans `npm test`.
- **D-07:** Allowlist dans **`query-policy.ts`**, à côté de `QUERY_POLICY` — source unique ; familles = préfixes de queryKey existants de `useResource`.
- **D-08:** maxAge **par famille** (pas par table).
- **D-09:** maxAge dépassé hors ligne → cache ignoré, **état vide honnête** (« données non disponibles hors ligne »), jamais de données trop vieilles rendues.
- **D-10:** Allowlist Tier 1 inclut les **familles annexes** `household_members`, `profiles` (maxAge long ~7 j).
- **D-11:** Bandeau « dernier état connu le [horodatage] » dans le **slot bannières hauts** (`banner-store` 32-02), priorité sous le bandeau de mise à jour. Un seul bandeau global.
- **D-12:** Horodatage affiché = **MIN des `dataUpdatedAt`** des queries Tier 1 rendues depuis le cache.
- **D-13:** Bandeau visible **uniquement hors ligne** (`useOnlineStatus`), quand des données Tier 1 sont rendues depuis le cache. En ligne, pas de bandeau.

### the agent's Discretion
- OFFR-05 : forme du contrôle statique §2.7 (proposition §Architecture Patterns ci-dessous).
- Valeurs précises de maxAge par famille (ordre de grandeur : données vivantes 24 h, annexes 7 j).
- Choix du package IndexedDB (idb-keyval vs wrapper maison) — tranché ici : idb-keyval (voir Standard Stack).

### Deferred Ideas (OUT OF SCOPE)
- File d'écriture et rejeu (phase 34 — `use-outbox-gate` reste un stub).
- Deep links et vue « Tâches du jour » (phase 35).
- Retour du mode démo Dexie (retiré du prod, D-10 phase 09).
- Toute écriture offline.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFFR-01 | Dernière vue d'un module éligible lisible en avion, cache restauré avant premier rendu des routes protégées | `persistQueryClient` branché dans la chaîne `await` de `useAuthBootstrap` (`main.tsx` gâte déjà le rendu sur `ready`) ; pattern « Restore-before-ready » ; pitfall « isError avec data restaurée » |
| OFFR-02 | Bandeau « dernier état connu le [horodatage] » | Slot `banner-store` (kind `offline-stale`, priority > 1) ; horodatage = MIN `dataUpdatedAt` des queries Tier 1 du cache ; visibilité `useOnlineStatus` |
| OFFR-03 | Allowlist + maxAge par famille ; hors allowlist = erreur d'origine | `OFFLINE_FAMILIES` dans `query-policy.ts` (garde de classe existante) ; filtre `shouldDehydrateQuery` à la sérialisation ; `removeQueries` post-restore pour D-09 |
| OFFR-04 | Cache namespacé (user, household), purge attendue à déconnexion/changement de foyer, test appareil partagé | Clé de stockage composée + `idb-keyval` (`entries`/`del`) ; purge dans le chemin `signOut` + `switchHousehold` ; test Vitest fake-indexeddb (déjà dans `src/test/setup.ts`) |
| OFFR-05 | SW ne cache jamais l'API — contrôle statique prouvé sur cas qui doit échouer | Denylist existante [VERIFIED: app/src/sw.ts:137-141] + nouveau script §2.7 avec contre-preuve (fixture vue rouge) |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- **§2.7 chaîne avant commit** : `typecheck && test && build`, e2e, contrôles statiques (`check-sql-statique.py` + sa contre-preuve). Un contrôle se prouve sur un cas qui doit échouer. Pas de linter dans ce dépôt — les directives de linter sont proscrites ; les raisons s'écrivent en français dans les commentaires.
- **§2.7 F** : un succès muet est un échec inexpliqué — la purge écrit/propage son issue, jamais avalée.
- **§2.6** : données sensibles — le cache client n'affaiblit pas la RLS ; le namespacing + purge (D-03/D-05) est l'exigence projet pour l'appareil partagé.
- **Pas de linter** : le nouveau contrôle OFFR-05 est un script §2.7 (pattern `check-sql-statique.py` / `check-precache-coverage.sh`), pas une règle ESLint.
- Le SW est en `injectManifest` : ne jamais passer en `generateSW`, ne jamais toucher `skipWaiting`/`clientsClaim`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persistance du cache de lecture | Frontend (IndexedDB, module `lib/`) | — | Cache client pur ; le SW n'y participe jamais (contrat D-10 v1.1) |
| Restauration au démarrage | Frontend (bootstrap `main.tsx`/`use-auth.ts`) | — | Le gâteau de rendu `ready` existe déjà ; la restauration doit s'insérer avant `setReady(true)` |
| Allowlist & politique de cache | Frontend (`query-policy.ts`, source unique) | — | Garde de classe §2.7 E déjà en place (Test E refuse tout `new QueryClient(` ailleurs) |
| Namespacing & purge | Frontend (`session-store`/`use-auth.ts`, `household-store`) | — | Points de déconnexion/changement de foyer existants, purge attendue (D-05) |
| Bandeau stale | Frontend (bannières 32-02) | — | Slot `banner-store` posé, réceptacle désigné (D-11) |
| Honnêteté de fraîcheur (maxAge) | Frontend (`removeQueries` post-restore + rendu) | — | Le `maxAge` global TanStack est inutilisable tel quel (silencieux) — voir Pitfall 1 |
| Preuve SW / API (OFFR-05) | Build/CI (script §2.7) | SW (`src/sw.ts`) | Contrôle statique sur `dist/sw.js`, jamais de route cacheable API dans le worker |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-query-persist-client` | **5.103.2 (épinglé)** | `persistQueryClient`, `PersistedClient`, `dehydrateOptions` | Officiel TanStack, même train de release que `@tanstack/react-query` 5.103.2 déjà dans le lockfile [VERIFIED: app/package.json:47] |
| `@tanstack/query-async-storage-persister` | **5.103.2 (épinglé)** | `createAsyncStoragePersister` | Officiel TanStack, version égale au reste de la v5 |
| `idb-keyval` | 6.3.0 | AsyncStorage sur IndexedDB (get/set/del/entries + stores nommés) | ~15 lignes de glue, 1 kB, par l'auteur des specs IndexedDB ; verdict legitimacy OK (14,8 M téléchargements/semaine) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` (déjà présent) | 6.2.5 [VERIFIED: app/package.json:79] | Preuve OFFR-04 + tests persister | Déjà chargé par `src/test/setup.ts` (`import 'fake-indexeddb/auto'`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| idb-keyval | Wrapper maison IndexedDB | Zéro dépendance mais ~60 lignes de code de transaction à tester — exactement le « don't hand-roll » |
| `PersistQueryClientProvider` | `persistQueryClient()` impératif | Le provider force un remplacement de `QueryClientProvider` dans `router.tsx` (Test D de `query-policy.test.ts` vérifie le client résolu) ; la voie impérative s'insère dans `useAuthBootstrap` sans toucher le routeur — retenue (D-01 dit « restoreQueries avant le premier rendu ») |
| localStorage | IndexedDB (D-02 verrouillé) | Quota, asynchrone natif |

**Installation:**
```bash
cd app
npm install -E @tanstack/react-query-persist-client@5.103.2 @tanstack/query-async-storage-persister@5.103.2 idb-keyval@6.3.0
```

**Version verification:** `npm view` 2026-11-04 : `@tanstack/react-query-persist-client@5.103.2` et `@tanstack/query-async-storage-persister@5.103.2` existent (train de release identique à `@tanstack/react-query@5.103.2` du lockfile), `idb-keyval` latest 6.3.0. [VERIFIED: npm registry]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| idb-keyval | npm | 2026-07-08 | 14,8 M/sem | github.com/jakearchibald/idb-keyval | OK | Approved |
| @tanstack/react-query-persist-client | npm | 2026-11-02 | 4,9 M/sem | github.com/TanStack/query | SUS (« too-new ») | Flagged — mitigé : épingler **5.103.2** (version de 2026-10, même train que `@tanstack/react-query` déjà en prod), pas latest |
| @tanstack/query-async-storage-persister | npm | 2026-11-02 | 2,4 M/sem | github.com/TanStack/query | SUS (« too-new ») | Flagged — même mitigation, épingler **5.103.2** |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** les deux paquets TanStack — le motif est uniquement `too-new` (release latest de 2 jours). L'épinglage à 5.103.2 aligne la dépendance sur la version exacte déjà en prod du paquet sœur ; le planner peut ajouter un `checkpoint:human-verify` avant install s'il juge le risque résiduel non couvert.

## Architecture Patterns

### System Architecture Diagram

```
   Démarrage (main.tsx)
        │
        ▼
 seedOnlineStatus() ── état réseau unique (avant tout rendu)
        │
        ▼
 useAuthBootstrap()
   ├─ supabase.auth.getSession()
   ├─ applySession(user)                    (session + foyer posés)
   ├─★ restoreOfflineCache(client, userId, householdId)
   │     ├─ read  IndexedDB["eo-query-cache:<userId>:<householdId>"]
   │     ├─ filtrage post-restore : removeQueries(familles maxAge dépassé)   ← D-09
   │     └─ buster ≠ buildHash ? → cache jeté (joué par TanStack)
   ├─ setReady(true)                        ← premier rendu des routes protégées APRÈS restore
   ▼
 AppRouter (QueryClientProvider, client unique)
   │
   ├─ pendant la session : abonnement persistQueryClient (save throttlé, filtré
   │    par dehydrateOptions.shouldDehydrateQuery → allowlist Tier 1 + annexes)   ← D-01/D-07
   │
   ├─ HORS LIGNE : lecture réseau échoue (networkMode 'always')
   │     ├─ query.data restaurée présente ? → données rendues + bandeau
   │     │    « dernier état connu le MIN(dataUpdatedAt) » (banner-store)        ← OFFR-02
   │     └─ pas de data (hors allowlist / maxAge dépassé) → ErrorState d'origine ← OFFR-03
   │
   ├─ switchHousehold() → purge clé du foyer quitté + queryClient.clear()         ← D-04
   ▼
 signOut() (await) → purge des clés <userId>:* → navigation landing              ← D-05
        │   échec de purge → toast d'erreur, déconnexion bloquée
        ▼
   Service worker : précache + push UNIQUEMENT — jamais une réponse API
        (preuve statique OFFR-05 sur dist/sw.js)
```

### Recommended Project Structure
```
app/src/
├── lib/
│   ├── query-policy.ts            # QUERY_POLICY + OFFLINE_FAMILIES (D-07) + gcTime relevé
│   ├── offline/
│   │   ├── query-persistence.ts   # persister idb-keyval, clé (user, foyer), restore, purge
│   │   └── query-persistence.test.ts
│   └── data/useResource.ts        # inchangé
├── hooks/
│   ├── use-auth.ts                # signOut: purge attendue avant navigation (D-05)
│   └── use-offline-stale-banner.ts # MIN dataUpdatedAt → banner-store
├── components/banners/            # bandeau kind "offline-stale" (slot 32-02)
└── stores/household-store.ts      # switchHousehold: purge D-04
scripts/
├── check-sw-api-cache.sh          # contrôle statique OFFR-05
└── test-check-sw-api-cache.sh     # contre-preuve vue rouge (§2.7)
```

### Pattern 1: Persister namespacé (D-01 + D-03)

**What:** `createAsyncStoragePersister` sur un `AsyncStorage` construit avec `idb-keyval` (store nommé), dont la clé de stockage est composée `(user, household)`. La doc officielle expose `PersistQueryClientOptions` avec `persister`, `buster`, `maxAge`, `dehydrateOptions` :

```typescript
// Source: context7 /tanstack/query — persistQueryClient.md + createAsyncStoragePersister.md
// PersistQueryClientOptions: { queryClient, persister, maxAge = 24h (discard SILENCIEUX),
//   buster = '', hydrateOptions, dehydrateOptions }
// CreateAsyncStoragePersisterOptions: { storage: AsyncStorage|undefined|null, key?,
//   throttleTime? = 1000, serialize?, deserialize?, retry? }
// AsyncStorage = { getItem, setItem, removeItem, entries?() }
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createStore, get, set, del, entries } from 'idb-keyval';

const cacheStore = createStore('eo-offline-cache', 'query'); // base IndexedDB dédiée

export function cacheKey(userId: string, householdId: string) {
  return `eo-query-cache:${userId}:${householdId}`; // D-03
}

export function buildPersister(userId: string, householdId: string) {
  const key = cacheKey(userId, householdId);
  return createAsyncStoragePersister({
    storage: {
      getItem: () => get<string>(key, cacheStore),
      setItem: (value: string) => set(key, value, cacheStore),
      removeItem: () => del(key, cacheStore),
      // `entries()` est l'extension optionnelle de l'interface AsyncStorage (doc officielle) :
      // c'est ce qui permet D-03 (purger TOUTES les clés de l'utilisateur) sans enumerate cursor.
    },
    // Le filtrage par allowlist est posé via dehydrateOptions au moment du persistQueryClient
    // (D-01), pas dans le persister : serialize reste un passage de données.
    throttleTime: 1000, // défaut doc ; une écriture < 1 s avant la coupure réseau peut être
    // perdue du cache persisté — acceptable en lecture seule (le serveur a toujours la vérité),
    // à documenter dans le code.
    serialization: undefined, // JSON par défaut, suffisant (les lignes Supabase sont JSON-safe)
  });
}
```

**When to use:** branché une fois, dans `query-persistence.ts` ; l'abonnement + restore par `persistQueryClient({ queryClient, persister, buster, maxAge, dehydrateOptions })`, qui « restaure immédiatement et souscrit au cache, retournant l'unsubscribe » (doc officielle).

### Pattern 2: Allowlist au dehydrate (D-01, D-07) et maxAge post-restore (D-08, D-09)

**What:** le filtre d'écriture se fait dans `dehydrateOptions.shouldDehydrateQuery` (le `shouldDehydrateQuery` reçoit la `Query` — on lit `query.queryKey[0]` = nom de table, préfixe de famille existant [VERIFIED: app/src/lib/data/useResource.ts:7-16] : `queryKeys.table` fabrique `[table, householdId, filter ?? {}, selectKey ?? null]`). Le filtre de **lecture** (D-09, état vide honnête) se fait APRÈS restore par `queryClient.removeQueries({ predicate })` — le `maxAge` global de `persistQueryClient` est **silencieux** (« silently discarded », doc) et jette tout le cache, donc ne peut pas servir D-08/D-09.

```typescript
// query-policy.ts — à côté de QUERY_POLICY (D-07)
export const OFFLINE_FAMILIES: ReadonlyArray<{ prefix: string; maxAgeMs: number }> = [
  // Tier 1 — données vivantes (ordre de grandeur D-08 : 24 h, à affiner)
  { prefix: 'shopping_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'shopping_list_items', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'products', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'task_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'tasks', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routine_folders', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routines', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routine_completions', maxAgeMs: 24 * 60 * 60 * 1000 },
  // Annexes de rendu (D-10) : sans elles, avatars/noms d'assignés manquent
  { prefix: 'household_members', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  { prefix: 'profiles', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
];
// Les noms de tables ci-dessus sont les constantes réellement utilisées par les hooks Tier 1 :
// TASKS_TABLE='tasks', TASK_LISTS_TABLE='task_lists' (use-taches.ts), SHOPPING_LISTS_TABLE=
// 'shopping_lists', SHOPPING_ITEMS_TABLE='shopping_list_items', PRODUCTS_TABLE='products'
// (use-courses.ts), ROUTINES_TABLE='routines', ROUTINE_FOLDERS_TABLE='routine_folders',
// ROUTINE_COMPLETIONS_TABLE='routine_completions' (use-routines.ts).
// [VERIFIED: app/src/modules/*/hooks/use-*.ts + constantes exportées, grep du 2026-11-04]
```

```typescript
// restore : filtrage D-09 — une famille trop vieille sort du cache (état vide honnête),
// le reste est hydraté.
export function pruneExpiredFamilies(client: QueryClient, now = Date.now()): void {
  client.removeQueries({
    predicate: (query) => {
      const family = familyOf(String(query.queryKey[0]));
      if (!family) return false; // hors allowlist : jamais hydraté de toute façon
      return now - query.state.dataUpdatedAt > family.maxAgeMs;
    },
  });
}
```

**When to use:** `shouldDehydrateQuery` au branchement du persist ; `pruneExpiredFamilies` immédiatement après le restore, avant `setReady(true)`.

### Pattern 3: Restore avant le premier rendu des routes protégées (OFFR-01)

**What:** `main.tsx` gâte déjà le rendu sur `useAuthBootstrap().ready` [VERIFIED: app/src/main.tsx:33-54]. La restauration s'insère dans la chaîne `await` de l'amorçage (chemin `supabase.auth.getSession()` → `applySession`), avant `setReady(true)` — le routeur ne monte jamais sans cache restauré. En ligne, TanStack déclenche ensuite le refetch normal (les données restaurées sont marquées stale, `refetchOnRestore` par défaut).

```typescript
// Source: doc officielle persistQueryClient.md — « Immediately restores any persisted
// cache and subscribes to the query cache, returning the unsubscribe function. »
const unsubscribe = await persistQueryClient({
  queryClient,
  persister: buildPersister(userId, householdId),
  buster: BUILD_HASH,           // jeté si le déploiement a changé la forme du cache
  maxAge: Infinity,             // le maxAge PAR FAMILLE est notre D-08/D-09 (Pattern 2),
                                // pas celui de TanStack — voir Pitfall 1
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => familyOf(String(query.queryKey[0])) !== undefined,
    // Ne PAS persister les mutations en vol : shouldDehydrateMutation absent = jamais
    // persistées par défaut (comportement doc), cohérent avec « aucune écriture offline ».
  },
});
pruneExpiredFamilies(queryClient); // D-09
```

**Buster:** la doc recommande un `buster` pour invalider les caches de forme différente. Valeur recommandée : hash du build (déjà calculé par `build-app.sh` pour `/version.json` — réutiliser la même estampille évite une deuxième source de vérité). Fallback honnête : `SW_VERSION`-like constant bumpée à chaque changement de forme des clés.

### Pattern 4: Purge attendue (D-04, D-05)

**What:** deux points de purge, tous deux `await` :

```typescript
// D-05 — déconnexion. ATTENTION, il existe PLUSIEURS chemins vers signOut :
//   1. use-auth.ts signOut() [VERIFIED: app/src/hooks/use-auth.ts:307-315] — appelle
//      supabase.auth.signOut() puis useSessionStore.getState().signOut()
//   2. session-store.ts signOut [VERIFIED: app/src/stores/session-store.ts:46-49] —
//      appelé AUSSI par le listener SIGNED_OUT (use-auth.ts:197-199) et par les
//      branches « pas de session » du bootstrap (use-auth.ts:149, 176)
// RECOMMANDATION (source unique, principe de la fabrique query-policy) : poser la purge
// dans useSessionStore.signOut() — le goulot unique par lequel passent TOUS les chemins —
// et la rendre awaitée (elle l'est déjà : Promise<void>). D-05 nomme use-auth.ts, mais
// purger uniquement là laisse le listener SIGNED_OUT purger rien ; corriger la CLASSE.
signOut: async () => {
  const userId = get().user?.id;               // AVANT d'effacer l'utilisateur
  const householdId = useHouseholdStore.getState().householdId;
  try {
    await purgeUserCache(userId, householdId); // supprime <userId>:* (tous foyers, D-03)
  } catch (cause) {
    // D-05 : un échec de purge bloque la déconnexion avec toast — jamais avalé (§2.7 F).
    // À remonter à l'appelant (use-auth.ts signOut) pour le toast ; NE PAS déconnecter.
    throw cause;
  }
  set({ user: null, status: 'guest', householdLoaded: false });
  useHouseholdStore.getState().reset();
},
```

```typescript
// D-04 — changement de foyer : purge de la clé du foyer quitté + clear mémoire.
// switchHousehold actuel : [VERIFIED: app/src/stores/household-store.ts:68]
//   switchHousehold: (householdId, householdName) => set({ householdId, householdName }),
// La purge est async alors que le setter est sync : soit awaiter au point d'appel
// (paramètres → sélecteur de foyer), soit encapsuler dans une action async dédiée.
// Le planner décrit le point d'appel exact ; le cache mémoire doit être vidé AVANT que
// le nouveau foyer ne déclenche ses lectures (sinon les lignes de l'ancien foyer
// répondent un instant sous le householdId du nouveau).
```

**Purge utilisateur (D-03) avec idb-keyval :**
```typescript
export async function purgeUserCache(userId: string, _currentHouseholdId: string): Promise<void> {
  const all = await entries<string>(cacheStore);
  await Promise.all(
    all
      .filter(([key]) => key.startsWith(`eo-query-cache:${userId}:`))
      .map(([key]) => del(key, cacheStore)),
  );
}
```

### Pattern 5: Bandeau stale (D-11, D-12, D-13)

**What:** hook qui observe le cache (abonnement `queryCache.subscribe` du client), calcule MIN des `dataUpdatedAt` des queries dont `queryKey[0]` appartient à une famille Tier 1 **données vivantes** (pas les annexes — la donnée la plus ancienne des annexes n'est pas celle que l'utilisateur lit), et pousse/retire `kind: 'offline-stale'` dans `banner-store` selon `useOnlineStatus()`. Format horodatage : `date-fns` `format(date, "d MMM 'à' HH:mm", { locale: fr })` — date-fns v4 déjà présent [VERIFIED: app/package.json:50].

Le slot trie par `priority` croissante [VERIFIED: app/src/components/banners/banner-store.ts:9-21] : le bandeau de mise à jour SW (32-02) doit passer devant ; la valeur exacte de priorité est à lire dans le bandeau existant et à dépasser. Détection « rendu depuis le cache » : la query porte `dataUpdatedAt > 0` **et** `fetchStatus === 'idle'` **et** `isError` (échec réseau) — en ligne, `refetchOnReconnect: true` fait disparaître l'état rapidement, cohérent avec D-13 (bandeau retiré dès le retour réseau via `useOnlineStatus`).

### Pattern 6: Contrôle statique OFFR-05 (§2.7, discrétion agent)

**What:** `scripts/check-sw-api-cache.sh`, sur le modèle de `check-precache-coverage.sh` (lit `dist/sw.js` après build, échec explicite) :

1. **Denylist navigation présente** — les cinq motifs doivent apparaître dans `dist/sw.js` :
   `/^\/rest\//`, `/^\/auth\//`, `/^\/functions\//`, `/^\/realtime\//`, `/^\/storage\//`
   [VERIFIED: app/src/sw.ts:139 — denylist actuelle : `denylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/realtime\//, /^\/storage\//]`]
2. **Aucune route runtime cacheable** — `dist/sw.js` ne doit contenir aucun `CacheFirst`, `StaleWhileRevalidate`, `NetworkFirst`, `NetworkOnly+CacheableResponse`, ni `CacheableResponsePlugin` (les stratégies workbox utilisées pour du cache de réponses ; le précache `precacheAndRoute` est légitime et n'est pas dans cette liste).
3. **Aucun `registerRoute(` hors NavigationRoute** — le fichier source `src/sw.ts` n'en a qu'un [VERIFIED: app/src/sw.ts:137-141] ; tout ajout dans le bundle est un défaut.

**Contre-preuve (vue rouge avant vert, §2.7)** : `scripts/test-check-sw-api-cache.sh` exécute le vérificateur (fonction extraite ou `--check-file`) contre deux fixtures : (a) un `sw-fixture-bon.js` qui doit passer ; (b) un `sw-fixture-mauvais.js` qui enregistre `new CacheFirst({ cacheName: 'api' })` sur `/rest/v1/` — le vérificateur DOIT refuser (b). Même grammaire que `scripts/test-check-sql-statique.py` (« un contrôle se prouve sur un cas qui doit échouer »).

### Anti-Patterns to Avoid
- **Faire porter l'allowlist aux pages (if par module)** : le filtre vit au dehydrate/removeQueries, centralisé ; les pages restent génériques.
- **Utiliser `maxAge` de `persistQueryClient` pour D-08** : global et silencieux — contradiction directe avec D-09.
- **Purger en fire-and-forget** (`void purge()`) dans signOut : interdit par D-05 et §2.7 F.
- **Toucher `networkMode`** : `'always'` est la politique verrouillée [VERIFIED: app/src/lib/query-policy.ts:39] ; le cache offline offre des données AVANT l'échec, il ne change pas le mode réseau.
- **Rendre le bandeau inline par vue** : D-11 verrouille un bandeau global unique dans le slot 32-02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sérialisation/hydratation du cache + souscription de sauvegarde | Persister maison | `persistQueryClient` (TanStack) | Gère buster, throttlage, reprise d'erreurs, subscription |
| Accès IndexedDB | `indexedDB.open()` à la main | `idb-keyval` | Transactions, upgrade, erreurs — ~15 lignes vs ~60 |
| État réseau | `navigator.onLine` écoute maison | `useOnlineStatus` / `onlineManager` | Source unique déjà en place [VERIFIED: app/src/hooks/use-online-status.ts:21-27] |
| Slot de bannières | Nouveau composant de bandeau | `banner-store` (32-02) | Dédup par `kind`, priorité, déjà branché au shell |
| Précache SW | Logique de cache de réponses | Interdit (contrat v1.1) — le SW reste précache + push | OFFR-05 |

**Key insight:** tout le mécanisme est un câblage de pièces officielles autour de points d'ancrage déjà testés (`buildQueryClient`, `useAuthBootstrap`, `signOut`, `banner-store`). La seule logique nouvelle *significative* est le filtrage par famille (allowlist + maxAge), qui est du pur prédicat sur `queryKey[0]` et `dataUpdatedAt` — facile à tester unitairement avec fake-indexeddb.

## Runtime State Inventory

> Phase greenfield côté cache (nouveau stockage), mais inventaire exigé car elle touche à la persistance et à la purge d'états runtime.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Nouveau store IndexedDB `eo-offline-cache` (créé par la phase) ; Dexie `demo` existe encore mais hors périmètre (D-10 phase 09) ; localStorage `ensemble-organises-session` et `ensemble-organises-household` (zustand persist, inchangés) | Création du store ; ne PAS toucher à Dexie ni aux clés zustand |
| Live service config | Aucun — rien côté serveur pour cette phase | None |
| OS-registered state | Aucun (PWA sans registrars OS) | None — verified par lecture de la phase (aucun outil OS concerné) |
| Secrets/env vars | `VITE_SUPABASE_URL` / clé publiable uniquement (déjà en place) ; aucune nouvelle valeur secrète | None |
| Build artifacts | `dist/sw.js` régénéré par le build ; le contrôle OFFR-05 le lit | Exécuter `npm run build` avant `check-sw-api-cache.sh` (comme `check-precache-coverage.sh`) |

## Common Pitfalls

### Pitfall 1: `gcTime` du QUERY_POLICY tue le cache persisté
**What goes wrong:** `gcTime: 5 * 60_000` [VERIFIED: app/src/lib/query-policy.ts:31] : après restore, les queries inactives sont collectées en 5 minutes ; pire, TanStack garde en mémoire des queries « mortes » que le persist ne resauvegarde plus — la doc officielle impose d'aligner `gcTime` sur l'horizon de persistance (leur exemple : 24 h).
**Why it happens:** `gcTime` et la persistance sont des durées indépendantes que personne ne force à coïncider.
**How to avoid:** monter `gcTime` dans `QUERY_POLICY` (≥ 7 jours, la plus longue famille) — dans `query-policy.ts` (source unique, Test D vérifie les valeurs résolues). Les tests qui écrasent `gcTime: 0` via `buildQueryClient(overrides)` restent valides.
**Warning signs:** bandeau stale disparaît après 5 min d'inactivité en avion ; cache vide après un aller-retour rapide hors ligne.

### Pitfall 2: `isError: true` avec données restaurées → ErrorState mensonger (OFFR-01/03)
**What goes wrong:** avec `networkMode: 'always'` (verrouillé), hors ligne la query PART et échoue : `isError: true` **et** `query.data` (restaurée) présents. Un module Tier 1 qui rend `ErrorState` sur `isError` montre une erreur alors que la donnée cachée existe — inversement un module hors allowlist doit conserver exactement ce comportement (OFFR-03).
**Why it happens:** `useResource` retourne `rows = query.data ?? NO_ROWS` ET `isError` séparément ; la décision d'affichage appartient aux pages.
**How to avoid:** critère de partition partagé = « `rows.length > 0` (data présente) ? » → données + bandeau ; sinon `isError` → ErrorState d'origine. Poser ce critère une fois (helper ou convention documentée) et le vérifier par test sur chaque module Tier 1 touché — sans modifier `useResource`.
**Warning signs:** en avion, un module Tier 1 affiche « impossible de charger » alors que le bandeau stale est visible.

### Pitfall 3: `maxAge` global silencieux contredit D-09
**What goes wrong:** la doc : « If a persisted cache is found that is older than this time, it will be **silently** discarded » — tout ou rien, aucun état honnête.
**How to avoid:** `maxAge: Infinity` côté persist (ou le maxAge de la plus longue famille comme garde-fou anti-corruption), filtrage par famille en post-restore (`removeQueries` predicate, Pattern 2).
**Warning signs:** utilisateur en avion avec données > 24 h voit un écran totalement vide sans message explicite.

### Pitfall 4: Plusieurs chemins vers `signOut`
**What goes wrong:** purger uniquement dans `use-auth.ts signOut()` laisse le listener `SIGNED_OUT` et les branches bootstrap (pas de session) purger rien — les données de l'utilisateur A peuvent survivre à un rechargement où Auth a révoqué la session (cas « appareil partagé » réel !).
**How to avoid:** purge dans `useSessionStore.signOut()` — goulot unique de tous les chemins [VERIFIED: app/src/stores/session-store.ts:46-49, app/src/hooks/use-auth.ts:149, 176, 197-199, 307-315]. Read `user.id` AVANT d'effacer l'état.
**Warning signs:** test OFFR-04 vert mais données de A encore en IndexedDB après `supabase.auth.signOut()` déclenché par expiration de session.

### Pitfall 5: `switchHousehold` sync vs purge async
**What goes wrong:** `switchHousehold` est un setter zustand sync [VERIFIED: app/src/stores/household-store.ts:68] ; `await` une purge à l'intérieur est impossible sans changer la forme du setter, et les lectures du nouveau foyer peuvent partir avant la fin de la purge.
**How to avoid:** ordre strict : purge de la clé du foyer quitté (await) → `queryClient.clear()` → seulement ensuite `switchHousehold(...)` et le reload du foyer. Encapsuler dans une action async unique appelée par le sélecteur de foyer.
**Warning signs:** lignes de l'ancien foyer visibles une seconde sous le nouveau foyer.

### Pitfall 6: persister pendant une session d'un autre utilisateur (course à la sauvegarde)
**What goes wrong:** `persistQueryClient` souscrit au cache et sauvegarde throttlé ; si le branchement (userId/foyer) change sans désabonnement, l'ancienne souscription peut réécrire la clé de l'ancien utilisateur APRÈS la purge (recréant la donnée purgée !).
**How to avoid:** conserver l'`unsubscribe` renvoyé par `persistQueryClient` ; à chaque déconnexion/changement de foyer : unsubscribe → purge → rebranchement (le rebranchement se produit au bootstrap suivant ou à l'action de switch). C'est l'ordre qui rend la preuve OFFR-04 reproductible.
**Warning signs:** entrée `eo-query-cache:<A>:*` réapparue après déconnexion réussie.

### Pitfall 7: le démo/seed et `supabase` null
**What goes wrong:** en l'absence de Supabase (démo), `session-store.signOut()` est aussi appelé [VERIFIED: app/src/hooks/use-auth.ts:149] ; le cache offline ne doit pas être créé ni purgé de façon divergente dans ce mode.
**How to avoid:** le persister ne s'active que si `supabase` est configuré ET userId/householdId connus ; la purge tolère un userId null (no-op explicitement commenté).

## Code Examples

### Test appareil partagé (D-06, OFFR-04)
```typescript
// Source: pattern des tests existants — fake-indexeddb/auto déjà dans src/test/setup.ts
// [VERIFIED: app/src/test/setup.ts:2]
import { entries } from 'idb-keyval';
import { buildQueryClient } from '@/lib/query-policy';
import { restoreOfflineCache, purgeUserCache } from '@/lib/offline/query-persistence';

it('aucune donnée de A ne survit à la déconnexion (appareil partagé simulé)', async () => {
  // 1. User A consulte : seed le cache de A puis restore+sauvegarde attendue
  const clientA = buildQueryClient();
  clientA.setQueryData(['tasks', 'h1', {}, null], [{ id: 't1', name: 'marque-A' }]);
  await persistNow(clientA, 'userA', 'h1');       // sauvegarde immédiate (bypass throttle)
  // 2. Déconnexion ATTENDUE (await) — le contrat D-05
  await purgeUserCache('userA', 'h1');
  // 3. User B se connecte et lit le stockage BRUT
  const restantes = (await entries(cacheStore)).filter(([k]) => k.includes('userA'));
  // Assertion bornée (§2.7 D) : le store de cache, pas « toute IndexedDB »
  expect(restantes).toEqual([]);
  // 4. Et le restore de B ne voit rien de A :
  const clientB = buildQueryClient();
  await restoreOfflineCache(clientB, 'userB', 'h1');
  expect(clientB.getQueryData(['tasks', 'h1', {}, null])).toBeUndefined();
});
```

### Test « vue rouge » du contrôle statique OFFR-05
```bash
# scripts/test-check-sw-api-cache.sh — le vérificateur doit REFUSER la fixture qui
# enregistre une stratégie cacheable sur une route API, et ACCEPTER la saine.
check_sw_fixture "fixtures/sw-mauvais.js" "doit-echouer"   # CacheFirst sur /rest/v1/
check_sw_fixture "fixtures/sw-bon.js"     "doit-passer"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createSyncStoragePersister` (localStorage) | `createAsyncStoragePersister` | Persister sync marqué **deprecated** par la doc (retrait prochaine majeure) | D-01/D-02 choisis la voie async — aligné |
| Mode démo Dexie comme offline | Cache TanStack persisté | D-10, 2026-10-12 (phase 09) | Dexie reste confiné au démo local |
| generateSW | injectManifest (déjà en place) | Phase push | Ne pas changer |

**Deprecated/outdated:** `createSyncStoragePersister` : ne pas l'utiliser même pour un raccourci.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tanstack/react-query-persist-client` et `@tanstack/query-async-storage-persister` en 5.103.2 sont compatibles binaires avec `@tanstack/react-query` 5.103.2 (même train de release) | Standard Stack | Peer-dependency warning ou comportement divergent — vérifier `npm ls` après install |
| A2 | Les familles Tier 1 listées dans OFFLINE_FAMILIES couvrent tout ce que les pages Tier 1 rendent (constantes vérifiées, mais une lecture cachée via `tableAll` ou une query composée hors `useResource` existerait hors allowlist) | Pattern 2 | Données manquantes en avion dans un module Tier 1 — détectable par le test e2e offline |
| A3 | Le hash de build de `build-app.sh` est exposé au runtime (via `/version.json`) et réutilisable comme `buster` | Pattern 3 | Buster dégradé en constante manuelle — risque faible, comportement préservé |
| A4 | Ordre de grandeur maxAge (24 h vivantes / 7 j annexes) — la discrétion de l'agent le couvre, mais les valeurs restent à valider par l'utilisateur si sensibles | Pattern 2 | Bandeau honnête plus ou moins strict — réversible |
| A5 | Aucun module Tier 1 ne lit via un chemin qui contourne `useResource` pour ses données principales | Pitfall 2 | Un module affiche une erreur en avion malgré allowlist correcte |

## Open Questions

1. **Position exacte de la purge de changement de foyer (D-04).**
   - What we know: `switchHousehold` est sync, les points d'appel exacts (sélecteur de foyer) n'ont pas été lus dans cette recherche.
   - What's unclear: où l'action async englobant purge → clear → switch vit.
   - Recommendation: le planner lit le(s) point(s) d'appel de `switchHousehold` et place l'action async dans le module paramètres/sélecteur.

2. **Priorité numérique du bandeau offline-stale.**
   - What we know: `priority` croissante, le bandeau SW-update (32-02) passe devant (D-11).
   - What's unclear: la valeur exacte posée par la 32-02.
   - Recommendation: le planner lit `sw-register`/composant du bandeau 32-02 et pose `priority` supérieure (rendue dessous).

3. **Critère de rendu « data présente vs ErrorState » : helper partagé ou convention par page ?**
   - What we know: Pitfall 2 ; les pages Tier 1 ont chacune leur garde d'état.
   - Recommendation: convention documentée + test par module (pas de helper qui changerait `useResource`) — à trancher au plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 24 | build/tests | ✓ (engines >=24.21.0 [VERIFIED: app/package.json:7-8]) | 24.x | — |
| Vitest | tests unitaires | ✓ | 5.0.2 [VERIFIED: app/package.json:86] | — |
| fake-indexeddb | tests persister | ✓ | 6.2.5, chargé par setup | — |
| Playwright | e2e offline (optionnel mais recommandé) | ✓ | 1.63.0 [VERIFIED: app/package.json:67] | — |
| Docker | test-db.sh (non requis — aucune migration SQL cette phase) | non requis | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + React Testing Library 16 + MSW 2 + fake-indexeddb 6 |
| Config file | `app/vite.config.ts` (bloc `test`, `include: ['src/**/*.test.{ts,tsx}', '../supabase/functions/**/*.test.ts']`, `setupFiles: ['app/src/test/setup.ts']`) [VERIFIED: app/vite.config.ts:100-117] |
| Quick run command | `cd app && npx vitest run src/lib/offline src/lib/query-policy.test.ts` |
| Full suite command | `cd app && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFFR-01 | Restore avant premier rendu ; module Tier 1 lisible en avion (data présente + bandeau) | unit + component | `cd app && npx vitest run src/lib/offline src/components/banners` | ❌ Wave 0 |
| OFFR-02 | MIN(dataUpdatedAt) → bandeau horodaté, visible hors ligne seulement | unit | `cd app && npx vitest run src/hooks/use-offline-stale-banner.test.ts` | ❌ Wave 0 |
| OFFR-03 | Hors allowlist = erreur d'origine ; maxAge dépassé = état vide honnête | unit | `cd app && npx vitest run src/lib/offline/query-persistence.test.ts` | ❌ Wave 0 |
| OFFR-04 | Purge attendue déconnexion/switch ; aucune entrée de A ne survit (fake-indexeddb, lecture brute) | unit | `cd app && npx vitest run src/lib/offline/query-persistence.test.ts` | ❌ Wave 0 |
| OFFR-04 (e2e) | Parcours déconnexion→connexion utilisateur B sur appareil partagé (Playwright, `context.setOffline`) | e2e | `cd app && npx playwright test e2e/offline-shared-device.spec.ts` | ❌ Wave 0 |
| OFFR-05 | Contrôle statique SW : fixture bonne passe, fixture cacheable-API échoue | static §2.7 | `sh scripts/test-check-sw-api-cache.sh` (contre-preuve) puis `sh scripts/check-sw-api-cache.sh` après build | ❌ Wave 0 |
| (garde) | Allowlist/QUERY_POLICY restent sources uniques ; Test E/D de `query-policy.test.ts` restent verts | unit (existant) | `cd app && npx vitest run src/lib/query-policy.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** `cd app && npm run typecheck && npm test`
- **Per wave merge:** `cd app && npm test && npm run build && python3 scripts/check-sql-statique.py && sh scripts/test-check-sw-api-cache.sh && sh scripts/check-sw-api-cache.sh` (ce dernier après build) ; e2e offline sur la machine qui a Playwright + navigateurs.
- **Phase gate:** chaîne §2.7 complète (`test:e2e` inclus) verte avant `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `app/src/lib/offline/query-persistence.test.ts` — OFFR-03/04 (+ appareil partagé D-06)
- [ ] `app/src/hooks/use-offline-stale-banner.test.ts` — OFFR-02
- [ ] `app/src/components/banners/offline-stale.test.tsx` — rendu du bandeau dans le slot
- [ ] `scripts/check-sw-api-cache.sh` + `scripts/test-check-sw-api-cache.sh` + fixtures `app/fixtures/sw-{bon,mauvais}.js` — OFFR-05 (vu rouge avant vert)
- [ ] `app/e2e/offline-shared-device.spec.ts` — OFFR-04 e2e (Playwright, offline context)
- Framework install: none — tout est déjà présent.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | inchangée (Supabase Auth, phase antérieure) |
| V3 Session Management | yes (indirect) | purge attendue au signOut — prolongement de D-07 phase 25 ; l'échec bloque la déconnexion |
| V4 Access Control | no (RLS) | le cache client n'affaiblit pas la RLS (§2.6) ; aucune donnée rendue qui ne fût déjà lisible par l'utilisateur |
| V5 Input Validation | yes | données restaurées ré-hydratées par `hydrate` TanStack (forme contrôlée par nos propres queries) ; buster invalide les caches de forme obsolète après déploiement |
| V6 Cryptography | no | aucun secret dans le cache (clé publiable uniquement) |

### Known Threat Patterns for ce stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fuite inter-utilisateurs sur appareil partagé | Information Disclosure | namespacing `(user, household)` + purge attendue + preuve automatisée (OFFR-04, D-03/D-05/D-06) |
| Résurrection de données purgées par une souscription de sauvegarde orpheline | Tampering | unsubscribe avant purge, ordre strict (Pitfall 6) |
| Cache de forme obsolète après déploiement | Tampering | `buster` = hash de build (doc officielle) |
| Données périmées présentées comme fraîches | Repudiation | bandeau horodaté + maxAge par famille + état vide honnête (D-09/D-11/D-12) |
| SW cachant des réponses API (contournement de la vérité serveur) | Elevation | contrôle statique OFFR-05 + contre-preuve §2.7 |

## Sources

### Primary (HIGH confidence)
- Context7 `/tanstack/query` — `persistQueryClient.md`, `createAsyncStoragePersister.md`, `createSyncStoragePersister.md` (options, maxAge silencieux, AsyncStorage, buster, PersistQueryClientProvider, dépréciation du sync persister)
- Code du dépôt, lu ce session : `query-policy.ts`, `sw.ts`, `main.tsx`, `use-auth.ts`, `session-store.ts`, `household-store.ts`, `banner-store.ts`, `useResource.ts`, `use-online-status.ts`, `use-outbox-gate.ts`, `package.json`, `vite.config.ts` (bloc test), `check-precache-coverage.sh`
- `.planning/research/SUMMARY.md` + ARCHITECTURE (recherche jalon v1.1, versions vérifiées le jour même)

### Secondary (MEDIUM confidence)
- npm registry — versions `idb-keyval@6.3.0`, `@tanstack/*-persister@5.103.2`, dates de publication (2026-11-04)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — doc officielle TanStack via Context7 + paquets vérifiés sur npm + déjà préconisés par la recherche jalon
- Architecture: HIGH — points d'ancrage tous lus dans le code ce session ; pattern de câblage standard TanStack
- Pitfalls: HIGH — chacun dérive d'une lecture directe du code (gcTime, networkMode/isError, chemins signOut) ou de la doc officielle (maxAge silencieux, throttle)

**Research date:** 2026-11-04
**Valid until:** 2026-12-04 (stable — dépendances épinglées, API TanStack v5 gelée)
