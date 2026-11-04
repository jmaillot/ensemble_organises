/**
 * Enregistrement du service worker en mode `prompt` (D-09) : aucun reload
 * sans action de l'utilisateur. L'extraction hors de `main.tsx` permet un
 * accès au store hors-React (`getState()`), patron `session-store.ts`.
 */
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { useBannerStore } from '@/components/banners/banner-store';

/**
 * État SW minimal, consommé par le panneau offline au plan 32-03 (D-12).
 */
interface SwState {
  registration: ServiceWorkerRegistration | null;
  setRegistration: (registration: ServiceWorkerRegistration | null) => void;
}

export const useSwState = create<SwState>()((set) => ({
  registration: null,
  setRegistration: (registration) => set({ registration }),
}));

export const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Dédupliqué par le store (Pitfall 4) — un push répété ne duplique pas.
    useBannerStore.getState().push({ kind: 'sw-update', priority: 1 });
  },
  onRegisteredSW(_, registration) {
    useSwState.getState().setRegistration(registration ?? null);
  },
});
