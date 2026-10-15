import { describe, expect, it } from 'vitest';
import { applyFreePayerShare, computeSpent, customSharesTotal, normalizeShares, splitEqual, type Expense } from './types';

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
  createdBy: null,
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

describe('applyFreePayerShare', () => {
  it('ajoute l’invité au partage égal quand inclus', () => {
    expect(applyFreePayerShare(['membre:a'], 'g1', { include: true, splitType: 'egal' })).toEqual([
      'membre:a',
      'invite:g1',
    ]);
  });

  it('ne duplique pas un invité déjà coché', () => {
    expect(applyFreePayerShare(['membre:a', 'invite:g1'], 'g1', { include: true, splitType: 'egal' })).toEqual([
      'membre:a',
      'invite:g1',
    ]);
  });

  it('laisse le partage inchangé si exclu ou en personnalisé', () => {
    expect(applyFreePayerShare(['membre:a'], 'g1', { include: false, splitType: 'egal' })).toEqual(['membre:a']);
    expect(applyFreePayerShare(['membre:a'], 'g1', { include: true, splitType: 'personnalise' })).toEqual([
      'membre:a',
    ]);
  });
});

/**
 * WR-06 : le calcul est la barrière, pas seulement l'écran — l'API et les
 * graines appellent `normalizeShares` directement, donc c'est ici que le refus
 * doit vivre.
 */
describe('normalizeShares — parts personnalisées bornées (WR-06)', () => {
  it('(a) refuse une part personnalisée négative', () => {
    expect(() => normalizeShares(10, ['membre:a', 'membre:b'], { 'membre:a': -1, 'membre:b': 11 })).toThrow(
      'Une part ne peut pas être négative.',
    );
  });

  it('(b) refuse une somme supérieure au montant (la part du dernier serait négative)', () => {
    // Dépense 10 €, parts 10 + 10 + 1 : le dernier absorbe 10 − 21 = −10.
    expect(() =>
      normalizeShares(10, ['membre:a', 'membre:b', 'membre:c'], {
        'membre:a': 10,
        'membre:b': 10,
        'membre:c': 1,
      }),
    ).toThrow('La somme des parts dépasse le montant de la dépense.');
  });

  it('(c) une somme exacte est rendue telle quelle', () => {
    expect(normalizeShares(10, ['membre:a', 'membre:b'], { 'membre:a': 4, 'membre:b': 6 })).toEqual([4, 6]);
  });

  it('(d) sans parts personnalisées, le partage égal reste inchangé', () => {
    expect(normalizeShares(10, ['membre:a', 'membre:b', 'membre:c'])).toEqual(splitEqual(10, 3));
    expect(splitEqual(10, 3)).toEqual([3.33, 3.33, 3.34]);
  });

  it('(e) arrondit au centime une somme légitime, l’écart d’arrondi allant au dernier', () => {
    expect(
      normalizeShares(10, ['membre:a', 'membre:b', 'membre:c'], {
        'membre:a': 3.33,
        'membre:b': 3.33,
        'membre:c': 3.33,
      }),
    ).toEqual([3.33, 3.33, 3.34]);
  });

  it('customSharesTotal somme les parts retenues, sans absorption d’écart', () => {
    expect(customSharesTotal(['membre:a', 'membre:b'], { 'membre:a': 4, 'membre:b': 6 })).toBe(10);
    // Une clé absente ou non retenue vaut zéro.
    expect(customSharesTotal(['membre:a', 'membre:b'], { 'membre:a': 4 })).toBe(4);
    expect(customSharesTotal([], { 'membre:a': 4 })).toBe(0);
  });
});
