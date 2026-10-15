import { data } from '@/lib/data';
import { randomId } from '@/lib/utils';
import { depositHouseholdFile, householdMediaPathOf, removeHouseholdFile, replacedMediaPath, storedValueOf } from '@/lib/storage';
import type { PetAttachmentRow, PetRecordRow, PetRow } from '@/types';
import type { PetDraft, PetRecordDraft } from './types';

/**
 * Retrait des objets d'un média, APRÈS la disparition de leurs lignes (D-03,
 * WR-10). La ligne part d'abord, l'objet ensuite : l'inverse laisserait une
 * ligne pointant vers un objet disparu. Best-effort — un bucket indisponible
 * est signalé, jamais transformé en échec d'une suppression de ligne déjà
 * effective (l'utilisateur ne doit pas voir « la fiche n'a pas pu être
 * supprimée » alors qu'elle est partie).
 */
async function removeStoredObjects(values: (string | null)[]): Promise<void> {
  await Promise.all(
    values.map(async (value) => {
      const path = householdMediaPathOf(value);
      if (!path) return;
      try {
        await removeHouseholdFile(path);
      } catch (error) {
        console.warn(`Objet de média non retiré du bucket : ${path}`, error);
      }
    }),
  );
}

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
  // Les objets suivent leurs lignes (D-03, WR-10) : le portrait ET les
  // documents sont lus AVANT les suppressions, retirés APRÈS. Sans cette
  // lecture, les ordonnances vétérinaires restent indéfiniment dans le volume.
  const [pets, attachments] = await Promise.all([
    data.list<PetRow>('pets', { id }).catch(() => [] as PetRow[]),
    data.list<PetAttachmentRow>('pet_attachments', { pet_id: id }).catch(() => [] as PetAttachmentRow[]),
  ]);
  // Cascades : un animal sans carnet ni pièce jointe n'en supprime aucun —
  // tolérance déclarée (le défaut strict en ferait une erreur). Le repli
  // silencieux du second appel est remplacé par l'option explicite.
  await data.removeWhere('pet_records', { pet_id: id }, { ifMissing: 'ignore' });
  // En ligne la cascade SQL suffit ; en local l'adaptateur n'a pas de cascade
  // implicite, on retire explicitement.
  await data.removeWhere('pet_attachments', { pet_id: id }, { ifMissing: 'ignore' });
  await data.remove('pets', id);
  await removeStoredObjects([
    ...pets.map((row) => row.photo_url),
    ...attachments.map((row) => row.file_url),
  ]);
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
  // Un dépôt qui REMPLACE un portrait retire l'ancien objet (D-03, WR-10) :
  // sans cela, chaque nouvelle photo laisse la précédente dans le volume. La
  // valeur de colonne est lue AVANT l'écriture.
  const previous = await data.list<PetRow>('pets', { id: petId }).catch(() => [] as PetRow[]);
  const deposited = await depositHouseholdFile({ householdId, folder: `pets/${petId}`, file });
  // D-01, WR-08 : la colonne porte le CHEMIN du bucket, jamais l'URL signée
  // (éphémère, inexploitable après expiration).
  const stored = storedValueOf(deposited);
  await data.update<PetRow>('pets', petId, { photo_url: stored });
  // Best-effort APRÈS l'écriture : un échec du retrait ne fait pas échouer le
  // dépôt, et un remplacement sans changement de valeur ne retire rien (le
  // helper rend `null`).
  await removeStoredObjects([replacedMediaPath(previous[0]?.photo_url ?? null, stored)]);
  return stored;
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
    // D-01, WR-08 : chemin du bucket dans `file_url`, l'URL se forge à la lecture.
    file_url: storedValueOf(deposited),
    file_name: deposited.name,
    mime_type: deposited.mime,
    size_bytes: deposited.size,
  });
}

export async function removePetAttachment(id: string): Promise<void> {
  // La ligne porte le chemin : on le lit AVANT de la supprimer, puis on retire
  // l'objet APRÈS (D-03, WR-10).
  const rows = await data.list<PetAttachmentRow>('pet_attachments', { id }).catch(() => [] as PetAttachmentRow[]);
  await data.remove('pet_attachments', id);
  await removeStoredObjects(rows.map((row) => row.file_url));
}
