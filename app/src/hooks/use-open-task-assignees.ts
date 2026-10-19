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
 * invalidations d'assignation visent réellement — `queryKeys.tableAll(
 * TASK_ASSIGNEES_TABLE)` dans `use-taches.ts` `refreshChildren`, et le
 * `refetchQueries` de la garde D-08. Jamais `invalidateQueries({ queryKey:
 * [table] })` : ce préfixe-là ne descend pas jusqu'ici. Le shell et la cloche
 * construisent donc la même clé pour la même table et le même `queryFn` — la
 * requête est partagée quand leurs ensembles d'identifiants coïncident, c'est
 * voulu.
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
    // « On ne sait pas » se dit : une lecture qui n'a JAMAIS rien rendu n'est pas
    // une lecture qui a rendu « personne ». C'est tout le défaut que cette
    // couture corrige, et la raison pour laquelle l'état est dans le TYPE.
    //
    // Le repère est `data === undefined`, et NON `status !== 'success'` : le
    // cache garde `data` quand un rafraîchissement ultérieur échoue (réseau qui
    // tombe, relecture après invalidation), et effacer un chiffre réellement lu
    // parce qu'une relecture a raté serait remplacer un mensonge par un autre.
    if (query.data === undefined) return { state: 'unknown' };
    const byTask = new Map<string, string[]>();
    for (const entry of query.data) {
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
 * `null` dit « on ne sait pas », et l'appelant décide de n'afficher rien :
 * rendre les tâches du foyer dans ce cas les afficherait comme « à moi ».
 */
export function selectTasksForMember<T extends { id: string }>(
  tasks: readonly T[],
  assignees: OpenTaskAssignees,
  memberId: string | null,
): T[] | null {
  if (assignees.state !== 'known' || memberId === null) return null;
  return tasks.filter((task) => {
    const list = assignees.byTask.get(task.id) ?? [];
    if (list.length === 0) return true;
    return list.includes(memberId);
  });
}
