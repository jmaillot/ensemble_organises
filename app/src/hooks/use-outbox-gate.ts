/**
 * Contrat D-10 : le bouton « Recharger » du bandeau de mise à jour est
 * désactivé tant que la file sortante (actions hors-ligne) n'est pas vide —
 * recharger appliquerait un nouveau SW pendant que des écritures attendent.
 *
 * Stub de la phase 32 : répond toujours « vide ». La phase 34 branchera la
 * vraie file SANS changer aucun composant : cette frontière est le contrat.
 */
export function useOutboxGate(): { isEmpty: boolean } {
  return { isEmpty: true };
}
