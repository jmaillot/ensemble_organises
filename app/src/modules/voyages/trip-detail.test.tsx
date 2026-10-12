import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import TripDetailPage from './trip-detail-page';
import { DEFAULT_TAB_STATE } from './types';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDetail(route = '/voyages/trip-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/voyages/:tripId" element={<TripDetailPage />} />
    </Routes>,
    { route },
  );
}

function tablist(): HTMLElement {
  return screen.getByRole('tablist', { name: 'Rubriques du voyage' });
}

describe('TripDetailPage — fiche avec barre d’onglets (tracer 15-02)', () => {
  it('un participant atterrit sur le héros et les sept onglets', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { level: 2, name: 'Lisbonne' })).toBeInTheDocument();
    const tabs = within(tablist()).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Infos',
      'Courses',
      'Notes',
      'Tâches',
      'Adresses',
      'Budget',
      'Paramètres',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('changer d’onglet change le panneau affiché', async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(within(tablist()).getByRole('tab', { name: 'Budget' }));

    // 15-03 : l'onglet Budget montre l'ardoise liée, plus le placeholder.
    expect(await screen.findByText('Vols aller-retour')).toBeInTheDocument();
    expect(within(tablist()).getByRole('tab', { name: 'Budget' })).toHaveAttribute('aria-selected', 'true');
  });

  it('un onglet désactivé est masqué, les autres restent (D-05)', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter.update('trips', 'trip-1', {
      tab_state: { ...DEFAULT_TAB_STATE, budget: false },
    } as never);
    try {
      renderDetail();

      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await waitFor(() => {
        expect(within(tablist()).queryByRole('tab', { name: 'Budget' })).not.toBeInTheDocument();
      });
      expect(within(tablist()).getByRole('tab', { name: 'Infos' })).toBeInTheDocument();
      expect(within(tablist()).getByRole('tab', { name: 'Paramètres' })).toBeInTheDocument();
    } finally {
      await adapter.update('trips', 'trip-1', { tab_state: null } as never);
    }
  });

  it('un membre non-participant non-admin voit l’état non-autorisé, jamais la fiche (T-15-07)', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.lina });
    renderWithProviders(
      <Routes>
        <Route path="/voyages/:tripId" element={<TripDetailPage />} />
      </Routes>,
      { route: '/voyages/trip-1', withHousehold: false },
    );

    expect(await screen.findByText('Voyage non accessible')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Lisbonne' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('un admin non-participant lit en modération, sans action de membre (D-07)', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    // Voyage de Thomas seul : Camille (admin) le voit sans y participer.
    await adapter.create('trips', {
      id: 'trip-moderation',
      household_id: 'household-martin',
      name: 'Séjour de Thomas',
      destination: 'Oslo',
      start_date: '2027-06-10',
      end_date: '2027-06-16',
      cover_photo: null,
      notes: null,
      created_by: DEMO_MEMBERS.thomas,
      tab_state: null,
      is_closed: false,
    } as never);
    await adapter.create('trip_members', { trip_id: 'trip-moderation', member_id: DEMO_MEMBERS.thomas } as never);
    try {
      renderDetail('/voyages/trip-moderation');

      expect(await screen.findByRole('heading', { level: 2, name: 'Oslo' })).toBeInTheDocument();
      expect(screen.getByText(/Vue de modération/)).toBeInTheDocument();
    } finally {
      await adapter.removeWhere('trip_members', { trip_id: 'trip-moderation' }).catch(() => undefined);
      await adapter.remove('trips', 'trip-moderation').catch(() => undefined);
    }
  });
});
