import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskBoard } from './task-board';
import type { Task } from '../types';

const task = (over: Partial<Task> & { id: string; name: string; status: Task['status'] }): Task => ({
  description: null,
  dueDate: null,
  priorityOrder: 0,
  priority: 'normale',
  assignees: [],
  reminderAt: null,
  folderId: null,
  createdBy: null,
  createdAt: '2026-10-21T09:00:00.000Z',
  isLate: false,
  lateDays: 0,
  dueLabel: 'Demain',
  reminderTime: null,
  reminderLabel: null,
  ...over,
});

describe('TaskBoard', () => {
  it('range chaque tâche dans sa colonne, avec le compte par colonne', () => {
    render(
      <TaskBoard
        tasks={[
          task({ id: '1', name: 'Sortir les poubelles', status: 'a_faire' }),
          task({ id: '2', name: 'Appeler le plombier', status: 'en_cours' }),
          task({ id: '3', name: 'Payer la cantine', status: 'fait' }),
          task({ id: '4', name: 'Réserver le gîte', status: 'a_faire' }),
        ]}
        canWrite
        onEdit={() => {}}
        onMove={() => {}}
      />,
    );

    const aFaire = screen.getByRole('region', { name: 'À faire' });
    expect(within(aFaire).getByText('Sortir les poubelles')).toBeInTheDocument();
    expect(within(aFaire).getByText('Réserver le gîte')).toBeInTheDocument();
    expect(within(aFaire).getByText('2')).toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: 'En cours' })).getByText('Appeler le plombier')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Terminée' })).getByText('Payer la cantine')).toBeInTheDocument();
  });

  it('change le statut par le sélecteur de la carte', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const target = task({ id: '1', name: 'Sortir les poubelles', status: 'a_faire' });
    render(<TaskBoard tasks={[target]} canWrite onEdit={() => {}} onMove={onMove} />);

    await user.selectOptions(screen.getByLabelText('Statut de « Sortir les poubelles »'), 'en_cours');

    expect(onMove).toHaveBeenCalledWith(target, 'en_cours');
  });

  it('en lecture seule, la carte reste consultable mais sans poignée ni changement de statut', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onMove = vi.fn();
    render(
      <TaskBoard
        tasks={[task({ id: '1', name: 'Sortir les poubelles', status: 'a_faire' })]}
        canWrite={false}
        onEdit={onEdit}
        onMove={onMove}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Déplacer : Sortir les poubelles' })).not.toBeInTheDocument();
    const select = screen.getByLabelText('Statut de « Sortir les poubelles »');
    expect(select).toBeDisabled();
    await user.selectOptions(select, 'fait');
    expect(onMove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Sortir les poubelles' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
