import { useCallback, useMemo, useRef, useState } from 'react';
import { useHouseholdStore } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import type { PlaceRow } from '@/types';
import { PLACES_TABLE, placeMetrics, toPlacePayload, toVisitedPayload, type PlaceMetrics } from '../api';
import {
  emptyPlaceFilters,
  filterPlaces,
  groupPlacesByCity,
  isPlaceFilterActive,
  toPlace,
  type Place,
  type PlaceFilters,
  type PlaceInput,
} from '../types';

export interface UseAdressesResult extends PlaceMetrics {
  /** Tous les lieux du foyer, triés par nom. */
  places: Place[];
  /** Lieux après application des filtres de recherche. */
  visiblePlaces: Place[];
  /** Lieux visibles regroupés par ville, pour la vue « carte ». */
  cityGroups: { city: string; places: Place[] }[];
  filters: PlaceFilters;
  setFilters: (filters: Partial<PlaceFilters>) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  addPlace: (input: PlaceInput) => Promise<void>;
  editPlace: (place: Place, input: PlaceInput) => Promise<void>;
  removePlace: (place: Place) => Promise<void>;
  toggleVisited: (place: Place) => Promise<void>;
}

function useRequireHousehold() {
  const householdId = useHouseholdStore((state) => state.householdId);
  return useCallback(() => {
    if (!householdId) throw new Error('Aucun foyer sélectionné.');
    return householdId;
  }, [householdId]);
}

/** Carnet d'adresses du foyer : lieux, filtres et bascule « Déjà visité ». */
export function useAdresses(): UseAdressesResult {
  const requireHousehold = useRequireHousehold();
  const [filters, setFiltersState] = useState<PlaceFilters>(emptyPlaceFilters);
  const {
    rows,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    create,
    update,
    remove,
    isMutating,
  } = useResource<PlaceRow>(PLACES_TABLE);

  // `useResource` invalide la clé `['all', table]`, qui ne correspond pas à la
  // clé de sa requête (`[table, householdId, filtre]`) : on relance donc la
  // lecture après chaque écriture, y compris après la mise à jour optimiste.
  const refresh = useRef(refetch);
  refresh.current = refetch;

  const places = useMemo(() => rows.map(toPlace).sort((a, b) => a.name.localeCompare(b.name, 'fr')), [rows]);
  const visiblePlaces = useMemo(() => filterPlaces(places, filters), [filters, places]);
  const cityGroups = useMemo(() => groupPlacesByCity(visiblePlaces), [visiblePlaces]);
  const metrics = useMemo(() => placeMetrics(places), [places]);
  const hasActiveFilters = isPlaceFilterActive(filters);

  const setFilters = useCallback((partial: Partial<PlaceFilters>) => {
    setFiltersState((current) => ({ ...current, ...partial }));
  }, []);

  const resetFilters = useCallback(() => setFiltersState(emptyPlaceFilters), []);

  const addPlace = useCallback(
    async (input: PlaceInput) => {
      await create(toPlacePayload(input, requireHousehold()));
      refresh.current();
    },
    [create, requireHousehold],
  );

  const editPlace = useCallback(
    async (place: Place, input: PlaceInput) => {
      await update(place.id, toPlacePayload(input, requireHousehold()));
      refresh.current();
    },
    [requireHousehold, update],
  );

  const removePlace = useCallback(
    async (place: Place) => {
      await remove(place.id);
      refresh.current();
    },
    [remove],
  );

  const toggleVisited = useCallback(
    async (place: Place) => {
      await update(place.id, toVisitedPayload(!place.visited));
      refresh.current();
    },
    [update],
  );

  return {
    places,
    visiblePlaces,
    cityGroups,
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,
    isLoading,
    isFetching,
    isError,
    error,
    isMutating,
    refetch,
    addPlace,
    editPlace,
    removePlace,
    toggleVisited,
    ...metrics,
  };
}
