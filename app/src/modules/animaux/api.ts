import { data } from '@/lib/data';
import { todayIso } from '@/lib/utils';
import type { PetRecordRow, PetRow } from '@/types';
import { PET_SUMMARY_RECORD_NAME, type PetDraft, type PetRecordDraft } from './types';

/** Colonnes `pets` alimentées par le formulaire de fiche. */
function petValues(draft: PetDraft) {
  return {
    name: draft.name,
    species: draft.species,
    breed: draft.breed,
    weight_kg: draft.weightKg,
    birth_date: draft.birthDate,
    identification_number: draft.identificationNumber,
    photo_url: draft.photoUrl,
  };
}

function petRecordValues(draft: PetRecordDraft) {
  return {
    type: draft.kind,
    name: draft.name,
    record_date: draft.recordDate,
    next_due_date: draft.nextDueDate,
    notes: draft.notes,
  };
}

export async function createPet(householdId: string, draft: PetDraft): Promise<PetRow> {
  return data.create<PetRow>('pets', { household_id: householdId, ...petValues(draft) });
}

export async function updatePet(id: string, draft: PetDraft): Promise<PetRow> {
  return data.update<PetRow>('pets', id, petValues(draft));
}

/** La suppression d'un animal emporte son carnet de santé. */
export async function removePet(id: string): Promise<void> {
  await data.removeWhere('pet_records', { pet_id: id });
  await data.remove('pets', id);
}

export async function createPetRecord(householdId: string, petId: string, draft: PetRecordDraft): Promise<PetRecordRow> {
  return data.create<PetRecordRow>('pet_records', {
    household_id: householdId,
    pet_id: petId,
    ...petRecordValues(draft),
  });
}

export async function updatePetRecord(id: string, draft: PetRecordDraft): Promise<PetRecordRow> {
  return data.update<PetRecordRow>('pet_records', id, petRecordValues(draft));
}

export async function removePetRecord(id: string): Promise<void> {
  await data.remove('pet_records', id);
}

/**
 * Enregistre les informations libres et le prochain rappel de la fiche dans
 * l'entrée `pet_records` de synthèse (créée, mise à jour ou supprimée selon
 * les valeurs saisies). Le nom fait office de clé fonctionnelle.
 */
export async function savePetSummary(
  householdId: string,
  petId: string,
  { notes, nextReminderDate }: { notes: string | null; nextReminderDate: string | null },
): Promise<void> {
  const [existing] = await data.list<PetRecordRow>('pet_records', { pet_id: petId, name: PET_SUMMARY_RECORD_NAME });
  if (!notes && !nextReminderDate) {
    if (existing) await data.remove('pet_records', existing.id);
    return;
  }
  if (existing) {
    await data.update<PetRecordRow>('pet_records', existing.id, { notes, next_due_date: nextReminderDate });
    return;
  }
  await data.create<PetRecordRow>('pet_records', {
    household_id: householdId,
    pet_id: petId,
    type: 'info',
    name: PET_SUMMARY_RECORD_NAME,
    record_date: todayIso(),
    next_due_date: nextReminderDate,
    notes,
  });
}
