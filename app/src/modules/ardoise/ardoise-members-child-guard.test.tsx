/**
 * T2 (25-07) — garde UI D-06 dans les membres d'une ardoise.
 *
 * 'ardoise' est HORS socle D-06 : un enfant socle-only n'y figure PAS tant
 * que sa fiche ne l'active pas (le serveur 0146 resterait l'autorité de toute
 * façon). Les adultes (admin/membre) restent éligibles : c'est le remplacement
 * du filtre de rôle antérieur, la règle passe par la même fonction pure que
 * les trois autres pickers — aucune divergence d'espace possible.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { HouseholdMemberRow } from '@/types';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { ArdoiseMembersDialog } from './components/ardoise-members-dialog';

vi.mock('./hooks/use-ardoise', () => ({
  useArdoiseMembers: () => ({
    memberIds: ['m-lior'],
    isLoading: false,
    isMutating: false,
    addMembers: vi.fn(() => Promise.resolve()),
    removeMember: vi.fn(() => Promise.resolve()),
  }),
}));

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
const membre = row({ id: 'm-lior', role: 'membre', display_name: 'Lior Martin', color_tag: 'ink' });
const enfantSocle = row({
  id: 'm-noe',
  role: 'enfant',
  display_name: 'Noé Martin',
  color_tag: 'amber',
  managed_modules: ['taches', 'routines', 'anniversaires', 'menu'],
});
const enfantAutreCle = row({
  id: 'm-mae',
  role: 'enfant',
  display_name: 'Maé Martin',
  color_tag: 'coral',
  managed_modules: ['fidelite'],
});

/** Fiche qui SERT l'ardoise : la règle est fiduciaire (D-05), pas de rôle. */
const enfantArdoise = row({
  id: 'm-rose',
  role: 'enfant',
  display_name: 'Rose Martin',
  color_tag: 'violet',
  managed_modules: ['ardoise'],
});

const renderDialog = () => {
  useHouseholdStore.setState({
    householdId: 'h-1',
    householdName: 'Foyer Martin',
    householdColor: 'accent',
    members: [admin, membre, enfantSocle, enfantAutreCle, enfantArdoise],
    currentMemberId: admin.id,
    disabledModules: [],
  });
  return renderWithProviders(
    <ArdoiseMembersDialog
      ardoiseId="a-1"
      ardoiseName="Vacances d’été"
      open
      onOpenChange={() => {}}
      canManage={true}
    />,
    { withHousehold: false },
  );
};

describe('ArdoiseMembersDialog — garde D-06 (ardoise hors socle)', () => {
  it('n’offre les enfants QUE si leur fiche sert « ardoise » — le filtre de rôle laisse place à la règle D-06', async () => {
    renderDialog();
    expect(await screen.findByRole('dialog', { name: /Membres de/ })).toBeInTheDocument();
    expect(screen.queryByText('Noé Martin')).not.toBeInTheDocument();
    expect(screen.queryByText('Maé Martin')).not.toBeInTheDocument();
    // La règle vit sur la fiche (D-05, managed_modules) : une fiche qui sert
    // l'ardoise figure, même si la base n'acceptera une telle fiche que si
    // 0146 évolue — le serveur reste l'autorité, l'UI ne fait pas de règle
    // à part (T-25-22 : zéro divergeance d'espace).
    expect(screen.getByText('Rose Martin')).toBeInTheDocument();
    expect(screen.getByText('Camille Martin')).toBeInTheDocument();
    expect(screen.getByText('Lior Martin')).toBeInTheDocument();
  });
});
