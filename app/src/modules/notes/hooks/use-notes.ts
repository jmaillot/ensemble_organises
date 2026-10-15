import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { data } from '@/lib/data';
import { useResource } from '@/lib/data/useResource';
import { householdMediaPathOf, isHouseholdMediaPath, removeHouseholdFile, resolveHouseholdMediaUrls } from '@/lib/storage';
import { useCurrentMember, useHouseholdStore, useIsAdmin } from '@/stores/household-store';
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

/**
 * Retrait des objets d'un média du foyer, APRÈS la disparition de leurs lignes
 * (D-03, WR-10). La ligne part d'abord, l'objet ensuite : l'inverse laisserait
 * une ligne pointant vers un objet disparu. Best-effort — un bucket
 * indisponible est signalé, jamais transformé en échec d'une suppression de
 * ligne déjà effective (l'utilisateur ne doit pas voir « la note n'a pas pu
 * être supprimée » alors qu'elle est partie).
 */
async function removeStoredObjects(values: (string | null)[]): Promise<void> {
  await Promise.all(
    values.map(async (value) => {
      const path = householdMediaPathOf(value);
      if (!path) return;
      try {
        await removeHouseholdFile(path);
      } catch (error) {
        console.warn(`Objet de média non retiré du bucket : ${path}`, error);
      }
    }),
  );
}

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
  const { rows: allRows, isLoading, isFetching, isError, error, refetch, create, update, remove, isMutating } =
    useResource<NoteRow>(NOTES_TABLE);
  /**
   * Phase 15 : les notes propres à un voyage (`trip_id` renseigné) ne
   * vivent pas dans l'espace du foyer — régime historique `trip_id NULL`
   * (15-01). Les fourches voyage (15-03) liront le même magasin par voyage.
   */
  const rows = useMemo(() => allRows.filter((row) => row.trip_id == null), [allRows]);
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
  const isAdmin = useIsAdmin();

  // Les lignes portent des chemins (D-01) : on forge les URL affichables à la
  // lecture, en échec fermé (annulation stricte, jamais d'état éventé). Les
  // valeurs non-chemin (aperçus démo, http(s) ou `data:` hérités) rendent en
  // synchrone — aucun rendu ajouté ; seuls les chemins passent par l'effet.
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const attachmentRows = attachmentsResource.rows;
  useEffect(() => {
    const pending = attachmentRows.filter((row) => isHouseholdMediaPath(row.file_url));
    if (pending.length === 0) return;
    let cancelled = false;
    void resolveHouseholdMediaUrls(pending).then((resolved) => {
      if (!cancelled) setAttachmentUrls(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentRows]);

  const attachmentsByNote = useMemo(() => {
    const grouped = new Map<string, NoteAttachment[]>();
    for (const row of attachmentRows) {
      // Non-chemin : valeur affichable telle quelle (synchrone) ; chemin :
      // URL forgée par l'effet, `null` en attendant ou en échec fermé.
      const url = isHouseholdMediaPath(row.file_url) ? (attachmentUrls[row.id] ?? null) : row.file_url;
      const attachment = toNoteAttachment(row, url);
      const list = grouped.get(attachment.noteId) ?? [];
      list.push(attachment);
      grouped.set(attachment.noteId, list);
    }
    for (const list of grouped.values()) {
      list.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }
    return grouped;
  }, [attachmentRows, attachmentUrls]);

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
        // La pièce jointe retirée emporte son objet (D-03, WR-10) : la ligne
        // porte le chemin, on le lit AVANT de la supprimer, sinon orphelin en
        // bucket. Les pièces jointes conservées ne sont jamais touchées.
        const removed = await data
          .list<NoteAttachmentRow>('note_attachments', { id: attachmentId })
          .catch(() => [] as NoteAttachmentRow[]);
        await removeNoteAttachment(attachmentId);
        await removeStoredObjects(removed.map((row) => row.file_url));
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
      // Les objets suivent leurs lignes (D-03, WR-10) : les chemins sont lus
      // AVANT la suppression des lignes, les objets retirés APRÈS.
      const attachments = await data
        .list<NoteAttachmentRow>('note_attachments', { note_id: note.id })
        .catch(() => [] as NoteAttachmentRow[]);
      // En ligne la cascade SQL emporte les pièces jointes ; en local
      // l'adaptateur n'a pas de cascade implicite, on retire explicitement.
      // Une note sans pièce jointe n'en supprime aucune : tolérance déclarée.
      await data.removeWhere('note_attachments', { note_id: note.id }, { ifMissing: 'ignore' });
      await remove(note.id);
      await removeStoredObjects(attachments.map((row) => row.file_url));
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
      // `note_folders_delete` (0051:82-87) est admin-seul, alors que créer et
      // renommer un dossier reste ouvert au membre : même classe de défaut que
      // `task_lists_delete` et `routine_folders_delete`.
      if (!isAdmin) throw new Error('Seul un administrateur du foyer peut supprimer.');
      await data.remove(NOTE_FOLDERS_TABLE, id);
      if (activeFolderId === id) setActiveFolderId(null);
      await refresh();
    },
    [activeFolderId, canWrite, isAdmin, refresh, setActiveFolderId],
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
