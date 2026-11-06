import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/**
 * ============================================================================
 * Gardien d'amorçage (plan 35-06, gap G-35-3 — diagnostic dlnk02-android-
 * cold-start-offline.md).  NOTE DE PÉRIMÈTRE (§2.7 I — une absence affirmée
 * est une affirmation) :
 *
 *  (i)   Les tests W1 et W2 prouvent le chemin de la CHAÎNE D'AMORÇAGE
 *        uniquement (getSession → applySession → connectOfflineCache →
 *        setReady), pas le listener `onAuthStateChange`.
 *  (ii)  Le listener n'est PAS verrouillé par le témoin `reglee` : le
 *        verrouiller supprimerait son rattrapage légitime — un
 *        TOKEN_REFRESHED/SIGNED_IN pendant que l'app tourne doit pouvoir
 *        ré-appliquer une session fraîche, y compris après un amorçage déjà
 *        réglé (`reglee` vaut déjà true à ce moment).
 *  (iii) Post-gardien, un INITIAL_SESSION émis par la résolution tardive
 *        d'initializePromise peut rappeler `applySession` : le jeton qu'il
 *        porte est alors soit encore expiré (écran « connexion requise »
 *        D-07, correct), soit rafraîchi au retour du réseau (rattrapage
 *        légitime, correct). La couverture de ce chemin listener repose sur
 *        la RLS serveur (frontière d'autorisation réelle) et sur le
 *        comportement préexistant du listener, hors périmètre de ce plan —
 *        la garde `expires_at` ne vit que dans la chaîne d'amorçage, pas
 *        dans le listener, et c'est VOLONTAIRE.
 *  (iv)  Ce que l'e2e Playwright NE POURRA JAMAIS prouver (angle mort
 *        nommé, plan 35-06 Task 3) : le webServer e2e build sans
 *        VITE_SUPABASE_URL (chemin démo), et `context.setOffline(true)`
 *        force `navigator.onLine = false` de façon déterministe — or le
 *        défaut Android réel est le couple (onLine=true, réseau mort).
 *        W1 comble cet angle mort à la couche fetch : il exerce le VRAI
 *        GoTrueClient (initializePromise, _recoverAndRefresh) contre un
 *        vrai fetch bloqué, avec `navigator.onLine === true` (l'état jsdom
 *        par défaut, exactement l'état Android en mode avion, hypothèse H1).
 * ============================================================================
 */

/**
 * Client réel ou factice, choisi par test. Le mock du module client expose un
 * getter : les imports nommés de `use-auth` sont relus à chaque usage, donc
 * chaque test branche le client qu'il veut avant `renderHook`.
 */
const clientHolder = vi.hoisted(() => ({ current: null as SupabaseClient | null | Record<string, unknown> }));
const listMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/client', () => ({
  get supabase() {
    return clientHolder.current;
  },
  isSupabaseConfigured: true,
  supabaseUrl: 'https://stub-gardien.example.fr',
  supabasePublishableKey: 'sb_publishable_test',
  supabaseFunctionsBase: 'https://stub-gardien.example.fr/functions/v1',
}));

vi.mock('@/lib/data', () => ({
  data: {
    get list() {
      return listMock;
    },
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const { useAuthBootstrap, DELAI_GARDIEN_AMORCAGE_MS } = await import('../use-auth');
const { useSessionStore } = await import('@/stores/session-store');
const { useHouseholdStore } = await import('@/stores/household-store');

/** Clé de stockage GoTrue dérivée de l'hôte (sb-<ref>-auth-token). */
const STORAGE_KEY = 'sb-stub-gardien-auth-token';

const user: User = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'bob@example.fr',
  app_metadata: { provider: 'email' },
  user_metadata: { full_name: 'Bob Martin' },
} as unknown as User;

/** Client SUPABASE RÉEL : c'est lui qui porte le hang de GoTrue (H2). */
function clientReel(): SupabaseClient {
  return createClient('https://stub-gardien.example.fr', 'sb_publishable_test', {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

/** Client factice : getSession et le listener pilotés à la main. */
function clientFactice(getSessionImpl: () => Promise<unknown>) {
  return {
    auth: {
      getSession: vi.fn(getSessionImpl),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };
}

/**
 * Sème une session GoTrue EXPIRÉE dans le localStorage du client réel :
 * `_recoverAndRefresh` la voit expirée et tente un rafraîchissement réseau —
 * ici bloqué pour toujours par le fetch stub.
 */
function semerSessionExpiree() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: 'jeton-expire',
      refresh_token: 'jeton-rafraichissement',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 100,
      user,
    }),
  );
}

describe('useAuthBootstrap — gardien d’amorçage 10 s (35-06, G-35-3)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Pré-chauffe du module routeur : la chaîne d'amorçage le charge
    // dynamiquement (`connectOfflineCache`, purge de la chemin invité). Son
    // PREMIER chargement traverse des allers-retours d'I/O de chargement de
    // modules hors microtasks — pré-chargé ici, l'import se résout en
    // microtask et les suites de la chaîne s'exécutent pendant l'act du test
    // (artefact de harnais, pas du code sous test).
    await import('@/app/router');
    listMock.mockReset();
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
    useHouseholdStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(STORAGE_KEY);
    clientHolder.current = null;
    onlineManager.setOnline(true);
    useHouseholdStore.getState().reset();
    vi.restoreAllMocks();
  });

  it('W1 : fetch réel supabase-js qui hang + onLine=true → chemin invité à 10 s, jamais authentifiée', async () => {
    // navigator.onLine vaut true dans jsdom : exactement l'état Android en
    // mode avion (H1) — la source trompeuse que le gardien ne doit PAS lire.
    expect(navigator.onLine).toBe(true);
    semerSessionExpiree();
    // Le fetch ne répond JAMAIS : `_recoverAndRefresh` → `_refreshAccessToken`
    // reste en vol, `initializePromise` ne se termine pas, `getSession` hang.
    const fetchQuiHang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchQuiHang);
    clientHolder.current = clientReel();

    const { result } = renderHook(() => useAuthBootstrap());

    // Avant l'échéance : le spinner est toujours là (c'est le défaut Android).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS - 100);
    });
    expect(result.current.ready).toBe(false);

    // À l'échéance : le gardien coupe, purge et monte le routeur.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).not.toBe('authenticated');
  });

  it('W2 : session valide + chaîne aval qui hang → à 12 s la résolution TARDIVE ne ré-applique pas la session', async () => {
    // Client factice ici : le listener réel émettrait un INITIAL_SESSION de
    // rattrapage légitime (comportement documenté en tête de fichier, hors
    // garde reglee) qui noierait l'assertion sur la CHAÎNE. Le client factice
    // isole la chaîne : c'est elle qui est sous test.
    clientHolder.current = clientFactice(() =>
      Promise.resolve({ data: { session: { user, expires_at: Date.now() / 1000 + 3600 } } }),
    );
    // data.list ne se résout jamais toute seule : la chaîne pend dans
    // applySession (lecture profil) quand le gardien échoit.
    const resolvers: Array<(rows: unknown[]) => void> = [];
    listMock.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));

    const { result } = renderHook(() => useAuthBootstrap());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS);
    });
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().user).toBeNull();

    // La chaîne résout TARDIVEMENT (12 s) : applySession se termine, pose
    // l'utilisateur… puis la garde reglee de la chaîne purge : la session
    // n'est JAMAIS ré-appliquée après le chemin invité.
    resolvers.splice(0).forEach((resolve) => resolve([]));
    // Les lectures suivantes de la même chaîne résoluent immédiatement :
    // seule la PREMIÈRE attend la résolution tardive.
    listMock.mockResolvedValue([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS);
    });
    await Promise.resolve();

    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).not.toBe('authenticated');
    expect(useSessionStore.getState().householdLoaded).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it('W3 : bootstrap rapide — le gardien n’interfère pas et n’échoit pas après coup', async () => {
    clientHolder.current = clientFactice(() =>
      Promise.resolve({ data: { session: { user, expires_at: Date.now() / 1000 + 3600 } } }),
    );
    listMock.mockResolvedValue([]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useAuthBootstrap());

    // La chaîne résout bien avant l'échéance : prêt, authentifié, sans erreur.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeNull();
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().householdLoaded).toBe(true);

    // On pousse l'horloge bien au-delà de l'échéance : AUCUN déclenchement
    // tardif (le minuterie est annulée), aucune journalisation de gardien.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS * 2);
    });
    const warnGardien = warn.mock.calls.filter((call) => String(call[0]).includes('gardien'));
    expect(warnGardien, 'aucun déclenchement tardif du gardien après un amorçage réussi').toEqual([]);
    expect(useSessionStore.getState().status).toBe('authenticated');
  });

  it('W4 : l’échéance du gardien est journalisée (jamais un succès muet)', async () => {
    // getSession ne se termine JAMAIS : le gardien est le seul chemin de
    // rétablissement — il doit dire pourquoi (§2.7 F).
    clientHolder.current = clientFactice(() => new Promise(() => {}));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useAuthBootstrap());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS + 100);
    });

    expect(result.current.ready).toBe(true);
    const warnGardien = warn.mock.calls.filter((call) => String(call[0]).includes('gardien'));
    expect(warnGardien.length).toBeGreaterThan(0);
    expect(String(warnGardien[0][0])).toContain('chemin invité');
  });
});
