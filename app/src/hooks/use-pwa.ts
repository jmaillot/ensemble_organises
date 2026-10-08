import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent('eo:install-available'));
  });
}

/** Proposition d'installation de la PWA (bouton de la barre supérieure). */
export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(() => deferredPrompt !== null);

  useEffect(() => {
    const onAvailable = () => setCanInstall(true);
    const onInstalled = () => setCanInstall(false);
    window.addEventListener('eo:install-available', onAvailable);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('eo:install-available', onAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
  }, []);

  return { canInstall, install };
}

/**
 * Étiquettes de synchronisation, miroirs de `src/sw.ts` (D-05). Le worker
 * est le déclencheur, les onglets rejouent via `flushWithAdapter` : même
 * ordre, même comptabilité `attempts`, aucun changement de protocole.
 */
export const EO_QUEUE_SYNC_TAG = 'eo-mutations';
export const EO_PERIODIC_SYNC_TAG = 'eo-periodic';
export const EO_SYNC_MESSAGE = 'EO_SYNC_NOW';
export const EO_SYNC_DONE = 'EO_SYNC_DONE';

interface SyncManagerLike {
  register(tag: string): Promise<void>;
}

interface PeriodicSyncManagerLike {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
}

function backgroundManagers(registration: ServiceWorkerRegistration): {
  sync: SyncManagerLike | null;
  periodicSync: PeriodicSyncManagerLike | null;
} {
  const candidate = registration as unknown as {
    sync?: SyncManagerLike;
    periodicSync?: PeriodicSyncManagerLike;
  };
  return {
    sync: candidate.sync && typeof candidate.sync.register === 'function' ? candidate.sync : null,
    periodicSync:
      candidate.periodicSync && typeof candidate.periodicSync.register === 'function'
        ? candidate.periodicSync
        : null,
  };
}

/**
 * Demande un réveil Background Sync après une mise en file. Dégradation
 * propre : sans service worker ni SyncManager (iOS, Firefox), appel sans
 * effet — le rejeu à la reconnexion et le bouton du panneau restent.
 * Ne rejette jamais.
 */
export function requestQueueSync(): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready
      .then((registration) =>
        backgroundManagers(registration)
          .sync?.register(EO_QUEUE_SYNC_TAG)
          .catch(() => {}),
      )
      .catch(() => {});
  } catch {
    // Navigateur sans support : le rejeu foreground suffit.
  }
}

/**
 * Enregistre la synchronisation périodique (Chrome/Edge, ≈ 12 h minimum
 * imposé par le navigateur). Best-effort, appelé au montage de la synchro
 * hors ligne ; sans support, sans effet. Ne rejette jamais.
 */
export function requestPeriodicSync(): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.ready
      .then((registration) =>
        backgroundManagers(registration)
          .periodicSync?.register(EO_PERIODIC_SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 })
          .catch(() => {}),
      )
      .catch(() => {});
  } catch {
    // Navigateur sans support : le rejeu foreground suffit.
  }
}
