import { describe, expect, it } from 'vitest';
import { computeShares, type Expense } from './types';

const expense = (id: string, participants: Expense['participants']): Expense => ({
  id,
  ardoiseId: 'ardoise-1',
  title: id,
  amount: participants.reduce((sum, part) => sum + part.shareAmount, 0),
  paidBy: null,
  paidByKind: 'membre',
  paidByName: 'Payeur',
  paidByColorTag: null,
  date: '2026-10-02',
  splitType: 'egal',
  participants,
});

describe('computeShares', () => {
  it('cumule les parts par participant, membres et invités', () => {
    const expenses = [
      expense('e1', [
        { key: 'membre:camille', kind: 'membre', memberId: 'camille', name: 'Camille', colorTag: 'accent', shareAmount: 28.17 },
        { key: 'membre:thomas', kind: 'membre', memberId: 'thomas', name: 'Thomas', colorTag: 'ink', shareAmount: 28.17 },
        { key: 'invite:gino', kind: 'guest', memberId: 'gino', name: 'Gino', colorTag: null, shareAmount: 28.16 },
      ]),
      expense('e2', [
        { key: 'membre:camille', kind: 'membre', memberId: 'camille', name: 'Camille', colorTag: 'accent', shareAmount: 10 },
        { key: 'invite:gino', kind: 'guest', memberId: 'gino', name: 'Gino', colorTag: null, shareAmount: 10 },
      ]),
    ];
    const shares = computeShares(expenses);
    expect(shares.map((share) => [share.key, share.amount])).toEqual([
      ['membre:camille', 38.17],
      ['invite:gino', 38.16],
      ['membre:thomas', 28.17],
    ]);
  });

  it('le total des parts vaut 100 % du total dépensé', () => {
    const expenses = [
      expense('e1', [
        { key: 'membre:a', kind: 'membre', memberId: 'a', name: 'A', colorTag: 'accent', shareAmount: 20 },
        { key: 'membre:b', kind: 'membre', memberId: 'b', name: 'B', colorTag: 'coral', shareAmount: 10 },
      ]),
    ];
    const shares = computeShares(expenses);
    const total = shares.reduce((sum, share) => sum + share.amount, 0);
    expect(total).toBe(30);
    const pct = shares.reduce((sum, share) => sum + share.amount / total, 0);
    expect(pct).toBeCloseTo(1, 10);
  });

  it('exclut les sommes nulles', () => {
    const expenses = [
      expense('e1', [
        { key: 'membre:a', kind: 'membre', memberId: 'a', name: 'A', colorTag: 'accent', shareAmount: 0 },
        { key: 'membre:b', kind: 'membre', memberId: 'b', name: 'B', colorTag: 'coral', shareAmount: 12.5 },
      ]),
    ];
    expect(computeShares(expenses).map((share) => share.key)).toEqual(['membre:b']);
    expect(computeShares([])).toEqual([]);
  });
});
