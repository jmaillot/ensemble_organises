import { describe, expect, it } from 'vitest';
import type { HouseholdMemberRow } from '@/types';
import { fetchArdoiseSettlement, toServerBalances, toServerSettlements, type ArdoiseServerSettlement } from './api';
import { guestKey, memberKey } from './types';

const members = [
  { id: 'm-camille', display_name: 'Camille Martin', color_tag: 'accent', role: 'admin' },
  { id: 'm-thomas', display_name: 'Thomas Martin', color_tag: 'ink', role: 'membre' },
  { id: 'm-noe', display_name: 'Noé Martin', color_tag: 'amber', role: 'enfant' },
] as HouseholdMemberRow[];

const payload: ArdoiseServerSettlement = {
  ardoise_id: 'ardoise_1',
  household_id: 'household_1',
  balances: [
    { kind: 'membre', participant_id: 'm-camille', display_name: 'Camille Martin', amount: 25.5 },
    { kind: 'membre', participant_id: 'm-thomas', display_name: 'Thomas Martin', amount: -25.5 },
    { kind: 'membre', participant_id: 'm-noe', display_name: 'Noé Martin', amount: 0 },
    { kind: 'membre', participant_id: 'm-fantome', display_name: 'Fantôme', amount: 3 },
    { kind: 'guest', participant_id: 'g-gino', display_name: 'Gino', amount: -3 },
  ],
  settlements: [
    {
      from_kind: 'membre',
      from_id: 'm-thomas',
      from_name: 'Thomas Martin',
      to_kind: 'membre',
      to_id: 'm-camille',
      to_name: 'Camille Martin',
      amount: 25.5,
    },
    {
      from_kind: 'guest',
      from_id: 'g-gino',
      from_name: 'Gino',
      to_kind: 'membre',
      to_id: 'm-camille',
      to_name: 'Camille Martin',
      amount: 3,
    },
  ],
  generated_at: '2026-09-30T10:00:00.000Z',
};

describe('toServerBalances', () => {
  it('mappe les soldes et exclut les enfants comme les graines locales', () => {
    const balances = toServerBalances(payload, members);
    expect(balances.map((balance) => balance.key)).toEqual([
      memberKey('m-camille'),
      memberKey('m-thomas'),
      memberKey('m-fantome'),
      guestKey('g-gino'),
    ]);
    expect(balances[0]).toMatchObject({ kind: 'membre', name: 'Camille Martin', colorTag: 'accent', amount: 25.5 });
  });

  it('conserve un membre inconnu du store plutôt que de le masquer', () => {
    const balances = toServerBalances(payload, members);
    expect(balances[2]).toMatchObject({ key: memberKey('m-fantome'), name: 'Fantôme', colorTag: null });
  });

  it('mappe les invités sans pastille', () => {
    const balances = toServerBalances(payload, members);
    expect(balances.at(-1)).toMatchObject({ key: guestKey('g-gino'), kind: 'guest', name: 'Gino', colorTag: null });
  });

  it('normalise les montants au centime', () => {
    const balances = toServerBalances(
      {
        ...payload,
        balances: [{ kind: 'membre', participant_id: 'm-camille', display_name: 'Camille', amount: '10.5' as unknown as number }],
      },
      members,
    );
    expect(balances[0].amount).toBe(10.5);
  });
});

describe('toServerSettlements', () => {
  it('mappe les transferts avec des clés stables, invités compris', () => {
    expect(toServerSettlements(payload)).toEqual([
      {
        id: `${memberKey('m-thomas')}>${memberKey('m-camille')}`,
        fromKey: memberKey('m-thomas'),
        fromName: 'Thomas Martin',
        toKey: memberKey('m-camille'),
        toName: 'Camille Martin',
        amount: 25.5,
      },
      {
        id: `${guestKey('g-gino')}>${memberKey('m-camille')}`,
        fromKey: guestKey('g-gino'),
        fromName: 'Gino',
        toKey: memberKey('m-camille'),
        toName: 'Camille Martin',
        amount: 3,
      },
    ]);
  });
});

describe('fetchArdoiseSettlement', () => {
  it('renvoie null en mode local, sans appel réseau', async () => {
    // Sans configuration Supabase, `supabase` est nul : aucune requête.
    await expect(fetchArdoiseSettlement('ardoise_1')).resolves.toBeNull();
  });
});
