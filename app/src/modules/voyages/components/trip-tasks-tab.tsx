/**
 * Onglet Tâches d'un voyage (phase 15, 15-03) : fourche à filtre `tripId`,
 * jamais un drop-in de la page foyer (D-09).
 *
 * - Lecture : `trip_id = voyage courant` (ni foyer, ni sibling).
 * - Création : `trip_id` posé, `folder_id` à NULL (dossiers au foyer).
 * - Assignataires : participants du voyage seuls (T-15-12) ; le garde de
 *   portée serveur 15-01 tranche en dernier ressort.
 * - Voyage figé ou modération : `readOnly`, aucune écriture proposée.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { data } from '@/lib/data';
import type { HouseholdMemberRow, TaskRow } from '@/types';
import {
  assertTripAssignees,
  createTripTask,
  fetchTripTasks,
  listTripTaskAssignees,
} from '../api';

export const tripTasksKeys = {
  all: ['voyages', 'trip-tasks'] as const,
  list: (tripId: string) => ['voyages', 'trip-tasks', tripId] as const,
};

export interface TripTasksTabProps {
  tripId: string;
  householdId: string;
  /** Participants du voyage : seuls proposés aux assignations (T-15-12). */
  members: HouseholdMemberRow[];
  currentMemberId: string | null;
  /** Voyage figé ou modération : lecture seule, sans écriture. */
  readOnly?: boolean;
}

export function TripTasksTab({ tripId, householdId, members, currentMemberId, readOnly = false }: TripTasksTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskRow | null>(null);

  const tripMemberIds = useMemo(() => members.map((member) => member.id), [members]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const tasksQuery = useQuery({
    queryKey: tripTasksKeys.list(tripId),
    queryFn: () => fetchTripTasks(tripId),
  });
  const tasks = useMemo(
    () => [...(tasksQuery.data ?? [])].sort((a, b) => a.priority_order - b.priority_order),
    [tasksQuery.data],
  );
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const assigneesQuery = useQuery({
    queryKey: [...tripTasksKeys.list(tripId), 'assignees', taskIds],
    enabled: taskIds.length > 0,
    queryFn: () => listTripTaskAssignees(taskIds),
  });
  const assigneesByTask = useMemo(() => {
    const grouped = new Map<string, HouseholdMemberRow[]>();
    for (const entry of assigneesQuery.data ?? []) {
      const member = memberById.get(entry.member_id);
      if (!member) continue;
      const list = grouped.get(entry.task_id) ?? [];
      list.push(member);
      grouped.set(entry.task_id, list);
    }
    return grouped;
  }, [assigneesQuery.data, memberById]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: tripTasksKeys.list(tripId) });
  };

  const toggleAssignee = (memberId: string) => {
    setAssigneeIds((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );
  };

  const submit = async () => {
    if (saving) return;
    try {
      assertTripAssignees(assigneeIds, tripMemberIds);
    } catch (validationError) {
      toast(validationError instanceof Error ? validationError.message : 'Assignation impossible.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 200) throw new Error('Nommez la tâche (1 à 200 caractères).');
        await data.update('tasks', editing.id, { name: trimmed, due_date: dueDate || null });
        await data.removeWhere('task_assignees', { task_id: editing.id }).catch(() => undefined);
        if (assigneeIds.length > 0) {
          await Promise.all(
            assigneeIds.map((memberId) =>
              data.create('task_assignees', { task_id: editing.id, member_id: memberId }),
            ),
          );
        }
        setEditing(null);
        setName('');
        setDueDate('');
        setAssigneeIds([]);
        refresh();
        toast('Tâche du voyage mise à jour.');
        return;
      }
      await createTripTask({
        tripId,
        householdId,
        name,
        dueDate: dueDate || null,
        assigneeIds,
        tripMemberIds,
        createdBy: currentMemberId,
      });
      setName('');
      setDueDate('');
      setAssigneeIds([]);
      refresh();
      toast('Tâche ajoutée au voyage.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'La tâche n’a pas pu être ajoutée.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (task: TaskRow) => {
    setEditing(task);
    setName(task.name);
    setDueDate(task.due_date ?? '');
    setAssigneeIds((assigneesByTask.get(task.id) ?? []).map((member) => member.id));
  };

  const cancelEdit = () => {
    setEditing(null);
    setName('');
    setDueDate('');
    setAssigneeIds([]);
  };

  const toggleStatus = (task: TaskRow) => {
    void data
      .update('tasks', task.id, { status: task.status === 'fait' ? 'a_faire' : 'fait' })
      .then(refresh)
      .catch((toggleError: unknown) =>
        toast(toggleError instanceof Error ? toggleError.message : 'Le statut n’a pas pu être mis à jour.', 'error'),
      );
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    void (async () => {
      // L'adaptateur local n'a pas de cascade : on nettoie les enfants.
      await data.removeWhere('task_assignees', { task_id: target.id }).catch(() => undefined);
      await data.removeWhere('task_reminders', { task_id: target.id }).catch(() => undefined);
      await data.remove('tasks', target.id);
      if (editing?.id === target.id) cancelEdit();
      refresh();
      toast('Tâche du voyage supprimée.');
    })().catch((removalError: unknown) =>
      toast(removalError instanceof Error ? removalError.message : 'La tâche n’a pas pu être supprimée.', 'error'),
    );
  };

  if (tasksQuery.isError) {
    return (
      <Panel id="trip-tasks" title="Tâches" description="Les tâches propres à ce voyage.">
        <ErrorState
          message={tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Les tâches du voyage n’ont pas pu être chargées.'}
          onRetry={() => void tasksQuery.refetch()}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-3.5">
      {!readOnly ? (
        <Panel id="trip-tasks-new" title={editing ? 'Modifier la tâche' : 'Ajouter une tâche'} description="Assignée aux participants du voyage uniquement.">
          <div className="grid gap-3.5">
            <Field label="Nom de la tâche">
              {(props) => (
                <Input {...props} value={name} onChange={(change) => setName(change.target.value)} maxLength={200} placeholder="Réserver les billets" />
              )}
            </Field>
            <Field label="Échéance" optional>
              {(props) => (
                <Input {...props} type="date" value={dueDate} onChange={(change) => setDueDate(change.target.value)} />
              )}
            </Field>
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-1.5 text-[12px] font-semibold text-muted">Assignée à (participants du voyage)</legend>
              {members.length === 0 ? (
                <p className="m-0 text-[12px] text-muted" role="status">Aucun participant pour le moment.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((member) => {
                    const checked = assigneeIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={
                          checked
                            ? 'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[9px] border border-accent bg-accent-faint px-2.5 text-[12px] font-semibold text-accent-strong'
                            : 'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(member.id)}
                          className="accent-accent"
                          aria-label={`Assigner ${member.display_name}`}
                        />
                        <MemberAvatar member={member} size="sm" />
                        {member.display_name}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button icon={editing ? 'check' : 'plus'} disabled={saving || name.trim() === ''} onClick={() => void submit()}>
                {saving ? (editing ? 'Mise à jour…' : 'Ajout…') : editing ? 'Mettre à jour' : 'Ajouter au voyage'}
              </Button>
              {editing ? (
                <Button variant="secondary" onClick={cancelEdit}>
                  Annuler
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel id="trip-tasks" title="Tâches du voyage" description="Celles de ce voyage seul — jamais celles du foyer.">
        {tasksQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Aucune tâche pour ce voyage"
            description="Ajoutez la première tâche du voyage : elle n’apparaîtra pas dans la liste du foyer."
          />
        ) : (
          <div role="list" aria-label="Tâches du voyage" className="grid gap-2.5">
            {tasks.map((task) => (
              <div
                key={task.id}
                role="listitem"
                className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3.5 py-3"
              >
                {!readOnly ? (
                  <input
                    type="checkbox"
                    checked={task.status === 'fait'}
                    onChange={() => toggleStatus(task)}
                    aria-label={`Marquer « ${task.name} » comme ${task.status === 'fait' ? 'à faire' : 'faite'}`}
                    className="size-6 shrink-0 accent-accent"
                  />
                ) : null}
                <div className="min-w-[150px] flex-1">
                  <p className="m-0 text-[13px] font-[760]">{task.name}</p>
                  <small className="text-[11px] text-muted">
                    {task.due_date ? `Échéance ${task.due_date} · ` : ''}
                    {(assigneesByTask.get(task.id) ?? []).map((member) => member.display_name).join(', ') || 'Personne assigné'}
                  </small>
                </div>
                <div className="flex items-center gap-1">
                  {(assigneesByTask.get(task.id) ?? []).map((member) => (
                    <MemberAvatar key={member.id} member={member} size="sm" />
                  ))}
                  {!readOnly ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(task)}
                        aria-label={`Modifier ${task.name}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-accent-faint hover:text-fg"
                      >
                        <Icon name="edit" size="sm" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(task)}
                        aria-label={`Supprimer ${task.name}`}
                        className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.name ?? ''} » ?`}
        description="La tâche sera retirée du voyage, avec ses assignations."
        confirmLabel="Supprimer la tâche"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
