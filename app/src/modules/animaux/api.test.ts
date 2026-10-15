import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetRecordRow, PetRow } from '@/types';
import { createPet, removePet, updatePet, updatePetRecord } from './api';
import { isLegacySummaryRow, petSummaryOf, toPet, toPetRecord } from './types';

const { mockCreate, mockUpdate, mockList, mockRemove, mockRemoveWhere } = vi.hoisted(() => {
  const mockCreate = vi.fn(async (_table: string, values: Record<string, unknown>) => ({
    id: 'pet-echo',
    household_id: 'hh-1',
    created_at: '2026-10-12T00:00:00Z',
    ...values,
  }));
  const mockUpdate = vi.fn(async (_table: string, _id: string, values: Record<string, unknown>) => ({
    id: _id,
    household_id: 'hh-1',
    created_at: '2026-10-12T00:00:00Z',
    ...values,
  }));
  const mockList = vi.fn(async () => []);
  const mockRemove = vi.fn(async () => {});
  const mockRemoveWhere = vi.fn(async () => {});
  return { mockCreate, mockUpdate, mockList, mockRemove, mockRemoveWhere };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return {
    ...actual,
    data: {
      list: mockList,
      create: mockCreate,
      update: mockUpdate,
      remove: mockRemove,
      removeWhere: mockRemoveWhere,
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const draft = {
  name: 'Nala',
  species: 'Chien',
  breed: 'Golden retriever',
  weightKg: 28.4,
  birthDate: '2021-03-12',
  identificationNumber: 'FR-483920',
  photoUrl: null,
  notes: 'Suivie chez le vétérinaire du quartier.',
  nextReminderDate: '2026-10-25',
};

describe('animaux api (D-10)', () => {
  it('écrit notes et rappel dans les colonnes de la fiche, sans ligne magique', async () => {
    await createPet('hh-1', draft);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [table, values] = mockCreate.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe('pets');
    expect(values.notes).toBe('Suivie chez le vétérinaire du quartier.');
    expect(values.next_reminder_date).toBe('2026-10-25');
    // Aucune écriture vers `pet_records` : la synthèse magique a disparu.
    expect(mockList).not.toHaveBeenCalled();
  });

  it('met à jour les colonnes de la fiche via updatePet', async () => {
    await updatePet('pet-1', { ...draft, notes: null, nextReminderDate: null });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [table, id, values] = mockUpdate.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(table).toBe('pets');
    expect(id).toBe('pet-1');
    expect(values.notes).toBeNull();
    expect(values.next_reminder_date).toBeNull();
  });

  it('fait transiter notes et rappel de la fiche vers toPet et petSummaryOf', async () => {
    const row = (await createPet('hh-1', draft)) as unknown as PetRow;
    const summary = petSummaryOf(toPet(row));

    expect(summary.notes).toBe('Suivie chez le vétérinaire du quartier.');
    expect(summary.nextReminderDate).toBe('2026-10-25');
  });

  it('édite un suivi existant via updatePetRecord', async () => {
    await updatePetRecord('rec-1', {
      kind: 'vaccin',
      name: 'Rappel annuel — rage (revu)',
      recordDate: '2025-10-08',
      nextDueDate: '2026-10-25',
      notes: null,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [table, id, values] = mockUpdate.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(table).toBe('pet_records');
    expect(id).toBe('rec-1');
    expect(values).toMatchObject({ type: 'vaccin', name: 'Rappel annuel — rage (revu)' });
  });

  it('ne confond pas un suivi utilisateur avec la synthèse magique', () => {
    // Seule la conjonction type `info` + nom magique est un résidu à masquer.
    expect(isLegacySummaryRow({ type: 'info', name: 'Informations de la fiche' })).toBe(true);
    expect(isLegacySummaryRow({ type: 'produit', name: 'Informations de la fiche' })).toBe(false);
    expect(isLegacySummaryRow({ type: 'info', name: 'Dernière consultation' })).toBe(false);
  });

  it('ne lit plus attachment_url sur les suivis', () => {
    const record = toPetRecord({
      id: 'rec-1',
      pet_id: 'pet-1',
      household_id: 'hh-1',
      type: 'vaccin',
      name: 'Rappel annuel — rage',
      record_date: '2025-10-08',
      next_due_date: null,
      notes: null,
    } as PetRecordRow);

    expect(record).not.toHaveProperty('attachmentUrl');
  });

  it('supprime la fiche avec son carnet, sans toucher à la synthèse', async () => {
    await removePet('pet-1');

    expect(mockRemoveWhere).toHaveBeenCalledWith('pet_records', { pet_id: 'pet-1' }, { ifMissing: 'ignore' });
    expect(mockRemove).toHaveBeenCalledWith('pets', 'pet-1');
  });
});
