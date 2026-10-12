import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAB_STATE,
  TRIP_TABS,
  parseTabState,
  tabStateFromEnabled,
  toTrip,
  visibleTripTabs,
} from './types';
import { tripInviteLink, tripTicketStorageKey } from './api';
import type { TripRow } from '@/types';

const baseRow = {
  id: 'trip-1',
  household_id: 'household-martin',
  name: 'Week-end à Lisbonne',
  destination: 'Lisbonne',
  start_date: '2027-04-12',
  end_date: '2027-04-18',
  cover_photo: '/assets/lisbonne.jpg',
  notes: null,
  created_at: '2026-10-12T10:00:00.000Z',
};

describe('trip tabs — modèle d’onglets (phase 15, D-05)', () => {
  it('la fiche compte sept onglets dans l’ordre du parcours', () => {
    expect(TRIP_TABS.map((tab) => tab.key)).toEqual([
      'infos',
      'courses',
      'notes',
      'taches',
      'adresses',
      'budget',
      'parametres',
    ]);
  });

  it('parseTabState : lignes héritées sans colonne → tout affiché', () => {
    expect(parseTabState(null)).toEqual(DEFAULT_TAB_STATE);
    expect(parseTabState(undefined)).toEqual(DEFAULT_TAB_STATE);
  });

  it('parseTabState : clés inconnues ignorées, infos/parametres structurels', () => {
    expect(parseTabState({ courses: false, inconnue: true, infos: false })).toEqual({
      ...DEFAULT_TAB_STATE,
      courses: false,
    });
  });

  it('tabStateFromEnabled : seuls les cochés restent, structurels forcés', () => {
    expect(tabStateFromEnabled([])).toEqual({
      infos: true,
      courses: false,
      notes: false,
      taches: false,
      adresses: false,
      budget: false,
      parametres: true,
    });
    expect(tabStateFromEnabled(['courses', 'budget'])).toEqual({
      infos: true,
      courses: true,
      notes: false,
      taches: false,
      adresses: false,
      budget: true,
      parametres: true,
    });
  });

  it('visibleTripTabs : les onglets désactivés sont masqués, jamais supprimés', () => {
    const visible = visibleTripTabs({ ...DEFAULT_TAB_STATE, notes: false, budget: false });
    expect(visible.map((tab) => tab.key)).toEqual(['infos', 'courses', 'taches', 'adresses', 'parametres']);
    expect(visible).toHaveLength(5);
  });

  it('toTrip lit les colonnes serveur (créateur, onglets, fermeture)', () => {
    const trip = toTrip({
      ...baseRow,
      created_by: 'member-camille',
      tab_state: { courses: false },
      is_closed: true,
    } as unknown as TripRow);
    expect(trip.createdBy).toBe('member-camille');
    expect(trip.tabState.courses).toBe(false);
    expect(trip.tabState.notes).toBe(true);
    expect(trip.closed).toBe(true);
  });

  it('toTrip : ligne héritée sans colonnes → créateur nul, tout ouvert, non figé', () => {
    const trip = toTrip(baseRow as unknown as TripRow);
    expect(trip.createdBy).toBeNull();
    expect(trip.tabState).toEqual(DEFAULT_TAB_STATE);
    expect(trip.closed).toBe(false);
  });
});

describe('trip share — liens et tickets (phase 15, D-09)', () => {
  it('tripInviteLink mène à la page invitée voyage avec le code encodé', () => {
    expect(tripInviteLink('abcDEF123')).toBe('/invitation/voyage?code=abcDEF123');
  });

  it('le ticket est namespacé par voyage (jamais de clé globale)', () => {
    expect(tripTicketStorageKey('trip-1')).toBe('eo:trip:ticket:trip-1');
    expect(tripTicketStorageKey('trip-1')).not.toBe(tripTicketStorageKey('trip-2'));
  });
});
