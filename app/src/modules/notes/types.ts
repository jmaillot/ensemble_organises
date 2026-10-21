import { formatMediumDate, toLocalDate } from '@/lib/utils';
import type { NoteAttachmentRow, NoteRow } from '@/types';

/**
 * Catégories proposées par l'export, complétées d'une catégorie libre saisie
 * dans le dialogue.
 */
export const NOTE_CATEGORIES = ['Maison', 'Foyer', 'Loisirs', 'À faire'] as const;
export const OTHER_CATEGORY = 'Autre';

export type NoteCategoryChoice = (typeof NOTE_CATEGORIES)[number] | typeof OTHER_CATEGORY;

/** Visibilité d'une note : privée pour l'auteur, ou point de repère du foyer. */
export type NoteVisibility = 'privee' | 'foyer';

export const noteVisibilityLabels: Record<NoteVisibility, string> = {
  privee: 'Privée',
  foyer: 'Partagée avec le foyer',
};

export const noteVisibilityOptions: ReadonlyArray<{ value: NoteVisibility; label: string }> = [
  { value: 'privee', label: 'Privée · dans mon espace' },
  { value: 'foyer', label: 'Partagée avec le foyer' },
];

export type NoteTone = 'accent' | 'coral' | 'amber' | 'muted';

/** Couleur stable d'une catégorie, y compris pour les catégories libres. */
const CATEGORY_TONES: Record<string, NoteTone> = {
  Maison: 'accent',
  Foyer: 'coral',
  Loisirs: 'amber',
  'À faire': 'muted',
};

const TONE_FALLBACK: NoteTone[] = ['accent', 'coral', 'amber', 'muted'];

export function noteCategoryTone(category: string): NoteTone {
  const known = CATEGORY_TONES[category];
  if (known) return known;
  const hash = [...category].reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return TONE_FALLBACK[hash % TONE_FALLBACK.length];
}

/** Type métier d'une note du foyer. */
export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  visibility: NoteVisibility;
  /** `true` quand la note est un repère partagé avec le foyer. */
  shared: boolean;
  authorId: string | null;
  /** Dossier (`note_folders.id`), `null` = Général. */
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  /** « À l'instant », « Il y a 2 j », ou la date complète. */
  ageLabel: string;
  /** Pièces jointes de la note, comme pour le Cercle. */
  attachments: NoteAttachment[];
  /** Pièce jointe **désignée** comme couverture (`notes.cover_attachment_id`). */
  coverAttachmentId: string | null;
  /**
   * Couverture affichable : la photo désignée, sinon la première image jointe,
   * sinon `null`. Résolue à la lecture, donc jamais une image morte : une photo
   * supprimée laisse `coverAttachmentId` à `NULL` côté base et la carte retombe
   * sur l'image suivante.
   */
  cover: NoteAttachment | null;
}

/**
 * Choix de couverture fait dans le dialogue. `auto` désigne la première image
 * jointe sans rien écrire ; `new` porte l'index du fichier dans la sélection
 * courante, parce que son identifiant n'existe qu'après le dépôt.
 */
export type NoteCoverChoice =
  | { kind: 'auto' }
  | { kind: 'attachment'; id: string }
  | { kind: 'new'; fileIndex: number };

/** Vrai pour une pièce jointe affichable comme couverture. */
export function isCoverImage(attachment: Pick<NoteAttachment, 'mime'>): boolean {
  return attachment.mime.startsWith('image/');
}

/**
 * Couverture effective d'une note : la photo désignée si elle est encore là et
 * qu'elle est une image, sinon la première image jointe.
 */
export function pickCover(attachments: NoteAttachment[], coverId: string | null): NoteAttachment | null {
  const images = attachments.filter(isCoverImage);
  const chosen = coverId ? images.find((attachment) => attachment.id === coverId) : undefined;
  return chosen ?? images[0] ?? null;
}

/** Pièce jointe d'une note : photo ou PDF. */
export interface NoteAttachment {
  id: string;
  noteId: string;
  /**
   * URL affichable forgée à la lecture (D-01), `null` en échec fermé : le DOM
   * ne reçoit jamais un chemin brut ni un lien mort. Éphémère — ne jamais la
   * confondre avec `storedUrl`.
   */
  url: string | null;
  /**
   * Valeur de la colonne `file_url` : chemin du bucket pour les dépôts
   * récents, `blob:`/`data:`/http(s) hérités sinon. C'est la seule grandeur
   * comparable d'une édition à l'autre, et celle que la suppression d'objet
   * lit pour retirer le fichier du bucket.
   */
  storedUrl: string;
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
}

/**
 * Conversion d'une ligne `note_attachments` en type métier. L'URL affichable
 * est passée par l'appelant (résolue par `resolveHouseholdMediaUrls`) ; les
 * formes non-chemin lui sont transmises telles quelles (aperçus démo, valeurs
 * héritées), à l'image de `toProviderAttachment`.
 */
export function toNoteAttachment(row: NoteAttachmentRow, url: string | null = null): NoteAttachment {
  return {
    id: row.id,
    noteId: row.note_id,
    url,
    storedUrl: row.file_url,
    fileName: row.file_name,
    mime: row.mime_type,
    size: row.size_bytes,
    createdAt: row.created_at,
  };
}

export interface NoteFormValues {
  title: string;
  category: NoteCategoryChoice;
  customCategory: string;
  content: string;
  visibility: NoteVisibility;
  /** Dossier (`note_folders.id`), chaîne vide = Général. */
  folderId: string;
}

const clockFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const formatClockTime = (iso: string) => clockFormatter.format(toLocalDate(iso));

export const memberFirstName = (name: string) => name.split(' ')[0]?.trim() || name;

/** Ancienneté d'une note, exprimée comme dans l'export. */
export function ageLabel(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 3 * 60_000) return 'À l’instant';
  const days = Math.floor(elapsed / 86_400_000);
  if (days < 1) return `Il y a ${Math.max(1, Math.round(elapsed / 3_600_000))} h`;
  if (days <= 7) return `Il y a ${days} j`;
  return formatMediumDate(iso);
}

/**
 * Conversion d'une ligne `notes` en type métier.
 *
 * La table ne possède pas encore de colonne de visibilité : la colonne `color`
 * en sert de porteuse (`accent` = partagée, `null` = privée). Une migration
 * backend devra remplacer ce porteur par une colonne `visibility` dédiée.
 */
export function toNote(row: NoteRow, attachments: NoteAttachment[] = []): Note {
  const shared = Boolean(row.color);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    visibility: shared ? 'foyer' : 'privee',
    shared,
    authorId: row.created_by,
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ageLabel: ageLabel(row.updated_at),
    attachments,
    coverAttachmentId: row.cover_attachment_id ?? null,
    cover: pickCover(attachments, row.cover_attachment_id ?? null),
  };
}

/** Valeur de `notes.color` correspondant à une visibilité. */
export function visibilityToColor(visibility: NoteVisibility): string | null {
  return visibility === 'foyer' ? 'accent' : null;
}

/** Catégorie libre saisie dans le dialogue, ou catégorie choisie. */
export function resolveCategory(values: NoteFormValues): string {
  const custom = values.customCategory.trim();
  if (values.category === OTHER_CATEGORY) return custom === '' ? OTHER_CATEGORY : custom;
  return values.category;
}

export interface NoteFilters {
  query: string;
  /** Catégorie vide = toutes les catégories. */
  category: string;
}

export const emptyNoteFilters: NoteFilters = { query: '', category: '' };

export function isNoteFilterActive(filters: NoteFilters): boolean {
  return filters.query.trim() !== '' || filters.category !== '';
}

/** Recherche plein texte sur le titre, le contenu et la catégorie. */
export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  const query = filters.query.trim().toLowerCase();
  return notes.filter((note) => {
    if (filters.category !== '' && note.category !== filters.category) return false;
    if (query === '') return true;
    return `${note.title} ${note.content} ${note.category}`.toLowerCase().includes(query);
  });
}

/** Onglet dossier : `null` = Général (notes sans dossier). */
export function filterNotesByFolder(notes: Note[], folderId: string | null): Note[] {
  return notes.filter((note) => (note.folderId ?? null) === folderId);
}

/** Tri par date de modification décroissante, la première note étant mise en avant. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const delta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (delta !== 0) return delta;
    return a.title.localeCompare(b.title, 'fr');
  });
}

/** Catégories présentes dans les notes, dans l'ordre du formulaire puis alphabétique. */
export function noteCategories(notes: Note[]): string[] {
  const present = new Set(notes.map((note) => note.category));
  const known = NOTE_CATEGORIES.filter((category) => present.has(category));
  const custom = [...present].filter((category) => !NOTE_CATEGORIES.includes(category as (typeof NOTE_CATEGORIES)[number]));
  return [...known, ...custom.sort((a, b) => a.localeCompare(b, 'fr'))];
}

export interface NoteMetrics {
  total: number;
  /** Nombre de catégories distinctes (et non la liste, cf. `noteCategories`). */
  categoryCount: number;
  shared: number;
  /** Note modifiée la plus récemment, pour la vignette « Dernière mise à jour ». */
  latest: Note | null;
}

export function noteMetrics(notes: Note[]): NoteMetrics {
  return {
    total: notes.length,
    categoryCount: noteCategories(notes).length,
    shared: notes.filter((note) => note.shared).length,
    latest: sortNotes(notes)[0] ?? null,
  };
}

/**
 * Texte nu d'un contenu Markdown.
 *
 * L'extrait de carte tient sur une ou deux lignes : les repères de syntaxe y
 * seraient du bruit (« **Préparer** les cartables »). On retire donc les
 * marques en gardant le texte qu'elles portaient — un lien perd son adresse
 * mais pas son libellé, une image garde sa légende.
 */
export function notePlainText(content: string): string {
  // Le code est mis de côté avant le nettoyage : `snake_case` dans une portée
  // de code n'est pas de l'italique, et retirer ses soulignés changerait le
  // texte qu'on prétend seulement débarrasser de ses repères.
  const code: string[] = [];
  const stash = (body: string) => `\u0000${code.push(body.trim()) - 1}\u0000`;

  const withoutCode = content
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, (_match, body: string) => stash(body))
    .replace(/`([^`\n]+)`/g, (_match, body: string) => stash(body));

  return withoutCode
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, ' ')
    .replace(/^\s*```[^\n]*$/gm, ' ')
    // Les bornes évitent de prendre `snake_case` ou `2 * 3` pour de l'italique :
    // un marqueur n'ouvre pas sur une espace et ne ferme pas après elle.
    .replace(/\b__(?!\s)(.+?)(?<!\s)__\b/g, '$1')
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)/g, '$1')
    .replace(/\b_(?![\s_])(.+?)(?<![\s_])_\b/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => code[Number(index)] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Contenu de carte, raccourci pour garder des cartes homogènes. */
export function noteExcerpt(content: string, maxLength = 140): string {
  const clean = notePlainText(content);
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}
