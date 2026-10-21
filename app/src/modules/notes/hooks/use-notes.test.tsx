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

/** Pièce jointe image dont le dépôt simulé rend un chemin. */
async function attachImage(noteId: string, fileName: string): Promise<string> {
  depositMock.mockResolvedValueOnce({
    url: `https://signe.example/notes/${fileName}?token=expire`,
    path: `foyer-1/notes/${noteId}/${fileName}`,
    name: fileName,
    mime: 'image/jpeg',
    size: 2048,
  });
  const row = await createNoteAttachment(DEMO_HOUSEHOLD_ID, noteId, new File(['img'], fileName, { type: 'image/jpeg' }));
  return row.id;
}

async function storedNote(id: string): Promise<NoteRow> {
  const [row] = await data.list<NoteRow>('notes', { id });
  expect(row).toBeDefined();
  return row;
}

/**
 * 0136 — la couverture est une **désignation** parmi les pièces jointes. Le
 * choix d'un nouveau fichier porte un index, parce que son identifiant n'existe
 * qu'après le dépôt : c'est cette résolution-là que le test observe.
 */
describe('useNotes — la photo de couverture (0136)', () => {
  it('désigne la photo déposée dans le même envoi que la création', async () => {
    seedHouseholdStore();
    depositMock.mockResolvedValueOnce({
      url: 'https://signe.example/notes/lac.jpg?token=expire',
      path: 'foyer-1/notes/week-end/lac.jpg',
      name: 'lac.jpg',
      mime: 'image/jpeg',
      size: 2048,
    });
    const { result } = renderNotes();

    await act(async () => {
      await result.current.addNote(formValues('Week-end'), [new File(['img'], 'lac.jpg', { type: 'image/jpeg' })], {
        kind: 'new',
        fileIndex: 0,
      });
    });

    await waitFor(() => expect(result.current.notes.some((note) => note.title === 'Week-end')).toBe(true));
    const created = result.current.notes.find((note) => note.title === 'Week-end') as Note;
    const [row] = await data.list<NoteRow>('notes', { id: created.id });
    const [photo] = await data.list<{ id: string }>('note_attachments', { note_id: created.id });

    expect(row.cover_attachment_id).toBe(photo.id);
    expect(created.coverAttachmentId).toBe(photo.id);
    expect(created.cover?.id).toBe(photo.id);
  });

  it('passe d’une photo à l’autre, puis revient au repli quand la photo choisie disparaît', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-cover-1');
    const first = await attachImage(note.id, 'premiere.jpg');
    // Date fixée : deux dépôts dans la même milliseconde rendraient « la
    // première image » dépendante de l'ordre de lecture de la table, et le
    // test échouerait une fois sur trois sans qu'aucune règle ne soit cassée.
    await data.update('note_attachments', first, { created_at: '2026-10-01T09:00:00.000Z' });
    const second = await attachImage(note.id, 'seconde.jpg');

    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);
    // Sans désignation, la couverture est la première image jointe.
    expect(target.cover?.id).toBe(first);

    await act(async () => {
      await result.current.editNote(target, formValues(), [], [], { kind: 'attachment', id: second });
    });
    expect((await storedNote(note.id)).cover_attachment_id).toBe(second);

    const edited = await noteFrom(result, note.id);
    expect(edited.cover?.id).toBe(second);

    // La photo choisie est retirée, et le dialogue retombe sur « première photo ».
    await act(async () => {
      await result.current.editNote(edited, formValues(), [], [second], { kind: 'auto' });
    });
    expect((await storedNote(note.id)).cover_attachment_id).toBeNull();
    expect((await noteFrom(result, note.id)).cover?.id).toBe(first);
  });
});

/**
 * 0137 — le verrou fige le contenu pour tous, auteur compris, et ne se lève
 * que par son auteur ou un administrateur. Le refus local tombe avant l'I/O :
 * le test vérifie donc aussi que la ligne n'a pas bougé.
 */
describe('useNotes — le verrou d’une note (0137)', () => {
  it('refuse la modification et la suppression d’une note verrouillée, sans rien écrire', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-lock-1');
    await data.update<NoteRow>('notes', note.id, { is_locked: true });

    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);
    expect(target.locked).toBe(true);

    await expect(result.current.editNote(target, formValues('Renommée'))).rejects.toThrow(
      'Cette note est verrouillée : levez le verrou avant de la modifier.',
    );
    await expect(result.current.removeNote(target)).rejects.toThrow(
      'Cette note est verrouillée : levez le verrou avant de la supprimer.',
    );

    const [stored] = await data.list<NoteRow>('notes', { id: note.id });
    expect(stored.title).toBe('Ordonnances');
    expect(stored.is_locked).toBe(true);
  });

  it('réserve la levée du verrou à l’auteur et à l’administrateur', async () => {
    seedHouseholdStore();
    const note = await seedNote('note-lock-2');
    await data.update<NoteRow>('notes', note.id, { is_locked: true });

    // Thomas est membre, pas auteur : il voit le verrou mais ne le lève pas.
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { result } = renderNotes();
    const target = await noteFrom(result, note.id);
    expect(result.current.canUnlock(target)).toBe(false);
    await expect(result.current.setNoteLock(target, false)).rejects.toThrow(
      'Seul l’auteur de la note ou un administrateur peut lever son verrou.',
    );
    expect((await data.list<NoteRow>('notes', { id: note.id }))[0].is_locked).toBe(true);

    // Camille est l'autrice : elle lève le verrou, et la note redevient
    // modifiable dans la même foulée.
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.camille });
    // Le hook relit le membre courant par abonnement : attendre le rendu avant
    // d'appeler, sinon on interroge encore la fermeture du membre précédent.
    await waitFor(() => expect(result.current.canUnlock(target)).toBe(true));
    await act(async () => {
      await result.current.setNoteLock(target, false);
    });
    const unlocked = await noteFrom(result, note.id);
    expect(unlocked.locked).toBe(false);
    await act(async () => {
      await result.current.editNote(unlocked, formValues('Renommée'));
    });
    expect((await data.list<NoteRow>('notes', { id: note.id }))[0].title).toBe('Renommée');
  });
});
