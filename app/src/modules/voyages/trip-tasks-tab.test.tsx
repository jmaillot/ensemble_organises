/**
 * Tracer 15-03 (tâche 1) : l'onglet Tâches du voyage est étanche — un voyage,
 * une tâche, aucune fuite du foyer.
 *
 * Preuves : lignes du foyer absentes, lignes d'un voyage sibling absentes,
 * création posant `trip_id` avec `folder_id` NULL, assigné hors voyage rejeté
 * (garde client, avant le garde de portée serveur 15-01).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import type { TaskRow } from '@/types';
import { TripTasksTab } from './components/trip-tasks-tab';
import { assertTripAssignees, createTripTask, fetchTripTasks, tripRowsOf } from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

const tripMembers = demoMembers.filter(
  (member) => member.id === DEMO_MEMBERS.camille || member.id === DEMO_MEMBERS.thomas,
);

function renderTasks(tripId = 'trip-1', readOnly = false) {
  return renderWithProviders(
    <TripTasksTab
      tripId={tripId}
      householdId={DEMO_HOUSEHOLD_ID}
      members={tripMembers}
      currentMemberId={DEMO_MEMBERS.camille}
      readOnly={readOnly}
    />,
  );
}

describe('TripTasksTab — étanchéité du voyage (tracer 15-03)', () => {
  it('liste les tâches du voyage, jamais celles du foyer', async () => {
    renderTasks();

    expect(await screen.findByText('Réserver le vol')).toBeInTheDocument();
    expect(screen.getByText('Préparer la valise')).toBeInTheDocument();
    // Lignes du foyer (`trip_id NULL`) : ne fuient jamais dans l'onglet.
    expect(screen.queryByText('Valider les rendez-vous du carnet')).not.toBeInTheDocument();
    expect(screen.queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
    expect(screen.queryByText('Ranger les photos de l’été')).not.toBeInTheDocument();
    expect(screen.queryByText('Choisir le menu du week-end')).not.toBeInTheDocument();
  });

  it('ignore les tâches d’un voyage sibling', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter.create('tasks', {
      id: 'trip-task-sibling',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-sibling',
      name: 'Tâche du voyage voisin',
      description: null,
      due_date: null,
      priority_order: 0,
      status: 'a_faire',
      folder_id: null,
      created_by: DEMO_MEMBERS.camille,
      created_at: new Date().toISOString(),
    } as never);
    try {
      renderTasks();

      expect(await screen.findByText('Réserver le vol')).toBeInTheDocument();
      expect(screen.queryByText('Tâche du voyage voisin')).not.toBeInTheDocument();
    } finally {
      await adapter.remove('tasks', 'trip-task-sibling').catch(() => undefined);
    }
  });

  it('la création depuis l’onglet porte trip_id, jamais de dossier', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderTasks();

    await screen.findByText('Réserver le vol');
    await user.type(screen.getByLabelText(/Nom de la tâche/), 'Acheter un adaptateur');
    await user.click(screen.getByLabelText(`Assigner ${tripMembers[0].display_name}`));
    await user.click(screen.getByRole('button', { name: 'Ajouter au voyage' }));

    const created = await screen.findByText('Acheter un adaptateur');
    expect(created).toBeInTheDocument();
    try {
      const rows = await adapter.list('tasks', { household_id: DEMO_HOUSEHOLD_ID } as never);
      const row = (rows as unknown as TaskRow[]).find((entry) => entry.name === 'Acheter un adaptateur');
      expect(row?.trip_id).toBe('trip-1');
      // Les dossiers restent au foyer : la ligne tripée n'en porte aucun.
      expect(row?.folder_id).toBeNull();
    } finally {
      const rows = await adapter.list('tasks', { household_id: DEMO_HOUSEHOLD_ID } as never);
      const row = (rows as unknown as TaskRow[]).find((entry) => entry.name === 'Acheter un adaptateur');
      if (row) {
        await adapter.removeWhere('task_assignees', { task_id: row.id }).catch(() => undefined);
        await adapter.remove('tasks', row.id).catch(() => undefined);
      }
    }
  });

  it('un assigné hors voyage est rejeté avant toute écriture (T-15-12)', async () => {
    expect(() => assertTripAssignees(['membre-exterieur'], [DEMO_MEMBERS.camille])).toThrow(/hors voyage/);
    await expect(
      createTripTask({
        tripId: 'trip-1',
        householdId: DEMO_HOUSEHOLD_ID,
        name: 'Tentative hors voyage',
        assigneeIds: ['membre-exterieur'],
        tripMemberIds: [DEMO_MEMBERS.camille, DEMO_MEMBERS.thomas],
        createdBy: DEMO_MEMBERS.camille,
      }),
    ).rejects.toThrow(/hors voyage/);
  });

  it('fetchTripTasks ne lit que le voyage demandé', async () => {
    const rows = await fetchTripTasks('trip-1');
    expect(rows.length).toBeGreaterThan(0);
    expect(tripRowsOf(rows, 'trip-1')).toHaveLength(rows.length);
    expect(rows.every((row) => row.trip_id === 'trip-1')).toBe(true);
  });

  it('en lecture seule (figé, modération), aucune écriture n’est proposée', async () => {
    renderTasks('trip-1', true);

    expect(await screen.findByText('Réserver le vol')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nom de la tâche/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter au voyage' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: /Marquer/ })).not.toBeInTheDocument();
    });
  });
});
