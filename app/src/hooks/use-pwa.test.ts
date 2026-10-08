import { afterEach, describe, expect, it, vi } from 'vitest';
import { EO_PERIODIC_SYNC_TAG, EO_QUEUE_SYNC_TAG, requestPeriodicSync, requestQueueSync } from './use-pwa';

/**
 * Enregistrement Background/Periodic Sync (D-05) : la file déclenche un
 * réveil du worker là où le navigateur le permet, et ne fait rien — sans
 * jamais lever — partout ailleurs (iOS, Firefox, jsdom).
 */

function setServiceWorker(value: unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', { value, configurable: true });
}

afterEach(() => {
  delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.restoreAllMocks();
});

describe('requestQueueSync', () => {
  it('ne fait rien sans service worker', async () => {
    expect(() => requestQueueSync()).not.toThrow();
    await Promise.resolve();
  });

  it('enregistre le tag de file quand SyncManager existe', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    setServiceWorker({ ready: Promise.resolve({ sync: { register } }) });
    requestQueueSync();
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith(EO_QUEUE_SYNC_TAG));
  });

  it('avale le refus d’enregistrement et l’absence de SyncManager', async () => {
    const failing = vi.fn().mockRejectedValue(new DOMException('refusé'));
    setServiceWorker({ ready: Promise.resolve({ sync: { register: failing } }) });
    expect(() => requestQueueSync()).not.toThrow();
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());

    setServiceWorker({ ready: Promise.resolve({}) });
    expect(() => requestQueueSync()).not.toThrow();
    await Promise.resolve();
  });
});

describe('requestPeriodicSync', () => {
  it('enregistre le tag périodique quand PeriodicSync existe', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    setServiceWorker({ ready: Promise.resolve({ periodicSync: { register } }) });
    requestPeriodicSync();
    await vi.waitFor(() =>
      expect(register).toHaveBeenCalledWith(EO_PERIODIC_SYNC_TAG, expect.objectContaining({ minInterval: expect.any(Number) })),
    );
  });

  it('ne fait rien sans support', async () => {
    expect(() => requestPeriodicSync()).not.toThrow();
    await Promise.resolve();

    setServiceWorker({ ready: Promise.resolve({}) });
    expect(() => requestPeriodicSync()).not.toThrow();
    await Promise.resolve();
  });
});
