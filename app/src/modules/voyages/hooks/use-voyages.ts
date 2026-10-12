/**
 * Hook des Voyages : lectures (voyages + tâches du foyer), mutations
 * optimistes, temps réel et indicateurs du héros.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { queryKeys } from '@/lib/data/useResource';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { useToast } from '@/components/ui/toast';
import { randomId, todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, TaskRow, TripRow } from '@/types';
import { createTrip, deleteTrip, deleteTripCover, isTripCoverPath, listTasks, listTrips, resolveTripCoverUrls, tripCoverPathOf, updateTrip, uploadTripCover, type TripMutationArgs } from '../api';
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
  /** Échec de la lecture des tâches du foyer : la carte reste honnête au lieu de masquer le compteur. */
  tasksError: Error | null;
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

  // D-11 : les lignes portent des chemins bucket pour les couvertures
  // téléversées — les URL affichables sont forgées à la lecture, en échec
  // fermé (annulation stricte, jamais d'état éventé). Les valeurs non-chemin
  // (URL http(s), actifs `/…`, aperçus démo) rendent en synchrone.
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const tripRows = tripsQuery.data ?? [];
  useEffect(() => {
    const pending = tripRows.filter((row) => isTripCoverPath(row.cover_photo ?? ''));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveTripCoverUrls(pending).then((resolved) => {
      if (!cancelled) setCoverUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [tripRows]);

  const trips = useMemo(
    () =>
      tripRows
        .map((row) => {
          const trip = toTrip(row, today);
          const stored = row.cover_photo;
          // Non-chemin : valeur affichable telle quelle (garde D-06 côté
          // page) ; chemin : URL forgée par l'effet, échec fermé (pas de
          // héros) en attendant ou en erreur.
          if (!stored || !isTripCoverPath(stored)) return trip;
          return { ...trip, coverPhoto: coverUrls[row.id] ?? '' };
        })
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [tripRows, coverUrls, today],
  );

  const prep = useMemo(() => computeTripPrepStats((tasksQuery.data ?? []) as TaskRow[]), [tasksQuery.data]);

  const createMutation = useMutation({ mutationFn: (args: TripMutationArgs) => createTrip(args) });
  const updateMutation = useMutation({ mutationFn: (args: TripMutationArgs) => updateTrip(args) });
  const removeMutation = useMutation({ mutationFn: (id: string) => deleteTrip(id) });

  const save = useCallback(
    async (input: TripInput, id: string | null = null) => {
      if (!householdId) return false;
      // D-11 en dépôt-puis-écriture (motif courses/cadeaux) : l'identifiant
      // effectif sert aussi de dossier de stockage (`trips/<id>/`), le dépôt
      // précède l'écriture, et tout échec nettoie l'objet déposé (jamais
      // d'orphelin en bucket). Le fichier gagne sur l'URL quand les deux
      // sont fournis.
      const effectiveId = id ?? randomId('trip');
      let coverPhoto = input.coverPhoto;
      let depositedPath: string | null = null;
      if (input.coverFile) {
        try {
          coverPhoto = await uploadTripCover(householdId, effectiveId, input.coverFile);
          // En démo (`path: null`) la valeur stockée est l'aperçu local :
          // rien à nettoyer côté serveur. Seul un vrai chemin compte ici.
          depositedPath = tripCoverPathOf(coverPhoto);
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Création impossible.', 'error');
          return false;
        }
      }
      const payload: TripInput = { ...input, coverPhoto };
      if (id) {
        try {
          const previous = tripRows.find((row) => row.id === id)?.cover_photo ?? null;
          await updateMutation.mutateAsync({ id, householdId, input: payload });
          // Couverture remplacée : l'ancien fichier part avec (pas
          // d'orphelin) — URL et actifs premier parti sans nettoyage.
          if (previous && previous !== coverPhoto) await deleteTripCover(previous);
          await invalidate();
          toast('Voyage mis à jour.', 'success');
          return true;
        } catch (error) {
          if (depositedPath) await deleteTripCover(depositedPath);
          toast(error instanceof Error ? error.message : 'Mise à jour impossible.', 'error');
          return false;
        }
      }

      // Création optimiste : le voyage apparaît dans la liste sans attendre l'écriture.
      const tempId = effectiveId;
      const optimistic: TripRow = {
        id: tempId,
        household_id: householdId,
        name: payload.name,
        destination: payload.destination || payload.name,
        start_date: payload.startDate,
        end_date: payload.endDate,
        cover_photo: payload.coverPhoto,
        notes: payload.notes,
        created_by: null,
        tab_state: null,
        is_closed: false,
        created_at: new Date().toISOString(),
      } as TripRow;
      queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) => [
        optimistic,
        ...(previous ?? []),
      ]);
      try {
        const created = await createMutation.mutateAsync({ id: tempId, householdId, input: payload });
        queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) =>
          (previous ?? []).map((row) => (row.id === tempId ? created : row)),
        );
        await invalidate();
        toast('Voyage ajouté au foyer.', 'success');
        return true;
      } catch (error) {
        // Échec APRÈS le dépôt : la ligne optimiste repart et l'objet est
        // nettoyé — ni ligne partielle, ni orphelin en bucket.
        if (depositedPath) await deleteTripCover(depositedPath);
        queryClient.setQueryData<TripRow[]>(voyagesKeys.trips(householdId), (previous) =>
          (previous ?? []).filter((row) => row.id !== tempId),
        );
        toast(error instanceof Error ? error.message : 'Création impossible.', 'error');
        return false;
      }
    },
    [createMutation, householdId, invalidate, queryClient, toast, tripRows, updateMutation],
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
    tasksError: (tasksQuery.error as Error | null) ?? null,
    refetch: () => void tripsQuery.refetch(),
    isMutating: createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
    save,
    remove,
  };
}
