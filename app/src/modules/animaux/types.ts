import type { IconName } from '@/components/shared/icon';
import { daysBetween, todayIso } from '@/lib/utils';
import type { PetAttachmentRow, PetRecordRow, PetRecordType, PetRow } from '@/types';

/** Espèces proposées par le formulaire, dans l'ordre de l'export de design. */
export const PET_SPECIES = ['Chien', 'Chat', 'Lapin', 'Oiseau', 'Autre'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

/** Onglets du carnet de santé : un par valeur de `pet_records.type`. */
export const PET_RECORD_TABS: { kind: PetRecordType; label: string; icon: IconName }[] = [
  { kind: 'produit', label: 'Produits', icon: 'receipt' },
  { kind: 'vaccin', label: 'Vaccins', icon: 'checkCircle' },
  { kind: 'traitement', label: 'Traitements', icon: 'bell' },
  { kind: 'info', label: 'Informations', icon: 'info' },
];

/**
 * Nom de l'ex-ligne magique de synthese (avant 0111) : `savePetSummary`
 * portait les notes et le rappel de la fiche dans une entree `pet_records`
 * de type `info` portant ce nom. La migration a recopie le contenu vers
 * `pets` puis supprime ces lignes, mais des bases locales (demo IndexedDB)
 * peuvent encore en contenir : elles sont filtrees a la lecture, jamais
 * ecrites. Seule la conjonction type + nom est filtree — un suivi
 * utilisateur qui ne partage que le nom reste un vrai suivi.
 */
export const PET_SUMMARY_RECORD_NAME = 'Informations de la fiche';

/** Vrai si la ligne est un residu de l'ex-synthese magique, a masquer. */
export function isLegacySummaryRow(row: { type: PetRecordType; name: string }): boolean {
  return row.type === 'info' && row.name === PET_SUMMARY_RECORD_NAME;
}

/** Fenêtre d'alerte d'une échéance, en jours. */
export const REMINDER_WINDOW_DAYS = 14;

export interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  weightKg: number | null;
  birthDate: string | null;
  identificationNumber: string | null;
  photoUrl: string | null;
  /** Informations libres de la fiche (`pets.notes`, 0111). */
  notes: string | null;
  /** Prochain rappel de la fiche (`pets.next_reminder_date`, 0111). */
  nextReminderDate: string | null;
  createdAt: string;
}

export interface PetDraft {
  name: string;
  species: string;
  breed: string | null;
  weightKg: number | null;
  birthDate: string | null;
  identificationNumber: string | null;
  photoUrl: string | null;
  /** Fichier choisi dans le dialogue : déposé au enregistrement, jamais persisté tel quel. */
  photoFile?: File | null;
  notes: string | null;
  nextReminderDate: string | null;
}

export function toPet(row: PetRow): Pet {
  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    birthDate: row.birth_date,
    identificationNumber: row.identification_number,
    photoUrl: row.photo_url,
    notes: row.notes,
    nextReminderDate: row.next_reminder_date,
    createdAt: row.created_at,
  };
}

const weightFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 28,4 kg » — format de l'export, jamais « 28.4 ». */
export function petWeightLabel(pet: Pet): string {
  return pet.weightKg === null ? '—' : `${weightFormatter.format(pet.weightKg)} kg`;
}

export interface PetRecord {
  id: string;
  petId: string;
  kind: PetRecordType;
  name: string;
  recordDate: string;
  nextDueDate: string | null;
  notes: string | null;
}

export interface PetRecordDraft {
  kind: PetRecordType;
  name: string;
  recordDate: string;
  nextDueDate: string | null;
  notes: string | null;
}

export function toPetRecord(row: PetRecordRow): PetRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    kind: row.type,
    name: row.name,
    recordDate: row.record_date,
    nextDueDate: row.next_due_date,
    notes: row.notes,
  };
}

const recordTypeLabels: Record<PetRecordType, { singular: string; empty: string }> = {
  produit: { singular: 'Produit', empty: 'Aucun produit enregistré pour cette fiche.' },
  vaccin: { singular: 'Vaccin', empty: 'Aucun vaccin enregistré pour cette fiche.' },
  traitement: { singular: 'Traitement', empty: 'Aucun traitement enregistré pour cette fiche.' },
  info: { singular: 'Information', empty: 'Aucune information enregistrée pour cette fiche.' },
};

export const petRecordTypeLabel = (kind: PetRecordType) => recordTypeLabels[kind].singular;
export const petRecordEmptyLabel = (kind: PetRecordType) => recordTypeLabels[kind].empty;

/** Seuls les vaccins et les traitements déclenchent une alerte de rappel. */
export const isReminderTracked = (kind: PetRecordType) => kind === 'vaccin' || kind === 'traitement';

export type ReminderState = 'none' | 'overdue' | 'soon' | 'later';

export function daysUntil(isoDate: string): number {
  return daysBetween(todayIso(), isoDate);
}

/** État d'une échéance : en retard, imminente (14 jours), ou plus tard. */
export function reminderState(nextDueDate: string | null): ReminderState {
  if (!nextDueDate) return 'none';
  const days = daysUntil(nextDueDate);
  if (days < 0) return 'overdue';
  return days <= REMINDER_WINDOW_DAYS ? 'soon' : 'later';
}

export const REMINDER_ALERTS: Record<Exclude<ReminderState, 'none' | 'later'>, { label: string; className: string }> = {
  soon: { label: 'Rappel approche', className: 'bg-amber-soft text-[oklch(52%_0.11_78)]' },
  overdue: { label: 'Rappel en retard', className: 'bg-coral-soft text-coral' },
};

export function reminderAlert(kind: PetRecordType, nextDueDate: string | null) {
  if (!isReminderTracked(kind)) return null;
  const state = reminderState(nextDueDate);
  return state === 'soon' || state === 'overdue' ? REMINDER_ALERTS[state] : null;
}

/**
 * Plus proche echeance reelle du carnet : a venir la plus proche, sinon la
 * plus recente. Ne porte que sur des suivis reels — la synthese magique
 * (avant 0111) n'existe plus et les residus locaux sont filtres en amont ;
 * le rappel de la fiche vit dans `pets.next_reminder_date` (voir la page).
 */
export function nextReminderOf(records: PetRecord[]): PetRecord | null {
  const dated = records.filter((record) => record.nextDueDate !== null);
  if (dated.length === 0) return null;
  const upcoming = dated.filter((record) => daysUntil(record.nextDueDate as string) >= 0);
  const pool = upcoming.length > 0 ? upcoming : dated;
  return [...pool].sort((left, right) => (left.nextDueDate as string).localeCompare(right.nextDueDate as string))[0];
}

/** Informations libres et rappel global, lus sur les colonnes de la fiche (0111). */
export interface PetSummary {
  notes: string | null;
  nextReminderDate: string | null;
}

export function petSummaryOf(pet: Pet | null): PetSummary {
  return { notes: pet?.notes ?? null, nextReminderDate: pet?.nextReminderDate ?? null };
}

/** Pièce jointe d'une fiche animal : ordonnance, facture, compte rendu. */
export interface PetAttachment {
  id: string;
  petId: string;
  url: string;
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export function toPetAttachment(row: PetAttachmentRow): PetAttachment {
  return {
    id: row.id,
    petId: row.pet_id,
    url: row.file_url,
    fileName: row.file_name,
    mime: row.mime_type,
    size: row.size_bytes,
    createdAt: row.created_at,
  };
}
