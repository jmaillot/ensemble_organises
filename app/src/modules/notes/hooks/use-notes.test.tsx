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
 * `0134` a déplacé la règle : un dossier perso appartient à son propriétaire,
 * qui peut le supprimer — son contenu part avec lui, sans quoi supprimer
 * « mes notes privées » les publierait dans Général. Un dossier foyer reste
 * réservé à l'administrateur, et son contenu retombe dans Général. Le garde du
 * hook tombe avant l'I/O : un refus ne doit rien écrire.
 */
function renderNotes() {
  const queryClient = createTestQueryClient();
  return renderHook(() => useNotes(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const GUARD_FOYER = 'Seul un administrateur du foyer peut supprimer ce dossier.';

beforeEach(() => {
  depositMock.mockReset();
  removeFileMock.mockReset().mockResolvedValue(undefined);
});

describe('useNotes — suppression d’un dossier selon sa visibilité (0134)', () => {
  it('refuse à un membre le dossier foyer d’un autre, sans rien écrire', async () => {
    seedHouseholdStore();
    const folder = await data.create<NoteFolderRow>('note_folders', {
      id: 'folder-0134-foyer',
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Foyer',
      visibility: 'foyer',
      is_default: false,
      owner_member_id: DEMO_MEMBERS.camille,
    });
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { result } = renderNotes();
    await waitFor(() => expect(result.current.folders.some((entry) => entry.id === folder.id)).toBe(true));

    await expect(result.current.deleteFolder(folder.id)).rejects.toThrow(GUARD_FOYER);
    expect(await data.list<NoteFolderRow>('note_folders', { id: folder.id })).toHaveLength(1);
  });

  it('laisse un membre supprimer son dossier perso, contenu compris', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { result } = renderNotes();

    let created!: NoteFolderRow;
    await act(async () => {
      created = await result.current.createFolder('Privé', 'perso');
    });
    await waitFor(() => expect(result.current.folders.some((entry) => entry.id === created.id)).toBe(true));
    const note = await data.create<NoteRow>('notes', {
      id: 'note-0134-privee',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: null,
      title: 'Privée',
      content: '',
      category: 'Maison',
      color: 'accent',
      folder_id: created.id,
      created_by: DEMO_MEMBERS.thomas,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await act(async () => {
      await result.current.deleteFolder(created.id);
    });

    expect(await data.list<NoteFolderRow>('note_folders', { id: created.id })).toHaveLength(0);
    // La note privée ne doit pas resurgir dans Général, visible de tous.
    expect(await data.list<NoteRow>('notes', { id: note.id })).toHaveLength(0);
  });

  it('laisse un administrateur supprimer un dossier foyer, dont le contenu retombe dans Général', async () => {
    seedHouseholdStore();
    const { result } = renderNotes();

    let created!: NoteFolderRow;
    await act(async () => {
      created = await result.current.createFolder('Divers', 'foyer');
    });
    await waitFor(() => expect(result.current.folders.some((entry) => entry.id === created.id)).toBe(true));
    const note = await data.create<NoteRow>('notes', {
      id: 'note-0134-foyer',
      household_id: DEMO_HOUSEHOLD_ID,
      trip_id: null,
      title: 'Partagée',
      content: '',
      category: 'Maison',
      color: 'accent',
      folder_id: created.id,
      created_by: DEMO_MEMBERS.camille,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await act(async () => {
      await result.current.deleteFolder(created.id);
    });

    expect(await data.list<NoteFolderRow>('note_folders', { id: created.id })).toHaveLength(0);
    const [survivor] = await data.list<NoteRow>('notes', { id: note.id });
    expect(survivor?.folder_id).toBeNull();
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
