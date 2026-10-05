import { describe, expect, it } from 'vitest';
import { guessRayon, matchCatalogue } from './types';

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

describe('matchCatalogue', () => {
  const catalogue = [
    { name: 'Comté affiné 12 mois' },
    { name: 'Comté râpé' },
    { name: 'Lait demi-écrémé' },
    { name: 'Savon de Marseille' },
  ];

  it('trouve en sous-chaîne insensible casse/accents', () => {
    expect(matchCatalogue(catalogue, 'comte').map((p) => p.name)).toEqual(['Comté râpé', 'Comté affiné 12 mois']);
    expect(matchCatalogue(catalogue, 'SAVON').map((p) => p.name)).toEqual(['Savon de Marseille']);
  });

  it('trouve quand la saisie contient le nom', () => {
    expect(matchCatalogue([{ name: 'Lait' }], 'je veux du lait').map((p) => p.name)).toEqual(['Lait']);
  });

  it('rien sous 2 caractères, rien sans correspondance, limite respectée', () => {
    expect(matchCatalogue(catalogue, 'x')).toEqual([]);
    expect(matchCatalogue(catalogue, 'batteries')).toEqual([]);
    expect(matchCatalogue(catalogue, 'comté', 1)).toHaveLength(1);
  });
});
