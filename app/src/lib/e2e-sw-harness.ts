/**
 * Harnais e2e de la gate SW (phase 41, GATE-01) — exposé sur
 * `window.__eoSwHarness` UNIQUEMENT quand la variable de build
 * `VITE_E2E_SW_HARNESS` vaut '1'. Aucune chaîne de production ne pose cette
 * variable (compose.app.yaml, le Dockerfile §8.2 et build-app.sh ne passent
 * que `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`) : le
 * tree-shaking Rollup sur la constante d'environnement élimine ce module de
 * tout bundle de production — preuve exigée au wrapper (`scripts/test-sw-gate.sh`)
 * par grep du bundle du build standard (assumption A2), jamais supposée.
 *
 * Le harnais n'écrit QUE dans les sources existantes de l'application :
 *  - le `queryClient` exporté par `@/app/router` (l'instance unique montée par
 *    `QueryClientProvider` — la source unique de la file, D-03) ;
 *  - `signInDemo()` de `session-store.ts`, le canal officiel de la session de
 *    démonstration (le couple utilisateur/foyer doit exister avant toute
 *    écriture dans la file : `useOutbox` est `enabled` seulement avec les
 *    deux — Pitfall 5).
 * Il ne réimplémente JAMAIS `onNeedRefresh` ni la gate : `sw-register.ts`,
 * `use-outbox-gate.ts` et `update-banner.tsx` restent à diff nul (SC3).
 */

import { queryClient } from '@/app/router';
import { enqueueOutbox, outboxKeyFor } from '@/lib/offline/outbox';
import { signInDemo, useSessionStore } from '@/stores/session-store';
import { useHouseholdStore } from '@/stores/household-store';

interface EoSwHarness {
  /** Estampille de build injectée par `VITE_BUILD_ID` au build du wrapper. */
  buildId: string;
  /** Point d'attente : l'app est montée et le harnais est utilisable. */
  ready(): Promise<void>;
  /** Enfile une écriture pendante dans la file du couple démo (source unique). */
  injectOutboxPending(): Promise<void>;
  /** Vide la file du couple démo (branche « gate ouverte »). */
  clearOutbox(): Promise<void>;
}

declare global {
  interface Window {
    __eoSwHarness?: EoSwHarness;
  }
}

// La garde est évaluée au BUILD : sans le flag, Rollup élimine le bloc entier
// (constante d'environnement remplacée littéralement par Vite).
if (import.meta.env.VITE_E2E_SW_HARNESS === '1') {
  const harness: EoSwHarness = {
    buildId: import.meta.env.VITE_BUILD_ID ?? '',
    ready: async () => {
      // Rien à attendre : le module est chargé avec le bundle principal, le
      // `queryClient` de `@/app/router` existe dès l'import de main.tsx.
    },
    injectOutboxPending: async () => {
      // Pitfall 5 : la query outbox n'existe que pour un couple (utilisateur,
      // foyer) établi. On garantit la session de démonstration par le canal
      // officiel (`signInDemo`) avant toute écriture — jamais un état posé en
      // parallèle, et `setQueryData` sur une clé jamais montée est invisible.
      const session = useSessionStore.getState();
      if (session.status !== 'authenticated' || !session.user) {
        await signInDemo();
      }
      const userId = useSessionStore.getState().user?.id ?? null;
      const householdId = useHouseholdStore.getState().householdId;
      if (!userId || !householdId) {
        throw new Error(
          '__eoSwHarness.injectOutboxPending : aucun couple (utilisateur, foyer) établi — ' +
            'la session de démonstration n’a pas pu être garantie.',
        );
      }
      // L'enfilage passe par le helper officiel `enqueueOutbox` (D-02/D-03) :
      // forme d'`OutboxEntry` construite par le code de production lui-même,
      // jamais par un doublon du harnais. Table `tasks` de l'allowlist
      // d'écriture — le marqueur `meta` est la même forme que celle posée par
      // les mutations centralisées.
      enqueueOutbox(
        queryClient,
        { table: 'tasks', operation: 'update' },
        { id: 'e2e-gate-task', values: { name: 'Écriture pendante du harnais e2e (gate SW)' } },
      );
    },
    clearOutbox: async () => {
      const userId = useSessionStore.getState().user?.id ?? null;
      const householdId = useHouseholdStore.getState().householdId;
      if (!userId || !householdId) {
        throw new Error('__eoSwHarness.clearOutbox : aucun couple (utilisateur, foyer) établi.');
      }
      // D-01 : toute écriture de la file passe par `setQueryData` sur la clé
      // officielle — vider la file ne fait pas exception.
      queryClient.setQueryData(outboxKeyFor(userId, householdId), []);
    },
  };
  window.__eoSwHarness = harness;
}
