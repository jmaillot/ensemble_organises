import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHouseholdStore } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import type { PlaceRow } from '@/types';
import { PLACES_TABLE, deletePlacePhoto, isPlacePhotoPath, placeMetrics, resolvePlacePhotoUrls, shouldRemovePreviousPlacePhoto, toEditPlacePayload, toPlacePayload, toVisitedPayload, uploadPlacePhoto, type PlaceMetrics } from '../api';
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
  /** Lieux visibles regroupés par ville, pour la vue « par ville ». */
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
    rows: allRows,
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

  /**
   * Phase 15 : les adresses propres à un voyage (`trip_id` renseigné) ne
   * vivent pas dans le carnet du foyer — régime historique `trip_id NULL`
   * (15-01). Les fourches voyage (15-03) liront le même magasin par voyage.
   */
  const rows = useMemo(() => allRows.filter((row) => row.trip_id == null), [allRows]);

  // `useResource` invalide la clé `['all', table]`, qui ne correspond pas à la
  // clé de sa requête (`[table, householdId, filtre]`) : on relance donc la
  // lecture après chaque écriture, y compris après la mise à jour optimiste.
  const refresh = useRef(refetch);
  refresh.current = refetch;

  // Les lignes portent des chemins (D-04) : on forge les photos affichables
  // à la lecture, en échec fermé (annulation stricte, jamais d'état éventé).
  // Les valeurs non-chemin (`data:` hérités, `/assets`, aperçus) rendent en
  // synchrone — aucun rendu ajouté ; seuls les chemins passent par l'effet.
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const pending = rows.filter((row) => row.photo_url && isPlacePhotoPath(row.photo_url));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolvePlacePhotoUrls(pending).then((resolved) => {
      if (!cancelled) setPhotoUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const places = useMemo(
    () =>
      rows
        .map((row) => {
          const stored = row.photo_url;
          // Non-chemin : valeur affichable telle quelle (synchrone) ; chemin :
          // URL forgée par l'effet, `null` en attendant ou en échec fermé.
          // L'écrasement ne porte QUE sur `photoUrl` : `photoStored` reste la
          // valeur de colonne, seule comparable d'une édition à l'autre (D-06).
          const photoUrl = !stored || !isPlacePhotoPath(stored) ? stored : (photoUrls[row.id] ?? null);
          return { ...toPlace(row), photoUrl };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [rows, photoUrls],
  );
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
      const householdId = requireHousehold();
      const photoUrl = input.photoFile ? await uploadPlacePhoto(householdId, input.photoFile) : input.photoUrl;
      await create(toPlacePayload({ ...input, photoUrl }, householdId));
      refresh.current();
    },
    [create, requireHousehold],
  );

  const editPlace = useCallback(
    async (place: Place, input: PlaceInput) => {
      const householdId = requireHousehold();
      // `previous` est la valeur STOCKÉE (colonne), pas l'URL forgée à la
      // lecture : c'est la seule comparable au `photoUrl` transporté par le
      // dialogue, qui est désormais cette même valeur stockée tant que la
      // photo n'est pas touchée (D-06, WR-05).
      const previous = rows.find((row) => row.id === place.id)?.photo_url ?? null;
      const photoUrl = input.photoFile ? await uploadPlacePhoto(householdId, input.photoFile) : input.photoUrl;
      // `visited` est omis de la charge (D-06) : l'édition ne le touche plus.
      await update(place.id, toEditPlacePayload({ ...input, photoUrl }, householdId));
      // Photo remplacée ou retirée : l'ancien fichier part avec (pas d'orphelin).
      if (shouldRemovePreviousPlacePhoto(previous, photoUrl)) await deletePlacePhoto(previous);
      refresh.current();
    },
    [requireHousehold, rows, update],
  );

  const removePlace = useCallback(
    async (place: Place) => {
      const stored = rows.find((row) => row.id === place.id)?.photo_url ?? null;
      await remove(place.id);
      await deletePlacePhoto(stored);
      refresh.current();
    },
    [remove, rows],
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
