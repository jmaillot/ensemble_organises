import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useResource } from '@/lib/data/useResource';
import { useCurrentMember, useHouseholdStore } from '@/stores/household-store';
import type { NoteAttachmentRow, NoteFolderRow, NoteRow } from '@/types';
import { NOTES_TABLE, NOTE_FOLDERS_TABLE, createNoteAttachment, createNoteFolder, nowIso, removeNoteAttachment, renameNoteFolder, toNotePayload } from '../api';
import {
  emptyNoteFilters,
  filterNotes,
  filterNotesByFolder,
  isNoteFilterActive,
  noteCategories,
  noteMetrics,
  sortNotes,
  toNote,
  toNoteAttachment,
  type Note,
  type NoteAttachment,
  type NoteFilters,
  type NoteFormValues,
  type NoteMetrics,
} from '../types';

export interface UseNotesResult extends NoteMetrics {
  /** Toutes les notes du foyer, de la plus récente à la plus ancienne. */
  notes: Note[];
  /** Notes de l'onglet courant, après recherche plein texte et filtre de catégorie. */
  visibleNotes: Note[];
  categories: string[];
  folders: NoteFolderRow[];
  /** Onglet dossier : `null` = Général. */
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  /** Faux pour le rôle `enfant` (lecture seule). */
  canWrite: boolean;
  createFolder: (name: string, visibility: NoteFolderRow['visibility']) => Promise<NoteFolderRow>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
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
  addNote: (values: NoteFormValues, files?: File[]) => Promise<void>;
  editNote: (note: Note, values: NoteFormValues, files?: File[], removedAttachmentIds?: string[]) => Promise<void>;
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
  const attachmentsResource = useResource<NoteAttachmentRow>('note_attachments');
  const foldersResource = useResource<NoteFolderRow>(NOTE_FOLDERS_TABLE);
  const folders = useMemo(
    () => [...foldersResource.rows].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [foldersResource.rows],
  );

  const folderStorageKey = `eo:notes:folder:${householdId ?? 'none'}`;
  const [storedFolderId, setStoredFolderId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(folderStorageKey);
    } catch {
      return null;
    }
  });
  const activeFolderId =
    storedFolderId !== null && folders.some((folder) => folder.id === storedFolderId) ? storedFolderId : null;
  const setActiveFolderId = useCallback(
    (id: string | null) => {
      setStoredFolderId(id);
      try {
        if (id === null) window.localStorage.removeItem(folderStorageKey);
        else window.localStorage.setItem(folderStorageKey, id);
      } catch {
        // Stockage indisponible : l'onglet reste en mémoire pour la session.
      }
    },
    [folderStorageKey],
  );

  const canWrite = currentMember?.role !== 'enfant';

  const attachmentsByNote = useMemo(() => {
    const grouped = new Map<string, NoteAttachment[]>();
    for (const row of attachmentsResource.rows) {
      const attachment = toNoteAttachment(row);
      const list = grouped.get(attachment.noteId) ?? [];
      list.push(attachment);
      grouped.set(attachment.noteId, list);
    }
    for (const list of grouped.values()) {
      list.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }
    return grouped;
  }, [attachmentsResource.rows]);

  const notes = useMemo(
    () => sortNotes(rows.map((row) => toNote(row, attachmentsByNote.get(row.id) ?? []))),
    [rows, attachmentsByNote],
  );
  const visibleNotes = useMemo(
    () => filterNotesByFolder(filterNotes(notes, filters), activeFolderId),
    [activeFolderId, filters, notes],
  );
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
  const refresh = useCallback(
    () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [NOTES_TABLE] }),
      queryClient.invalidateQueries({ queryKey: ['note_attachments'] }),
      queryClient.invalidateQueries({ queryKey: [NOTE_FOLDERS_TABLE] }),
    ]),
    [queryClient],
  );

  const depositFiles = useCallback(async (noteId: string, files: File[]) => {
    if (!householdId) throw new Error('Aucun foyer sélectionné.');
    for (const file of files) {
      await createNoteAttachment(householdId, noteId, file);
    }
  }, [householdId]);

  const addNote = useCallback(
    async (values: NoteFormValues, files: File[] = []) => {
      if (!householdId) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const created = await create({
        ...toNotePayload(values),
        household_id: householdId,
        created_by: currentMember?.id ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      // La note existe : son identifiant sert de dossier de stockage.
      if (files.length > 0) {
        try {
          await depositFiles(created.id, files);
        } catch (filesError) {
          await refresh();
          throw filesError;
        }
      }
      await refresh();
    },
    [canWrite, create, currentMember?.id, depositFiles, householdId, refresh],
  );

  const editNote = useCallback(
    async (note: Note, values: NoteFormValues, files: File[] = [], removedAttachmentIds: string[] = []) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await update(note.id, { ...toNotePayload(values), updated_at: nowIso() });
      for (const attachmentId of removedAttachmentIds) {
        await removeNoteAttachment(attachmentId);
      }
      if (files.length > 0) {
        try {
          await depositFiles(note.id, files);
        } catch (filesError) {
          await refresh();
          throw filesError;
        }
      }
      await refresh();
    },
    [canWrite, depositFiles, refresh, update],
  );

  const removeNote = useCallback(
    async (note: Note) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      // En ligne la cascade SQL emporte les pièces jointes ; en local
      // l'adaptateur n'a pas de cascade implicite, on retire explicitement.
      await data.removeWhere('note_attachments', { note_id: note.id }).catch(() => undefined);
      await remove(note.id);
      await refresh();
    },
    [canWrite, refresh, remove],
  );

  const createFolder = useCallback(
    async (name: string, visibility: NoteFolderRow['visibility']) => {
      if (!householdId || !currentMember) throw new Error('Aucun foyer sélectionné.');
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      const folder = await createNoteFolder(householdId, currentMember.id, name, visibility);
      await refresh();
      return folder;
    },
    [canWrite, currentMember, householdId, refresh],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await renameNoteFolder(id, name);
      await refresh();
    },
    [canWrite, refresh],
  );

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!canWrite) throw new Error('Votre rôle ne permet pas d’écrire ici.');
      await data.remove(NOTE_FOLDERS_TABLE, id);
      if (activeFolderId === id) setActiveFolderId(null);
      await refresh();
    },
    [activeFolderId, canWrite, refresh, setActiveFolderId],
  );

  return {
    notes,
    visibleNotes,
    categories,
    folders,
    activeFolderId,
    setActiveFolderId,
    canWrite,
    createFolder,
    renameFolder,
    deleteFolder,
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
