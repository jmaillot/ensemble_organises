import type { ReactElement } from 'react';
import { render, waitFor, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { expect } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { useHouseholdStore } from '@/stores/household-store';
import { buildQueryClient } from '@/lib/query-policy';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoHousehold, demoMembers } from '@/lib/data/seed';

/**
 * Borne d'attente d'un ÉTAT de requête, en millisecondes.
 *
 * 8 s est la valeur DÉJÀ relevée dans `use-notifications.test.tsx` pour la même
 * raison (une suite complète charge la machine). Elle est passée explicitement,
 * et non héritée de l'`asyncUtilTimeout` par défaut : sans borne, cette aide
 * remplacerait un `findBy*` de 1 s par un `waitFor` de 1 s, c'est-à-dire le
 * même flake sous un autre nom.
 */
export const QUERY_STATE_TIMEOUT = 8000;

/**
 * Attend qu'une requête du cache atteigne un état donné.
 *
 * L'attente porte sur un ÉTAT OBSERVABLE, jamais sur un rendu ni sur une valeur
 * affichée : c'est ce qui rend une garde falsifiable sans dépendre de la
 * rapidité de la machine. La borne reste une horloge — ce qui est ASSERÉ après
 * l'attente (un chiffre, une absence) n'en dépend pas ; elle ne fait qu'attendre
 * un événement qui doit finir par arriver.
 */
export async function waitForQueryStatus(
  queryClient: QueryClient,
  keyPrefix: readonly unknown[],
  status: 'pending' | 'success' | 'error' = 'success',
  timeout: number = QUERY_STATE_TIMEOUT,
): Promise<void> {
  await waitFor(
    () => {
      const entries = queryClient.getQueryCache().findAll({ queryKey: keyPrefix });
      expect(entries.some((entry) => entry.state.status === status)).toBe(true);
    },
    { timeout },
  );
}

export function createTestQueryClient() {
  // Le client de test DÉRIVE de la politique de l'application : les tests
  // exercent donc la politique réelle, jamais une politique recopiée ici.
  return buildQueryClient({ queries: { retry: false, gcTime: 0, staleTime: 0 } });
}

/** Place le foyer de démonstration dans le store avant rendu. */
export function seedHouseholdStore() {
  useHouseholdStore.setState({
    householdId: DEMO_HOUSEHOLD_ID,
    householdName: demoHousehold.name,
    householdColor: demoHousehold.avatar_color,
    members: demoMembers,
    currentMemberId: DEMO_MEMBERS.camille,
  });
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string | { pathname: string; state?: unknown };
  queryClient?: QueryClient;
  withHousehold?: boolean;
}

export function renderWithProviders(ui: ReactElement, options: RenderWithProvidersOptions = {}): RenderResult & { queryClient: QueryClient } {
  const { route = '/', queryClient = createTestQueryClient(), withHousehold = true, ...rest } = options;
  if (withHousehold) seedHouseholdStore();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient };
}
