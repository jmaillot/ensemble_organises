import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Badge, Checkbox } from '@/components/ui/primitives';
import { memberFirstName, type Routine } from '../types';

export interface RoutineCardProps {
  routine: Routine;
  /** Coche ou décoche l'occurrence du jour. */
  onToggle: (routine: Routine) => void;
  /** Affiche la série en pastille plutôt qu'en texte. */
  showStreakBadge?: boolean;
  className?: string;
}

/**
 * Carte d'une occurrence du jour, façon checklist : case à cocher, nom,
 * fréquence lisible, assignataires colorés et série en cours.
 */
export function RoutineCard({ routine, onToggle, showStreakBadge = false, className }: RoutineCardProps) {
  const done = routine.isDoneToday;
  const people = routine.assignees.map((assignee) => assignee.member.display_name);

  return (
    <article
      role="listitem"
      data-done={done ? 'true' : 'false'}
      className={cn(
        // `.routine-card` de l'export : surface, rayon 16px, gouttière 19px.
        'panel-surface rounded-[16px] p-[19px]',
        // La carte cochée reprend le fond `accent-faint` de l'export.
        done && 'border-accent/25 bg-accent-faint',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle(routine)}
          aria-label={`${done ? 'Rouvrir' : 'Cocher'} la routine ${routine.name} pour aujourd’hui`}
          // Case de 19px comme dans l'export, zone cliquable agrandie à 44px.
          className="relative mt-0.5 after:absolute after:-inset-3 after:content-['']"
        />

        <div className="min-w-0 flex-1">
          {/* `w-fit` : la barre de « terminé » ne doit pas s'étirer sur toute
              la largeur de la carte. */}
          <h3 className={cn('mb-0.5 w-fit font-display text-[15px] tracking-[-0.035em]', done && 'text-muted line-through')}>
            {routine.name}
          </h3>
          <p className="m-0 text-[11px] text-muted">{routine.frequencyLabel}</p>
          {routine.description ? (
            <p className="mt-1.5 mb-0 text-[11px] text-muted">{routine.description}</p>
          ) : null}
        </div>

        <Badge tone={done ? 'accent' : 'muted'}>{done ? 'Fait' : 'À faire'}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          {routine.assignees.length === 0 ? (
            'Personne assigné'
          ) : (
            <>
              <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
                {routine.assignees.map((assignee) => (
                  <MemberAvatar
                    key={assignee.memberId}
                    member={assignee.member}
                    size="sm"
                    className="ring-2 ring-surface"
                  />
                ))}
              </span>
              <span className="truncate">{people.map(memberFirstName).join(', ')}</span>
            </>
          )}
        </span>

        {showStreakBadge && routine.streak > 0 ? (
          <Badge tone="accent">{routine.streakLabel}</Badge>
        ) : (
          <span className="text-[11px] text-muted">{routine.streakLabel}</span>
        )}
      </div>
    </article>
  );
}
