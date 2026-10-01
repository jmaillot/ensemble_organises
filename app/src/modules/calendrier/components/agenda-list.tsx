import { cn } from '@/lib/utils';
import { MemberAvatar, memberTagClass } from '@/components/shared/member-avatar';
import { Icon } from '@/components/shared/icon';
import { LoadingRows } from '@/components/ui/empty-state';
import type { AgendaItem, CalendarEvent } from '../types';

/** Libellé français du type d'entrée d'agenda. */
const chipClass: Record<AgendaItem['kind'], string> = {
  event: 'bg-accent-soft text-accent-strong',
  tache: 'bg-[oklch(94%_0.05_300)] text-[oklch(48%_0.13_300)]',
  anniversaire: 'bg-accent-faint text-accent-strong',
  ferie: 'bg-amber-soft text-[oklch(52%_0.11_78)]',
};

export interface AgendaListProps {
  date: string;
  items: AgendaItem[];
  isLoading?: boolean;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
  /** Les tâches se gèrent dans leur module : simple navigation. */
  onOpenTask?: () => void;
}

/** Journée sélectionnée : événements, tâches, anniversaires et jours fériés. */
export function AgendaList({ date, items, isLoading = false, onEdit, onDelete, onOpenTask }: AgendaListProps) {
  if (isLoading) return <LoadingRows rows={3} />;

  if (items.length === 0) {
    // Sans bouton : le panneau affiche déjà « Ajouter un événement » et
    // « Ajouter une tâche » juste en dessous, dans tous les cas.
    return (
      <div className="grid gap-1 py-3 text-[11px] text-muted">
        <strong className="text-[13px] text-fg">Journée libre</strong>
        <span>Profitez de cette journée, ou ajoutez un événement pour la partager au foyer.</span>
      </div>
    );
  }

  return (
    <div className="grid gap-[11px]" data-date={date}>
      {items.map((item) => (
        <div
          key={item.key}
          className="grid grid-cols-[55px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border pb-3 last:border-b-0 last:pb-0 max-[650px]:grid-cols-[48px_minmax(0,1fr)_auto]"
        >
          <span className="text-[12px] font-extrabold text-accent-strong">{item.time}</span>
          <div className="min-w-0">
            <strong className="block text-[13px]">{item.title}</strong>
            {item.subtitle ? <small className="mt-0.5 block text-[11px] text-muted">{item.subtitle}</small> : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-[7px] py-[3px] text-[10px] font-extrabold',
                  chipClass[item.kind],
                )}
              >
                {item.kind === 'ferie' ? <span aria-hidden="true" className={cn('size-[5px] rounded-full', memberTagClass('amber'))} /> : null}
                {item.chipLabel}
              </span>
              {item.kind === 'event' && item.author ? (
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <MemberAvatar member={item.author} size="sm" />
                  {item.author.display_name}
                </span>
              ) : null}
              {item.kind === 'tache' && item.assignees.length > 0 ? (
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  {item.assignees.slice(0, 2).map((assignee) => (
                    <MemberAvatar key={assignee.memberId} member={assignee.member} size="sm" />
                  ))}
                  {item.assignees.map((assignee) => assignee.member.display_name).join(', ')}
                </span>
              ) : null}
            </div>
          </div>
          {item.kind === 'tache' && onOpenTask ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenTask}
                aria-label={`Ouvrir ${item.title} dans les tâches`}
                className="grid size-[30px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
              >
                <Icon name="arrow" size="sm" />
              </button>
            </div>
          ) : null}
          {item.kind === 'event' && (onEdit || onDelete) ? (
            <div className="flex items-center gap-1.5">
              {onEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(item.event)}
                  aria-label={`Modifier ${item.event.title}`}
                  className="grid size-[30px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                >
                  <Icon name="edit" size="sm" />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(item.event)}
                  aria-label={`Supprimer ${item.event.title}`}
                  className="grid size-[30px] place-items-center rounded-[9px] border border-border bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:bg-coral-soft hover:text-coral"
                >
                  <Icon name="trash" size="sm" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
