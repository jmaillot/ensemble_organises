import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/primitives';
import { eligibleMembersForModule } from '@/lib/member-eligibility';
import { useMembers } from '@/stores/household-store';
import { formatDayLabel, mealFormSchema, mealSlotLabels, mealSlots, type MealEntry, type MealFormValues, type MealSlot } from '../types';

export interface MealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création, sinon édition du repas. */
  entry: MealEntry | null;
  defaultDate: string;
  defaultSlot: MealSlot;
  /** Les sept jours de la semaine affichée : le repas reste dans sa semaine. */
  weekDates: string[];
  recipes: { id: string; title: string; servings: number }[];
  onSave: (values: MealFormValues, context: { date: string; slot: MealSlot }) => Promise<void>;
}

/**
 * Formulaire d'un repas du menu : recette du foyer ou texte libre, portions,
 * jour et moment, et « qui mange ». Le schéma Zod porte l'exclusivité
 * recette/texte ; la base la refuse de toute façon (0142).
 */
export function MealDialog({ open, onOpenChange, entry, defaultDate, defaultSlot, weekDates, recipes, onSave }: MealDialogProps) {
  const members = useMembers();
  // Garde D-06 (25-07) : « Qui mange » ne propose que les enfants dont la
  // fiche sert le menu — absent, pas désactivé ; le serveur revalide (0146).
  const eligibleMembers = eligibleMembersForModule(members, 'menu');
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MealFormValues>({
    resolver: zodResolver(mealFormSchema),
    defaultValues: { kind: 'recette', recipeId: '', freeText: '', servings: '2', memberIds: [] },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      kind: entry ? (entry.recipeId ? 'recette' : 'texte') : 'recette',
      recipeId: entry?.recipeId ?? '',
      freeText: entry?.freeText ?? '',
      servings: String(entry?.servings ?? 2),
      memberIds: entry?.memberIds ?? [],
      day: entry?.date ?? defaultDate,
      slot: entry?.slot ?? defaultSlot,
    });
  }, [open, entry, defaultDate, defaultSlot, reset]);

  const kind = watch('kind');
  const memberIds = watch('memberIds');

  const toggleMember = (memberId: string) => {
    const next = memberIds.includes(memberId) ? memberIds.filter((id) => id !== memberId) : [...memberIds, memberId];
    setValue('memberIds', next, { shouldDirty: true });
  };

  const submit = handleSubmit(async (values) => {
    try {
      await onSave(values, { date: values.day, slot: values.slot });
      onOpenChange(false);
    } catch {
      // L'échec a été signalé par le parent (toast) : le dialogue reste ouvert.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? 'Modifier le repas' : 'Planifier un repas'}</DialogTitle>
          <DialogDescription>Une recette du foyer ou un texte libre — pour les restes, l’improvisation et les invitations.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" onSubmit={submit} noValidate>
          <div role="group" aria-label="Type de repas" className="flex gap-2">
            {(['recette', 'texte'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setValue('kind', value, { shouldDirty: true })}
                className={cn(
                  'min-h-10 flex-1 rounded-full border px-3.5 text-[13px] font-[650] transition-colors duration-[var(--duration-quick)]',
                  kind === value ? 'border-accent bg-accent text-surface' : 'border-border/70 bg-surface text-muted hover:border-accent hover:text-fg',
                )}
              >
                {value === 'recette' ? 'Une recette du foyer' : 'Texte libre'}
              </button>
            ))}
          </div>

          {kind === 'recette' ? (
            <Field label="Recette" error={errors.recipeId?.message}>
              {(props) => (
                <Select {...props} {...register('recipeId')}>
                  <option value="">Choisir une recette…</option>
                  {recipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Repas" error={errors.freeText?.message}>
              {(props) => <Input placeholder="Restes du frigo, pique-nique…" {...props} {...register('freeText')} />}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Jour" error={errors.day?.message}>
              {(props) => (
                <Select {...props} {...register('day')}>
                  {weekDates.map((date) => (
                    <option key={date} value={date}>
                      {formatDayLabel(date)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Moment" error={errors.slot?.message}>
              {(props) => (
                <Select {...props} {...register('slot')}>
                  {mealSlots.map((value) => (
                    <option key={value} value={value}>
                      {mealSlotLabels[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Portions" error={errors.servings?.message} hint="Sert à mettre la recette à l’échelle dans les courses.">
            {(props) => <Input type="number" min="1" max="50" {...props} {...register('servings')} />}
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-extrabold text-muted">Qui mange (optionnel)</legend>
            <div className="flex flex-wrap gap-2">
              {eligibleMembers.map((member) => {
                const checked = memberIds.includes(member.id);
                return (
                  <label
                    key={member.id}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3 text-[12.5px] font-[650] transition-colors duration-[var(--duration-quick)]',
                      checked ? 'border-accent bg-accent-faint text-fg' : 'border-border/70 bg-surface text-muted hover:border-accent hover:text-fg',
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleMember(member.id)} aria-label={`${member.display_name} mange`} />
                    {member.display_name}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} icon="check">
              {isSubmitting ? 'Enregistrement…' : entry ? 'Enregistrer' : 'Planifier'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
