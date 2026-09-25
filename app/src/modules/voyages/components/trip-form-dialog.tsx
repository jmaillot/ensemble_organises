import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addDays, todayIso } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import {
  DEFAULT_TRIP_COVER,
  EMPTY_TRIP_INPUT,
  TRIP_COVER_PRESETS,
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  type Trip,
  type TripInput,
  type TripStatus,
} from '../types';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Donnez un nom au voyage.').max(80, 'Le nom est trop long.'),
    destination: z.string().trim().min(2, 'Indiquez la destination.').max(80, 'La destination est trop longue.'),
    startDate: z.string().min(1, 'Indiquez la date de départ.'),
    endDate: z.string().min(1, 'Indiquez la date de retour.'),
    coverPhoto: z.string().trim().min(1, 'Choisissez une photo de couverture.'),
    notes: z.string().trim().max(600, 'Les notes sont limitées à 600 caractères.'),
    status: z.enum(TRIP_STATUSES),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'La date de retour doit suivre la date de départ.',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

/**
 * `trips` ne stocke pas de statut : chaque statut propose une période cohérente
 * (fenêtre de dates) que l'on applique quand les dates ne sont pas encore
 * saisies. Le héros, lui, affiche toujours le statut dérivé des dates.
 */
const statusWindows: Record<TripStatus, { start: string; end: string } | null> = {
  a_preparer: { start: '', end: '' },
  confirme: { start: addDays(todayIso(), 30), end: addDays(todayIso(), 36) },
  en_cours: { start: addDays(todayIso(), -2), end: addDays(todayIso(), 4) },
  termine: { start: addDays(todayIso(), -30), end: addDays(todayIso(), -24) },
};

export interface TripFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Voyage édité ; `null` pour une création. */
  trip: Trip | null;
  onSubmit: (input: TripInput, id: string | null) => Promise<boolean>;
  busy?: boolean;
}

export function TripFormDialog({ open, onOpenChange, trip, onSubmit, busy }: TripFormDialogProps) {
  const toast = useToast();
  const defaults = useMemo<FormValues>(
    () =>
      trip
        ? {
            name: trip.name,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
            coverPhoto: trip.coverPhoto,
            notes: trip.notes,
            status: trip.status,
          }
        : { ...EMPTY_TRIP_INPUT, coverPhoto: DEFAULT_TRIP_COVER, status: 'a_preparer' as TripStatus },
    [trip],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit' });
  const coverPhoto = watch('coverPhoto');

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const onSelectStatus = (status: TripStatus) => {
    const window = statusWindows[status];
    setValue('status', status, { shouldDirty: true });
    const { startDate, endDate } = getValues();
    // Une période n'est proposée que si le voyage n'a pas encore de dates.
    if (window && (!startDate || !endDate)) {
      if (window.start) setValue('startDate', window.start, { shouldDirty: true, shouldValidate: true });
      if (window.end) setValue('endDate', window.end, { shouldDirty: true, shouldValidate: true });
    }
  };

  const onSubmitForm = handleSubmit(async (values) => {
    const saved = await onSubmit(
      {
        name: values.name,
        destination: values.destination,
        startDate: values.startDate,
        endDate: values.endDate,
        coverPhoto: values.coverPhoto,
        notes: values.notes,
      },
      trip?.id ?? null,
    );
    if (saved) onOpenChange(false);
    else toast('Le voyage n’a pas pu être enregistré.', 'error');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trip ? 'Modifier le voyage' : 'Créer un voyage'}</DialogTitle>
          <DialogDescription>
            {trip
              ? 'Mettez à jour les dates, la couverture ou les notes du foyer.'
              : 'Une destination, une période : le reste se prépare tranquillement.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmitForm} className="grid gap-3.5" noValidate>
          <Field label="Nom du voyage" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Week-end à Lisbonne" />}
          </Field>

          <Field label="Destination" error={errors.destination?.message}>
            {(props) => <Input {...props} {...register('destination')} placeholder="Lisbonne" />}
          </Field>

          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Départ" error={errors.startDate?.message}>
              {(props) => <Input {...props} type="date" {...register('startDate')} />}
            </Field>
            <Field label="Retour" error={errors.endDate?.message}>
              {(props) => <Input {...props} type="date" {...register('endDate')} />}
            </Field>
          </div>

          <Field
            label="Statut"
            hint="Le statut suit les dates : sans dates, le voyage reste « à préparer »."
            error={errors.status?.message}
          >
            {(props) => (
              <Select {...props} {...register('status')} onChange={(event) => onSelectStatus(event.target.value as TripStatus)}>
                {TRIP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TRIP_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Photo de couverture"
            error={errors.coverPhoto?.message}
            hint="Choisir une photo de la galerie, ou coller l’URL d’une image."
          >
            {(props) => (
              <div className="grid gap-2.5">
                <Input {...props} {...register('coverPhoto')} placeholder="/assets/lisbonne.jpg" />
                <div className="flex flex-wrap gap-2">
                  {TRIP_COVER_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setValue('coverPhoto', preset.url, { shouldDirty: true })}
                      className="min-h-11 w-20 overflow-hidden rounded-[11px] border border-border bg-bg text-[10px] font-bold text-muted"
                      aria-pressed={coverPhoto === preset.url}
                      aria-label={`Choisir la photo ${preset.label}`}
                    >
                      <img src={preset.url} alt="" className="h-12 w-full object-cover" />
                      <span className="block py-0.5">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field label="Notes" optional error={errors.notes?.message} hint="Ce qu’il ne faut pas oublier.">
            {(props) => (
              <Textarea {...props} {...register('notes')} className="min-h-[90px]" placeholder="Vols, hébergement, activités…" />
            )}
          </Field>

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={busy}>
              {busy ? 'Enregistrement…' : trip ? 'Enregistrer' : 'Créer le voyage'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
