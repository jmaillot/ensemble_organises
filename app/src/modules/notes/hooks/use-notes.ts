import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import type { NoteRow } from '@/types';
import { NOTES_TABLE, nowIso, toNotePayload } from '../api';
import {
  emptyNoteFilters,
  filterNotes,
  isNoteFilterActive,
  noteCategories,
  noteMetrics,
  sortNotes,
  toNote,
  type Note,
  type NoteFilters,
  type NoteFormValues,
  type NoteMetrics,
} from '../types';

export interface UseNotesResult extends NoteMetrics {
  /** Toutes les notes du foyer, de la plus récente à la plus ancienne. */
  notes: Note[];
  /** Notes après recherche plein texte et filtre de catégorie. */
  visibleNotes: Note[];
  categories: string[];
  filters: NoteFilters;
  setFilters: (filters: Partial<NoteFilters>) => void;
  resetFilters: () => void;
  hasActiveFilters: boolean;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  isMutating: boolean;
  refetch: () => void;
  addNote: (values: NoteFormValues) => Promise<void>;
  editNote: (note: Note, values: NoteFormValues) => Promise<void>;
  removeNote: (note: Note) => Promise<void>;
}

/** Espace de notes du foyer : recherche, catégories, visibilité. */
export function useNotes(): UseNotesResult {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMember = useCurrentMember();
  const [filters, setFiltersState] = useState<NoteFilters>(emptyNoteFilters);
  const { rows, isLoading, isFetching, isError, error, refetch, create, update, remove, isMutating } =
    useResource<NoteRow>(NOTES_TABLE);

  const notes = useMemo(() => sortNotes(rows.map(toNote)), [rows]);
  const visibleNotes = useMemo(() => filterNotes(notes, filters), [filters, notes]);
  const categories = useMemo(() => noteCategories(notes), [notes]);
  const metrics = useMemo(() => noteMetrics(notes), [notes]);
  const hasActiveFilters = isNoteFilterActive(filters);

  const setFilters = useCallback((partial: Partial<NoteFilters>) => {
    setFiltersState((current) => ({ ...current, ...partial }));
  }, []);

  const resetFilters = useCallback(() => setFiltersState(emptyNoteFilters), []);

  /**
   * `useResource` n'invalide que la clé `['all', table]`, distincte de la clé de
   * sa requête (`[table, householdId, filter]`) : on invalide la table entière
   * pour que la grille reflète immédiatement l'écriture.
   */
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: [NOTES_TABLE] }), [queryClient]);

  const addNote = useCallback(
    async (values: NoteFormValues) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      await create({
        ...toNotePayload(values),
        household_id: householdId,
        created_by: currentMember?.id ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      await refresh();
    },
    [create, currentMember?.id, householdId, refresh],
  );

  const editNote = useCallback(
    async (note: Note, values: NoteFormValues) => {
      await update(note.id, { ...toNotePayload(values), updated_at: nowIso() });
      await refresh();
    },
    [refresh, update],
  );

  const removeNote = useCallback(
    async (note: Note) => {
      await remove(note.id);
      await refresh();
    },
    [refresh, remove],
  );

  return {
    notes,
    visibleNotes,
    categories,
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
    addNote,
    editNote,
    removeNote,
    ...metrics,
  };
}
