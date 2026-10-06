import { describe, expect, it } from 'vitest';
import { guessRayon, matchCatalogue } from './types';

const cases: [string, string][] = [
  ['Lait demi-écrémé', 'Crèmerie & Produits laitiers'],
  ['Yaourts nature', 'Crèmerie & Produits laitiers'],
  ['Comté affiné', 'Crèmerie & Produits laitiers'],
  ['Œufs plein air', 'Crèmerie & Produits laitiers'],
  ['Crème hydratante', 'Hygiène & Beauté'],
  ['Crème fraîche', 'Crèmerie & Produits laitiers'],
  ['Maquillage waterproof', 'Hygiène & Beauté'],
  ['Saumon fumé', 'Viande & Poissons'],
  ['Thon au naturel', 'Viande & Poissons'],
  ['Baguette tradition', 'Boulangerie'],
  ['Croissants au beurre', 'Boulangerie'],
  ['Gâteau au chocolat', 'Boulangerie'],
  ['Poulet fermier', 'Viande & Poissons'],
  ['Steak haché', 'Viande & Poissons'],
  ['Chorizo doux', 'Viande & Poissons'],
  ['Pâté de campagne', 'Charcuterie & Traiteur'],
  ['Jambon blanc', 'Charcuterie & Traiteur'],
  ['Sandwich poulet', 'Charcuterie & Traiteur'],
  ['Pâtée pour chat', 'Animalerie'],
  ['Croquettes au poulet', 'Animalerie'],
  ['Pommes Golden', 'Fruits & légumes'],
  ['Tomates cerises', 'Fruits & légumes'],
  ['Pomme de terre', 'Fruits & légumes'],
  ['Épinards frais', 'Fruits & légumes'],
  ['Riz basmati', 'Épicerie salée'],
  ['Pâtes complètes', 'Épicerie salée'],
  ['Huile d’olive', 'Épicerie salée'],
  ['Sel fin', 'Épicerie salée'],
  ['Nutella', 'Épicerie sucrée'],
  ['Chocolat noir', 'Épicerie sucrée'],
  ['Pizza surgelée', 'Surgelés'],
  ['Quiche lorraine', 'Charcuterie & Traiteur'],
  ['Glace vanille', 'Surgelés'],
  ['Jus d’orange', 'Boissons'],
  ['Café moulu', 'Boissons'],
  ['Eau gazeuse', 'Boissons'],
  ['Couches bébé', 'Bébé'],
  ['Lait en poudre', 'Bébé'],
  ['Savon de Marseille', 'Hygiène & Beauté'],
  ['Papier toilette', 'Hygiène & Beauté'],
  ['Dentifrice menthe', 'Hygiène & Beauté'],
  ['Paracétamol 1000', 'Parapharmacie'],
  ['Pansements', 'Parapharmacie'],
  ['Lessive écologique', 'Entretien & Nettoyage'],
  ['Éponges grattantes', 'Entretien & Nettoyage'],
  ['Sac poubelle 50L', 'Entretien & Nettoyage'],
  ['Liquide vaisselle', 'Entretien & Nettoyage'],
  ['Ampoule LED', 'Maison & Décoration'],
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
