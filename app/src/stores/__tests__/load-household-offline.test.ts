import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import type { HouseholdMemberRow, HouseholdRow, RowFilter } from '@/types';
import { SupabaseAdapter } from '@/lib/data/supabase-adapter';

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
 *
 * Plan 35-06 (couche 2, gap G-35-3) — test X3 : quand la lecture NE SE
 * RÉSOUT NI NE REJETTE (fetch qui hang), le repli ci-dessus était inatteignable
 * — le catch ne traverse jamais un hang. Le test prouve le chemin BOUT-EN-BOUT
 * avec le VRAI adaptateur Supabase (abandon manuel AbortController + délai
 * injecté) derrière le mock de `@/lib/data` : le hang devient un rejet rapide
 * (DataError « Délai de lecture dépassé ») et le repli foyer persisté
 * s'applique. PÉRIMÈTRE : ce cas prouve la couche 2 LORSQUE onLine=false
 * uniquement ; sous H1 (onLine=true en mode avion), le repli de loadHousehold
 * relance volontairement et le gardien de bootstrap (Task 1) est le SEUL
 * rétablissement — un cas onLine=true ici serait rouge par conception et
 * n'est PAS ajouté.
 */

const listMock = vi.fn(async () => [] as unknown[]);
vi.mock('@/lib/data', () => ({ data: { list: listMock, create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

/** Bascule du client factice en « fetch qui hang » (voir builderPendant). */
let lecturePendante = false;

/** Constructeur dont la promesse ne se termine jamais, sauf abandon du signal. */
function builderPendant() {
  let rejeter!: (cause: unknown) => void;
  const promesse = new Promise((_resoudre, rej) => {
    rejeter = rej;
  });
  // `retour` est la promesse HYBRIDE (thenable + chaînable), comme
  // PostgrestBuilder — renvoyer le simple objet `builder` casserait le
  // thenable et l'await résoudrait à vide.
  const builder: Record<string, unknown> = {
    select: () => retour,
    eq: () => retour,
    is: () => retour,
    in: () => retour,
    abortSignal: (signal: AbortSignal) => {
      signal.addEventListener('abort', () => rejeter(signal.reason ?? new Error('Abandonné')));
      return retour;
    },
  };
  const retour = Object.assign(promesse, builder);
  return retour;
}

/** Constructeur chaînable qui résout une réponse vide (cas non pendant). */
function builderResolvant() {
  const builder: Record<string, unknown> = {
    select: () => retour,
    eq: () => retour,
    is: () => retour,
    in: () => retour,
    abortSignal: () => retour,
  };
  const retour = Object.assign(Promise.resolve({ data: [], error: null }), builder);
  return retour;
}

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => (lecturePendante ? builderPendant() : builderResolvant()),
  },
}));

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
    SupabaseAdapter.reinitialiserDelaiLecture();
    vi.useRealTimers();
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

  it('X3 : lecture qui HANG + foyer persisté hors-ligne → résout sur le foyer persisté (rejet rapide par abandon, plan 35-06)', async () => {
    semerFoyerPersiste();
    onlineManager.setOnline(false);
    vi.useFakeTimers();
    SupabaseAdapter.setDelaiLecturePourTest(50);
    // Le VRAI adaptateur derrière le mock : c'est SON abandon (AbortController
    // + délai injecté) qui convertit le hang en rejet — chemin bout-en-bout.
    const adaptateurReel = new SupabaseAdapter();
    listMock.mockImplementation(
      ((table: string, filter?: RowFilter) => adaptateurReel.list(table, filter)) as unknown as typeof listMock,
    );
    lecturePendante = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const promesse = loadHousehold();
      // Le hang est converti en rejet au passage de l'horloge factice.
      await vi.advanceTimersByTimeAsync(50);
      const actif = await promesse;
      expect(actif?.id).toBe('h1');
      expect(useSessionStore.getState().householdLoaded).toBe(true);
      expect(useHouseholdStore.getState().householdId).toBe('h1');
      // §2.7 F — la revalidation reportée est dite, avec la cause nommée.
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
