import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { formatEuro } from '@/lib/utils';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import ArdoisePage from './ardoise-page';
import type { ServerSettlement } from './api';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

// Frontière client : Supabase configuré, snapshots sur l'adaptateur local,
// `expense-settlement` sur le stub. Le code réel de `api.ts` est exercé.
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return { ...actual, data: getLocalAdapter(), isLocalMode: true };
});

/** Soldes volontairement différents du calcul local : la provenance se voit. */
const serverPayload: ServerSettlement = {
  household_id: DEMO_HOUSEHOLD_ID,
  balances: [
    { member_id: DEMO_MEMBERS.camille, display_name: 'Camille Martin', amount: 100 },
    { member_id: DEMO_MEMBERS.thomas, display_name: 'Thomas Martin', amount: -50 },
    { member_id: DEMO_MEMBERS.lina, display_name: 'Lina Martin', amount: -50 },
    { member_id: DEMO_MEMBERS.noe, display_name: 'Noé Martin', amount: 0 },
  ],
  settlements: [
    {
      from_member_id: DEMO_MEMBERS.thomas,
      from_name: 'Thomas Martin',
      to_member_id: DEMO_MEMBERS.camille,
      to_name: 'Camille Martin',
      amount: 50,
    },
  ],
  generated_at: '2026-09-30T10:00:00.000Z',
};

/** `formatEuro` insère une espace insécable : on la normalise avant de comparer. */
const plain = (value: string) => value.replace(/ /g, ' ');
const rowText = (testId: string) => plain(screen.getByTestId(testId).textContent ?? '');

describe('ArdoisePage — soldes serveur', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('affiche les soldes et transferts du serveur, externes locaux conservés', async () => {
    mockInvoke.mockResolvedValueOnce({ data: serverPayload, error: null });
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    expect(mockInvoke).toHaveBeenCalledWith('expense-settlement', { body: { household_id: DEMO_HOUSEHOLD_ID } });
    expect(await screen.findByText('Soldes calculés côté serveur.')).toBeInTheDocument();
    // Le snapshot local (externes) peut arriver après le serveur : attendre.
    await screen.findByText('Courses du samedi');

    // Soldes serveur, pas calcul local (Thomas local ≈ +19,98, serveur −50).
    expect(rowText(`balance-row-membre:${DEMO_MEMBERS.thomas}`)).toContain(plain(formatEuro(-50)));
    expect(rowText(`balance-row-membre:${DEMO_MEMBERS.camille}`)).toContain(plain(formatEuro(100)));
    // Enfant exclu comme dans les graines locales, externe conservé.
    expect(screen.queryByTestId(`balance-row-membre:${DEMO_MEMBERS.noe}`)).toBeNull();
    expect(screen.getByTestId('balance-row-externe:external-1')).toBeInTheDocument();

    // Transfert serveur proposé tel quel.
    expect(await screen.findByRole('button', { name: 'Copier le règlement : Thomas Martin vers Camille Martin' })).toBeInTheDocument();
  });

  it('bascule sur le calcul local quand le serveur est injoignable', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('réseau coupé'));
    renderWithProviders(<ArdoisePage />, { route: '/ardoise' });

    expect(await screen.findByText('Calcul automatique à chaque ajout.')).toBeInTheDocument();
    await screen.findByText('Courses du samedi');
    expect(screen.getByTestId('balance-row-externe:external-1')).toBeInTheDocument();
  });
});
