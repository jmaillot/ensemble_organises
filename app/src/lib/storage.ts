/**
 * Dépôt de fichiers du foyer dans le bucket privé `household-media`.
 *
 * Même régime que les médias du Cercle : compression navigateur pour les
 * images (`cercle/lib/media`, native, sans dépendance), dépôt tel quel pour
 * les PDF ; URL signée en mode Supabase, aperçu local (`blob:`) en mode
 * démo — éphémère après rechargement, comme pour le Cercle.
 *
 * Seuls les types admis par le bucket sont acceptés (images + PDF depuis la
 * migration 0043) : le refus a lieu avant tout envoi.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';
import { compressImage } from '@/modules/cercle/lib/media';
import { randomId } from './utils';

/** Bucket privé des fichiers du foyer : seul nom que les politiques connaissent. */
export const HOUSEHOLD_MEDIA_BUCKET = 'household-media';
/** Durée de validité des URL signées servies par le Storage. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 30;

const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'application/pdf',
];

export interface DepositedFile {
  /** URL signée (Supabase) ou aperçu local (mode démo). */
  url: string;
  /** Nom d'origine, affiché dans les listes de pièces jointes. */
  name: string;
  mime: string;
  size: number;
}

function extensionFor(mime: string, fallbackName: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'application/pdf') return 'pdf';
  const fromName = fallbackName.split('.').pop();
  return fromName && /^[a-z0-9]+$/i.test(fromName) ? fromName.toLowerCase() : 'bin';
}

function isAccepted(file: File): boolean {
  if (ACCEPTED_MIMES.includes(file.type)) return true;
  // Certains mobiles déclarent un type vide : on se rabat sur l'extension.
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'avif';
}

/**
 * Dépose un fichier sous `<householdId>/<folder>/…` et renvoie son URL.
 * Les images sont compressées avant envoi ; les PDF partent tels quels.
 */
export async function depositHouseholdFile(input: {
  householdId: string;
  /** Dossier du module : `pets`, `notes`… */
  folder: string;
  file: File;
}): Promise<DepositedFile> {
  const { householdId, folder, file } = input;
  if (!householdId) throw new Error('Aucun foyer sélectionné.');
  if (!isAccepted(file)) throw new Error('Seules les images et les PDF sont acceptés.');

  let blob: Blob = file;
  let mime = file.type || 'application/octet-stream';
  if (file.type.startsWith('image/')) {
    const compressed = await compressImage(file);
    blob = compressed.blob;
    mime = compressed.mime;
  } else if (mime !== 'application/pdf') {
    // Type deviné par l'extension (mobiles) : le bucket n'admet que le PDF
    // hors images.
    mime = 'application/pdf';
  }

  if (!isSupabaseConfigured || !supabase) {
    return { url: URL.createObjectURL(blob), name: file.name, mime, size: blob.size };
  }

  const path = `${householdId}/${folder}/${randomId('file')}.${extensionFor(mime, file.name)}`;
  const { error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).upload(path, blob, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: signed, error: signError } = await supabase.storage
    .from(HOUSEHOLD_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw new Error(signError.message);
  return { url: signed.signedUrl, name: file.name, mime, size: blob.size };
}

/** « ordonnance.pdf · 214 Ko », comme dans le Cercle. */
export function describeAttachment(name: string, size: number): string {
  return `${name} · ${formatBytes(size)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Ko';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Vignette image ou puce fichier, selon le type MIME stocké. */
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
