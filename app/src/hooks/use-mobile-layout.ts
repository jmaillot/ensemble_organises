import { useEffect, useState } from 'react';

/** Point de rupture mobile du système de design (DESIGN.md §8). */
export const MOBILE_LAYOUT_QUERY = '(max-width: 650px)';

/**
 * Vrai quand la media query est satisfaite, et suit ses changements en direct
 * (rotation, redimensionnement, préférence système modifiée à chaud).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}

/**
 * Vrai quand la mise en page mobile s'applique. Monte une seule variante
 * (cartes ou tableau) au lieu d'en masquer une en CSS : le DOM reste
 * strict-mode compatible et les lecteurs d'écran ne voient qu'une liste.
 */
export function useIsMobileLayout(query: string = MOBILE_LAYOUT_QUERY): boolean {
  return useMediaQuery(query);
}
