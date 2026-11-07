import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

/**
 * ============================================================================
 * Sonde de joignabilité (plan 35-07, gap G-35-4 — diagnostic dlnk02-android-
 * cold-start-offline.md, H1 confirmé on-device).  NOTE DE PÉRIMÈTRE :
 *
 *  (i)   Le couple Android réel est (navigator.onLine = true, réseau mort).
 *        En mode avion, Android 16 proclame `onLine = true` : `onlineManager`
 *        naît en ligne, croit au mensonge, et les requêtes partent vers un
 *        backend injoignable — « TypeError: Failed to fetch ». La sonde est
 *        la couche correctrice : seule une requête DE SONDE qui échoue a le
 *        droit de basculer `onlineManager` à false (D-11).
 *  (ii)  L'UPGRADE en ligne exige un succès OBSERVÉ de la sonde — c'est le
 *        seul site de `setOnline(true)` du module. Un événement `online` du
 *        navigateur ne prouve rien (TanStack re-bascule `onlineManager` à
 *        true tout seul sur cet événement : c'est exactement le trou D-11) ;
 *        il déclenche une re-sonde, et l'état repart false le temps de la
 *        preuve.
 *  (iii) PAS de `AbortSignal.timeout` (leçon W3 de 35-06) : ses minuteurs
 *        internes échappent à `vi.useFakeTimers`. Le délai est un
 *        AbortController manuel + `setTimeout` injectable via l'option
 *        `delai` de `demarrerSondeJoignabilite`.
 *  (iv)  Les événements `online`/`offline` sont dispatchés sur `window` à la
 *        main : le module s'y abonne lui-même, aucun vrai réseau n'est en
 *        jeu dans ce harnais.
 * ============================================================================
 */

/**
 * Configuration Supabase pilotée par test. Les autres valeurs du module réel
 * ne sont pas utilisées par la sonde : seuls `isSupabaseConfigured` et
 * `supabaseUrl` comptent.
 */
const configHolder = vi.hoisted(() => ({
  configured: true,
  url: 'https://stub-sonde.example.fr',
}));

vi.mock('@/lib/supabase/client', () => ({
  get isSupabaseConfigured() {
    return configHolder.configured;
  },
  get supabaseUrl() {
    return configHolder.url;
  },
}));

const { demarrerSondeJoignabilite, DELAI_SONDE_MS } = await import('./reachability');

/** Fetch factice remplaçable par test ; jamais résolu par défaut (réseau mort). */
const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  configHolder.configured = true;
  configHolder.url = 'https://stub-sonde.example.fr';
  fetchMock.mockImplementation(() => new Promise(() => {}));
  onlineManager.setOnline(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe('sonde de joignabilité', () => {
  it('T1. backend injoignable avec onLine=true (Android mode avion) → onlineManager bascule false', async () => {
    // H1 exact : le navigateur croit être en ligne, le réseau est mort.
    // Le fetch factice ne résout jamais → c'est le délai qui tranche.
    expect(onlineManager.isOnline()).toBe(true);

    const arreter = demarrerSondeJoignabilite();

    // La sonde démarre immédiatement au boot.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://stub-sonde.example.fr/auth/v1/health');
    // 35-09 (hypothèse résiduelle H-A' du diagnostic 35-07) : la preuve de
    // joignabilité ne peut JAMAIS venir du cache HTTP du navigateur.
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });

    // Avant l'échéance, l'état reste en ligne (pas de bascule prématurée).
    await vi.advanceTimersByTimeAsync(DELAI_SONDE_MS - 1);
    expect(onlineManager.isOnline()).toBe(true);

    // À l'échéance du délai : bascule offline — le chemin « cache + bandeau »
    // (repli foyer persisté de loadHousehold) doit pouvoir s'activer.
    await vi.advanceTimersByTimeAsync(1);
    expect(onlineManager.isOnline()).toBe(false);

    arreter();
  });

  it('T2. backend joignable → onlineManager reste true ; le succès est la seule preuve d’upgrade', async () => {
    // Réponse opaque acceptable (mode no-cors) : le contenu n'est jamais lu.
    fetchMock.mockResolvedValue(new Response());

    const arreter = demarrerSondeJoignabilite();

    await vi.advanceTimersByTimeAsync(0);
    expect(onlineManager.isOnline()).toBe(true);

    // Aucun downgrade induit par un succès : le mode avion se lève dès que le
    // backend répond, sans attendre un événement `online` du navigateur.
    arreter();
  });

  it('T3. événement `online` du navigateur avec backend mort → false après re-sonde (l’événement seul n’upgrade JAMAIS)', async () => {
    // Backend mort : la sonde initiale a déjà échoué, l'app est hors ligne.
    const arreter = demarrerSondeJoignabilite();
    await vi.advanceTimersByTimeAsync(DELAI_SONDE_MS);
    expect(onlineManager.isOnline()).toBe(false);

    // Le navigateur proclame la reconnexion (TanStack re-basculerait
    // `onlineManager` à true tout seul sur cet événement — le trou D-11).
    window.dispatchEvent(new Event('online'));

    // Tant que la preuve n'est pas faite, l'état ne remonte PAS en ligne.
    expect(onlineManager.isOnline()).toBe(false);

    // La re-sonde échoue (fetch toujours jamais résolu) → false confirmé.
    await vi.advanceTimersByTimeAsync(DELAI_SONDE_MS);
    expect(onlineManager.isOnline()).toBe(false);

    arreter();
  });

  it('T4. événement `offline` → bascule false IMMÉDIATE, sans sonde', () => {
    const arreter = demarrerSondeJoignabilite();
    expect(onlineManager.isOnline()).toBe(true);

    // Source fiable : seul le downgrade est permis sans preuve.
    window.dispatchEvent(new Event('offline'));

    expect(onlineManager.isOnline()).toBe(false);
    // Aucune sonde lancée pour un événement qui ne la demande pas.
    expect(fetchMock).toHaveBeenCalledTimes(1); // la sonde de boot seulement

    arreter();
  });

  it('T5. Supabase non configuré (mode démo) → no-op total : aucun fetch, aucune bascule', async () => {
    configHolder.configured = false;

    const arreter = demarrerSondeJoignabilite();

    // Ni sonde de boot, ni réaction aux événements réseau — en mode démo le
    // backend local n'existe pas (D-08), basculer offline serait un mensonge.
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    await vi.advanceTimersByTimeAsync(DELAI_SONDE_MS * 3);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onlineManager.isOnline()).toBe(true);

    // La fonction de nettoyage est inoffensive même en mode démo.
    expect(() => arreter()).not.toThrow();
  });
});
