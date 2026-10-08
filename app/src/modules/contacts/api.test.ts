import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moveContactToFamily } from './api';

const { mockUpdate } = vi.hoisted(() => {
  const mockUpdate = vi.fn(async (_table: string, id: string, values: Record<string, unknown>) => ({
    id,
    ...values,
  }));
  return { mockUpdate };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { update: mockUpdate } };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('moveContactToFamily (D-04)', () => {
  it('envoie la liste seule — ni foyer, ni nom, ni date dans la charge', async () => {
    await moveContactToFamily('contact-1', 'contact-list-famille');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('contacts', 'contact-1', { list_id: 'contact-list-famille' });
    const payload = mockUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['list_id']);
    expect('household_id' in payload).toBe(false);
  });

  it('identifiant ou liste vide : aucun appel réseau (garde cliente)', async () => {
    await expect(moveContactToFamily('   ', 'contact-list-famille')).rejects.toThrow('introuvable');
    await expect(moveContactToFamily('contact-1', '  ')).rejects.toThrow('introuvable');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
