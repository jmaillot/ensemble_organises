import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { seedOnlineStatus } from '@/lib/online-status';
import { OfflineBanner } from '@/components/shared/offline-banner';

/**
 * Amorçage de l'état réseau au démarrage — gardes de l'état INITIAL.
 *
 * POURQUOI CES GARDES. `onlineManager` naît avec `#online = true` en dur
 * (`@tanstack/query-core/build/modern/onlineManager.js:13`) et ne change
 * QU'À un événement `online`/`offline` du document courant. Sur un
 * DÉMARRAGE À FROID hors ligne, aucun événement n'arrive : l'état reste `true`,
 * le bandeau ne se rend pas, et — conséquence 2, mesurée par le Test B — le
 * retour réel du réseau (`setOnline(true)`) n'est PAS un changement, donc
 * `setOnline` ne notifie personne (`onlineManager.js:77-84`), et le
 * `refetchOnReconnect: true` posé par `261019-dw6` reste mort sur le chemin
 * exact qu'il visait. Le remède est d'amorcer l'état une fois, depuis
 * `navigator.onLine`, avant le premier rendu.
 *
 * POURQUOI LA RESTAURATION DU SINGLETON EST IMPÉRATIVE ICI. `onlineManager` est
 * un singleton partagé À L'INTÉRIEUR de ce fichier : un test laissé hors ligne
 * ferait échouer les tests SUIVANTS du MÊME fichier pour une raison qui n'est
 * pas la leur. La restauration suit aussi la convention des deux fichiers
 * voisins qui pilotent le singleton (`offline-banner.test.tsx:17-23`,
 * `query-policy.test.ts:78-82`). Elle ne protège PAS d'une contagion
 * INTER-FICHIERS : Vitest tourne avec `isolate: true` (seuls `pool: 'forks'` et
 * `fileParallelism: false` sont posés dans `vite.config.ts`), donc chaque
 * fichier a son propre registre de modules et `offline-banner.test.tsx`,
 * `query-policy.test.ts` ou `courses-offline.test.tsx` ne peuvent pas hériter
 * de notre état. L'affirmer plus large serait faux (§2.7 I).
 */

beforeEach(() => {
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/**
 * Pose un `navigator.onLine` propre et rend une fonction de restauration.
 *
 * `onLine` est un accesseur en LECTURE SEULE porté par le prototype de
 * `navigator` : on ne peut pas l'assigner. Le descripteur PROPRE vaut donc
 * `undefined` au départ ; on pose une propriété propre, puis on restaure en
 * remettant le descripteur propre d'origine s'il existait, sinon en supprimant
 * le nôtre pour laisser réapparaître l'accesseur du prototype. On ne remplace
 * jamais tout `navigator` ici (ce serait trop large) — le Test C, lui, a
 * précisément besoin de le rendre absent.
 */
function stubNavigatorOnline(value: boolean): () => void {
  const own = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  return () => {
    if (own) {
      Object.defineProperty(window.navigator, 'onLine', own);
    } else {
      delete (window.navigator as { onLine?: boolean }).onLine;
    }
  };
}

/** La racine des sources (`app/src`), trouvée en remontant depuis le cwd. */
function findSourceRoot(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidates = [directory, resolve(directory, 'src'), resolve(directory, 'app/src')];
    for (const candidate of candidates) {
      if (existsSync(resolve(candidate, 'lib/query-policy.ts'))) return candidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

describe('amorçage de l’état réseau au démarrage', () => {
  it('A. un démarrage à froid hors ligne affiche le bandeau dès le premier rendu', () => {
    const restore = stubNavigatorOnline(false);
    try {
      seedOnlineStatus();

      expect(onlineManager.isOnline()).toBe(false);

      // Pas de JSX : le plan nomme ce fichier `.ts` (et ses commandes de
      // vérification aussi), donc `createElement` plutôt que `<OfflineBanner />`
      // — la syntaxe JSX exigerait une extension `.tsx`.
      render(createElement(OfflineBanner));
      expect(screen.getByRole('status')).toHaveTextContent('Vous êtes hors ligne');
    } finally {
      restore();
    }
  });

  it('B. après amorçage hors ligne, le retour du réseau est un CHANGEMENT notifié', () => {
    const restore = stubNavigatorOnline(false);
    const notifications: boolean[] = [];
    const unsubscribe = onlineManager.subscribe((online) => notifications.push(online));
    try {
      seedOnlineStatus();

      // Le chemin qu'emprunte un vrai événement `online` du document.
      onlineManager.setOnline(true);

      // `[false, true]` : deux CHANGEMENTS. Sans amorçage, l'état vaut déjà
      // `true` et `setOnline(true)` ne notifie rien — le journal reste vide.
      expect(notifications).toEqual([false, true]);
    } finally {
      unsubscribe();
      restore();
    }
  });

  it('C. sans navigator, l’amorçage ne lève pas et laisse l’état en ligne', () => {
    // `vi.stubGlobal` LIE l'identifiant à `undefined` sans le supprimer :
    // `typeof navigator` vaut donc `'undefined'` (la garde reste efficace) et
    // c'est la lecture `navigator.onLine` sur `undefined` qui lèverait, le cas
    // échéant — pas un `ReferenceError`.
    vi.stubGlobal('navigator', undefined);
    try {
      expect(() => seedOnlineStatus()).not.toThrow();
      expect(onlineManager.isOnline()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('D. le bootstrap appelle seedOnlineStatus() avant createRoot(', () => {
    const root = findSourceRoot();
    expect(root, `racine des sources introuvable depuis ${process.cwd()}`).not.toBeNull();

    const source = readFileSync(resolve(root!, 'main.tsx'), 'utf8');
    const seedIndex = source.indexOf('seedOnlineStatus()');
    const renderIndex = source.indexOf('createRoot(');

    // Non-vacuité : si `createRoot(` était absent, ce ne serait pas `main.tsx`
    // et la garde ne regarderait rien.
    expect(renderIndex, 'app/src/main.tsx ne contient pas createRoot(').toBeGreaterThanOrEqual(0);
    expect(seedIndex, 'app/src/main.tsx n’appelle pas seedOnlineStatus()').toBeGreaterThanOrEqual(0);
    expect(seedIndex, 'l’amorçage doit précéder le rendu').toBeLessThan(renderIndex);

    // LIMITE DITE : c'est une garde TEXTUELLE, de la même nature que le Test E
    // de `query-policy.test.ts`. L'aiguille peut être satisfaite par un simple
    // commentaire : elle garde la forme de régression OBSERVÉE (retrait de
    // l'appel), pas contre un auteur décidé. C'est acceptable parce que la
    // propriété (« le bootstrap amorce avant de rendre ») n'est pas observable
    // plus finement sans démarrer le bootstrap complet (`#root` pré-rempli,
    // routeur et authentification mockés), que `app/src/main.test.tsx:29-31`
    // importe DÉJÀ `./main` — l'appel module-level s'exécute donc sous
    // `npm test`, sans y être asserté — et que le Test A double la propriété du
    // côté de l'EFFET. Une garde comportementale dédiée exigerait de reproduire
    // tout ce harnais pour une ligne : disproportionné ici.
  });
});
