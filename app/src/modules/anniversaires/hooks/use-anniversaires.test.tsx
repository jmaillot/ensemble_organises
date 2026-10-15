import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { data } from '@/lib/data';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import type { BirthdayRow } from '@/types';
import type { BirthdayFormValues } from '../types';
import { useAnniversaires } from './use-anniversaires';

/**
 * WR-09 — l'anniversaire est écrit AVANT le contact miroir. Si celui-ci échoue,
 * la ligne créée doit être retirée (D-08) : sans cela, l'utilisateur relançait
 * la création et obtenait un DOUBLON.
 */
const { createContactMock } = vi.hoisted(() => ({ createContactMock: vi.fn() }));

vi.mock('@/modules/contacts/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/contacts/api')>();
  return { ...actual, createContactFromBirthday: createContactMock };
});

function renderAnniversaires() {
  const queryClient = createTestQueryClient();
  return renderHook(() => useAnniversaires(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

function formValues(overrides: Partial<BirthdayFormValues> = {}): BirthdayFormValues {
  return {
    name: 'Zoé Compensation',
    birthDate: '1995-03-14',
    linkedMemberId: '',
    photoUrl: '',
    createContact: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAnniversaires.saveBirthday — le contact en échec annule l’anniversaire (WR-09)', () => {
  it('retire l’anniversaire créé quand le contact miroir échoue', async () => {
    seedHouseholdStore();
    const { result } = renderAnniversaires();
    // La liste « Famille » doit être connue pour que le miroir soit déclenché.
    await waitFor(() => expect(result.current.contactLists.length).toBeGreaterThan(0));
    createContactMock.mockRejectedValueOnce(new Error('contact indisponible'));

    let caught: unknown;
    try {
      await result.current.saveBirthday(null, formValues());
    } catch (error) {
      caught = error;
    }

    // L'échec remonte (message citant le contact), et aucune ligne ne subsiste.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('contact');
    const rows = await data.list<BirthdayRow>('birthdays', { name: 'Zoé Compensation' });
    expect(rows).toHaveLength(0);
  });

  it('sans contact demandé, l’anniversaire est conservé', async () => {
    seedHouseholdStore();
    const { result } = renderAnniversaires();
    await waitFor(() => expect(result.current.contactLists.length).toBeGreaterThan(0));

    const id = await result.current.saveBirthday(null, formValues({ name: 'Paul Conservé', createContact: false }));

    try {
      const rows = await data.list<BirthdayRow>('birthdays', { id });
      expect(rows).toHaveLength(1);
      expect(createContactMock).not.toHaveBeenCalled();
    } finally {
      await data.remove('birthdays', id).catch(() => undefined);
    }
  });
});
