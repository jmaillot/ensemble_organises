import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import { depositHouseholdFile } from '@/lib/storage';
import type { PetAttachmentRow, PetRecordRow, PetRow } from '@/types';
import type { PetDraft, PetRecordDraft } from './types';

/** Colonnes `pets` alimentées par le formulaire de fiche, rappel et notes compris (0111). */
function petValues(draft: PetDraft) {
  return {
    name: draft.name,
    species: draft.species,
    breed: draft.breed,
    weight_kg: draft.weightKg,
    birth_date: draft.birthDate,
    identification_number: draft.identificationNumber,
    photo_url: draft.photoUrl,
    notes: draft.notes,
    next_reminder_date: draft.nextReminderDate,
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

/** La suppression d'un animal emporte son carnet de santé et ses pièces jointes. */
export async function removePet(id: string): Promise<void> {
  // Cascades : un animal sans carnet ni pièce jointe n'en supprime aucun —
  // tolérance déclarée (le défaut strict en ferait une erreur). Le repli
  // silencieux du second appel est remplacé par l'option explicite.
  await data.removeWhere('pet_records', { pet_id: id }, { ifMissing: 'ignore' });
  // En ligne la cascade SQL suffit ; en local l'adaptateur n'a pas de cascade
  // implicite, on retire explicitement.
  await data.removeWhere('pet_attachments', { pet_id: id }, { ifMissing: 'ignore' });
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
 * Photo de la fiche : la ligne existe déjà (création puis dépôt, ou fiche
 * existante), l'identifiant est donc connu et sert de dossier de stockage.
 */
export async function depositPetPhoto(householdId: string, petId: string, file: File): Promise<string> {
  const deposited = await depositHouseholdFile({ householdId, folder: `pets/${petId}`, file });
  await data.update<PetRow>('pets', petId, { photo_url: deposited.url });
  return deposited.url;
}

export async function createPetAttachment(
  householdId: string,
  petId: string,
  file: File,
): Promise<PetAttachmentRow> {
  const deposited = await depositHouseholdFile({ householdId, folder: `pets/${petId}`, file });
  return data.create<PetAttachmentRow>('pet_attachments', {
    id: randomId('pet-attachment'),
    pet_id: petId,
    household_id: householdId,
    file_url: deposited.url,
    file_name: deposited.name,
    mime_type: deposited.mime,
    size_bytes: deposited.size,
  });
}

export async function removePetAttachment(id: string): Promise<void> {
  await data.remove('pet_attachments', id);
}
