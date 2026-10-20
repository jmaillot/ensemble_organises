/**
 * TODO #16 : le drapeau « assignations inconnues » doit traverser `buildTasks`,
 * sans quoi la ligne ne peut pas distinguer « on ne sait pas » de « personne ».
 */

import { describe, expect, it } from 'vitest';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { TaskRow } from '@/types';
import { buildTasks } from './types';

const row: TaskRow = {
  id: 'task-1',
  household_id: DEMO_HOUSEHOLD_ID,
  trip_id: null,
  folder_id: null,
  name: 'Sortir les poubelles',
  description: null,
  due_date: null,
  priority_order: 0,
  status: 'a_faire',
  created_by: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

describe('buildTasks — assignations inconnues (TODO #16)', () => {
  it('marque les tâches quand la lecture n’a pas rendu', () => {
    const [task] = buildTasks([row], [], [], [], true);
    expect(task?.assigneesUnknown).toBe(true);
  });

  it('ne marque rien quand la lecture a rendu', () => {
    const [task] = buildTasks([row], [], [], []);
    expect(task?.assigneesUnknown).toBeUndefined();
  });
});
