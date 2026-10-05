import { describe, expect, it } from 'vitest';
import { guessRayon } from './types';

const cases: [string, string][] = [
  ['Lait demi-écrémé', 'Frais'],
  ['Yaourts nature', 'Frais'],
  ['Comté affiné', 'Frais'],
  ['Œufs plein air', 'Frais'],
  ['Saumon fumé', 'Frais'],
  ['Baguette tradition', 'Boulangerie'],
  ['Croissants au beurre', 'Boulangerie'],
  ['Gâteau au chocolat', 'Boulangerie'],
  ['Poulet fermier', 'Boucherie'],
  ['Steak haché', 'Boucherie'],
  ['Pommes Golden', 'Fruits & légumes'],
  ['Tomates cerises', 'Fruits & légumes'],
  ['Pomme de terre', 'Fruits & légumes'],
  ['Épinards frais', 'Fruits & légumes'],
  ['Pizza surgelée', 'Surgelés'],
  ['Glace vanille', 'Surgelés'],
  ['Jus d’orange', 'Boissons'],
  ['Café moulu', 'Boissons'],
  ['Eau gazeuse', 'Boissons'],
  ['Savon de Marseille', 'Hygiène'],
  ['Papier toilette', 'Hygiène'],
  ['Dentifrice menthe', 'Hygiène'],
  ['Lessive écologique', 'Ménage'],
  ['Éponges grattantes', 'Ménage'],
  ['Sac poubelle 50L', 'Ménage'],
  ['Riz basmati', 'Divers'],
  ['Pâtes complètes', 'Divers'],
  ['Huile d’olive', 'Divers'],
  ['Batteries AA', 'Divers'],
  ['', 'Divers'],
];

describe('guessRayon', () => {
  it.each(cases)('« %s » → %s', (name, expected) => {
    expect(guessRayon(name)).toBe(expected);
  });

  it('ignore la casse et les accents', () => {
    expect(guessRayon('LÉGUMES du marché')).toBe('Fruits & légumes');
  });

  it('null/undefined → Divers', () => {
    expect(guessRayon(null)).toBe('Divers');
    expect(guessRayon(undefined)).toBe('Divers');
  });
});
