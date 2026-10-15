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

/**
 * Table UNIQUE de correspondance extension → type MIME (D-04).
 *
 * C'est le seul endroit où une extension devient un type : `acceptedMimeOf` y
 * lit le type d'un fichier à `type` vide, et le dépôt écrit exactement le type
 * ainsi reconnu. Deux tables divergentes rouvriraient le défaut — le bucket
 * n'admet que les types d'`ACCEPTED_MIMES`.
 */
const EXTENSION_MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

export interface DepositedFile {
  /** URL signée (Supabase) ou aperçu local (mode démo). */
  url: string;
  /** Chemin dans le bucket (`null` en démo : rien à nettoyer côté serveur). */
  path: string | null;
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

/** Type MIME déduit de l'extension du nom, `null` quand il reste indéterminé. */
function extensionMime(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).trim().toLowerCase();
  if (ext === '') return null;
  return EXTENSION_MIMES[ext] ?? null;
}

/**
 * Type MIME de dépôt d'un fichier : celui que le navigateur déclare s'il est
 * admis, sinon celui déduit de l'extension. `null` quand le type reste
 * indéterminé — un type indéterminé se refuse, il ne s'invente pas (D-04).
 */
function acceptedMimeOf(file: File): string | null {
  const declared = normalizeMime(file.type);
  if (declared !== '' && ACCEPTED_MIMES.includes(declared)) return declared;
  return extensionMime(file.name);
}

/** Type déclaré par le navigateur, normalisé (`''` s'il est absent). */
function normalizeMime(declared: string): string {
  return declared.trim().toLowerCase();
}

/** Refus d'un type que la table ne permet pas de déterminer. */
function refusalMessage(file: File): string {
  const declared = file.type.trim();
  return declared === ''
    ? `Type de fichier indéterminé : « ${file.name} » (extension inconnue). Seules les images et les PDF sont acceptés.`
    : `Type de fichier non pris en charge : « ${declared} ». Seules les images et les PDF sont acceptés.`;
}

/**
 * Dépose un fichier sous `<householdId>/<folder>/…` et renvoie son URL.
 * Le type est celui déclaré par le navigateur s'il est admis, sinon celui
 * déduit de l'extension ; indéterminé, il est refusé avant tout envoi (D-04).
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

  // Le type est résolu AVANT tout envoi : déclaré par le navigateur s'il est
  // admis, sinon déduit de l'extension. Indéterminé, il se refuse — l'ancien
  // repli `application/pdf` déposait un JPEG mobile sous un type faux (WR-16).
  const mime = acceptedMimeOf(file);
  if (mime === null) throw new Error(refusalMessage(file));

  let blob: Blob = file;
  let storedMime = mime;
  if (mime.startsWith('image/')) {
    // `compressImage` lit `file.type`, vide sur les fichiers reconnus par leur
    // seule extension : on lui présente le type résolu, sinon il renoncerait
    // pour une image qu'on vient justement d'identifier.
    const source = file.type === mime ? file : new File([file], file.name, { type: mime });
    const compressed = await compressImage(source);
    blob = compressed.blob;
    storedMime = compressed.mime;
  }

  if (!isSupabaseConfigured || !supabase) {
    return { url: URL.createObjectURL(blob), path: null, name: file.name, mime: storedMime, size: blob.size };
  }

  const path = `${householdId}/${folder}/${randomId('file')}.${extensionFor(storedMime, file.name)}`;
  const { error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).upload(path, blob, {
    contentType: storedMime,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data: signed, error: signError } = await supabase.storage
    .from(HOUSEHOLD_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError) throw new Error(signError.message);
  return { url: signed.signedUrl, path, name: file.name, mime: storedMime, size: blob.size };
}

/**
 * Supprime un objet déposé (compensation d'un échec survenu APRÈS l'upload :
 * jamais d'orphelin en bucket). En démo (`path: null`), rien à nettoyer.
 * Best-effort : un échec de nettoyage ne masque jamais l'erreur d'origine.
 */
export async function removeHouseholdFile(path: string | null): Promise<void> {
  if (!path || !isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.storage.from(HOUSEHOLD_MEDIA_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

/**
 * Point unique de la VALEUR DE COLONNE d'un média du foyer (D-01).
 *
 * Le chemin du bucket est la référence durable ; l'`url` n'est lue qu'en repli
 * du mode démo, où `path` vaut `null` et l'`url` est un aperçu local (`blob:`,
 * éphémère après rechargement). C'est le seul endroit qui lit les champs du
 * dépôt : un module qui les lirait lui-même persisterait une URL signée
 * éphémère, et rouvrirait la famille WR-08.
 */
export function storedValueOf(deposited: DepositedFile): string {
  return deposited.path ?? deposited.url;
}

/**
 * Vrai quand la valeur stockée est un CHEMIN de bucket à forger : ni URL
 * http(s) (saisie manuelle ou URL signée héritée), ni `data:` hérité, ni aperçu
 * local `blob:`, ni ressource applicative `/…`.
 */
export function isHouseholdMediaPath(stored: string): boolean {
  return !/^(https?:\/\/|blob:|data:|\/)/i.test(stored);
}

/**
 * Chemin de bucket d'une valeur stockée, `null` pour les autres formes.
 *
 * La valeur est rognée AVANT le verdict : une chaîne exclusivement blanche
 * n'est pas un chemin, et il n'y a rien à signer ni à supprimer pour elle
 * (constat §5 de `deferred-items.md` de la phase 18, fermé ici dès la
 * naissance du helper).
 */
export function householdMediaPathOf(stored: string | null): string | null {
  if (stored === null) return null;
  const trimmed = stored.trim();
  if (trimmed === '') return null;
  return isHouseholdMediaPath(trimmed) ? trimmed : null;
}

/**
 * Forge l'URL affichable d'une valeur stockée — point unique de la lecture
 * (D-01), échec fermé (forme invité 06-04).
 *
 * Les formes non-chemin rendent telles quelles (`data:` et http(s) hérités,
 * aperçus `blob:` du mode démo) ; un chemin se signe sur
 * `HOUSEHOLD_MEDIA_BUCKET` ; toute erreur ou absence d'URL rend `null` :
 * le DOM ne reçoit jamais un chemin brut ni un lien mort.
 */
export async function resolveHouseholdMediaUrl(
  stored: string | null,
  ttl: number = SIGNED_URL_TTL,
): Promise<string | null> {
  if (stored === null) return null;
  const path = householdMediaPathOf(stored);
  if (!path) return stored.trim() === '' ? null : stored;
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: signed, error } = await supabase.storage
      .from(HOUSEHOLD_MEDIA_BUCKET)
      .createSignedUrl(path, ttl);
    if (error || !signed) return null;
    return signed.signedUrl;
  } catch {
    return null;
  }
}

/** Forge chaque valeur en URL affichable, en une passe (échec fermé par ligne). */
export async function resolveHouseholdMediaUrls(
  rows: { id: string; file_url: string | null }[],
  ttl: number = SIGNED_URL_TTL,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    rows.map(async (row) => [row.id, await resolveHouseholdMediaUrl(row.file_url, ttl)] as const),
  );
  const resolved: Record<string, string> = {};
  for (const [id, url] of entries) {
    if (url) resolved[id] = url;
  }
  return resolved;
}

/**
 * Décision pure « quel objet retirer quand un média en remplace un autre »
 * (D-03, généralisation de `shouldRemovePreviousPlacePhoto`).
 *
 * Rend le chemin PRÉCÉDENT quand c'est un chemin de bucket ET qu'il diffère de
 * la valeur suivante — un retrait (`nextStored` blanc) en fait partie. Rend
 * `null` pour toute forme non-chemin (URL signée héritée, `data:`, `blob:`,
 * `/…`), qui n'est pas un objet de bucket à supprimer.
 */
export function replacedMediaPath(previousStored: string | null, nextStored: string | null): string | null {
  const previous = householdMediaPathOf(previousStored);
  if (!previous) return null;
  const next = (nextStored ?? '').trim();
  return next.length === 0 || next !== previous ? previous : null;
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
