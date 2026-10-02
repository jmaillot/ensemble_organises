import { describe, expect, it } from 'vitest';
import { filterNotesByFolder, type Note } from './types';

const note = (overrides: Partial<Note>): Note => ({
  id: 'n',
  title: 'Note',
  content: '',
  category: 'Maison',
  visibility: 'privee',
  shared: false,
  authorId: null,
  folderId: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  updatedAt: '2026-10-02T10:00:00.000Z',
  ageLabel: 'À l’instant',
  attachments: [],
  ...overrides,
});

describe('filterNotesByFolder', () => {
  const notes = [note({ id: 'a' }), note({ id: 'b', folderId: 'f1' })];
  it('null = Général', () => {
    expect(filterNotesByFolder(notes, null).map((entry) => entry.id)).toEqual(['a']);
  });
  it('dossier explicite', () => {
    expect(filterNotesByFolder(notes, 'f1').map((entry) => entry.id)).toEqual(['b']);
  });
});
