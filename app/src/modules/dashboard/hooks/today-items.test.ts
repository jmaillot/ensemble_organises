import { describe, expect, it } from 'vitest';
import { buildTodayItems } from './use-dashboard';
import type { EventRow, TaskRow } from '@/types';

const task = (overrides: Partial<TaskRow>): TaskRow => ({
  id: 't',
  household_id: 'h',
  name: 'Tâche',
  description: null,
  due_date: null,
  priority_order: 0,
  status: 'a_faire',
  created_by: null,
  created_at: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

const event = (overrides: Partial<EventRow>): EventRow => ({
  id: 'e',
  household_id: 'h',
  title: 'Événement',
  description: null,
  start_at: '2026-09-30T19:30:00',
  end_at: null,
  all_day: false,
  location: null,
  color: null,
  created_by: null,
  created_at: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

const TODAY = '2026-09-30';

describe('buildTodayItems', () => {
  it('ignore les tâches terminées et sans échéance', () => {
    expect(buildTodayItems([task({ status: 'fait', due_date: TODAY }), task({ due_date: null })], [], TODAY)).toEqual([]);
  });

  it('ordonne retards, horaires puis journées entières', () => {
    const items = buildTodayItems(
      [
        task({ id: 'a', name: 'Retard', due_date: '2026-09-29' }),
        task({ id: 'b', name: 'Dernier', due_date: TODAY }),
      ],
      [
        event({ id: 'c', title: 'Tôt', start_at: '2026-09-30T08:00:00' }),
        event({ id: 'd', title: 'Tard', start_at: '2026-09-30T20:00:00' }),
        event({ id: 'f', title: 'Journée', start_at: '2026-09-30T00:00:00', all_day: true }),
      ],
      TODAY,
    );
    expect(items.map((item) => item.title)).toEqual(['Retard', 'Tôt', 'Tard', 'Dernier', 'Journée']);
    expect(items[0]).toMatchObject({ kind: 'tache-retard', time: null });
    expect(items[1]).toMatchObject({ kind: 'evenement', time: '08:00', detail: 'À 08:00' });
    expect(items[4]).toMatchObject({ kind: 'evenement', time: null, detail: 'Toute la journée' });
  });

  it('ignore les événements des autres jours', () => {
    expect(buildTodayItems([], [event({ start_at: '2026-10-01T10:00:00' })], TODAY)).toEqual([]);
  });
});
