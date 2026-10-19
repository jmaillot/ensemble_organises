import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listTaskAssignees } from '@/modules/taches/api';
import { queryKeys } from '@/lib/data/useResource';

/**
 * État des assignations pour un ensemble de tâches ouvertes.
 *
 * L'ambiguïté est portée par le TYPE, et pas par un commentaire : une lecture
 * qui n'a rien rendu (en vol, ou en erreur) n'est pas une lecture qui a rendu
 * un tableau vide. Un appelant ne peut donc pas lire `data ?? []` à la place
 * d'un « on ne sait pas » — l'omission est une erreur de compilation.
 *
 * C'est la même leçon que `QUERY_POLICY` (D-10) : une seule source, et l'état
 * incertain ne se déguise pas en état ordinaire.
 */
export type OpenTaskAssignees =
  | { state: 'unknown' }
  | { state: 'known'; byTask: ReadonlyMap<string, readonly string[]> };

/**
 * Assignations des tâches ouvertes demandées.
 *
 * La clé vit sous `['all', 'task_assignees', …]` : c'est le préfixe que les
 * invalidations d'assignation visent réellement (`queryKeys.tableAll(
 * TASK_ASSIGNEES_TABLE)`, dans `use-taches.ts` `refreshChildren`, et le
 * `refetchQueries` de la garde D-08). Le shell et la cloche construisent donc
 * la même clé pour la même table et le même `queryFn` — la requête est
 * partagée quand leurs ensembles d'identifiants coïncident, c'est voulu.
 *
 * CORPS D'AUJOURD'HUI, ET VOLONTAIREMENT : ce corps reproduit la règle actuelle
 * (`query.data ?? []`, jamais `'unknown'`) pour que les gardes de
 * `use-open-task-assignees.test.tsx` rougissent sur l'ASSERTION et non sur un
 * import manquant. Le corps juste est le geste de la tâche 261019-n14.
 */
export function useOpenTaskAssignees(openTaskIds: readonly string[]): OpenTaskAssignees {
  const query = useQuery({
    queryKey: [...queryKeys.tableAll('task_assignees'), openTaskIds],
    enabled: openTaskIds.length > 0,
    queryFn: () => listTaskAssignees([...openTaskIds]),
  });
  // Clé stable : `openTaskIds` est un tableau refait à chaque rendu par
  // l'appelant, et le mémoriser sur son identité ferait recalculer le `useMemo`
  // à chaque fois pour rien (constat (d) de la phase 19).
  const idsKey = openTaskIds.join('\u0000');
  return useMemo<OpenTaskAssignees>(() => {
    const byTask = new Map<string, string[]>();
    for (const entry of query.data ?? []) {
      const list = byTask.get(entry.task_id) ?? [];
      list.push(entry.member_id);
      byTask.set(entry.task_id, list);
    }
    return { state: 'known', byTask };
  }, [query.data, idsKey]);
}

/**
 * Règle « quelles tâches ouvertes me concernent » : une tâche sans assigné
 * compte pour le foyer, une tâche assignée compte pour ses assignés, et jamais
 * pour les autres. C'est exactement ce que `isOpenForMe`
 * (`@/modules/taches/types`) encode pour la page Tâches — la règle métier
 * n'est pas recopiée ici, c'est la DISTINCTION entre « personne » et « on ne
 * sait pas encore » que cette couture apporte.
 *
 * CORPS D'AUJOURD'HUI, ET VOLONTAIREMENT : il lit un état inconnu comme un
 * foyer sans assignation (donc « toutes les tâches sont à moi ») et `null`
 * comme « ni moi ni personne ». Le corps juste rend `null` dans les deux cas.
 */
export function selectTasksForMember<T extends { id: string }>(
  tasks: readonly T[],
  assignees: OpenTaskAssignees,
  memberId: string | null,
): T[] | null {
  const byTask = assignees.state === 'known' ? assignees.byTask : new Map<string, readonly string[]>();
  return tasks.filter((task) => {
    const list = byTask.get(task.id) ?? [];
    if (list.length === 0) return true;
    return memberId !== null && list.includes(memberId);
  });
}
