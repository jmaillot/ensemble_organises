import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import DashboardPage from './dashboard-page';
import { layoutWidgets, reorderPreferences, resetPreferences, toggleWidget } from './types';

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
  it('affiche le greeting, le foyer et les cinq widgets', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour Camille/ })).toBeInTheDocument();
    expect(screen.getByText(/Foyer Martin/)).toBeInTheDocument();

    const widgets = screen.getAllByRole('article', { name: /^Widget / });
    expect(widgets).toHaveLength(5);
    expect(within(screen.getByRole('article', { name: 'Widget Calendrier' })).getByText(/septembre/)).toBeInTheDocument();
  });

  it('propose les seize espaces du foyer dans la grille', async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('button', { name: /Courses/ })).toBeInTheDocument();
    const grid = screen.getByRole('list', { name: 'Espaces du foyer' });
    expect(within(grid).getByRole('button', { name: /Courses/ })).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /Ardoise/ })).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: /Fidélité/ })).toBeInTheDocument();
    expect(within(grid).getAllByRole('button')).toHaveLength(16);
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

  it('liste les tâches du jour avec une case à cocher étiquetée', async () => {
    renderWithProviders(<DashboardPage />);
    const widget = await screen.findByRole('article', { name: 'Widget Tâches' });
    // Le premier amorçage du cache local peut dépasser le délai par défaut.
    const checkboxes = await within(widget).findAllByRole('checkbox', {}, { timeout: 5000 });
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(checkboxes[0].getAttribute('aria-label')).toMatch(/^Terminer : /);
  });

  it('ouvre le dialogue d’ajout de tâche depuis l’accueil', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter une tâche' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de la tâche/)).toBeInTheDocument();
  });
});
