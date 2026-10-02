import { describe, expect, it, vi } from 'vitest';
import { fetchArdoiseSettlement, SettlementRequestError } from './api';

const mockInvoke = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

describe('fetchArdoiseSettlement', () => {
  it('interroge expense-settlement avec l’ardoise visée', async () => {
    const payload = { ardoise_id: 'a', household_id: 'h', balances: [], settlements: [], generated_at: '' };
    mockInvoke.mockResolvedValueOnce({ data: payload, error: null, response: new Response('{}') });
    await expect(fetchArdoiseSettlement('a')).resolves.toEqual(payload);
    expect(mockInvoke).toHaveBeenCalledWith('expense-settlement', { body: { ardoise_id: 'a' }, headers: undefined });
  });

  it('transmet le ticket invité en en-tête', async () => {
    const payload = { ardoise_id: 'a', household_id: 'h', balances: [], settlements: [], generated_at: '' };
    mockInvoke.mockResolvedValueOnce({ data: payload, error: null, response: new Response('{}') });
    await fetchArdoiseSettlement('a', 'ticket-brut');
    expect(mockInvoke).toHaveBeenCalledWith(
      'expense-settlement',
      expect.objectContaining({ headers: { 'x-ardoise-guest': 'ticket-brut' } }),
    );
  });

  it('remonte le message métier du serveur avec son statut', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('Forbidden'),
      response: new Response(JSON.stringify({ error: 'Vous ne participez pas à cette ardoise.' }), { status: 403 }),
    });
    const failure = await fetchArdoiseSettlement('a').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SettlementRequestError);
    expect((failure as SettlementRequestError).status).toBe(403);
    expect((failure as Error).message).toBe('Vous ne participez pas à cette ardoise.');
  });

  it('ne laisse jamais passer un corps vide sans message générique', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom'), response: undefined });
    await expect(fetchArdoiseSettlement('a')).rejects.toThrow('Calcul des soldes impossible');
  });
});
