import type { IconName } from '@/components/shared/icon';
import { daysBetween, todayIso } from '@/lib/utils';
import type { PetRecordRow, PetRecordType, PetRow } from '@/types';

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
 * `pets` ne possède ni colonne `notes` ni colonne de rappel : les
 * informations libres et le prochain rappel de la fiche sont portés par une
 * entrée `pet_records` de type `info` portant ce nom (voir `api.ts`).
 */
export const PET_SUMMARY_RECORD_NAME = 'Informations de la fiche';

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
  attachmentUrl: string | null;
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
    attachmentUrl: row.attachment_url,
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

/** Prochain rappel de la fiche : échéance à venir la plus proche, sinon la plus récente. */
export function nextReminderOf(records: PetRecord[]): PetRecord | null {
  const dated = records.filter((record) => record.nextDueDate !== null);
  if (dated.length === 0) return null;
  const upcoming = dated.filter((record) => daysUntil(record.nextDueDate as string) >= 0);
  const pool = upcoming.length > 0 ? upcoming : dated;
  return [...pool].sort((left, right) => (left.nextDueDate as string).localeCompare(right.nextDueDate as string))[0];
}

/** Informations libres et rappel global, portés par l'entrée `info` de synthèse. */
export interface PetSummary {
  notes: string | null;
  nextReminderDate: string | null;
}

export function petSummaryOf(records: PetRecord[]): PetSummary {
  const summary = records.find((record) => record.name === PET_SUMMARY_RECORD_NAME);
  return { notes: summary?.notes ?? null, nextReminderDate: summary?.nextDueDate ?? null };
}
