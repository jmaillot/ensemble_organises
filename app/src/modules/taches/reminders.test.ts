import { describe, expect, it } from 'vitest';
import { addDays, todayIso } from '@/lib/utils';
import { instantOfDatetimeLocal } from '@/lib/datetime';
import { reminderTasks, type Task } from './types';

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

/**
 * Instant d'un rappel à l'heure **locale** demandée, un jour relatif à
 * aujourd'hui. Tous les cas posent leur `now` : aucun ne dépend de l'heure à
 * laquelle la suite tourne.
 */
const at = (days: number, time: string) => {
  const iso = instantOfDatetimeLocal(`${addDays(todayIso(), days)}T${time}`);
  if (iso === null) throw new Error(`Heure de test illisible : ${time}`);
  return iso;
};

/** `now` local, sur l'heure murale demandée du jour relatif donné. */
const now = (days: number, time: string) => new Date(`${addDays(todayIso(), days)}T${time}`);

const ids = (tasks: Task[]) => tasks.map((entry) => entry.id);

describe('reminderTasks — « Rappels du jour » se borne à la journée (WR-14, D-07)', () => {
  /**
   * Le défaut d'origine (WR-14) : trois rappels de juin occupaient les trois
   * places du panneau, et le rappel du jour n'apparaissait jamais.
   */
  it('ne retient que le rappel du jour, pas les rappels passés', () => {
    const tasks = [
      task({ id: 'juin-1', reminderAt: at(-120, '09:00') }),
      task({ id: 'juin-2', reminderAt: at(-90, '10:00') }),
      task({ id: 'juin-3', reminderAt: at(-60, '11:00') }),
      task({ id: 'aujourd-hui', reminderAt: at(0, '18:30') }),
    ];
    expect(ids(reminderTasks(tasks, now(0, '12:00')))).toEqual(['aujourd-hui']);
  });

  it('écarte un rappel du jour déjà passé', () => {
    const tasks = [task({ id: 'passe', reminderAt: at(0, '08:00') })];
    expect(reminderTasks(tasks, now(0, '12:00'))).toEqual([]);
  });

  it('écarte un rappel de demain : le panneau annonce « du jour »', () => {
    const tasks = [task({ id: 'demain', reminderAt: at(1, '09:00') })];
    expect(reminderTasks(tasks, now(0, '12:00'))).toEqual([]);
  });

  it('garde ce soir 23:59 et écarte cette nuit 00:01, déjà passée', () => {
    const tasks = [task({ id: 'ce-soir', reminderAt: at(0, '23:59') }), task({ id: 'cette-nuit', reminderAt: at(0, '00:01') })];
    expect(ids(reminderTasks(tasks, now(0, '00:02')))).toEqual(['ce-soir']);
  });

  it('trie du plus proche au plus lointain', () => {
    const tasks = [
      task({ id: 'vingt-heures', reminderAt: at(0, '20:00') }),
      task({ id: 'quatorze-heures', reminderAt: at(0, '14:00') }),
      task({ id: 'dix-huit-heures', reminderAt: at(0, '18:30') }),
    ];
    expect(ids(reminderTasks(tasks, now(0, '09:00')))).toEqual(['quatorze-heures', 'dix-huit-heures', 'vingt-heures']);
  });

  it('filtre sans supprimer : le rappel écarté reste sur sa tâche', () => {
    const tasks = [task({ id: 'juin', reminderAt: at(-60, '09:00') })];
    const before = tasks.map((entry) => entry.reminderAt);
    expect(reminderTasks(tasks, now(0, '12:00'))).toEqual([]);
    expect(tasks.map((entry) => entry.reminderAt)).toEqual(before);
  });

  it('ignore un rappel illisible plutôt que de trier sur NaN', () => {
    const tasks = [task({ id: 'illisible', reminderAt: 'pas une date' }), task({ id: 'valide', reminderAt: at(0, '18:30') })];
    expect(ids(reminderTasks(tasks, now(0, '12:00')))).toEqual(['valide']);
  });
});
