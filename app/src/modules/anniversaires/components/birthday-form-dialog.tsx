import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useMembers } from '@/stores/household-store';
import type { Birthday, BirthdayFormValues } from '../types';
import { formatDayMonth, formatFrDate, parseFrDate } from '../types';

const birthdaySchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.'),
  birthDate: z
    .string()
    .trim()
    .min(1, 'La date de naissance est obligatoire.')
    .refine((value) => parseFrDate(value) !== null, 'Indiquez une date valide au format JJ/MM/AAAA.'),
  linkedMemberId: z.string(),
  photoUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || /^(\/|https?:\/\/)/.test(value), 'Indiquez une adresse de photo valide.'),
  createContact: z.boolean(),
});

const defaultValues = (birthday: Birthday | null): BirthdayFormValues =>
  birthday
    ? {
        name: birthday.name,
        birthDate: formatFrDate(birthday.birthDate),
        linkedMemberId: birthday.linkedMemberId ?? '',
        photoUrl: birthday.photoUrl ?? '',
        createContact: false,
      }
    : { name: '', birthDate: '', linkedMemberId: '', photoUrl: '', createContact: true };

export interface BirthdayFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  birthday: Birthday | null;
  isSaving?: boolean;
  onSubmit: (values: BirthdayFormValues) => Promise<void> | void;
}

export function BirthdayFormDialog({ open, onOpenChange, birthday, isSaving = false, onSubmit }: BirthdayFormDialogProps) {
  const members = useMembers();
  const { register, handleSubmit, reset, watch, formState } = useForm<BirthdayFormValues>({
    resolver: zodResolver(birthdaySchema),
    defaultValues: defaultValues(birthday),
  });
  const errors = formState.errors;
  const photoUrl = watch('photoUrl') ?? '';
  const birthDate = watch('birthDate') ?? '';
  // L'indice travaille en ISO, la saisie en JJ/MM/AAAA : conversion gardée.
  const birthDateIso = parseFrDate(birthDate);

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(birthday));
    // L'identifiant de l'anniversaire edited identifie une ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, birthday?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Anniversaires</p>
          <DialogTitle>{birthday ? 'Modifier l’anniversaire' : 'Ajouter un anniversaire'}</DialogTitle>
          <DialogDescription>
            Une date, un prénom, et le calendrier s’occupe du reste.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            const iso = parseFrDate(values.birthDate);
            if (!iso) return;
            await onSubmit({ ...values, birthDate: iso });
          })}
        >
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Ex. Maya Martin" autoComplete="off" />}
          </Field>

          <Field
            label="Date de naissance"
            hint={
              birthDateIso
                ? `Prochain anniversaire : ${formatDayMonth(birthDateIso)}`
                : 'Au format JJ/MM/AAAA.'
            }
            error={errors.birthDate?.message}
          >
            {(props) => (
              <Input
                {...props}
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                placeholder="JJ/MM/AAAA"
                {...register('birthDate')}
              />
            )}
          </Field>

          <Field label="Membre du foyer" optional error={errors.linkedMemberId?.message}>
            {(props) => (
              <Select {...props} {...register('linkedMemberId')}>
                <option value="">Aucun membre associé</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Photo" optional error={errors.photoUrl?.message}>
            {(props) => <Input {...props} {...register('photoUrl')} placeholder="https://… ou /assets/…" />}
          </Field>

          {photoUrl.trim().startsWith('http') ? (
            <img
              src={photoUrl.trim()}
              alt="Aperçu de la photo"
              className="h-24 w-full rounded-[11px] border border-border object-cover"
            />
          ) : null}

          {!birthday ? (
            <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-[11px] border border-border bg-bg px-3.5 py-3 text-xs text-fg">
              <input type="checkbox" {...register('createContact')} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-strong)]" />
              <span>
                <strong className="font-extrabold">Créer aussi un contact</strong>
                <span className="block text-[11px] text-muted">
                  La fiche rejoint la liste Famille, sans doublon d’anniversaire.
                </span>
              </span>
            </label>
          ) : null}

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {birthday ? 'Enregistrer les modifications' : 'Ajouter l’anniversaire'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
