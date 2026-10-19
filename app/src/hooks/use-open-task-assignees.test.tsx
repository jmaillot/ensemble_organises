import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/render';
import { queryKeys } from '@/lib/data/useResource';
import type { TaskAssigneeRecord } from '@/modules/taches/types';
import {
  selectTasksForMember,
  useOpenTaskAssignees,
  type OpenTaskAssignees,
} from './use-open-task-assignees';

/**
 * La règle : une tâche sans assigné compte pour le foyer, une tâche assignée
 * compte pour ses assignés, jamais pour les autres.
 *
 * Le défaut que ce fichier garde : `assigneesQuery.data ?? []` fait basculer
 * cette règle vers « tout le monde » dès que la lecture n'a rien rendu — en
 * vol, ou en erreur. « On ne sait pas » est un état à part entière, jamais une
 * liste vide.
 *
 * Le vrai `listTaskAssignees` est capturé au montage du mock : le `beforeEach`
 * doit le REMETTRE en place, sinon les cas suivants liraient `undefined`.
 */
const { listTaskAssigneesMock, realListTaskAssignees } = vi.hoisted(() => ({
  listTaskAssigneesMock: vi.fn(),
  realListTaskAssignees: {
    fn: null as null | ((taskIds: string[]) => Promise<TaskAssigneeRecord[]>),
  },
}));

vi.mock('@/modules/taches/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/taches/api')>();
  realListTaskAssignees.fn = actual.listTaskAssignees;
  return { ...actual, listTaskAssignees: listTaskAssigneesMock };
});

let queryClient = createTestQueryClient();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const IDS = ['task-1', 'task-2', 'task-4'];

beforeEach(() => {
  queryClient = createTestQueryClient();
  listTaskAssigneesMock.mockReset();
  listTaskAssigneesMock.mockImplementation((taskIds: string[]) => realListTaskAssignees.fn!(taskIds));
});

const TASKS = [{ id: 'task-1' }, { id: 'task-2' }, { id: 'task-4' }];
const CONNU: OpenTaskAssignees = {
  state: 'known',
  byTask: new Map([
    ['task-1', ['camille']],
    ['task-2', ['thomas']],
  ]),
};

describe('useOpenTaskAssignees — la couture', () => {
  it('(G1) un état inconnu ne rend pas de liste', () => {
    expect(selectTasksForMember(TASKS, { state: 'unknown' }, 'camille')).toBeNull();
  });

  it('(G4) un membre courant inconnu ne rend pas de liste', () => {
    expect(selectTasksForMember(TASKS, CONNU, null)).toBeNull();
  });

  it('(G5) contrat conservé : sans assigné (foyer) ou à moi, jamais celles des autres', () => {
    expect(selectTasksForMember(TASKS, CONNU, 'camille')?.map((task) => task.id)).toEqual([
      'task-1',
      'task-4',
    ]);
    expect(selectTasksForMember(TASKS, CONNU, 'thomas')?.map((task) => task.id)).toEqual([
      'task-2',
      'task-4',
    ]);
  });

  it('(G2) une lecture EN VOL n’est pas « personne n’est assigné »', async () => {
    listTaskAssigneesMock.mockImplementation(() => new Promise<TaskAssigneeRecord[]>(() => {}));
    const { result } = renderHook(() => useOpenTaskAssignees(IDS), { wrapper });

    // Précondition indispensable : la lecture a bien DÉMARRÉ. Sans elle,
    // l'assertion serait vraie parce que la requête n'a jamais été tentée, et
    // la garde ne prouverait rien.
    await waitFor(() => expect(listTaskAssigneesMock).toHaveBeenCalled());

    expect(result.current.state).toBe('unknown');
  });

  it('(G3) une lecture EN ERREUR n’est pas « personne n’est assigné »', async () => {
    listTaskAssigneesMock.mockRejectedValue(new Error('réseau indisponible'));
    const { result } = renderHook(() => useOpenTaskAssignees(IDS), { wrapper });

    // Précondition : l'erreur a réellement eu lieu, observée dans le cache.
    await waitFor(() => {
      const entries = queryClient.getQueryCache().findAll({
        queryKey: queryKeys.tableAll('task_assignees'),
      });
      expect(entries.some((entry) => entry.state.status === 'error')).toBe(true);
    });

    expect(result.current.state).toBe('unknown');
  });
});
