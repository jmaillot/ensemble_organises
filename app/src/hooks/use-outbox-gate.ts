import { useOutbox } from './use-outbox';

/**
 * Contrat D-10 : le bouton « Recharger » du bandeau de mise à jour est
 * désactivé tant que la file sortante (actions hors-ligne) n'est pas vide —
 * recharger appliquerait un nouveau SW pendant que des écritures attendent.
 *
 * Branchée en phase 34 (D-03) sur la source unique `useOutbox` : la phase 32
 * répondait toujours « vide » (stub) ; le hook garde sa signature
 * `{ isEmpty: boolean }` — le contrat de frontière est que AUCUN composant de
 * la phase 32 ne change. Une écriture classée terminale (failed) n'empêche
 * plus le rechargement : elle attend une décision dans le panneau, pas un
 * rejeu, et bloquer l'app pour elle la rendrait injoignable sans raison.
 */
export function useOutboxGate(): { isEmpty: boolean } {
  const { pendingCount } = useOutbox();
  return { isEmpty: pendingCount === 0 };
}
