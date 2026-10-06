import { describe, expect, it } from 'vitest';
import { buildDayMarkers, isExitingPerso, toCalendarEvent } from './types';
import type { EventRow } from '@/types';

const calendars = [
  { id: 'cal-commun', visibility: 'commun' },
  { id: 'cal-perso', visibility: 'perso' },
];

const eventRow = (overrides: Partial<EventRow> = {}): EventRow => ({
  id: 'event-1',
  household_id: 'household-1',
  title: 'Devoirs du soir',
  description: null,
  start_at: '2026-10-06T18:00:00',
  end_at: '2026-10-06T19:00:00',
  all_day: false,
  location: null,
  color: 'accent',
  category_id: 'category-ecole',
  calendar_id: 'cal-commun',
  created_by: 'member-camille',
  created_at: '2026-10-06T17:00:00',
  ...overrides,
});

const categories = [{ id: 'category-ecole', name: 'École', color: '#3E7CB1' }];

describe('isExitingPerso (D-04)', () => {
  it('vrai pour un déplacement Perso vers Commun', () => {
    expect(isExitingPerso(calendars, 'cal-perso', 'cal-commun')).toBe(true);
  });

  it('faux dans les autres cas', () => {
    expect(isExitingPerso(calendars, 'cal-commun', 'cal-perso')).toBe(false);
    expect(isExitingPerso(calendars, 'cal-commun', 'cal-commun')).toBe(false);
    expect(isExitingPerso(calendars, 'cal-perso', 'cal-perso')).toBe(false);
    expect(isExitingPerso(calendars, null, 'cal-commun')).toBe(false);
    expect(isExitingPerso(calendars, 'cal-perso', '')).toBe(false);
    expect(isExitingPerso(calendars, 'cal-inconnu', 'cal-commun')).toBe(false);
    expect(isExitingPerso(calendars, 'cal-perso', 'cal-inconnu')).toBe(false);
  });
});

describe('couleur catégorie (D-07)', () => {
  it('toCalendarEvent résout la couleur hex de la catégorie', () => {
    const event = toCalendarEvent(eventRow(), [], categories);
    expect(event.categoryColor).toBe('#3E7CB1');
    expect(event.categoryName).toBe('École');
  });

  it('sans catégorie, pas de couleur mais la couleur membre reste', () => {
    const event = toCalendarEvent(eventRow({ category_id: null }), [], categories);
    expect(event.categoryColor).toBeNull();
    expect(event.colorTag).toBe('accent');
  });

  it('buildDayMarkers porte la couleur catégorie et garde la couleur membre', () => {
    const event = toCalendarEvent(eventRow(), [], categories);
    const markers = buildDayMarkers(
      [{ iso: '2026-10-06' }],
      { events: [event], tasks: [], birthdays: [], holidays: [], vacations: [] },
      '2026-10-06',
    );
    expect(markers['2026-10-06'].categoryColor).toBe('#3E7CB1');
    expect(markers['2026-10-06'].colorTag).toBe('accent');
  });
});
