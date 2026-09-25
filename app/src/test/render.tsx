import type { ReactElement } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoHousehold, demoMembers } from '@/lib/data/seed';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
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
  route?: string;
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
