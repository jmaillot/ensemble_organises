/**
 * G-30-2 (30-06) — le formulaire ne doit proposer qu'UNE entrée « Général ».
 *
 * Le formulaire code en dur l'option value="" (NULL = Général en base, 0050) ;
 * le hook fournissait aussi le dossier réel is_default au dialogue — deux
 * entrées « Général » à l'écran, aucune en base. Le filtre vit dans le hook
 * (formFoldersOf) : les onglets de la page continuent de recevoir la liste
 * COMPLÈTE (Test non-régression), seul le formulaire reçoit formFolders.
 */
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { RoutineFolderRow } from '@/types';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { queryKeys } from '@/lib/data/useResource';
import { formFoldersOf, useRoutines } from './use-routines';

const folderRow = (overrides: Partial<RoutineFolderRow>): RoutineFolderRow =>
  ({
    id: 'folder-x',
    household_id: DEMO_HOUSEHOLD_ID,
    name: 'Maison',
    visibility: 'foyer',
    owner_member_id: 'member-camille',
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as RoutineFolderRow;

const wrapperOf = () => {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

describe('formFoldersOf — le dossier par défaut ne va PAS au formulaire', () => {
  it('exclut le dossier is_default, garde tous les dossiers personnalisés, trie en français', () => {
    const gener = folderRow({ id: 'folder-gen', name: 'Général', is_default: true });
    const maison = folderRow({ id: 'folder-maison', name: 'Maison' });
    const zoo = folderRow({ id: 'folder-zoo', name: 'Animaux' });
    const source = [zoo, gener, maison];

    const form = formFoldersOf(source);

    // Le dossier par défaut est bien absent (l'option « Général » est codée
    // en dur dans le dialogue : le rendre aussi ferait le doublon G-30-2).
    expect(form.map((f) => f.id)).not.toContain('folder-gen');
    // Les personnalisés restent, triés en français.
    expect(form.map((f) => f.name)).toEqual(['Maison', 'Animaux'].sort((a, b) => a.localeCompare(b, 'fr')));
    // Non-régression : la source n'est pas mutée — les onglets la consomment.
    expect(source.some((f) => f.is_default)).toBe(true);
    expect(source).toHaveLength(3);
  });

  it('une liste sans is_default passe inchangée (tri conservé)', () => {
    const maison = folderRow({ id: 'folder-maison', name: 'Maison' });
    expect(formFoldersOf([maison])).toEqual([{ id: 'folder-maison', name: 'Maison' }]);
  });
});

describe('useRoutines — formFolders (formulaire) vs folders (onglets)', () => {
  it('le hook expose formFolders sans le dossier par défaut et folders complète', async () => {
    seedHouseholdStore();
    const { queryClient, wrapper } = wrapperOf();
    // La couche de données n'est pas l'objet du test : le cache React Query
    // est semé directement avec la clé exacte de useResource — la dérivation
    // folders/formFolders du hook est ce qu'on verrouille.
    const gener = folderRow({ id: 'folder-gen', name: 'Général', is_default: true });
    const maison = folderRow({ id: 'folder-maison', name: 'Maison' });
    queryClient.setQueryData(
      queryKeys.table('routine_folders', DEMO_HOUSEHOLD_ID, { household_id: DEMO_HOUSEHOLD_ID }),
      [gener, maison],
    );
    const { result } = renderHook(() => useRoutines(), { wrapper });

    await waitFor(() => {
      expect(result.current.folders.length).toBe(2);
    });

    // Onglets : la liste complète, Général compris.
    expect(result.current.folders.some((f) => f.is_default)).toBe(true);
    // Formulaire : sans le dossier par défaut — une seule entrée « Général »
    // au menu déroulant (l'option value="" codée en dur). Un dossier
    // personnalisé ne peut pas s'appeler « Général »
    // (routine_folders_name_unique, 0050) : le nom identifie la ligne semée.
    expect(result.current.formFolders.map((f) => f.name)).toEqual(['Maison']);
  });
});
