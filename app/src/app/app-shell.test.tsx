import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders, waitForQueryStatus } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { queryKeys } from '@/lib/data/useResource';
import { setTaskAssignees } from '@/modules/taches/api';
import type { TaskAssigneeRecord } from '@/modules/taches/types';
import { catalogueModules, isChildHiddenModule } from '@/lib/modules';
import { MOBILE_DRAWER_GROUPS } from '@/components/shared/mobile-drawer';
import { AppShell } from './app-shell';

/**
 * D-04 : le shell doit relire le reçu de rotation quand le worker le lui dit.
 * Le mock est partiel — le reste du module reste réel — pour n'observer que
 * l'appel, sans réseau ni Cache API.
 */
const { syncRotatedPushSubscriptionMock } = vi.hoisted(() => ({ syncRotatedPushSubscriptionMock: vi.fn() }));

vi.mock('@/modules/parametres/lib/push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/parametres/lib/push')>();
  return { ...actual, syncRotatedPushSubscription: syncRotatedPushSubscriptionMock };
});

/**
 * La lecture des assignations est mise sous contrôle pour les seules gardes de
 * « on ne sait pas » (en vol, en erreur). Le mock est partiel : `setTaskAssignees`
 * et le reste de `taches/api` restent réels, et le `beforeEach` REMET la vraie
 * implémentation — sans quoi tous les autres cas du fichier liraient `undefined`.
 */
const { listTaskAssigneesMock, realListTaskAssignees } = vi.hoisted(() => ({
  listTaskAssigneesMock: vi.fn(),
  realListTaskAssignees: {
    fn: null as null | ((taskIds: string[]) => Promise<TaskAssigneeRecord[]>),
  },
}));

vi.mock('@/modules/taches/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/taches/api')>();
  realListTaskAssignees.fn = actual.listTaskAssignees;
  return { ...actual, listTaskAssignees: listTaskAssigneesMock };
});

beforeEach(() => {
  listTaskAssigneesMock.mockReset();
  listTaskAssigneesMock.mockImplementation((taskIds: string[]) => realListTaskAssignees.fn!(taskIds));
});

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="*" element={<h1>Contenu de test</h1>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('AppShell', () => {
  it('affiche la navigation principale et le nom du foyer', () => {
    renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: /Maison/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /À faire/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Calendrier/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Cercle/ })).toBeInTheDocument();
    expect(screen.getAllByText('Foyer Martin').length).toBeGreaterThan(0);
  });

  it('propose un fil d’Ariane cohérent avec la route courante', () => {
    renderShell('/taches');
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    // Libellé de navigation de l'export : « À faire » pour le module tâches.
    expect(within(breadcrumb).getByText('À faire')).toBeInTheDocument();
  });

  it('nomme le module, pas la page, sur une sous-route', () => {
    renderShell('/courses/aide');
    const breadcrumb = screen.getByRole('navigation', { name: 'Fil d’Ariane' });
    // Le chemin entier était cherché dans le catalogue des espaces : une
    // sous-route retombait sur « Maison », et le lecteur perdait le module.
    expect(within(breadcrumb).getByText('Courses')).toBeInTheDocument();
    expect(within(breadcrumb).queryByText('Maison')).not.toBeInTheDocument();
  });

  it('propose un hamburger qui ouvre le tiroir des espaces', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    // L'en-tête porte le nom de l'application, pas un « Menu » générique.
    expect(within(dialog).getByText('Ensemble & Organisés')).toBeInTheDocument();
    // Maison + dix-neuf modules, chacun joignable en un tap.
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(20);
    expect(within(dialog).getByRole('link', { name: 'Ouvrir Courses' })).toBeInTheDocument();
  });

  it('marque la page active dans la navigation', () => {
    renderShell('/calendrier');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { current: 'page', name: /Calendrier/ })).toBeInTheDocument();
  });

  it('propose un lien d’évitement vers le contenu principal', () => {
    renderShell('/accueil');
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute('href', '#contenu-principal');
  });

  it('teinte le badge du foyer de sa couleur', () => {
    renderShell('/accueil');
    act(() => {
      useHouseholdStore.setState({ householdColor: 'coral' });
    });
    try {
      const badge = screen.getAllByText('FM')[0].closest('span');
      expect(badge?.className).toContain('bg-coral');
    } finally {
      useHouseholdStore.setState({ householdColor: 'accent' });
    }
  });
});

/**
 * Régression : la barre latérale n'épinglait que quatre entrées, et les douze
 * autres catégories n'avaient aucun bouton de navigation. Le catalogue est la
 * garantie qu'aucun espace du foyer ne devienne inatteignable.
 */
describe('AppShell — catalogue des espaces', () => {
  it('expose un bouton pour chacune des dix-sept catégories', () => {
    renderShell('/accueil');
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    const links = within(grid).getAllByRole('link');
    expect(links).toHaveLength(catalogueModules.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(catalogueModules.map((entry) => `/${entry.key}`));
  });

  it('départage les catégories qui n’ont pas d’accès rapide épinglé', () => {
    renderShell('/accueil');
    const quick = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
    // Accueil n'appartient pas au catalogue : il reste le premier accès rapide.
    expect(quick.getByRole('link', { name: /Maison/ })).toBeInTheDocument();
    for (const key of ['courses', 'anniversaires', 'animaux', 'fidelite', 'messages'] as const) {
      const entry = catalogueModules.find((module) => module.key === key)!;
      expect(quick.queryByRole('link', { name: entry.label })).not.toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: entry.label }).length).toBeGreaterThan(0);
    }
  });

  it('replie et déplie la section du catalogue', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    const toggle = screen.getByRole('button', { name: /Tous les espaces/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle.getAttribute('aria-controls')).toBeTruthy();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Repliée, la section ne doit plus exposer un seul lien à l'axe de
    // tabulation ni au lecteur d'écran.
    expect(screen.queryByRole('list', { name: 'Espaces du foyer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Courses' })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();
  });

  it('ouvre le tiroir en tuiles depuis le hamburger', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(20);
    expect(within(dialog).getByRole('link', { name: 'Ouvrir Anniversaires' })).toBeInTheDocument();
  });

  it('ferme le tiroir après avoir choisi un espace', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Ouvrir Courses' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('le tiroir couvre chaque espace du catalogue, plus la maison', () => {
    const keys = MOBILE_DRAWER_GROUPS.flatMap((group) => group.keys);
    expect(keys).toContain('accueil');
    for (const entry of catalogueModules) {
      expect(keys, `${entry.key} injoignable sur mobile`).toContain(entry.key);
    }
  });

  it('filtre les espaces depuis la recherche du tiroir', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: 'Rechercher un espace' }), 'courses');
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(1);
  });

  it('retrouve un espace sans taper ses accents', async () => {
    const user = userEvent.setup();
    renderShell('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: 'Rechercher un espace' }), 'a faire');
    expect(within(dialog).getByRole('link', { name: 'Ouvrir À faire' })).toBeInTheDocument();
  });

  it('affiche une popup quand le service worker relaie un push (app ouverte)', async () => {
    const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          const set = listeners.get(type) ?? new Set<(event: MessageEvent) => void>();
          set.add(listener);
          listeners.set(type, set);
        }),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    try {
      renderShell('/accueil');
      const handler = [...(listeners.get('message') ?? [])][0];
      expect(handler, 'le shell écoute le service worker').toBeDefined();
      act(() => {
        handler!({ data: { type: 'EO_PUSH', title: 'Rappel', body: 'Dentiste à 18h' } } as MessageEvent);
      });
      expect(await screen.findByText('Rappel — Dentiste à 18h')).toBeInTheDocument();
      // Le pendant (D-04) : un rappel n'est PAS une rotation — la branche
      // ajoutée n'a pas remplacé l'ancienne, et l'ancienne ne la déclenche pas.
      expect(syncRotatedPushSubscriptionMock).not.toHaveBeenCalled();
    } finally {
      // @ts-expect-error restauration de l'environnement jsdom
      delete window.navigator.serviceWorker;
    }
  });
});

/**
 * Périmètre enfant (phase 14, D-05) : ni le catalogue, ni le tiroir mobile
 * n'exposent les 5 modules hors périmètre au rôle `enfant`. Les vues
 * admin/membre restent byte-identiques (prouvé par les suites ci-dessus, qui
 * tournent en admin par défaut).
 */
describe('AppShell — périmètre enfant', () => {
  const hiddenLabels = ['Ardoise', 'Cadeaux', 'Animaux', 'Prestataires', 'Fidélité'];

  function renderShellAsChild(route: string) {
    renderShell(route);
    act(() => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    });
  }

  it('retire les 5 modules du catalogue pour un enfant', () => {
    renderShellAsChild('/accueil');
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    const links = within(grid).getAllByRole('link');
    const expected = catalogueModules.filter((entry) => !isChildHiddenModule(entry.key));
    expect(links).toHaveLength(expected.length);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(expected.map((entry) => `/${entry.key}`));
    for (const label of hiddenLabels) {
      expect(within(grid).queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
    // Les espaces autorisés restent joignables, sans entrée focusable cachée.
    expect(within(grid).getByRole('link', { name: 'Courses' })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: 'Contacts' })).toBeInTheDocument();
  });

  it('retire les 5 modules du tiroir mobile pour un enfant', async () => {
    const user = userEvent.setup();
    renderShellAsChild('/accueil');
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));

    const dialog = screen.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    // Maison + quatorze espaces : 15 liens, aucun hollow, aucun masqué en CSS.
    expect(within(dialog).getAllByRole('link', { name: /^Ouvrir / })).toHaveLength(15);
    expect(within(dialog).getByRole('link', { name: 'Ouvrir Maison' })).toBeInTheDocument();
    for (const label of ['Ardoise', 'Cadeaux', 'Animaux', 'Prestataires', 'Fidélité']) {
      expect(within(dialog).queryByRole('link', { name: `Ouvrir ${label}` })).not.toBeInTheDocument();
    }
  });
});

describe('AppShell — badge À faire (15-01, personnel)', () => {
  /** Le badge n'existe que si la lecture des assignations a abouti : on attend
   * cet ÉTAT, et non un budget sur l'apparition du libellé. */
  const waitForAssignees = (queryClient: Parameters<typeof waitForQueryStatus>[0]) =>
    waitForQueryStatus(queryClient, queryKeys.tableAll('task_assignees'));

  it('ne compte que mes tâches ouvertes et celles sans assigné', async () => {
    const { queryClient } = renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    await waitForAssignees(queryClient);
    // Graines (Camille connectée) : task-1 à moi, task-2/task-4 à Thomas, 1 faite, 2 de voyage.
    const badge = await within(nav).findByLabelText('1 tâches ouvertes');
    expect(badge).toHaveTextContent('1');
  });

  it('retire le badge quand la tâche est réassignée (D-08)', async () => {
    const { queryClient } = renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    await waitForAssignees(queryClient);
    await within(nav).findByLabelText('1 tâches ouvertes');
    try {
      // Réassignation réelle (même chemin que le module Tâches) : la table
      // `task_assignees` change, la ligne `tasks` reste identique.
      await setTaskAssignees('task-1', [DEMO_MEMBERS.thomas]);
      await act(async () => {
        await queryClient.refetchQueries({ queryKey: queryKeys.tableAll('task_assignees') });
      });
      // Le badge n'est rendu que si le compte est > 0 : sa disparition est
      // l'observable. Avant correction, la clé du shell vivait sous le préfixe
      // maison `['app-shell', …]`, qu'aucune invalidation ne touche, et le
      // badge restait affiché.
      await waitFor(() =>
        expect(within(nav).queryByLabelText('1 tâches ouvertes')).not.toBeInTheDocument(),
      );
    } finally {
      // L'adaptateur local partage son IndexedDB entre les cas du fichier :
      // laisser task-1 chez Thomas ferait dépendre le test des graines.
      await setTaskAssignees('task-1', [DEMO_MEMBERS.camille]);
    }
  });

  it("n'affiche aucun compteur tant que les assignations ne sont pas lues", async () => {
    // Lecture EN VOL : elle ne rendra jamais. Le compteur ne peut donc pas être
    // connu de tout le cas — et « on ne sait pas » ne s'affiche pas comme
    // « tout le foyer ». Avant correction, le badge portait 3 et restait stable.
    listTaskAssigneesMock.mockImplementation(() => new Promise<TaskAssigneeRecord[]>(() => {}));
    const { queryClient } = renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });

    // Préconditions : les tâches du shell ont abouti, ET la lecture des
    // assignations a bien démarré. Sans elles, l'absence de badge serait vraie
    // pour une autre raison et la garde ne prouverait rien.
    await waitForQueryStatus(queryClient, ['tasks'], 'success');
    await waitFor(() => expect(listTaskAssigneesMock).toHaveBeenCalled());

    expect(within(nav).queryByLabelText(/tâches ouvertes/)).not.toBeInTheDocument();
  });

  it("n'affiche aucun compteur quand la lecture des assignations échoue", async () => {
    listTaskAssigneesMock.mockRejectedValue(new Error('réseau indisponible'));
    const { queryClient } = renderShell('/accueil');
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });

    await waitForQueryStatus(queryClient, ['tasks'], 'success');
    await waitForQueryStatus(queryClient, queryKeys.tableAll('task_assignees'), 'error');

    expect(within(nav).queryByLabelText(/tâches ouvertes/)).not.toBeInTheDocument();
  });
});

/**
 * D-04 : après une rotation d'abonnement, le worker laisse un reçu durable et
 * prévient les onglets ouverts. C'est le shell qui, à la réception du message,
 * relit ce reçu et enregistre le nouvel endpoint — le worker n'a pas de jeton.
 */
describe('AppShell — rotation d’abonnement (D-04)', () => {
  function installServiceWorkerListener() {
    const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {
        addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          const set = listeners.get(type) ?? new Set<(event: MessageEvent) => void>();
          set.add(listener);
          listeners.set(type, set);
        }),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    return listeners;
  }

  it('relit le reçu de rotation quand le worker signale `EO_PUSH_ROTATED`', async () => {
    const listeners = installServiceWorkerListener();
    syncRotatedPushSubscriptionMock.mockResolvedValue('registered');
    try {
      renderShell('/accueil');
      const handler = [...(listeners.get('message') ?? [])][0];
      expect(handler, 'le shell écoute le service worker').toBeDefined();

      await act(async () => {
        handler!({
          data: { type: 'EO_PUSH_ROTATED', endpoint: 'https://push.exemple.fr/neuf', ok: true },
        } as MessageEvent);
      });

      await waitFor(() => expect(syncRotatedPushSubscriptionMock).toHaveBeenCalledTimes(1));
    } finally {
      // @ts-expect-error restauration de l'environnement jsdom
      delete window.navigator.serviceWorker;
    }
  });
});
