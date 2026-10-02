import { data } from '@/lib/data';
import type { NoteAttachmentRow, NoteFolderRow, NoteRow } from '@/types';
import { depositHouseholdFile } from '@/lib/storage';
import { randomId } from '@/lib/utils';
import { resolveCategory, visibilityToColor, type NoteFormValues } from './types';

export const NOTES_TABLE = 'notes';
export const NOTE_FOLDERS_TABLE = 'note_folders';

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
    folder_id: values.folderId === '' ? null : values.folderId,
  };
}

/** Dossiers de notes : création (propriétaire = soi), renommage. */
export async function createNoteFolder(
  householdId: string,
  ownerMemberId: string,
  name: string,
  visibility: NoteFolderRow['visibility'],
): Promise<NoteFolderRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.create<NoteFolderRow>(NOTE_FOLDERS_TABLE, {
    household_id: householdId,
    name: trimmed,
    visibility,
    owner_member_id: ownerMemberId,
  });
}

export async function renameNoteFolder(id: string, name: string): Promise<NoteFolderRow> {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 80) throw new Error('Nom de dossier invalide (1 à 80 caractères).');
  return data.update<NoteFolderRow>(NOTE_FOLDERS_TABLE, id, { name: trimmed });
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
