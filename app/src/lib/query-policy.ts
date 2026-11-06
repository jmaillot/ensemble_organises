import { MutationCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { enqueueOutbox, isNetworkFailure, type MutationMarker } from './offline/outbox';

/**
 * Politique de cache et de réseau du dépôt — SOURCE UNIQUE.
 *
 * POURQUOI UNE SOURCE UNIQUE, ET POURQUOI ICI. Le `QueryClient` de
 * l'application vivait en ligne dans `app/src/app/router.tsx`, et le harnais de
 * test construisait le sien de son côté (`app/src/test/render.tsx`). Deux
 * clients écrits à la main, c'est deux politiques : celle que l'application
 * applique réellement et celle que les tests exercent. Tant que les deux
 * recopient les mêmes chiffres, personne ne le voit ; le jour où une valeur
 * n'est posée que d'un côté, les tests restent verts pendant que l'application
 * se comporte autrement. La fabrique `buildQueryClient` supprime la deuxième
 * copie : la politique est écrite une fois, et `test/render.tsx` en **dérive**
 * comme `router.tsx`.
 *
 * POURQUOI CETTE FORME EST GARDÉE (garde de classe, AGENTS.md §2.7 E). Le
 * défaut qui a motivé cette politique (`networkMode`) comptait dix occurrences
 * d'état vide mensonger dans cinq modules. Corriger l'instance une à une les
 * aurait laissées revenir par la onzième. Ce qui est corrigé ici est la
 * **classe** : une politique posée en un point, dont tout client dérive. Le
 * Test E de `query-policy.test.ts` refuse un `new QueryClient(` en ligne
 * ailleurs que dans ce fichier ; le Test D vérifie que le client que
 * `main.tsx` monte résout bien ces valeurs, plutôt que de se contenter de
 * croire la constante. Sans ce second test, la constante pourrait rester juste
 * pendant que `router.tsx` revient à un client à lui.
 */
export const QUERY_POLICY: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    // Pitfall 1 (RESEARCH phase 33) : le gcTime doit couvrir l'horizon de
    // persistance offline — l'horizon le plus long est le maxAge des annexes
    // (7 jours, OFFLINE_FAMILIES). À 5 minutes, une query hydratée serait
    // collectée avant la prochaine sauvegarde : le cache persisterait un
    // état déjà vidé.
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    // `networkMode: 'always'` : TanStack ne met plus AUCUNE requête en pause.
    // Hors ligne, une lecture PART et échoue, donc `isError` devient vrai et
    // l'`ErrorState` que chaque page prévoit déjà s'affiche — au lieu de
    // `fetchStatus: 'paused'`, où `isLoading` et `isError` valent tous deux
    // `false` et où la garde d'état vide rend un mensonge (« aucune donnée »).
    networkMode: 'always',
    // À poser EXPLICITEMENT : dans le mode `'always'`, TanStack bascule
    // `refetchOnReconnect` à `false` par défaut (voir `defaultQueryOptions`
    // dans `queryClient.ts`). L'omettre ferait donc perdre le rechargement
    // automatique au retour du réseau — le remède créerait un autre mal.
    refetchOnReconnect: true,
  },
  // Le mode s'applique aussi aux ÉCRITURES : elles partagent `defaultOptions`.
  // Une écriture hors ligne échoue et affiche le message d'origine (D-10),
  // jamais une mise en file silencieuse.
  mutations: { retry: 0, networkMode: 'always' },
};

/**
 * Allowlist offline par famille de table (D-07) — SOURCE UNIQUE.
 *
 * POURQUOI À LA SÉRIALISATION, ET POURQUOI ICI. Le filtre d'écriture vit dans
 * `shouldDehydrateQuery` au moment où le cache part vers IndexedDB : hors de
 * cette liste, AUCUNE donnée ne quitte la mémoire (T-33-06). Sans allowlist,
 * TOUT le cache mémoire serait persisté — données Tier 2 (notes, ardoise,
 * cadeaux…), personnelles et volumineuses. `query-policy.ts` porte déjà la
 * politique réseau du dépôt : la frontière offline est une politique de cache
 * au même titre, elle vit au même endroit, et `familyOf` la lit d'ici.
 *
 * POURQUOI UN maxAge PAR FAMILLE (D-08, D-09). Les données vivantes (Tier 1)
 * se périment en 24 h : au-delà, le restore les écarte (pruneExpiredFamilies)
 * plutôt que de rendre un périmètre comme frais. Les annexes de rendu
 * (membres, profils — avatars et noms d'assignés, D-10) changent rarement :
 * 7 jours. Cette horloge est évaluée au restore, pas en continu (OFFR-03,
 * hypothèse flaggée).
 *
 * Les préfixes sont les tables réelles des hooks Tier 1 (constantes exportées
 * des api.ts) ; le test H de `query-policy.test.ts` refuse toute divergence.
 */
export const OFFLINE_FAMILIES: ReadonlyArray<{ prefix: string; maxAgeMs: number }> = [
  // Tier 1 — données vivantes (D-08 : horizon 24 h)
  { prefix: 'shopping_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'shopping_list_items', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'products', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'task_lists', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'tasks', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'task_assignees', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routine_folders', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routines', maxAgeMs: 24 * 60 * 60 * 1000 },
  { prefix: 'routine_completions', maxAgeMs: 24 * 60 * 60 * 1000 },
  // Annexes de rendu (D-10) : sans elles, avatars et noms d'assignés manquent
  { prefix: 'household_members', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
  { prefix: 'profiles', maxAgeMs: 7 * 24 * 60 * 60 * 1000 },
];

/**
 * Liste blanche d'ÉCRITURE — SOURCE UNIQUE désormais dans
 * `data/write-policy.ts`. Le bloc a été descendu là (T-34-05) pour que
 * `supabase-adapter.ts` puisse poser la garde sans importer ce fichier
 * (qui tire la fabrique TanStack et la file d'écriture). Ce fichier
 * ré-exporte : les consommateurs existants ne bougent pas.
 */
export { WRITE_ALLOWLIST, isWriteAllowed, OFFLINE_WRITE_REFUSED_MESSAGE, assertWriteAllowed } from './data/write-policy';
import { isWriteAllowed } from './data/write-policy';

/**
 * Fabrique le `QueryClient` à partir de `QUERY_POLICY`, en fusionnant par
 * dessus les surcharges de `queries` et `mutations` (fusion à un niveau : une
 * surcharge n'efface que les clés qu'elle nomme, jamais tout le bloc).
 *
 * Le harnais de test s'en sert pour ses valeurs courtes (`retry: false`,
 * `gcTime: 0`) sans cesser d'exercer la politique réelle de l'application.
 *
 * D-02 : le `MutationCache` central est installé ICI, une fois, par la
 * fabrique — aucun branchement par vue (garde de classe §2.7 E). La closure
 * référence `client` avant sa création : `onError` ne s'exécute qu'après
 * coup, la zone morte n'est jamais traversée.
 */
export function buildQueryClient(overrides: DefaultOptions = {}): QueryClient {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      // Pitfall 1 : on n'utilise PAS le chemin TanStack « paused mutations »
      // (`setMutationDefaults` + `resumePausedMutations`) — sous
      // `networkMode: 'always'` une mutation ne se met JAMAIS en pause, elle
      // ÉCHOUE. C'est donc ici, sur l'échec, que l'enfilage se décide.
      onError: (error, variables, _onMutateResult, mutation) => {
        const marker = mutation.options.meta as MutationMarker | undefined;
        // Une mutation non marquée (aucune table) ne concerne pas la file.
        if (!marker?.table || !marker.operation) return;
        // Défense en profondeur (T-34-05) : la garde upfront (D-07) est la
        // voie normale du refus ; ce filtre ferme tout chemin oublié
        // (ex. useLinkedRows, Pitfall 6).
        if (!isWriteAllowed(marker.table)) return;
        // Pitfall 2 : seul un échec réseau/5xx part en file — un refus RLS
        // ou de validation en ligne échoue devant l'utilisateur, point.
        if (!isNetworkFailure(error)) return;
        enqueueOutbox(client, marker, variables);
      },
    }),
    defaultOptions: {
      ...QUERY_POLICY,
      ...overrides,
      queries: { ...QUERY_POLICY.queries, ...overrides.queries },
      mutations: { ...QUERY_POLICY.mutations, ...overrides.mutations },
    },
  });
  return client;
}
