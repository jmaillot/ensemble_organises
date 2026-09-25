import { formatMediumDate, toLocalDate } from '@/lib/utils';
import type { NoteRow } from '@/types';

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
  createdAt: string;
  updatedAt: string;
  /** « À l'instant », « Il y a 2 j », ou la date complète. */
  ageLabel: string;
}

export interface NoteFormValues {
  title: string;
  category: NoteCategoryChoice;
  customCategory: string;
  content: string;
  visibility: NoteVisibility;
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
export function toNote(row: NoteRow): Note {
  const shared = Boolean(row.color);
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    visibility: shared ? 'foyer' : 'privee',
    shared,
    authorId: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ageLabel: ageLabel(row.updated_at),
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

/** Contenu de carte, raccourci pour garder des cartes homogènes. */
export function noteExcerpt(content: string, maxLength = 140): string {
  const clean = content.trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}
