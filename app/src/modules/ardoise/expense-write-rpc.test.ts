import { describe, expect, it, vi } from 'vitest';
import { createExpense, expensePartsPayload, updateExpense } from './api';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const input = {
  title: 'Repas',
  amount: 30,
  paidBy: 'membre:alice',
  date: '2026-09-30',
  splitType: 'egal' as const,
  participants: ['membre:alice', 'membre:bob'],
};

describe('expensePartsPayload', () => {
  it('respecte la contrainte membre/externe de la base', () => {
    expect(expensePartsPayload(['membre:a', 'externe:e'], [15, 15])).toEqual([
      { participant_type: 'membre', member_id: 'a', external_participant_id: null, share_amount: 15 },
      { participant_type: 'externe', member_id: null, external_participant_id: 'e', share_amount: 15 },
    ]);
  });
});

describe('createExpense par RPC', () => {
  it('envoie la dépense et ses parts en un seul appel', async () => {
    const row = { id: 'expense_1', title: 'Repas' };
    mockRpc.mockResolvedValueOnce({ data: row, error: null });
    await expect(createExpense('household_1', input)).resolves.toEqual(row);
    expect(mockRpc).toHaveBeenCalledWith('create_expense', {
      p_household_id: 'household_1',
      p_title: 'Repas',
      p_amount: 30,
      p_paid_by: 'membre:alice',
      p_expense_date: '2026-09-30',
      p_split_type: 'egal',
      p_parts: [
        { participant_type: 'membre', member_id: 'alice', external_participant_id: null, share_amount: 15 },
        { participant_type: 'membre', member_id: 'bob', external_participant_id: null, share_amount: 15 },
      ],
    });
  });

  it('remonte le message métier de la base', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'la somme des parts (15.00) ne correspond pas au montant de la dépense (30.00)' } });
    await expect(createExpense('household_1', input)).rejects.toThrow('somme des parts');
  });

  it('valide avant tout appel réseau', async () => {
    await expect(createExpense('household_1', { ...input, participants: [] })).rejects.toThrow('au moins une personne');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('refuse les participants externes avant tout appel réseau', async () => {
    await expect(
      createExpense('household_1', { ...input, participants: ['membre:alice', 'externe:e1'] }),
    ).rejects.toThrow('ne sont plus acceptés');
    await expect(
      updateExpense('expense_1', { ...input, participants: ['externe:e1'] }),
    ).rejects.toThrow('ne sont plus acceptés');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('updateExpense par RPC', () => {
  it('envoie la ligne et ses parts remplacées en un seul appel', async () => {
    const row = { id: 'expense_1', title: 'Repas corrigé' };
    mockRpc.mockResolvedValueOnce({ data: row, error: null });
    await expect(updateExpense('expense_1', { ...input, title: 'Repas corrigé' })).resolves.toEqual(row);
    expect(mockRpc).toHaveBeenCalledWith(
      'update_expense',
      expect.objectContaining({ p_expense_id: 'expense_1', p_title: 'Repas corrigé' }),
    );
  });
});
