/**
 * Modules dont on peut supprimer un dossier, et tables mises en jeu.
 *
 * Les trois modules partagent la même mécanique — un dossier, des items qui le
 * référencent — mais pas les mêmes tables. Le nom transmis à la RPC est celui
 * du module, pas celui d'une table : le client ne choisit pas la table qu'une
 * fonction serveur ira modifier.
 */
export type FolderKind = 'taches' | 'notes' | 'routines';

export interface FolderKindSpec {
  /** Table des dossiers (`task_lists`, `note_folders`, `routine_folders`). */
  folderTable: string;
  /** Table des items rangés dans ces dossiers. */
  itemTable: string;
}

export const FOLDER_KINDS: Record<FolderKind, FolderKindSpec> = {
  taches: { folderTable: 'task_lists', itemTable: 'tasks' },
  notes: { folderTable: 'note_folders', itemTable: 'notes' },
  routines: { folderTable: 'routine_folders', itemTable: 'routines' },
};
