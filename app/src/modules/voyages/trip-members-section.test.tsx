import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

type Row = Record<string, string>;

/**
 * Faux serveur à la frontière HTTP : applique les MÊMES lignes que les RPC
 * 0120 (`trip_add_member`, `trip_remove_member`), garde du dernier
 * participant comprise. Les RPC eux-mêmes sont prouvés par la suite SQL.
 */
function fakeTripInviteEdge() {
  return vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const payload = JSON.parse(String((init?.body as string) ?? '{}')) as {
      action: string;
      tripId?: string;
      memberId?: string;
    };
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    if (payload.action === 'member-add' && payload.tripId && payload.memberId) {
      const existing = (await adapter.list('trip_members', { trip_id: payload.tripId })) as Row[];
      if (!existing.some((entry) => entry.member_id === payload.memberId)) {
        await adapter.create('trip_members', { trip_id: payload.tripId, member_id: payload.memberId } as never);
        const target = ((await adapter.list('household_members', { id: payload.memberId })) as Row[])[0];
        if (target && (target.role === 'admin' || target.role === 'membre')) {
          const ardoises = (await adapter.list('ardoises', { trip_id: payload.tripId }).catch(() => [])) as Row[];
          if (ardoises[0]) {
            await adapter
              .create('ardoise_members', { ardoise_id: ardoises[0].id, member_id: payload.memberId } as never)
              .catch(() => undefined);
          }
        }
      }
      return new Response(
        JSON.stringify({ trip_id: payload.tripId, member_id: payload.memberId, already_member: false }),
        { status: 200 },
      );
    }
    if (payload.action === 'member-remove' && payload.tripId && payload.memberId) {
      const remaining = ((await adapter.list('trip_members', { trip_id: payload.tripId })) as Row[]).filter(
        (entry) => entry.member_id !== payload.memberId,
      );
      if (remaining.length === 0) {
        return new Response(JSON.stringify({ error: 'Le voyage garde au moins un participant.' }), { status: 400 });
      }
      await adapter.removeWhere('trip_members', { trip_id: payload.tripId, member_id: payload.memberId } as never);
      const ardoises = (await adapter.list('ardoises', { trip_id: payload.tripId }).catch(() => [])) as Row[];
      if (ardoises[0]) {
        await adapter
          .removeWhere('ardoise_members', { ardoise_id: ardoises[0].id, member_id: payload.memberId } as never)
          .catch(() => undefined);
      }
      return new Response(JSON.stringify({ trip_id: payload.tripId, member_id: payload.memberId, removed: true }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ error: `action inconnue : ${payload.action}` }), { status: 400 });
  });
}

function stubEdge() {
  vi.stubGlobal('fetch', fakeTripInviteEdge());
}

function renderDetail(route: string, withHousehold = true) {
  return renderWithProviders(
    <Routes>
      <Route path="/voyages/:tripId" element={<TripDetailPage />} />
    </Routes>,
    { route, withHousehold },
  );
}

async function openParametres(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
  await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
  await screen.findByText('Membres du voyage');
}

/** Voyage bac à sable : participants + ardoise liée, nettoyé en fin de test. */
async function createScratchTrip(participantIds: string[]) {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  const adapter = getLocalAdapter();
  await adapter.create('trips', {
    id: 'trip-scratch-membres',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Bac à sable membres',
    destination: 'Lisbonne',
    start_date: '2027-09-10',
    end_date: '2027-09-16',
    cover_photo: null,
    notes: null,
    created_by: DEMO_MEMBERS.camille,
    tab_state: null,
    is_closed: false,
  } as never);
  for (const memberId of participantIds) {
    await adapter.create('trip_members', { trip_id: 'trip-scratch-membres', member_id: memberId } as never);
  }
  await adapter.create('ardoises', {
    id: 'ardoise-scratch-membres',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Bac à sable membres',
    created_by: DEMO_MEMBERS.camille,
    trip_id: 'trip-scratch-membres',
  } as never);
  for (const memberId of participantIds) {
    if (memberId === DEMO_MEMBERS.noe) continue;
    await adapter.create('ardoise_members', { ardoise_id: 'ardoise-scratch-membres', member_id: memberId } as never);
  }
}

async function cleanupScratchTrip() {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  const adapter = getLocalAdapter();
  await adapter.removeWhere('ardoise_members', { ardoise_id: 'ardoise-scratch-membres' }).catch(() => undefined);
  await adapter.removeWhere('ardoises', { trip_id: 'trip-scratch-membres' }).catch(() => undefined);
  await adapter.removeWhere('trip_members', { trip_id: 'trip-scratch-membres' }).catch(() => undefined);
  await adapter.remove('trips', 'trip-scratch-membres').catch(() => undefined);
}

async function scratchMembers(): Promise<string[]> {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return (
    ((await getLocalAdapter().list('trip_members', { trip_id: 'trip-scratch-membres' })) as Row[]).map(
      (entry) => entry.member_id,
    )
  );
}

async function scratchArdoiseMembers(): Promise<string[]> {
  const { getLocalAdapter } = await import('@/lib/data/local-adapter');
  return (
    ((await getLocalAdapter().list('ardoise_members', { ardoise_id: 'ardoise-scratch-membres' })) as Row[]).map(
      (entry) => entry.member_id,
    )
  );
}

describe('TripMembersSection — rubrique Membres (0120)', () => {
  it('liste foyer + invités : participants cochés, autres décochés', async () => {
    const user = userEvent.setup();
    stubEdge();
    renderDetail('/voyages/trip-1');
    await openParametres(user);

    expect(screen.getByRole('checkbox', { name: 'Retirer Camille Martin' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Retirer Thomas Martin' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ajouter Lina Martin' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ajouter Maya Martin' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ajouter Noé Martin (enfant, sans budget)' })).not.toBeChecked();
    expect(screen.getByText(/Invités : Mamie/)).toBeInTheDocument();
  });

  it('cocher un adulte l’inscrit au voyage ET à l’ardoise liée', async () => {
    const user = userEvent.setup();
    stubEdge();
    await createScratchTrip([DEMO_MEMBERS.camille]);
    try {
      renderDetail('/voyages/trip-scratch-membres');
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      await screen.findByText('Membres du voyage');

      await user.click(screen.getByRole('checkbox', { name: 'Ajouter Lina Martin' }));
      await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Retirer Lina Martin' })).toBeChecked());
      expect(await scratchMembers()).toContain(DEMO_MEMBERS.lina);
      expect(await scratchArdoiseMembers()).toContain(DEMO_MEMBERS.lina);
      expect(await screen.findByText('Membre ajouté au voyage.')).toBeInTheDocument();
    } finally {
      await cleanupScratchTrip();
    }
  });

  it('cocher un enfant l’inscrit au voyage SANS l’ardoise', async () => {
    const user = userEvent.setup();
    stubEdge();
    await createScratchTrip([DEMO_MEMBERS.camille]);
    try {
      renderDetail('/voyages/trip-scratch-membres');
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      await screen.findByText('Membres du voyage');

      await user.click(screen.getByRole('checkbox', { name: 'Ajouter Noé Martin (enfant, sans budget)' }));
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: /Retirer Noé Martin/ })).toBeChecked(),
      );
      expect(await scratchMembers()).toContain(DEMO_MEMBERS.noe);
      expect(await scratchArdoiseMembers()).not.toContain(DEMO_MEMBERS.noe);
    } finally {
      await cleanupScratchTrip();
    }
  });

  it('décocher retire du voyage et de l’ardoise', async () => {
    const user = userEvent.setup();
    stubEdge();
    await createScratchTrip([DEMO_MEMBERS.camille, DEMO_MEMBERS.thomas]);
    try {
      renderDetail('/voyages/trip-scratch-membres');
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      await screen.findByText('Membres du voyage');

      await user.click(screen.getByRole('checkbox', { name: 'Retirer Thomas Martin' }));
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Ajouter Thomas Martin' })).not.toBeChecked(),
      );
      expect(await scratchMembers()).not.toContain(DEMO_MEMBERS.thomas);
      expect(await scratchArdoiseMembers()).not.toContain(DEMO_MEMBERS.thomas);
      expect(await screen.findByText('Membre retiré du voyage.')).toBeInTheDocument();
    } finally {
      await cleanupScratchTrip();
    }
  });

  it('refuse de retirer le dernier participant (garde serveur)', async () => {
    const user = userEvent.setup();
    stubEdge();
    await createScratchTrip([DEMO_MEMBERS.camille]);
    try {
      renderDetail('/voyages/trip-scratch-membres');
      await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
      await user.click(screen.getByRole('tab', { name: 'Paramètres' }));
      await screen.findByText('Membres du voyage');

      await user.click(screen.getByRole('checkbox', { name: 'Retirer Camille Martin' }));
      expect(await screen.findByText('Le voyage garde au moins un participant.')).toBeInTheDocument();
      expect(await scratchMembers()).toContain(DEMO_MEMBERS.camille);
    } finally {
      await cleanupScratchTrip();
    }
  });

  it('un membre non-admin voit la liste sans pouvoir la toucher', async () => {
    const user = userEvent.setup();
    stubEdge();
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    renderDetail('/voyages/trip-1', false);
    await openParametres(user);

    expect(screen.getByRole('checkbox', { name: 'Retirer Camille Martin' })).toBeDisabled();
    expect(
      screen.getByText('Voyageurs du foyer et invités. Seuls les administrateurs du foyer peuvent modifier la liste.'),
    ).toBeInTheDocument();
  });
});
