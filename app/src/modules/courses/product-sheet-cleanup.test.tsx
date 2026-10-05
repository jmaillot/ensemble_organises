import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ShoppingListRow } from '@/types';
import { ProductSheet } from './components/product-sheet';
import type { OffProduct } from './off-client';
import { removeHouseholdFile } from '@/lib/storage';

/**
 * Atomicité photo (CR-05) : tout échec APRES un dépôt réussi nettoie l'objet
 * déposé — jamais d'orphelin en bucket. `resolveScannedProduct` est en panne
 * simulée ici ; `removeHouseholdFile` est espionné.
 */

vi.mock('@/modules/cercle/lib/media', () => ({
  compressImage: vi.fn().mockResolvedValue({
    blob: new Blob(['pixels'], { type: 'image/webp' }),
    mime: 'image/webp',
    name: 'photo.webp',
    originalName: 'photo.jpg',
    size: 18,
    width: 10,
    height: 10,
    previewUrl: 'blob:apercu',
  }),
  supportsImageBitmap: () => false,
  supportsWebp: () => false,
  MAX_MEDIA_EDGE: 1600,
  WEBP_QUALITY: 0.82,
  JPEG_QUALITY: 0.85,
}));

vi.mock('@/lib/storage', () => ({
  depositHouseholdFile: vi
    .fn()
    .mockResolvedValue({ url: 'https://signed.example/p.webp', path: 'hh/products/p.webp', name: 'p.jpg', mime: 'image/webp', size: 18 }),
  removeHouseholdFile: vi.fn().mockResolvedValue(undefined),
  HOUSEHOLD_MEDIA_BUCKET: 'household-media',
}));

vi.mock('./products-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./products-api')>()),
  resolveScannedProduct: vi.fn().mockRejectedValue(new Error('panne simulée')),
}));

const removeMock = vi.mocked(removeHouseholdFile);

const off: OffProduct = {
  ean: '3017620422003',
  name: 'Nutella',
  brand: null,
  imageUrl: null,
  categoriesTags: [],
  lang: 'fr',
};

describe('ProductSheet — nettoyage après échec (CR-05)', () => {
  it("un dépôt suivi d'un échec supprime l'objet déposé", async () => {
    const user = userEvent.setup();
    const list = await data.create<ShoppingListRow>('shopping_lists', {
      household_id: DEMO_HOUSEHOLD_ID,
      name: 'Hebdo',
      created_by: null,
      created_at: new Date().toISOString(),
    });

    renderWithProviders(
      createElement(ProductSheet, {
        open: true,
        onOpenChange: () => undefined,
        offProduct: off,
        ean: off.ean,
        lists: [{ id: list.id, name: 'Hebdo' }],
      }),
    );

    await user.upload(screen.getByLabelText(/^Photo/), new File(['pixels'], 'photo.jpg', { type: 'image/jpeg' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

    expect(await screen.findByText(/panne simulée/)).toBeInTheDocument();
    expect(removeMock).toHaveBeenCalledWith('hh/products/p.webp');
  });
});
