import { describe, expect, it } from 'vitest';
import { computeManualRanks } from './manual-order';

/**
 * Le calcul des rangs manuels, partagé par les tâches (`priority_order`) et
 * les articles de courses (`position`).
 *
 * LA RÈGLE, et ce qu'elle protège : les éléments DÉPLACÉS occupent les places
 * de ceux qu'ils remplacent, et les autres ne bougent pas. C'est ce qui
 * permet de n'écrire que les rangs qui changent — et ce qui garantit qu'un
 * réordonnancement dans un rayon ne déplace pas les articles des autres
 * rayons.
 */

interface Item {
  id: string;
  position: number;
}

const items: Item[] = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
  { id: 'd', position: 3 },
];

const rankOf = (item: Item) => item.position;

describe('computeManualRanks', () => {
  it('donne aux éléments déplacés les places de ceux qu’ils remplacent', () => {
    // « c » passe devant « a » : les deux occupent les places 0 et 2, et
    // « b » et « d » ne bougent pas.
    const rangs = computeManualRanks(items, ['c', 'a'], rankOf);
    expect(rangs).toEqual({ a: 2, b: 1, c: 0, d: 3 });
  });

  it('laisse les éléments non déplacés à leur place', () => {
    // « d » passe devant « c » : les deux échangent leurs places, et « a »
    // et « b » ne bougent pas.
    const rangs = computeManualRanks(items, ['d', 'c'], rankOf);
    expect(rangs.a).toBe(0);
    expect(rangs.b).toBe(1);
    expect(rangs.d).toBe(2);
    expect(rangs.c).toBe(3);
  });

  it('ne produit jamais deux fois le même rang', () => {
    // Un tri à rang libre donnerait deux articles au même rang, et l'ordre
    // affiché deviendrait indécis.
    const rangs = computeManualRanks(items, ['d', 'a', 'c'], rankOf);
    const valeurs = Object.values(rangs).sort((a, b) => a - b);
    expect(valeurs).toEqual([0, 1, 2, 3]);
  });

  it('rejoue l’ordre entier quand on lui passe toute la liste', () => {
    const rangs = computeManualRanks(items, ['d', 'c', 'b', 'a'], rankOf);
    expect(rangs).toEqual({ a: 3, b: 2, c: 1, d: 0 });
  });

  it('ignore un identifiant inconnu', () => {
    const rangs = computeManualRanks(items, ['inconnu'], rankOf);
    expect(rangs).toEqual({ a: 0, b: 1, c: 2, d: 3 });
  });
});
