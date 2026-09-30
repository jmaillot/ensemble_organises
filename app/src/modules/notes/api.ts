import { data } from '@/lib/data';
import type { NoteAttachmentRow, NoteRow } from '@/types';
import { depositHouseholdFile } from '@/lib/storage';
import { randomId } from '@/lib/utils';
import { resolveCategory, visibilityToColor, type NoteFormValues } from './types';

export const NOTES_TABLE = 'notes';

export type NotePayload = Partial<NoteRow>;

/** Horodatage des écritures de notes (création et modification). */
export const nowIso = () => new Date().toISOString();

/** Catégorie réellement enregistrée, catégorie libre comprise. */
export function categoryOf(values: NoteFormValues): string {
  return resolveCategory(values);
}

/** Transforme la saisie du dialogue en ligne `notes`. */
export function toNotePayload(values: NoteFormValues): NotePayload {
  return {
    title: values.title.trim(),
    content: values.content.trim(),
    category: categoryOf(values),
    color: visibilityToColor(values.visibility),
  };
}

export async function createNoteAttachment(
  householdId: string,
  noteId: string,
  file: File,
): Promise<NoteAttachmentRow> {
  const deposited = await depositHouseholdFile({ householdId, folder: `notes/${noteId}`, file });
  return data.create<NoteAttachmentRow>('note_attachments', {
    id: randomId('note-attachment'),
    note_id: noteId,
    household_id: householdId,
    file_url: deposited.url,
    file_name: deposited.name,
    mime_type: deposited.mime,
    size_bytes: deposited.size,
  });
}

export async function removeNoteAttachment(id: string): Promise<void> {
  await data.remove('note_attachments', id);
}
