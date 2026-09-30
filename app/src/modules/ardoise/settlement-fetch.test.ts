import { describe, expect, it, vi } from 'vitest';
import { fetchServerSettlement, SettlementRequestError } from './api';

const mockInvoke = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

describe('fetchServerSettlement', () => {
  it('interroge expense-settlement avec le foyer visé', async () => {
    const payload = { household_id: 'h', balances: [], settlements: [], generated_at: '' };
    mockInvoke.mockResolvedValueOnce({ data: payload, error: null, response: new Response('{}') });
    await expect(fetchServerSettlement('h')).resolves.toEqual(payload);
    expect(mockInvoke).toHaveBeenCalledWith('expense-settlement', { body: { household_id: 'h' } });
  });

  it('remonte le message métier du serveur avec son statut', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('Forbidden'),
      response: new Response(JSON.stringify({ error: 'Vous n’appartenez pas à ce foyer.' }), { status: 403 }),
    });
    const failure = await fetchServerSettlement('h').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SettlementRequestError);
    expect((failure as SettlementRequestError).status).toBe(403);
    expect((failure as Error).message).toBe('Vous n’appartenez pas à ce foyer.');
  });

  it('ne laisse jamais passer un corps vide sans message générique', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new Error('boom'), response: undefined });
    await expect(fetchServerSettlement('h')).rejects.toThrow('Calcul des soldes impossible');
  });
});
