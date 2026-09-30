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
  defaultRecurrenceSelection,
  describeRecurrence,
  frequencyPresets,
  lowercaseFirst,
  monthOptions,
  nthRankOptions,
  ruleForSelection,
  selectionForRule,
  validateRRule,
  weekdayOptions,
  type Routine,
  type RoutineFormValues,
} from '../types';

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const WEEKDAY_SET = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

const routineSchema = z
  .object({
    name: z.string().trim().min(2, 'Indiquez le nom du rituel.').max(80, '80 caractères maximum.'),
    frequency: z.enum(['quotidien', 'hebdomadaire', 'mensuel', 'annuel', 'personnalise']),
    customRule: z.string().trim(),
    weeklyDays: z.array(z.string()),
    monthlyMode: z.enum(['day', 'nth']),
    monthlyDay: z.number().int().min(1).max(31),
    nthRank: z.number().int(),
    nthWeekday: z.string(),
    yearlyMode: z.enum(['day', 'nth']),
    yearlyMonth: z.number().int().min(1).max(12),
    yearlyDay: z.number().int().min(1).max(31),
    yearlyNthRank: z.number().int(),
    yearlyNthWeekday: z.string(),
    description: z.string().trim().max(400, '400 caractères maximum.'),
    assigneeIds: z.array(z.string()),
    reminders: z.array(
      z
        .string()
        .trim()
        .refine((value) => value === '' || DATE_TIME_PATTERN.test(value), 'Indiquez une date de rappel valide.'),
    ),
    autoMinus1: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.frequency === 'hebdomadaire') {
      const valid = values.weeklyDays.filter((day) => WEEKDAY_SET.has(day.toUpperCase()));
      if (valid.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Cochez au moins un jour.', path: ['weeklyDays'] });
      }
    }
    if (values.frequency === 'mensuel' && values.monthlyMode === 'nth') {
      if (!WEEKDAY_SET.has(values.nthWeekday.toUpperCase())) {
        ctx.addIssue({ code: 'custom', message: 'Choisissez un jour.', path: ['nthWeekday'] });
      }
    }
    if (values.frequency === 'annuel' && values.yearlyMode === 'nth') {
      if (!WEEKDAY_SET.has(values.yearlyNthWeekday.toUpperCase())) {
        ctx.addIssue({ code: 'custom', message: 'Choisissez un jour.', path: ['yearlyNthWeekday'] });
      }
    }
    if (values.frequency !== 'personnalise') return;
    const error = validateRRule(values.customRule);
    if (error) ctx.addIssue({ code: 'custom', message: error, path: ['customRule'] });
  });

const toReminderValue = (remindAt: string | null) => (remindAt ? remindAt.slice(0, 16) : '');

function defaultValues(routine: Routine | null, currentMemberId: string): RoutineFormValues {
  const base = defaultRecurrenceSelection();
  if (!routine) {
    return {
      name: '',
      frequency: 'quotidien',
      customRule: '',
      weeklyDays: base.weeklyDays,
      monthlyMode: base.monthlyMode,
      monthlyDay: base.monthlyDay,
      nthRank: base.nthRank,
      nthWeekday: base.nthWeekday as RoutineFormValues['nthWeekday'],
      yearlyMode: base.yearlyMode,
      yearlyMonth: base.yearlyMonth,
      yearlyDay: base.yearlyDay,
      yearlyNthRank: base.yearlyNthRank,
      yearlyNthWeekday: base.yearlyNthWeekday as RoutineFormValues['yearlyNthWeekday'],
      description: '',
      assigneeIds: currentMemberId ? [currentMemberId] : [],
      reminders: [''],
      autoMinus1: true,
    };
  }
  const { preset, selection } = selectionForRule(routine.recurrenceRule);
  const reminders = routine.reminders.length > 0 ? routine.reminders.map(toReminderValue) : [''];
  return {
    name: routine.name,
    frequency: preset,
    customRule: preset === 'personnalise' ? routine.recurrenceRule : '',
    weeklyDays: selection.weeklyDays as RoutineFormValues['weeklyDays'],
    monthlyMode: selection.monthlyMode,
    monthlyDay: selection.monthlyDay,
    nthRank: selection.nthRank,
    nthWeekday: selection.nthWeekday as RoutineFormValues['nthWeekday'],
    yearlyMode: selection.yearlyMode,
    yearlyMonth: selection.yearlyMonth,
    yearlyDay: selection.yearlyDay,
    yearlyNthRank: selection.yearlyNthRank,
    yearlyNthWeekday: selection.yearlyNthWeekday as RoutineFormValues['yearlyNthWeekday'],
    description: routine.description ?? '',
    assigneeIds: routine.assignees.map((assignee) => assignee.memberId),
    reminders,
    autoMinus1: false,
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
  const { register, handleSubmit, reset, control, watch, setValue, formState } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineSchema),
    mode: 'onSubmit',
    defaultValues: {
      name: '',
      frequency: 'quotidien',
      customRule: '',
      weeklyDays: ['MO'],
      monthlyMode: 'nth',
      monthlyDay: 15,
      nthRank: 1,
      nthWeekday: 'MO',
      yearlyMode: 'nth',
      yearlyMonth: 1,
      yearlyDay: 15,
      yearlyNthRank: 1,
      yearlyNthWeekday: 'MO',
      description: '',
      assigneeIds: [],
      reminders: [''],
      autoMinus1: true,
    },
  });
  const errors = formState.errors;
  const frequency = watch('frequency');
  const customRule = watch('customRule');
  const weeklyDays = watch('weeklyDays') ?? [];
  const monthlyMode = watch('monthlyMode');
  const monthlyDay = watch('monthlyDay');
  const nthRank = watch('nthRank');
  const nthWeekday = watch('nthWeekday');
  const yearlyMode = watch('yearlyMode');
  const yearlyMonth = watch('yearlyMonth');
  const yearlyDay = watch('yearlyDay');
  const yearlyNthRank = watch('yearlyNthRank');
  const yearlyNthWeekday = watch('yearlyNthWeekday');
  const remindersWatch = watch('reminders') ?? [];
  const autoMinus1 = watch('autoMinus1');

  const reminderCount = Math.max(remindersWatch.length, 1);
  const appendReminder = () => setValue('reminders', [...remindersWatch, ''], { shouldDirty: true });
  const removeReminder = (index: number) =>
    setValue(
      'reminders',
      remindersWatch.filter((_, i) => i !== index),
      { shouldDirty: true },
    );

  const preview = ruleForSelection(
    frequency ?? 'quotidien',
    {
      weeklyDays: weeklyDays ?? [],
      monthlyMode: monthlyMode ?? 'nth',
      monthlyDay: Number(monthlyDay) || 1,
      nthRank: Number(nthRank) || 1,
      nthWeekday: nthWeekday ?? 'MO',
      yearlyMode: yearlyMode ?? 'nth',
      yearlyMonth: Number(yearlyMonth) || 1,
      yearlyDay: Number(yearlyDay) || 1,
      yearlyNthRank: Number(yearlyNthRank) || 1,
      yearlyNthWeekday: yearlyNthWeekday ?? 'MO',
    },
    customRule ?? '',
  );
  const previewLabel = describeRecurrence(preview);
  const filledReminders = remindersWatch.filter((value) => (value ?? '').trim() !== '').length;

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

          {frequency === 'hebdomadaire' ? (
            <Controller
              name="weeklyDays"
              control={control}
              render={({ field }) => (
                <fieldset className="grid gap-1.5">
                  <legend className="text-[11px] font-extrabold text-muted">Jours de la semaine</legend>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((day) => {
                      const checked = (field.value ?? []).includes(day.value);
                      return (
                        <label
                          key={day.value}
                          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] capitalize transition-colors duration-[var(--duration-quick)] hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-faint"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const current = field.value ?? [];
                              field.onChange(
                                value ? [...current, day.value] : current.filter((token) => token !== day.value),
                              );
                            }}
                            aria-label={`Répéter le ${day.label}`}
                          />
                          {day.label}
                        </label>
                      );
                    })}
                  </div>
                  {errors.weeklyDays?.message ? (
                    <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
                      {errors.weeklyDays.message as string}
                    </p>
                  ) : null}
                </fieldset>
              )}
            />
          ) : null}

          {frequency === 'mensuel' ? (
            <div className="grid gap-2.5 rounded-[11px] border border-border bg-bg p-3">
              <Controller
                name="monthlyMode"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode mensuel">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                      <input type="radio" value="nth" checked={field.value === 'nth'} onChange={() => field.onChange('nth')} />
                      Le 1er, 2eme…
                    </label>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                      <input type="radio" value="day" checked={field.value === 'day'} onChange={() => field.onChange('day')} />
                      Jour du mois
                    </label>
                  </div>
                )}
              />
              {monthlyMode === 'nth' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rang">
                    {(props) => (
                      <Select {...props} {...register('nthRank', { valueAsNumber: true })}>
                        {nthRankOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Jour">
                    {(props) => (
                      <Select {...props} {...register('nthWeekday')}>
                        {weekdayOptions.map((day) => (
                          <option key={day.value} value={day.value} className="capitalize">
                            {day.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
              ) : (
                <Field label="Quantième" hint="Ex. le 15 de chaque mois.">
                  {(props) => (
                    <Input {...props} type="number" min={1} max={31} {...register('monthlyDay', { valueAsNumber: true })} />
                  )}
                </Field>
              )}
            </div>
          ) : null}

          {frequency === 'annuel' ? (
            <div className="grid gap-2.5 rounded-[11px] border border-border bg-bg p-3">
              <Field label="Mois">
                {(props) => (
                  <Select {...props} {...register('yearlyMonth', { valueAsNumber: true })}>
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value} className="capitalize">
                        {month.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Controller
                name="yearlyMode"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode annuel">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                      <input type="radio" value="nth" checked={field.value === 'nth'} onChange={() => field.onChange('nth')} />
                      Le 1er, 2eme…
                    </label>
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                      <input type="radio" value="day" checked={field.value === 'day'} onChange={() => field.onChange('day')} />
                      Jour de l'année
                    </label>
                  </div>
                )}
              />
              {yearlyMode === 'nth' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Rang">
                    {(props) => (
                      <Select {...props} {...register('yearlyNthRank', { valueAsNumber: true })}>
                        {nthRankOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Jour">
                    {(props) => (
                      <Select {...props} {...register('yearlyNthWeekday')}>
                        {weekdayOptions.map((day) => (
                          <option key={day.value} value={day.value} className="capitalize">
                            {day.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
              ) : (
                <Field label="Quantième">
                  {(props) => (
                    <Input {...props} type="number" min={1} max={31} {...register('yearlyDay', { valueAsNumber: true })} />
                  )}
                </Field>
              )}
            </div>
          ) : null}

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

          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-extrabold text-muted">
              Rappels <span className="ml-1 font-normal">· optionnel</span>
            </legend>
            <div className="grid gap-2">
              {Array.from({ length: reminderCount }).map((_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      type="datetime-local"
                      aria-label={`Rappel ${index + 1}`}
                      {...register(`reminders.${index}` as const)}
                    />
                    {errors.reminders?.[index]?.message ? (
                      <p role="alert" className="m-0 mt-1 text-[11px] font-semibold text-coral">
                        {errors.reminders[index]?.message}
                      </p>
                    ) : null}
                  </div>
                  {reminderCount > 1 ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => removeReminder(index)}
                      aria-label={`Retirer le rappel ${index + 1}`}
                    >
                      Retirer
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" icon="plus" onClick={appendReminder}>
                Ajouter un rappel
              </Button>
              {filledReminders > 0 ? (
                <span className="text-[11px] text-muted">
                  {filledReminders} rappel{filledReminders > 1 ? 's' : ''} saisi{filledReminders > 1 ? 's' : ''}
                  {autoMinus1 ? ' + doublon 1 jour avant' : ''}
                </span>
              ) : (
                <span className="text-[11px] text-muted">Laissez vide pour ne pas être averti.</span>
              )}
            </div>
            <Controller
              name="autoMinus1"
              control={control}
              render={({ field }) => (
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[11px] border border-border bg-surface px-3 text-[12px] has-[:checked]:border-accent has-[:checked]:bg-accent-faint">
                  <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} aria-label="Ajouter automatiquement un rappel 1 jour avant" />
                  Ajouter automatiquement un rappel 1 jour avant
                </label>
              )}
            />
          </fieldset>

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
