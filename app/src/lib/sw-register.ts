/**
 * Enregistrement du service worker en mode `prompt` (D-09) : aucun reload
 * sans action de l'utilisateur. L'extraction hors de `main.tsx` permet un
 * accès au store hors-React (`getState()`), patron `session-store.ts`.
 */
import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';
import { useBannerStore } from '@/components/banners/banner-store';
import { marquerSegmentFin } from '@/lib/boot-marks';

/**
 * État SW minimal, consommé par le panneau offline au plan 32-03 (D-12).
 */
interface SwState {
  registration: ServiceWorkerRegistration | null;
  /** Un worker en attente existe : mise à jour prête à appliquer (D-12). */
  needsRefresh: boolean;
  setRegistration: (registration: ServiceWorkerRegistration | null) => void;
}

export const useSwState = create<SwState>()((set) => ({
  registration: null,
  needsRefresh: false,
  setRegistration: (registration) => set({ registration }),
}));

export const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Dédupliqué par le store (Pitfall 4) — un push répété ne duplique pas.
    useBannerStore.getState().push({ kind: 'sw-update', priority: 1 });
    useSwState.setState({ needsRefresh: true });
  },
  onRegisteredSW(_, registration) {
    useSwState.getState().setRegistration(registration ?? null);
    // Fin du segment « activation SW » (phase 42, COLD-01) : la borne de
    // début de ce segment est la borne entry commune (main.tsx), posée
    // convention — l'enregistrement du SW démarre avec le bundle. FAIT À
    // CONSIGNER (Pitfall 3) : au cold start hors ligne, ce callback peut
    // ne JAMAIS se déclencher (mark absent, segment laissé à `null`) ou se
    // déclencher à ~0 ms (worker déjà actif) — l'écart entre runs est un
    // fait que le doc mesures consigne, jamais lissé ni masqué ici.
    marquerSegmentFin('sw');
  },
});
