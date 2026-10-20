/**
 * TODO #16 : l'onglet Tâches d'un voyage ne doit pas écrire « Personne
 * assigné » pendant que la lecture des assignations est en vol — c'est faux, et
 * ça ne se distingue pas d'une tâche réellement sans assigné.
 *
 * La lecture est retenue volontairement (promesse qui ne se résout jamais) :
 * c'est la seule façon d'observer l'état intermédiaire sans course.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import { TripTasksTab } from './components/trip-tasks-tab';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    fetchTripTasks: vi.fn(async () => [
      {
        id: 'trip-task-1',
        household_id: DEMO_HOUSEHOLD_ID,
        trip_id: 'trip-1',
        name: 'Réserver le vol',
        description: null,
        due_date: null,
        priority_order: 0,
        status: 'a_faire',
        folder_id: null,
        created_by: DEMO_MEMBERS.camille,
        created_at: '2026-10-01T00:00:00.000Z',
      },
    ]),
    listTripTaskAssignees: vi.fn(() => new Promise(() => undefined)),
  };
});

const tripMembers = demoMembers.filter(
  (member) => member.id === DEMO_MEMBERS.camille || member.id === DEMO_MEMBERS.thomas,
);

describe('TripTasksTab — assignations inconnues (TODO #16)', () => {
  it('dit « on ne sait pas » tant que la lecture des assignations est en vol', async () => {
    renderWithProviders(
      <TripTasksTab
        tripId="trip-1"
        householdId={DEMO_HOUSEHOLD_ID}
        members={tripMembers}
        currentMemberId={DEMO_MEMBERS.camille}
      />,
    );

    expect(await screen.findByText('Réserver le vol')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Assignation en cours de chargement' })).toBeInTheDocument();
    expect(screen.queryByText('Personne assigné')).not.toBeInTheDocument();
  });
});
