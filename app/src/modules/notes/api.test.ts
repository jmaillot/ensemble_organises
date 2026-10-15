import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '@/lib/data';
import type { NoteAttachmentRow } from '@/types';
import { createNoteAttachment } from './api';

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

async function storedRow(id: string): Promise<NoteAttachmentRow> {
  const rows = await data.list<NoteAttachmentRow>('note_attachments', { note_id: id });
  expect(rows).toHaveLength(1);
  return rows[0];
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
