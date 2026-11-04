import { persistQueryClient, persistQueryClientSave, type PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { createStore, del, get, set } from 'idb-keyval';
import { hydrate as hydrateState } from '@tanstack/react-query';
import type { Query, QueryClient } from '@tanstack/react-query';
import { OFFLINE_FAMILIES } from '@/lib/query-policy';

/**
 * Persistance offline du cache de lecture TanStack Query — socle de la
 * phase 33 (OFFR-01). Une base IndexedDB dédiée `eo-offline-cache` (store
 * `query`), une clé de stockage par couple (utilisateur, foyer).
 *
 * POURQUOI UNE CLÉ COMPOSÉE ET UNE FONCTION UNIQUE (D-03, T-33-01). Le cache
 * persisté contient des données personnelles d'un foyer. Une clé générique
 * (« le cache ») laisserait un utilisateur B lire, au rebranchement, les
 * lignes laissées par un utilisateur A sur la même machine. Le format est
 * `eo-query-cache:<userId>:<householdId>` et il n'existe QU'ICI : tout autre
 * module compose sa clé par `cacheKey`, jamais à la main (garde de classe,
 * AGENTS.md §2.7 E — la garde de test qui l'impose arrive au plan 03).
 */
export const OFFLINE_IDB_NAME = 'eo-offline-cache';
export const OFFLINE_IDB_STORE = 'query';

const cacheStore = createStore(OFFLINE_IDB_NAME, OFFLINE_IDB_STORE);

export function cacheKey(userId: string, householdId: string): string {
  return `eo-query-cache:${userId}:${householdId}`;
}

/**
 * Version du format de cache persisté. `buster` est comparé par TanStack au
 * moment du restore : une valeur différente jette le cache plutôt que de
 * réinjecter une forme d'un autre build (T-33-08).
 *
 * POURQUOI UNE CONSTANTE ET PAS L'ESTAMPILLE `/version.json` (hypothèse A3
 * écartée). L'estampille existe côté serveur (`build-app.sh`, header
 * `X-App-Version`), mais la lire au runtime imposerait un aller-réseau au
 * bootstrap — et, HORS LIGNE précisément, ce fetch échoue : le fallback
 * constant mismatcherait le buster persisté par le build précédent et jetterait
 * un cache parfaitement sain au seul moment où il sert (l'asymétrie inverse
 * de D-09). Le fallback honnête documenté au plan est donc retenu : constante
 * bumpée à chaque changement de FORME du cache persisté (clés, hydratation,
 * filtrage). Un simple redéploiement sans changement de forme conserve le
 * cache — ce qui est le comportement voulu.
 */
export const OFFLINE_CACHE_BUSTER = 'v1';

/**
 * Retrouve la famille offline d'un préfixe de table — premier élément de clé
 * produit par `queryKeys.table` / `queryKeys.tableAll` (useResource.ts). La
 * source unique des familles est OFFLINE_FAMILIES (D-07) : ce fichier ne
 * recopie aucun préfixe, il lit la politique.
 */
function familyOf(prefix: string): { prefix: string; maxAgeMs: number } | undefined {
  return OFFLINE_FAMILIES.find((family) => family.prefix === prefix);
}

/**
 * Construit le persister AsyncStorage pour un couple (utilisateur, foyer).
 * Les trois méthodes ferment sur la clé composée : le persister ne voit
 * jamais qu'une entrée unique, le namespacing est donc structurel et non
 * disciplinaire.
 */
export function buildPersister(
  userId: string,
  householdId: string,
  throttleTime = 1000,
) {
  const key = cacheKey(userId, householdId);
  return createAsyncStoragePersister({
    storage: {
      // Les méthodes reçoivent (key, value) de l'interface AsyncStorage ; on
      // ignore l'argument key passé par le persister (son défaut
      // `REACT_QUERY_OFFLINE_CACHE`) pour imposer la clé composée : le
      // namespacing (D-03) est structurel, pas disciplinaire.
      getItem: () => get<string>(key, cacheStore),
      setItem: (_key, value) => set(key, value, cacheStore),
      removeItem: () => del(key, cacheStore),
    },
    // Défaut doc (1000 ms) : une écriture survenue moins d'une seconde avant
    // la coupure réseau peut ne pas être persistée. Acceptable ici : la phase
    // 33 est lecture seule, le serveur reste la source de vérité. Le paramètre
    // existe pour les tests (0 = écriture synchrone, le throttle trailing de
    // TanStack ferait sinon tomber l'écriture 1 s après la fin du test).
    throttleTime,
  });
}

/**
 * Souscription de sauvegarde courante, conservée en état module.
 *
 * POURQUOI UN ÉTAT MODULE (Pitfall 6, hypothèse flaggée OFFR-01-concurrency).
 * `persistQueryClient` souscrit au cache tant que l'unsubscribe n'a pas été
 * appelé. Un rebranchement (changement d'utilisateur ou de foyer) sans
 * désabonnement préalable laisserait une souscription orpheline réécrire le
 * cache de l'ANCIEN couple (utilisateur, foyer) avec les données du NOUVEAU.
 * L'ordre imposé à `persistNow` est donc : unsubscribe de l'ancienne
 * souscription AVANT toute purge ou rebranchement. La preuve complète
 * (OFFR-04) vient au plan 04 ; ce module en pose la mécanique.
 */
let activeUnsubscribe: (() => void) | null = null;

/** Purge la clé d'un couple (utilisateur, foyer) — lecture directe, sans persister. */
export async function purgeCache(userId: string, householdId: string): Promise<void> {
  await del(cacheKey(userId, householdId), cacheStore);
}

/**
 * Persiste le cache maintenant et le garde souscrit pour les écritures
 * suivantes. Réutilisable à chaque rebranchement : l'ancienne souscription
 * est désabonnée avant tout, puis la nouvelle prend le relais.
 */
export async function persistNow(
  client: QueryClient,
  userId: string,
  householdId: string,
  options: Partial<PersistQueryClientOptions> & { throttleTime?: number } = {},
): Promise<void> {
  // Ordre imposé (Pitfall 6) : unsubscribe AVANT toute purge/rebranchement.
  activeUnsubscribe?.();
  activeUnsubscribe = null;

  const { throttleTime, ...persistOptions } = options;
  const persister = buildPersister(userId, householdId, throttleTime);
  const persistProps = {
    queryClient: client,
    persister,
    buster: OFFLINE_CACHE_BUSTER,
    // TRACER — le prédicat laisse tout passer ; l'allowlist D-07 remplace ce
    // stub au plan 03 (stub documenté, pas une simplification : le plan 03
    // réécrit ce prédicat). Aucune mutation en vol n'est sérialisée :
    // `shouldDehydrateMutation` est absent, la phase 33 reste lecture seule
    // (l'outbox est le périmètre de la phase 34).
    // POURQUOI `maxAge: Infinity` EST ABSENT (Pitfall 3) : le `maxAge` global
    // de `persistQueryClient` jette TOUT le cache silencieusement (« silently
    // discarded », doc) dès qu'il est dépassé — jamais d'état honnête, jamais
    // de granularité par famille. Il ne peut PAS servir D-08/D-09. La fraîcheur
    // est évaluée PAR FAMILLE au restore, par `pruneExpiredFamilies`.
    dehydrateOptions: {
      // Allowlist D-01/D-07 : la frontière Allowlist → IndexedDB (T-33-06).
      // Une query dont le préfixe n'est pas dans OFFLINE_FAMILIES n'est PAS
      // sérialisée — les données Tier 2 (notes, ardoise, cadeaux…) ne
      // quittent jamais la mémoire.
      shouldDehydrateQuery: (query: { queryKey: readonly unknown[] }) =>
        familyOf(String(query.queryKey[0])) !== undefined,
    },
    ...persistOptions,
  };
  // `persistQueryClient` retourne [unsubscribe, promise] (doc v5) : il restaure
  // puis souscrit aux changements de cache, mais ne fait PAS de sauvegarde
  // initiale — le save ne part que sur événement de cache postérieur. On la
  // déclenche donc explicitement : le seed déjà présent au branchement est
  // persisté immédiatement, pas à la prochaine écriture.
  const [unsubscribe, promise] = persistQueryClient(persistProps);
  activeUnsubscribe = unsubscribe;
  await promise;
  await persistQueryClientSave(persistProps);
}

/**
 * Restore le cache persisté d'un couple (utilisateur, foyer) dans le client
 * donné. Idempotent par construction : hydrate fusionne par clé de requête,
 * rejouer le restore sur un client déjà hydraté produit le même état, sans
 * duplication (hypothèse flaggée OFFR-01-idempotency — le test le prouve).
 * TanStack jette lui-même le persist si le `buster` diffère (T-33-02).
 */
export async function restoreOfflineCache(
  client: QueryClient,
  userId: string,
  householdId: string,
): Promise<void> {
  const persister = buildPersister(userId, householdId);
  const persisted = await persister.restoreClient();
  if (!persisted) return; // rien de persisté : état vide honnête, rien à réinjecter
  if (persisted.buster !== OFFLINE_CACHE_BUSTER) return; // forme d'un autre build : jetée
  hydrateState(client, persisted.clientState);
}

/**
 * Écarte du cache les familles allowlistées dont le maxAge est dépassé
 * (D-09, T-33-07) — à appeler immédiatement après le restore, AVANT que le
 * routeur ne monte. Une donnée trop vieille est RETIRÉE, jamais rendue comme
 * fraîche : hors ligne, la page voit l'état vide honnête.
 *
 * POURQUOI UN PRÉDICATE ET PAS LE maxAge GLOBAL (Pitfall 3) : voir le
 * commentaire de `persistNow`. POURQUOI LE PRÉDICATE LAISSE PASSER LES
 * FAMILLES HORS ALLOWLIST : elles ne sont jamais hydratées (filtre à
 * l'écriture, D-01) — la prune ne leur dit rien, les toucher serait un
 * comportement qu'aucun test ne réclame. L'horloge est `dataUpdatedAt` au
 * moment du restore : la sémantique d'expiration n'est PAS re-évaluée en
 * continu (OFFR-03, hypothèse flaggée).
 */
export function pruneExpiredFamilies(client: QueryClient, now = Date.now()): void {
  client.removeQueries({
    predicate: (query: Query) => {
      const family = familyOf(String(query.queryKey[0]));
      if (!family) return false; // hors allowlist : jamais hydraté de toute façon
      return now - query.state.dataUpdatedAt > family.maxAgeMs;
    },
  });
}

/**
 * Branche le cache offline pour un couple (utilisateur, foyer) : restore du
 * persisté, élagage des familles périmées (D-09), puis souscription du persist
 * (Pitfall 6 : l'ancienne souscription est désabonnée d'abord, via
 * `persistNow`). C'est la fonction qu'appelle `useAuthBootstrap` entre
 * `applySession` et `setReady(true)` (OFFR-01) — extraite ici pour être
 * prouvée par test (AGENTS.md §2.7 D) : le branchement lui-même vit dans le
 * hook, la mécanique vit dans le module.
 *
 * L'ordre impose restore AVANT prune AVANT souscription : la souscription
 * garde un cache déjà élagué, et aucune donnée périmée n'a le temps d'être
 * rendue entre le hydrate et la prune (même micro-tâche, `await` séquentiel).
 */
export async function connectOfflineCache(
  client: QueryClient,
  userId: string,
  householdId: string,
  options: Partial<PersistQueryClientOptions> & { throttleTime?: number } = {},
): Promise<void> {
  await restoreOfflineCache(client, userId, householdId);
  pruneExpiredFamilies(client);
  await persistNow(client, userId, householdId, options);
}
