import { useEffect, useMemo, useRef, useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { PET_SPECIES, type Pet, type PetDraft, type PetSummary } from '../types';

const optionalText = (max: number, message: string) => z.string().trim().max(max, message);
const isIsoDate = (value: string) => z.iso.date().safeParse(value).success;

const schema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(120, 'Ce nom est trop long.'),
  species: z.enum(PET_SPECIES, { error: 'Choisissez une espèce.' }),
  breed: optionalText(80, 'Ce nom est trop long.'),
  weightKg: z
    .string()
    .trim()
    .refine((value) => value === '' || (!Number.isNaN(Number(value)) && Number(value) > 0 && Number(value) <= 300), {
      message: 'Indiquez un poids en kg.',
    }),
  birthDate: z.string().refine((value) => value === '' || isIsoDate(value), { message: 'Date de naissance invalide.' }),
  identificationNumber: optionalText(60, 'Numéro trop long.'),
  nextReminderDate: z.string().refine((value) => value === '' || isIsoDate(value), { message: 'Date de rappel invalide.' }),
  notes: optionalText(2000, 'Ces notes sont trop longues.'),
  photoUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || value.startsWith('/') || /^https?:\/\//.test(value), {
      message: 'Indiquez un chemin commençant par « / » ou une URL https.',
    }),
});

type PetFormValues = z.infer<typeof schema>;

function toDraft(values: PetFormValues): PetDraft {
  return {
    name: values.name,
    species: values.species,
    breed: values.breed || null,
    weightKg: values.weightKg ? Number(values.weightKg) : null,
    birthDate: values.birthDate || null,
    identificationNumber: values.identificationNumber || null,
    photoUrl: values.photoUrl || null,
    notes: values.notes || null,
    nextReminderDate: values.nextReminderDate || null,
  };
}

const emptyValues: PetFormValues = {
  name: '',
  species: 'Chien',
  breed: '',
  weightKg: '',
  birthDate: '',
  identificationNumber: '',
  nextReminderDate: '',
  notes: '',
  photoUrl: '',
};

function defaultsFor(pet: Pet | null, summary: PetSummary | null): PetFormValues {
  if (!pet) return { ...emptyValues };
  return {
    name: pet.name,
    species: PET_SPECIES.includes(pet.species as PetFormValues['species']) ? (pet.species as PetFormValues['species']) : 'Autre',
    breed: pet.breed ?? '',
    weightKg: pet.weightKg === null ? '' : String(pet.weightKg),
    birthDate: pet.birthDate ?? '',
    identificationNumber: pet.identificationNumber ?? '',
    nextReminderDate: summary?.nextReminderDate ?? '',
    notes: summary?.notes ?? '',
    photoUrl: pet.photoUrl ?? '',
  };
}

function FormSection({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-[16px] border border-border">
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[13px] font-extrabold text-fg"
        >
          {title}
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size="sm" className="text-muted" />
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="grid gap-3.5 px-4 pt-1 pb-4">
        <p className="m-0 text-[11px] text-muted">{description}</p>
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export interface PetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet: Pet | null;
  summary: PetSummary | null;
  saving?: boolean;
  onSubmit: (draft: PetDraft) => void | Promise<void>;
}

/**
 * Formulaire de fiche animal en sections repliables (AGENTS.md §6) : identité,
 * santé puis suivi. Les champs optionnels sont signalés explicitement.
 */
export function PetFormDialog({ open, onOpenChange, pet, summary, saving = false, onSubmit }: PetFormDialogProps) {
  const wasOpen = useRef(false);
  const defaults = useMemo(() => defaultsFor(pet, summary), [pet, summary]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PetFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open && !wasOpen.current) reset(defaults);
    wasOpen.current = open;
  }, [open, defaults, reset]);

  const editing = Boolean(pet);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow">Animaux</p>
          <DialogTitle>{editing ? `Modifier la fiche de ${pet?.name}` : 'Ajouter une fiche animal'}</DialogTitle>
          <DialogDescription>
            Les informations de santé et de suivi restent accessibles au foyer.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" noValidate onSubmit={handleSubmit((values) => onSubmit(toDraft(values)))}>
          <FormSection title="Identité" description="Le minimum pour reconnaître l’animal dans le foyer.">
            <Field label="Nom" error={errors.name?.message}>
              {(props) => <Input placeholder="Ex. Nala" {...props} {...register('name')} />}
            </Field>
            <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
              <Field label="Espèce" error={errors.species?.message}>
                {(props) => (
                  <Select {...props} {...register('species')}>
                    {PET_SPECIES.map((species) => (
                      <option key={species} value={species}>
                        {species}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Race" optional error={errors.breed?.message}>
                {(props) => <Input placeholder="Ex. Golden retriever" {...props} {...register('breed')} />}
              </Field>
            </div>
          </FormSection>

          <FormSection title="Santé" description="Les repères du carnet de santé.">
            <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
              <Field label="Poids (kg)" optional error={errors.weightKg?.message}>
                {(props) => <Input type="number" step="0.1" min="0" placeholder="Ex. 28,4" {...props} {...register('weightKg')} />}
              </Field>
              <Field label="Date de naissance" optional error={errors.birthDate?.message}>
                {(props) => <Input type="date" {...props} {...register('birthDate')} />}
              </Field>
            </div>
            <Field label="Numéro d’identification" optional error={errors.identificationNumber?.message}>
              {(props) => <Input placeholder="Ex. FR-483920" {...props} {...register('identificationNumber')} />}
            </Field>
          </FormSection>

          <FormSection title="Suivi" description="Prochain rappel, notes libres et photo de la fiche." defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
              <Field label="Prochain rappel" optional error={errors.nextReminderDate?.message}>
                {(props) => <Input type="date" {...props} {...register('nextReminderDate')} />}
              </Field>
              <Field label="Photo" optional error={errors.photoUrl?.message}>
                {(props) => <Input placeholder="/assets/animaux.jpg" {...props} {...register('photoUrl')} />}
              </Field>
            </div>
            <Field label="Informations" optional error={errors.notes?.message}>
              {(props) => (
                <Textarea
                  rows={3}
                  placeholder="Ex. Rappel antiparasitaire à planifier."
                  {...props}
                  {...register('notes')}
                />
              )}
            </Field>
          </FormSection>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer la fiche' : 'Créer la fiche'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
