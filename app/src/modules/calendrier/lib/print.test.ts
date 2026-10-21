import { describe, expect, it } from 'vitest';
import { toCalendarPrintModel } from './print';
import type { AgendaItem } from '../types';

/**
 * Les éléments sont fabriqués à la main : ce qui se vérifie ici est la mise en
 * forme de la feuille (jours vides écartés, libellé capitalisé, sous-titre
 * conservé), pas la construction de l'agenda — `buildAgenda` a ses propres
 * tests.
 */
const entry = (over: Partial<AgendaItem> & { key: string; time: string; title: string }): AgendaItem =>
  ({ subtitle: null, ...over }) as unknown as AgendaItem;

describe('toCalendarPrintModel', () => {
  it('écarte les jours vides et garde l’ordre de la période', () => {
    const model = toCalendarPrintModel('Octobre 2026', 'Foyer Martin · 2 éléments', [
      { iso: '2026-10-21', items: [entry({ key: 'a', time: '10:00', title: 'Courses du samedi' })] },
      { iso: '2026-10-22', items: [] },
      { iso: '2026-10-23', items: [entry({ key: 'b', time: 'Toute la journée', title: 'Réunion de rentrée' })] },
    ]);

    expect(model.days.map((day) => day.iso)).toEqual(['2026-10-21', '2026-10-23']);
    expect(model.title).toBe('Octobre 2026');
    expect(model.meta).toBe('Foyer Martin · 2 éléments');
  });

  it('capitalise le libellé du jour et conserve le sous-titre', () => {
    // `formatLongDate` rend « mercredi 21 octobre 2026 » : la feuille titre en
    // majuscule, comme les en-têtes d’agenda de l’écran.
    const model = toCalendarPrintModel('Semaine du 19/10', 'Foyer Martin · 1 élément', [
      {
        iso: '2026-10-21',
        items: [entry({ key: 'a', time: '10:00', title: 'Courses du samedi', subtitle: 'Marché de proximité' })],
      },
    ]);

    expect(model.days[0].label).toBe('Mercredi 21 octobre 2026');
    expect(model.days[0].items[0]).toEqual({
      key: 'a',
      time: '10:00',
      title: 'Courses du samedi',
      subtitle: 'Marché de proximité',
    });
  });

  it('rend une feuille sans jour quand la période est vide', () => {
    const model = toCalendarPrintModel('Jour', 'Foyer Martin · 0 élément', [{ iso: '2026-10-21', items: [] }]);
    expect(model.days).toEqual([]);
  });
});
