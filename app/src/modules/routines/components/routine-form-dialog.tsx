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
import {
  describeRecurrence,
  frequencyPresets,
  lowercaseFirst,
  ruleForPreset,
  validateRRule,
  type Routine,
  type RoutineFormValues,
} from '../types';

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const routineSchema = z
  .object({
    name: z.string().trim().min(2, 'Indiquez le nom du rituel.').max(80, '80 caractères maximum.'),
    frequency: z.enum(['quotidien', 'hebdomadaire', 'mensuel', 'annuel', 'personnalise']),
    customRule: z.string().trim(),
    description: z.string().trim().max(400, '400 caractères maximum.'),
    assigneeIds: z.array(z.string()),
    reminderAt: z
      .string()
      .trim()
      .refine((value) => value === '' || DATE_TIME_PATTERN.test(value), 'Indiquez une date de rappel valide.'),
  })
  .superRefine((values, ctx) => {
    if (values.frequency !== 'personnalise') return;
    const error = validateRRule(values.customRule);
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['customRule'] });
  });

const toReminderValue = (remindAt: string | null) => (remindAt ? remindAt.slice(0, 16) : '');

function defaultValues(routine: Routine | null, currentMemberId: string): RoutineFormValues {
  if (!routine) {
    return {
      name: '',
      frequency: 'quotidien',
      customRule: '',
      description: '',
      assigneeIds: currentMemberId ? [currentMemberId] : [],
      reminderAt: '',
    };
  }
  return {
    name: routine.name,
    frequency: routine.preset,
    customRule: routine.recurrenceRule,
    description: routine.description ?? '',
    assigneeIds: routine.assignees.map((assignee) => assignee.memberId),
    reminderAt: toReminderValue(routine.reminderAt),
  };
}

export interface RoutineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routine: Routine | null;
  /** Membre coché par défaut à la création. */
  currentMemberId: string;
  isSaving?: boolean;
  onSubmit: (values: RoutineFormValues) => Promise<void> | void;
}

/**
 * Création et modification d'une routine. Le sélecteur de fréquence compose une
 * vraie RRULE, dont l'aperçu en français est affiché sous le formulaire.
 */
export function RoutineFormDialog({
  open,
  onOpenChange,
  routine,
  currentMemberId,
  isSaving = false,
  onSubmit,
}: RoutineFormDialogProps) {
  const members = useMembers();
  const { register, handleSubmit, reset, control, watch, formState } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineSchema),
    mode: 'onSubmit',
  });
  const errors = formState.errors;
  const frequency = watch('frequency');
  const customRule = watch('customRule');
  const preview = ruleForPreset(frequency, customRule);
  const previewLabel = describeRecurrence(preview);

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(routine, currentMemberId));
    // `routine` identifie une ouverture : le formulaire n'est pas réinitialisé à
    // chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routine?.id, currentMemberId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="eyebrow mb-2">Routines</p>
          <DialogTitle>{routine ? 'Modifier la routine' : 'Créer une routine'}</DialogTitle>
          <DialogDescription>
            Un rituel récurrent, un responsable, une série qui se construit.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Nom de la routine" error={errors.name?.message}>
            {(props) => (
              <Input {...props} {...register('name')} placeholder="Ex. Sortie canine" autoComplete="off" />
            )}
          </Field>

          <Field label="Récurrence" error={errors.frequency?.message}>
            {(props) => (
              <Select {...props} {...register('frequency')}>
                {frequencyPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {frequency === 'personnalise' ? (
            <Field
              label="Règle RRULE"
              hint="Format iCalendar : FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"
              error={errors.customRule?.message}
            >
              {(props) => (
                <Input
                  {...props}
                  {...register('customRule')}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                  autoComplete="off"
                  className="font-mono text-[12px]"
                />
              )}
            </Field>
          ) : null}

          <p className="m-0 rounded-[11px] bg-accent-faint px-3 py-2 text-[11px] text-muted">
            Aperçu : <strong className="text-accent-strong">{lowercaseFirst(previewLabel)}</strong>
            {preview ? <code className="ml-1 font-mono text-[10px]">{preview}</code> : null}
          </p>

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
                <p className="m-0 text-[10px] text-muted">Plusieurs personnes peuvent partager un même rituel.</p>
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
                placeholder="Promenade du soir, avant la nuit."
              />
            )}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {routine ? 'Enregistrer les modifications' : 'Créer la routine'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
