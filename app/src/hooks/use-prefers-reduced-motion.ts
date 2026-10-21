import { useMediaQuery } from './use-mobile-layout';

/** La préférence système « réduire les animations ». */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Vrai quand la personne a demandé à réduire les animations. Le CSS du dépôt
 * neutralise déjà les transitions et les animations ; ce hook sert aux
 * mouvements qu'on ne veut pas seulement raccourcir mais **ne pas monter du
 * tout** — une pluie de confettis déclenchée à l'ouverture d'un écran, par
 * exemple, qui resterait une animation même à 0,01 ms.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
