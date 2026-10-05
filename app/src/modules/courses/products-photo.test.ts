import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ProductRow, ShoppingListRow } from '@/types';
import { ProductSheet } from './components/product-sheet';
import { PRODUCTS_TABLE } from './products-api';
import type { OffProduct } from './off-client';
import { compressImage } from '@/modules/cercle/lib/media';
import { depositHouseholdFile } from '@/lib/storage';

/**
 * Persistance photo produit (D-05) : la photo locale compressée part en
 * bucket privé `products` et son URL signée est persistée en `photo_url` ;
 * l'image OFF reste un repli d'affichage jamais persisté.
 *
 * `compressImage` est mockée (pas de `createImageBitmap` sous jsdom) et
 * `depositHouseholdFile` est mocké (pas de Storage en test) : les assertions
 * portent sur le câblage fiche → compression → dépôt → `photo_url`.
 */

vi.mock('@/modules/cercle/lib/media', () => ({
  compressImage: vi.fn(),
  supportsImageBitmap: () => false,
  supportsWebp: () => false,
  MAX_MEDIA_EDGE: 1600,
  WEBP_QUALITY: 0.82,
  JPEG_QUALITY: 0.85,
}));

vi.mock('@/lib/storage', () => ({
  depositHouseholdFile: vi.fn(),
  HOUSEHOLD_MEDIA_BUCKET: 'household-media',
}));

const compressMock = vi.mocked(compressImage);
const depositMock = vi.mocked(depositHouseholdFile);

beforeEach(() => {
  vi.clearAllMocks();
});

const NUTELLA_EAN = '3017620422003';
const OTHER_EAN = '4006381333931';

function nutellaOff(ean = NUTELLA_EAN): OffProduct {
  return {
    ean,
    name: 'Nutella',
    brand: 'Nutella, Ferrero',
    imageUrl: 'https://images.openfoodfacts.org/images/products/301/762/042/2003/front_fr.jpg',
    categoriesTags: ['en:spreads'],
    lang: 'fr',
  };
}

async function createList(name = 'Hebdo'): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>('shopping_lists', {
    household_id: DEMO_HOUSEHOLD_ID,
    name,
    created_by: null,
    created_at: new Date().toISOString(),
  });
}

function renderSheet(listId: string, offProduct: OffProduct | null, ean: string) {
  return renderWithProviders(
    createElement(ProductSheet, {
      open: true,
      onOpenChange: () => undefined,
      offProduct,
      ean,
      listId,
    }),
  );
}

describe('photo produit persistée (D-05)', () => {
  it("upload photo.jpg : dépôt en dossier products et photo_url = URL signée", async () => {
    const user = userEvent.setup();
    const list = await createList();
    compressMock.mockResolvedValue({
      blob: new Blob(['pixels-compresses'], { type: 'image/webp' }),
      mime: 'image/webp',
      name: 'photo.webp',
      originalName: 'photo.jpg',
      size: 18,
      width: 10,
      height: 10,
      previewUrl: 'blob:apercu',
    });
    depositMock.mockResolvedValue({
      url: 'https://signed.example/foyer/products/fichier.webp',
      name: 'photo.jpg',
      mime: 'image/webp',
      size: 18,
    });

    renderSheet(list.id, nutellaOff(), NUTELLA_EAN);

    await user.upload(screen.getByLabelText(/^Photo/), new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

    await screen.findByText(/ajouté à la liste/);
    expect(compressMock).toHaveBeenCalledTimes(1);
    expect(depositMock).toHaveBeenCalledTimes(1);
    expect(depositMock).toHaveBeenCalledWith(expect.objectContaining({ folder: 'products' }));

    const products = await data.list<ProductRow>(PRODUCTS_TABLE, {
      household_id: DEMO_HOUSEHOLD_ID,
      ean: NUTELLA_EAN,
    });
    expect(products).toHaveLength(1);
    expect(products[0].photo_url).toMatch(/^https:\/\//);
  });

  it('sans photo locale : image OFF affichée avec crédit, photo_url null', async () => {
    const user = userEvent.setup();
    const list = await createList();

    renderSheet(list.id, nutellaOff(OTHER_EAN), OTHER_EAN);

    // Repli d'affichage OFF avec crédit, avant même la soumission.
    expect(screen.getByText(/affichage seul, non enregistrée/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));
    await screen.findByText(/ajouté à la liste/);

    expect(depositMock).not.toHaveBeenCalled();
    const products = await data.list<ProductRow>(PRODUCTS_TABLE, {
      household_id: DEMO_HOUSEHOLD_ID,
      ean: OTHER_EAN,
    });
    expect(products).toHaveLength(1);
    expect(products[0].photo_url).toBeNull();
  });

  it('fichier non-image : message et aucun upload tenté', async () => {
    const list = await createList();

    renderSheet(list.id, nutellaOff(), NUTELLA_EAN);

    // `user.upload` filtre comme le sélecteur natif (`accept="image/*"`) :
    // `fireEvent.change` rejoue le contournement « Tous les fichiers ».
    fireEvent.change(screen.getByLabelText(/^Photo/), {
      target: { files: [new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText(/Sélectionnez une image/)).toBeInTheDocument();
    expect(compressMock).not.toHaveBeenCalled();
    expect(depositMock).not.toHaveBeenCalled();
  });
});
