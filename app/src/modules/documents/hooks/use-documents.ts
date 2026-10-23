import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useResource } from '@/lib/data/useResource';
import { data } from '@/lib/data';
import { invalidateTables } from '@/modules/calendrier/hooks/use-calendrier';
import { useHouseholdStore } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import type { DocumentFolderRow, DocumentRow } from '@/types';
import {
  createDocument,
  createDocumentFolder,
  removeDocument,
  removeDocumentFolder,
  updateDocument,
  updateDocumentFolder,
} from '../api';
import {
  documentExpiryStateOf,
  sortDocuments,
  toDocument,
  toDocumentFolder,
  type Document,
  type DocumentExpiryState,
  type DocumentFolder,
  type DocumentFolderFormValues,
  type DocumentFormValues,
} from '../types';

export interface DocumentsResource {
  folders: DocumentFolder[];
  documents: Document[];
  today: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isMutating: boolean;
  /** Documents triés : expirés d'abord, puis bientôt périmés, puis le reste. */
  sortedDocuments: Document[];
  /** Comptage par dossier (inclut la racine via `null`). */
  countByFolder: (folderId: string | null) => number;
  saveDocument: (id: string | null, values: DocumentFormValues) => Promise<void>;
  removeDocument: (document: Document) => Promise<void>;
  saveFolder: (id: string | null, values: DocumentFolderFormValues) => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  expiryStateOf: (document: Document) => DocumentExpiryState;
}

export function useDocuments(): DocumentsResource {
  const queryClient = useQueryClient();
  const householdId = useHouseholdStore((state) => state.householdId);
  const enabled = Boolean(householdId);

  const foldersResource = useResource<DocumentFolderRow>('document_folders', {
    filter: { household_id: householdId ?? '' },
    enabled,
  });
  const documentsResource = useResource<DocumentRow>('documents', {
    filter: { household_id: householdId ?? '' },
    enabled,
  });

  const today = todayIso();
  const refresh = useCallback(() => {
    void invalidateTables(queryClient, ['document_folders', 'documents']);
  }, [queryClient]);

  // Réactivité hors ligne / démo : l'adaptateur local notifie les écritures.
  useEffect(() => data.subscribe('document_folders', refresh), [refresh]);
  useEffect(() => data.subscribe('documents', refresh), [refresh]);

  const folders = useMemo(() => foldersResource.rows.map(toDocumentFolder), [foldersResource.rows]);
  const documents = useMemo(() => documentsResource.rows.map(toDocument), [documentsResource.rows]);

  const expiryState = useCallback(
    (document: Document): DocumentExpiryState => documentExpiryStateOf(document.expiresOn, today),
    [today],
  );

  const sortedDocuments = useMemo(() => sortDocuments(documents, today), [documents, today]);

  const countByFolder = useCallback(
    (folderId: string | null) => documents.filter((document) => document.folderId === folderId).length,
    [documents],
  );

  const saveDocument = useCallback(
    async (id: string | null, values: DocumentFormValues) => {
      if (id) {
        // Édition sans redépôt : le fichier reste celui d'origine.
        await updateDocument(id, values);
      } else {
        await createDocument(values, householdId ?? '');
      }
      refresh();
    },
    [householdId, refresh],
  );

  const removeOne = useCallback(
    async (document: Document) => {
      await removeDocument(document.id, document.storagePath);
      refresh();
    },
    [refresh],
  );

  const saveFolder = useCallback(
    async (id: string | null, values: DocumentFolderFormValues) => {
      if (id) {
        await updateDocumentFolder(id, values);
      } else {
        await createDocumentFolder(values, householdId ?? '');
      }
      refresh();
    },
    [householdId, refresh],
  );

  const removeFolderFn = useCallback(
    async (id: string) => {
      await removeDocumentFolder(id);
      refresh();
    },
    [refresh],
  );

  return {
    folders,
    documents,
    today,
    isLoading: foldersResource.isLoading || documentsResource.isLoading,
    isError: foldersResource.isError || documentsResource.isError,
    error: foldersResource.error ?? documentsResource.error,
    refetch: () => {
      foldersResource.refetch();
      documentsResource.refetch();
    },
    isMutating: foldersResource.isMutating || documentsResource.isMutating,
    sortedDocuments,
    countByFolder,
    saveDocument,
    removeDocument: removeOne,
    saveFolder,
    removeFolder: removeFolderFn,
    expiryStateOf: expiryState,
  };
}
