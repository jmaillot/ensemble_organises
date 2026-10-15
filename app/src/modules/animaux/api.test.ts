import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetAttachmentRow, PetRecordRow, PetRow } from '@/types';
import { createPet, createPetAttachment, depositPetPhoto, removePet, removePetAttachment, updatePet, updatePetRecord } from './api';
import { isLegacySummaryRow, petSummaryOf, toPet, toPetAttachment, toPetRecord } from './types';

const { mockCreate, mockUpdate, mockList, mockRemove, mockRemoveWhere, mockDeposit, mockCreateSignedUrl, mockRemoveFile } = vi.hoisted(() => {
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
  const mockList = vi.fn(async (_table?: string, _filter?: Record<string, unknown>): Promise<unknown[]> => []);
  const mockRemove = vi.fn(async () => {});
  const mockRemoveWhere = vi.fn(async () => {});
  // Dépôt simulé : le Storage rend une URL signée éphémère par ailleurs, mais la
  // colonne doit recevoir le CHEMIN (`path`) — c'est `storedValueOf` qui tranche.
  const mockDeposit = vi.fn(async () => ({
    url: 'https://signe.example/ordonnance.jpg',
    path: 'hh-1/pets/pet-1/file_abc.jpg',
    name: 'ordonnance.jpg',
    mime: 'image/jpeg',
    size: 2048,
  }));
  // Témoin : l'écriture ne signe jamais elle-même (WR-08).
  const mockCreateSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://signe.example/x.jpg' }, error: null }));
  // Témoin du retrait d'objet (D-03, WR-10) : c'est le chemin réellement
  // transmis au Storage qui est observé, pas l'intention de l'appelant.
  const mockRemoveFile = vi.fn(async () => ({ data: [], error: null }));
  return { mockCreate, mockUpdate, mockList, mockRemove, mockRemoveWhere, mockDeposit, mockCreateSignedUrl, mockRemoveFile };
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

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, depositHouseholdFile: mockDeposit };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({ createSignedUrl: mockCreateSignedUrl, upload: vi.fn(), remove: mockRemoveFile }),
    },
  },
}));

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

/**
 * D-01, WR-08 : les colonnes média d'Animaux portent le CHEMIN du bucket, jamais
 * l'URL signée éphémère que le dépôt rend par ailleurs — et l'écriture ne signe
 * rien elle-même (la signature n'existe qu'à la lecture).
 */
describe('dépôt média — le chemin part en colonne (D-01, WR-08)', () => {
  it('depositPetPhoto écrit le chemin dans `pets.photo_url` et le rend', async () => {
    const stored = await depositPetPhoto('hh-1', 'pet-1', new File(['x'], 'ordonnance.jpg', { type: 'image/jpeg' }));

    expect(stored).toBe('hh-1/pets/pet-1/file_abc.jpg');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [table, id, values] = mockUpdate.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(table).toBe('pets');
    expect(id).toBe('pet-1');
    expect(values.photo_url).toBe('hh-1/pets/pet-1/file_abc.jpg');
    expect(String(values.photo_url)).not.toMatch(/^https?:/);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('createPetAttachment écrit le chemin dans `pet_attachments.file_url`', async () => {
    await createPetAttachment('hh-1', 'pet-1', new File(['x'], 'ordonnance.jpg', { type: 'image/jpeg' }));

    const [table, values] = mockCreate.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe('pet_attachments');
    expect(values.file_url).toBe('hh-1/pets/pet-1/file_abc.jpg');
    expect(String(values.file_url)).not.toMatch(/^https?:/);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});

/**
 * D-01 : la lecture forge l'URL affichable depuis le chemin, en échec fermé —
 * le DOM ne reçoit jamais un chemin brut (lien mort) ni une URL éphémère
 * persistée. La valeur de colonne reste disponible pour l'édition (`photoStored`).
 */
describe('toPet / toPetAttachment — chemin résolu à la lecture (D-01)', () => {
  const petRow = (overrides: Partial<PetRow> = {}): PetRow => ({
    id: 'pet-1',
    household_id: 'hh-1',
    name: 'Nala',
    species: 'Chien',
    breed: null,
    weight_kg: null,
    birth_date: null,
    identification_number: null,
    photo_url: 'hh-1/pets/pet-1/x.jpg',
    notes: null,
    next_reminder_date: null,
    created_at: '2026-10-12T00:00:00Z',
    ...overrides,
  });

  const attachmentRow = (overrides: Partial<PetAttachmentRow> = {}): PetAttachmentRow => ({
    id: 'att-1',
    pet_id: 'pet-1',
    household_id: 'hh-1',
    file_url: 'hh-1/pets/pet-1/ordonnance.pdf',
    file_name: 'ordonnance.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    created_at: '2026-10-12T00:00:00Z',
    ...overrides,
  });

  it('résout un portrait et conserve la valeur de colonne comme `photoStored`', () => {
    const pet = toPet(petRow(), { 'pet-1': 'https://signe.example/x.jpg' });

    expect(pet.photoUrl).toBe('https://signe.example/x.jpg');
    expect(pet.photoStored).toBe('hh-1/pets/pet-1/x.jpg');
  });

  it('rend `null` pour un chemin non résolu (échec fermé, jamais le chemin brut)', () => {
    expect(toPet(petRow(), {}).photoUrl).toBeNull();
  });

  it('rend telle quelle une forme non-chemin (URL externe héritée, jamais re-signée)', () => {
    const pet = toPet(petRow({ photo_url: 'https://externe.example/x.jpg' }), {});
    expect(pet.photoUrl).toBe('https://externe.example/x.jpg');
  });

  it('résout l’URL d’une pièce jointe, `null` en échec fermé', () => {
    expect(toPetAttachment(attachmentRow(), { 'att-1': 'https://signe.example/ordonnance.pdf' }).url).toBe(
      'https://signe.example/ordonnance.pdf',
    );
    expect(toPetAttachment(attachmentRow(), {}).url).toBeNull();
  });
});

/**
 * D-03, WR-10 — « la ligne et son objet meurent ensemble ». Les objets du bucket
 * suivent la vie de leur ligne : suppression de fiche (portrait ET documents),
 * remplacement de portrait, suppression d'une pièce jointe. L'ordre est imposé :
 * la ligne part d'abord, l'objet ensuite.
 */
describe('suppression compensée — les objets suivent leurs lignes (D-03, WR-10)', () => {
  const PET_PORTRAIT = 'hh-1/pets/pet-1/portrait.jpg';
  const DOCUMENT = 'hh-1/pets/pet-1/ordonnance.pdf';

  const servingRows = (tables: Record<string, unknown[]>) =>
    mockList.mockImplementation(async (table?: string) => tables[table ?? ''] ?? []);

  beforeEach(() => {
    mockList.mockImplementation(async () => []);
  });

  it('removePet retire le portrait ET chaque document, après les lignes', async () => {
    servingRows({
      pets: [{ id: 'pet-1', household_id: 'hh-1', photo_url: PET_PORTRAIT }],
      pet_attachments: [
        { id: 'att-1', pet_id: 'pet-1', household_id: 'hh-1', file_url: DOCUMENT },
        { id: 'att-2', pet_id: 'pet-1', household_id: 'hh-1', file_url: 'hh-1/pets/pet-1/carnet.pdf' },
      ],
    });

    await removePet('pet-1');

    // Le portrait et les deux documents partent du volume.
    expect(mockRemoveFile).toHaveBeenCalledTimes(3);
    expect(mockRemoveFile).toHaveBeenCalledWith([PET_PORTRAIT]);
    expect(mockRemoveFile).toHaveBeenCalledWith([DOCUMENT]);
    expect(mockRemoveFile).toHaveBeenCalledWith(['hh-1/pets/pet-1/carnet.pdf']);
    // D-03 : la ligne part d'abord, l'objet ensuite.
    expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveFile.mock.invocationCallOrder[0],
    );
  });

  it('removePet d’une fiche nue ne déclenche aucun retrait d’objet', async () => {
    servingRows({ pets: [], pet_attachments: [] });

    await removePet('pet-1');

    expect(mockRemoveFile).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('pets', 'pet-1');
  });

  it('removePet ignore une URL signée héritée (pas un objet de bucket)', async () => {
    servingRows({
      pets: [{ id: 'pet-1', household_id: 'hh-1', photo_url: 'https://signe.example/portrait.jpg?token=x' }],
      pet_attachments: [],
    });

    await removePet('pet-1');

    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  it('depositPetPhoto retire l’ancien portrait quand il en remplace un', async () => {
    servingRows({ pets: [{ id: 'pet-1', household_id: 'hh-1', photo_url: PET_PORTRAIT }] });

    const stored = await depositPetPhoto('hh-1', 'pet-1', new File(['x'], 'nouveau.jpg', { type: 'image/jpeg' }));

    expect(stored).toBe('hh-1/pets/pet-1/file_abc.jpg');
    expect(mockRemoveFile).toHaveBeenCalledTimes(1);
    expect(mockRemoveFile).toHaveBeenCalledWith([PET_PORTRAIT]);
    // L'écriture précède le retrait : la colonne pointe déjà vers le neuf.
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveFile.mock.invocationCallOrder[0],
    );
  });

  it('depositPetPhoto sans changement de valeur ne retire rien', async () => {
    // Le dépôt simulé rend toujours `hh-1/pets/pet-1/file_abc.jpg` : la valeur
    // précédente est identique, donc il n'y a pas d'ancien objet à retirer.
    servingRows({ pets: [{ id: 'pet-1', household_id: 'hh-1', photo_url: 'hh-1/pets/pet-1/file_abc.jpg' }] });

    await depositPetPhoto('hh-1', 'pet-1', new File(['x'], 'nouveau.jpg', { type: 'image/jpeg' }));

    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  it('removePetAttachment retire l’objet de la pièce jointe, après sa ligne', async () => {
    servingRows({ pet_attachments: [{ id: 'att-1', pet_id: 'pet-1', household_id: 'hh-1', file_url: DOCUMENT }] });

    await removePetAttachment('att-1');

    expect(mockRemove).toHaveBeenCalledWith('pet_attachments', 'att-1');
    expect(mockRemoveFile).toHaveBeenCalledWith([DOCUMENT]);
    expect(mockRemove.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemoveFile.mock.invocationCallOrder[0],
    );
  });
});
