import { cn } from '@/lib/utils';

export interface PendingAssigneeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Mêmes gabarits que `MemberAvatar`, pour que rien ne bouge à l'arrivée. */
const sizeClass = {
  sm: 'size-[23px] rounded-[8px] text-[11px]',
  md: 'size-8 rounded-[11px] text-[12px]',
  lg: 'size-11 rounded-[14px] text-[13px]',
} as const;

/**
 * Rond d'attente à la place d'un avatar quand la lecture des assignations n'a
 * pas encore rendu (ou a échoué). Distinct d'un avatar absent, qui affirme
 * « personne n'est assigné » : ici on ne sait pas encore (TODO #16).
 */
export function PendingAssignee({ size = 'sm', className }: PendingAssigneeProps) {
  return (
    <span
      role="img"
      aria-label="Assignation en cours de chargement"
      className={cn(
        'inline-grid shrink-0 place-items-center border border-dashed border-border text-muted',
        sizeClass[size],
        className,
      )}
    >
      <span aria-hidden="true">…</span>
    </span>
  );
}
