import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders, createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { data } from '@/lib/data';
import { getDatabase } from '@/lib/data/dexie';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import type { ProductRow, ShoppingListItemRow, ShoppingListRow } from '@/types';
import { useCourses } from './hooks/use-courses';
import { PRODUCTS_TABLE } from './products-api';

/**
 * Suggestions foyer-first (D-03), re-scan +1 (D-04) et hors-ligne Dexie
 * (D-06) : le hook lit les produits via `useResource('products')`, déjà
 * synchronisé en lignes Dexie par l'adaptateur.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCoursesHook() {
  seedHouseholdStore();
  const queryClient = createTestQueryClient();
  return renderHook(() => useCourses(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    ),
  });
}

async function createList(name: string): Promise<ShoppingListRow> {
  return data.create<ShoppingListRow>('shopping_lists', {
    household_id: DEMO_HOUSEHOLD_ID,
    name,
    created_by: null,
    created_at: new Date().toISOString(),
  });
}

async function createProduct(input: {
  ean: string;
  name: string;
  category?: string | null;
  photoUrl?: string | null;
}): Promise<ProductRow> {
  return data.create<ProductRow>(PRODUCTS_TABLE, {
    household_id: DEMO_HOUSEHOLD_ID,
    ean: input.ean,
    name: input.name,
    brand: null,
    category: input.category ?? null,
    photo_url: input.photoUrl ?? null,
    off_data: {},
    created_by: null,
  });
}

async function createItem(input: {
  listId: string;
  name: string;
  category?: string | null;
  checked?: boolean;
}): Promise<ShoppingListItemRow> {
  return data.create<ShoppingListItemRow>('shopping_list_items', {
    household_id: DEMO_HOUSEHOLD_ID,
    list_id: input.listId,
    name: input.name,
    quantity: null,
    unit: null,
    category: input.category ?? null,
    checked: input.checked ?? false,
    added_by: null,
    product_id: null,
  });
}

describe('suggestionsFor foyer-first (D-03)', () => {
  it('produits du foyer en premier, dédupliqués, limite 5', async () => {
    const target = await createList('Suggestions cible');
    const other = await createList('Suggestions autre');
    await createProduct({ ean: '3017620422003', name: 'Comté', category: 'Frais', photoUrl: 'https://signé/photo.jpg' });
    await createItem({ listId: other.id, name: 'Comté', category: 'Frais', checked: true });
    await createItem({ listId: other.id, name: 'Lait', category: 'Frais', checked: true });

    const { result } = renderCoursesHook();
    await waitFor(() => {
      expect(result.current.suggestionsFor(target.id).some((entry) => entry.name === 'Comté')).toBe(true);
    });

    const suggestions = result.current.suggestionsFor(target.id);
    // Le produit du foyer ouvre la liste, avec sa photo, avant l'historique.
    expect(suggestions[0].name).toBe('Comté');
    expect(suggestions[0].photoUrl).toBe('https://signé/photo.jpg');
    // Déduplication insensible à la casse : un seul Comté malgré l'historique.
    expect(suggestions.filter((entry) => entry.name.toLowerCase() === 'comté')).toHaveLength(1);
    expect(suggestions.map((entry) => entry.name)).toContain('Lait');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});

describe('addScannedToList re-scan +1 (D-04)', () => {
  it('second scan : lignes inchangées, quantité +1, toast +1', async () => {
    const list = await createList('Re-scan');
    await createProduct({ ean: '8002270014901', name: 'Riz', category: 'Divers' });

    const { result } = renderCoursesHook();
    await waitFor(() => expect(result.current.lists.length).toBeGreaterThan(0));

    let firstQuantity: number | null = null;
    await act(async () => {
      const first = await result.current.addScannedToList(list.id, '8002270014901');
      expect(first.incremented).toBe(false);
      firstQuantity = first.item.quantity;
    });
    expect(firstQuantity).toBeNull();
    await act(async () => {
      const second = await result.current.addScannedToList(list.id, '8002270014901');
      expect(second.incremented).toBe(true);
      expect(second.item.quantity).toBe(2);
    });

    const items = await data.list<ShoppingListItemRow>('shopping_list_items', { list_id: list.id });
    expect(items).toHaveLength(1);
    await screen.findByText(/quantité \+1/);
  });

  it('EAN inconnu : erreur vers la fiche manuelle, rien d’écrit', async () => {
    const list = await createList('Inconnu');
    const { result } = renderCoursesHook();
    await waitFor(() => expect(result.current.lists.length).toBeGreaterThan(0));

    await act(async () => {
      await expect(result.current.addScannedToList(list.id, '2999999999991')).rejects.toThrow(
        'Produit inconnu',
      );
    });
    const items = await data.list<ShoppingListItemRow>('shopping_list_items', { list_id: list.id });
    expect(items).toHaveLength(0);
  });
});

describe('hors-ligne Dexie (D-06)', () => {
  it('réseau coupé + produit connu : résolution sans fetch, ajout durable', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('réseau coupé'));
    vi.stubGlobal('fetch', fetchSpy);
    const list = await createList('Hors-ligne');
    await createProduct({ ean: '3175681122497', name: 'Lentilles', category: 'Divers' });

    const { result } = renderCoursesHook();
    await waitFor(() => expect(result.current.lists.length).toBeGreaterThan(0));

    await act(async () => {
      const resolution = await result.current.addScannedToList(list.id, '3175681122497');
      expect(resolution.product.name).toBe('Lentilles');
      expect(resolution.incremented).toBe(false);
    });

    // Aucun appel réseau : le catalogue Dexie suffit (D-06).
    expect(fetchSpy).not.toHaveBeenCalled();
    // L'ajout est durable en local pour la synchronisation au retour : en
    // mode adaptateur local, les lignes Dexie SONT le magasin hors-ligne
    // (la file `mutations` n'est renseignée que par l'adaptateur Supabase
    // quand `navigator.onLine` est faux).
    const rows = await getDatabase()
      .rows.where('[table+householdId]')
      .equals(['shopping_list_items', DEMO_HOUSEHOLD_ID])
      .toArray();
    expect(rows.filter((row) => (row.data as unknown as ShoppingListItemRow).list_id === list.id)).toHaveLength(1);
  });
});

// Garde-fou : le module Courses existant continue de rendre avec le hook étendu.
describe('non-régression page Courses', () => {
  it('les suggestions historiques survivent sans produit au foyer', async () => {
    const { default: CoursesPage } = await import('./courses-page');
    renderWithProviders(<CoursesPage />);
    await screen.findByRole('region', { name: 'Fresque' });
  });
});
