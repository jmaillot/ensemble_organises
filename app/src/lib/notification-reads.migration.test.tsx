import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/render';
import { demoUser } from '@/hooks/use-auth';
import { useSessionStore } from '@/stores/session-store';
import type { NotificationReadRow } from '@/types';
import { migrateLocalReads, useSyncedReads } from './notification-reads';

/**
 * D-03 (one-way) : le localStorage `ensemble-organises-messages-read` est
 * porté vers la table serveur `notification_reads` au premier chargement,
 * puis la clé est retirée — SEULEMENT après succès des écritures. Un échec
 * réseau ne doit rien effacer (repli hors ligne = ne rien perdre), sans
 * jamais crier (dégradation silencieuse, UI-SPEC copie D-03).
 */

const KEY = 'ensemble-organises-messages-read:profile-demo';

const serverRow = (over: Partial<NotificationReadRow>): NotificationReadRow => ({
  id: 'read-1',
  user_id: 'profile-demo',
  scope: 'conversation',
  scope_id: 'fil-1',
  read_at: '2026-10-01T08:00:00.000Z',
  ...over,
});

const deps = (over: {
  serverRows?: NotificationReadRow[];
  create?: (row: NotificationReadRow) => Promise<unknown>;
  update?: (id: string, readAt: string) => Promise<unknown>;
}) => ({
  scope: 'conversation' as const,
  userId: 'profile-demo',
  storageKey: KEY,
  serverRows: over.serverRows ?? [],
  create: over.create ?? (async () => undefined),
  update: over.update ?? (async () => undefined),
  removeLocal: (key: string) => localStorage.removeItem(key),
});

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ status: 'authenticated', user: demoUser, householdLoaded: true });
});

describe('migration D-03 — portage localStorage → notification_reads', () => {
  it('pousse chaque entrée puis retire la clé, seulement après succès', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ 'fil-1': '2026-10-01T09:00:00.000Z', 'fil-2': '2026-10-02T09:00:00.000Z' }),
    );
    const created: NotificationReadRow[] = [];

    const migrated = await migrateLocalReads(
      deps({ create: async (row) => void created.push(row) }),
    );

    expect(migrated).toBe(true);
    expect(created).toHaveLength(2);
    expect(created.map((row) => row.scope_id).sort()).toEqual(['fil-1', 'fil-2']);
    expect(created.every((row) => row.user_id === 'profile-demo')).toBe(true);
    expect(created.every((row) => row.scope === 'conversation')).toBe(true);
    // La clé n'existe plus : le serveur est la seule référence (one-way).
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('échec réseau : la clé locale est CONSERVÉE et l’erreur remonte (l’effaceur ne lève jamais la garde)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ 'fil-1': '2026-10-01T09:00:00.000Z' }));

    await expect(
      migrateLocalReads(
        deps({
          create: async () => {
            throw new Error('réseau indisponible');
          },
        }),
      ),
    ).rejects.toThrow('réseau indisponible');

    // Repli hors ligne = ne rien effacer : l'horodatage local survit.
    expect(localStorage.getItem(KEY)).toContain('fil-1');
  });

  it('garde le max : une entrée locale plus ancienne que le serveur ne régresse rien', async () => {
    localStorage.setItem(KEY, JSON.stringify({ 'fil-1': '2026-10-01T07:00:00.000Z' }));
    const update = vi.fn();

    await migrateLocalReads(deps({ serverRows: [serverRow({})], update }));

    // Le serveur (08:00) est plus récent que la marque locale (07:00) :
    // latestRead garde le max, aucune écriture de régression.
    expect(update).not.toHaveBeenCalled();
    // Le portage reste un succès : la clé peut partir sans perte.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('garde le max : une entrée locale plus récente met le serveur à jour', async () => {
    localStorage.setItem(KEY, JSON.stringify({ 'fil-1': '2026-10-03T07:00:00.000Z' }));
    const update = vi.fn();

    await migrateLocalReads(deps({ serverRows: [serverRow({})], update }));

    expect(update).toHaveBeenCalledWith('read-1', '2026-10-03T07:00:00.000Z');
  });

  it('clé absente ou vide : rien ne bouge, rien n’est effacé', async () => {
    const create = vi.fn();
    const removeLocal = vi.fn();

    const migrated = await migrateLocalReads(deps({ create }));

    expect(migrated).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(removeLocal).not.toHaveBeenCalled();
  });

  it('dans le hook : la clé locale part après portage réussi et les horodatages restent lisibles', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    localStorage.setItem(
      `ensemble-organises-messages-read:${demoUser.id}`,
      JSON.stringify({ 'fil-migré': '2026-10-19T10:00:00.000Z' }),
    );

    const { result } = renderHook(() => useSyncedReads('conversation', 'ensemble-organises-messages-read'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() =>
      expect(localStorage.getItem(`ensemble-organises-messages-read:${demoUser.id}`)).toBeNull(),
    );
    // La lecture reste visible : le serveur porte désormais la marque.
    expect(result.current.readMap['fil-migré']).toBe('2026-10-19T10:00:00.000Z');
  });
});
