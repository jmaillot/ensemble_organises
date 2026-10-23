import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface HeroCardProps {
  /** Sur-titre en micro-libellé (ex. « Ardoise · Octobre »). */
  kicker?: string;
  /** Le chiffre clé, en Fraunces. Peut porter un `data-testid` du consommateur. */
  value: ReactNode;
  /** Légende sous le chiffre, masquée sous 650px. */
  caption?: string;
  /** Jauge 0–1 : remplissage beurre sur piste translucide. */
  gauge?: number;
  /** Libellé accessible de la jauge — obligatoire en pratique dès que `gauge` est défini. */
  gaugeLabel?: string;
  /** Contenu libre entre la légende et les actions (anneaux, listes courtes). */
  children?: ReactNode;
  /** Actions en bas de carte (une principale, une secondaire). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Carte héro — fond vert profond à dégradé, texte clair, chiffre en Fraunces.
 * Le dégradé est réservé à cette surface (`hero-surface`) : c'est ce qui
 * distingue une ouverture d'ardoise, de budget ou de voyage d'un simple
 * panneau. La jauge est optionnelle et annonce sa valeur aux lecteurs
 * d'écran — la couleur ne porte jamais seule l'information.
 */
export function HeroCard({ kicker, value, caption, gauge, gaugeLabel, children, actions, className }: HeroCardProps) {
  // Une jauge hors bornes sature : 100 % au-delà de 1, 0 % en dessous de 0.
  const clamped = gauge == null ? null : Math.min(1, Math.max(0, gauge));
  return (
    <section
      className={cn(
        'hero-surface min-w-0 rounded-[28px] p-[23px] text-surface max-[650px]:rounded-[24px] max-[650px]:p-4',
        className,
      )}
    >
      {kicker ? <p className="eyebrow mb-2 text-on-dark">{kicker}</p> : null}
      <strong className="block font-display text-[46px] leading-[1.05] tracking-[-0.05em] max-[650px]:text-[34px]">
        {value}
      </strong>
      {caption ? <p className="mt-2 mb-0 text-[12px] text-on-dark max-[650px]:hidden">{caption}</p> : null}
      {clamped !== null ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped * 100)}
          aria-label={gaugeLabel ?? 'Progression'}
          className="mt-4 h-2 overflow-hidden rounded-full bg-[rgb(255_255_255/0.16)]"
        >
          <div
            className="h-full rounded-full bg-butter transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]"
            style={{ width: `${Math.round(clamped * 100)}%` }}
          />
        </div>
      ) : null}
      {children ? <div className="min-w-0">{children}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-2 max-[650px]:mt-4">{actions}</div> : null}
    </section>
  );
}
