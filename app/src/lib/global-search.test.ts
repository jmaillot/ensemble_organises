import { describe, expect, it } from 'vitest';
import { catalogueModules } from './modules';
import { foldSearchText, searchModules, searchRecords, type SearchRecord } from './global-search';

const record = (id: string, label: string, extra?: string): SearchRecord => ({
  id,
  rowId: id,
  module: 'taches',
  label,
  hint: 'Tâche',
  extra,
});

describe('foldSearchText', () => {
  it('replie accents et casse', () => {
    expect(foldSearchText('École')).toBe('ecole');
    expect(foldSearchText('Déjeuner')).toBe('dejeuner');
    expect(foldSearchText('FIDÉLITÉ')).toBe('fidelite');
  });
});

describe('searchModules', () => {
  it('rend tout le catalogue quand la saisie est vide', () => {
    expect(searchModules(catalogueModules, '')).toHaveLength(catalogueModules.length);
  });

  it('trouve un espace par son libellé sans accent', () => {
    const keys = searchModules(catalogueModules, 'fidelite').map((entry) => entry.key);
    expect(keys).toEqual(['fidelite']);
  });

  it('trouve un espace par son libellé court', () => {
    const keys = searchModules(catalogueModules, 'agenda').map((entry) => entry.key);
    expect(keys).toContain('calendrier');
  });

  it('exige que chaque mot de la saisie corresponde', () => {
    const keys = searchModules(catalogueModules, 'carnet cuisine').map((entry) => entry.key);
    expect(keys).toEqual(['recettes']);
  });

  it('fait remonter le libellé avant l’accroche', () => {
    const entries = [
      { ...catalogueModules[0], key: 'notes' as const, label: 'Carnet', detail: 'vos notes' },
      { ...catalogueModules[1], key: 'taches' as const, label: 'Notes de tâches', detail: 'priorités' },
    ];
    expect(searchModules(entries, 'notes').map((entry) => entry.key)).toEqual(['taches', 'notes']);
  });

  it('retire les modules hors périmètre du rôle enfant', () => {
    const keys = searchModules(catalogueModules, '', { isChild: true }).map((entry) => entry.key);
    expect(keys).not.toContain('cadeaux');
    expect(keys).not.toContain('ardoise');
    expect(keys).toContain('courses');
  });

  it('ne rend rien pour une saisie sans correspondance', () => {
    expect(searchModules(catalogueModules, 'zzzz')).toEqual([]);
  });
});

describe('searchRecords', () => {
  it('ignore la casse et les accents', () => {
    const { results } = searchRecords([record('1', 'Déjeuner du dimanche')], 'dejeuner');
    expect(results.map((row) => row.id)).toEqual(['1']);
  });

  it('cherche aussi dans le texte annexe', () => {
    const { results } = searchRecords([record('1', 'Anniversaire', 'gâteau au chocolat')], 'chocolat');
    expect(results.map((row) => row.id)).toEqual(['1']);
  });

  it('exige tous les mots de la saisie', () => {
    const { results } = searchRecords([record('1', 'Sortir les poubelles')], 'sortir jaunes');
    expect(results).toEqual([]);
  });

  it('classe les libellés qui commencent par la saisie en premier', () => {
    const { results } = searchRecords([record('1', 'Ranger les lait'), record('2', 'Lait d’agne')], 'lait');
    expect(results.map((row) => row.id)).toEqual(['2', '1']);
  });

  it('plafonne à quatre résultats par module, sans taire le total', () => {
    const rows = Array.from({ length: 7 }, (_, index) => record(String(index), `Lait ${index}`));
    const { results, matched } = searchRecords(rows, 'lait');
    expect(results).toHaveLength(4);
    expect(matched).toBe(7);
  });

  it('plafonne le total à douze résultats', () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      record(String(index), `Lait ${index}`, undefined),
    ).map((row, index) => ({ ...row, module: (['taches', 'notes', 'courses', 'contacts'] as const)[index % 4] }));
    const { results, matched } = searchRecords(rows, 'lait');
    expect(results).toHaveLength(12);
    expect(matched).toBe(20);
  });

  it('rend zéro résultat pour une saisie vide, sans lire les données', () => {
    expect(searchRecords([record('1', 'Lait')], '')).toEqual({ results: [], matched: 0 });
  });
});
