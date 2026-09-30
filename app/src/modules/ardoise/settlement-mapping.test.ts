import { describe, expect, it } from 'vitest';
import type { HouseholdMemberRow } from '@/types';
import { fetchServerSettlement, toServerBalances, toServerSettlements, type ServerSettlement } from './api';
import { externalKey, externalSettlements, memberKey, type Balance } from './types';

const members = [
  { id: 'm-camille', display_name: 'Camille Martin', color_tag: 'accent', role: 'admin' },
  { id: 'm-thomas', display_name: 'Thomas Martin', color_tag: 'ink', role: 'membre' },
  { id: 'm-noe', display_name: 'Noé Martin', color_tag: 'amber', role: 'enfant' },
] as HouseholdMemberRow[];

const payload: ServerSettlement = {
  household_id: 'household_1',
  balances: [
    { member_id: 'm-camille', display_name: 'Camille Martin', amount: 25.5 },
    { member_id: 'm-thomas', display_name: 'Thomas Martin', amount: -25.5 },
    { member_id: 'm-noe', display_name: 'Noé Martin', amount: 0 },
    { member_id: 'm-fantome', display_name: 'Fantôme', amount: 3 },
  ],
  settlements: [{ from_member_id: 'm-thomas', from_name: 'Thomas Martin', to_member_id: 'm-camille', to_name: 'Camille Martin', amount: 25.5 }],
  generated_at: '2026-09-30T10:00:00.000Z',
};

describe('toServerBalances', () => {
  it('mappe les soldes et exclut les enfants comme les graines locales', () => {
    const balances = toServerBalances(payload, members);
    expect(balances.map((balance) => balance.key)).toEqual([memberKey('m-camille'), memberKey('m-thomas'), memberKey('m-fantome')]);
    expect(balances[0]).toMatchObject({ kind: 'membre', name: 'Camille Martin', colorTag: 'accent', amount: 25.5 });
  });

  it('conserve un membre inconnu du store plutôt que de le masquer', () => {
    const balances = toServerBalances(payload, members);
    expect(balances.at(-1)).toMatchObject({ key: memberKey('m-fantome'), name: 'Fantôme', colorTag: null });
  });

  it('normalise les montants au centime', () => {
    const balances = toServerBalances(
      { ...payload, balances: [{ member_id: 'm-camille', display_name: 'Camille', amount: '10.5' as unknown as number }] },
      members,
    );
    expect(balances[0].amount).toBe(10.5);
  });
});

describe('toServerSettlements', () => {
  it('mappe les transferts avec des clés stables', () => {
    expect(toServerSettlements(payload)).toEqual([
      {
        id: `${memberKey('m-thomas')}>${memberKey('m-camille')}`,
        fromKey: memberKey('m-thomas'),
        fromName: 'Thomas Martin',
        toKey: memberKey('m-camille'),
        toName: 'Camille Martin',
        amount: 25.5,
      },
    ]);
  });
});

describe('externalSettlements', () => {
  const camille: Balance = { key: memberKey('m-camille'), kind: 'membre', name: 'Camille', colorTag: 'accent', amount: 17 };
  const julie: Balance = { key: externalKey('external-1'), kind: 'externe', name: 'Julie', colorTag: null, amount: -17 };

  it('ne garde que les jambes impliquant un externe', () => {
    const legs = externalSettlements([camille, julie]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ fromName: 'Julie', toName: 'Camille', amount: 17 });
  });

  it('rend une liste vide quand le serveur suffit', () => {
    expect(externalSettlements([camille, { ...julie, key: memberKey('m-thomas'), kind: 'membre', amount: -17 }])).toEqual([]);
  });
});

describe('fetchServerSettlement', () => {
  it('renvoie null en mode local, sans appel réseau', async () => {
    // Sans configuration Supabase, `supabase` est nul : aucune requête.
    await expect(fetchServerSettlement('household_1')).resolves.toBeNull();
  });
});
