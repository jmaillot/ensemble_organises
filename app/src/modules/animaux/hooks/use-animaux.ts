import { useCallback, useMemo } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { useHouseholdStore } from '@/stores/household-store';
import type { PetAttachmentRow, PetRecordRow, PetRow } from '@/types';
import {
  createPet,
  createPetAttachment,
  createPetRecord,
  depositPetPhoto,
  removePet as removePetRow,
  removePetAttachment as removePetAttachmentRow,
  removePetRecord as removePetRecordRow,
  savePetSummary,
  updatePet,
  updatePetRecord,
} from '../api';
import {
  toPet,
  toPetAttachment,
  toPetRecord,
  type Pet,
  type PetAttachment,
  type PetDraft,
  type PetRecord,
  type PetRecordDraft,
} from '../types';

/**
 * Invalidation par table. `useResource` indexe ses requêtes par
 * `[table, householdId, filter]` : on cible la table en tête de clé pour
 * rafraîchir toutes les variantes de filtre d'un coup.
 */
function invalidateTables(queryClient: QueryClient, tables: string[]) {
  return Promise.all(
    tables.map((table) => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === table })),
  );
}

export interface UsePetsResult {
  pets: Pet[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  savePet: (id: string | null, draft: PetDraft) => Promise<void>;
  deletePet: (id: string) => Promise<void>;
}

/** Fiches animaux du foyer courant, triées par nom. */
export function usePets(): UsePetsResult {
  const householdId = useHouseholdStore((state) => state.householdId);
  const resource = useResource<PetRow>('pets');
  const queryClient = useQueryClient();

  const pets = useMemo(
    () => resource.rows.map(toPet).sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    [resource.rows],
  );

  const invalidate = useCallback(async () => {
    await invalidateTables(queryClient, ['pets', 'pet_records']);
  }, [queryClient]);

  const savePet = useCallback(
    async (id: string | null, draft: PetDraft) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      const { photoFile, ...values } = draft;
      const saved = id ? await updatePet(id, values) : await createPet(householdId, values);
      // La photo part après la ligne : son dossier de stockage porte
      // l'identifiant de la fiche, inconnu avant la création.
      if (photoFile) {
        try {
          await depositPetPhoto(householdId, saved.id, photoFile);
        } catch (photoError) {
          // Fiche conservée, photo perdue : l'erreur remonte pour être dite.
          await invalidate();
          throw photoError;
        }
      }
      await savePetSummary(householdId, saved.id, {
        notes: draft.notes,
        nextReminderDate: draft.nextReminderDate,
      });
      await invalidate();
    },
    [householdId, invalidate],
  );

  const deletePet = useCallback(
    async (id: string) => {
      await removePetRow(id);
      await invalidate();
    },
    [invalidate],
  );

  return {
    pets,
    isLoading: resource.isLoading,
    isError: resource.isError,
    error: resource.error,
    refetch: resource.refetch,
    isMutating: resource.isMutating,
    savePet,
    deletePet,
  };
}

export interface UsePetRecordsResult {
  records: PetRecord[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  saveRecord: (id: string | null, draft: PetRecordDraft) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
}

/** Carnet de santé d'un animal, du plus récent au plus ancien. */
export function usePetRecords(petId: string | null): UsePetRecordsResult {
  const householdId = useHouseholdStore((state) => state.householdId);
  const filter = useMemo(() => ({ pet_id: petId ?? '' }), [petId]);
  const resource = useResource<PetRecordRow>('pet_records', { filter, enabled: Boolean(petId) });
  const queryClient = useQueryClient();

  const records = useMemo(
    () =>
      resource.rows
        .map(toPetRecord)
        .sort(
          (left, right) =>
            right.recordDate.localeCompare(left.recordDate) || right.name.localeCompare(left.name, 'fr'),
        ),
    [resource.rows],
  );

  const invalidate = useCallback(async () => {
    await invalidateTables(queryClient, ['pet_records']);
  }, [queryClient]);

  const saveRecord = useCallback(
    async (id: string | null, draft: PetRecordDraft) => {
      if (!petId) throw new Error('Aucun animal sélectionné.');
      if (id) await updatePetRecord(id, draft);
      else if (householdId) await createPetRecord(householdId, petId, draft);
      await invalidate();
    },
    [householdId, invalidate, petId],
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      await removePetRecordRow(id);
      await invalidate();
    },
    [invalidate],
  );

  return {
    records,
    isLoading: resource.isLoading,
    isError: resource.isError,
    error: resource.error,
    refetch: resource.refetch,
    isMutating: resource.isMutating,
    saveRecord,
    deleteRecord,
  };
}

export interface UsePetAttachmentsResult {
  attachments: PetAttachment[];
  isLoading: boolean;
  isMutating: boolean;
  addFiles: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => Promise<void>;
}

/** Pièces jointes d'une fiche animal, des plus récentes aux plus anciennes. */
export function usePetAttachments(petId: string | null): UsePetAttachmentsResult {
  const householdId = useHouseholdStore((state) => state.householdId);
  const filter = useMemo(() => ({ pet_id: petId ?? '' }), [petId]);
  const resource = useResource<PetAttachmentRow>('pet_attachments', { filter, enabled: Boolean(petId) });
  const queryClient = useQueryClient();

  const attachments = useMemo(
    () => resource.rows.map(toPetAttachment).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [resource.rows],
  );

  const invalidate = useCallback(async () => {
    await invalidateTables(queryClient, ['pet_attachments']);
  }, [queryClient]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!petId) throw new Error('Aucun animal sélectionné.');
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      for (const file of files) {
        await createPetAttachment(householdId, petId, file);
      }
      await invalidate();
    },
    [householdId, invalidate, petId],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      await removePetAttachmentRow(id);
      await invalidate();
    },
    [invalidate],
  );

  return {
    attachments,
    isLoading: resource.isLoading,
    isMutating: resource.isMutating,
    addFiles,
    removeAttachment,
  };
}
