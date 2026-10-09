import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addConversationMembers } from './api';

const { supabaseState, supabaseMocks, mockList, mockCreate, mockRemoveWhere, mockUpdate, mockRemove } =
  vi.hoisted(() => {
    const supabaseState = {
      configured: false,
      updateError: null as null | { message: string },
      lastUpdate: null as null | { values: unknown; filters: Array<[string, string]> },
    };
    const eqInner = vi.fn(async (column: string, value: string) => {
      supabaseState.lastUpdate?.filters.push([column, value]);
      return { error: supabaseState.updateError };
    });
    const eqOuter = vi.fn((column: string, value: string) => {
      supabaseState.lastUpdate?.filters.push([column, value]);
      return { eq: eqInner };
    });
    const update = vi.fn((values: unknown) => {
      supabaseState.lastUpdate = { values, filters: [] };
      return { eq: eqOuter };
    });
    const from = vi.fn((_table: string) => ({ update }));
    const supabaseMocks = { from, update, eqOuter, eqInner };
    // Registre du fil `conv-1` : un actif, un tombé, le reste absent.
    const memberRows: Array<Record<string, unknown>> = [
      { conversation_id: 'conv-1', member_id: 'member-actif', left_at: null },
      { conversation_id: 'conv-1', member_id: 'member-parti', left_at: '2026-01-01T00:00:00Z' },
    ];
    const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
      Object.entries(filter).every(([key, value]) => {
        if (value === undefined) return true;
        if (Array.isArray(value)) return (value as unknown[]).includes(row[key]);
        return row[key] === value;
      });
    const mockList = vi.fn(async (table: string, filter: Record<string, unknown> = {}) => {
      if (table !== 'conversation_members') return [];
      return memberRows.filter((row) => matches(row, filter));
    });
    const mockCreate = vi.fn(async (_table: string, values: Record<string, unknown>) => values);
    const mockRemoveWhere = vi.fn(async () => {});
    const mockUpdate = vi.fn(async () => ({}));
    const mockRemove = vi.fn(async () => {});
    return { supabaseState, supabaseMocks, mockList, mockCreate, mockRemoveWhere, mockUpdate, mockRemove, memberRows };
  });

vi.mock('@/lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data')>();
  return {
    ...actual,
    data: { list: mockList, create: mockCreate, removeWhere: mockRemoveWhere, update: mockUpdate, remove: mockRemove },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return supabaseState.configured;
  },
  get supabase() {
    return supabaseState.configured ? { from: supabaseMocks.from } : null;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.configured = false;
  supabaseState.updateError = null;
  supabaseState.lastUpdate = null;
});

describe('addConversationMembers — réadhésion (D-12)', () => {
  it('en ligne : la pierre s’efface en une mise à jour, sans suppression ni recréation', async () => {
    // D-12 : un seul update `left_at → null` sur la ligne tombée — le
    // delete+recreate que la RLS refuse aux non-admins a disparu de ce chemin.
    supabaseState.configured = true;

    await addConversationMembers('conv-1', ['member-parti']);

    expect(supabaseMocks.from).toHaveBeenCalledWith('conversation_members');
    expect(supabaseMocks.update).toHaveBeenCalledWith({ left_at: null });
    expect(supabaseState.lastUpdate?.filters).toEqual([
      ['conversation_id', 'conv-1'],
      ['member_id', 'member-parti'],
    ]);
    expect(mockRemoveWhere).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('en ligne : les vrais manquants s’insèrent toujours, les actifs sont ignorés', async () => {
    supabaseState.configured = true;

    await addConversationMembers('conv-1', ['member-actif', 'member-neuf']);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith('conversation_members', {
      conversation_id: 'conv-1',
      member_id: 'member-neuf',
      left_at: null,
    });
    expect(supabaseMocks.update).not.toHaveBeenCalled();
    expect(mockRemoveWhere).not.toHaveBeenCalled();
  });

  it('en ligne : le refus serveur de l’effacement est propagé tel quel', async () => {
    supabaseState.configured = true;
    supabaseState.updateError = { message: 'refus de la politique' };

    await expect(addConversationMembers('conv-1', ['member-parti'])).rejects.toThrow('refus de la politique');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('en local : même transition sans RLS à traverser (retrait + création, démo)', async () => {
    // En démo il n’y a ni politique ni déclencheur : l’adaptateur local n’a
    // pas de `updateWhere`, on garde le deux-temps local — aucun appel réseau.
    supabaseState.configured = false;

    await addConversationMembers('conv-1', ['member-parti']);

    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(mockRemoveWhere).toHaveBeenCalledWith('conversation_members', {
      conversation_id: 'conv-1',
      member_id: 'member-parti',
    });
    expect(mockCreate).toHaveBeenCalledWith('conversation_members', {
      conversation_id: 'conv-1',
      member_id: 'member-parti',
      left_at: null,
    });
  });

  it('garde vide : aucun appel, ni réseau ni registre', async () => {
    supabaseState.configured = true;

    await expect(addConversationMembers('conv-1', ['   '])).rejects.toThrow('au moins un membre');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });
});
