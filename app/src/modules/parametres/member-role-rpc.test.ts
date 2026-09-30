import { describe, expect, it, vi } from 'vitest';
import { setMemberRole } from './api';

const mockRpc = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  supabaseFunctionsBase: 'http://localhost/functions/v1',
  supabaseUrl: 'http://localhost',
  supabasePublishableKey: 'pk_test',
}));

describe('setMemberRole par RPC', () => {
  it('délègue au serveur sans écrire depuis le client', async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: 'm', role: 'admin' }, error: null });
    await setMemberRole('m', 'admin');
    expect(mockRpc).toHaveBeenCalledWith('set_member_role', { p_member_id: 'm', p_role: 'admin' });
  });

  it('remonte le refus du serveur, dernier admin compris', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'le dernier administrateur du foyer ne peut pas être rétrogradé' } });
    await expect(setMemberRole('m', 'membre')).rejects.toThrow('dernier administrateur');
  });
});
