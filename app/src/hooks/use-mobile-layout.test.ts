import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MOBILE_LAYOUT_QUERY, useIsMobileLayout } from './use-mobile-layout';

interface MockMediaList {
  __fire: (next: boolean) => void;
}

function mockMatchMedia(matches: boolean) {
  return vi.fn((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      __fire: (next: boolean) => {
        listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
      },
    };
  });
}

/** `window.matchMedia` est assignable (défini `writable` dans le setup). */
function stubWindowMatchMedia(mock: ReturnType<typeof mockMatchMedia>) {
  const previous = window.matchMedia;
  window.matchMedia = mock as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = previous;
  };
}

describe('useIsMobileLayout', () => {
  it('reflète la media query du système de design', () => {
    const matchMedia = mockMatchMedia(true);
    const restore = stubWindowMatchMedia(matchMedia);
    try {
      const { result } = renderHook(() => useIsMobileLayout());
      expect(matchMedia).toHaveBeenCalledWith(MOBILE_LAYOUT_QUERY);
      expect(result.current).toBe(true);
    } finally {
      restore();
    }
  });

  it('bascule quand la largeur franchit 650px', () => {
    const matchMedia = mockMatchMedia(false);
    const restore = stubWindowMatchMedia(matchMedia);
    try {
      const { result } = renderHook(() => useIsMobileLayout());
      expect(result.current).toBe(false);
      // Le hook appelle matchMedia deux fois (état initial + effet) : les
      // écouteurs sont branchés sur la seconde instance.
      const list = matchMedia.mock.results.at(-1)?.value as MockMediaList | undefined;
      act(() => {
        list?.__fire(true);
      });
      expect(result.current).toBe(true);
    } finally {
      restore();
    }
  });
});
