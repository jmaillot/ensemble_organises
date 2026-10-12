/**
 * 15-03 (tâche 2) : la fourche Courses est étanche — listes du voyage seul,
 * création posant `trip_id`, articles héritant par leur liste.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { ShoppingListRow } from '@/types';
import { TripCoursesTab } from './components/trip-courses-tab';
import { createTripList, fetchTripListItems, fetchTripShoppingLists } from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderCourses(tripId = 'trip-1', readOnly = false) {
  return renderWithProviders(
    <TripCoursesTab tripId={tripId} householdId={DEMO_HOUSEHOLD_ID} currentMemberId={DEMO_MEMBERS.camille} readOnly={readOnly} />,
  );
}

describe('TripCoursesTab — étanchéité du voyage (15-03)', () => {
  it('liste les courses du voyage, jamais celles du foyer', async () => {
    renderCourses();

    expect(await screen.findByText('Valise')).toBeInTheDocument();
    expect(await screen.findByText('Crème solaire')).toBeInTheDocument();
    expect(await screen.findByText('Guide de Lisbonne')).toBeInTheDocument();
    // Listes du foyer (`trip_id NULL`) : ne fuient jamais dans l'onglet.
    expect(screen.queryByText('Fresque')).not.toBeInTheDocument();
    expect(screen.queryByText('Maison')).not.toBeInTheDocument();
  });

  it('ignore les listes d’un voyage sibling', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter.create('shopping_lists', {
      id: 'trip-list-sibling',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-sibling',
      name: 'Liste du voyage voisin',
      created_by: DEMO_MEMBERS.camille,
      created_at: new Date().toISOString(),
    } as never);
    try {
      renderCourses();

      expect(await screen.findByText('Valise')).toBeInTheDocument();
      expect(screen.queryByText('Liste du voyage voisin')).not.toBeInTheDocument();
    } finally {
      await adapter.remove('shopping_lists', 'trip-list-sibling').catch(() => undefined);
    }
  });

  it('la création depuis l’onglet porte trip_id', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderCourses();

    await screen.findByText('Valise');
    await user.type(screen.getByLabelText(/Nom de la liste/), 'Pharmacie');
    await user.click(screen.getByRole('button', { name: 'Ajouter au voyage' }));

    expect(await screen.findByText('Pharmacie')).toBeInTheDocument();
    try {
      const rows = (await adapter.list('shopping_lists', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as ShoppingListRow[];
      const row = rows.find((entry) => entry.name === 'Pharmacie');
      expect(row?.trip_id).toBe('trip-1');
    } finally {
      const rows = (await adapter.list('shopping_lists', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as ShoppingListRow[];
      const row = rows.find((entry) => entry.name === 'Pharmacie');
      if (row) await adapter.remove('shopping_lists', row.id).catch(() => undefined);
    }
  });

  it('fetchTripShoppingLists + fetchTripListItems : portée stricte au voyage', async () => {
    const lists = await fetchTripShoppingLists('trip-1');
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.every((list) => list.trip_id === 'trip-1')).toBe(true);
    const items = await fetchTripListItems(lists.map((list) => list.id));
    expect(items.length).toBeGreaterThan(0);
    const listIds = new Set(lists.map((list) => list.id));
    expect(items.every((item) => listIds.has(item.list_id))).toBe(true);
  });

  it('createTripList refuse un nom vide', async () => {
    await expect(
      createTripList({ tripId: 'trip-1', householdId: DEMO_HOUSEHOLD_ID, name: '   ' }),
    ).rejects.toThrow(/Nommez la liste/);
  });
});
