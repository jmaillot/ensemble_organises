import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { TripCreateDialog, type TripCreateValues } from './components/trip-create-dialog';
import {
  createTripFlow,
  fetchTripMembers,
  fetchTripRow,
  readTripTicket,
  writeTripTicket,
} from './api';
import { DEFAULT_TRIP_COVER } from './types';

/**
 * WR-09 — la couverture en échec doit emporter le voyage créé. Le mode Supabase
 * est simulé par un drapeau LU À L'APPEL (`createTripFlow` lit
 * `isSupabaseConfigured` à l'exécution), tandis que `data` reste l'adaptateur
 * local — sa `remove('trips', id)` est alors observable et prouve la
 * compensation, là où l'ancien code laissait le voyage.
 */
const { depositMock, supabaseState, authMock } = vi.hoisted(() => ({
  depositMock: vi.fn(),
  supabaseState: { configured: false },
  authMock: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jeton-test' } } })) },
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, depositHouseholdFile: depositMock };
});

vi.mock('@/lib/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/client')>();
  return {
    ...actual,
    get isSupabaseConfigured() {
      return supabaseState.configured;
    },
    get supabase() {
      return supabaseState.configured ? { auth: authMock } : null;
    },
    get supabaseFunctionsBase() {
      return supabaseState.configured ? 'https://api.example/functions/v1' : null;
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
  depositMock.mockReset();
});

async function fillInfos(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour à Copenhague');
  await user.type(screen.getByLabelText(/Destination/), 'Copenhague');
  await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
  await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
}

describe('TripCreateDialog — participants et rubriques (0119 → D-06 phase 25)', () => {
  it('propose les adultes et exclut l’enfant sans « voyages » (D-06)', async () => {
    renderWithProviders(
      <TripCreateDialog open onOpenChange={() => {}} onSubmit={async () => null} />,
    );

    const dialog = await screen.findByRole('dialog');
    // Les adultes sont toujours proposés.
    expect(within(dialog).getByText('Camille Martin')).toBeInTheDocument();
    expect(within(dialog).getByText('Thomas Martin')).toBeInTheDocument();
    expect(within(dialog).getByText('Lina Martin')).toBeInTheDocument();
    expect(within(dialog).getByText('Maya Martin')).toBeInTheDocument();
    // D-06 : Noé (enfant, sans « voyages » dans la fiche) n'apparaît pas.
    expect(within(dialog).queryByText('Noé Martin')).not.toBeInTheDocument();
  });

  it('coche par défaut tous les éligibles (adultes) et toutes les rubriques', async () => {
    renderWithProviders(
      <TripCreateDialog open onOpenChange={() => {}} onSubmit={async () => null} />,
    );

    const dialog = await screen.findByRole('dialog');
    const boxes = within(dialog).getAllByRole('checkbox', { checked: true });
    // 4 participants (adultes, enfant exclu D-06) + 5 rubriques basculables.
    expect(boxes).toHaveLength(9);
  });

  it('soumet les participants et rubriques choisis, puis se ferme sur l’id', async () => {
    const user = userEvent.setup();
    const submitted: TripCreateValues[] = [];
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <TripCreateDialog
          open={open}
          onOpenChange={setOpen}
          onSubmit={async (values) => {
            submitted.push(values);
            return 'trip-nouveau';
          }}
        />
      );
    }
    renderWithProviders(<Harness />);

    await fillInfos(user);
    // Lina ne voyage pas cette fois.
    await user.click(screen.getByText('Lina Martin'));
    await user.click(screen.getByRole('button', { name: 'Créer le voyage' }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    const values = submitted[0]!;
    expect(values.name).toBe('Séjour à Copenhague');
    expect(values.participantIds).toHaveLength(3);
    expect(values.participantIds).not.toContain('member-lina');
    expect(values.enabledTabs).toEqual(['courses', 'notes', 'taches', 'adresses', 'budget']);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuse sans participant (au moins un) sans appeler la création', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => 'trip-x');
    renderWithProviders(<TripCreateDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);

    await fillInfos(user);
    for (const name of ['Camille Martin', 'Thomas Martin', 'Lina Martin', 'Maya Martin']) {
      await user.click(screen.getByText(name));
    }
    await user.click(screen.getByRole('button', { name: 'Créer le voyage' }));

    expect(await screen.findByText('Sélectionnez au moins un participant.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('createTripFlow — repli démo (mêmes lignes que le serveur)', () => {
  it('crée voyage + participants + ardoise liée + inscriptions miroirs', async () => {
    seedHouseholdStore();
    const householdId = useHouseholdStore.getState().householdId ?? DEMO_HOUSEHOLD_ID;

    const tripId = await createTripFlow({
      householdId,
      input: {
        name: 'Séjour à Bergen',
        destination: 'Bergen',
        startDate: '2027-09-10',
        endDate: '2027-09-16',
        coverPhoto: DEFAULT_TRIP_COVER,
        notes: '',
        participantIds: ['member-camille', 'member-thomas'],
        enabledTabs: ['courses', 'budget'],
      },
      createdByMemberId: 'member-camille',
    });

    try {
      const row = await fetchTripRow(tripId);
      expect(row?.name).toBe('Séjour à Bergen');
      expect(row?.created_by).toBe('member-camille');
      expect(row?.is_closed).toBe(false);
      expect(row?.tab_state).toMatchObject({ courses: true, budget: true, notes: false });

      const members = await fetchTripMembers(tripId);
      expect(members.map((entry) => entry.member_id).sort()).toEqual(['member-camille', 'member-thomas']);

      const { getLocalAdapter } = await import('@/lib/data/local-adapter');
      const ardoises = await getLocalAdapter().list<{ id: string; trip_id: string }>('ardoises', {
        trip_id: tripId,
      });
      expect(ardoises).toHaveLength(1);
      const enrollments = await getLocalAdapter().list<{ member_id: string }>('ardoise_members', {
        ardoise_id: ardoises[0]!.id,
      });
      expect(enrollments.map((entry) => entry.member_id).sort()).toEqual(['member-camille', 'member-thomas']);
    } finally {
      const { getLocalAdapter } = await import('@/lib/data/local-adapter');
      const adapter = getLocalAdapter();
      await adapter.removeWhere('ardoise_members', { ardoise_id: (await adapter.list<{ id: string }>('ardoises', { trip_id: tripId }))[0]?.id ?? 'rien' }).catch(() => undefined);
      await adapter.removeWhere('ardoises', { trip_id: tripId }).catch(() => undefined);
      await adapter.removeWhere('trip_members', { trip_id: tripId }).catch(() => undefined);
      await adapter.remove('trips', tripId).catch(() => undefined);
    }
  });

  it('le ticket invité est mémorisé par voyage, jamais global', () => {
    writeTripTicket('trip-1', 'ticket-brut-1');
    expect(readTripTicket('trip-1')).toBe('ticket-brut-1');
    expect(readTripTicket('trip-2')).toBeNull();
  });
});

/**
 * WR-09 : le dépôt de couverture en échec, en mode Supabase, doit retirer le
 * voyage créé par l'Edge (`deleteTrip`) avant de propager l'erreur d'origine.
 * Sans compensation, une réédition créait un SECOND voyage — le doublon décrit.
 */
describe('createTripFlow — la couverture en échec emporte le voyage (WR-09)', () => {
  it('retire le voyage créé (deleteTrip) et propage l’erreur d’origine', async () => {
    seedHouseholdStore();
    const householdId = useHouseholdStore.getState().householdId ?? DEMO_HOUSEHOLD_ID;
    supabaseState.configured = true;
    depositMock.mockRejectedValueOnce(new Error('stockage indisponible'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ trip_id: 'trip-supabase-nouveau', ardoise_id: 'ardoise-supabase-nouveau' }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const removeSpy = vi.spyOn(data, 'remove');
    try {
      await expect(
        createTripFlow({
          householdId,
          input: {
            name: 'Séjour à Porto',
            destination: 'Porto',
            startDate: '2027-09-10',
            endDate: '2027-09-16',
            coverPhoto: DEFAULT_TRIP_COVER,
            notes: '',
            participantIds: ['member-camille'],
            enabledTabs: ['budget'],
            coverFile: new File(['pixels'], 'porto.jpg', { type: 'image/jpeg' }),
          },
          createdByMemberId: 'member-camille',
        }),
      ).rejects.toThrow('stockage indisponible');

      // L'Edge a bien été appelée puis le voyage retiré, dans cet ordre.
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example/functions/v1/trip-invite',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(removeSpy).toHaveBeenCalledWith('trips', 'trip-supabase-nouveau');
    } finally {
      removeSpy.mockRestore();
      globalThis.fetch = originalFetch;
    }
  });

  it('sans fichier de couverture, aucun retrait (rien à compenser)', async () => {
    seedHouseholdStore();
    const householdId = useHouseholdStore.getState().householdId ?? DEMO_HOUSEHOLD_ID;
    supabaseState.configured = true;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ trip_id: 'trip-supabase-sans-cover', ardoise_id: 'ardoise-sans-cover' }),
    }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const removeSpy = vi.spyOn(data, 'remove');
    try {
      const tripId = await createTripFlow({
        householdId,
        input: {
          name: 'Séjour à Porto',
          destination: 'Porto',
          startDate: '2027-09-10',
          endDate: '2027-09-16',
          coverPhoto: DEFAULT_TRIP_COVER,
          notes: '',
          participantIds: ['member-camille'],
          enabledTabs: ['budget'],
        },
        createdByMemberId: 'member-camille',
      });
      expect(tripId).toBe('trip-supabase-sans-cover');
      expect(removeSpy).not.toHaveBeenCalled();
    } finally {
      removeSpy.mockRestore();
      globalThis.fetch = originalFetch;
    }
  });
});
