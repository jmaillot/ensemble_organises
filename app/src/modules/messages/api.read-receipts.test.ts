import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReadReceipts } from './api';
import type { HouseholdMemberRow } from '@/types';

const { supabaseState, supabaseMocks, mockList } = vi.hoisted(() => {
  const supabaseState = {
    configured: false,
    rpcError: null as null | { message: string },
    lastRpc: null as null | { fn: string; args: unknown },
    rpcRows: [] as unknown[],
  };
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    supabaseState.lastRpc = { fn, args };
    if (supabaseState.rpcError) return { data: null, error: supabaseState.rpcError };
    return { data: supabaseState.rpcRows, error: null };
  });
  const supabaseMocks = { rpc };
  const mockList = vi.fn(async (table: string, filter?: Record<string, unknown>) => {
    void table;
    void filter;
    return [] as unknown[];
  });
  return { supabaseState, supabaseMocks, mockList };
});

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return { ...actual, data: { ...actual.data, list: mockList } };
});

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured ? { rpc: supabaseMocks.rpc } : null;
  },
}));

const members: HouseholdMemberRow[] = [
  {
    id: 'membre-ada',
    household_id: 'foyer-1',
    user_id: 'profile-ada',
    display_name: 'Ada',
    avatar_url: null,
    color_tag: 'coral',
    role: 'membre',
    birth_date: null,
    managed_modules: [],
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'membre-enfant',
    household_id: 'foyer-1',
    user_id: null,
    display_name: 'Lina',
    avatar_url: null,
    color_tag: 'amber',
    role: 'enfant',
    birth_date: null,
    managed_modules: [],
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
  supabaseState.rpcError = null;
  supabaseState.lastRpc = null;
  supabaseState.rpcRows = [];
  mockList.mockClear();
  mockList.mockImplementation(async () => []);
});

describe('fetchReadReceipts — accusés de lecture (0171, D-02)', () => {
  it('en ligne : le RPC conversation_read_receipts est appelé et ses lignes mappées', async () => {
    supabaseState.configured = true;
    supabaseState.rpcRows = [
      { member_id: 'membre-ada', display_name: 'Ada', color_tag: 'coral', read_at: '2026-10-29T10:00:00Z' },
      { member_id: 'membre-lu-tard', display_name: 'Théo', color_tag: 'ink', read_at: null },
    ];

    const receipts = await fetchReadReceipts('conv-1', members);

    expect(supabaseState.lastRpc?.fn).toBe('conversation_read_receipts');
    expect(supabaseState.lastRpc?.args).toEqual({ p_conversation_id: 'conv-1' });
    expect(receipts).toEqual([
      { memberId: 'membre-ada', displayName: 'Ada', colorTag: 'coral', readAt: '2026-10-29T10:00:00Z' },
      { memberId: 'membre-lu-tard', displayName: 'Théo', colorTag: 'ink', readAt: null },
    ]);
  });

  it('en ligne : un refus du RPC est propagé en DataError', async () => {
    supabaseState.configured = true;
    supabaseState.rpcError = { message: 'session requise' };

    await expect(fetchReadReceipts('conv-1', members)).rejects.toThrow('session requise');
  });

  it('en démo : les watermarks du fil sont joints au registre du foyer (user_id → membre)', async () => {
    mockList.mockImplementation(async (table: string, filter?: Record<string, unknown>) => {
      expect(table).toBe('notification_reads');
      expect(filter).toEqual({ scope: 'conversation', scope_id: 'conv-1' });
      return [
        { id: 'r1', user_id: 'profile-ada', scope: 'conversation', scope_id: 'conv-1', read_at: '2026-10-29T09:00:00Z' },
        // Profil inconnu du foyer (ou enfant géré sans compte) : ignoré, comme
        // la jointure du RPC côté serveur.
        { id: 'r2', user_id: 'profile-inconnu', scope: 'conversation', scope_id: 'conv-1', read_at: '2026-10-29T09:30:00Z' },
      ];
    });

    const receipts = await fetchReadReceipts('conv-1', members);

    expect(receipts).toEqual([
      { memberId: 'membre-ada', displayName: 'Ada', colorTag: 'coral', readAt: '2026-10-29T09:00:00Z' },
    ]);
  });
});
