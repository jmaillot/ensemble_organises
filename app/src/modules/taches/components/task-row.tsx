import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { Checkbox } from '@/components/ui/primitives';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { PriorityTag } from '@/components/shared/module-shell';
import { memberFirstName, type Task } from '../types';

export interface TaskRowProps {
  task: Task;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * Ligne de tâche : poignée de réordonnancement, case à cocher, échéance,
 * assignataires, rappel, priorité et actions. Le glisser-déposer s'appuie sur
 * dnd-kit, la poignée restant un vrai bouton utilisable au clavier.
 */
export function TaskRow({ task, onToggle, onEdit, onDelete }: TaskRowProps) {
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
        'grid grid-cols-[20px_18px_minmax(0,1fr)_auto] items-center gap-[11px] border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 max-[650px]:grid-cols-[20px_minmax(0,1fr)_auto]',
        task.isLate && '-mx-3 rounded-[10px] border-transparent bg-coral-soft px-3',
        isDragging && 'opacity-50',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Réordonner : ${task.name}`}
        className="relative grid size-[20px] cursor-grab place-items-center text-muted transition-colors duration-[var(--duration-quick)] hover:text-fg active:cursor-grabbing max-[650px]:hidden after:absolute after:-inset-3 after:content-['']"
      >
        <Icon name="drag" size="sm" />
      </button>

      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(task)}
        aria-label={`${done ? 'Rouvrir' : 'Terminer'} ${task.name}`}
        // La case mesure 19px comme dans l'export : la zone cliquable est
        // agrandie à 43px sans modifier la mise en page.
        className="relative after:absolute after:-inset-3 after:content-['']"
      />

      <div className="min-w-0">
        <p className={cn('text-[13px] font-[760]', done && 'text-muted line-through')}>{task.name}</p>
        {task.description ? <p className="mt-[3px] text-[11px] text-muted">{task.description}</p> : null}
        <div className="mt-[3px] flex flex-wrap items-center gap-[7px] text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size="sm" />
            <span className={cn(task.isLate && 'font-semibold text-coral')}>{task.dueLabel}</span>
          </span>
          {task.assignees.map((assignee) => (
            <span key={assignee.memberId} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">·</span>
              <MemberAvatar member={assignee.member} size="sm" />
              {memberFirstName(assignee.member.display_name)}
            </span>
          ))}
          {task.reminderLabel ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">·</span>
              <Icon name="bell" size="sm" />
              {task.reminderLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-[5px]">
        <PriorityTag priority={task.priority} />
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label={`Modifier ${task.name}`}
          className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg max-[650px]:hidden"
        >
          <Icon name="edit" size="sm" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label={`Supprimer ${task.name}`}
          className="grid size-11 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
        >
          <Icon name="trash" size="sm" />
        </button>
      </div>
    </div>
  );
}
