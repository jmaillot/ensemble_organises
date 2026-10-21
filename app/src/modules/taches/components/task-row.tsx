import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { Checkbox } from '@/components/ui/primitives';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { PendingAssignee } from '@/components/shared/pending-assignee';
import { PriorityTag } from '@/components/shared/module-shell';
import { memberFirstName, type Task } from '../types';

export interface TaskRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Rôle `enfant` : lecture seule, sans poignée ni actions d'écriture. */
  readOnly?: boolean;
  /**
   * Gouverne la seule corbeille. Par défaut l'ancien comportement
   * (`!readOnly`) : un appelant qui n'a pas migré ne change pas de rendu.
   * Un membre peut éditer mais pas supprimer : la politique serveur
   * `tasks_delete_admin` réserve la suppression à l'administrateur.
   */
  canDelete?: boolean;
}

/**
 * Ligne de tâche : poignée de réordonnancement, case à cocher, échéance,
 * assignataires, rappel, priorité et actions. Le glisser-déposer s'appuie sur
 * dnd-kit, la poignée restant un vrai bouton utilisable au clavier.
 */
export function TaskRow({ task, onToggle, onEdit, onDelete, readOnly = false, canDelete = !readOnly }: TaskRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const done = task.status === 'fait';

  return (
    <div
      ref={setNodeRef}
      role="listitem"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group grid grid-cols-[20px_22px_minmax(0,1fr)_auto] items-start gap-3 rounded-[16px] px-2 py-3 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint/70 max-[650px]:grid-cols-[22px_minmax(0,1fr)_auto] max-[650px]:gap-2.5',
        task.isLate && 'bg-coral-soft/70 hover:bg-coral-soft',
        isDragging && 'opacity-50',
      )}
    >
      {!readOnly ? (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Réordonner : ${task.name}`}
          className="relative mt-[3px] grid size-5 cursor-grab place-items-center text-muted/70 transition-colors duration-[var(--duration-quick)] hover:text-fg active:cursor-grabbing max-[650px]:hidden after:absolute after:-inset-3 after:content-['']"
        >
          <Icon name="drag" size="sm" />
        </button>
      ) : (
        <span aria-hidden="true" className="max-[650px]:hidden" />
      )}

      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(task)}
        disabled={readOnly}
        aria-label={`${done ? 'Rouvrir' : 'Terminer'} ${task.name}`}
        // La case mesure 22px : la zone cliquable est agrandie à 42px sans
        // modifier la mise en page.
        className="relative mt-[3px] size-[22px] rounded-[7px] after:absolute after:-inset-2.5 after:content-['']"
      />

      <div className="min-w-0">
        <p className={cn('text-[14px] leading-snug font-[700]', done && 'text-muted line-through')}>{task.name}</p>
        {task.description ? <p className="mt-0.5 text-[12px] text-muted">{task.description}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" size="sm" />
            <span className={cn(task.isLate && 'font-semibold text-coral')}>{task.dueLabel}</span>
          </span>
          {task.assigneesUnknown ? (
            <PendingAssignee size="sm" />
          ) : (
            task.assignees.map((assignee) => (
              <span key={assignee.memberId} className="inline-flex items-center gap-1">
                <MemberAvatar member={assignee.member} size="sm" />
                {memberFirstName(assignee.member.display_name)}
              </span>
            ))
          )}
          {task.reminderLabel ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="bell" size="sm" />
              {task.reminderLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <PriorityTag priority={task.priority} />
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`Modifier ${task.name}`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted opacity-0 transition-[color,background,border-color,opacity] duration-[var(--duration-quick)] group-hover:opacity-100 hover:border-accent hover:bg-accent-faint hover:text-fg focus-visible:opacity-100 max-[650px]:opacity-100"
          >
            <Icon name="edit" size="sm" />
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`Supprimer ${task.name}`}
            className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface text-muted opacity-0 transition-[color,background,border-color,opacity] duration-[var(--duration-quick)] group-hover:opacity-100 hover:border-coral hover:bg-coral-soft hover:text-coral focus-visible:opacity-100 max-[650px]:opacity-100"
          >
            <Icon name="trash" size="sm" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
