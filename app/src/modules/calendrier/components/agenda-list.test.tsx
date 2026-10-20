/**
 * TODO #16 : l'agenda dit « on ne sait pas » tant que les assignations des
 * tâches n'ont pas rendu, au lieu de laisser la ligne muette — ce qui se lit
 * « personne n'est assigné ».
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import type { AgendaItem } from '../types';
import { AgendaList } from './agenda-list';

function tacheItem(overrides: Partial<Extract<AgendaItem, { kind: 'tache' }>> = {}): AgendaItem {
  return {
    kind: 'tache',
    key: 'tache-task-1',
    taskId: 'task-1',
    time: 'Échéance',
    title: 'Sortir les poubelles',
    subtitle: null,
    colorTag: 'violet',
    chipLabel: 'Tâche',
    assignees: [],
    ...overrides,
  };
}

describe('AgendaList — assignations inconnues (TODO #16)', () => {
  it('montre un rond d’attente tant que les assignations n’ont pas rendu', () => {
    render(<AgendaList date="2026-10-19" items={[tacheItem({ assigneesUnknown: true })]} />);

    expect(screen.getByRole('img', { name: 'Assignation en cours de chargement' })).toBeInTheDocument();
  });

  it('montre le nom des assignataires une fois la lecture rendue', () => {
    const lina = demoMembers.find((member) => member.id === DEMO_MEMBERS.lina);
    expect(lina).toBeDefined();

    render(
      <AgendaList
        date="2026-10-19"
        items={[tacheItem({ assignees: [{ memberId: DEMO_MEMBERS.lina, member: lina! }] })]}
      />,
    );

    expect(screen.getByText(/Lina/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Assignation en cours de chargement' })).not.toBeInTheDocument();
  });

  it('ne montre rien de spécial pour une tâche réellement sans assigné', () => {
    render(<AgendaList date="2026-10-19" items={[tacheItem()]} onOpenTask={vi.fn()} />);

    expect(screen.queryByRole('img', { name: 'Assignation en cours de chargement' })).not.toBeInTheDocument();
  });
});
