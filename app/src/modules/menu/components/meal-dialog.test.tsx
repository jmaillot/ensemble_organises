/**
 * T2 (25-07) — garde UI D-06 dans le « qui mange » du menu.
 *
 * Clé 'menu' : l'enfant dont la fiche ne sert pas l'espace n'apparaît pas
 * dans « Qui mange » — absent, pas désactivé (UI-SPEC) — pendant que
 * l'enfant au socle et l'adulte restent cochables. Le dialogue reste
 * soumettable : la garde ne touche que les options rendues.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { HouseholdMemberRow } from '@/types';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { MealDialog } from './meal-dialog';

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

const weekDates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 9, 26 + index));
  return date.toISOString().slice(0, 10);
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
    <MealDialog
      open
      onOpenChange={() => {}}
      entry={null}
      defaultDate={weekDates[0]!}
      defaultSlot="midi"
      weekDates={weekDates}
      recipes={[]}
      onSave={() => Promise.resolve()}
    />,
    { withHousehold: false },
  );
};

describe('MealDialog — garde D-06 du « qui mange »', () => {
  it('n’offre PAS l’enfant hors-module « menu », et offre l’adulte et l’enfant au socle', () => {
    renderPicker();
    expect(screen.queryByRole('checkbox', { name: 'Maé Martin mange' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Noé Martin mange' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Camille Martin mange' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planifier' })).toBeInTheDocument();
  });
});
