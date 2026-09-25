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

/** État vide soigné : une invitation claire et une action, jamais un écran blanc. */
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
    <div
      className={cn(
        'grid min-h-70 place-items-center rounded-[16px] border border-dashed border-accent/40 bg-surface px-7 py-8 text-center',
        className,
      )}
    >
      <div>
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name={icon} size="lg" />
        </div>
        <h3 className="mb-1.5 font-display text-lg tracking-[-0.035em]">{title}</h3>
        <p className="mx-auto mb-4 max-w-[370px] text-xs text-muted">{description}</p>
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
