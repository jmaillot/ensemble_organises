import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { getDatabase, useDatabaseName } from '@/lib/data/dexie';
import { getLocalAdapter } from '@/lib/data/local-adapter';

// Une base par fichier de test : les suites ne partagent plus leurs données.
const testPath = expect.getState().testPath ?? 'unknown';
useDatabaseName(`ensemble-organises-test-${testPath.replace(/[^a-z0-9]+/gi, '-')}`);

// jsdom n'implémente pas matchMedia : requis par les media queries de l'export.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!('scrollTo' in window)) {
  Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} });
}

// jsdom n'implémente pas scrollIntoView (utilisé par les dialogues Radix).
if (!('scrollIntoView' in Element.prototype)) {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
}

// Les primitives Radix observent la taille et l'intersection des éléments.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', { writable: true, value: IntersectionObserverStub });
}

afterEach(async () => {
  cleanup();
  const db = getDatabase();
  await db.rows.clear();
  await db.mutations.clear();
  // Le cache est vide : l'amorçage du jeu de démonstration doit refaire son
  // contrôle au prochain accès.
  getLocalAdapter().invalidateSeedCache();
});
