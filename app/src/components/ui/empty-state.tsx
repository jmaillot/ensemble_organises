import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/components/shared/icon';
import { Button } from './button';
import { Skeleton } from './skeleton';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

/** État vide soigné : une illustration discrète, une invitation claire et une action. */
export function EmptyState({
  icon = 'heart',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('grid min-h-[280px] place-items-center px-6 py-10 text-center', className)}>
      <div>
        {/* Le dessin grandit sur PC (≥651 px) : une pastille de 76 px avec
            une icône de 21 px passait pour un timbre-poste sur un grand
            écran. Mobile inchangé. */}
        <div className="relative mx-auto mb-5 grid size-[76px] place-items-center rounded-[30px] bg-sage/70 text-accent-strong min-[651px]:mb-6 min-[651px]:size-[112px] min-[651px]:rounded-[44px]">
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-butter min-[651px]:-top-2 min-[651px]:-right-2 min-[651px]:size-5"
          />
          <Icon name={icon} size="xl" className="max-[650px]:size-[21px]" />
        </div>
        <h3 className="mb-1.5 font-display text-[22px] leading-tight tracking-[-0.03em]">{title}</h3>
        <p className="mx-auto mb-5 max-w-[350px] text-[13px] leading-relaxed text-muted">{description}</p>
        {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
          <div className="flex flex-wrap justify-center gap-2">
            {actionLabel && onAction ? (
              <Button onClick={onAction} icon="plus">
                {actionLabel}
              </Button>
            ) : null}
            {secondaryActionLabel && onSecondaryAction ? (
              <Button variant="secondary" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-[16px] border border-coral/30 bg-coral-soft/40 px-6 py-7 text-center">
      <div>
        <h3 className="mb-1.5 font-display text-base tracking-[-0.035em]">Ce contenu n’a pas pu être chargé</h3>
        <p className="mx-auto mb-4 max-w-md text-xs text-muted">{message}</p>
        {onRetry ? (
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            Réessayer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-2.5', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement en cours…</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  );
}
