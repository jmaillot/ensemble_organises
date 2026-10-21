import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/** Assez de confettis pour emplir l'écran, assez peu pour ne rien peindre d'inutile. */
const PARTICLE_COUNT = 28;

/** Aplats du système visuel : aucune couleur inventée pour la fête. */
const PARTICLE_COLORS = [
  'var(--color-coral)',
  'var(--color-amber)',
  'var(--color-sage-strong)',
  'var(--color-coral-strong)',
  'var(--color-butter)',
];

interface Particle {
  left: number;
  size: number;
  round: boolean;
  color: string;
  delayMs: number;
  durationMs: number;
  driftPx: number;
  spinDeg: number;
}

/**
 * Répartition **déterministe**, dérivée de l'index. Un tirage aléatoire
 * changerait à chaque rendu : le parent se réexécute à chaque état (ouverture
 * d'un dialogue, réponse réseau) et la pluie déjà en vol sauterait d'un coup.
 * Ici, le même écran donne toujours la même pluie.
 */
const PARTICLES: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
  left: (index * 37) % 100,
  size: 7 + (index % 4) * 2,
  round: index % 3 === 0,
  color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
  delayMs: (index * 137) % 900,
  durationMs: 2600 + ((index * 41) % 1400),
  driftPx: ((index % 5) - 2) * 22,
  spinDeg: 240 + ((index * 53) % 480),
}));

/**
 * Pluie de confettis du jour J : purement décorative, au-dessus de la
 * navigation basse, et sans capture du pointeur — on continue de pouvoir
 * cliquer n'importe où pendant qu'elle tombe.
 *
 * Trois intentions, dans cet ordre : **delight** (un anniversaire est rare,
 * une fois par an et par personne, il a droit à un geste), **repère** (le
 * jour J se distingue du « ce mois-ci » sans lire une date) et **annonce**
 * portée par le texte de la ligne, pas par l'animation — l'overlay est
 * `aria-hidden`, la personne qui l'écoute n'y perd rien.
 */
export function BirthdayConfetti({ className }: { className?: string }) {
  const isReducedMotion = usePrefersReducedMotion();

  // Rien du tout, plutôt qu'une animation ramenée à 0,01 ms par le CSS : la
  // préférence porte sur le fait qu'un écran se mette à bouger à l'ouverture,
  // pas sur sa vitesse.
  if (isReducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      data-confetti="birthday"
      className={cn('pointer-events-none fixed inset-0 z-50 overflow-hidden', className)}
    >
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="absolute top-0 block"
          style={
            {
              left: `${particle.left}%`,
              width: `${particle.size}px`,
              height: `${particle.round ? particle.size : Math.round(particle.size * 1.7)}px`,
              backgroundColor: particle.color,
              borderRadius: particle.round ? '9999px' : '2px',
              animation: `confetti-fall ${particle.durationMs}ms linear ${particle.delayMs}ms forwards`,
              '--confetti-drift': `${particle.driftPx}px`,
              '--confetti-spin': `${particle.spinDeg}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
