/**
 * 15-03 (tâche 2) : la fourche Notes est étanche — notes du voyage seul,
 * création posant `trip_id` avec `folder_id` NULL (dossiers au foyer).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { NoteRow } from '@/types';
import { TripNotesTab } from './components/trip-notes-tab';
import { createTripNote, fetchTripNotes } from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderNotes(tripId = 'trip-1', readOnly = false) {
  return renderWithProviders(
    <TripNotesTab tripId={tripId} householdId={DEMO_HOUSEHOLD_ID} currentMemberId={DEMO_MEMBERS.camille} readOnly={readOnly} />,
  );
}

describe('TripNotesTab — étanchéité du voyage (15-03)', () => {
  it('liste les notes du voyage, jamais celles du foyer', async () => {
    renderNotes();

    expect(await screen.findByText('Passeports')).toBeInTheDocument();
    expect(screen.getByText('Idées d’activités')).toBeInTheDocument();
    // Notes du foyer (`trip_id NULL`) : ne fuient jamais dans l'onglet.
    expect(screen.queryByText('Liste de rentrée')).not.toBeInTheDocument();
  });

  it('ignore les notes d’un voyage sibling', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    const stamped = new Date().toISOString();
    await adapter.create('notes', {
      id: 'trip-note-sibling',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: 'trip-sibling',
      title: 'Note du voyage voisin',
      content: 'Rien à voir.',
      category: 'Voyage',
      color: null,
      folder_id: null,
      created_by: DEMO_MEMBERS.camille,
      created_at: stamped,
      updated_at: stamped,
    } as never);
    try {
      renderNotes();

      expect(await screen.findByText('Passeports')).toBeInTheDocument();
      expect(screen.queryByText('Note du voyage voisin')).not.toBeInTheDocument();
    } finally {
      await adapter.remove('notes', 'trip-note-sibling').catch(() => undefined);
    }
  });

  it('la création depuis l’onglet porte trip_id, sans dossier', async () => {
    const user = userEvent.setup();
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    const adapter = getLocalAdapter();
    renderNotes();

    await screen.findByText('Passeports');
    await user.type(screen.getByLabelText(/Titre/), 'Horaires de bateau');
    await user.click(screen.getByRole('button', { name: 'Ajouter au voyage' }));

    expect(await screen.findByText('Horaires de bateau')).toBeInTheDocument();
    try {
      const rows = (await adapter.list('notes', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as NoteRow[];
      const row = rows.find((entry) => entry.title === 'Horaires de bateau');
      expect(row?.trip_id).toBe('trip-1');
      expect(row?.folder_id).toBeNull();
    } finally {
      const rows = (await adapter.list('notes', { household_id: DEMO_HOUSEHOLD_ID } as never)) as unknown as NoteRow[];
      const row = rows.find((entry) => entry.title === 'Horaires de bateau');
      if (row) await adapter.remove('notes', row.id).catch(() => undefined);
    }
  });

  it('fetchTripNotes : portée stricte au voyage', async () => {
    const notes = await fetchTripNotes('trip-1');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.trip_id === 'trip-1')).toBe(true);
  });

  it('createTripNote refuse un titre vide', async () => {
    await expect(
      createTripNote({ tripId: 'trip-1', householdId: DEMO_HOUSEHOLD_ID, title: '  ', content: 'x' }),
    ).rejects.toThrow(/Titre requis/);
  });
});
