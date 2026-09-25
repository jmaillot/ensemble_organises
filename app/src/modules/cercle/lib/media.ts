/**
 * Compression d'images avant envoi, 100 % native (aucune dépendance) :
 * `createImageBitmap` → `<canvas>` → `toBlob('image/webp')` avec repli JPEG.
 * Les photos de famille sont volumineuses ; les compresser ici évite de saturer
 * le quota de stockage et l'envoi mobile.
 */

/** Côté maximal conservé : 1600 px suffit pour un affichage plein écran. */
export const MAX_MEDIA_EDGE = 1600;
export const WEBP_QUALITY = 0.82;
export const JPEG_QUALITY = 0.85;

export interface CompressedImage {
  blob: Blob;
  mime: string;
  /** Nom de fichier reconstruit, extension alignée sur le format produit. */
  name: string;
  /** Nom d'origine, affiché sous le sélecteur de média. */
  originalName: string;
  size: number;
  width: number;
  height: number;
  /** URL d'aperçu locale (`URL.createObjectURL`). */
  previewUrl: string;
}

export function supportsImageBitmap(): boolean {
  return typeof createImageBitmap === 'function';
}

/** WebP disponible si le canvas sait l encoder. */
export function supportsWebp(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function extensionFor(mime: string, fallback: string) {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';
  const fromName = fallback.split('.').pop();
  return fromName && /^[a-z0-9]+$/i.test(fromName) ? fromName.toLowerCase() : 'jpg';
}

function baseName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function encode(canvas: HTMLCanvasElement, webp: boolean) {
  const webpBlob = webp ? await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY) : null;
  if (webpBlob) return { blob: webpBlob, mime: 'image/webp' };
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
  if (!jpegBlob) throw new Error('Cette image ne peut pas être encodée.');
  return { blob: jpegBlob, mime: 'image/jpeg' };
}

/**
 * Redimensionne puis recompresse une image. Si l'API `createImageBitmap` est
 * indisponible (navigateur ancien, environnement de test), le fichier d'origine
 * est renvoyé tel quel : la publication reste possible.
 */
export async function compressImage(file: File, options: { maxEdge?: number } = {}): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Sélectionnez une image (JPEG, PNG ou HEIC).');
  }
  if (!supportsImageBitmap() || typeof document === 'undefined') {
    return {
      blob: file,
      mime: file.type || 'image/jpeg',
      name: file.name,
      originalName: file.name,
      size: file.size,
      width: 0,
      height: 0,
      previewUrl: URL.createObjectURL(file),
    };
  }

  const maxEdge = options.maxEdge ?? MAX_MEDIA_EDGE;
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Le canvas n’est pas disponible sur cet appareil.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const { blob, mime } = await encode(canvas, supportsWebp());
  return {
    blob,
    mime,
    name: `${baseName(file.name)}.${extensionFor(mime, file.name)}`,
    originalName: file.name,
    size: blob.size,
    width,
    height,
    previewUrl: URL.createObjectURL(blob),
  };
}

/** Libellé compact du média : « IMG_2048.jpg · 214 Ko ». */
export function describeFile(name: string, size: number): string {
  return `${name} · ${formatBytes(size)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Ko';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
