/**
 * Hook des Voyages : lectures (voyages + tâches du foyer), mutations
 * optimistes, temps réel et indicateurs du héros.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { queryKeys } from '@/lib/data/useResource';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { useToast } from '@/components/ui/toast';
import { randomId, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, TaskRow, TripRow } from '@/types';
import { createTrip, deleteTrip, listTasks, listTrips, updateTrip, type TripMutationArgs } from '../api';
import { computeTripPrepStats, nextTrip, toTrip, type Trip, type TripInput, type TripPrepStats } from '../types';

export const voyagesKeys = {
  all: ['voyages'] as const,
  trips: (householdId: string | null) => ['voyages', 'trips', householdId] as const,
  tasks: (householdId: string | null) => ['voyages', 'tasks', householdId] as const,
};

const REALTIME_TABLES = ['trips', 'tasks'] as const;

export interface VoyagesState {
  trips: Trip[];
  /** Voyage mis en avant par le héros. */
  featuredTrip: Trip | null;
  upcoming: Trip[];
  past: Trip[];
  prep: TripPrepStats;
  members: HouseholdMemberRow[];
  today: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  save: (input: TripInput, id?: string | null) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export function useVoyages(): VoyagesState {
  const queryClient = useQueryClient();
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const members = useMembers();
  const enabled = Boolean(householdId);
  const today = todayIso();

  const tripsQuery = useQuery({
    queryKey: voyagesKeys.trips(householdId),
    enabled,
    queryFn: () => listTrips(householdId),
  });
  const tasksQuery = useQuery({
    queryKey: voyagesKeys.tasks(householdId),
    enabled,
    queryFn: () => listTasks(householdId),
  });

  /**
   * Rafraîchit les voyages et les tâches : la clé globale `tableAll` (contrat
   * de la couche data) est invalidée en plus des clés du module.
   */
  const invalidateTable = useCallback(
    async (table: string) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tableAll(table) });
      await queryClient.invalidateQueries({ queryKey: voyagesKeys.all });
    },
    [queryClient],
  );

  const invalidate = useCallback(async () => Promise.all(REALTIME_TABLES.map((table) => invalidateTable(table))), [
    invalidateTable,
  ]);

  // Un voyage créé ou modifié par un autre membre met le héros à jour.
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = REALTIME_TABLES.map((table) =>
      data.subscribe(table, () => {
        void invalidateTable(table);
      }),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [enabled, invalidateTable]);

  const trips = useMemo(
    () => (tripsQuery.data ?? []).map((row) => toTrip(row, today)).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [tripsQuery.data, today],
  );

  const prep = useMemo(() => computeTripPrepStats((tasksQuery.data ?? []) as TaskRow[]), [tasksQuery.data]);

  const createMutation = useMutation({ mutationFn: (args: TripMutationArgs) => createTrip(args) });
  const updateMutation = useMutation({ mutationFn: (args: TripMutationArgs) => updateTrip(args) });
  const removeMutation = useMutation({ mutationFn: (id: string) => deleteTrip(id) });

  const save = useCallback(
    async (input: TripInput, id: string | null = null) => {
      if (!householdId) return false;
      if (id) {
        try {
          await updateMutation.mutateAsync({ id, householdId, input });
          await invalidate();
          toast('Voyage mis à jour.', 'success');
          return true;
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Mise à jour impossible.', 'error');
          return false;
        }
      }

      // Création optimiste : le voyage apparaît dans la liste sans attendre l'écriture.
      const tempId = randomId('trip');
      const optimistic: TripRow = {
        id: tempId,
        household_id: householdId,
        name: input.name,
        destination: input.destination || input.name,
        start_date: input.startDate,
        end_date: input.endDate,
        cover_photo: input.coverPhoto,
        notes: input.notes,
        created_at: new Date().toISOString(),
      } as TripRow;
      queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) => [
        optimistic,
        ...(previous ?? []),
      ]);
      try {
        const created = await createMutation.mutateAsync({ id: tempId, householdId, input });
        queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) =>
          (previous ?? []).map((row) => (row.id === tempId ? created : row)),
        );
        await invalidate();
        toast('Voyage ajouté au foyer.', 'success');
        return true;
      } catch (error) {
        queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) =>
          (previous ?? []).filter((row) => row.id !== tempId),
        );
        toast(error instanceof Error ? error.message : 'Création impossible.', 'error');
        return false;
      }
    },
    [createMutation, householdId, invalidate, queryClient, toast, updateMutation],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await removeMutation.mutateAsync(id);
        await invalidate();
        toast('Voyage supprimé.');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Suppression impossible.', 'error');
      }
    },
    [invalidate, removeMutation, toast],
  );

  return {
    trips,
    featuredTrip: nextTrip(trips),
    upcoming: trips.filter((trip) => trip.upcoming),
    past: trips.filter((trip) => !trip.upcoming),
    prep,
    members,
    today,
    isLoading: tripsQuery.isLoading,
    isError: tripsQuery.isError,
    error: (tripsQuery.error as Error | null) ?? null,
    refetch: () => void tripsQuery.refetch(),
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
    save,
    remove,
  };
}
