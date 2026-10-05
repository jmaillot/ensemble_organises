import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import CoursesPage from './courses-page';
import ProductCatalogPage from './product-catalog-page';

/** Chaque liste est une `section` étiquetée par son nom. */
const listRegion = (name: string) => screen.getByRole('region', { name });

/** Les listes sont derrière des onglets : n'affiche que celle demandée. */
async function selectList(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('tab', { name }));
}

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
    await selectList(user, 'Maison');

    const champ = await screen.findByLabelText('Ajouter un article à la liste Maison');
    await user.type(champ, 'Éponges');
    await user.keyboard('{Enter}');

    // Inconnu du catalogue : mini-formulaire rayon (deviné) + quantité.
    expect(await screen.findByText(/n’est pas au catalogue/)).toBeInTheDocument();
    expect((screen.getByLabelText(/Rayon/) as HTMLSelectElement).value).toBe('Ménage');
    await user.click(screen.getByRole('button', { name: 'Confirmer l’ajout de Éponges' }));

    await waitFor(() => {
      expect(within(listRegion('Maison')).getByText('Éponges')).toBeInTheDocument();
    });
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
    await selectList(user, 'Maison');

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
    await selectList(user, 'Maison');

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

  it('n’affiche que la liste sélectionnée derrière les onglets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    // Par défaut : la première liste seule.
    expect(await screen.findByRole('region', { name: 'Fresque' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Maison' })).not.toBeInTheDocument();

    await selectList(user, 'Maison');
    expect(await screen.findByRole('region', { name: 'Maison' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fresque' })).not.toBeInTheDocument();
  });

  it('propose les correspondances catalogue avant de créer', async () => {
    const user = userEvent.setup();
    await data.create('products', {
      household_id: DEMO_HOUSEHOLD_ID,
      ean: '3017620422003',
      name: 'Comté affiné',
      brand: null,
      category: 'Frais',
      photo_url: null,
      off_data: {},
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    try {
      renderWithProviders(<CoursesPage />);

      const champ = await screen.findByLabelText('Ajouter un article à la liste Fresque');
      await user.type(champ, 'comté');
      await user.keyboard('{Enter}');

      const intro = await screen.findByText(/Produits du catalogue pour/);
      const buttonsRow = intro.nextElementSibling as HTMLElement;
      await user.click(within(buttonsRow).getByRole('button', { name: 'Comté affiné' }));
      await waitFor(() => {
        expect(within(listRegion('Fresque')).getByText('Comté affiné')).toBeInTheDocument();
      });
      const rows = (await data.list('shopping_list_items', { household_id: DEMO_HOUSEHOLD_ID })) as {
        name: string;
        product_id: string | null;
      }[];
      const created = rows.find((row) => row.name === 'Comté affiné');
      expect(created?.product_id).not.toBeNull();
    } finally {
      const rows = (await data.list('products', { household_id: DEMO_HOUSEHOLD_ID })) as { id: string }[];
      await Promise.all(rows.map((row) => data.remove('products', row.id)));
      const items = (await data.list('shopping_list_items', { household_id: DEMO_HOUSEHOLD_ID })) as {
        id: string;
        name: string;
      }[];
      await Promise.all(
        items.filter((item) => item.name === 'Comté affiné').map((item) => data.remove('shopping_list_items', item.id)),
      );
    }
  });

  it('modifie le rayon d’un article depuis la liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    await selectList(user, 'Maison');

    await user.click(await screen.findByRole('button', { name: 'Modifier Savon liquide' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier l’article' });
    await user.selectOptions(within(dialog).getByLabelText(/Rayon/), 'Ménage');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const row = screen.getByText('Savon liquide').closest('li') as HTMLElement;
    expect(within(row).getByText(/Ménage/)).toBeInTheDocument();
  });

  it('le bouton Catalogue ouvre la page catalogue', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/catalogue" element={<ProductCatalogPage />} />
      </Routes>,
      { route: '/courses' },
    );

    await user.click(await screen.findByRole('button', { name: 'Catalogue' }));
    expect(await screen.findByRole('heading', { name: 'Catalogue des produits scannés' })).toBeInTheDocument();
  });
});
