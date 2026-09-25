import type { NoteRow } from '@/types';
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
