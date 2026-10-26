/**
 * T2 (25-07) — garde UI D-06 dans le picker d'assignataires des tâches.
 *
 * Un enfant dont la fiche ne sert PAS 'taches' (managed_modules, migration
 * 0144) est ABSENT des options — pas affiché désactivé (UI-SPEC) — alors que
 * l'adulte et l'enfant au socle le restent. Le serveur 0146 revalide de toute
 * façon : la garde ici n'est que du confort avant l'enregistrement.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdMemberRow } from '@/types';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { TaskFormDialog } from './task-form-dialog';
import type { Task, TaskFormValues } from '../types';

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
    <TaskFormDialog open onOpenChange={() => {}} task={null} currentMemberId={admin.id} onSubmit={() => Promise.resolve()} />,
    { withHousehold: false },
  );
};

describe('TaskFormDialog — garde D-06 du picker d’assignataires', () => {
  it('n’offre PAS l’enfant hors-module « tâches », et offre l’adulte et l’enfant au socle', () => {
    renderPicker();
    expect(screen.queryByRole('checkbox', { name: 'Assigner à Maé Martin' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Assigner à Noé Martin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Assigner à Camille Martin' })).toBeInTheDocument();
  });

  // WR-06 : un assigné rendu inéligible entre deux ouvertures (l'adulte a
  // retiré « Tâches » de la fiche de l'enfant) n'a plus de case rendue ; s'il
  // restait au pré-remplissage, chaque sauvegarde le re-soumettrait et le
  // serveur refuserait (42501). Le filtre s'applique à l'ouverture.
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
    const task: Task = {
      id: 'task-wr06',
      name: 'Arroser les plantes',
      description: null,
      dueDate: '2026-10-30',
      status: 'a_faire',
      priorityOrder: 0,
      priority: 'normale',
      // Historique : Maé était assignée avant le retrait du module sur sa fiche.
      assignees: [
        { memberId: enfantHorsModule.id, member: enfantHorsModule },
        { memberId: admin.id, member: admin },
      ],
      reminderAt: null,
      folderId: null,
      createdBy: admin.id,
      createdAt: '2026-10-01T00:00:00.000Z',
      isLate: false,
      lateDays: 0,
      dueLabel: 'Aujourd’hui',
      reminderTime: null,
      reminderLabel: null,
    };
    const onSubmit = vi.fn(async (_values: TaskFormValues) => {});
    renderWithProviders(
      <TaskFormDialog open onOpenChange={() => {}} task={task} currentMemberId={admin.id} onSubmit={onSubmit} />,
      { withHousehold: false },
    );

    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].assigneeIds).toEqual([admin.id]);
  });
});
