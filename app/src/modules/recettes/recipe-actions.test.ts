import { describe, expect, it } from 'vitest';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { ShoppingListRow } from '@/types';
import { sendRecipeIngredientsToCourses } from './api';
import { agreeUnit, toRecipePrintModel } from './types';

describe('Actions fiche recette — export print + envoi Courses (R12/R14)', () => {
  it('envoie 3 ingrédients à l’échelle 8 vers « Courses semaine » aux bonnes quantités', async () => {
    const adapter = getLocalAdapter();
    const list = await adapter.create<ShoppingListRow>('shopping_lists', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Courses semaine',
      created_by: DEMO_MEMBERS.camille,
      created_at: '2026-10-14T10:00:00.000Z',
    });

    const sent = await sendRecipeIngredientsToCourses({
      householdId: DEMO_HOUSEHOLD_ID,
      listId: list.id,
      addedBy: DEMO_MEMBERS.camille,
      ingredients: [
        { name: 'Farine', quantity: 500, unit: 'g' },
        { name: 'Œuf', quantity: 1, unit: 'œuf' },
        { name: 'Sel', quantity: null, unit: 'au goût' },
      ],
      baseServings: 4,
      targetServings: 8,
    });

    // Quantités doublées, unité accordée, NULL « au goût » intact.
    expect(sent.rows.map((row) => [row.name, row.quantity, row.unit])).toEqual([
      ['Farine', 1000, 'g'],
      ['Œuf', 2, 'œufs'],
      ['Sel', null, 'au goût'],
    ]);
    expect(sent.createdCount).toBe(3);
    expect(sent.mergedCount).toBe(0);
    const stored = await adapter.list('shopping_list_items', {
      household_id: DEMO_HOUSEHOLD_ID,
      list_id: list.id,
    });
    expect(stored).toHaveLength(3);
  });

  it('les lignes existantes non cochées sont incrémentées, pas dupliquées', async () => {
    const adapter = getLocalAdapter();
    const list = await adapter.create<ShoppingListRow>('shopping_lists', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Courses fusion',
      created_by: DEMO_MEMBERS.camille,
      created_at: '2026-10-14T10:00:00.000Z',
    });
    await adapter.create('shopping_list_items', {
      household_id: DEMO_HOUSEHOLD_ID,
      list_id: list.id,
      name: 'Œuf',
      quantity: 1,
      unit: 'œuf',
      category: 'Frais',
      checked: false,
      added_by: DEMO_MEMBERS.camille,
      product_id: null,
      created_at: '2026-10-14T10:00:00.000Z',
    });
    // Ligne cochée : déjà achetée, ne fusionne pas.
    await adapter.create('shopping_list_items', {
      household_id: DEMO_HOUSEHOLD_ID,
      list_id: list.id,
      name: 'Farine',
      quantity: 200,
      unit: 'g',
      category: 'Épicerie',
      checked: true,
      added_by: DEMO_MEMBERS.camille,
      product_id: null,
      created_at: '2026-10-14T10:00:00.000Z',
    });

    const sent = await sendRecipeIngredientsToCourses({
      householdId: DEMO_HOUSEHOLD_ID,
      listId: list.id,
      addedBy: DEMO_MEMBERS.camille,
      ingredients: [
        { name: 'oeuf', quantity: 3, unit: 'œuf' },
        { name: 'Farine', quantity: 500, unit: 'g' },
      ],
      baseServings: 4,
      targetServings: 4,
    });

    // « oeuf » sans accent rejoint « Œuf » : 1 + 3 = 4, unité accordée.
    expect(sent.rows.map((row) => [row.name, row.quantity, row.unit])).toEqual([
      ['Œuf', 4, 'œufs'],
      ['Farine', 500, 'g'],
    ]);
    expect(sent.mergedCount).toBe(1);
    expect(sent.createdCount).toBe(1);
    const stored = await adapter.list('shopping_list_items', {
      household_id: DEMO_HOUSEHOLD_ID,
      list_id: list.id,
    });
    expect(stored).toHaveLength(3);
  });

  it('le modèle print contient nom + ingrédients à l’échelle + étapes, sans photo', () => {
    const model = toRecipePrintModel({
      title: 'Gratin dauphinois',
      servings: 4,
      targetServings: 8,
      prepMinutes: 30,
      cookMinutes: 45,
      ingredients: [
        { id: 'i1', name: 'Farine', quantity: 500, unit: 'g', position: 0 },
        { id: 'i2', name: 'Sel', quantity: null, unit: 'au goût', position: 1 },
      ],
      steps: [
        { id: 's1', content: 'Mélanger.', position: 0, photoPath: null },
        { id: 's2', content: 'Enfourner.', position: 1, photoPath: null },
      ],
    });

    expect(model.title).toBe('Gratin dauphinois');
    expect(model.meta).toContain('Pour 8 personnes');
    expect(model.meta).toContain('1h15');
    expect(model.ingredientLines).toEqual(['Farine — 1000 g', 'Sel — au goût']);
    expect(model.stepLines).toEqual(['1. Mélanger.', '2. Enfourner.']);
    expect(JSON.stringify(model)).not.toContain('photo');
  });

  it('les unités abrégées restent invariables à toutes les échelles', () => {
    expect(agreeUnit('g', 1000)).toBe('g');
    expect(agreeUnit('g', 0.5)).toBe('g');
    expect(agreeUnit('cl', 2)).toBe('cl');
    expect(agreeUnit('cas', 2)).toBe('cas');
  });
});
