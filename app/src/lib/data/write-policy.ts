import { onlineManager } from '@tanstack/react-query';
import { DataError } from './adapter';

/**
 * Liste blanche d'ÉCRITURE (D-06, WRQ-03) — les 5 tables de D-14 exactement.
 *
 * POURQUOI UN MODULE FEUILLE. Cette liste était d'abord posée dans
 * `query-policy.ts`, à côté de la frontière offline de LECTURE. Mais la garde
 * doit aussi être posée par l'adaptateur (`supabase-adapter.ts`) comme filet
 * de sécurité de classe — et l'adaptateur ne peut pas importer
 * `query-policy.ts`, qui tire la fabrique du client TanStack et la file
 * d'écriture. Le bloc est donc descendu ici, dans un module sans dépendance
 * applicative autre que `adapter` (le type `DataError`), que tout le monde
 * peut importer sans cycle.
 *
 * POURQUOI PAS LES MÊMES TABLES QUE LA LECTURE. La liste d'écriture est PLUS
 * ÉTROITE que la lecture (OFFLINE_FAMILIES dans `query-policy.ts`) : ni
 * `products`, ni `shopping_lists` elles-mêmes, ni les annexes
 * (`household_members`, `profiles`) — seules les tables portant `client_key`
 * (0177) peuvent être enfilées et rejouées de façon idempotente.
 *
 * La liste est consultée à TROIS endroits (T-34-05) : la garde de mutation
 * `assertWriteAllowed` dans les hooks Tier 1 (refus upfront D-07), le filtre
 * du MutationCache dans `query-policy.ts` (défense en profondeur contre un
 * chemin oublié), et l'adaptateur `supabase-adapter.ts` (filet de sécurité de
 * classe, §2.7 E — toute écriture passe tôt ou tard par lui).
 */
export const WRITE_ALLOWLIST = [
  'shopping_list_items',
  'tasks',
  'task_assignees',
  'routines',
  'routine_completions',
] as const;

export function isWriteAllowed(table: string): boolean {
  return (WRITE_ALLOWLIST as readonly string[]).includes(table);
}

/** Message utilisateur d'un refus upfront (D-07) — le module appelant le toast tel quel. */
export const OFFLINE_WRITE_REFUSED_MESSAGE = 'Ce module n’est pas disponible hors-ligne.';

/**
 * Garde upfront (D-07) : une écriture sur un module hors liste est rejetée
 * AVANT tout départ réseau quand l'app est hors ligne — la requête échouerait
 * de toute façon, autant porter un message clair plutôt qu'une TypeError
 * fetch. EN LIGNE, la garde ne dit rien : les modules hors liste (ardoise,
 * notes, cadeaux…) fonctionnent normalement — refuser, ce serait casser
 * l'app entière ; la liste blanche borne le HORS-LIGNE, pas le général.
 */
export function assertWriteAllowed(table: string): void {
  if (isWriteAllowed(table)) return;
  if (onlineManager.isOnline()) return;
  throw new DataError(OFFLINE_WRITE_REFUSED_MESSAGE);
}
