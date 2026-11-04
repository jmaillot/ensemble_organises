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
export function useInstallPrompt() {  const [canInstall, setCanInstall] = useState(() => deferredPrompt !== null);

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
 * « L'app est installée » (D-03) : mode standalone détecté par matchMedia
 * (Chromium/Android/desktop) ou `navigator.standalone` (iOS Safari, qui
 * n'expose pas display-mode). Patron module-scope : l'état initial est lu
 * avant le premier rendu pour éviter un flash de la bannière install.
 */
function readInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneQuery = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return standaloneQuery || iosStandalone;
}

export function usePwaInstalled(): boolean {
  const [installed, setInstalled] = useState(readInstalled);

  useEffect(() => {
    const query = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setInstalled(readInstalled());
    query.addEventListener('change', onChange);
    window.addEventListener('appinstalled', onChange);
    return () => {
      query.removeEventListener('change', onChange);
      window.removeEventListener('appinstalled', onChange);
    };
  }, []);

  return installed;
}
