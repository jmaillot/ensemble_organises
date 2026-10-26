import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Badge, Checkbox } from '@/components/ui/primitives';
import type { HouseholdMemberRow } from '@/types';
import { memberFirstName, type Routine } from '../types';

export interface RoutineCardProps {
  routine: Routine;
  /** Coche ou décoche l'occurrence du jour. */
  onToggle: (routine: Routine) => void;
  /**
   * Coche l'occurrence du jour AU NOM d'un enfant cible (D-08/D-11) — présent
   * seulement pour un acteur adulte ; l'acteur reste l'utilisateur connecté,
   * le RPC 0146 le résout côté serveur (ENF-03).
   */
  onToggleFor?: (routine: Routine, memberId: string) => void;
  /**
   * Les enfants cochables, calculés par la page via `eligibleMembersForModule`
   * filtrée aux enfants (les adultes cochent par la case self). Vide ou absent
   * : pas de menu.
   */
  toggleTargets?: HouseholdMemberRow[];
  /** Affiche la série en pastille plutôt qu'en texte. */
  showStreakBadge?: boolean;
  className?: string;
  /** Rôle `enfant` : case désactivée, lecture seule. */
  readOnly?: boolean;
}

/**
 * Carte d'une occurrence du jour, façon checklist : case à cocher, nom,
 * fréquence lisible, assignataires colorés et série en cours.
 */
export function RoutineCard({
  routine,
  onToggle,
  onToggleFor,
  toggleTargets,
  showStreakBadge = false,
  className,
  readOnly = false,
}: RoutineCardProps) {
  const done = routine.isDoneToday;
  const people = routine.assignees.map((assignee) => assignee.member.display_name);

  return (
    <article
      role="listitem"
      data-done={done ? 'true' : 'false'}
      className={cn(
        // `.routine-card` de l'export : surface, rayon 16px, gouttière 19px.
        'panel-surface rounded-[20px] p-[18px]',
        // La carte cochée reprend le fond `accent-faint` de l'export.
        done && 'border-accent/25 bg-accent-faint',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggle(routine)}
          disabled={readOnly}
          aria-label={`${done ? 'Rouvrir' : 'Cocher'} la routine ${routine.name} pour aujourd’hui`}
          // Case de 19px comme dans l'export, zone cliquable agrandie à 44px.
          className="relative mt-0.5 after:absolute after:-inset-3 after:content-['']"
        />

        <div className="min-w-0 flex-1">
          {/* `w-fit` : la barre de « terminé » ne doit pas s'étirer sur toute
              la largeur de la carte. */}
          <h3 className={cn('mb-0.5 w-fit font-display text-[16px] tracking-[-0.035em]', done && 'text-muted line-through')}>
            {routine.name}
          </h3>
          <p className="m-0 text-[11px] text-muted">{routine.frequencyLabel}</p>
          {routine.description ? (
            <p className="mt-1.5 mb-0 text-[11px] text-muted">{routine.description}</p>
          ) : null}
        </div>

        <Badge tone={done ? 'accent' : 'muted'}>{done ? 'Fait' : 'À faire'}</Badge>

        {/* « Cocher pour » (25-07, D-08/D-11) : l'adulte coche l'occurrence AU
            NOM d'un enfant servi par les routines. Zéro cible ou acteur enfant :
            pas de menu — l'entrée ne s'affiche que là où elle est légale ; le
            garde adulte/éligible de toggleFor et le RPC 0146 revalident. */}
        {!readOnly && onToggleFor && toggleTargets && toggleTargets.length > 0 ? (
          <DropdownMenuPrimitive.Root>
            <DropdownMenuPrimitive.Trigger asChild>
              <button
                type="button"
                aria-label="Cocher pour"
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-[12px] font-extrabold text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:text-fg"
              >
                Cocher pour
              </button>
            </DropdownMenuPrimitive.Trigger>
            <DropdownMenuPrimitive.Portal>
              <DropdownMenuPrimitive.Content
                align="end"
                sideOffset={6}
                className="z-60 min-w-[210px] rounded-[14px] border border-border/70 bg-surface p-1.5 shadow-[var(--shadow-lg)]"
              >
                {toggleTargets.map((target) => (
                  <DropdownMenuPrimitive.Item
                    key={target.id}
                    onSelect={() => onToggleFor(routine, target.id)}
                    className="flex min-h-11 cursor-default items-center gap-2 rounded-[10px] px-3 text-[13px] outline-none select-none data-[highlighted]:bg-accent-faint data-[highlighted]:text-fg"
                  >
                    <MemberAvatar member={target} size="sm" />
                    {/* A5 : un nom long tronque dans la largeur du menu, sans
                        casser la rangée — pas de plafond inventé : c'est la
                        min-w du menu (gabarit `header-menu`) qui borne. */}
                    <span className="min-w-0 flex-1 truncate">{target.display_name}</span>
                  </DropdownMenuPrimitive.Item>
                ))}
              </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
          </DropdownMenuPrimitive.Root>
        ) : null}
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

        <span className="flex flex-wrap items-center gap-1.5">
          {routine.isLate ? <Badge tone="coral">{routine.lateLabel ?? 'En retard'}</Badge> : null}
          {showStreakBadge && routine.streak > 0 ? (
            <Badge tone="accent">{routine.streakLabel}</Badge>
          ) : (
            <span className="text-[11px] text-muted">{routine.streakLabel}</span>
          )}
        </span>
      </div>
    </article>
  );
}
