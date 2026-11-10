// Estampille de build dans le panneau Paramètres (D-02 et D-03).
//
// Pourquoi chaque cas :
// - Repli `unknown` (D-02) : hors pipeline estampillé, rien n'injecte
//   `VITE_APP_VERSION`. Afficher `0.1.0` — le semver du `package.json` —
//   serait une version fausse avec assurance : un build local diffère déjà de
//   l'image servie (`.dockerignore` exclut les tests et `docs`, Tailwind émet
//   moins de classes). Le test refuse donc toute occurrence de `0.1.0`.
// - Forme courte + titre (D-03) : 8 caractères pour l'humain à l'écran, le
//   SHA complet (40) en `title` pour une comparaison exacte avec
//   `git rev-parse HEAD` sur le clone de production.
// - Valeur courte (`abc`) : `slice(0, 8)` doit la laisser intacte — aucun cas
//   spécial à gérer.
// - `unknown` stubbé explicitement (7 caractères < 8) : s'affiche en entier
//   avec `title` égal à la valeur — le panneau ne prétend jamais à un SHA
//   qu'il n'a pas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { createStore, del, set } from 'idb-keyval';
import { renderWithProviders, createTestQueryClient } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';
import { cacheKey, connectOfflineCache, persistNow, purgeCache, stopPersisting } from '@/lib/offline/query-persistence';
import { outboxKeyFor } from '@/lib/offline/outbox';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { OfflinePanel } from './offline-panel';

const SHA_40 = '42b76a163b845c6f29c196ea3852172063583fb1';
// D-11 : sans estampille, le libellé écran est une déclaration honnête —
// « Version de développement » — jamais `unknown` brut ni `0.1.0`. Les DEUX
// points d'affichage sont couverts (ligne « Version » du panneau Données et
// pied du panneau « Application web »), chacun avec une explication au survol.
const LIBELLE_REPLI = 'Version de développement';

// La constante de version est calculée au chargement du module : un stub
// après un import classique ne changerait rien au module déjà mémoïsé.
// D'où `vi.stubEnv` + `vi.resetModules()` + import dynamique. Le helper de
// rendu est réimporté APRÈS le reset au même titre que le panneau : le reset
// régénère aussi `@/components/ui/toast`, et un `ToastProvider` de l'ancienne
// instance ne satisferait pas le `useToast` de la nouvelle (identité de
// contexte React cassée).
async function rendreAvecVersion(valeur: string) {
  vi.stubEnv('VITE_APP_VERSION', valeur);
  vi.resetModules();
  const module = await import('./offline-panel');
  const rendu = await import('@/test/render');
  rendu.renderWithProviders(<module.OfflinePanel />);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('OfflinePanel — estampille de build', () => {
  // Famille 1 (D-11/D-13) : sans estampille — VITE_APP_VERSION absente.
  it('affiche « Version de développement » aux deux points d\'affichage, jamais `unknown` ni `0.1.0`', async () => {
    await rendreAvecVersion('unknown');

    const affichages = screen.getAllByText(LIBELLE_REPLI);
    expect(affichages.length).toBe(2);
    for (const affichage of affichages) {
      const title = affichage.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title?.length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).not.toContain('unknown');
    expect(document.body.textContent).not.toContain('0.1.0');
  });

  // Famille 1, variante chaîne vide : `||` traite une estampille vidée comme
  // absente — le rendu est identique à la variante sans variable.
  it('affiche « Version de développement » quand l\'estampille est une chaîne vide', async () => {
    await rendreAvecVersion('');

    const affichages = screen.getAllByText(LIBELLE_REPLI);
    expect(affichages.length).toBe(2);
    expect(document.body.textContent).not.toContain('unknown');
    expect(document.body.textContent).not.toContain('0.1.0');
  });

  // Famille 2 (D-03, inchangée) : estampillée → SHA court + title complet,
  // aux DEUX points d'affichage.
  it('affiche les 8 premiers caractères du SHA, le complet en title', async () => {
    await rendreAvecVersion(SHA_40);

    const ligneVersion = screen.getByText('Version').parentElement;
    expect(ligneVersion).not.toBeNull();
    const affichee = within(ligneVersion as HTMLElement).getByText(SHA_40.slice(0, 8));
    expect(affichee).toHaveAttribute('title', SHA_40);
  });

  it('affiche le SHA court avec title complet au pied « Application web »', async () => {
    await rendreAvecVersion(SHA_40);

    const pied = screen.getByText(/service worker mis à jour/i).closest('p');
    expect(pied).not.toBeNull();
    expect(pied?.textContent).toContain(SHA_40.slice(0, 8));
  });

  it('laisse une valeur courte affichée en entier, title égal à la valeur', async () => {
    await rendreAvecVersion('abc');

    const ligneVersion = screen.getByText('Version').parentElement;
    const affichee = within(ligneVersion as HTMLElement).getByText('abc');
    expect(affichee).toHaveAttribute('title', 'abc');
  });
});

// --- D-12 : point d'observation unique de l'état du service worker ----------

const swState = vi.hoisted(() => ({
  registration: null as ServiceWorkerRegistration | null,
  needsRefresh: false,
  outboxEmpty: true,
}));

vi.mock('@/lib/sw-register', () => ({
  useSwState: () => swState,
  updateSW: vi.fn(),
}));

vi.mock('@/hooks/use-outbox-gate', () => ({
  useOutboxGate: () => ({ isEmpty: swState.outboxEmpty }),
}));

// D-11 (plan 34-04) : `retryOutboxEntry` est espionné — le panneau doit
// DÉLÉGUER au moteur de rejeu, jamais rejouer lui-même. `abandonOutboxEntry`
// (pur setQueryData, module `outbox`) reste réel : son effet se lit dans le
// cache du client de test.
const { retryOutboxEntrySpy } = vi.hoisted(() => ({
  retryOutboxEntrySpy: vi.fn(async () => ({ applied: 1, failed: 0 })),
}));

vi.mock('@/lib/offline/outbox-replay', () => ({
  replayOutbox: vi.fn(async () => ({ applied: 0, failed: 0 })),
  retryOutboxEntry: (...args: Parameters<typeof retryOutboxEntrySpy>) => retryOutboxEntrySpy(...args),
}));

// Phase 42 (COLD-01) : le store d'amorçage est mocké (patron vi.hoisted du
// mock D-12 ci-dessus) — le panneau lit `useBootMarks()` au montage, les
// tests peuplent ou vident l'objet pour piloter la section « Amorçage ».
const bootMarks = vi.hoisted(() => ({
  entry: null as number | null,
  sw: null as number | null,
  idb: null as number | null,
  auth: null as number | null,
  totalMs: null as number | null,
}));

vi.mock('@/lib/boot-marks', () => ({
  useBootMarks: () => bootMarks,
}));

const MOCK_SW_VERSION = 'precache-push-v2';
const MOCK_REGISTRATION = {
  active: { postMessage: () => {} },
} as unknown as ServiceWorkerRegistration;

describe('OfflinePanel — état du service worker (D-12)', () => {
  let repondre: (data: unknown) => void;

  beforeEach(() => {
    const listeners = new Set<(e: MessageEvent) => void>();
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: {
        addEventListener: (_: string, cb: (e: MessageEvent) => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: (e: MessageEvent) => void) => listeners.delete(cb),
      },
    });
    repondre = (data) => listeners.forEach((cb) => cb(new MessageEvent('message', { data })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    swState.registration = null;
    swState.needsRefresh = false;
    swState.outboxEmpty = true;
  });

  it('affiche la version du worker actif (réponse au ping EO_VERSION)', async () => {
    swState.registration = MOCK_REGISTRATION;
    await rendreAvecVersion(SHA_40);
    repondre({ type: 'EO_VERSION_REPLY', version: MOCK_SW_VERSION });
    await waitFor(() => {
      expect(screen.getByText('Version du service worker').parentElement?.textContent).toContain(MOCK_SW_VERSION);
    });
  });

  it('repli honnête sans registration (SW absent, dev) — pas de version fictive', async () => {
    swState.registration = null;
    await rendreAvecVersion(SHA_40);
    const ligne = screen.getByText('Version du service worker').parentElement;
    expect(ligne?.textContent).toContain('Service worker indisponible');
    expect(ligne?.textContent).not.toContain(MOCK_SW_VERSION);
  });

  it('worker en attente → « Mise à jour en attente » + bouton Appliquer maintenant qui appelle updateSW', async () => {
    swState.registration = MOCK_REGISTRATION;
    swState.needsRefresh = true;
    await rendreAvecVersion(SHA_40);
    const bouton = screen.getByRole('button', { name: 'Appliquer maintenant' });
    await userEvent.click(bouton);
    const swModule = await import('@/lib/sw-register');
    expect(vi.mocked(swModule.updateSW)).toHaveBeenCalled();
  });

  it('bouton Appliquer maintenant désactivé si le gate répond file non vide', async () => {
    swState.outboxEmpty = false;
    swState.needsRefresh = true;
    await rendreAvecVersion(SHA_40);
    const bouton = screen.getByRole('button', { name: 'Mise à jour en préparation…' });
    expect(bouton).toBeDisabled();
  });

  it('sans mise à jour en attente : ni message ni bouton (Pitfall 7)', async () => {
    swState.registration = MOCK_REGISTRATION;
    swState.needsRefresh = false;
    await rendreAvecVersion(SHA_40);
    expect(screen.queryByText('Mise à jour en attente')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Appliquer maintenant' })).toBeNull();
  });
});

/**
 * D-11 (plan 34-04, WRQ-05) : la section « Écritures en attente » du panneau
 * offline. La file est lue par la SOURCE UNIQUE `useOutbox` (même canal que
 * le badge) et ensemencée par `setQueryData` AVANT le rendu — le canal réel
 * d'enfilage. Le libellé borne l'information à table + opération : AUCUNE
 * valeur de ligne ne franchit l'écran (T-34-08).
 */
describe('OfflinePanel — écritures en attente (D-11, plan 34-04)', () => {
  const USER = 'user-panneau';

  const poserSession = () =>
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: USER, email: 'p@example.fr', displayName: 'P', avatarUrl: null, provider: 'email' },
    });

  const fichier = () => outboxKeyFor(USER, DEMO_HOUSEHOLD_ID);

  afterEach(() => {
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
    retryOutboxEntrySpy.mockClear();
  });

  it('affiche un état vide soigné quand la file est vide', async () => {
    poserSession();
    renderWithProviders(<OfflinePanel />);

    expect(screen.getByText(/Aucune écriture en attente/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abandonner' })).toBeNull();
  });

  it('liste chaque écriture (libellé, statut) et n’affiche AUCUNE valeur de ligne (T-34-08)', async () => {
    const client = createTestQueryClient();
    client.setQueryData(fichier(), [
      {
        key: 'tasks:t1',
        table: 'tasks',
        operation: 'update',
        id: 't1',
        values: { name: 'TITRE-SECRET-NE-PAS-AFFICHER' },
        enqueuedAt: 1,
        status: 'pending',
      },
      {
        key: 'expenses:e9',
        table: 'expenses',
        operation: 'create',
        id: 'e9',
        values: { title: 'MONTANT-SECRET', amount: 42 },
        enqueuedAt: 2,
        status: 'failed',
        failure: { kind: 'terminal', code: '42501', message: 'refus RLS' },
      },
    ]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    expect(screen.getByText('Modification — tâche')).toBeTruthy();
    expect(screen.getByText('En attente du réseau')).toBeTruthy();
    expect(screen.getByText('Ajout — dépense')).toBeTruthy();
    // D-05 : le libellé de la famille 42501 est dérivé du code — le message
    // PostgREST brut ne doit plus apparaître (T-36-01).
    expect(screen.getByText('Bloquée (42501) — droits insuffisants pour cette action')).toBeTruthy();
    expect(document.body.textContent).not.toContain('refus RLS');
    // L'information affichée se borne à l'identité : les valeurs des lignes
    // (montant, titre, contenu) ne quittent jamais la file vers l'écran.
    expect(document.body.textContent).not.toContain('TITRE-SECRET-NE-PAS-AFFICHER');
    expect(document.body.textContent).not.toContain('MONTANT-SECRET');
  });

  it('affiche le libellé 404 dérivé (D-01) : jamais le message PostgREST brut au DOM (T-36-01, T-34-08 étendue)', () => {
    const client = createTestQueryClient();
    client.setQueryData(fichier(), [
      {
        key: 'tasks:t404',
        table: 'tasks',
        operation: 'update',
        id: 't404',
        values: { name: 'x' },
        enqueuedAt: 1,
        status: 'failed',
        failure: {
          kind: 'terminal',
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      },
    ]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    expect(screen.getByText(/cet élément a été supprimé entre-temps/)).toBeTruthy();
    // T-36-01 : le message d'origine serveur (DataError.cause.message) ne
    // franchit JAMAIS l'écran — le libellé dérive du seul code.
    expect(document.body.textContent).not.toContain('JSON object requested');
  });

  it('entrée « ancienne forme » (Pitfall 5, zéro migration) : le libellé dérivé reste correct', () => {
    // Entrée persistée par un build d'AVANT la phase : même forme
    // { kind, code, message }, message PostgREST anglais d'origine. Le
    // libellé est dérivé du code au rendu — aucune migration IndexedDB.
    const client = createTestQueryClient();
    client.setQueryData(fichier(), [
      {
        key: 'expenses:e9',
        table: 'expenses',
        operation: 'create',
        id: 'e9',
        enqueuedAt: 2,
        status: 'failed',
        failure: {
          kind: 'terminal',
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        },
      },
    ]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    expect(screen.getByText(/cet élément a été supprimé entre-temps/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('JSON object requested');
  });

  it('sonde edge « empty » : entrée pending sans failure → « En attente du réseau », file vide → aucun crash', async () => {
    const client = createTestQueryClient();
    client.setQueryData(fichier(), [
      {
        key: 'tasks:t1',
        table: 'tasks',
        operation: 'update',
        id: 't1',
        values: { name: 'x' },
        enqueuedAt: 1,
        status: 'pending',
      },
    ]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    expect(screen.getByText('En attente du réseau')).toBeTruthy();
    expect(screen.queryByText(/Bloquée/)).toBeNull();

    // File entièrement vidée : le panneau suit la source unique (useOutbox)
    // et repasse à son état vide — aucun crash, libellé inchangé.
    client.setQueryData(fichier(), []);
    await waitFor(() => expect(screen.getByText(/Aucune écriture en attente/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('Réessayer délègue au moteur de rejeu (retryOutboxEntry), jamais un rejeu maison', async () => {
    const client = createTestQueryClient();
    const entree = {
      key: 'tasks:t1',
      table: 'tasks',
      operation: 'update' as const,
      id: 't1',
      enqueuedAt: 1,
      status: 'pending' as const,
    };
    client.setQueryData(fichier(), [entree]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(retryOutboxEntrySpy).toHaveBeenCalledTimes(1));
    expect(retryOutboxEntrySpy).toHaveBeenCalledWith(client, USER, DEMO_HOUSEHOLD_ID, entree);
  });

  it('Abandonner exige la confirmation puis retire l’entrée de la file (T-34-09)', async () => {
    const client = createTestQueryClient();
    const entree = {
      key: 'expenses:e9',
      table: 'expenses',
      operation: 'create' as const,
      id: 'e9',
      enqueuedAt: 2,
      status: 'failed' as const,
      failure: { kind: 'terminal' as const, code: '42501', message: 'refus RLS' },
    };
    client.setQueryData(fichier(), [entree]);
    poserSession();
    renderWithProviders(<OfflinePanel />, { queryClient: client });

    // Un clic sur Abandonner ne retire RIEN : la dialog vient d'abord.
    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(screen.getByText(/Abandonner cette écriture/)).toBeTruthy();
    expect(client.getQueryData(fichier())).toEqual([entree]);

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner l’écriture' }));

    await waitFor(() => expect(client.getQueryData(fichier())).toEqual([]));
  });
});

/**
 * 35-09 (gap G-35-5) : section « Cache hors-ligne » du panneau Paramètres.
 * Le diagnostic 35-07 a prouvé qu'on-device, l'utilisateur ne peut pas dire
 * POURQUOI l'entrée de cache persistée était absente au cold-start. Cette
 * section rend les trois sous-causes OBSERVABLES (D-11) : jamais persistée
 * (« aucune donnée mise en cache »), élaguée > 24 h (« écartée au prochain
 * démarrage »), restore en échec (cause affichée) — en LECTURE SEULE (D-08),
 * sans aucune valeur de ligne à l'écran (T-35-18).
 */
describe('OfflinePanel — Cache hors-ligne (35-09, G-35-5)', () => {
  const USER = 'u-panneau-cache';
  const HH = 'h-cache';
  const heure = 60 * 60 * 1000;
  const cacheStore = createStore('eo-offline-cache', 'query');

  const poserSession = () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: { id: USER, email: 'p@example.fr', displayName: 'P', avatarUrl: null, provider: 'email' },
    });
    useHouseholdStore.setState({ householdId: HH });
  };

  const rendre = () => renderWithProviders(<OfflinePanel />, { withHousehold: false });

  /** Sème une entrée persistée pour le couple courant, famille tasks vieillie à volonté. */
  const semer = async (ageMs: number | null) => {
    const client = createTestQueryClient();
    client.setQueryData(['tasks', HH, {}, null], [{ id: 't1', name: 'x' }]);
    if (ageMs !== null) {
      const q = client.getQueryCache().find({ queryKey: ['tasks', HH, {}, null] })!;
      q.setState({ dataUpdatedAt: Date.now() - ageMs });
    }
    await persistNow(client, USER, HH, { throttleTime: 0 });
  };

  afterEach(async () => {
    stopPersisting();
    onlineManager.setOnline(true);
    await purgeCache(USER, HH);
    await purgeCache('u-rien', 'h-rien');
    await del(cacheKey(USER, HH), cacheStore);
    useSessionStore.setState({ status: 'guest', user: null, householdLoaded: false });
    useHouseholdStore.getState().reset();
  });

  // IMPORTANT : ce test doit rester PREMIER du describe — `getRestoreOutcome`
  // est un état de module, encore null tant qu'aucun connectOfflineCache n'a
  // tourné dans ce fichier. « Pas encore passée sur cette session » est un
  // fait, il se prouve sur le module vierge.
  it('sans entrée ni restore : absence constatée, restauration pas encore passée', async () => {
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText(/Aucune donnée mise en cache sur cet appareil pour ce foyer/)).toBeTruthy();
    });
    expect(screen.getByText(/Restauration pas encore passée sur cette session/)).toBeTruthy();
  });

  it('entrée présente : familles, âge, conservation, état réseau — aucun bouton (D-08)', async () => {
    await semer(2 * heure);
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText(/mise en cache il y a/)).toBeTruthy();
    });
    const ligne = screen.getByText(/mise en cache il y a/).closest('li');
    expect(ligne?.textContent).toContain('tasks');
    expect(ligne?.textContent).toContain('il y a 2 h');
    expect(ligne?.textContent).toContain('conserve 24 h');
    expect(ligne?.textContent).not.toContain('écartée');
    expect(screen.getByText('En ligne')).toBeTruthy();
    // Aucune valeur de ligne à l'écran (T-35-18) : le nom sémé ci-dessus est
    // neutre ('x') — la section ne porte QUE noms de familles et durées.
    const section = screen.getByText('Cache hors-ligne').closest('section');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).queryAllByRole('button')).toHaveLength(0);
  });

  it('famille au-delà de la conservation : « écartée au prochain démarrage », jamais « perdue » (D-11)', async () => {
    await semer(30 * heure);
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText(/écartée au prochain démarrage/)).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain('perdue');
  });

  it('restore réussi sans prune : « N familles restaurées », sans mention d\'écartées', async () => {
    await semer(2 * heure);
    const client = createTestQueryClient();
    await connectOfflineCache(client, USER, HH, { throttleTime: 0 });
    stopPersisting();
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText('Dernière restauration : 1 familles restaurées')).toBeTruthy();
    });
    expect(screen.queryByText(/écartées/)).toBeNull();
  });

  it('restore avec prune : le delta élagué est AFFICHÉ — « N familles restaurées, M écartées (> 24 h) »', async () => {
    await semer(25 * heure);
    const client = createTestQueryClient();
    await connectOfflineCache(client, USER, HH, { throttleTime: 0 });
    stopPersisting();
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText('Dernière restauration : 1 familles restaurées, 1 écartées (> 24 h)')).toBeTruthy();
    });
  });

  it('restore no-op : « rien à restaurer » — un fait distinct d\'un échec', async () => {
    const client = createTestQueryClient();
    await connectOfflineCache(client, 'u-rien', 'h-rien', { throttleTime: 0 });
    stopPersisting();
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText('Dernière restauration : rien à restaurer')).toBeTruthy();
    });
  });

  it('restore en échec : la cause est affichée, sans être avalée (G-35-5, sous-cause 3)', async () => {
    // Entrée illisible (JSON cassé) : la désérialisation rejette — la même
    // classe d'échec qu'un IndexedDB corrompu, que use-auth.ts avalait.
    await set(cacheKey(USER, HH), 'pas-du-json{', cacheStore);
    const client = createTestQueryClient();
    await expect(connectOfflineCache(client, USER, HH, { throttleTime: 0 })).rejects.toThrow();
    stopPersisting();
    poserSession();
    rendre();

    await waitFor(() => {
      expect(screen.getByText(/Dernière restauration : échec —/)).toBeTruthy();
    });
  });

  it('état réseau hors ligne : « Hors ligne » (abonnement onlineManager)', async () => {
    await semer(2 * heure);
    poserSession();
    onlineManager.setOnline(false);
    rendre();

    await waitFor(() => {
      expect(screen.getByText('Hors ligne')).toBeTruthy();
    });
  });
});

/**
 * Phase 42 (COLD-01, PD-01) : section « Amorçage » — 4 segments + total.
 * Repli honnête (D-11) quand une valeur n'a pas été mesurée sur ce
 * démarrage : jamais de valeur fictive (Pitfall 3).
 */
describe('OfflinePanel — section Amorçage (COLD-01)', () => {
  afterEach(() => {
    bootMarks.entry = null;
    bootMarks.sw = null;
    bootMarks.idb = null;
    bootMarks.auth = null;
    bootMarks.totalMs = null;
  });

  it('rend 4 libellés de segment + total, avec les durées formatées par libelleMs', () => {
    bootMarks.entry = 850;
    bootMarks.sw = 40;
    bootMarks.idb = 1200;
    bootMarks.auth = 2200;
    bootMarks.totalMs = 2300;
    renderWithProviders(<OfflinePanel />);

    expect(screen.getByText('Entry chunk').parentElement?.textContent).toContain('850 ms');
    expect(screen.getByText('Activation du service worker').parentElement?.textContent).toContain('40 ms');
    // ≥ 1 s → l'unité honnête est la seconde, une décimale.
    expect(screen.getByText('Restore IndexedDB').parentElement?.textContent).toContain('1.2 s');
    expect(screen.getByText('Bootstrap auth').parentElement?.textContent).toContain('2.2 s');
    expect(screen.getByText('Total du démarrage').parentElement?.textContent).toContain('2.3 s');
  });

  it('store vide : le repli « Pas encore mesuré sur ce démarrage » apparaît 5 fois (4 segments + total)', () => {
    renderWithProviders(<OfflinePanel />);

    expect(screen.getAllByText('Pas encore mesuré sur ce démarrage')).toHaveLength(5);
    expect(screen.getByText('Entry chunk')).toBeTruthy();
    expect(screen.getByText('Activation du service worker')).toBeTruthy();
    expect(screen.getByText('Restore IndexedDB')).toBeTruthy();
    expect(screen.getByText('Bootstrap auth')).toBeTruthy();
    expect(screen.getByText('Total du démarrage')).toBeTruthy();
  });
});
