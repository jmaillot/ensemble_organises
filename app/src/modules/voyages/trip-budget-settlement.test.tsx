/**
 * 15-03 (tâche 3) : la répartition de l'onglet Budget vient du fetcher
 * serveur tel quel — aucune logique forkée (D-09).
 *
 * Mise en scène : `isSupabaseConfigured` forcé (le fetcher réel serait alors
 * appelé par `useServerSettlement`), `fetchArdoiseSettlement` moqué au bord
 * réseau avec une charge serveur, `data` rebranché sur l'adaptateur local
 * (les lectures restent démo). Preuve : la charge moquée traverse
 * `toServerBalances`/`toServerSettlements` réels et rend « soldes serveur ».
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import { fetchArdoiseSettlement, type ArdoiseServerSettlement } from '@/modules/ardoise/api';
import { TripBudgetTab } from './components/trip-budget-tab';

vi.mock('@/lib/supabase/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/client')>()),
  isSupabaseConfigured: true,
}));

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  data: (await import('@/lib/data/local-adapter')).getLocalAdapter(),
  isLocalMode: true,
}));

const SERVER_SETTLEMENT: ArdoiseServerSettlement = {
  ardoise_id: 'ardoise-trip-1',
  household_id: DEMO_HOUSEHOLD_ID,
  balances: [
    { kind: 'membre', participant_id: DEMO_MEMBERS.camille, display_name: 'Camille Martin', amount: 60 },
    { kind: 'membre', participant_id: DEMO_MEMBERS.thomas, display_name: 'Thomas Martin', amount: -60 },
  ],
  settlements: [
    {
      from_kind: 'membre',
      from_id: DEMO_MEMBERS.thomas,
      from_name: 'Thomas Martin',
      to_kind: 'membre',
      to_id: DEMO_MEMBERS.camille,
      to_name: 'Camille Martin',
      amount: 60,
    },
  ],
  generated_at: new Date().toISOString(),
};

vi.mock('@/modules/ardoise/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/ardoise/api')>()),
  fetchArdoiseSettlement: vi.fn(async () => SERVER_SETTLEMENT),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const tripMembers = demoMembers.filter(
  (member) => member.id === DEMO_MEMBERS.camille || member.id === DEMO_MEMBERS.thomas,
);

describe('TripBudgetTab — répartition serveur telle quelle (15-03)', () => {
  it('le fetcher serveur est appelé sur l’ardoise liée, rendu « soldes serveur »', async () => {
    renderWithProviders(
      <TripBudgetTab
        tripId="trip-1"
        householdId={DEMO_HOUSEHOLD_ID}
        members={tripMembers}
        guests={[]}
        currentMemberId={DEMO_MEMBERS.camille}
      />,
    );

    expect(await screen.findByText('Vols aller-retour')).toBeInTheDocument();
    // La charge moquée a traversé les mappeurs réels : source serveur avouée.
    expect((await screen.findAllByText('Soldes calculés côté serveur.')).length).toBeGreaterThanOrEqual(1);
    expect(fetchArdoiseSettlement).toHaveBeenCalledWith('ardoise-trip-1', null);
  });
});
