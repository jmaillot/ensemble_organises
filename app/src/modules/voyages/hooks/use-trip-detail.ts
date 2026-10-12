/**
 * Fiche d'un voyage (phase 15) : voyage + appartenance + participants.
 *
 * Lectures RLS (15-01) : un non-membre ne lit rien — ni le voyage, ni les
 * participants. L'état `notAuthorized` est honnête (jamais une coquille
 * vide) et ne distingue pas inexistant de refusé (pas d'oracle
 * d'existence). En démo (sans RLS), le contrôle d'appartenance reste
 * appliqué côté client (D-01 : pas de visibilité foyer automatique).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { useCurrentMember, useIsAdmin, useMembers } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import type { HouseholdMemberRow, TripGuestRow } from '@/types';
import { fetchTripCounts, fetchTripGuests, fetchTripMembers, fetchTripRow, isTripCoverPath, resolveTripCoverUrl, type TripCounts } from '../api';
import { toTrip, type TabState, type Trip } from '../types';

export const tripDetailKeys = {
  all: ['voyages', 'detail'] as const,
  trip: (tripId: string | null) => ['voyages', 'detail', tripId, 'trip'] as const,
  members: (tripId: string | null) => ['voyages', 'detail', tripId, 'members'] as const,
  guests: (tripId: string | null) => ['voyages', 'detail', tripId, 'guests'] as const,
  counts: (tripId: string | null) => ['voyages', 'detail', tripId, 'counts'] as const,
};

const REALTIME_TABLES = ['trips', 'trip_members', 'trip_guests'] as const;

export interface TripDetailState {
  tripId: string | null;
  trip: Trip | null;
  /** Valeur stockée de la couverture (chemin bucket ou forme directe) : sert au nettoyage à l’édition. */
  storedCover: string | null;
  tabState: TabState | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  /**
   * Voyage chargé mais non accessible, ou illisible (RLS) : afficher l'état
   * « non autorisé », jamais une fiche vide.
   */
  notAuthorized: boolean;
  isParticipant: boolean;
  isAdmin: boolean;
  /**
   * Lecture seule de modération (D-07) : admin du foyer qui ne participe
   * pas — voit sans affordance de participation forcée.
   */
  readOnly: boolean;
  participantMembers: HouseholdMemberRow[];
  guests: TripGuestRow[];
  /** Compteurs Infos (lignes tripées + ardoise liée) ; `null` avant autorisation. */
  counts: TripCounts | null;
  countsLoading: boolean;
  refetch: () => void;
}

export function useTripDetail(tripId: string | null): TripDetailState {
  const queryClient = useQueryClient();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const isAdmin = useIsAdmin();
  const today = todayIso();
  const enabled = Boolean(tripId);

  const tripQuery = useQuery({
    queryKey: tripDetailKeys.trip(tripId),
    enabled,
    retry: false,
    queryFn: () => fetchTripRow(tripId as string),
  });
  const membersQuery = useQuery({
    queryKey: tripDetailKeys.members(tripId),
    enabled,
    retry: false,
    queryFn: () => fetchTripMembers(tripId as string),
  });
  const guestsQuery = useQuery({
    queryKey: tripDetailKeys.guests(tripId),
    enabled,
    retry: false,
    queryFn: () => fetchTripGuests(tripId as string),
  });

  const invalidate = useCallback(() => {
    if (!tripId) return;
    void queryClient.invalidateQueries({ queryKey: tripDetailKeys.trip(tripId) });
    void queryClient.invalidateQueries({ queryKey: tripDetailKeys.members(tripId) });
    void queryClient.invalidateQueries({ queryKey: tripDetailKeys.guests(tripId) });
    void queryClient.invalidateQueries({ queryKey: tripDetailKeys.counts(tripId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tableAll('trips') });
  }, [queryClient, tripId]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = REALTIME_TABLES.map((table) =>
      data.subscribe(table, () => {
        void queryClient.invalidateQueries({ queryKey: tripDetailKeys.all });
      }),
    );
    return () => unsubscribe.forEach((stop) => stop());
  }, [enabled, queryClient]);

  const trip = useMemo(() => {
    const row = tripQuery.data ?? null;
    return row ? toTrip(row, today) : null;
  }, [tripQuery.data, today]);

  // D-11 : comme le héros de la liste, les chemins bucket sont forgés en URL
  // courte, en échec fermé (pas de héros) en attendant ou en erreur.
  const storedCover = tripQuery.data?.cover_photo ?? null;
  const [forgedCover, setForgedCover] = useState<string | null>(null);
  useEffect(() => {
    if (!storedCover || !isTripCoverPath(storedCover)) {
      setForgedCover(null);
      return;
    }
    let cancelled = false;
    void resolveTripCoverUrl(storedCover).then((url) => {
      if (!cancelled) setForgedCover(url);
    });
    return () => {
      cancelled = true;
    };
  }, [storedCover]);
  const displayTrip = useMemo(() => {
    if (!trip) return null;
    if (!storedCover || !isTripCoverPath(storedCover)) return trip;
    return { ...trip, coverPhoto: forgedCover ?? '' };
  }, [trip, storedCover, forgedCover]);

  const participantIds = useMemo(
    () => new Set((membersQuery.data ?? []).map((entry) => entry.member_id)),
    [membersQuery.data],
  );
  const isParticipant = Boolean(currentMember && participantIds.has(currentMember.id));
  const participantMembers = useMemo(
    () => members.filter((member) => participantIds.has(member.id)),
    [members, participantIds],
  );

  const isLoading = tripQuery.isLoading || membersQuery.isLoading || guestsQuery.isLoading;
  const isError = tripQuery.isError || membersQuery.isError || guestsQuery.isError;
  const error =
    ((tripQuery.error ?? membersQuery.error ?? guestsQuery.error) as Error | null) ?? null;
  // RLS : un non-membre ne lit pas le voyage (`null`) ; en démo (sans RLS),
  // l'appartenance explicite tranche (D-01).
  const notAuthorized =
    enabled && !isLoading && !isError && (!trip || (!isParticipant && !isAdmin));

  // Compteurs après autorisation : un non-membre ne déclenche aucune lecture
  // de lignes (T-15-07, pas de pré-chargement avant appartenance prouvée).
  const countsQuery = useQuery({
    queryKey: tripDetailKeys.counts(tripId),
    enabled: enabled && !isLoading && !isError && !notAuthorized,
    retry: false,
    queryFn: () => fetchTripCounts(tripId as string),
  });

  return {
    tripId,
    trip: notAuthorized ? null : displayTrip,
    storedCover,
    tabState: displayTrip && !notAuthorized ? displayTrip.tabState : null,
    isLoading,
    isError,
    error,
    notAuthorized,
    isParticipant,
    isAdmin,
    readOnly: Boolean(displayTrip) && !notAuthorized && isAdmin && !isParticipant,
    participantMembers,
    guests: guestsQuery.data ?? [],
    counts: notAuthorized ? null : (countsQuery.data ?? null),
    countsLoading: countsQuery.isLoading,
    refetch: invalidate,
  };
}
