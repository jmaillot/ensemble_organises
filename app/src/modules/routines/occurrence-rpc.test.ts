/**
 * T3 (25-07) — markOccurrenceDone passe par le RPC 0146 en mode Supabase.
 *
 * Le défaut que ce fichier garde : l'écriture directe `routine_completions`
 * en mode Supabase est filtrée en silence par la RLS 0007 quand un adulte
 * coche POUR un enfant (délégation D-08/D-11) — le parent voyait « fait »,
 * la base n'en gardait rien. Le RPC `complete_routine_occurrence` résout
 * l'acteur via auth.uid() (jamais un paramètre client, ENF-03) et refuse
 * hors-module avec 42501 (D-13) : l'Error remonte telle quelle.
 */
import { describe, expect, it, vi } from 'vitest';
import { markOccurrenceDone } from './api';

const { mockRpc, dataSpies } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  dataSpies: {
    list: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    removeWhere: vi.fn(),
    replaceSet: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: mockRpc },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

vi.mock('@/lib/data', () => ({ data: dataSpies }));

const input = { routineId: 'r-1', householdId: 'h-1', occurrenceDate: '2026-10-26', completedBy: 'm-noe' };

describe('markOccurrenceDone — le RPC 0146 connaît l’attributaire, jamais l’acteur', () => {
  it('émet complete_routine_occurrence (p_routine_id, p_occurrence_date, p_member_id) et n’écrit plus la table en direct', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(markOccurrenceDone(input)).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('complete_routine_occurrence', {
      p_routine_id: 'r-1',
      p_occurrence_date: '2026-10-26',
      p_member_id: 'm-noe',
    });
    expect(dataSpies.list).not.toHaveBeenCalled();
    expect(dataSpies.update).not.toHaveBeenCalled();
    expect(dataSpies.create).not.toHaveBeenCalled();
  });

  it('remonte le refus serveur (garde 42501, D-13) comme Error lisible', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(markOccurrenceDone(input)).rejects.toThrow('row-level security');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
