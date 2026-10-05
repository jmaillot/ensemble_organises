import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ProductRow, ShoppingListItemRow, ShoppingListRow } from '@/types';
import CoursesPage from './courses-page';
import { ScanDialog } from './components/scan-dialog';
import { ProductSheet } from './components/product-sheet';
import { fetchOffProduct, type OffProduct } from './off-client';
import { PRODUCTS_TABLE } from './products-api';
import * as productsApi from './products-api';
import { KNOWN_EAN, UNKNOWN_EAN, offHandlers } from '@/test/mocks/off-handlers';

/**
 * Parcours scan Courses : dialogue → enrichissement OFF (MSW) → fiche 1-tap.
 * Le harnais câble `onDetected` vers `fetchOffProduct` puis la fiche, comme
 * `courses-page.tsx` le fait en production.
 */

const server = setupServer(...offHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function createList(name = 'Fresque'): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>('shopping_lists', {
    household_id: DEMO_HOUSEHOLD_ID,
    name,
    created_by: null,
    created_at: new Date().toISOString(),
  });
}

function ScanHarness({ listId }: { listId: string }) {
  const [scanOpen, setScanOpen] = useState(true);
  const [sheet, setSheet] = useState<{ ean: string; off: OffProduct | null } | null>(null);
  return (
    <>
      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onManual={() => {
          setScanOpen(false);
          setSheet({ ean: '', off: null });
        }}
        onDetected={(value) => {
          setScanOpen(false);
          void fetchOffProduct(value).then((off) => setSheet({ ean: value.trim(), off }));
        }}
      />
      {sheet ? (
        <ProductSheet open onOpenChange={() => undefined} offProduct={sheet.off} ean={sheet.ean} listId={listId} />
      ) : null}
    </>
  );
}

async function submitEan(user: ReturnType<typeof userEvent.setup>, ean: string) {
  await user.type(screen.getByLabelText(/code-barres/i), ean);
  await user.click(screen.getByRole('button', { name: 'Utiliser ce code' }));
}

describe('ScanDialog sur la page Courses', () => {
  it('le bouton Scanner ouvre le dialogue de scan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await screen.findByRole('region', { name: 'Fresque' });
    await user.click(screen.getByRole('button', { name: /scanner/i }));

    expect(await screen.findByLabelText('Aperçu de la caméra')).toBeInTheDocument();
  });

  it('sans caméra, la saisie manuelle est proposée sans écran blanc', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await screen.findByRole('region', { name: 'Fresque' });
    await user.click(screen.getByRole('button', { name: /scanner/i }));

    expect(await screen.findByLabelText('Aperçu de la caméra')).toBeInTheDocument();
    // Message du hook et aide du champ : les deux portent le repli manuel.
    expect(screen.getAllByText(/saisissez le code à la main/i).length).toBeGreaterThan(0);
  });
});

describe('fiche produit 1-tap', () => {
  it('EAN connu : fiche pré-remplie (nom, marque, bouton unique)', async () => {
    const user = userEvent.setup();
    const list = await createList();
    renderWithProviders(<ScanHarness listId={list.id} />);

    await submitEan(user, KNOWN_EAN);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nutella')).toBeInTheDocument();
    expect(within(dialog).getByText(/Ferrero/)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Enregistrer et ajouter à la liste' }),
    ).toBeInTheDocument();
  });

  it('EAN inconnu (404) : formulaire manuel nom + rayon, sans erreur', async () => {
    const user = userEvent.setup();
    const list = await createList();
    renderWithProviders(<ScanHarness listId={list.id} />);

    await submitEan(user, UNKNOWN_EAN);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Produit non trouvé — créez-le')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Nom/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Rayon/)).toBeInTheDocument();
  });

  it('1-tap : produit créé + article présent + toast, photo OFF non persistée', async () => {
    const user = userEvent.setup();
    const list = await createList();
    renderWithProviders(<ScanHarness listId={list.id} />);

    await submitEan(user, KNOWN_EAN);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

    await screen.findByText(/ajouté à la liste/);

    const products = await data.list<ProductRow>(PRODUCTS_TABLE, { household_id: DEMO_HOUSEHOLD_ID });
    expect(products).toHaveLength(1);
    expect(products[0].ean).toBe(KNOWN_EAN);
    expect(products[0].name).toBe('Nutella');
    // T-04-06 : l'image OFF reste un affichage transitoire, jamais persistée.
    expect(products[0].photo_url).toBeNull();

    const items = await data.list<ShoppingListItemRow>('shopping_list_items', { list_id: list.id });
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe(products[0].id);
  });

  it('refus serveur relayé en toast, fiche conservée (T-04-07)', async () => {
    const user = userEvent.setup();
    const list = await createList();
    const spy = vi
      .spyOn(productsApi, 'resolveScannedProduct')
      .mockRejectedValueOnce(new Error('Écriture refusée par le foyer.'));
    try {
      renderWithProviders(<ScanHarness listId={list.id} />);

      await submitEan(user, KNOWN_EAN);
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

      await screen.findByText('Écriture refusée par le foyer.');
      // La fiche reste ouverte pour corriger ou réessayer.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      spy.mockRestore();
    }
  });

  it('création manuelle sur 404 : produit du foyer enregistré et ajouté', async () => {
    const user = userEvent.setup();
    const list = await createList();
    renderWithProviders(<ScanHarness listId={list.id} />);

    await submitEan(user, UNKNOWN_EAN);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Nom/), 'Miel artisanal');
    await user.selectOptions(within(dialog).getByLabelText(/^Rayon/), 'Divers');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

    await screen.findByText(/ajouté à la liste/);
    await waitFor(async () => {
      const products = await data.list<ProductRow>(PRODUCTS_TABLE, { household_id: DEMO_HOUSEHOLD_ID });
      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Miel artisanal');
    });
  });

  it('1-tap via la vraie page : l’article apparaît en liste sans rechargement', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CoursesPage />);

    await screen.findByRole('region', { name: 'Fresque' });
    await user.click(screen.getByRole('button', { name: /scanner/i }));
    await user.type(screen.getByLabelText(/code-barres/i), KNOWN_EAN);
    await user.click(screen.getByRole('button', { name: 'Utiliser ce code' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Nutella' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer et ajouter à la liste' }));

    await screen.findByText(/ajouté à la liste/);
    // Régression 04-03 : la fiche écrivait via `data.*` hors hook sans
    // invalider TanStack — l'article existait en Dexie mais restait invisible.
    await screen.findByRole('checkbox', { name: 'Terminer Nutella' });
  });
});
