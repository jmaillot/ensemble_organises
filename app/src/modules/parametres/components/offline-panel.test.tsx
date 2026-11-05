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
import { renderWithProviders, createTestQueryClient } from '@/test/render';
import { useSessionStore } from '@/stores/session-store';
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
    expect(screen.getByText(/Bloquée \(42501\)/)).toBeTruthy();
    // L'information affichée se borne à l'identité : les valeurs des lignes
    // (montant, titre, contenu) ne quittent jamais la file vers l'écran.
    expect(document.body.textContent).not.toContain('TITRE-SECRET-NE-PAS-AFFICHER');
    expect(document.body.textContent).not.toContain('MONTANT-SECRET');
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
