/**
 * Les ensembles que le client remplace en bloc, et le contrat qui rend ce
 * remplacement atomique.
 *
 * POURQUOI CETTE TABLE DE CORRESPONDANCE EXISTE. Six endroits du dépôt
 * remplaçaient un ensemble (« les assignataires de cette tâche », « les
 * rappels de cette routine ») par un `removeWhere()` suivi de `create()`.
 * Deux requêtes PostgREST n'ont aucune transaction en commun : si la seconde
 * échoue, la première a déjà supprimé l'ensemble précédent, et la perte est
 * réelle. En mode démo, la même séquence laisse un intervalle pendant lequel
 * un lecteur voit l'ensemble vide.
 *
 * Chaque ensemble a donc UNE fonction SQL atomique (`0133_replace_sets.sql`)
 * et un seul point d'entrée côté client (`DataAdapter.replaceSet`). La
 * correspondance est déclarée ici plutôt que dupliquée dans les deux
 * adaptateurs : une table ajoutée à cette carte sans sa fonction SQL échoue à
 * l'exécution en mode Supabase, et le test de contrat le signale.
 */
export type SetTable =
  | 'task_assignees'
  | 'task_reminders'
  | 'routine_assignees'
  | 'routine_reminders'
  | 'recipe_tag_links';

export interface SetTableSpec {
  /** Colonne qui rattache la ligne à son parent. */
  parentColumn: string;
  /** Colonne dont l'ensemble est remplacé : les valeurs passées à `replaceSet`. */
  childColumn: string;
  /** Fonction SQL appelée en mode Supabase (0133). */
  rpc: string;
  /** Nom du paramètre « parent » de cette fonction. */
  parentParam: string;
  /** Nom du paramètre « valeurs » de cette fonction. */
  valuesParam: string;
  /**
   * Table parente portant `household_id`, quand la table de jointure ne l'a
   * pas (`recipe_tag_links`). Le mode démo y lit le foyer pour ses lectures
   * par foyer ; le mode Supabase ne le transmet jamais, la fonction SQL le
   * dérive du parent — un client ne choisit pas le foyer d'une ligne.
   */
  householdFrom?: string;
}

export const SET_TABLES: Record<SetTable, SetTableSpec> = {
  task_assignees: {
    parentColumn: 'task_id',
    childColumn: 'member_id',
    rpc: 'replace_task_assignees',
    parentParam: 'p_task_id',
    valuesParam: 'p_member_ids',
  },
  task_reminders: {
    parentColumn: 'task_id',
    childColumn: 'remind_at',
    rpc: 'replace_task_reminders',
    parentParam: 'p_task_id',
    valuesParam: 'p_remind_ats',
  },
  routine_assignees: {
    parentColumn: 'routine_id',
    childColumn: 'member_id',
    rpc: 'replace_routine_assignees',
    parentParam: 'p_routine_id',
    valuesParam: 'p_member_ids',
  },
  routine_reminders: {
    parentColumn: 'routine_id',
    childColumn: 'remind_at',
    rpc: 'replace_routine_reminders',
    parentParam: 'p_routine_id',
    valuesParam: 'p_remind_ats',
  },
  recipe_tag_links: {
    parentColumn: 'recipe_id',
    childColumn: 'tag_id',
    rpc: 'replace_recipe_tag_links',
    parentParam: 'p_recipe_id',
    valuesParam: 'p_tag_ids',
    householdFrom: 'recipes',
  },
};
