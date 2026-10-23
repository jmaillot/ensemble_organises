import { z } from 'zod';
import type { DocumentFolderRow, DocumentRow } from '@/types';

/**
 * Documents du foyer (vague 3.2) : dossiers colorés, papiers photo ou PDF,
 * expiration et note. La structure reprend celle des modules frigo et menu.
 */

export type DocumentFolderColor = DocumentFolderRow['color'];

export const documentFolderColors: DocumentFolderColor[] = ['sage', 'blush', 'butter', 'sky', 'lilac', 'sand'];

export const documentFolderColorLabels: Record<DocumentFolderColor, string> = {
  sage: 'Vert sauge',
  blush: 'Rose poudré',
  butter: 'Jaune beurre',
  sky: 'Bleu ciel',
  lilac: 'Lilas',
  sand: 'Sable',
};

/** La même palette en classes Tailwind, pour peindre la pastille du dossier. */
export const documentFolderColorClasses: Record<DocumentFolderColor, string> = {
  sage: 'bg-[color:var(--color-sage)]',
  blush: 'bg-[color:var(--color-blush)]',
  butter: 'bg-[color:var(--color-butter)]',
  sky: 'bg-[color:var(--color-sky)]',
  lilac: 'bg-[color:var(--color-lilac)]',
  sand: 'bg-[color:var(--color-sand)]',
};

export interface DocumentFolder {
  id: string;
  householdId: string;
  name: string;
  color: DocumentFolderColor;
  createdById: string | null;
}

export interface Document {
  id: string;
  householdId: string;
  folderId: string | null;
  name: string;
  mime: string;
  /** Taille en octets, toujours positive (contrainte 0143). */
  size: number;
  /** Chemin du bucket privé `household-media` ; l'URL signée naît à la lecture. */
  storagePath: string;
  /** Date d'expiration, ISO « YYYY-MM-DD », ou null. */
  expiresOn: string | null;
  notes: string | null;
  createdById: string | null;
}

export function toDocumentFolder(row: DocumentFolderRow): DocumentFolder {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    color: row.color,
    createdById: row.created_by,
  };
}

export function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    householdId: row.household_id,
    folderId: row.folder_id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    storagePath: row.storage_path,
    expiresOn: row.expires_on,
    notes: row.notes,
    createdById: row.created_by,
  };
}

/** État d'expiration d'un papier : même vocabulaire pur que le frigo. */
export type DocumentExpiryState = 'expired' | 'soon' | 'ok' | 'none';

/** « Bientôt périmé » : à J-2, comme les rappels d'expiration du module. */
export const DOCUMENT_SOON_DAYS = 2;

export function documentExpiryStateOf(expiresOn: string | null, todayIso: string): DocumentExpiryState {
  if (!expiresOn) return 'none';
  const toDays = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const diff = toDays(expiresOn) - toDays(todayIso);
  if (diff < 0) return 'expired';
  if (diff <= DOCUMENT_SOON_DAYS) return 'soon';
  return 'ok';
}

export const documentExpiryLabels: Record<DocumentExpiryState, string> = {
  expired: 'Expiré',
  soon: 'Bientôt expiré',
  ok: 'Valide',
  none: 'Sans échéance',
};

/** Classes d'affichage des pastilles d'expiration, même vocabulaire que le frigo. */
export const documentExpiryToneClass: Record<DocumentExpiryState, string> = {
  expired: 'bg-coral text-surface',
  soon: 'bg-amber-soft text-amber-strong',
  ok: 'bg-accent-soft text-accent-strong',
  none: 'bg-bg text-muted',
};

/** Tri : expirés d'abord, puis bientôt expirés, puis sans échéance, puis le reste. */
export function sortDocuments(documents: Document[], todayIso: string): Document[] {
  const rank: Record<DocumentExpiryState, number> = { expired: 0, soon: 1, none: 2, ok: 3 };
  return [...documents].sort((a, b) => {
    const d = rank[documentExpiryStateOf(a.expiresOn, todayIso)] - rank[documentExpiryStateOf(b.expiresOn, todayIso)];
    if (d !== 0) return d;
    if (a.expiresOn && b.expiresOn && a.expiresOn !== b.expiresOn) return a.expiresOn < b.expiresOn ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Édition sans redépôt : le fichier reste celui du dépôt d'origine. */
export interface DocumentEditValues {
  name: string;
  folderId: string | null;
  expiresOn: string | null;
  notes: string | null;
}

/** « 1,2 Mo » : les tailles se lisent, elles ne se comptent pas. */
export function formatDocumentSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} o`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0).replace('.', ',')} Ko`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
}

/** Le type dit ce que l'écran affiche : aperçu pour les images, étiquette pour les PDF. */
export type DocumentKind = 'image' | 'pdf';

export function documentKindOf(mime: string): DocumentKind {
  return mime.startsWith('image/') ? 'image' : 'pdf';
}

export const documentFolderFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du dossier est requis.').max(80, '80 caractères au plus.'),
  color: z.enum(['sage', 'blush', 'butter', 'sky', 'lilac', 'sand']),
});

export type DocumentFolderFormValues = z.infer<typeof documentFolderFormSchema>;

/**
 * Un seul schéma, un seul type de valeurs. Le champ fichier est `File | null`
 * : à la CRÉATION le formulaire exige un fichier (un document sans fichier
 * serait un papier fantôme), à l'ÉDITION le fichier du dépôt d'origine est
 * conservé et le champ devient facultatif. L'exigence de création est portée
 * par le dialogue (et ré-éprouvée par la garde de `createDocument`), pas par
 * le schéma — qui doit rester compatible avec les deux modes.
 */
export interface DocumentFormValues {
  name: string;
  folderId: string | null;
  file: File | null;
  expiresOn: string | null;
  notes: string | null;
}

export const documentFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du document est requis.').max(200, '200 caractères au plus.'),
  folderId: z.string().nullable(),
  file: z.instanceof(File, { message: 'Choisissez une photo ou un PDF.' }).nullable(),
  expiresOn: z.string().nullable(),
  notes: z.string().trim().max(1000, '1000 caractères au plus.').nullable(),
});

/** Ce que l'upload renvoie : la forme déposée, jamais une URL signée. */
export interface UploadedDocumentFile {
  /** Chemin du bucket `household-media`, colonne de la table. */
  path: string;
  mime: string;
  size: number;
}

/**
 * Colonnes de `documents` : la forme déposée + les champs du formulaire.
 * Le chemin porte la colonne ; l'URL signée naît à la lecture (motif 19-01).
 */
export function documentRowPayload(values: DocumentFormValues, uploaded: UploadedDocumentFile): Pick<DocumentRow, 'name' | 'folder_id' | 'mime' | 'size' | 'storage_path' | 'expires_on' | 'notes'> {
  return {
    name: values.name,
    folder_id: values.folderId,
    mime: uploaded.mime,
    size: uploaded.size,
    storage_path: uploaded.path,
    expires_on: values.expiresOn || null,
    notes: values.notes?.trim() || null,
  };
}

export function documentFolderFormValuesToRow(values: DocumentFolderFormValues): Pick<DocumentFolderRow, 'name' | 'color'> {
  return {
    name: values.name,
    color: values.color,
  };
}

/**
 * Édition SANS redépôt : le fichier (mime, size, storage_path) reste celui du
 * dépôt d'origine. Seuls le nom, le classement, l'échéance et la note sont
 * réécrits — remplacer un papier est un geste de suppression et de nouveau
 * dépôt, jamais une édition invisible.
 */
export function documentEditPayload(
  values: Pick<DocumentFormValues, 'name' | 'folderId' | 'expiresOn' | 'notes'>,
): Pick<DocumentRow, 'name' | 'folder_id' | 'expires_on' | 'notes'> {
  return {
    name: values.name,
    folder_id: values.folderId,
    expires_on: values.expiresOn || null,
    notes: values.notes?.trim() || null,
  };
}
