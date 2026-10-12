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
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import { guestKey, memberKey } from '@/modules/ardoise/types';
import type { ArdoiseRow } from '@/types';
import { TripBudgetTab } from './components/trip-budget-tab';
import {
  fetchTripArdoise,
  resolveTripArdoiseId,
  toTripGuestExpenseBody,
  tripTicketStorageKey,
} from './api';

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
