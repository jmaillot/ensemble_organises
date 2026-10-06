import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';
import { useMembers } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import type { EventCalendarRow, EventCategoryRow } from '@/types';
import { toColorTag } from '../types';
import type { CalendarEvent, EventFormValues } from '../types';

const TIME_PATTERN = /^\d{2}:\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Le titre est obligatoire.'),
    date: z.string().trim().min(1, 'La date est obligatoire.'),
    startTime: z.string().trim().regex(TIME_PATTERN, 'Indiquez une heure valide.'),
    endTime: z
      .string()
      .trim()
      .refine((value) => value === '' || TIME_PATTERN.test(value), 'Indiquez une heure valide.'),
    allDay: z.boolean(),
    location: z.string().trim(),
    description: z.string().trim(),
    memberId: z.string(),
    categoryId: z.string(),
    calendarId: z.string(),
    remindAt: z
      .string()
      .trim()
      .refine((value) => value === '' || DATE_TIME_PATTERN.test(value), 'Indiquez une date de rappel valide.'),
  })
  .refine((values) => values.allDay || values.endTime === '' || values.endTime >= values.startTime, {
    message: 'L’heure de fin doit suivre l’heure de début.',
    path: ['endTime'],
  });

/**
 * Choix calendrier explicite (D-03) : dès que plusieurs calendriers existent,
 * un `calendarId` vide est rejeté au formulaire au lieu d'être résolu
 * silencieusement vers le Commun (le trigger serveur 0048 reste le filet
 * pour les vieux clients). Avec un seul calendrier (ou aucun chargé), le
 * schéma de base s'applique : la présélection visible garantit déjà qu'aucune
 * valeur vide n'est soumise.
 */
export function buildEventSchema(calendarCount: number) {
  if (calendarCount > 1) {
    // `.extend()` est interdit sur un schéma raffiné (Zod v4) : `.safeExtend()`
    // reconduit la vérification heure-fin-après-début tout en durcissant
    // `calendarId` (vérifié : le raffinement reste appliqué).
    return eventSchema.safeExtend({
      calendarId: z.string().trim().min(1, 'Choisissez un calendrier.'),
    });
  }
  return eventSchema;
}

const toTimeValue = (iso: string | null, allDay: boolean) => {
  if (allDay || !iso) return '';
  return iso.slice(11, 16);
};

const toReminderValue = (remindAt: string | null | undefined) => (remindAt ? remindAt.slice(0, 16) : '');

function defaultValues(
  event: CalendarEvent | null,
  defaultDate: string,
  memberId: string,
  remindAt: string | null | undefined,
): EventFormValues {
  if (!event) {
    return {
      title: '',
      date: defaultDate,
      startTime: '19:30',
      endTime: '',
      allDay: false,
      location: '',
      description: '',
      memberId: '',
      categoryId: '',
      calendarId: '',
      remindAt: toReminderValue(remindAt),
    };
  }
  return {
    title: event.title,
    date: event.date,
    startTime: event.allDay ? '' : toTimeValue(event.startAt, event.allDay),
    endTime: event.allDay ? '' : toTimeValue(event.endAt, event.allDay),
    allDay: event.allDay,
    location: event.location ?? '',
    description: event.description ?? '',
    memberId,
    categoryId: event.categoryId ?? '',
    calendarId: event.calendarId ?? '',
    remindAt: toReminderValue(remindAt),
  };
}

export interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null;
  /** Date pré-remplie à la création (jour sélectionné ou appui long). */
  defaultDate: string;
  /** Rappel existant de l'événement édité, le cas échéant. */
  remindAt?: string | null;
  isSaving?: boolean;
  onSubmit: (values: EventFormValues) => Promise<void> | void;
}

export function EventFormDialog({ open, onOpenChange, event, defaultDate, remindAt, isSaving = false, onSubmit }: EventFormDialogProps) {
  const members = useMembers();
  const categoriesResource = useResource<EventCategoryRow>('event_categories');
  const categories = categoriesResource.rows;
  const calendarsResource = useResource<EventCalendarRow>('event_calendars');
  const calendars = calendarsResource.rows;
  // Le membre est retrouvé par sa couleur : `events.color` porte le `color_tag`.
  const memberId = event
    ? (members.find((member) => toColorTag(member.color_tag) === toColorTag(event.color))?.id ?? '')
    : '';
  // Calendrier Commun du foyer : première source la visibilité, repli sur le
  // nom historique pour les vieux jeux de données.
  const communCalendar =
    calendars.find((calendar) => calendar.visibility === 'commun') ??
    calendars.find((calendar) => calendar.name === 'Commun' && !calendar.owner_member_id) ??
    null;
  // Plusieurs calendriers = choix ambigu : la validation refuse le vide (D-03).
  const schema = useMemo(() => buildEventSchema(calendars.length), [calendars.length]);
  const { register, handleSubmit, reset, watch, setValue, getValues, formState } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    defaultValues: defaultValues(event, defaultDate, memberId, remindAt),
  });
  const allDay = watch('allDay');
  const errors = formState.errors;

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(event, defaultDate, memberId, remindAt));
    // `event`, `defaultDate` et `remindAt` identifient une ouverture : on ne
    // réinitialise pas le formulaire à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, defaultDate, remindAt]);

  // D-03 : présélection visible du Commun. Dès que les calendriers sont
  // chargés et que le champ est encore vide (création ou ancien événement
  // implicitement Commun), on affiche l'id du Commun au lieu de soumettre
  // une chaîne vide. Ne se redéclenche pas après un choix utilisateur
  // (dépendances stables : `open` + calendrier Commun résolu).
  useEffect(() => {
    if (!open || !communCalendar) return;
    if (getValues('calendarId') === '') {
      setValue('calendarId', communCalendar.id, { shouldDirty: false });
    }
  }, [open, communCalendar, getValues, setValue]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Calendrier</p>
          <DialogTitle>{event ? 'Modifier l’événement' : 'Ajouter un événement'}</DialogTitle>
          <DialogDescription>
            Rendez-vous, sortie ou échéance à ne pas manquer. Le foyer voit le changement immédiatement.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Titre" error={errors.title?.message}>
            {(props) => (
              <Input
                {...props}
                {...register('title')}
                placeholder="Ex. Réunion de rentrée — école"
                autoComplete="off"
              />
            )}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field label="Date" error={errors.date?.message}>
              {(props) => <Input {...props} type="date" {...register('date')} />}
            </Field>
            <Field label="Heure de début" error={errors.startTime?.message}>
              {(props) => (
                <Input {...props} type="time" {...register('startTime')} disabled={allDay} />
              )}
            </Field>
            <Field label="Heure de fin" optional error={errors.endTime?.message}>
              {(props) => (
                <Input {...props} type="time" {...register('endTime')} disabled={allDay} />
              )}
            </Field>
          </div>

          <Field
            label="Journée entière"
            optional
            className="grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[11px] border border-border px-3 py-2.5"
          >
            {(props) => (
              <Switch
                {...props}
                checked={allDay}
                onCheckedChange={(checked) => setValue('allDay', checked, { shouldDirty: true })}
              />
            )}
          </Field>

          <Field label="Lieu" optional error={errors.location?.message}>
            {(props) => <Input {...props} {...register('location')} placeholder="Ex. École Jean Moulin" />}
          </Field>

          <Field label="Catégorie" optional error={errors.categoryId?.message}>
            {(props) => (
              <Select {...props} {...register('categoryId')}>
                <option value="">Sans catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Calendrier"
            optional={calendars.length <= 1}
            error={errors.calendarId?.message}
          >
            {(props) => (
              <Select {...props} {...register('calendarId')}>
                {communCalendar ? (
                  <option value={communCalendar.id}>Commun du foyer</option>
                ) : (
                  <option value="" disabled>
                    Chargement des calendriers…
                  </option>
                )}
                {calendars
                  .filter((calendar) => calendar.id !== communCalendar?.id)
                  .map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.name}
                      {calendar.visibility === 'perso' ? ' (perso)' : ''}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label="Couleur du foyer" optional error={errors.memberId?.message}>
            {(props) => (
              <Select {...props} {...register('memberId')}>
                <option value="">Corail · sans membre associé</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Description" optional error={errors.description?.message}>
            {(props) => <Textarea {...props} {...register('description')} rows={3} placeholder="Prendre la carte vitale, venir à deux…" />}
          </Field>

          <Field
            label="Rappel le"
            optional
            hint="Laissez vide pour ne pas être averti."
            error={errors.remindAt?.message}
          >
            {(props) => <Input {...props} type="datetime-local" {...register('remindAt')} />}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {event ? 'Enregistrer les modifications' : 'Ajouter l’événement'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
