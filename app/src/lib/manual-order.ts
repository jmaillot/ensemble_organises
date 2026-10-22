/**
 * Rangs manuels d'un ensemble réordonnable.
 *
 * LA RÈGLE : les éléments DÉPLACÉS occupent les places de ceux qu'ils
 * remplacent, et les autres ne bougent pas. C'est ce qui permet de n'écrire
 * que les rangs qui changent — un glisser ne coûte pas une écriture par
 * élément de la liste.
 *
 * Le calcul est partagé par les tâches (`tasks.priority_order`) et les
 * articles de courses (`shopping_list_items.position`) : une seule règle,
 * employée deux fois. Les deux listes ne se mélangent pas — chacune a ses
 * propres rangs, et l'ordre de l'une n'emporte pas sur l'autre.
 *
 * `orderedIds` est le nouvel ordre des éléments DÉPLACÉS (ceux que le geste
 * a pris), pas l'ordre complet : les éléments non déplacés gardent leur
 * place, et c'est ce qui rend le gesture local.
 */
export function computeManualRanks<T extends { id: string }>(
  items: readonly T[],
  orderedIds: readonly string[],
  rankOf: (item: T) => number,
): Record<string, number> {
  const ordered = [...items].sort((a, b) => rankOf(a) - rankOf(b));
  const wanted = new Set(orderedIds);
  const next = [...ordered];
  const slots: number[] = [];
  ordered.forEach((item, index) => {
    if (wanted.has(item.id)) slots.push(index);
  });
  orderedIds.forEach((id, index) => {
    const item = ordered.find((entry) => entry.id === id);
    const slot = slots[index];
    if (item && slot !== undefined) next[slot] = item;
  });
  return Object.fromEntries(next.map((item, index) => [item.id, index]));
}
