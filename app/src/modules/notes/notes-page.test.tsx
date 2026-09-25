import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
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
});
