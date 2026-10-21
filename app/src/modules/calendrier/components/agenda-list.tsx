import { cn } from '@/lib/utils';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { PendingAssignee } from '@/components/shared/pending-assignee';
import { Icon } from '@/components/shared/icon';
import { LoadingRows } from '@/components/ui/empty-state';
import type { AgendaItem, CalendarEvent } from '../types';

/**
 * Chaque type d'entrée porte son aplat pastel et son pictogramme : la couleur
 * ne suffit jamais à distinguer un jour férié d'un anniversaire.
 */
const chipVisual: Record<AgendaItem['kind'], { className: string; emoji: string }> = {
  event: { className: 'bg-accent-soft text-accent-strong', emoji: '🗓️' },
  tache: { className: 'bg-lilac text-[oklch(42%_0.12_300)]', emoji: '✅' },
  anniversaire: { className: 'bg-blush text-[oklch(42%_0.13_20)]', emoji: '🎂' },
  ferie: { className: 'bg-amber-soft text-[oklch(45%_0.11_78)]', emoji: '🏛️' },
  vacances: { className: 'bg-sky text-[#1f4e79]', emoji: '🏖️' },
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
      <div className="flex items-center gap-3 rounded-[16px] bg-accent-faint px-4 py-4">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-[18px]">
          🌿
        </span>
        <div className="min-w-0 text-[12px] text-muted">
          <strong className="block text-[14px] text-fg">Journée libre</strong>
          <span>Profitez de cette journée, ou ajoutez un événement pour la partager au foyer.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1" data-date={date}>
      {items.map((item) => {
        const chip = chipVisual[item.kind];
        return (
          <div
            key={item.key}
            className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-start gap-3 rounded-[16px] px-1 py-3 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint/70 max-[650px]:grid-cols-[46px_minmax(0,1fr)_auto] max-[650px]:gap-2.5"
          >
            <span className="pt-0.5 text-[11.5px] font-extrabold text-accent-strong tabular-nums">{item.time}</span>
            <div className="min-w-0">
              <strong className="block text-[14px] leading-snug font-semibold">{item.title}</strong>
              {item.subtitle ? <small className="mt-0.5 block text-[11.5px] text-muted">{item.subtitle}</small> : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex min-h-[24px] items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-extrabold',
                    chip.className,
                  )}
                >
                  <span aria-hidden="true">{chip.emoji}</span>
                  {item.chipLabel}
                </span>
                {item.kind === 'event' && item.author ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <MemberAvatar member={item.author} size="sm" />
                    {item.author.display_name}
                  </span>
                ) : null}
                {item.kind === 'tache' && item.assigneesUnknown ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <PendingAssignee size="sm" />
                  </span>
                ) : null}
                {item.kind === 'tache' && item.assignees.length > 0 && !item.assigneesUnknown ? (
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
                  className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
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
                    className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint hover:text-fg"
                  >
                    <Icon name="edit" size="sm" />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(item.event)}
                    aria-label={`Supprimer ${item.event.title}`}
                    className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted transition-colors duration-[var(--duration-quick)] hover:border-coral hover:bg-coral-soft hover:text-coral"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
