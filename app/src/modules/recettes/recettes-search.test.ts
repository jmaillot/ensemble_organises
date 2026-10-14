import { describe, expect, it } from 'vitest';
import { filterRecipes, stripRecipeDiacritics, type Recipe, type RecipeIngredient } from './types';

const GRATIN: Recipe = {
  id: 'r-gratin',
  householdId: 'foyer-1',
  title: 'Gratin dauphinois',
  categoryId: 'c-foyer',
  categoryName: 'Recettes du foyer',
  servings: 4,
  prepMinutes: 30,
  cookMinutes: 45,
  coverPhoto: null,
  tags: ['Plat'],
  isFavorite: true,
  createdAt: '2026-10-14T10:00:00.000Z',
};

const FONDANT: Recipe = {
  id: 'r-fondant',
  householdId: 'foyer-1',
  title: 'Fondant au chocolat',
  categoryId: 'c-desserts',
  categoryName: 'Desserts',
  servings: 6,
  prepMinutes: 20,
  cookMinutes: 12,
  coverPhoto: null,
  tags: ['Dessert'],
  isFavorite: false,
  createdAt: '2026-10-14T11:00:00.000Z',
};

const INGREDIENTS: Record<string, RecipeIngredient[]> = {
  'r-gratin': [
    { id: 'i-1', name: 'Pommes de terre', quantity: 800, unit: 'g', position: 0 },
    { id: 'i-2', name: 'Crème fraîche', quantity: 20, unit: 'cl', position: 1 },
  ],
  'r-fondant': [{ id: 'i-3', name: 'Chocolat noir', quantity: 200, unit: 'g', position: 0 }],
};

const ALL = [GRATIN, FONDANT];
const EMPTY = { query: '', categoryId: null, tag: null, favoritesOnly: false };

describe('Recherche recettes (R13, D-15)', () => {
  it('trouve gratin sans accent sur le nom', () => {
    expect(stripRecipeDiacritics('Crème fraîche')).toBe('creme fraiche');
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, query: 'gratin' })).toEqual([GRATIN]);
  });

  it('cherche aussi dans les ingredients, insensible aux accents', () => {
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, query: 'creme fraiche' })).toEqual([GRATIN]);
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, query: 'chocolat' })).toEqual([FONDANT]);
  });

  it('combine categorie + tag + favoris', () => {
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, favoritesOnly: true })).toEqual([GRATIN]);
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, categoryId: 'c-desserts' })).toEqual([FONDANT]);
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, tag: 'Dessert' })).toEqual([FONDANT]);
    expect(
      filterRecipes(ALL, INGREDIENTS, { ...EMPTY, query: 'fondant', tag: 'Dessert', favoritesOnly: false }),
    ).toEqual([FONDANT]);
    expect(filterRecipes(ALL, INGREDIENTS, { ...EMPTY, query: 'gratin', tag: 'Dessert' })).toEqual([]);
  });
});
