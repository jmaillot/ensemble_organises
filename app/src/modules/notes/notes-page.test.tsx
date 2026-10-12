import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotesPage from './notes-page';
import { renderWithProviders } from '@/test/render';

/** jsdom n'implémente pas `scrollIntoView`, utilisé par Radix à l'ouverture d'un dialogue. */
function supportScrollIntoView() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  }
}

describe('NotesPage', () => {
  it('filtre les notes avec la recherche plein texte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
    expect(screen.getByText('Idées de week-end')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Rechercher une note' });
    await user.type(search, 'week-end');

    expect(screen.getByText('Idées de week-end')).toBeInTheDocument();
    expect(screen.queryByText('Liste de rentrée')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'kangourou');
    expect(screen.getByText('Aucune note ne correspond à votre recherche.')).toBeInTheDocument();
  });

  it('filtre les notes par catégorie', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    const group = await screen.findByRole('group', { name: 'Filtrer par catégorie' });
    await user.click(within(group).getByRole('button', { name: 'Foyer' }));

    expect(screen.getByText('À demander à Léa')).toBeInTheDocument();
    expect(screen.queryByText('Liste de rentrée')).not.toBeInTheDocument();
  });

  it('valide puis crée une note depuis le dialogue', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer une note' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));
    expect(await within(dialog).findByText('Donnez un titre à votre note.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Titre/), 'Courses de la semaine');
    await user.type(within(dialog).getByLabelText(/Contenu/), 'Yaourts, fruits et lait d’agne.');
    await user.selectOptions(within(dialog).getByLabelText(/Visibilité/), 'foyer');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));

    expect(await screen.findByText('Courses de la semaine')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('joint un PDF à la création et l’affiche sur la carte', async () => {
    supportScrollIntoView();
    // Mode démo : le dépôt renvoie un aperçu local.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:piece-jointe' });
    try {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage />, { route: '/notes' });

      expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Créer une note' }));

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Titre/), 'Note avec pièce jointe');
      await user.type(within(dialog).getByLabelText(/Contenu/), 'Voir le document joint.');
      await user.upload(
        within(dialog).getByLabelText(/Joindre des fichiers/),
        new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' }),
      );
      expect(await within(dialog).findByText(/devis\.pdf/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));

      expect(await screen.findByText('Note avec pièce jointe')).toBeInTheDocument();
      // Le dialogue ne se referme qu'après le dépôt : attendre sa fermeture
      // prouve le circuit complet, pas seulement la création de la note.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('devis.pdf')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
