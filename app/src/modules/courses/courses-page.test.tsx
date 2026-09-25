import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CoursesPage from './courses-page';

/** Chaque liste est une `section` étiquetée par son nom. */
const listRegion = (name: string) => screen.getByRole('region', { name });

describe('Module Courses', () => {
  it('coche un article, le passe dans le panier et met à jour le compteur de la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    const fresque = await screen.findByRole('region', { name: 'Fresque' });
    expect(within(fresque).getByText('0/3')).toBeInTheDocument();

    await user.click(within(fresque).getByRole('checkbox', { name: 'Terminer Yaourts' }));

    await waitFor(() => {
      expect(within(listRegion('Fresque')).getByText('1/3')).toBeInTheDocument();
    });
    expect(within(listRegion('Fresque')).getByRole('checkbox', { name: 'Rouvrir Yaourts' })).toBeChecked();
    // La ligne cochée affiche l'état « dans le panier » et son nom est barré.
    const nom = within(listRegion('Fresque')).getByText('Yaourts');
    const ligne = nom.closest('li') as HTMLElement;
    expect(within(ligne).getByText('dans le panier')).toBeInTheDocument();
    expect(nom).toHaveClass('line-through');
    expect(within(listRegion('Fresque')).getByText('2 à acheter')).toBeInTheDocument();
  });

  it('ajoute un article au clavier depuis le champ d’ajout rapide', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    const champ = await screen.findByLabelText('Ajouter un article à la liste Maison');
    await user.type(champ, 'Éponges');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(within(listRegion('Maison')).getByText('Éponges')).toBeInTheDocument();
    });
    expect(within(listRegion('Maison')).getByText('1/3')).toBeInTheDocument();
    expect(champ).toHaveValue('');
  });

  it('valide le formulaire article et refuse un nom vide', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await screen.findByRole('region', { name: 'Fresque' });
    await user.click(screen.getByRole('button', { name: 'Ajouter un article' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Ajouté par')).toHaveValue('Camille Martin');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Indiquez l’article à acheter.');

    await user.type(within(dialog).getByLabelText(/^Article/), 'Œufs');
    await user.type(within(dialog).getByLabelText(/^Quantité/), '12');
    await user.type(within(dialog).getByLabelText(/^Unité/), 'pièces');
    await user.selectOptions(within(dialog).getByLabelText(/^Rayon/), 'Frais');
    await user.selectOptions(within(dialog).getByLabelText(/^Liste/), 'Fresque');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));

    await waitFor(() => {
      expect(within(listRegion('Fresque')).getByText('Œufs')).toBeInTheDocument();
    });
    expect(within(listRegion('Fresque')).getByText('12 pièces · Frais')).toBeInTheDocument();
  });

  it('regroupe les articles par rayon puis par ordre d’ajout', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    const maison = await screen.findByRole('region', { name: 'Maison' });
    // Vue par défaut : les articles sont rangés sous un en-tête de rayon.
    expect(within(maison).getByText('Hygiène')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Regroupement'), 'ajout');
    await waitFor(() => {
      expect(within(listRegion('Maison')).queryByText('Hygiène')).not.toBeInTheDocument();
    });
    expect(within(listRegion('Maison')).getByText('Savon liquide')).toBeInTheDocument();
  });

  it('supprime un article après confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Supprimer Savon liquide' }));
    const confirmation = await screen.findByRole('alertdialog');
    await user.click(within(confirmation).getByRole('button', { name: 'Supprimer l’article' }));

    await waitFor(() => {
      expect(screen.queryByText('Savon liquide')).not.toBeInTheDocument();
    });
  });

  it('crée une liste depuis l’en-tête du module', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await screen.findByRole('region', { name: 'Fresque' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle liste' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom de la liste/), 'Weekend');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la liste' }));

    expect(await screen.findByRole('region', { name: 'Weekend' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Weekend' })).getByText('Cette liste est vide : ajoutez le premier article.')).toBeInTheDocument();
  });
});
