import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { data } from '@/lib/data';
import { getDatabase } from '@/lib/data/dexie';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoHousehold, demoMembers } from '@/lib/data/seed';
import type { DashboardWidgetRow, RowFilter } from '@/types';
import DashboardPage from './dashboard-page';
import { layoutWidgets, reorderPreferences, resetPreferences, toWidgetPreferences, toggleWidget } from './types';

describe('Accueil — preferences de widgets', () => {
  it('ordonne les widgets visibles en grille de deux colonnes', () => {
    const placements = layoutWidgets(resetPreferences());
    expect(placements.map((placement) => placement.kind)).toEqual([
      'calendrier',
      'taches',
      'meteo',
      'anniversaires',
      'routines',
    ]);
    // Le widget « routines » occupe toute la largeur, comme dans l'export.
    expect(placements.at(-1)?.width).toBe(2);
  });

  it('déplace un widget et respecte l’ordre demandé', () => {
    const preferences = resetPreferences();
    const next = reorderPreferences(preferences, 'meteo', 'calendrier');
    expect(next.map((preference) => preference.kind)).toEqual([
      'meteo',
      'calendrier',
      'taches',
      'anniversaires',
      'routines',
    ]);
    expect(reorderPreferences(preferences, 'calendrier', 'calendrier')).toBe(preferences);
  });

  it('masque puis réaffiche un widget', () => {
    const preferences = resetPreferences();
    const hidden = toggleWidget(preferences, 'meteo');
    expect(hidden.find((preference) => preference.kind === 'meteo')?.visible).toBe(false);
    const shown = toggleWidget(hidden, 'meteo');
    expect(shown.find((preference) => preference.kind === 'meteo')?.visible).toBe(true);
  });
});

describe('Accueil — rendu', () => {
  // La météo part sur le réseau : les rendus restent hermétiques en simulant
  // un service injoignable (le widget affiche alors son état d'erreur).
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('service météo injoignable');
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('affiche le greeting, le foyer et les cinq widgets', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour Camille/ })).toBeInTheDocument();
    expect(screen.getByText(/Foyer Martin/)).toBeInTheDocument();

    const widgets = screen.getAllByRole('article', { name: /^Widget / });
    expect(widgets).toHaveLength(5);
    // Mois courant, jamais codé en dur : le 1er octobre a déjà fait échouer ce test.
    const currentMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date());
    expect(
      within(screen.getByRole('article', { name: 'Widget Calendrier' })).getByText(new RegExp(currentMonth)),
    ).toBeInTheDocument();
    // Service simulé injoignable : le widget météo affiche son état d'erreur.
    expect(await within(screen.getByRole('article', { name: 'Widget Météo' })).findByText(/vérifiez la connexion/)).toBeInTheDocument();
    // Le point du jour sépare tâches et événements en deux colonnes.
    const taches = screen.getByRole('list', { name: 'Tâches du jour' });
    const evenements = screen.getByRole('list', { name: 'Événements du jour' });
    expect(within(taches).getByText(/Choisir le menu du week-end/)).toBeInTheDocument();
    expect(within(evenements).getByText(/Rendez-vous chez le médecin/)).toBeInTheDocument();
    // L'horaire est en colonne temps, sans répétition « · À 19:30 ».
    expect(within(evenements).getByText(/^19:30$/)).toBeInTheDocument();
    expect(within(evenements).queryByText(/À 19:30/)).not.toBeInTheDocument();
  });

  it('propose les dix-neuf espaces du foyer dans la grille', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('link', { name: /Courses/ })).toBeInTheDocument();
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    expect(within(grid).getByRole('link', { name: /Courses/ })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: /Ardoise/ })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: /Fidélité/ })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: /Contacts/ })).toBeInTheDocument();
    // Vingt tuiles : frigo, menu (vague 3.1) et documents (vague 3.2)
    // portent la grille à 20. Tuiles pastel depuis le 23/10 : chaque espace
    // est un lien vers sa page.
    expect(within(grid).getAllByRole('link')).toHaveLength(20);
  });

  it('ouvre le mode personnalisation et permet de masquer un widget', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await screen.findByRole('heading', { level: 1, name: /Bonjour/ });

    await user.click(screen.getByRole('button', { name: 'Personnaliser l’accueil' }));
    expect(screen.getByRole('region', { name: 'Personnalisation des widgets' })).toBeInTheDocument();

    // Le bouton d'un widget porte l'état courant : « Visible » le masque.
    const panel = screen.getByRole('region', { name: 'Personnalisation des widgets' });
    const toggles = within(panel).getAllByRole('button', { name: 'Visible' });
    expect(toggles).toHaveLength(5);
    await user.click(toggles[0]);
    // Le widget masqué disparaît de la grille…
    await waitFor(() => {
      expect(screen.queryByRole('article', { name: 'Widget Calendrier' })).not.toBeInTheDocument();
    });
    // …et peut être réactivé depuis le panneau.
    expect(await within(panel).findByRole('button', { name: 'Masqué' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Widget Tâches' })).toBeInTheDocument();
  });

  it('persiste width: 0 en masquant un widget et le relit comme masqué (CR-01)', async () => {
    // Ce test tourne en mode démo (Dexie/IndexedDB), qui n'a NI contrainte
    // `CHECK` NI RLS : « masquer un widget » y réussissait donc déjà avant la
    // migration 0123 — c'est précisément pourquoi CR-01 a franchi la CI sans
    // être vu. Ce qui est pinné ici, c'est le contrat que 0123 rend légal côté
    // serveur : l'encodage `width: 0` (et non la suppression de la ligne) et
    // la lecture `visible = width > 0`.
    //
    // Membre Thomas : les autres tests de ce fichier travaillent sur Camille,
    // et les écritures que la page lance en « void » peuvent se poser APRÈS le
    // nettoyage d'`afterEach`. Thomas n'a aucun widget semé, donc le panneau
    // suit l'ordre par défaut (Calendrier en premier) et les lignes lues sont
    // exactement celles que ce test écrit.
    useHouseholdStore.setState({
      householdId: DEMO_HOUSEHOLD_ID,
      householdName: demoHousehold.name,
      householdColor: demoHousehold.avatar_color,
      members: demoMembers,
      currentMemberId: DEMO_MEMBERS.thomas,
    });
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />, { withHousehold: false });
    await screen.findByRole('heading', { level: 1, name: /Bonjour/ });

    await user.click(screen.getByRole('button', { name: 'Personnaliser l’accueil' }));
    const panel = screen.getByRole('region', { name: 'Personnalisation des widgets' });
    // Ordre par défaut : le premier bouton « Visible » est celui du Calendrier.
    await user.click(within(panel).getAllByRole('button', { name: 'Visible' })[0]);

    const readWidgets = () =>
      data.list<DashboardWidgetRow>('dashboard_widgets', { member_id: DEMO_MEMBERS.thomas });

    await waitFor(async () => {
      const rows = await readWidgets();
      expect(rows.find((row) => row.widget_type === 'calendrier')?.width).toBe(0);
    });

    const rows = await readWidgets();
    // Masqué, pas supprimé : la préférence existe toujours, une seule fois.
    expect(rows.filter((row) => row.widget_type === 'calendrier')).toHaveLength(1);
    // La lecture du client reste `visible = width > 0`.
    expect(toWidgetPreferences(rows).find((preference) => preference.kind === 'calendrier')?.visible).toBe(false);
    // Les widgets visibles, eux, gardent une largeur > 0 : la même écriture
    // n'a pas fait basculer toute la table à 0.
    expect(rows.find((row) => row.widget_type === 'taches')?.width).toBeGreaterThan(0);
  });

  it('enregistre les préférences sur une lecture vide, sans doubler les lignes (escalade 1)', async () => {
    // Camille a des préférences SEMÉES (`widget-1`…`widget-5`). On force la
    // lecture de `dashboard_widgets` à rendre `[]` : c'est l'état exact dans
    // lequel l'ancien `setWidgetOrder` décidait `create` pour CHAQUE
    // préférence, sous un `id` déterministe (`widget-<membre>-<type>`) distinct
    // de la ligne semée — donc deux lignes pour un même
    // `(member_id, widget_type)`. Hors de cet état, le défaut ne se produit
    // pas : c'est ce qui l'a laissé franchir la CI.
    await data.list('household_members'); // amorce le jeu de démonstration
    const readAll = data.list.bind(data);
    const listSpy = vi.spyOn(data, 'list').mockImplementation((async (table: string, filter?: RowFilter) =>
      table === 'dashboard_widgets' ? [] : readAll(table, filter)) as unknown as typeof data.list);

    // Lecture brute du magasin : `data.list` est simulé pour `dashboard_widgets`.
    const myWidgets = async () => {
      const entries = await getDatabase().rows.where('table').equals('dashboard_widgets').toArray();
      return (entries.map((entry) => entry.data as unknown as DashboardWidgetRow)).filter(
        (row) => row.member_id === DEMO_MEMBERS.camille,
      );
    };

    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await screen.findByRole('heading', { level: 1, name: /Bonjour Camille/ });
    await user.click(screen.getByRole('button', { name: 'Personnaliser l’accueil' }));
    const panel = screen.getByRole('region', { name: 'Personnalisation des widgets' });

    // Le libellé du bouton ne porte pas le nom du widget : on vise la ligne
    // par son intitulé, sinon « premier bouton Visible » dépendrait de l'état
    // laissé par l'écriture précédente.
    const toggleFor = (label: string) => {
      const row = within(panel)
        .getAllByRole('listitem')
        .find((item) => within(item).queryByText(label));
      if (!row) throw new Error(`Ligne « ${label} » introuvable dans le panneau`);
      return within(row).getByRole('button');
    };

    // Premier enregistrement : le Calendrier est masqué…
    await user.click(toggleFor('Calendrier'));
    await waitFor(async () => {
      expect((await myWidgets()).some((row) => row.widget_type === 'calendrier' && row.width === 0)).toBe(true);
    });

    // …puis un second, la lecture restant vide : la fusion doit rester
    // idempotente sur la cible `(member_id, widget_type)`.
    await user.click(toggleFor('Calendrier'));

    await waitFor(async () => {
      const mine = await myWidgets();
      // Cinq types, une ligne chacun : la série parallèle créée à côté des
      // lignes semées (ancien comportement) en laisserait dix.
      expect(mine).toHaveLength(5);
      for (const type of ['calendrier', 'taches', 'meteo', 'anniversaires', 'routines']) {
        expect(mine.filter((row) => row.widget_type === type)).toHaveLength(1);
      }
      // L'écriture a bien eu lieu, et la fusion a visé la ligne semée : son
      // `id` est conservé, sa largeur suit le dernier état (réaffiché).
      const calendrier = mine.find((row) => row.widget_type === 'calendrier');
      expect(calendrier?.id).toBe('widget-1');
      expect(calendrier?.width).toBe(1);
    });

    listSpy.mockRestore();
  });

  it('liste les tâches du jour avec une case à cocher étiquetée', async () => {
    renderWithProviders(<DashboardPage />);
    const widget = await screen.findByRole('article', { name: 'Widget Tâches' });
    // Le premier amorçage du cache local peut dépasser le délai par défaut.
    const checkboxes = await within(widget).findAllByRole('checkbox', {}, { timeout: 5000 });
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(checkboxes[0].getAttribute('aria-label')).toMatch(/^Terminer : /);
  });

  it('masque à un enfant les tuiles et la colonne Ardoise/activité (phase 14, D-05/D-07)', async () => {
    renderWithProviders(<DashboardPage />);
    await screen.findByRole('heading', { level: 1, name: /Bonjour/ });

    act(() => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    });

    // Quinze tuiles : les 5 modules hors périmètre ont disparu, les autres
    // restent byte-identiques. Tuiles-liens depuis le 23/10 (pass adapt).
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    expect(within(grid).getAllByRole('link')).toHaveLength(15);
    for (const name of ['Ardoise', 'Cadeaux', 'Fidélité', 'Prestataires', 'Animaux']) {
      expect(within(grid).queryByRole('link', { name: new RegExp(name) })).not.toBeInTheDocument();
    }
    expect(within(grid).getByRole('link', { name: /Courses/ })).toBeInTheDocument();
    expect(within(grid).getByRole('link', { name: /Contacts/ })).toBeInTheDocument();
    // La colonne latérale qui lit les dépenses disparaît avec elles : aucun
    // total ni aucune ligne d'activité ne fuite vers l'enfant.
    expect(screen.queryByText(/dépenses du foyer/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Activité du foyer' })).not.toBeInTheDocument();
    // Les espaces autorisés restent : anniversaires et courses visibles.
    expect(screen.getByRole('heading', { name: 'Anniversaires' })).toBeInTheDocument();
  });

});
