import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { data } from '@/lib/data';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { createTestQueryClient, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import type { NoteFolderRow } from '@/types';
import { useNotes } from './use-notes';

/**
 * `useNotes.deleteFolder` était gardé par `canWrite` seul, alors que la
 * politique `note_folders_delete` (0051:82-87) réserve la suppression à
 * l'administrateur : troisième occurrence de la même classe que les dossiers de
 * tâches et de routines (D-03, « corriger la classe »). Le garde est prouvé
 * ici, car le test d'affichage de la page ne l'exercerait pas — la corbeille y
 * est de toute façon masquée pour un membre.
 */
function renderNotes() {
  const queryClient = createTestQueryClient();
  return renderHook(() => useNotes(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

const GUARD = 'Seul un administrateur du foyer peut supprimer.';

describe('useNotes — suppression de dossier réservée à l’administrateur', () => {
  it('rejette un membre non admin sans rien écrire', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    const { result } = renderNotes();

    await expect(result.current.deleteFolder('dossier-inexistant')).rejects.toThrow(GUARD);
    // Le garde tombe avant l'I/O : aucun `DataError` de ligne absente (18-02).
    expect(await data.list<NoteFolderRow>('note_folders', { id: 'dossier-inexistant' })).toHaveLength(0);
  });

  it('laisse un administrateur supprimer un dossier existant', async () => {
    seedHouseholdStore();
    const { result } = renderNotes();

    let created!: NoteFolderRow;
    await act(async () => {
      created = await result.current.createFolder('Divers', 'foyer');
    });

    await act(async () => {
      await result.current.deleteFolder(created.id);
    });

    expect(await data.list<NoteFolderRow>('note_folders', { id: created.id })).toHaveLength(0);
  });
});
