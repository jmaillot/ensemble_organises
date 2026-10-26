/**
 * T2 (25-07) — garde UI D-06 dans le picker d'assignataires des routines.
 *
 * Même règle que pour les tâches, clé 'routines' : l'enfant hors-module est
 * absent des options, l'enfant au socle et les adultes restent. Source unique
 * : eligibleMembersForModule — aucune règle locale dans le dialogue.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdMemberRow } from '@/types';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { RoutineFormDialog } from './routine-form-dialog';
import type { Routine, RoutineFormValues } from '../types';

const baseMember: HouseholdMemberRow = {
  id: '',
  role: 'membre',
  household_id: 'h-1',
  user_id: null,
  display_name: '',
  avatar_url: null,
  color_tag: 'accent',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const row = (
  overrides: Partial<HouseholdMemberRow> & Pick<HouseholdMemberRow, 'id' | 'role' | 'display_name'>,
): HouseholdMemberRow => ({ ...baseMember, ...overrides });

const admin = row({ id: 'm-camille', role: 'admin', display_name: 'Camille Martin' });
const enfantSocle = row({
  id: 'm-noe',
  role: 'enfant',
  display_name: 'Noé Martin',
  color_tag: 'amber',
  managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
});
const enfantHorsModule = row({
  id: 'm-mae',
  role: 'enfant',
  display_name: 'Maé Martin',
  color_tag: 'coral',
  managed_modules: ['anniversaires'],
});

const renderPicker = () => {
  useHouseholdStore.setState({
    householdId: 'h-1',
    householdName: 'Foyer Martin',
    householdColor: 'accent',
    members: [admin, enfantSocle, enfantHorsModule],
    currentMemberId: admin.id,
    disabledModules: [],
  });
  return renderWithProviders(
    <RoutineFormDialog
      open
      onOpenChange={() => {}}
      routine={null}
      currentMemberId={admin.id}
      onSubmit={() => Promise.resolve()}
    />,
    { withHousehold: false },
  );
};

describe('RoutineFormDialog — garde D-06 du picker d’assignataires', () => {
  it('n’offre PAS l’enfant hors-module « routines », et offre l’adulte et l’enfant au socle', () => {
    renderPicker();
    expect(screen.queryByRole('checkbox', { name: 'Assigner à Maé Martin' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Assigner à Noé Martin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Assigner à Camille Martin' })).toBeInTheDocument();
  });

  // WR-06 : même garde de pré-remplissage que le formulaire de tâches — un
  // assigné rendu inéligible n'a plus de case ; s'il restait dans le state,
  // chaque sauvegarde le re-soumettrait et le serveur refuserait (42501).
  it('écarte du pré-remplissage l’assigné devenu hors-module, la sauvegarde ne le resoumet pas', async () => {
    const user = userEvent.setup();
    useHouseholdStore.setState({
      householdId: 'h-1',
      householdName: 'Foyer Martin',
      householdColor: 'accent',
      members: [admin, enfantSocle, enfantHorsModule],
      currentMemberId: admin.id,
      disabledModules: [],
    });
    const routine: Routine = {
      id: 'routine-wr06',
      name: 'Arrosage du jardin',
      description: null,
      recurrenceRule: 'FREQ=DAILY',
      folderId: null,
      frequencyLabel: 'Chaque jour',
      preset: 'quotidien',
      // Historique : Maé était assignée avant le retrait du module sur sa fiche.
      assignees: [
        { memberId: enfantHorsModule.id, member: enfantHorsModule },
        { memberId: admin.id, member: admin },
      ],
      reminderAt: null,
      reminderLabel: null,
      reminders: [],
      isLate: false,
      lateCount: 0,
      lateLabel: null,
      createdBy: admin.id,
      createdAt: '2026-10-01T00:00:00.000Z',
      isDueToday: false,
      isDoneToday: false,
      streak: 0,
      streakLabel: '',
      missedDates: [],
      nextDate: null,
      nextLabel: '',
    };
    const onSubmit = vi.fn(async (_values: RoutineFormValues) => {});
    renderWithProviders(
      <RoutineFormDialog
        open
        onOpenChange={() => {}}
        routine={routine}
        currentMemberId={admin.id}
        onSubmit={onSubmit}
      />,
      { withHousehold: false },
    );

    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].assigneeIds).toEqual([admin.id]);
  });
});
