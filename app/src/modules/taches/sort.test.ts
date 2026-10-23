import { describe, expect, it } from 'vitest';
import { addDays, todayIso } from '@/lib/utils';
import { sortTasks, sortedIdsFor, type Task } from './types';

/**
 * `isLate` et `lateDays` sont décoratifs ici : le tri **relit** la règle de
 * retard (statut + échéance strictement passée), la même que `toTask` — c'est
 * précisément ce qui empêche les deux définitions de diverger (D-11).
 */
const task = (overrides: Partial<Task>): Task => ({
  id: 't',
  name: 'Tâche',
  description: null,
  dueDate: null,
  status: 'a_faire',
  priorityOrder: 0,
  priority: 'normale',
  assignees: [],
  reminderAt: null,
  folderId: null,
  createdBy: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  isLate: false,
  lateDays: 0,
  dueLabel: 'Sans échéance',
  reminderTime: null,
  reminderLabel: null,
  ...overrides,
});

/** Échéance relative à aujourd'hui : les cas ne dépendent pas du jour d'exécution. */
const soon = (days: number) => addDays(todayIso(), days);

const ids = (tasks: Task[]) => tasks.map((entry) => entry.id);

describe('sortTasks — l’ordre manuel gouverne, le retard est épinglé (D-11)', () => {
  /**
   * Le défaut d'origine, mot pour mot (WR-13) : échéances 20/10, 22/10, 25/10,
   * la plus lointaine portant le plus petit rang. Le tri par échéance rendait
   * 20/10 en tête, donc la ligne déposée rebondissait à chaque `refresh()`.
   */
  it('rend en tête la tâche de plus petit rang, même d’échéance plus lointaine', () => {
    const tasks = [
      task({ id: 'a', dueDate: soon(5), priorityOrder: 2 }),
      task({ id: 'b', dueDate: soon(7), priorityOrder: 1 }),
      task({ id: 'c', dueDate: soon(10), priorityOrder: 0 }),
    ];
    expect(ids(sortTasks(tasks))).toEqual(['c', 'b', 'a']);
  });

  it('épingle le retard devant un meilleur rang', () => {
    const tasks = [
      task({ id: 'rang-0', dueDate: soon(3), priorityOrder: 0 }),
      task({ id: 'retard', dueDate: soon(-2), priorityOrder: 9, isLate: true, lateDays: 2 }),
      task({ id: 'rang-1', dueDate: soon(4), priorityOrder: 1 }),
    ];
    expect(ids(sortTasks(tasks))).toEqual(['retard', 'rang-0', 'rang-1']);
  });

  it('range les retards entre eux par ordre manuel, pas par ancienneté du retard', () => {
    const tasks = [
      task({ id: 'retard-ancien', dueDate: soon(-5), priorityOrder: 8, isLate: true, lateDays: 5 }),
      task({ id: 'retard-recent', dueDate: soon(-1), priorityOrder: 2, isLate: true, lateDays: 1 }),
      task({ id: 'a-jour', dueDate: soon(3), priorityOrder: 0 }),
    ];
    expect(ids(sortTasks(tasks))).toEqual(['retard-recent', 'retard-ancien', 'a-jour']);
  });

  it('garde les tâches faites en dernier', () => {
    const tasks = [
      task({ id: 'faite', status: 'fait', dueDate: soon(1), priorityOrder: 0 }),
      task({ id: 'ouverte', dueDate: soon(9), priorityOrder: 5 }),
    ];
    expect(ids(sortTasks(tasks))).toEqual(['ouverte', 'faite']);
  });

  it('ne remonte pas une tâche faite dont l’échéance est passée', () => {
    const tasks = [
      task({ id: 'faite-retard', status: 'fait', dueDate: soon(-4), priorityOrder: 0 }),
      task({ id: 'ouverte', dueDate: soon(2), priorityOrder: 7 }),
    ];
    expect(ids(sortTasks(tasks))).toEqual(['ouverte', 'faite-retard']);
  });

  it('départage deux rangs égaux de façon stable, quel que soit l’ordre d’entrée', () => {
    const a = task({ id: 'a', dueDate: soon(2), priorityOrder: 3 });
    const b = task({ id: 'b', dueDate: soon(1), priorityOrder: 3 });
    expect(ids(sortTasks([a, b]))).toEqual(['a', 'b']);
    expect(ids(sortTasks([b, a]))).toEqual(['a', 'b']);
  });

  it('un dueDate nul ne pèse plus et ne fait perdre aucune tâche', () => {
    const tasks = [
      task({ id: 'sans-echeance', dueDate: null, priorityOrder: 0 }),
      task({ id: 'avec-echeance', dueDate: soon(1), priorityOrder: 1 }),
    ];
    const sorted = sortTasks(tasks);
    // Sans échéance mais de meilleur rang : elle passe devant (l'ancien tri la
    // reléguait derrière le fallback chaîne `'9999-12-31'`).
    expect(ids(sorted)).toEqual(['sans-echeance', 'avec-echeance']);
    expect(sorted).toHaveLength(tasks.length);
    expect(new Set(ids(sorted))).toEqual(new Set(ids(tasks)));
  });

  it('ne mute pas le tableau reçu', () => {
    const tasks = [
      task({ id: 'a', dueDate: soon(2), priorityOrder: 1 }),
      task({ id: 'b', dueDate: soon(1), priorityOrder: 0 }),
    ];
    const sorted = sortTasks(tasks);
    expect(ids(tasks)).toEqual(['a', 'b']);
    expect(sorted).not.toBe(tasks);
  });
});


/** Un membre assigné : la liste porte son nom, c'est lui qui départage. */
const membre = (id: string, nom: string) =>
  ({
    id,
    household_id: 'hh-1',
    user_id: null,
    display_name: nom,
    avatar_url: null,
    color_tag: 'ink',
    role: 'membre',
    created_at: '2026-10-02T10:00:00.000Z',
  }) as unknown as Task['assignees'][number]['member'];

describe('sortedIdsFor — le tri en un clic', () => {
  it('range par échéance, les tâches sans échéance en dernier', () => {
    const tasks = [
      task({ id: 'c', dueDate: '2026-10-20' }),
      task({ id: 'a', dueDate: '2026-10-12' }),
      task({ id: 'sans', dueDate: null }),
      task({ id: 'b', dueDate: '2026-10-18' }),
    ];
    expect(sortedIdsFor(tasks, 'echeance')).toEqual(['a', 'b', 'c', 'sans']);
  });

  it('range par responsable, les tâches sans assigné en dernier', () => {
    const tasks = [
      task({ id: 'z', assignees: [{ memberId: 'm2', member: membre('m2', 'Zoé') }] }),
      task({ id: 'a', assignees: [{ memberId: 'm1', member: membre('m1', 'Alix') }] }),
      task({ id: 'sans', assignees: [] }),
    ];
    expect(sortedIdsFor(tasks, 'responsable')).toEqual(['a', 'z', 'sans']);
  });

  it('départage à l’identifiant : deux tâches à la même échéance ne s’échangent pas', () => {
    const tasks = [
      task({ id: 'b', dueDate: '2026-10-12' }),
      task({ id: 'a', dueDate: '2026-10-12' }),
    ];
    expect(sortedIdsFor(tasks, 'echeance')).toEqual(['a', 'b']);
  });

  it('ne touche pas aux tâches : le tri ne renvoie qu’un ordre', () => {
    const tasks = [task({ id: 'b', dueDate: '2026-10-20' }), task({ id: 'a', dueDate: '2026-10-12' })];
    const avant = tasks.map((entry) => entry.id);
    sortedIdsFor(tasks, 'echeance');
    expect(tasks.map((entry) => entry.id)).toEqual(avant);
  });
});
