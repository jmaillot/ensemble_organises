/**
 * TODO #16 : « on ne sait pas encore » ne se dit pas comme « personne ».
 *
 * Ces deux tests portent sur la ligne elle-même : tant que la lecture de
 * `task_assignees` est en vol (ou en erreur), la ligne montre un rond
 * d'attente ; quand elle a rendu, elle montre les vrais assignataires, et un
 * rond d'attente n'apparaît plus jamais.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import type { Task } from '../types';
import { TaskRow } from './task-row';

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Sortir les poubelles',
    description: null,
    dueDate: null,
    status: 'a_faire',
    priorityOrder: 0,
    priority: 'normale',
    assignees: [],
    reminderAt: null,
    folderId: null,
    createdBy: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    isLate: false,
    lateDays: 0,
    dueLabel: 'Aujourd’hui',
    reminderTime: null,
    reminderLabel: null,
    ...overrides,
  };
}

function renderRow(task: Task) {
  // `useSortable` exige un contexte de tri, même pour un rendu isolé.
  return render(
    <DndContext>
      <SortableContext items={[task.id]}>
        <TaskRow task={task} onToggle={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
      </SortableContext>
    </DndContext>,
  );
}

describe('TaskRow — assignations inconnues (TODO #16)', () => {
  it('montre un rond d’attente tant que les assignations n’ont pas rendu', () => {
    renderRow(buildTask({ assigneesUnknown: true }));

    expect(screen.getByRole('img', { name: 'Assignation en cours de chargement' })).toBeInTheDocument();
    // Aucun nom n'est inventé, et « personne » n'est affirmé nulle part.
    expect(screen.queryByText(/Personne/)).not.toBeInTheDocument();
  });

  it('montre les vrais assignataires une fois la lecture rendue, sans rond d’attente', () => {
    const lina = demoMembers.find((member) => member.id === DEMO_MEMBERS.lina);
    expect(lina).toBeDefined();

    renderRow(buildTask({ assignees: [{ memberId: DEMO_MEMBERS.lina, member: lina! }] }));

    expect(screen.getByText('Lina')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Assignation en cours de chargement' })).not.toBeInTheDocument();
  });

  it('ne montre rien de spécial pour une tâche réellement sans assigné', () => {
    renderRow(buildTask());

    expect(screen.queryByRole('img', { name: 'Assignation en cours de chargement' })).not.toBeInTheDocument();
  });
});
