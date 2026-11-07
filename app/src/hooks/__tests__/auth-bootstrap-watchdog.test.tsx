import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { HouseholdMemberRow, HouseholdRow } from '@/types';

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
 *  (v)   Plan 35-08 (gap G-35-5) — extension des points (ii)/(iii) au NOUVEAU
 *        chemin hors-ligne (`cheminHorsLigneValide`) : quand le gardien
 *        établit un état authentifié-hors-ligne depuis le cache de session,
 *        la résolution tardive de la chaîne ne ré-applique NI ne purge cet
 *        état (contrat reglee redérivé — le rappel consulte le store avant
 *        de décider, V5). Le listener reste hors garde reglee, inchangé.
 *  (vi)  Ce que l'e2e Playwright NE POURRA JAMAIS prouver (angle mort
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

/**
 * Sème une session GoTrue VALIDE dans le localStorage — même forme JSON que
 * `semerSessionExpiree`, mais `expires_at` dans le futur. Par défaut à une
 * heure ; V1 passe une valeur courte (voir la note dans le cas V1).
 */
function semerSessionValide(secondesAvantExpiration = 3600) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      access_token: 'jeton-valide',
      refresh_token: 'jeton-rafraichissement',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + secondesAvantExpiration,
      user,
    }),
  );
}

/** Foyer persisté dans household-store : la matière du repli 35-04 hors-ligne. */
function semerFoyerPersiste() {
  useHouseholdStore.getState().setHousehold(
    { id: 'h-gardien', name: 'Foyer Gardien', avatar_color: 'accent', disabled_modules: [] } as HouseholdRow,
    [
      {
        id: 'm-1',
        household_id: 'h-gardien',
        user_id: user.id,
        display_name: 'Bob Martin',
        role: 'admin',
        deleted_at: null,
      } as HouseholdMemberRow,
    ],
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
    localStorage.removeItem(`${STORAGE_KEY}.0`);
    localStorage.removeItem(`${STORAGE_KEY}.1`);
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

  // =========================================================================
  // Plan 35-08 (gap G-35-5) : le chemin hors-ligne spécifié par ses tests.
  // Une session VALIDE persistée ne doit JAMAIS être purgée par le gardien ni
  // par un rejet hors-ligne ; une session expirée/absente/illisible garde le
  // comportement T-35-06 exact (purge → écran D-07).
  // =========================================================================

  it('V1 : session valide + fetch réel qui hang (défaut Android) → chemin authentifié hors-ligne, session non purgée', async () => {
    // +80 s : la fenêtre (60 s, 90 s) — au-delà de la marge de validité de
    // session-cache (60 s) mais dans la marge de rafraîchissement de
    // supabase-js (EXPIRY_MARGIN_MS = 90 s). C'est ce qui fait pendre
    // `_recoverAndRefresh` sur le fetch mort (H2 — le défaut Android exact)
    // tout en restant une session VALIDE pour le helper. Avec +3600 s, le
    // client réel n'essayerait jamais de rafraîchir et getSession résoudrait
    // sans réseau : le test passerait par la chaîne normale, pas par le
    // gardien, et ne prouverait rien.
    semerSessionValide(80);
    semerFoyerPersiste();
    // Le fetch ne répond JAMAIS : `_refreshAccessToken` reste en vol,
    // `initializePromise` ne se termine pas, `getSession` hang (H2).
    const fetchQuiHang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchQuiHang);
    clientHolder.current = clientReel();
    // Les lectures réseau rejettent : le repli 35-04 de `loadHousehold` rend
    // le foyer persisté (il exige `!isOnline()`, posé ci-dessous).
    listMock.mockRejectedValue(new Error('réseau indisponible (test)'));

    const { result } = renderHook(() => useAuthBootstrap());

    // Précondition explicite : la sonde 35-07 a dit « hors-ligne » AVANT
    // l'avance d'horloge — sinon le repli 35-04 ne tire jamais et `signIn`
    // rejetterait (session-store :178).
    onlineManager.setOnline(false);

    // Avant l'échéance : le spinner est toujours là (c'est le défaut Android).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS - 100);
    });
    expect(result.current.ready).toBe(false);

    // À l'échéance : le gardien consulte la session persistée — valide — et
    // établit l'état authentifié depuis le cache, sans réseau.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.id).toBe(user.id);
    expect(useSessionStore.getState().householdLoaded).toBe(true);
    expect(useHouseholdStore.getState().householdId).toBe('h-gardien');
    // L'INVARIANT du gap : la session valide n'a pas été purgée du stockage.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('V2 : session EXPIRÉE + hang → purge T-35-06 inchangée', async () => {
    semerSessionExpiree();
    const fetchQuiHang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchQuiHang);
    clientHolder.current = clientReel();

    const { result } = renderHook(() => useAuthBootstrap());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS + 100);
    });

    // Le signOut GoTrue en mode hang ne peut pas contacter le serveur : on
    // vérifie l'état du store et l'absence de statut authentifié, pas la
    // présence littérale de la clé (même convention que W1).
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).not.toBe('authenticated');
  });

  it('V3 : stockage vide + hang → purge comme aujourd’hui (D-07 sans-session inchangé)', async () => {
    const fetchQuiHang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchQuiHang);
    clientHolder.current = clientReel();

    const { result } = renderHook(() => useAuthBootstrap());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Sans session persistée, la chaîne résout vite (session absente) : le
    // chemin D-07 sans-session purge les deux stores, inchangé par 35-08.
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().user).toBeNull();
    expect(useSessionStore.getState().status).not.toBe('authenticated');
  });

  it('V4 : rejet rapide de getSession hors-ligne + session valide persistée → même chemin hors-ligne, pas de purge (Desktop)', async () => {
    semerSessionValide();
    semerFoyerPersiste();
    listMock.mockRejectedValue(new Error('réseau indisponible (test)'));
    clientHolder.current = clientFactice(() =>
      Promise.reject(new Error('rejet réseau immédiat (test)')),
    );
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useAuthBootstrap());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    // Site :catch de la chaîne (rejet hors-ligne) : même helper, session
    // persistée valide → authentifié, jamais purgée.
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.id).toBe(user.id);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('V5 : la course RÉELLE — la complétion TARDIVE de la chaîne ne purge pas l’état authentifié-hors-ligne tout juste établi', async () => {
    semerSessionValide();
    const ligneMembre = {
      id: 'm-1',
      household_id: 'h-gardien',
      user_id: user.id,
      display_name: 'Bob Martin',
      role: 'admin',
      deleted_at: null,
    } as HouseholdMemberRow;
    const ligneFoyer = { id: 'h-gardien', name: 'Foyer Gardien', avatar_color: 'accent' } as HouseholdRow;
    // getSession résout JUSTE AVANT l'échéance : la chaîne réelle s'engage et
    // `applySession` se parque sur la lecture profil (pendante). La lecture
    // foyer, elle, résout tout de suite — le signIn (chemin hors-ligne comme
    // complétion tardive) est idempotent sur la même identité semée.
    let resoudreProfils: () => void = () => {};
    listMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return new Promise<void>((resolve) => {
          resoudreProfils = () => resolve([]);
        });
      }
      if (table === 'household_members') return Promise.resolve([ligneMembre]);
      if (table === 'households') return Promise.resolve([ligneFoyer]);
      return Promise.resolve([]);
    });
    clientHolder.current = clientFactice(() =>
      Promise.resolve({ data: { session: { user, expires_at: Date.now() / 1000 + 3600 } } }),
    );

    const { result } = renderHook(() => useAuthBootstrap());

    // Le gardien échoit pendant que `applySession` est en vol : le chemin
    // hors-ligne pose l'état authentifié depuis le cache.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS);
    });
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.id).toBe(user.id);

    // `listMock` résout : la chaîne d'origine atteint le rappel « reglee ».
    // Avec l'ancien contrat (purge inconditionnelle), il détruirait l'état
    // hors-ligne tout juste établi ; le nouveau contrat en fait un NO-OP.
    await act(async () => {
      resoudreProfils();
      await Promise.resolve();
    });

    // Aucune ré-application n'a eu lieu (même identité), surtout aucune purge.
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.id).toBe(user.id);
    expect(useSessionStore.getState().householdLoaded).toBe(true);
    expect(useHouseholdStore.getState().householdId).toBe('h-gardien');
    expect(result.current.ready).toBe(true);
  });

  it('V6 : session CHUNKÉE (format supabase-js v2, fragments .0/.1 sans clé de base) → réassemblée, chemin hors-ligne, pas de purge', async () => {
    // Le payload dépasse la garde de taille de localStorage : supabase-js
    // fragmente en `.0`, `.1`… et RETIRE la clé de base — le cas le plus
    // probable pour les sessions Google OAuth volumineuses. Le helper doit
    // réassembler les fragments dans l'ordre avant de parser.
    const payload = JSON.stringify({
      access_token: 'jeton-valide',
      refresh_token: 'jeton-rafraichissement',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    });
    const moitie = Math.ceil(payload.length / 2);
    localStorage.setItem(`${STORAGE_KEY}.0`, payload.slice(0, moitie));
    localStorage.setItem(`${STORAGE_KEY}.1`, payload.slice(moitie));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    semerFoyerPersiste();
    listMock.mockRejectedValue(new Error('réseau indisponible (test)'));
    // getSession hang (H2) : le gardien est le seul chemin de rétablissement.
    clientHolder.current = clientFactice(() => new Promise(() => {}));
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useAuthBootstrap());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DELAI_GARDIEN_AMORCAGE_MS + 100);
    });

    // Sans réassemblage, le parse de la clé de base rend null → purge —
    // exactement le rouge attendu avant l'implémentation.
    expect(result.current.ready).toBe(true);
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.id).toBe(user.id);
    expect(localStorage.getItem(`${STORAGE_KEY}.0`)).not.toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEY}.1`)).not.toBeNull();
  });
});
