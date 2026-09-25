import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import PrestatairesPage from './prestataires-page';

describe('PrestatairesPage', () => {
  it('filtre la grille sur le type choisi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    expect(await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atelier Bois & Co' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Type'), 'Artisan');

    expect(screen.getByRole('heading', { name: 'Atelier Bois & Co' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cabinet du Dr Morel' })).not.toBeInTheDocument();
  });

  it('propose un état vide quand la recherche ne renvoie rien', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.type(screen.getByLabelText('Recherche'), 'dentiste');

    expect(screen.getByRole('heading', { name: 'Aucun prestataire trouvé' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByRole('heading', { name: 'Cabinet du Dr Morel' })).toBeInTheDocument();
  });

  it('ajoute un prestataire via le dialogue et le retrouve dans la grille', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Crèche Les Petits Pas');
    await user.selectOptions(within(dialog).getByLabelText(/Type/), 'École');
    await user.type(within(dialog).getByLabelText(/Téléphone/), '04 78 11 22 33');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'contact@lespetitspas.fr');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    const card = await screen.findByRole('heading', { name: 'Crèche Les Petits Pas' });
    const article = card.closest('article');
    expect(article).not.toBeNull();
    expect(within(article as HTMLElement).getByText('École')).toBeInTheDocument();
    expect(within(article as HTMLElement).getByRole('link', { name: '04 78 11 22 33' })).toHaveAttribute(
      'href',
      'tel:0478112233',
    );
  });

  it('valide l’adresse e-mail du formulaire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Plombier');
    await user.type(within(dialog).getByLabelText(/E-mail/), 'pas-un-email');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le contact' }));

    expect(await within(dialog).findByText('Adresse e-mail invalide.')).toBeInTheDocument();
  });

  it('gère les types depuis le dialogue dédié', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PrestatairesPage />, { route: '/prestataires' });

    await screen.findByRole('heading', { name: 'Cabinet du Dr Morel' });
    await user.click(screen.getByRole('button', { name: 'Gérer les types' }));

    const dialog = await screen.findByRole('dialog', { name: 'Gérer les types' });
    await user.type(within(dialog).getByLabelText(/Nom du type/), 'Kinésithérapeute');
    await user.click(within(dialog).getByRole('radio', { name: 'Santé' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le type' }));

    const list = await within(dialog).findByText('Kinésithérapeute');
    expect(list).toBeInTheDocument();
    // Le nouveau type devient disponible dans le formulaire prestataire.
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter un prestataire' }));
    const form = await screen.findByRole('dialog', { name: 'Ajouter un prestataire' });
    expect(within(form).getByLabelText(/Type/)).toHaveDisplayValue('Sans type');
    expect(within(form).getByRole('option', { name: 'Kinésithérapeute' })).toBeInTheDocument();
  });
});
