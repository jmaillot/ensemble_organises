import { afterEach, describe, expect, it } from 'vitest';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { ensureExpenseGuest } from './api';

describe('ensureExpenseGuest (local)', () => {
  afterEach(async () => {
    const adapter = getLocalAdapter();
    const rows = (await adapter.list('ardoise_guests', { ardoise_id: 'ardoise-foyer' })) as { id: string; display_name: string }[];
    await Promise.all(
      rows.filter((row) => row.display_name === 'Mamie Test').map((row) => adapter.remove('ardoise_guests', row.id)),
    );
  });

  it('crée l’invitée puis la retrouve (sans doublon)', async () => {
    const first = await ensureExpenseGuest('ardoise-foyer', 'Mamie Test');
    expect(first.name).toBe('Mamie Test');
    const second = await ensureExpenseGuest('ardoise-foyer', 'mamie test');
    expect(second.id).toBe(first.id);
  });
});
