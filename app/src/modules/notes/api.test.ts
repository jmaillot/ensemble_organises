import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '@/lib/data';
import type { NoteAttachmentRow } from '@/types';
import { coverToPayload, createNoteAttachment } from './api';

/**
 * WR-08/D-01 — la colonne `note_attachments.file_url` porte le CHEMIN du
 * bucket, jamais l'URL signée de 30 jours : une URL expirée est une donnée qui
 * pourrit, alors qu'un chemin se re-signe à chaque lecture
 * (`resolveHouseholdMediaUrls`). Le dépôt est doublé (rien ne part au réseau),
 * mais l'écriture passe par le vrai adaptateur : c'est la **ligne persistée**
 * qui est relue, pas l'argument d'un appel.
 */
const { depositMock } = vi.hoisted(() => ({ depositMock: vi.fn() }));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, depositHouseholdFile: depositMock };
});

beforeEach(() => {
  depositMock.mockReset();
});

function pdf(name = 'ordonnance.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

/**
 * La ligne déposée par ce fichier, et elle seule : la démo pose désormais une
 * photo de couverture sur les notes 1 et 2 (0136), donc compter les pièces
 * jointes d'une note ne dirait plus rien du dépôt.
 */
async function storedRow(id: string): Promise<NoteAttachmentRow> {
  const rows = await data.list<NoteAttachmentRow>('note_attachments', { note_id: id });
  const deposited = rows.filter((row) => row.file_name === 'ordonnance.pdf');
  expect(deposited).toHaveLength(1);
  return deposited[0];
}

describe('pièces jointes de notes — chemin persisté (D-01)', () => {
  it('écrit le chemin du bucket dans file_url, jamais l’URL signée', async () => {
    depositMock.mockResolvedValue({
      url: 'https://signe.example/notes/ordonnance.pdf?token=expire',
      path: 'foyer-1/notes/note-1/ordonnance.pdf',
      name: 'ordonnance.pdf',
      mime: 'application/pdf',
      size: 12,
    });

    await createNoteAttachment('foyer-1', 'note-1', pdf());
    const row = await storedRow('note-1');

    expect(row.file_url).toBe('foyer-1/notes/note-1/ordonnance.pdf');
    expect(row.file_url).not.toMatch(/^https?:\/\//);
    expect(row).toMatchObject({ file_name: 'ordonnance.pdf', mime_type: 'application/pdf', size_bytes: 12 });

    await data.remove('note_attachments', row.id);
  });

  it('en mode démo (path nul), l’aperçu local éphémère reste la valeur', async () => {
    depositMock.mockResolvedValue({
      url: 'blob:apercu-demo',
      path: null,
      name: 'ordonnance.pdf',
      mime: 'application/pdf',
      size: 12,
    });

    await createNoteAttachment('foyer-1', 'note-2', pdf());
    const row = await storedRow('note-2');

    expect(row.file_url).toBe('blob:apercu-demo');

    await data.remove('note_attachments', row.id);
  });
});

describe('coverToPayload (0136)', () => {
  it('n’écrit rien pour « première photo »', () => {
    expect(coverToPayload({ kind: 'auto' }, { keptAttachmentIds: ['a'], createdAttachmentIds: [] })).toBeNull();
  });

  it('désigne une pièce jointe conservée', () => {
    expect(coverToPayload({ kind: 'attachment', id: 'a' }, { keptAttachmentIds: ['a'], createdAttachmentIds: [] })).toBe('a');
  });

  it('ignore une pièce jointe retirée dans le même envoi', () => {
    expect(coverToPayload({ kind: 'attachment', id: 'a' }, { keptAttachmentIds: [], createdAttachmentIds: [] })).toBeNull();
  });

  it('résout l’index d’un nouveau fichier en identifiant déposé', () => {
    expect(
      coverToPayload(
        { kind: 'new', fileIndex: 1 },
        { keptAttachmentIds: [], createdAttachmentIds: ['x', 'y'] },
      ),
    ).toBe('y');
  });
});
