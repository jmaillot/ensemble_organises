import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import CoursesPage from './courses-page';
import ProductCatalogPage from './product-catalog-page';

/** Chaque liste est une `section` étiquetée par son nom. */
const listRegion = (name: string) => screen.getByRole('region', { name });

/** Les listes sont derrière des onglets : n'affiche que celle demandée. */
async function selectList(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('tab', { name }));
}

/**
 * dnd-kit mesure pour de vrai : jsdom rend des rectangles nuls, donc aucune
 * cible n'est désignable et le dépôt n'a lieu nulle part. Chaque article reçoit
 * ici une bande verticale distincte, ce qui rend le geste clavier
 * déterministe : Espace saisit, la flèche descend d'un cran, Espace dépose.
 */
const ITEM_HEIGHT = 56;

function stubItemRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function stub(this: Element) {
    const element = this as HTMLElement;
    const isItem = element.tagName === 'LI';
    const index = element.parentElement ? Array.from(element.parentElement.children).indexOf(element) : 0;
    const height = isItem ? ITEM_HEIGHT : 600;
    const top = isItem ? 100 + index * ITEM_HEIGHT : 0;
    return {
      x: 0,
      y: top,
      width: 300,
      height,
      top,
      left: 0,
      right: 300,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

/** Saisit la poignée, descend d'un cran, dépose. */
async function dragItemDown(user: ReturnType<typeof userEvent.setup>, name: string) {
  const grip = screen.getByRole('button', { name: `Réordonner : ${name}` });
  grip.focus();
  await user.keyboard(' ');
  await user.keyboard('{ArrowDown}');
  await user.keyboard(' ');
}

/** Les noms des articles affichés, dans l'ordre où l'utilisateur les voit. */
function visibleItemNames(name: string) {
  return within(listRegion(name))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '');
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
    expect((screen.getByLabelText(/Rayon/) as HTMLSelectElement).value).toBe('Entretien & Nettoyage');
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
    await user.selectOptions(within(dialog).getByLabelText(/^Rayon/), 'Crèmerie & Produits laitiers');
    await user.selectOptions(within(dialog).getByLabelText(/^Liste/), 'Fresque');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter l’article' }));

    await waitFor(() => {
      expect(within(listRegion('Fresque')).getByText('Œufs')).toBeInTheDocument();
    });
    expect(within(listRegion('Fresque')).getByText('12 pièces · Crèmerie & Produits laitiers')).toBeInTheDocument();
  });

  it('regroupe les articles par rayon, ou les laisse dans l’ordre du foyer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    await selectList(user, 'Maison');

    const maison = await screen.findByRole('region', { name: 'Maison' });
    // Vue par défaut : les articles sont rangés sous un en-tête de rayon.
    expect(within(maison).getByText('Hygiène & Beauté')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Regroupement'), 'ordre');
    await waitFor(() => {
      expect(within(listRegion('Maison')).queryByText('Hygiène & Beauté')).not.toBeInTheDocument();
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

  it('propose les correspondances catalogue pendant la frappe', async () => {
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

      const menu = await screen.findByRole('listbox', { name: 'Produits du catalogue correspondants' });
      await user.click(within(menu).getByRole('button', { name: 'Comté affiné' }));
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
      // Le nettoie ne retire que le produit créé par le test : le catalogue
      // du foyer peut contenir d'autres produits (la graine en a).
      const rows = (await data.list('products', { household_id: DEMO_HOUSEHOLD_ID })) as {
        id: string;
        ean: string;
      }[];
      await Promise.all(
        rows.filter((row) => row.ean === '3017620422003').map((row) => data.remove('products', row.id)),
      );
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
    await user.selectOptions(within(dialog).getByLabelText(/Rayon/), 'Entretien & Nettoyage');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    const row = screen.getByText('Savon liquide').closest('li') as HTMLElement;
    expect(within(row).getByText(/Entretien & Nettoyage/)).toBeInTheDocument();
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

  it('un nom approchant sans match exact ouvre la création (Marss, pas Mars)', async () => {
    const user = userEvent.setup();
    await data.create('products', {
      household_id: DEMO_HOUSEHOLD_ID,
      ean: '3019620432003',
      name: 'Mars',
      brand: null,
      category: 'Divers',
      photo_url: null,
      off_data: {},
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    try {
      renderWithProviders(<CoursesPage />);

      const champ = await screen.findByLabelText('Ajouter un article à la liste Fresque');
      await user.type(champ, 'Marss');
      // Le dropdown propose Mars, mais Entrée crée bien « Marss ».
      expect(await screen.findByRole('listbox', { name: 'Produits du catalogue correspondants' })).toBeInTheDocument();
      await user.keyboard('{Enter}');

      expect(await screen.findByText(/n’est pas au catalogue/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Confirmer l’ajout de Marss' }));
      await waitFor(() => {
        expect(within(listRegion('Fresque')).getByText('Marss')).toBeInTheDocument();
      });
    } finally {
      // Le nettoie ne retire que le produit créé par le test : le catalogue
      // du foyer peut contenir d'autres produits (la graine en a).
      const rows = (await data.list('products', { household_id: DEMO_HOUSEHOLD_ID })) as {
        id: string;
        ean: string;
      }[];
      await Promise.all(
        rows.filter((row) => row.ean === '3017620422003').map((row) => data.remove('products', row.id)),
      );
      const items = (await data.list('shopping_list_items', { household_id: DEMO_HOUSEHOLD_ID })) as {
        id: string;
        name: string;
      }[];
      await Promise.all(
        items.filter((item) => item.name === 'Marss').map((item) => data.remove('shopping_list_items', item.id)),
      );
    }
  });

  it('un article déjà présent propose de modifier sa quantité', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    await selectList(user, 'Maison');

    const champ = await screen.findByLabelText('Ajouter un article à la liste Maison');
    await user.type(champ, 'Savon liquide');
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/est déjà dans la liste/)).toBeInTheDocument();
    const qty = screen.getByLabelText(/Quantité/) as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, '5');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    await waitFor(() => {
      const row = screen.getByText('Savon liquide').closest('li') as HTMLElement;
      expect(within(row).getByText(/5/)).toBeInTheDocument();
    });
  });

  it('imprime la liste par rayon même dans la vue « l’ordre du foyer », puis retire la feuille', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    try {
      renderWithProviders(<CoursesPage />);
      await selectList(user, 'Maison');
      await user.selectOptions(screen.getByLabelText('Regroupement'), 'ordre');
      await waitFor(() => {
        expect(within(listRegion('Maison')).queryByText('Hygiène & Beauté')).not.toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Imprimer' }));

      expect(print).toHaveBeenCalledTimes(1);
      const sheet = document.querySelector('.courses-print');
      expect(sheet).not.toBeNull();
      // La feuille range par rayon : c'est le parcours en magasin qui compte,
      // pas l'ordre dans lequel les articles ont été saisis.
      expect(within(sheet as HTMLElement).getByText('Hygiène & Beauté')).toBeInTheDocument();
      expect(within(sheet as HTMLElement).getByText('Savon liquide')).toBeInTheDocument();
      expect(sheet?.textContent).toContain('☐');

      // `afterprint` est émis à la fermeture du dialogue (annulation comprise).
      act(() => {
        window.dispatchEvent(new Event('afterprint'));
      });
      expect(document.querySelector('.courses-print')).toBeNull();
    } finally {
      print.mockRestore();
    }
  });
});

describe('Module Courses — l’ordre du foyer (0139)', () => {
  it('réordonne les articles à la poignée, et l’ordre tient après le rechargement', async () => {
    stubItemRects();
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    await selectList(user, 'Fresque');
    await user.selectOptions(screen.getByLabelText('Regroupement'), 'ordre');

    await waitFor(() => {
      expect(visibleItemNames('Fresque')[0]).toContain('Yaourts');
    });
    expect(visibleItemNames('Fresque')[1]).toContain('Fruits');

    await dragItemDown(user, 'Yaourts');

    // Le dépôt a survécu au rechargement de la liste : le rang est écrit en
    // base, pas seulement dans l'écran.
    await waitFor(() => {
      expect(visibleItemNames('Fresque')[1]).toContain('Yaourts');
    });
    expect(visibleItemNames('Fresque')[0]).toContain('Fruits');
  });

  it('range aussi les articles dans la vue par rayon', async () => {
    stubItemRects();
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    await selectList(user, 'Fresque');

    // Vue par défaut : les trois articles du foyer sont rangés sous LEUR
    // rayon — « Frais » est normalisé en « Crèmerie & Produits laitiers ».
    await waitFor(() => {
      expect(within(listRegion('Fresque')).getByText('Crèmerie & Produits laitiers')).toBeInTheDocument();
    });
    expect(visibleItemNames('Fresque')[0]).toContain('Yaourts');

    await dragItemDown(user, 'Yaourts');

    await waitFor(() => {
      expect(visibleItemNames('Fresque')[1]).toContain('Yaourts');
    });
  });

  it('n’offre pas de poignée à un enfant', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);
    // Le rendu remet le foyer de démonstration en place : le membre change
    // APRÈS, sinon le test porterait sur Camille.
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });
    try {
      await selectList(user, 'Fresque');
      await waitFor(() => {
        expect(within(listRegion('Fresque')).getByText('Yaourts')).toBeInTheDocument();
      });
      // Le serveur refuserait l’écriture : une poignée qui ne peut pas faire
      // son geste ne doit pas s’afficher.
      expect(screen.queryByRole('button', { name: /Réordonner : Yaourts/ })).not.toBeInTheDocument();
    } finally {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.camille });
    }
  });
});
