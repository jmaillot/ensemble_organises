import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocalAdapter } from '@/lib/data/local-adapter';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { RecipeRow, RecipeStepRow, ShoppingListRow } from '@/types';
import { deleteRecipe, deleteRecipeStep, sendRecipeIngredientsToCourses, uploadRecipeStepPhoto } from './api';
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

  it('le modèle print contient nom + ingrédients à l’échelle + étapes, sans photo fournie', () => {
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
    // Sans carte d’URLs, une entrée par étape, toutes nulles : la recette reste
    // imprimable sans photo et le tableau reste parallèle aux lignes.
    expect(model.stepPhotos).toEqual([null, null]);
    expect(model.stepPhotos).toHaveLength(model.stepLines.length);
  });

  it('le modèle print porte l’URL résolue de chaque étape, alignée sur les lignes', () => {
    const model = toRecipePrintModel({
      title: 'Gratin dauphinois',
      servings: 4,
      targetServings: 4,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [],
      steps: [
        { id: 's1', content: 'Mélanger.', position: 0, photoPath: null },
        { id: 's2', content: 'Enfourner.', position: 1, photoPath: null },
        { id: 's3', content: 'Servir.', position: 2, photoPath: null },
      ],
      stepPhotoUrls: { s1: 'https://signe.example/s1.jpg', s3: 'https://signe.example/s3.jpg' },
    });

    expect(model.stepLines).toEqual(['1. Mélanger.', '2. Enfourner.', '3. Servir.']);
    expect(model.stepPhotos).toEqual(['https://signe.example/s1.jpg', null, 'https://signe.example/s3.jpg']);
    expect(model.stepPhotos).toHaveLength(model.stepLines.length);
  });

  it('un chemin de bucket dans step.photoPath n’entre jamais dans le modèle (T-21-05)', () => {
    const model = toRecipePrintModel({
      title: 'Recette',
      servings: 4,
      targetServings: 4,
      prepMinutes: null,
      cookMinutes: null,
      ingredients: [],
      steps: [{ id: 's1', content: 'Mélanger.', position: 0, photoPath: 'foyer-1/recipes/r-1/steps/s1/file.jpg' }],
    });

    // Le modèle ne lit que la carte résolue : sans elle, l’entrée est nulle et
    // le chemin de bucket n’atteint jamais le DOM d’impression.
    expect(model.stepPhotos).toEqual([null]);
    expect(JSON.stringify(model)).not.toContain('foyer-1/');
  });

  it('le dépôt démo rend une valeur qui n’est pas une URL http(s) (critère négatif du SPEC)', async () => {
    // jsdom n’implémente pas `URL.createObjectURL` (aperçus locaux) : on le
    // remplace, comme `storage.test.ts`, sans mocker `depositHouseholdFile` —
    // c’est la chaîne réelle `uploadRecipeStepPhoto` → `storedValueOf`.
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:apercu-etape') });
    const stored = await uploadRecipeStepPhoto(
      DEMO_HOUSEHOLD_ID,
      'recipe-x',
      'step-1',
      new File(['pixels'], 'etape.jpg', { type: 'image/jpeg' }),
    );

    expect(/^https?:\/\//i.test(stored)).toBe(false);
    expect(stored.startsWith('blob:')).toBe(true);
  });

  it('les trois niveaux de nettoyage ne lèvent pas quand il n’y a rien à retirer (R5, arête vide)', async () => {
    const adapter = getLocalAdapter();
    const step = await adapter.create<RecipeStepRow>('recipe_steps', {
      recipe_id: 'r-empty',
      household_id: DEMO_HOUSEHOLD_ID,
      content: 'Étape.',
      position: 0,
      photo_path: 'blob:apercu-etape',
    });

    // Niveau 1 : supprimer l’étape (aperçu `blob:` → rien à retirer du bucket).
    await expect(deleteRecipeStep(step.id, 'blob:apercu-etape')).resolves.toBeUndefined();
    expect(await adapter.list('recipe_steps', { recipe_id: 'r-empty' })).toHaveLength(0);

    // Niveaux 2 et 3 : supprimer la recette (couverture + photos d’étapes).
    const recipe = await adapter.create<RecipeRow>('recipes', {
      household_id: DEMO_HOUSEHOLD_ID,
      title: 'Recette vide',
      cover_photo: 'blob:apercu-cover',
      created_at: '2026-10-16T12:00:00.000Z',
    });
    await expect(deleteRecipe(recipe.id, 'blob:apercu-cover', ['blob:apercu-1', null])).resolves.toBeUndefined();
    expect(await adapter.list('recipes', { household_id: DEMO_HOUSEHOLD_ID })).not.toContainEqual(
      expect.objectContaining({ id: recipe.id }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('les unités abrégées restent invariables à toutes les échelles', () => {
    expect(agreeUnit('g', 1000)).toBe('g');
    expect(agreeUnit('g', 0.5)).toBe('g');
    expect(agreeUnit('cl', 2)).toBe('cl');
    expect(agreeUnit('cas', 2)).toBe('cas');
  });
});
