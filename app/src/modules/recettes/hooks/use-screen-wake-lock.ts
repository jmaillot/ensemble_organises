import { useEffect, useRef } from 'react';

/**
 * Veille suivant le toggle « Mode cuisine » (R4 amendé, D-10, D-11) : aucun
 * élément séparé — `request('screen')` quand `active` passe vrai (si
 * `navigator.wakeLock` existe), `release()` au cleanup (toggle-OFF,
 * changement de fiche, démontage), réacquisition sur `visibilitychange`
 * vers visible si toujours actif.
 *
 * Types natifs TS 7.0.2 uniquement (`lib.dom.d.ts`), aucun shim, tsconfig
 * intouché (RESEARCH). Tout rejet est silencieux : la cuisine continue,
 * sans erreur ni toast. La mention de repli est rendue par la vue, jamais
 * ici.
 */
export interface ScreenWakeLock {
  supported: boolean;
}

export function useScreenWakeLock(active: boolean): ScreenWakeLock {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          // Course request lente puis toggle-OFF avant résolution : on
          // relâche aussitôt, pas de verrou fantôme (piège Pitfall 4).
          await sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Refus / contexte non sécurisé / onglet caché : silencieux.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !activeRef.current) return;
      const current = sentinelRef.current;
      if (!current || current.released) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      // Garde sentinelle déjà relâchée : pas de double-release.
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
  }, [active, supported]);

  return { supported };
}
