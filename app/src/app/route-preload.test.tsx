import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense, lazy } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazyRoute } from '@/components/ui/route-error';
import {
  ROUTE_CHUNK_COUNT,
  __resetRoutePreloadForTests,
  preloadRouteChunks,
  routeChunkLoaders,
  type RouteChunkLoader,
} from './route-preload';

let silence: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  silence = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  silence.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubIdleNow() {
  const ric = vi.fn((callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void): number => {
    callback({ didTimeout: false, timeRemaining: () => 50 });
    return 0;
  });
  Object.defineProperty(window, 'requestIdleCallback', { value: ric, configurable: true, writable: true });
  return ric;
}

function stubOffline() {
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
}

function restoreOnline() {
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
}

/**
 * Ligne de base (09-06, D-09) : le motif historique des routes — un `lazy()`
 * nu sous `Suspense` — face à un morceau qui ne se charge pas (navigation
 * hors ligne vers une page jamais visitée). Constat : aucun état de réessai
 * ne vient jamais relever le repli — c'est le gel signalé par l'UAT.
 */
describe('Navigation hors ligne — ligne de base (repli figé)', () => {
  it("le motif nu (sans garde) ne propose aucun réessai quand le morceau échoue", async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      const JamaisChargee = lazy(() => Promise.reject(new Error('Failed to fetch chunk')));
      const root = createRoot(container, { onUncaughtError: () => {} });
      try {
        // Le morceau est déjà rejeté : React lève pendant le rendu, et sans
        // garde l'erreur remonte jusqu'à la racine — aucun réessai.
        await act(async () => {
          root.render(
            <Suspense fallback={<div>Chargement de la page…</div>}>
              <JamaisChargee />
            </Suspense>,
          );
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
      } catch {
        // Motif nu : l'échec du morceau échappe au repli, sans aucun recours.
      }
      // Le repli (ou le vide après l'erreur non captée) : jamais un réessai.
      expect(container.textContent).not.toMatch(/réessayer/i);
      root.unmount();
    } finally {
      container.remove();
    }
  });
});

/**
 * Garde par route : un import rejeté rend l'état de réessai, « Réessayer »
 * ré-importe vraiment, et le retour réseau relance tout seul.
 */
describe('LazyRoute — garde d\u2019erreur par route', () => {
  it('affiche un état de réessai explicite quand le morceau échoue', async () => {
    render(<LazyRoute load={() => Promise.reject(new Error('Failed to fetch chunk'))} />);

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.getByText(/n'a pas pu se charger/)).toBeInTheDocument();
    // Le repli de chargement a cédé la place à l'état d'échec.
    expect(screen.queryByText('Chargement de la page…')).not.toBeInTheDocument();
  });

  it('« Réessayer » ré-importe le morceau et affiche la page au succès', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const load: RouteChunkLoader = () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('Failed to fetch chunk'));
      return Promise.resolve({ default: () => <div>Page rétablie</div> });
    };
    render(<LazyRoute load={load} />);

    await user.click(await screen.findByRole('button', { name: /réessayer/i }));
    expect(await screen.findByText('Page rétablie')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('le retour réseau relance automatiquement le chargement', async () => {
    let attempts = 0;
    const load: RouteChunkLoader = () => {
      attempts += 1;
      if (attempts < 2) return Promise.reject(new Error('offline'));
      return Promise.resolve({ default: () => <div>Page revenue</div> });
    };
    render(<LazyRoute load={load} />);
    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('Page revenue')).toBeInTheDocument();
  });
});

/**
 * Préchargeur idle : couvre toute la table, ne part jamais avant l'idle
 * (première peinture intacte), en ligne seulement, séquentiel et tolérant.
 */
describe('preloadRouteChunks — préchargement idle', () => {
  beforeEach(() => {
    __resetRoutePreloadForTests();
    restoreOnline();
  });

  afterEach(() => {
    __resetRoutePreloadForTests();
    restoreOnline();
    if ('requestIdleCallback' in window) {
      Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'requestIdleCallback');
    }
  });

  it('la table couvre un morceau par route paresseuse', () => {
    expect(ROUTE_CHUNK_COUNT).toBe(31);
    expect(Object.keys(routeChunkLoaders)).toHaveLength(31);
  });

  it("ne télécharge rien avant l'idle, puis chaque morceau en ligne", async () => {
    const calls: string[] = [];
    const loaders: RouteChunkLoader[] = ['a', 'b', 'c'].map((key) => () => {
      calls.push(key);
      return Promise.resolve({ default: () => null });
    });
    const ric = stubIdleNow();

    preloadRouteChunks(loaders);
    // Rien de synchrone : le navigateur peint d'abord, précharge ensuite.
    expect(ric).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(calls).toEqual(['a', 'b', 'c']));
  });

  it('un morceau indisponible n\u2019interrompt pas les suivants', async () => {
    const calls: string[] = [];
    const loaders: RouteChunkLoader[] = [
      () => {
        calls.push('premier');
        return Promise.resolve({ default: () => null });
      },
      () => {
        calls.push('cassé');
        return Promise.reject(new Error('Failed to fetch chunk'));
      },
      () => {
        calls.push('dernier');
        return Promise.resolve({ default: () => null });
      },
    ];
    stubIdleNow();

    preloadRouteChunks(loaders);
    await vi.waitFor(() => expect(calls).toEqual(['premier', 'cassé', 'dernier']));
  });

  it('ne précharge rien hors ligne', async () => {
    stubOffline();
    const loader: RouteChunkLoader = vi.fn(() => Promise.resolve({ default: () => null }));
    stubIdleNow();

    preloadRouteChunks([loader]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(loader).not.toHaveBeenCalled();
  });

  it('sans requestIdleCallback, le repli différé précharge quand même', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const loaders: RouteChunkLoader[] = ['x', 'y'].map((key) => () => {
      calls.push(key);
      return Promise.resolve({ default: () => null });
    });

    preloadRouteChunks(loaders);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2500);
    expect(calls).toEqual(['x', 'y']);
  });

  it('ne se monte qu\u2019une fois (double-effet du mode strict)', async () => {
    const first: RouteChunkLoader = vi.fn(() => Promise.resolve({ default: () => null }));
    const second: RouteChunkLoader = vi.fn(() => Promise.resolve({ default: () => null }));
    stubIdleNow();

    preloadRouteChunks([first]);
    preloadRouteChunks([second]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
