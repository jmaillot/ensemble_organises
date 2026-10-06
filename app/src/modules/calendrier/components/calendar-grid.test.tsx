import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarGrid } from './calendar-grid';
import { buildDayMarkers, toCalendarEvent } from '../types';
import type { EventRow } from '@/types';

const eventRow = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'event-1',
  household_id: 'household-1',
  title: 'Réunion',
  description: null,
  start_at: '2026-11-11T10:00:00',
  end_at: '2026-11-11T11:00:00',
  all_day: false,
  location: null,
  color: 'coral',
  category_id: null,
  calendar_id: 'cal-commun',
  created_by: 'member-camille',
  created_at: '2026-11-10T10:00:00',
  ...overrides,
});

const days = [{ iso: '2026-11-11', number: 11, isOutside: false }];

function renderGrid(withEvent: boolean) {
  const events = withEvent ? [toCalendarEvent(eventRow(), [])] : [];
  const markers = buildDayMarkers(
    days,
    {
      events,
      tasks: [],
      birthdays: [],
      holidays: [{ id: 0, date: '2026-11-11', title: 'Armistice 1918', time: 'Toute la journée', kind: 'Jour férié' }],
      vacations: [],
    },
    '2026-11-10',
  );
  render(
    <CalendarGrid
      days={days}
      monthLabel="Novembre 2026"
      selected="2026-11-11"
      today="2026-11-10"
      markers={markers}
      onSelect={() => {}}
      onLongPress={() => {}}
      onPrevious={() => {}}
      onNext={() => {}}
      onToday={() => {}}
    />,
  );
}

describe('CalendarGrid couches de référence', () => {
  it('signale un jour férié seul par une pastille ambre', () => {
    renderGrid(false);
    const button = screen.getByRole('button', { name: /11 novembre 2026, jour férié/ });
    expect(button.querySelector('.bg-amber')).not.toBeNull();
  });

  it('garde la pastille férié visible même avec un événement du foyer', () => {
    renderGrid(true);
    const button = screen.getByRole('button', { name: /11 novembre 2026, 1 événement, jour férié/ });
    // Pastille événement (corail) + pastille férié (ambre) : les deux couches.
    expect(button.querySelector('.bg-coral')).not.toBeNull();
    expect(button.querySelector('.bg-amber')).not.toBeNull();
  });
});
