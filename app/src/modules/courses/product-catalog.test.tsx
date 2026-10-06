import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ProductRow } from '@/types';
import { Route, Routes } from 'react-router';
import ProductCatalogPage from './product-catalog-page';

function renderCatalogue() {
  return renderWithProviders(
    <Routes>
      <Route path="/courses/catalogue" element={<ProductCatalogPage />} />
    </Routes>,
    { route: '/courses/catalogue' },
  );
}

async function seedProduct() {
  return data.create<ProductRow>('products', {
    household_id: DEMO_HOUSEHOLD_ID,
    ean: '3017620422003',
    name: 'Nutella',
    brand: 'Ferrero',
    category: 'Divers',
    photo_url: null,
    off_data: {},
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

describe('ProductCatalog', () => {
  it('liste les produits scannés du foyer', async () => {
    await seedProduct();
    try {
      renderCatalogue();
      const heading = await screen.findByRole('heading', { name: 'Catalogue des produits scannés' });
      const panel = heading.closest('section') as HTMLElement;
      expect(await within(panel).findByText('Nutella')).toBeInTheDocument();
      expect(within(panel).getByText(/3017620422003/)).toBeInTheDocument();
    } finally {
      const rows = (await data.list<ProductRow>('products', { ean: '3017620422003' })) as ProductRow[];
      await Promise.all(rows.map((row) => data.remove('products', row.id)));
    }
  });

  it('modifie nom, rayon et code-barres', async () => {
    const user = userEvent.setup();
    const created = await seedProduct();
    try {
      renderCatalogue();
      await user.click(await screen.findByRole('button', { name: 'Modifier Nutella' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le produit' });

      await user.clear(within(dialog).getByLabelText(/Nom/));
      await user.type(within(dialog).getByLabelText(/Nom/), 'Pâte à tartiner');
      await user.selectOptions(within(dialog).getByLabelText(/Rayon/), 'Épicerie sucrée');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

      expect(await screen.findAllByText('Pâte à tartiner')).not.toHaveLength(0);
      const heading = screen.getByRole('heading', { name: 'Catalogue des produits scannés' });
      const panel = heading.closest('section') as HTMLElement;
      expect(await within(panel).findByText('Pâte à tartiner')).toBeInTheDocument();
      const rows = await data.list<ProductRow>('products', { id: created.id });
      expect(rows[0]).toMatchObject({ name: 'Pâte à tartiner', category: 'Épicerie sucrée' });
    } finally {
      await data.remove('products', created.id).catch(() => undefined);
    }
  });

  it('refuse un code-barres invalide', async () => {
    const user = userEvent.setup();
    const created = await seedProduct();
    try {
      renderCatalogue();
      await user.click(await screen.findByRole('button', { name: 'Modifier Nutella' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier le produit' });

      await user.clear(within(dialog).getByLabelText(/Code-barres/));
      await user.type(within(dialog).getByLabelText(/Code-barres/), 'ABC');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

      expect(await within(dialog).findByText(/8 à 14 chiffres/)).toBeInTheDocument();
    } finally {
      await data.remove('products', created.id).catch(() => undefined);
    }
  });

  it('filtre par rayon via les onglets', async () => {
    const user = userEvent.setup();
    const frais = await seedProduct();
    const autre = await data.create<ProductRow>('products', {
      household_id: DEMO_HOUSEHOLD_ID,
      ean: '5000159515154',
      name: 'Savon',
      brand: null,
      category: 'Hygiène',
      photo_url: null,
      off_data: {},
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    try {
      renderCatalogue();
      const heading = await screen.findByRole('heading', { name: 'Catalogue des produits scannés' });
      const panel = heading.closest('section') as HTMLElement;
      expect(await within(panel).findByText('Nutella')).toBeInTheDocument();
      expect(within(panel).getByText('Savon')).toBeInTheDocument();

      await user.click(within(panel).getByRole('tab', { name: 'Hygiène & Beauté' }));
      expect(await within(panel).findByText('Savon')).toBeInTheDocument();
      expect(within(panel).queryByText('Nutella')).not.toBeInTheDocument();

      await user.click(within(panel).getByRole('tab', { name: 'Tous' }));
      expect(await within(panel).findByText('Nutella')).toBeInTheDocument();
    } finally {
      await data.remove('products', frais.id).catch(() => undefined);
      await data.remove('products', autre.id).catch(() => undefined);
    }
  });
});

describe('ProductCatalog — photos', () => {
  it('affiche la photo téléversée, sinon le repli OFF, sinon un repère', async () => {
    const make = (name: string, ean: string, photo_url: string | null, off_data: Record<string, unknown>) =>
      data.create<ProductRow>('products', {
        household_id: DEMO_HOUSEHOLD_ID,
        ean,
        name,
        brand: null,
        category: 'Divers',
        photo_url,
        off_data,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    const avec = await make('AvecPhoto', '3017620422003', 'https://signed.example/p.webp', {});
    const repli = await make(
      'RepliOff',
      '5000159515154',
      null,
      { image_url: 'https://images.openfoodfacts.org/p.jpg' },
    );
    const sans = await make('SansPhoto', '4006381333931', null, {});
    try {
      renderCatalogue();
      const heading = await screen.findByRole('heading', { name: 'Catalogue des produits scannés' });
      const panel = heading.closest('section') as HTMLElement;
      await within(panel).findByText('AvecPhoto');

      const rowOf = (name: string) => within(panel).getByText(name).closest('li') as HTMLElement;
      const imgOf = (name: string) => rowOf(name).querySelector('img');
      expect(imgOf('AvecPhoto')?.getAttribute('src')).toBe('https://signed.example/p.webp');
      expect(imgOf('RepliOff')?.getAttribute('src')).toBe('https://images.openfoodfacts.org/p.jpg');
      expect(imgOf('SansPhoto')).toBeNull();
    } finally {
      await data.remove('products', avec.id).catch(() => undefined);
      await data.remove('products', repli.id).catch(() => undefined);
      await data.remove('products', sans.id).catch(() => undefined);
    }
  });
});
