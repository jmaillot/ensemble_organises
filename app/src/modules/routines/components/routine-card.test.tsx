/**
 * T3 (25-07) — le point d'entrée « Cocher pour » de la carte (A4/A5).
 *
 * Sans ce point d'entrée, le p_member_id du RPC 0146 est inutilisable depuis
 * l'interface : un adult ne peut pas cocher AU NOM d'un enfant. La carte ne
 * décide de rien — la page fournit les cibles via eligibleMembersForModule
 * (adultes hors de la liste : ils cochent par la case self) et ne les passe
 * que pour un acteur adulte (readOnly à false pour lui). A5 : un nom long est
 * tronqué (ellipsis) sans casser la mise en page.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdMemberRow } from '@/types';
import { renderWithProviders } from '@/test/render';
import type { Routine } from '../types';
import { RoutineCard } from './routine-card';

const member = (overrides: Partial<HouseholdMemberRow> & Pick<HouseholdMemberRow, 'id' | 'role' | 'display_name'>): HouseholdMemberRow => ({
  id: '',
  household_id: 'h-1',
  user_id: null,
  avatar_url: null,
  color_tag: 'accent',
  birth_date: null,
  managed_modules: [],
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const routine = {
  id: 'r-1',
  name: 'Dents du soir',
  frequencyLabel: 'Chaque soir',
  description: null,
  isDueToday: true,
  isDoneToday: false,
  streak: 0,
  streakLabel: 'Série à relancer',
  lateLabel: null,
  lateCount: 0,
  assignees: [],
} as unknown as Routine;

const noe = member({ id: 'm-noe', role: 'enfant', display_name: 'Noé Martin', color_tag: 'amber' });
const nomLong = `Maximilienne-${'Antoinette-'.repeat(7)}Martin`;
const enfantNomLong = member({ id: 'm-max', role: 'enfant', display_name: nomLong, color_tag: 'violet' });
const onToggle = vi.fn();
const onToggleFor = vi.fn();

const renderCard = (options: { toggleTargets?: HouseholdMemberRow[]; readOnly?: boolean } = {}) => {
  onToggle.mockClear();
  onToggleFor.mockClear();
  return renderWithProviders(
    <RoutineCard
      routine={routine}
      onToggle={onToggle}
      readOnly={options.readOnly ?? false}
      toggleTargets={options.toggleTargets}
      onToggleFor={options.toggleTargets && options.toggleTargets.length > 0 ? onToggleFor : undefined}
    />,
    { withHousehold: false },
  );
};

describe('RoutineCard — « Cocher pour »', () => {
  it('adulte : le menu liste les enfants éligibles et coche au nom du choix', async () => {
    const user = userEvent.setup();
    renderCard({ toggleTargets: [noe] });
    await user.click(screen.getByRole('button', { name: 'Cocher pour' }));
    const item = await screen.findByRole('menuitem', { name: 'Noé Martin' });
    await user.click(item);
    expect(onToggleFor).toHaveBeenCalledWith(routine, 'm-noe');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('enfant connecté (readOnly) : aucun point d’entrée « Cocher pour »', () => {
    renderCard({ toggleTargets: [noe], readOnly: true });
    expect(screen.queryByRole('button', { name: 'Cocher pour' })).not.toBeInTheDocument();
  });

  it('A5 : un nom de 120 caractères reste tronqué, la rangée tient', async () => {
    const user = userEvent.setup();
    renderCard({ toggleTargets: [enfantNomLong] });
    await user.click(screen.getByRole('button', { name: 'Cocher pour' }));
    const item = await screen.findByRole('menuitem', { name: nomLong });
    const label = item.querySelector('.truncate');
    expect(label).not.toBeNull();
    expect(label).toHaveTextContent(nomLong);
  });
});
