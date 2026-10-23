import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import FrigoPage from './frigo-page';

/**
 * La page Frigo en mode démo (jeu de semis) : le contenu chargé, les états
 * de péremption, la recherche, le filtre « bientôt périmé », l'ajout et la
 * suppression confirmée.
 */

describe('FrigoPage', () => {
  it('affiche les articles du foyer avec leur pastille de péremption', async () => {
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    // Le jeu de démo : périmé (Crème fraîche), bientôt périmé (Jambon),
    // bon (Yaourts), sans date (Pâtes penne).
    const rows = await screen.findByText('Crème fraîche');
    expect(rows).toBeInTheDocument();
    expect(screen.getByText('Yaourts nature')).toBeInTheDocument();
    expect(screen.getByText('Jambon blanc')).toBeInTheDocument();
    expect(screen.getByText('Pâtes penne')).toBeInTheDocument();

    expect(screen.getAllByText('Périmé').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bientôt périmé').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bon').length).toBeGreaterThanOrEqual(1);
  });

  it('trie par urgence : le périmé remonte en tête', async () => {
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Crème fraîche');
    const list = screen.getAllByText('Crème fraîche')[0].closest('ul');
    expect(list).not.toBeNull();
    const firstRow = list!.children[0];
    expect(within(firstRow as HTMLElement).getByText('Crème fraîche')).toBeInTheDocument();
  });

  it('le filtre « bientôt périmé » ne montre que le urgent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Yaourts nature');
    await user.click(screen.getByRole('button', { name: /Bientôt périmé/ }));

    expect(screen.getByText('Crème fraîche')).toBeInTheDocument();
    expect(screen.getByText('Jambon blanc')).toBeInTheDocument();
    expect(screen.queryByText('Yaourts nature')).not.toBeInTheDocument();
    expect(screen.queryByText('Pâtes penne')).not.toBeInTheDocument();
  });

  it('la recherche filtre les articles par nom', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Yaourts nature');
    await user.type(screen.getByLabelText('Rechercher un article du frigo'), 'yaourts');

    expect(screen.getByText('Yaourts nature')).toBeInTheDocument();
    expect(screen.queryByText('Jambon blanc')).not.toBeInTheDocument();
  });

  it('ajoute un article via le formulaire et le fait apparaître', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Yaourts nature');
    await user.click(screen.getByRole('button', { name: /Ajouter un article/ }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Article/), 'Comté 12 mois');
    await user.type(within(dialog).getByLabelText(/^Quantité/), '300');
    await user.type(within(dialog).getByLabelText(/Unité/), 'g');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter au frigo' }));

    expect(await screen.findByText('Comté 12 mois')).toBeInTheDocument();
    // Le formulaire se referme après un enregistrement réussi.
    await import('@testing-library/react').then(({ waitFor }) =>
      waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()),
    );
  });

  it('supprime un article après confirmation explicite', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Jus de pomme');
    await user.click(screen.getByRole('button', { name: 'Retirer Jus de pomme du frigo' }));

    // Radix AlertDialog expose role="alertdialog".
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Retirer' }));

    await import('@testing-library/react').then(({ waitFor }) =>
      waitFor(() => expect(screen.queryByText('Jus de pomme')).not.toBeInTheDocument()),
    );
  });

  it('montre un état vide sur un emplacement sans article', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FrigoPage />, { route: '/frigo' });

    await screen.findByText('Yaourts nature');
    // Le congélateur ne contient qu'un article : on le retire d'abord.
    await user.click(screen.getByRole('tab', { name: 'Congélateur' }));
    expect(await screen.findByText('Pois du jardin')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer Pois du jardin du frigo' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Retirer' }));

    expect(await screen.findByText('Cet emplacement est vide.')).toBeInTheDocument();
  });
});
