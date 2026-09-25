import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/primitives';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useMembers } from '@/stores/household-store';
import { todayIso } from '@/lib/utils';
import { taskPriorityLabels, type Task, type TaskFormValues } from '../types';

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const taskSchema = z.object({
  name: z.string().trim().min(2, 'Indiquez ce qu’il reste à faire.').max(80, '80 caractères maximum.'),
  dueDate: z.string().min(1, 'Choisissez une échéance.'),
  description: z.string().trim().max(400, '400 caractères maximum.'),
  priority: z.enum(['haute', 'normale', 'basse']),
  assigneeIds: z.array(z.string()),
  reminderAt: z
    .string()
    .trim()
    .refine((value) => value === '' || DATE_TIME_PATTERN.test(value), 'Indiquez une date de rappel valide.'),
});

const toReminderValue = (remindAt: string | null) => (remindAt ? remindAt.slice(0, 16) : '');

function defaultValues(task: Task | null, currentMemberId: string): TaskFormValues {
  if (!task) {
    return {
      name: '',
      dueDate: todayIso(),
      description: '',
      priority: 'normale',
      assigneeIds: currentMemberId ? [currentMemberId] : [],
      reminderAt: '',
    };
  }
  return {
    name: task.name,
    dueDate: task.dueDate ?? todayIso(),
    description: task.description ?? '',
    priority: task.priority,
    assigneeIds: task.assignees.map((assignee) => assignee.memberId),
    reminderAt: toReminderValue(task.reminderAt),
  };
}

export interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  /** Membre coché par défaut à la création. */
  currentMemberId: string;
  isSaving?: boolean;
  onSubmit: (values: TaskFormValues) => Promise<void> | void;
}

/** Création et modification d'une tâche, assignataires et rappel compris. */
export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  currentMemberId,
  isSaving = false,
  onSubmit,
}: TaskFormDialogProps) {
  const members = useMembers();
  const { register, handleSubmit, reset, control, formState } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    mode: 'onSubmit',
  });
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(task, currentMemberId));
    // `task` identifie une ouverture : le formulaire n'est pas réinitialisé à
    // chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, currentMemberId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="eyebrow mb-2">À faire</p>
          <DialogTitle>{task ? 'Modifier la tâche' : 'Ajouter une tâche'}</DialogTitle>
          <DialogDescription>
            Une échéance claire, un responsable, et c’est tout. Glissez ensuite les lignes pour réordonner la
            priorité.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Nom de la tâche" error={errors.name?.message}>
            {(props) => (
              <Input
                {...props}
                {...register('name')}
                placeholder="Ex. Choisir le menu du week-end"
                autoComplete="off"
              />
            )}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Échéance" error={errors.dueDate?.message}>
              {(props) => <Input {...props} type="date" {...register('dueDate')} />}
            </Field>
            <Field label="Priorité" error={errors.priority?.message}>
              {(props) => (
                <Select {...props} {...register('priority')}>
                  {(Object.keys(taskPriorityLabels) as Array<keyof typeof taskPriorityLabels>).map((priority) => (
                    <option key={priority} value={priority}>
                      {taskPriorityLabels[priority]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Controller
            name="assigneeIds"
            control={control}
            render={({ field }) => (
              <fieldset className="grid gap-1.5">
                <legend className="text-[11px] font-extrabold text-muted">Assigner à</legend>
                <div className="flex flex-wrap gap-2">
                  {members.map((member) => {
                    const checked = field.value.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            field.onChange(value ? [...field.value, member.id] : field.value.filter((id) => id !== member.id))
                          }
                          aria-label={`Assigner à ${member.display_name}`}
                        />
                        <MemberAvatar member={member} size="sm" />
                        {member.display_name}
                      </label>
                    );
                  })}
                </div>
                <p className="m-0 text-[10px] text-muted">Plusieurs personnes peuvent partager une même tâche.</p>
              </fieldset>
            )}
          />

          <Field label="Rappel" optional hint="Laissez vide pour ne pas être averti." error={errors.reminderAt?.message}>
            {(props) => <Input {...props} type="datetime-local" {...register('reminderAt')} />}
          </Field>

          <Field label="Description" optional error={errors.description?.message}>
            {(props) => (
              <Textarea
                {...props}
                {...register('description')}
                rows={3}
                placeholder="Appeler le cabinet puis mettre à jour le carnet."
              />
            )}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {task ? 'Enregistrer les modifications' : 'Ajouter la tâche'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
