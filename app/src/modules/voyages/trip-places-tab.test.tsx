/**
 * 15-03 (tâche 2) : la fourche Adresses est étanche — lieux du voyage seul,
 * création posant `trip_id` via la charge foyer (`toPlacePayload` tel quel).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { PlaceRow } from '@/types';
import { TripPlacesTab } from './components/trip-places-tab';
import { createTripPlace, fetchTripPlaces } from './api';

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return {
    ...actual,
    depositHouseholdFile: vi.fn(async ({ file }: { file: File }) => ({
      url: 'blob:photo-lieu-test',
      path: null,
      name: file.name,
      mime: 'image/jpeg',
      size: 14,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderPlaces(tripId = 'trip-1', readOnly = false) {
  return renderWithProviders(
    <TripPlacesTab tripId={tripId} householdId={DEMO_HOUSEHOLD_ID} readOnly={readOnly} />,
  );
}

describe('TripPlacesTab — étanchéité du voyage (15-03)', () => {
  it('liste les adresses du voyage, jamais celles du carnet', async () => {
    renderPlaces();

    expect(await screen.findByText('Café du port')).toBeInTheDocument();
    expect(screen.getByText('Musée du Fado')).toBeInTheDocument();
    // Carnet du foyer (`trip_id NULL`) : ne fuit jamais dans l'onglet.
    expect(screen.queryByText('Le Café du Matin')).not.toBeInTheDocument();
  });

  it('ignore les adresses d’un voyage sibling', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    await adapter.create('places', {
      id: 'trip-place-sibling',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-sibling',
      type: 'bar',
      photo_url: null,
      name: 'Bar du voyage voisin',
      street: null,
      postal_code: null,
      city: 'Porto',
      phone: null,
      rating: 0,
      visited: false,
      note: null,
      created_at: new Date().toISOString(),
    } as never);
    try {
      renderPlaces();

      expect(await screen.findByText('Café du port')).toBeInTheDocument();
      expect(screen.queryByText('Bar du voyage voisin')).not.toBeInTheDocument();
    } finally {
      await adapter.remove('places', 'trip-place-sibling').catch(() => undefined);
    }
  });

  it('la création depuis l’onglet porte trip_id, jamais visitée d’emblée', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderPlaces();

    await screen.findByText('Café du port');
    await user.type(screen.getByLabelText(/Nom du lieu/), 'Miradouro da Graça');
    await user.click(screen.getByRole('button', { name: 'Ajouter au voyage' }));

    expect(await screen.findByText('Miradouro da Graça')).toBeInTheDocument();
    try {
      const rows = (await adapter.list('places', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as PlaceRow[];
      const row = rows.find((entry) => entry.name === 'Miradouro da Graça');
      expect(row?.trip_id).toBe('trip-1');
      expect(row?.visited).toBe(false);
    } finally {
      const rows = (await adapter.list('places', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as PlaceRow[];
      const row = rows.find((entry) => entry.name === 'Miradouro da Graça');
      if (row) await adapter.remove('places', row.id).catch(() => undefined);
    }
  });

  it('fetchTripPlaces : portée stricte au voyage', async () => {
    const places = await fetchTripPlaces('trip-1');
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((place) => place.trip_id === 'trip-1')).toBe(true);
  });

  it('createTripPlace refuse un nom vide', async () => {
    await expect(
      createTripPlace({ tripId: 'trip-1', householdId: DEMO_HOUSEHOLD_ID, input: { name: '  ', type: 'cafe' } }),
    ).rejects.toThrow(/Nommez le lieu/);
  });

  it('sans note, rating part à NULL (0121, places_rating_check)', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    const created = await createTripPlace({
      tripId: 'trip-1',
      householdId: DEMO_HOUSEHOLD_ID,
      input: { name: 'Lieu sans note', type: 'cafe' },
    });
    try {
      expect(created.rating).toBeNull();
    } finally {
      await adapter.remove('places', created.id).catch(() => undefined);
    }
  });

  it('la bascule visité est un interrupteur à droite (0121)', async () => {
    const user = userEvent.setup();
    renderPlaces();

    await screen.findByText('Café du port');
    const toggle = screen.getByRole('switch', { name: 'Marquer Café du port visité' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Marquer Café du port à visiter' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
    // Retour à l’état initial pour les autres tests.
    await user.click(screen.getByRole('switch', { name: 'Marquer Café du port à visiter' }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Marquer Café du port visité' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });
  });

  it('une photo jointe à la création s’affiche sur l’adresse (0121)', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderPlaces();

    await screen.findByText('Café du port');
    await user.type(screen.getByLabelText(/Nom du lieu/), 'Belvédère photo');
    await user.upload(
      screen.getByLabelText(/Photo du lieu/),
      new File(['pixels'], 'belvedere.jpg', { type: 'image/jpeg' }),
    );
    await user.click(screen.getByRole('button', { name: 'Ajouter au voyage' }));

    expect(await screen.findByText('Belvédère photo')).toBeInTheDocument();
    try {
      const rows = (await adapter.list('places', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as PlaceRow[];
      const row = rows.find((entry) => entry.name === 'Belvédère photo');
      expect(row?.photo_url).toBe('blob:photo-lieu-test');
    } finally {
      const rows = (await adapter.list('places', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as PlaceRow[];
      const row = rows.find((entry) => entry.name === 'Belvédère photo');
      if (row) await adapter.remove('places', row.id).catch(() => undefined);
    }
  });
});
