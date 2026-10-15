import type { ReactNode } from 'react';
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetAttachmentRow, PetRow } from '@/types';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { createPet, createPetAttachment, depositPetPhoto } from '../api';
import type { PetDraft } from '../types';
import { usePetAttachments, usePets } from './use-animaux';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    createPet: vi.fn(),
    updatePet: vi.fn(),
    depositPetPhoto: vi.fn(),
    createPetAttachment: vi.fn(),
    removePetAttachment: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** Promesse dont on pilote la résolution : c'est ce qui rend `isPending` observable. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const file = (name = 'ordonnance.jpg') => new File(['x'], name, { type: 'image/jpeg' });

const draft = (overrides: Partial<PetDraft> = {}): PetDraft => ({
  name: 'Nala',
  species: 'Chien',
  breed: null,
  weightKg: null,
  birthDate: null,
  identificationNumber: null,
  photoUrl: null,
  photoFile: null,
  notes: null,
  nextReminderDate: null,
  ...overrides,
});

const petRow = (overrides: Partial<PetRow> = {}): PetRow => ({
  id: 'pet-1',
  household_id: 'hh-1',
  name: 'Nala',
  species: 'Chien',
  breed: null,
  weight_kg: null,
  birth_date: null,
  identification_number: null,
  photo_url: null,
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

function renderPets(queryClient: QueryClient = createTestQueryClient()): RenderHookResult<ReturnType<typeof usePets>, unknown> {
  return renderHook(() => usePets(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function renderAttachments(
  petId: string,
  queryClient: QueryClient = createTestQueryClient(),
): { result: RenderHookResult<ReturnType<typeof usePetAttachments>, unknown>['result']; queryClient: QueryClient } {
  const rendered = renderHook(() => usePetAttachments(petId), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { result: rendered.result, queryClient };
}

/**
 * D-09, WR-11 : les drapeaux `isMutating` d'Animaux étaient structurellement
 * faux (les écritures passaient par `../api`, jamais par les mutations du hook).
 * Ces tests tiennent le drapeau pendant une écriture réellement en vol.
 */
describe('usePets — `isMutating` dit la vérité (D-09, WR-11)', () => {
  it('est faux au repos, vrai pendant `savePet`, faux après', async () => {
    seedHouseholdStore();
    const pending = deferred<PetRow>();
    vi.mocked(createPet).mockReturnValueOnce(pending.promise);

    const { result } = renderPets();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMutating).toBe(false);

    let save!: Promise<void>;
    act(() => {
      save = result.current.savePet(null, draft());
    });
    await waitFor(() => expect(result.current.isMutating).toBe(true));

    await act(async () => {
      pending.resolve(petRow());
      await save;
    });
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });

  it('une photo en échec remonte l’erreur sans bloquer `isMutating` à vrai', async () => {
    seedHouseholdStore();
    vi.mocked(createPet).mockResolvedValueOnce(petRow());
    vi.mocked(depositPetPhoto).mockRejectedValueOnce(new Error('dépôt refusé'));

    const { result } = renderPets();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(result.current.savePet(null, draft({ photoFile: file() }))).rejects.toThrow('dépôt refusé');
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });
});

describe('usePetAttachments — envoi partiel et drapeau (D-09)', () => {
  it('est vrai pendant `addFiles`', async () => {
    seedHouseholdStore();
    const pending = deferred<PetAttachmentRow>();
    vi.mocked(createPetAttachment).mockReturnValueOnce(pending.promise);

    const { result } = renderAttachments('pet-1');
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isMutating).toBe(false);

    let add!: Promise<void>;
    act(() => {
      add = result.current.addFiles([file()]);
    });
    await waitFor(() => expect(result.current.isMutating).toBe(true));

    await act(async () => {
      pending.resolve(attachmentRow());
      await add;
    });
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });

  it('un échec partiel est dit partiel, et la liste est rafraîchie quand même', async () => {
    seedHouseholdStore();
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderAttachments('pet-1', queryClient);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(createPetAttachment)
      .mockResolvedValueOnce(attachmentRow({ id: 'att-ok' }))
      .mockRejectedValueOnce(new Error('refus du bucket'));

    await act(async () => {
      await expect(result.current.addFiles([file('a.jpg'), file('b.jpg')])).rejects.toThrow(
        /1 pièce\(s\) jointe\(s\) sur 2/,
      );
    });

    // Le second fichier a bien été tenté : l'échec n'a pas court-circuité la boucle.
    expect(vi.mocked(createPetAttachment)).toHaveBeenCalledTimes(2);
    // La liste est rafraîchie malgré l'échec partiel : le fichier valide reste visible.
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
