/**
 * Refus enfant (phase 14, D-03) — logique PURE : aucun import Deno ni `npm:`,
 * donc testable par la suite Vitest (`child-guard.test.ts`).
 *
 * Quand le rôle du foyer, résolu côté serveur (lookup `household_members`
 * en `service_role` dans `index.ts` — jamais un claim client), est
 * `enfant`, l'action `user` est refusée avec l'erreur uniforme de sa
 * famille : les chaînes ci-dessous sont des MIROIRS byte-identiques des
 * sorties de `translateRpcError` dans `index.ts`. Si l'une change là-bas,
 * ce fichier ET son test suivent (le test casse sur la dérive).
 *
 * Sans foyer résolu (liste/article/code inconnu), `index.ts` laisse le RPC
 * trancher : ne jamais transformer un 404 oracle en 403 qui révélerait
 * l'existence.
 */

export type ChildGuardAction = 'manage' | 'reserve' | 'code';

/** `true` si et seulement si le rôle vaut exactement `enfant`. */
export function isChildRole(role: unknown): boolean {
  return role === 'enfant';
}

/** Erreur uniforme à rendre pour un enfant sur une action `user`. */
export function childRefusal(action: ChildGuardAction): { status: number; message: string } {
  switch (action) {
    case 'manage':
      return {
        status: 403,
        message:
          'Seul le propriétaire de la liste ou un administrateur du foyer peut faire cette opération.',
      };
    case 'reserve':
      return { status: 403, message: 'Vous ne pouvez pas réserver cet article.' };
    case 'code':
      return { status: 404, message: 'Ce code est invalide.' };
    default: {
      const exhaustive: never = action;
      throw new Error(`Action inconnue pour le refus enfant : ${String(exhaustive)}`);
    }
  }
}
