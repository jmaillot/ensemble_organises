import { describe, expect, it } from 'vitest';
import { formatNextEventDay, formatNextEventWhen, nextUpcomingEvent } from './types';
import type { EventRow } from '@/types';

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
  category_id: null,
  calendar_id: 'cal',
  created_by: null,
  created_at: '2026-09-30T10:00:00.000Z',
  ...overrides,
});

/** Midi pile, pour figer « maintenant » sans ambiguïté de fuseau. */
const NOW = new Date(2026, 8, 30, 12, 0, 0);

describe('nextUpcomingEvent', () => {
  it("retourne l'événement du jour pas encore commencé", () => {
    const rows = [
      event({ id: 'passe', title: 'Passé', start_at: '2026-09-30T08:00:00', end_at: '2026-09-30T09:00:00' }),
      event({ id: 'soir', title: 'Soir', start_at: '2026-09-30T19:30:00', end_at: '2026-09-30T20:15:00' }),
    ];
    expect(nextUpcomingEvent(rows, NOW)?.id).toBe('soir');
  });

  it("voit les événements des jours suivants quand il ne reste rien aujourd'hui", () => {
    const rows = [
      event({ id: 'passe', title: 'Passé', start_at: '2026-09-30T08:00:00', end_at: '2026-09-30T09:00:00' }),
      event({ id: 'loin', title: 'Loin', start_at: '2026-10-04T18:30:00', end_at: '2026-10-04T19:30:00' }),
      event({ id: 'proche', title: 'Proche', start_at: '2026-10-02T10:00:00', end_at: '2026-10-02T11:00:00' }),
    ];
    expect(nextUpcomingEvent(rows, NOW)?.id).toBe('proche');
  });

  it('garde un événement en cours et la journée entière du jour', () => {
    const ongoing = event({ id: 'cours', start_at: '2026-09-30T11:00:00', end_at: '2026-09-30T13:00:00' });
    expect(nextUpcomingEvent([ongoing], NOW)?.id).toBe('cours');
    const allDay = event({ id: 'journee', start_at: '2026-09-30T00:00:00', end_at: null, all_day: true });
    expect(nextUpcomingEvent([allDay], NOW)?.id).toBe('journee');
  });

  it('retourne null sans rien à venir', () => {
    expect(nextUpcomingEvent([], NOW)).toBeNull();
    const rows = [
      event({ start_at: '2026-09-30T08:00:00', end_at: '2026-09-30T09:00:00' }),
      event({ start_at: '2026-09-29T00:00:00', end_at: null, all_day: true }),
    ];
    expect(nextUpcomingEvent(rows, NOW)).toBeNull();
  });
});

describe('formatNextEventWhen', () => {
  it("formule aujourd'hui, demain et les jours suivants", () => {
    expect(formatNextEventWhen(event({ start_at: '2026-09-30T19:30:00' }), NOW)).toBe("aujourd'hui à 19:30");
    expect(formatNextEventWhen(event({ start_at: '2026-10-01T18:30:00' }), NOW)).toBe('demain à 18:30');
    expect(formatNextEventWhen(event({ start_at: '2026-10-04T18:30:00' }), NOW)).toMatch(/^dim\. 4 oct\. à 18:30$/);
  });

  it('formule la journée entière et les événements en cours', () => {
    expect(formatNextEventWhen(event({ start_at: '2026-09-30T00:00:00', all_day: true }), NOW)).toBe(
      "aujourd'hui, toute la journée",
    );
    expect(
      formatNextEventWhen(event({ start_at: '2026-09-30T11:00:00', end_at: '2026-09-30T13:00:00' }), NOW),
    ).toBe("en cours jusqu'à 13:00");
  });
});

describe('formatNextEventDay', () => {
  it('ne suffixe que les jours suivants', () => {
    expect(formatNextEventDay(event({ start_at: '2026-09-30T19:30:00' }), NOW)).toBeNull();
    expect(formatNextEventDay(event({ start_at: '2026-10-01T18:30:00' }), NOW)).toBe('demain');
    expect(formatNextEventDay(event({ start_at: '2026-10-04T18:30:00' }), NOW)).toMatch(/^dim\. 4 oct\.$/);
  });
});
