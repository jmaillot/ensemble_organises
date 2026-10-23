import { data } from '@/lib/data';
import {
  depositHouseholdFile,
  householdMediaPathOf,
  removeHouseholdFile,
  storedValueOf,
} from '@/lib/storage';
import type { DocumentFolderRow, DocumentRow } from '@/types';
import {
  documentEditPayload,
  documentFolderFormValuesToRow,
  documentRowPayload,
  type DocumentFormValues,
  type DocumentFolderFormValues,
} from './types';

/**
 * Accès aux documents du foyer (`document_folders` et `documents`,
 * migration 0143). Tout passe par l'adaptateur de données, donc par la RLS
 * côté Supabase : lecture pour les membres du foyer, écriture pour admin et
 * membre, jamais pour le rôle `enfant`.
 *
 * LE FICHIER D'ABORD. `createDocument` dépose le fichier AVANT de créer la
 * ligne : une ligne sans fichier serait un papier fantôme — si le dépôt
 * échoue, aucune ligne n'existe, et le foyer ne voit jamais de document
 * vide. À la suppression, l'inverse : la ligne part d'abord, le fichier est
 * retiré ensuite, au mieux — un fichier orphelin est invisible et sans
 * conséquence, une ligne sans fichier est un mensonge.
 */

const FOLDERS_TABLE = 'document_folders';
const DOCUMENTS_TABLE = 'documents';
/** Dossier du bucket pour les dépôts du module. */
const STORAGE_FOLDER = 'documents';

// ---------------------------------------------------------------------------
// Les dossiers colorés
// ---------------------------------------------------------------------------

export function fetchDocumentFolders(householdId: string): Promise<DocumentFolderRow[]> {
  return data.list<DocumentFolderRow>(FOLDERS_TABLE, { household_id: householdId });
}

export async function createDocumentFolder(
  values: DocumentFolderFormValues,
  householdId: string,
): Promise<DocumentFolderRow> {
  return data.create<DocumentFolderRow>(FOLDERS_TABLE, {
    ...documentFolderFormValuesToRow(values),
    household_id: householdId,
  });
}

export function updateDocumentFolder(id: string, values: DocumentFolderFormValues): Promise<DocumentFolderRow> {
  return data.update<DocumentFolderRow>(FOLDERS_TABLE, id, documentFolderFormValuesToRow(values));
}

/** La suppression ne détruit rien : la base fait retomber les documents à la racine (0143). */
export function removeDocumentFolder(id: string): Promise<void> {
  return data.remove(FOLDERS_TABLE, id);
}

// ---------------------------------------------------------------------------
// Les documents eux-mêmes
// ---------------------------------------------------------------------------

export function fetchDocuments(householdId: string): Promise<DocumentRow[]> {
  return data.list<DocumentRow>(DOCUMENTS_TABLE, { household_id: householdId });
}

export async function createDocument(values: DocumentFormValues, householdId: string): Promise<DocumentRow> {
  // La création exige un fichier : un document sans fichier serait un papier
  // fantôme. La garde réduit le type (`File | null | undefined` → `File`)
  // avant l'upload, sans assertion silencieuse.
  if (!values.file) {
    throw new Error('Un fichier (photo ou PDF) est requis pour créer un document.');
  }
  // Le dossier du bucket porte le foyer : `<householdId>/documents/<fichier>`.
  const deposited = await depositHouseholdFile({ householdId, folder: STORAGE_FOLDER, file: values.file });
  return data.create<DocumentRow>(DOCUMENTS_TABLE, {
    ...documentRowPayload(values, {
      // `storedValueOf` rend le chemin de bucket en Supabase, l'aperçu local
      // en démo : la forme stockée est toujours celle que la lecture sait
      // résoudre (motif 19-01).
      path: storedValueOf(deposited),
      // Le mime et la taille du DÉPÔT font autorité : la compression native
      // peut avoir changé les deux (WR-16).
      mime: deposited.mime,
      size: deposited.size,
    }),
    household_id: householdId,
  });
}

/**
 * Édition SANS redépôt : nom, classement, échéance, note. Le fichier reste
 * celui du dépôt d'origine — remplacer un papier est un geste de suppression
 * et de nouveau dépôt, pas une édition invisible.
 */
export function updateDocument(
  id: string,
  values: Pick<DocumentFormValues, 'name' | 'folderId' | 'expiresOn' | 'notes'>,
): Promise<DocumentRow> {
  return data.update<DocumentRow>(DOCUMENTS_TABLE, id, documentEditPayload(values));
}

export async function removeDocument(id: string, storagePath: string): Promise<void> {
  // La ligne part d'abord : la vérité du foyer est toujours cohérente.
  await data.remove(DOCUMENTS_TABLE, id);
  // Puis le fichier, au mieux : `householdMediaPathOf` rend null pour les
  // formes non-chemin (aperçu démo), et l'échec de nettoyage laisse un
  // objet invisible plutôt qu'une erreur bloquante (motif recettes).
  const path = householdMediaPathOf(storagePath);
  if (path) await removeHouseholdFile(path).catch(() => undefined);
}
