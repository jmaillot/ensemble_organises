import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/shared/icon';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { taskStatusLabels, type Task, type TaskStatus } from '../types';

/** Ordre des colonnes : le parcours d'une tâche, pas l'alphabet des statuts. */
const COLUMNS: TaskStatus[] = ['a_faire', 'en_cours', 'fait'];

export interface TaskBoardProps {
  tasks: Task[];
  canWrite: boolean;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

/**
 * Tableau à trois colonnes (Lot 2) : le statut devient une position.
 *
 * Le glisser-déposer passe par une **poignée** et non par la carte entière :
 * une carte entière en `touch-action: none` empêcherait de faire défiler le
 * tableau au doigt. Le `<select>` de statut reste la voie clavier, tactile et
 * lecteur d'écran — le geste est un raccourci, jamais le seul moyen.
 *
 * Le tri par échéance et le réordonnancement ne s'appliquent pas ici : une
 * colonne se lit comme un état, pas comme une file d'attente. La vue Liste les
 * conserve.
 */
export function TaskBoard({ tasks, canWrite, onEdit, onMove }: TaskBoardProps) {
  const [dragged, setDragged] = useState<Task | null>(null);
  const sensors = useSensors(
    // Un clic sur la poignée ne doit pas saisir la carte : 6 px de geste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const target = event.over?.id;
    if (typeof target !== 'string' || !COLUMNS.includes(target as TaskStatus)) return;
    const task = tasks.find((entry) => entry.id === String(event.active.id));
    if (!task || task.status === target) return;
    onMove(task, target as TaskStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setDragged(tasks.find((task) => task.id === String(event.active.id)) ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <div className="grid grid-cols-3 items-start gap-2.5 max-[650px]:grid-cols-1">
        {COLUMNS.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            canWrite={canWrite}
            onEdit={onEdit}
            onMove={onMove}
          />
        ))}
      </div>
      <DragOverlay>
        {dragged ? (
          <p className="rounded-[12px] border border-accent/30 bg-surface px-2.5 py-2 text-[12.5px] font-[700] shadow-[var(--shadow-md)]">
            {dragged.name}
          </p>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  canWrite: boolean;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

function BoardColumn({ status, tasks, canWrite, onEdit, onMove }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = taskStatusLabels[status];

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'min-w-0 rounded-[16px] border border-border bg-bg/60 p-2 transition-colors duration-[var(--duration-quick)]',
        isOver && 'border-accent bg-accent-faint',
      )}
    >
      <h4 className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] font-extrabold tracking-[0.04em] text-muted uppercase">
        {label}
        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10.5px] text-fg tabular-nums">{tasks.length}</span>
      </h4>
      {tasks.length === 0 ? (
        <p className="m-0 px-1 py-3 text-[11.5px] text-muted">Rien ici.</p>
      ) : (
        <div className="grid gap-1.5">
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} canWrite={canWrite} onEdit={onEdit} onMove={onMove} />
          ))}
        </div>
      )}
    </section>
  );
}

interface BoardCardProps {
  task: Task;
  canWrite: boolean;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

function BoardCard({ task, canWrite, onEdit, onMove }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: task.id });
  const done = task.status === 'fait';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-[12px] border border-border bg-surface p-2',
        task.isLate && !done && 'border-coral/40 bg-coral-soft/60',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-1">
        {canWrite ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Déplacer : ${task.name}`}
            className="mt-0.5 grid size-6 shrink-0 cursor-grab place-items-center rounded-[7px] text-muted transition-colors duration-[var(--duration-quick)] hover:text-fg active:cursor-grabbing"
            // Le geste seul ne doit pas confisquer le défilement de la page.
            style={{ touchAction: 'none' }}
          >
            <Icon name="drag" size="sm" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className={cn(
            'min-w-0 flex-1 rounded-[6px] text-left text-[12.5px] leading-snug font-[700] hover:underline',
            done && 'text-muted line-through',
          )}
        >
          {task.name}
        </button>
      </div>

      <p className={cn('mt-1 mb-1.5 text-[10.5px] text-muted', task.isLate && !done && 'font-semibold text-coral')}>
        {task.dueLabel}
      </p>

      <div className="flex items-center justify-between gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{`Statut de « ${task.name} »`}</span>
          <select
            value={task.status}
            disabled={!canWrite}
            onChange={(event) => onMove(task, event.target.value as TaskStatus)}
            className="w-full rounded-[7px] border border-border bg-bg px-1 py-0.5 text-[10.5px] font-bold text-muted disabled:opacity-60"
          >
            {COLUMNS.map((option) => (
              <option key={option} value={option}>
                {taskStatusLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex shrink-0 items-center -space-x-1">
          {task.assignees.slice(0, 2).map((assignee) => (
            <MemberAvatar key={assignee.memberId} member={assignee.member} size="sm" />
          ))}
        </div>
      </div>
    </div>
  );
}
