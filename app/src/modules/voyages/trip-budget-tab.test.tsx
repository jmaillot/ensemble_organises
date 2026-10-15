/**
 * 15-03 (tâche 3) : l'onglet Budget est une enveloppe fine — ardoise liée
 * résolue strictement, détail réel, dépenses invités sous ticket (D-04).
 *
 * Preuves : dépenses membres rendues par le vrai hook, ardoise inter-voyage
 * jamais résolue (T-15-13), absence honnête, corps invité dual (D-03),
 * dépense invitée affichée avec sa part, formulaire invité sous ticket seul.
 * (La répartition serveur est prouvée dans `trip-budget-settlement.test.ts`.)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import { guestKey, memberKey } from '@/modules/ardoise/types';
import type { ArdoiseRow, TripGuestRow } from '@/types';
import { TripBudgetTab } from './components/trip-budget-tab';
import {
  fetchTripArdoise,
  resolveTripArdoiseId,
  toTripGuestExpenseBody,
  tripTicketStorageKey,
} from './api';

/**
 * WR-20/D-10 — la soumission invité doit répartir par `splitEqual` (le même
 * calcul que le chemin membre). L'appel Edge est doublé pour observer les parts
 * réellement transmises ; le reste de `./api` (validation, résolution) reste réel.
 */
const { createGuestExpenseMock } = vi.hoisted(() => ({ createGuestExpenseMock: vi.fn(async (_args: unknown) => ({})) }));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, createTripGuestExpense: createGuestExpenseMock };
});

beforeEach(() => {
  vi.clearAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    // Stockage indisponible : les tests sous ticket sont ignorés ci-dessous.
  }
});

const tripMembers = demoMembers.filter(
  (member) => member.id === DEMO_MEMBERS.camille || member.id === DEMO_MEMBERS.thomas,
);

function renderBudget(tripId = 'trip-1', readOnly = false) {
  return renderWithProviders(
    <TripBudgetTab
      tripId={tripId}
      householdId={DEMO_HOUSEHOLD_ID}
      members={tripMembers}
      guests={[]}
      currentMemberId={DEMO_MEMBERS.camille}
      readOnly={readOnly}
    />,
  );
}

describe('TripBudgetTab — enveloppe ardoise liée (15-03)', () => {
  it('montre les dépenses de l’ardoise liée (chemin membre, hook réel)', async () => {
    renderBudget();

    expect(await screen.findByText('Vols aller-retour')).toBeInTheDocument();
    expect(screen.getByText('Logement')).toBeInTheDocument();
    expect(screen.getByText('Répartition')).toBeInTheDocument();
  });

  it('résolution stricte : un autre voyage ou un autre foyer ne résout jamais (T-15-13)', () => {
    const rows: Pick<ArdoiseRow, 'id' | 'trip_id' | 'household_id'>[] = [
      { id: 'ardoise-trip-1', trip_id: 'trip-1', household_id: DEMO_HOUSEHOLD_ID },
      { id: 'ardoise-trip-2', trip_id: 'trip-2', household_id: DEMO_HOUSEHOLD_ID },
    ];
    expect(resolveTripArdoiseId(rows, 'trip-1', DEMO_HOUSEHOLD_ID)).toBe('ardoise-trip-1');
    // Même foyer, autre voyage : jamais résolu.
    expect(resolveTripArdoiseId(rows, 'trip-2', DEMO_HOUSEHOLD_ID)).toBe('ardoise-trip-2');
    expect(resolveTripArdoiseId(rows, 'trip-3', DEMO_HOUSEHOLD_ID)).toBeNull();
    // Même voyage, autre foyer : jamais résolu (garde même-foyer).
    expect(resolveTripArdoiseId(rows, 'trip-1', 'household-autre')).toBeNull();
  });

  it('fetchTripArdoise : voyage sans ardoise → null honnête', async () => {
    await expect(fetchTripArdoise('trip-sans-ardoise', DEMO_HOUSEHOLD_ID)).resolves.toBeNull();
    const linked = await fetchTripArdoise('trip-1', DEMO_HOUSEHOLD_ID);
    expect(linked?.id).toBe('ardoise-trip-1');
  });

  it('sans ardoise liée, l’onglet dit l’erreur au lieu d’un vide silencieux', async () => {
    renderBudget('trip-sans-ardoise');

    expect(await screen.findByText(/Aucune ardoise liée/)).toBeInTheDocument();
  });

  it('corps invité : ticket transmis, parts duales membre/invité (D-03)', () => {
    const body = toTripGuestExpenseBody({
      ticket: 'ticket-brut-mamie',
      title: 'Courses au marché',
      amount: 60,
      parts: [
        { participantType: 'membre', memberId: DEMO_MEMBERS.camille, shareAmount: 30 },
        { participantType: 'guest', guestId: 'trip-guest-mamie', shareAmount: 30 },
      ],
    });
    expect(body).toMatchObject({
      ticket: 'ticket-brut-mamie',
      title: 'Courses au marché',
      amount: 60,
      parts: [
        { participantType: 'membre', memberId: DEMO_MEMBERS.camille, shareAmount: 30 },
        { participantType: 'guest', guestId: 'trip-guest-mamie', shareAmount: 30 },
      ],
    });
  });

  it('corps invité : ticket vide, montant nul et zéro part refusés', () => {
    const base = {
      title: 'Courses',
      amount: 10,
      parts: [{ participantType: 'membre' as const, memberId: DEMO_MEMBERS.camille, shareAmount: 10 }],
    };
    expect(() => toTripGuestExpenseBody({ ...base, ticket: '  ' })).toThrow(/Ticket invalide/);
    expect(() => toTripGuestExpenseBody({ ...base, ticket: 't', amount: 0 })).toThrow(/supérieur à zéro/);
    expect(() => toTripGuestExpenseBody({ ...base, ticket: 't', parts: [] })).toThrow(/au moins une personne/);
  });

  it('une dépense d’invité apparaît avec sa part invitée (forme serveur 0118)', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    const stamped = new Date().toISOString();
    await adapter.create('ardoise_guests', {
      id: 'trip-budget-guest-test',
      ardoise_id: 'ardoise-trip-1',
      display_name: 'Mamie Budget',
      ticket_hash: null,
      created_at: stamped,
    } as never);
    await adapter.create('expenses', {
      id: 'trip-budget-expense-test',
      household_id: DEMO_HOUSEHOLD_ID,
      ardoise_id: 'ardoise-trip-1',
      title: 'Goûter de Mamie',
      amount: 30,
      paid_by: null,
      paid_by_guest: 'trip-budget-guest-test',
      expense_date: '2027-04-13',
      split_type: 'egal',
      created_at: stamped,
    } as never);
    await adapter.create('expense_participants', {
      id: 'trip-budget-ep-member',
      expense_id: 'trip-budget-expense-test',
      participant_type: 'membre',
      member_id: DEMO_MEMBERS.camille,
      guest_id: null,
      share_amount: 15,
    } as never);
    await adapter.create('expense_participants', {
      id: 'trip-budget-ep-guest',
      expense_id: 'trip-budget-expense-test',
      participant_type: 'guest',
      member_id: null,
      guest_id: 'trip-budget-guest-test',
      share_amount: 15,
    } as never);
    // Clés de partage duales : la forme lue correspond aux clés d'écriture.
    expect(memberKey(DEMO_MEMBERS.camille)).toContain(DEMO_MEMBERS.camille);
    expect(guestKey('trip-budget-guest-test')).toContain('trip-budget-guest-test');
    try {
      renderBudget();

      expect(await screen.findByText('Goûter de Mamie')).toBeInTheDocument();
      // Payée par l'invitée, partagée à deux : la part invitée est lue.
      expect(screen.getByText(/Mamie Budget · 2 participants/)).toBeInTheDocument();
    } finally {
      await adapter.removeWhere('expense_participants', { expense_id: 'trip-budget-expense-test' }).catch(() => undefined);
      await adapter.remove('expenses', 'trip-budget-expense-test').catch(() => undefined);
      await adapter.remove('ardoise_guests', 'trip-budget-guest-test').catch(() => undefined);
    }
  });

  it('le formulaire invité n’apparaît que sous ticket (D-04)', async () => {
    renderBudget();

    expect(await screen.findByText('Vols aller-retour')).toBeInTheDocument();
    expect(screen.queryByText('Dépense d’invité')).not.toBeInTheDocument();
  });

  it('sous ticket, le formulaire invité propose membres et invités', async () => {
    try {
      window.localStorage.setItem(tripTicketStorageKey('trip-1'), 'ticket-brut-mamie');
    } catch {
      return;
    }
    renderWithProviders(
      <TripBudgetTab
        tripId="trip-1"
        householdId={DEMO_HOUSEHOLD_ID}
        members={tripMembers}
        guests={[{ id: 'trip-guest-mamie', trip_id: 'trip-1', display_name: 'Mamie', ticket_hash: null, created_at: new Date().toISOString() }]}
        currentMemberId={DEMO_MEMBERS.camille}
      />,
    );

    expect(await screen.findByText('Dépense d’invité')).toBeInTheDocument();
    expect(screen.getByLabelText(/Partager avec Camille Martin/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Partager avec Mamie/)).toBeInTheDocument();
  });
});

describe('TripBudgetTab — édition et camembert (0121)', () => {
  it('affiche le camembert des dépensés par payeur', async () => {
    renderBudget();

    await screen.findByText('Vols aller-retour');
    expect(screen.getByTestId('spending-pie')).toBeInTheDocument();
    expect(screen.getByText('Qui a dépensé quoi')).toBeInTheDocument();
  });

  it('l’admin modifie une dépense (titre + montant)', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderBudget();

    await screen.findByText('Vols aller-retour');
    await user.click(screen.getByRole('button', { name: 'Modifier Vols aller-retour' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Modifier la dépense');
    const libelle = screen.getByLabelText(/Libellé/);
    await user.clear(libelle);
    await user.type(libelle, 'Vols aller-retour modifiés');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Vols aller-retour modifiés')).toBeInTheDocument();
    expect(await screen.findByText('Dépense mise à jour, les soldes sont à jour.')).toBeInTheDocument();
    try {
      const rows = (await adapter.list('expenses', { id: 'trip-expense-vol' } as never)) as unknown as {
        title: string;
      }[];
      expect(rows[0]?.title).toBe('Vols aller-retour modifiés');
    } finally {
      await adapter.update('expenses', 'trip-expense-vol', { title: 'Vols aller-retour' } as never).catch(() => undefined);
    }
  });

  it('un membre non-admin ne modifie que ses propres dépenses', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.lina });
    renderWithProviders(
      <TripBudgetTab
        tripId="trip-1"
        householdId={DEMO_HOUSEHOLD_ID}
        members={tripMembers}
        guests={[]}
        currentMemberId={DEMO_MEMBERS.lina}
      />,
      { withHousehold: false },
    );

    await screen.findByText('Vols aller-retour');
    // Lina (membre) n’a créé aucune dépense du voyage : aucun bouton Modifier.
    expect(screen.queryByRole('button', { name: 'Modifier Vols aller-retour' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier Logement' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('spending-pie')).toBeInTheDocument();
    });
  });
});

/**
 * WR-20 (D-10) — le partage égal invité doit suivre EXACTEMENT la règle du
 * chemin membre : `splitEqual` (centimes entiers, reliquat absorbé par le
 * dernier participant). Sans cela, 50 € entre 6 donnait 6 × 8,33 = 49,98, un
 * écart d'un centime rejeté par le RPC `create_trip_guest_expense`.
 */
const formGuests: TripGuestRow[] = [
  { id: 'g-ana', trip_id: 'trip-1', display_name: 'Ana', ticket_hash: null, created_at: '2027-01-01T00:00:00.000Z' },
  { id: 'g-bruno', trip_id: 'trip-1', display_name: 'Bruno', ticket_hash: null, created_at: '2027-01-01T00:00:00.000Z' },
  { id: 'g-chloe', trip_id: 'trip-1', display_name: 'Chloé', ticket_hash: null, created_at: '2027-01-01T00:00:00.000Z' },
  { id: 'g-david', trip_id: 'trip-1', display_name: 'David', ticket_hash: null, created_at: '2027-01-01T00:00:00.000Z' },
];

describe('TripGuestExpenseForm — partage égal par splitEqual (WR-20, D-10)', () => {
  function renderGuestForm() {
    try {
      window.localStorage.setItem(tripTicketStorageKey('trip-1'), 'ticket-brut-mamie');
    } catch {
      return;
    }
    renderWithProviders(
      <TripBudgetTab
        tripId="trip-1"
        householdId={DEMO_HOUSEHOLD_ID}
        members={tripMembers}
        guests={formGuests}
        currentMemberId={DEMO_MEMBERS.camille}
      />,
    );
  }

  async function submitGuestExpense(user: ReturnType<typeof userEvent.setup>, names: string[], amount: string) {
    await screen.findByText('Dépense d’invité');
    for (const name of names) {
      await user.click(await screen.findByLabelText(`Partager avec ${name}`));
    }
    await user.type(screen.getByLabelText(/Libellé/), 'Marché');
    await user.type(screen.getByLabelText(/Montant/), amount);
    await user.click(screen.getByRole('button', { name: 'Ajouter comme invité' }));
  }

  function lastParts(): { shareAmount: number }[] {
    const args = createGuestExpenseMock.mock.calls.at(-1)?.[0] as { parts: { shareAmount: number }[] };
    return args.parts;
  }

  it('50 € entre 6 : la somme des parts vaut exactement 50,00 (reliquat reporté)', async () => {
    const user = userEvent.setup();
    renderGuestForm();

    await submitGuestExpense(user, ['Camille Martin', 'Thomas Martin', 'Ana', 'Bruno', 'Chloé', 'David'], '50');

    await waitFor(() => expect(createGuestExpenseMock).toHaveBeenCalled());
    const parts = lastParts();
    expect(parts).toHaveLength(6);
    const sum = parts.reduce((total, part) => total + part.shareAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(50);
  });

  it('10 € entre 3 : aucun centime non alloué', async () => {
    const user = userEvent.setup();
    renderGuestForm();

    await submitGuestExpense(user, ['Camille Martin', 'Thomas Martin', 'Ana'], '10');

    await waitFor(() => expect(createGuestExpenseMock).toHaveBeenCalled());
    const parts = lastParts();
    expect(parts).toHaveLength(3);
    const sum = parts.reduce((total, part) => total + part.shareAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(10);
  });

  it('cas mixte membres + invités : somme = montant, reliquat au dernier participant', async () => {
    const user = userEvent.setup();
    renderGuestForm();

    await submitGuestExpense(user, ['Camille Martin', 'Thomas Martin', 'Ana'], '25');

    await waitFor(() => expect(createGuestExpenseMock).toHaveBeenCalled());
    const parts = lastParts();
    expect(parts).toHaveLength(3);
    // L'indice suit la liste concaténée : le reliquat revient à l'invité
    // sélectionné, jamais à un index hors liste.
    expect(parts[0].shareAmount).toBe(8.33);
    expect(parts[1].shareAmount).toBe(8.33);
    expect(parts[2].shareAmount).toBe(8.34);
    const sum = parts.reduce((total, part) => total + part.shareAmount, 0);
    expect(Math.round(sum * 100) / 100).toBe(25);
  });

  it('montant indivisible (0,01 € entre 2) : refusé par la validation, aucune part inventée', async () => {
    const user = userEvent.setup();
    createGuestExpenseMock.mockClear();
    renderGuestForm();

    await submitGuestExpense(user, ['Camille Martin', 'Thomas Martin'], '0,01');

    expect(await screen.findByText('Part invalide.')).toBeInTheDocument();
    expect(createGuestExpenseMock).not.toHaveBeenCalled();
  });
});
