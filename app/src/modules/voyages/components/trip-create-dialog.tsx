import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useMembers } from '@/stores/household-store';
import {
  EMPTY_TRIP_INPUT,
  TRIP_COVER_PRESETS,
  TRIP_TOGGLABLE_TABS,
  TRIP_TABS,
  type TripTabKey,
} from '../types';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Donnez un nom au voyage.').max(80, 'Le nom est trop long.'),
    destination: z.string().trim().min(2, 'Indiquez la destination.').max(80, 'La destination est trop longue.'),
    startDate: z.string().min(1, 'Indiquez la date de départ.'),
    endDate: z.string().min(1, 'Indiquez la date de retour.'),
    coverPhoto: z.string().trim().min(1, 'Choisissez une photo de couverture.'),
    notes: z.string().trim().max(600, 'Les notes sont limitées à 600 caractères.'),
    participantIds: z.array(z.string()).min(1, 'Sélectionnez au moins un participant.'),
    enabledTabs: z.array(z.string()),
  })
  .refine((values) => values.endDate >= values.startDate, {
    message: 'La date de retour doit suivre la date de départ.',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof schema>;

export interface TripCreateValues {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coverPhoto: string;
  coverFile: File | null;
  notes: string;
  participantIds: string[];
  enabledTabs: TripTabKey[];
}

export interface TripCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renvoie l'id du voyage créé (pour naviguer vers sa fiche), ou null en échec. */
  onSubmit: (values: TripCreateValues) => Promise<string | null>;
  busy?: boolean;
}

/**
 * Création d'un voyage (phase 15, D-01 révisé 0119) : infos (mêmes champs que
 * le formulaire historique), composants activés et participants. Tous les
 * membres du foyer sont proposés, enfants compris — ils voyagent mais ne
 * touchent pas au budget (l'onglet Budget les filtre, comme l'ardoise).
 * Le serveur ré-valide (Edge + RPC, T-15-06).
 */
export function TripCreateDialog({ open, onOpenChange, onSubmit, busy }: TripCreateDialogProps) {
  const toast = useToast();
  const members = useMembers();
  // 0119 : toute la famille voyage — enfants inclus (budget seul les exclut).
  const eligible = useMemo(() => members, [members]);
  const eligibleIds = useMemo(() => eligible.map((member) => member.id), [eligible]);
  const tabLabels = useMemo(() => new Map(TRIP_TABS.map((tab) => [tab.key, tab.label])), []);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const defaults = useMemo<FormValues>(
    () => ({
      ...EMPTY_TRIP_INPUT,
      participantIds: eligibleIds,
      enabledTabs: [...TRIP_TOGGLABLE_TABS],
    }),
    [eligibleIds],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit' });
  const coverPhoto = watch('coverPhoto');
  const selectedParticipants = watch('participantIds') ?? [];
  const selectedTabs = watch('enabledTabs') ?? [];

  useEffect(() => {
    if (open) reset(defaults);
    setCoverFile(null);
  }, [open, defaults, reset]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    try {
      if (typeof URL.createObjectURL !== 'function') {
        setCoverPreview(null);
        return;
      }
      const url = URL.createObjectURL(coverFile);
      setCoverPreview(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setCoverPreview(null);
    }
  }, [coverFile]);

  const toggleParticipant = (memberId: string) => {
    const next = selectedParticipants.includes(memberId)
      ? selectedParticipants.filter((id) => id !== memberId)
      : [...selectedParticipants, memberId];
    setValue('participantIds', next, { shouldDirty: true, shouldValidate: true });
  };

  const toggleTab = (tab: TripTabKey) => {
    const next = selectedTabs.includes(tab)
      ? selectedTabs.filter((key) => key !== tab)
      : [...selectedTabs, tab];
    setValue('enabledTabs', next, { shouldDirty: true });
  };

  const onSubmitForm = handleSubmit(async (values) => {
    const tripId = await onSubmit({
      name: values.name,
      destination: values.destination,
      startDate: values.startDate,
      endDate: values.endDate,
      coverPhoto: values.coverPhoto,
      coverFile,
      notes: values.notes,
      participantIds: values.participantIds,
      enabledTabs: values.enabledTabs as TripTabKey[],
    });
    if (tripId) onOpenChange(false);
    else toast('Le voyage n’a pas pu être enregistré.', 'error');
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un voyage</DialogTitle>
          <DialogDescription>
            Une destination, une période, les participants et les rubriques : la fiche s’ouvre ensuite.
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
            label="Photo de couverture"
            error={errors.coverPhoto?.message}
            hint="Choisir une photo de la galerie, coller l’URL d’une image, ou téléverser un fichier — le fichier gagne sur l’URL."
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
                      className="min-h-11 w-20 overflow-hidden rounded-[11px] border border-border bg-bg text-[11px] font-bold text-muted"
                      aria-pressed={coverPhoto === preset.url}
                      aria-label={`Choisir la photo ${preset.label}`}
                    >
                      <img src={preset.url} alt="" className="h-12 w-full object-cover" />
                      <span className="block py-0.5">{preset.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      alt="Aperçu de la couverture téléversée"
                      className="h-14 w-20 rounded-[11px] object-cover"
                    />
                  ) : null}
                  <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-bg px-3.5 text-xs font-extrabold text-fg">
                    {coverFile ? 'Changer de fichier' : 'Téléverser une photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {coverFile ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCoverFile(null)}>
                      Retirer le fichier
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </Field>

          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-extrabold text-muted">Participants du voyage</legend>
            <p className="m-0 text-[11px] text-muted">
              Toute la famille voyage, enfants compris — les invités externes
              rejoignent ensuite par code (le budget reste aux adultes).
            </p>
            {eligible.map((member) => {
              const checked = selectedParticipants.includes(member.id);
              return (
                <label
                  key={member.id}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleParticipant(member.id)}
                    className="accent-accent"
                  />
                  <MemberAvatar member={member} size="sm" />
                  {member.display_name}
                </label>
              );
            })}
            {errors.participantIds?.message ? (
              <p role="alert" className="m-0 text-[11px] font-semibold text-coral-text">
                {errors.participantIds.message}
              </p>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-[11px] font-extrabold text-muted">Rubriques de la fiche</legend>
            <p className="m-0 text-[11px] text-muted">
              Infos et Paramètres sont toujours affichés ; le reste se rebascule ensuite.
            </p>
            {TRIP_TOGGLABLE_TABS.map((tab) => {
              const checked = selectedTabs.includes(tab);
              return (
                <label
                  key={tab}
                  className="inline-flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[9px] border border-border bg-bg px-2.5 text-[12px] font-semibold text-muted has-[:checked]:border-accent has-[:checked]:bg-accent-faint has-[:checked]:text-accent-strong"
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleTab(tab)} className="accent-accent" />
                  {tabLabels.get(tab) ?? tab}
                </label>
              );
            })}
          </fieldset>

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
              {busy ? 'Création…' : 'Créer le voyage'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
