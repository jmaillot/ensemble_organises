import { describe, expect, it, vi } from 'vitest';
import { createExpense, expensePartsPayload, updateExpense } from './api';
import { applyFreePayerShare } from './types';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

const input = {
  ardoiseId: 'ardoise_1',
  title: 'Repas',
  amount: 30,
  paidBy: 'alice',
  date: '2026-09-30',
  splitType: 'egal' as const,
  participants: ['membre:alice', 'membre:bob'],
};

describe('expensePartsPayload', () => {
  it('mappe membres et invités, refuse le reste', () => {
    expect(expensePartsPayload(['membre:a', 'invite:g'], [15, 15])).toEqual([
      { participant_type: 'membre', member_id: 'a', guest_id: null, share_amount: 15 },
      { participant_type: 'guest', member_id: null, guest_id: 'g', share_amount: 15 },
    ]);
    expect(() => expensePartsPayload(['membre:a', 'externe:e'], [15, 15])).toThrow('Participant invalide');
  });
});

describe('createExpense par RPC', () => {
  it('envoie la dépense et ses parts en un seul appel', async () => {
    const row = { id: 'expense_1', title: 'Repas' };
    mockRpc.mockResolvedValueOnce({ data: row, error: null });
    await expect(createExpense('household_1', input)).resolves.toEqual(row);
    expect(mockRpc).toHaveBeenCalledWith('create_expense', {
      p_household_id: 'household_1',
      p_ardoise_id: 'ardoise_1',
      p_title: 'Repas',
      p_amount: 30,
      p_paid_by: 'alice',
      p_paid_by_guest: null,
      p_expense_date: '2026-09-30',
      p_split_type: 'egal',
      p_parts: [
        { participant_type: 'membre', member_id: 'alice', guest_id: null, share_amount: 15 },
        { participant_type: 'membre', member_id: 'bob', guest_id: null, share_amount: 15 },
      ],
    });
  });

  it('envoie un payeur invité', async () => {
    const row = { id: 'expense_2', title: 'Apéro' };
    mockRpc.mockResolvedValueOnce({ data: row, error: null });
    await createExpense('household_1', { ...input, paidBy: 'g', paidByKind: 'guest', participants: ['invite:g', 'membre:alice'] });
    expect(mockRpc).toHaveBeenCalledWith(
      'create_expense',
      expect.objectContaining({ p_paid_by: null, p_paid_by_guest: 'g' }),
    );
  });

  it('exige une ardoise avant tout appel réseau', async () => {
    const { ardoiseId: _dropped, ...withoutArdoise } = input;
    await expect(createExpense('household_1', withoutArdoise)).rejects.toThrow('ardoise');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('remonte le message métier de la base', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'la somme des parts (15.00) ne correspond pas au montant de la dépense (30.00)' } });
    await expect(createExpense('household_1', input)).rejects.toThrow('somme des parts');
  });

  it('valide avant tout appel réseau', async () => {
    await expect(createExpense('household_1', { ...input, participants: [] })).rejects.toThrow('au moins une personne');
  });

  it('liste vide + payeur invité = offert (part unique à 100 %)', async () => {
    const row = { id: 'expense_offert', title: 'Offert par Mamie' };
    mockRpc.mockResolvedValueOnce({ data: row, error: null });
    await expect(
      createExpense('household_1', { ...input, paidBy: 'g1', paidByKind: 'guest', participants: [] }),
    ).resolves.toEqual(row);
    expect(mockRpc).toHaveBeenCalledWith(
      'create_expense',
      expect.objectContaining({
        p_paid_by: null,
        p_paid_by_guest: 'g1',
        p_parts: [{ participant_type: 'guest', member_id: null, guest_id: 'g1', share_amount: 30 }],
      }),
    );
  });

  it('refuse les clés inconnues avant tout appel réseau', async () => {
    await expect(
      createExpense('household_1', { ...input, participants: ['membre:alice', 'externe:e1'] }),
    ).rejects.toThrow('Participant invalide');
    await expect(
      updateExpense('expense_1', { ...input, participants: ['externe:e1'] }),
    ).rejects.toThrow('Participant invalide');
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

describe('applyFreePayerShare — liste vide = offert', () => {
  it('retourne l’invité seul quand aucun membre coché (case cochée ou non, égal ou personnalisé)', () => {
    expect(applyFreePayerShare([], 'g1', { include: false, splitType: 'egal' })).toEqual(['invite:g1']);
    expect(applyFreePayerShare([], 'g1', { include: true, splitType: 'egal' })).toEqual(['invite:g1']);
    expect(applyFreePayerShare([], 'g1', { include: false, splitType: 'personnalise' })).toEqual(['invite:g1']);
  });

  it('conserve le partage quand des membres restent cochés sans inclusion', () => {
    expect(applyFreePayerShare(['membre:a'], 'g1', { include: false, splitType: 'egal' })).toEqual(['membre:a']);
  });
});
