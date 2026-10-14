import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { useScreenWakeLock } from './hooks/use-screen-wake-lock';
import { RecipeCuisineView } from './components/recipe-cuisine-view';

interface MockSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
}

function createSentinel(): MockSentinel {
  const sentinel: MockSentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };
  return sentinel;
}

function stubWakeLock(request: (type: string) => Promise<MockSentinel>) {
  Object.defineProperty(window.navigator, 'wakeLock', {
    value: { request: vi.fn(request) },
    configurable: true,
    writable: true,
  });
}

function stubVisible() {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
}

const STEPS = [
  { id: 'w-1', content: 'Éplucher les pommes de terre.', position: 0 },
  { id: 'w-2', content: 'Enfourner 45 minutes.', position: 1 },
];

describe('useScreenWakeLock (R4 amendé, D-10, D-11)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if ('wakeLock' in window.navigator) {
      // @ts-expect-error — nettoyage du stub de test.
      delete window.navigator.wakeLock;
    }
  });

  it('non supporté : supported faux, aucune demande, jamais d’erreur', () => {
    const { result } = renderHook(() => useScreenWakeLock(true));
    expect(result.current.supported).toBe(false);
  });

  it('supporté mais OFF : aucune demande', async () => {
    const sentinel = createSentinel();
    stubWakeLock(async () => sentinel);
    const { result } = renderHook(({ active }: { active: boolean }) => useScreenWakeLock(active), {
      initialProps: { active: false },
    });
    expect(result.current.supported).toBe(true);
    await act(async () => {});
    expect(window.navigator.wakeLock.request).not.toHaveBeenCalled();
  });

  it('ON demande le verrou, OFF le relâche', async () => {
    const sentinel = createSentinel();
    stubWakeLock(async () => sentinel);
    const { rerender } = renderHook(({ active }: { active: boolean }) => useScreenWakeLock(active), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    await act(async () => {});
    expect(window.navigator.wakeLock.request).toHaveBeenCalledWith('screen');

    rerender({ active: false });
    await act(async () => {});
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('démontage en ON relâche le verrou', async () => {
    const sentinel = createSentinel();
    stubWakeLock(async () => sentinel);
    const { rerender, unmount } = renderHook(({ active }: { active: boolean }) => useScreenWakeLock(active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('ON/OFF rapide avant résolution : relâché quand même, pas de fantôme (piège Pitfall 4)', async () => {
    let resolveRequest!: (sentinel: MockSentinel) => void;
    stubWakeLock(() => new Promise<MockSentinel>((resolve) => {
      resolveRequest = resolve;
    }));
    const { rerender } = renderHook(({ active }: { active: boolean }) => useScreenWakeLock(active), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    await act(async () => {});
    // OFF avant que la demande ne résolve.
    rerender({ active: false });
    const sentinel = createSentinel();
    await act(async () => {
      resolveRequest(sentinel);
    });
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('sentinelle déjà relâchée par le système : pas de double-release', async () => {
    const sentinel = createSentinel();
    stubWakeLock(async () => sentinel);
    const { rerender } = renderHook(({ active }: { active: boolean }) => useScreenWakeLock(active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    await act(async () => {});
    // Le système a déjà relâché (onglet masqué).
    sentinel.released = true;
    rerender({ active: false });
    await act(async () => {});
    expect(sentinel.release).not.toHaveBeenCalled();
  });

  it('visibilitychange vers visible réacquiert quand le mode est ON', async () => {
    stubVisible();
    const first = createSentinel();
    const second = createSentinel();
    const request = vi.fn(async () => (request.mock.calls.length <= 1 ? first : second));
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);

    // Verrou perdu (système), onglet de nouveau visible.
    first.released = true;
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('demande rejetée : silencieux, supported reste vrai', async () => {
    stubWakeLock(async () => {
      throw new Error('non sécurisé');
    });
    const { result } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(result.current.supported).toBe(true);
  });

  it('non supporté : mention discrète sous la barre, jamais d’erreur', () => {
    renderWithProviders(<RecipeCuisineView steps={STEPS} recipeId="r-veille-repli" wakeLockSupported={false} />);
    expect(screen.getByText('Veille non bloquée sur cet appareil.')).toBeInTheDocument();
  });

  it('supporté : aucune mention de repli', () => {
    renderWithProviders(<RecipeCuisineView steps={STEPS} recipeId="r-veille-ok" wakeLockSupported />);
    expect(screen.queryByText('Veille non bloquée sur cet appareil.')).not.toBeInTheDocument();
  });
});
