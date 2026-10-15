import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import type { NoteFolderRow, NoteRow } from '@/types';
import { createNoteAttachment } from '../api';
import type { Note } from '../types';
import { useNotes } from './use-notes';

/**
 * WR-10/D-03 — le dépôt est doublé mais le RETRAIT est observé sur le point
 * unique (`removeHouseholdFile`) : c'est le chemin réellement transmis au
 * Storage qui est vérifié, pas l'intention du code appelant.
 */
const { depositMock, removeFileMock } = vi.hoisted(() => ({
  depositMock: vi.fn(),
  removeFileMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, depositHouseholdFile: depositMock, removeHouseholdFile: removeFileMock };
});

function pdf(name = 'ordonnance.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function formValues(title = 'Ordonnances') {
  return { title, category: 'Maison' as const, customCategory: '', content: '', visibility: 'foyer' as const, folderId: '' };
}

async function seedNote(id: string): Promise<NoteRow> {
  return data.create<NoteRow>('notes', {
    id,
    household_id: DEMO_HOUSEHOLD_ID,
    trip_id: null,
    title: 'Ordonnances',
    content: '',
    category: 'Maison',
    color: 'accent',
    folder_id: null,
    created_by: DEMO_MEMBERS.camille,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/** Pièce jointe persistée dont le dépôt simulé rend un CHEMIN (`path`). */
async function attach(id: string, storedPath: string): Promise<string> {
  depositMock.mockResolvedValueOnce({
    url: 'https://signe.example/notes/ordonnance.pdf?token=expire',
    path: storedPath,
    name: 'ordonnance.pdf',
    mime: 'application/pdf',
    size: 12,
  });
  const row = await createNoteAttachment(DEMO_HOUSEHOLD_ID, id, pdf());
  return row.id;
}

async function noteFrom(result: { current: ReturnType<typeof useNotes> }, id: string): Promise<Note> {
  await waitFor(() => expect(result.current.notes.some((note) => note.id === id)).toBe(true));
  return result.current.notes.find((note) => note.id === id) as Note;
}

/**
 * `useNotes.deleteFolder` était gardé par `canWrite` seul, alors que la
 * politique `note_folders_delete` (0051:82-87) réserve la suppression à
 * l'administrateur : troisième occurrence de la même classe que les dossiers de
 * tâches et de routines (D-03, « corriger la classe »). Le garde est prouvé
 * ici, car le test d'affichage de la page ne l'exercerait pas — la corbeille y
 * est de toute façon masquée pour un membre.
 */
function renderNotes() {
  const queryClient = createTestQueryClient();
  return renderHook(() => useNotes(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const GUARD = 'Seul un administrateur du foyer peut supprimer.';

beforeEach(() => {
  depositMock.mockReset();
  removeFileMock.mockReset().mockResolvedValue(undefined);
});

describe('useNotes — suppression de dossier réservée à l’administrateur', () => {
  it('rejette un membre non admin sans rien écrire', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { result } = renderNotes();

    await expect(result.current.deleteFolder('dossier-inexistant')).rejects.toThrow(GUARD);
    // Le garde tombe avant l'I/O : aucun `DataError` de ligne absente (18-02).
    expect(await data.list<NoteFolderRow>('note_folders', { id: 'dossier-inexistant' })).toHaveLength(0);
  });

  it('laisse un administrateur supprimer un dossier existant', async () => {
    seedHouseholdStore();
    const { result } = renderNotes();

    let created!: NoteFolderRow;
    await act(async () => {
      created = await result.current.createFolder('Divers', 'foyer');
    });

    await act(async () => {
      await result.current.deleteFolder(created.id);
    });

    expect(await data.list<NoteFolderRow>('note_folders', { id: created.id })).toHaveLength(0);
  });
});

/**
 * D-03, WR-10 — « la ligne et son objet meurent ensemble ». Supprimer une note
 * emporte les objets de ses pièces jointes ; en retirer une à l'édition emporte
 * le sien. L'ordre est imposé : ligne d'abord, objet ensuite.
 */
describe('useNotes — la note et ses pièces jointes meurent ensemble (D-03)', () => {
  it('retire l’objet de chaque pièce jointe quand la note disparaît', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-wr10-1');
    await attach(note.id, 'foyer-1/notes/note-wr10-1/ordonnance.pdf');
    await attach(note.id, 'foyer-1/notes/note-wr10-1/analyse.pdf');

    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);
    expect(target.attachments).toHaveLength(2);

    await act(async () => {
      await result.current.removeNote(target);
    });

    expect(removeFileMock).toHaveBeenCalledTimes(2);
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/notes/note-wr10-1/ordonnance.pdf');
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/notes/note-wr10-1/analyse.pdf');
    // La note est bien partie : le retrait d'objet ne l'a pas ressuscitée.
    expect(await data.list<NoteRow>('notes', { id: note.id })).toHaveLength(0);
  });

  it('ne retire rien pour une note sans pièce jointe', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-wr10-2');

    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);

    await act(async () => {
      await result.current.removeNote(target);
    });

    expect(removeFileMock).not.toHaveBeenCalled();
    expect(await data.list<NoteRow>('notes', { id: note.id })).toHaveLength(0);
  });

  it('retire l’objet d’une pièce jointe supprimée à l’édition, et rien d’autre', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-wr10-3');
    await attach(note.id, 'foyer-1/notes/note-wr10-3/conservee.pdf');
    const removedId = await attach(note.id, 'foyer-1/notes/note-wr10-3/retiree.pdf');

    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);
    expect(target.attachments).toHaveLength(2);

    await act(async () => {
      await result.current.editNote(target, formValues(), [], [removedId]);
    });

    expect(removeFileMock).toHaveBeenCalledTimes(1);
    expect(removeFileMock).toHaveBeenCalledWith('foyer-1/notes/note-wr10-3/retiree.pdf');
    // La pièce jointe conservée garde sa ligne ET son objet.
    const remaining = await data.list<{ id: string }>('note_attachments', { note_id: note.id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe(removedId);
  });
});
