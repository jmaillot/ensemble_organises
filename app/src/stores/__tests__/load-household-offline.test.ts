import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';

/**
 * Repli hors-ligne de `loadHousehold` (plan 35-04, gap §1.4 de
 * 35-VERIFICATION.md) : au cold-start hors-ligne avec une session valide et un
 * foyer déjà persisté, le rejet des lectures réseau remonterait jusqu'au
 * bootstrap et afficherait l'écran d'erreur WR-04 au lieu du routeur. Le
 * contrat demandé :
 *
 *  - hors-ligne + foyer persisté (restauré synchro par le persist zustand) →
 *    la lecture RÉSOUT sur le foyer persisté, revalidation reportée au retour
 *    du réseau (même régime de confiance que le cache offline de lecture,
 *    phase 33) ;
 *  - hors-ligne SANS foyer persisté → le rejet se propage (pas de foyer
 *    inventé) ;
 *  - EN LIGNE + backend en échec → le rejet se propage même avec un foyer
 *    persisté : WR-04 « Votre foyer n'a pas pu être chargé » + Réessayer reste
 *    l'écran des vraies pannes, la tolérance ne le masque pas.
 */

const listMock = vi.fn(async () => [] as unknown[]);
vi.mock('@/lib/data', () => ({ data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

const { loadHousehold, useSessionStore } = await import('../session-store');
const { useHouseholdStore } = await import('../household-store');

const members = [
  { id: 'm1', household_id: 'h1', user_id: 'u1', display_name: 'Alice', role: 'admin' },
] as HouseholdMemberRow[];
const household = { id: 'h1', name: 'Foyer Martin', avatar_color: 'accent' } as HouseholdRow;

/** Sème le foyer persisté — l'état restauré par le persist zustand au démarrage. */
function semerFoyerPersiste() {
  useHouseholdStore.getState().setHousehold(household, members);
}

describe('loadHousehold — repli hors-ligne (35-04)', () => {
  beforeEach(() => {
    listMock.mockClear();
    listMock.mockImplementation(async () => [] as unknown[]);
    useHouseholdStore.getState().reset();
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
  });

  afterEach(() => {
    // Les autres suites supposent l'état réseau par défaut : on rend l'état
    // amorcé (`navigator.onLine` en vrai, `true` par défaut dans le manager).
    onlineManager.setOnline(true);
    useHouseholdStore.getState().reset();
  });

  it('résout sur le foyer persisté hors-ligne, sans changer le store (test A)', async () => {
    semerFoyerPersiste();
    onlineManager.setOnline(false);
    listMock.mockRejectedValue(new TypeError('Échec de la requête réseau'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      // Avant le correctif : rejet → écran WR-04 au bootstrap. Après : résout.
      const actif = await loadHousehold();
      expect(actif?.id).toBe('h1');
      expect(useSessionStore.getState().householdLoaded).toBe(true);
      // Le foyer persisté reste LA source : la lecture en échec ne l'écrase pas.
      expect(useHouseholdStore.getState().householdId).toBe('h1');
      expect(useHouseholdStore.getState().members).toHaveLength(1);
      // §2.7 F — jamais un succès muet : la revalidation reportée est dite.
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('rejette hors-ligne sans foyer persisté (test B)', async () => {
    onlineManager.setOnline(false);
    listMock.mockRejectedValue(new TypeError('Échec de la requête réseau'));

    await expect(loadHousehold()).rejects.toThrow('Échec de la requête réseau');
    expect(useSessionStore.getState().householdLoaded).toBe(false);
  });

  it('rejette en ligne même avec un foyer persisté — WR-04 préservé (test C)', async () => {
    semerFoyerPersiste();
    onlineManager.setOnline(true);
    listMock.mockRejectedValue(new TypeError('Échec de la requête réseau'));

    await expect(loadHousehold()).rejects.toThrow('Échec de la requête réseau');
    expect(useSessionStore.getState().householdLoaded).toBe(false);
  });
});
