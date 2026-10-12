import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import TripDetailPage from './trip-detail-page';

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-test' } } }) },
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signe.example/${path}` }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  },
}));

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return { ...actual, data: getLocalAdapter(), isLocalMode: true };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Faux serveur à la frontière HTTP : reçoit les actions Edge et applique les
 * MÊMES lignes que les RPC (`trip_close`, `trip_reopen`, `trip_leave`). Le
 * code client réel est exercé de bout en bout ; les RPC eux-mêmes sont
 * prouvés par la suite SQL 0053.
 */
function fakeTripInviteEdge() {
  return vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const payload = JSON.parse(String((init?.body as string) ?? '{}')) as {
      action: string;
      tripId?: string;
    };
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    if (payload.action === 'close' && payload.tripId) {
      await adapter.update('trips', payload.tripId, { is_closed: true } as never);
      return new Response(JSON.stringify({ trip_id: payload.tripId, is_closed: true }), { status: 200 });
    }
    if (payload.action === 'reopen' && payload.tripId) {
      await adapter.update('trips', payload.tripId, { is_closed: false } as never);
      return new Response(JSON.stringify({ trip_id: payload.tripId, is_closed: false }), { status: 200 });
    }
    if (payload.action === 'member-leave' && payload.tripId) {
      await adapter.removeWhere(
        'trip_members',
        { trip_id: payload.tripId, member_id: DEMO_MEMBERS.thomas } as never,
      );
      return new Response(JSON.stringify({ trip_id: payload.tripId, left: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: `action inconnue : ${payload.action}` }), { status: 400 });
  });
}

function stubEdge() {
  vi.stubGlobal('fetch', fakeTripInviteEdge());
}

function renderDetail(route = '/voyages/trip-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/voyages" element={<p>Liste des voyages</p>} />
      <Route path="/voyages/:tripId" element={<TripDetailPage />} />
    </Routes>,
    { route },
  );
}

async function openParametres(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
  await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
}

const plain = (value: string | null | undefined) => (value ?? '').replace(/\s/g, ' ');

describe('TripDetailPage — Infos réelles (tâche 2)', () => {
  it('affiche participants, invités et compteurs issus de lectures réelles', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter.create('shopping_lists', {
      id: 'trip-list-1',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      name: 'Valise',
      created_by: DEMO_MEMBERS.camille,
    } as never);
    await adapter.create('notes', {
      id: 'trip-note-1',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      title: 'Passeports',
      content: 'Vérifier les dates.',
      created_by: DEMO_MEMBERS.camille,
    } as never);
    await adapter.create('tasks', {
      id: 'trip-task-1',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      name: 'Réserver le vol',
      status: 'a_faire',
      created_by: DEMO_MEMBERS.thomas,
    } as never);
    await adapter.create('places', {
      id: 'trip-place-1',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      type: 'cafe',
      name: 'Café du port',
    } as never);
    await adapter.create('ardoises', {
      id: 'ardoise-trip-1',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-1',
      name: 'Week-end à Lisbonne',
      created_by: DEMO_MEMBERS.camille,
    } as never);
    await adapter.create('expenses', {
      id: 'trip-expense-1',
      household_id: DEMO_HOUSEHOLD_ID,
      ardoise_id: 'ardoise-trip-1',
      title: 'Vol aller',
      amount: 30,
      paid_by: DEMO_MEMBERS.camille,
      expense_date: '2027-04-12',
      split_type: 'egal',
    } as never);
    await adapter.create('expenses', {
      id: 'trip-expense-2',
      household_id: DEMO_HOUSEHOLD_ID,
      ardoise_id: 'ardoise-trip-1',
      title: 'Hôtel',
      amount: 20,
      paid_by: DEMO_MEMBERS.thomas,
      expense_date: '2027-04-12',
      split_type: 'egal',
    } as never);
    try {
      renderDetail();

      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      // Participants réels, pas de chiffre décoratif.
      expect(screen.getByText('Camille Martin')).toBeInTheDocument();
      expect(screen.getByText('Thomas Martin')).toBeInTheDocument();
      // Un compteur par table tripée.
      expect(await screen.findByText('listes de courses du voyage')).toBeInTheDocument();
      const cards = screen.getAllByText(/du voyage$/);
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        const value = card.previousSibling as HTMLElement | null;
        expect(value?.textContent).toBe('1');
      }
      // Budget lié : 2 dépenses, total 50 €.
      const budget = await screen.findByText(/dépense/);
      expect(plain(budget.textContent)).toContain('2 dépenses');
      expect(plain(budget.textContent)).toContain('50,00');
    } finally {
      await adapter.remove('expenses', 'trip-expense-1').catch(() => undefined);
      await adapter.remove('expenses', 'trip-expense-2').catch(() => undefined);
      await adapter.remove('ardoises', 'ardoise-trip-1').catch(() => undefined);
      await adapter.remove('places', 'trip-place-1').catch(() => undefined);
      await adapter.remove('tasks', 'trip-task-1').catch(() => undefined);
      await adapter.remove('notes', 'trip-note-1').catch(() => undefined);
      await adapter.remove('shopping_lists', 'trip-list-1').catch(() => undefined);
    }
  });
});

describe('TripDetailPage — Paramètres (tâche 2)', () => {
  it('édite les infos et le héros suit', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    renderDetail();
    await openParametres(user);

    await user.click(screen.getByRole('button', { name: 'Modifier les infos' }));
    const dialog = await screen.findByRole('dialog');
    const destination = within(dialog).getByLabelText(/Destination/);
    await user.clear(destination);
    await user.type(destination, 'Porto');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 2, name: 'Porto' })).toBeInTheDocument();

    await getLocalAdapter().update('trips', 'trip-1', { destination: 'Lisbonne' } as never);
  });

  it('masquer une rubrique retire l’onglet, la réafficher le rend avec son contenu (D-05)', async () => {
    const user = userEvent.setup();
    renderDetail();
    await openParametres(user);

    const toggle = screen.getByRole('checkbox', { name: 'Afficher la rubrique Budget' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Budget' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Infos' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Afficher la rubrique Budget' }));
    expect(await screen.findByRole('tab', { name: 'Budget' })).toBeInTheDocument();
  });

  it('fermer fige avec confirmation, rouvrir répare (admin seul, D-08)', async () => {
    stubEdge();
    const user = userEvent.setup();
    renderDetail();
    await openParametres(user);

    await user.click(screen.getByRole('button', { name: 'Figer le voyage' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Figer ce voyage ?')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Figer le voyage' }));

    expect(await screen.findByText(/Voyage figé : lecture seule/)).toBeInTheDocument();
    expect(screen.getByText(/l’édition reprendra/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rouvrir le voyage' }));
    await waitFor(() => {
      expect(screen.queryByText(/Voyage figé : lecture seule/)).not.toBeInTheDocument();
    });
  });

  it('un participant non-admin fige mais ne rouvre pas (D-08)', async () => {
    stubEdge();
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const user = userEvent.setup();
    try {
      renderWithProviders(
        <Routes>
          <Route path="/voyages" element={<p>Liste des voyages</p>} />
          <Route path="/voyages/:tripId" element={<TripDetailPage />} />
        </Routes>,
        { route: '/voyages/trip-1', withHousehold: false },
      );
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));

      await user.click(screen.getByRole('button', { name: 'Figer le voyage' }));
      const confirm = await screen.findByRole('alertdialog');
      await user.click(within(confirm).getByRole('button', { name: 'Figer le voyage' }));

      expect(await screen.findByText(/Voyage figé : lecture seule/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rouvrir le voyage' })).not.toBeInTheDocument();
    } finally {
      await getLocalAdapter().update('trips', 'trip-1', { is_closed: false } as never);
    }
  });

  it('quitter avec confirmation retire et ramène à la liste (T-15-09)', async () => {
    stubEdge();
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const user = userEvent.setup();
    try {
      renderWithProviders(
        <Routes>
          <Route path="/voyages" element={<p>Liste des voyages</p>} />
          <Route path="/voyages/:tripId" element={<TripDetailPage />} />
        </Routes>,
        { route: '/voyages/trip-1', withHousehold: false },
      );
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));

      await user.click(screen.getByRole('button', { name: 'Quitter ce voyage' }));
      const confirm = await screen.findByRole('alertdialog');
      await user.click(within(confirm).getByRole('button', { name: 'Quitter' }));

      // Redirection vers la liste après le départ.
      expect(await screen.findByText('Liste des voyages')).toBeInTheDocument();
      expect((await getLocalAdapter().list('trip_members', { trip_id: 'trip-1' })).some(
        (entry) => (entry as unknown as { member_id: string }).member_id === DEMO_MEMBERS.thomas,
      )).toBe(false);
    } finally {
      await getLocalAdapter()
        .create('trip_members', { trip_id: 'trip-1', member_id: DEMO_MEMBERS.thomas } as never)
        .catch(() => undefined);
    }
  });
});
