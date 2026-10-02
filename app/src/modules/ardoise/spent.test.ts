import { describe, expect, it } from 'vitest';
import { computeSpent, type Expense } from './types';

const expense = (id: string, overrides: Partial<Expense>): Expense => ({
  id,
  ardoiseId: 'ardoise-1',
  title: id,
  amount: 0,
  paidBy: null,
  paidByKind: 'membre',
  paidByName: 'Payeur',
  paidByColorTag: null,
  date: '2026-10-02',
  splitType: 'egal',
  participants: [],
  ...overrides,
});

describe('computeSpent', () => {
  it('cumule les montants avancés par payeur, membres et invités', () => {
    const expenses = [
      expense('e1', { amount: 60, paidBy: 'camille', paidByName: 'Camille', paidByColorTag: 'accent' }),
      expense('e2', { amount: 20, paidBy: 'camille', paidByName: 'Camille', paidByColorTag: 'accent' }),
      expense('e3', { amount: 34, paidBy: 'gino', paidByKind: 'guest', paidByName: 'Gino' }),
    ];
    expect(computeSpent(expenses).map((share) => [share.key, share.amount])).toEqual([
      ['membre:camille', 80],
      ['invite:gino', 34],
    ]);
  });

  it('trie du plus gros dépensier au plus petit et ignore les dépenses sans payeur', () => {
    const expenses = [
      expense('e1', { amount: 8.5, paidBy: 'noe', paidByName: 'Noé' }),
      expense('e2', { amount: 84.5, paidBy: 'camille', paidByName: 'Camille' }),
      expense('e3', { amount: 10, paidBy: null, paidByName: 'Payeur' }),
    ];
    const spent = computeSpent(expenses);
    expect(spent.map((share) => share.name)).toEqual(['Camille', 'Noé']);
    const total = spent.reduce((sum, share) => sum + share.amount, 0);
    expect(total).toBe(93);
  });

  it('rend une liste vide sans dépense', () => {
    expect(computeSpent([])).toEqual([]);
  });
});
