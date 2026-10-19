import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

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
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
  mutations: { retry: 0 },
};

/**
 * Fabrique le `QueryClient` à partir de `QUERY_POLICY`, en fusionnant par
 * dessus les surcharges de `queries` et `mutations` (fusion à un niveau : une
 * surcharge n'efface que les clés qu'elle nomme, jamais tout le bloc).
 *
 * Le harnais de test s'en sert pour ses valeurs courtes (`retry: false`,
 * `gcTime: 0`) sans cesser d'exercer la politique réelle de l'application.
 */
export function buildQueryClient(overrides: DefaultOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      ...QUERY_POLICY,
      ...overrides,
      queries: { ...QUERY_POLICY.queries, ...overrides.queries },
      mutations: { ...QUERY_POLICY.mutations, ...overrides.mutations },
    },
  });
}
