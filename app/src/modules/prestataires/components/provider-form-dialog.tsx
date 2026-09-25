import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { mailtoHref, telHref } from '../api';
import { UNASSIGNED_TYPE_LABEL, type Provider, type ProviderDraft, type ProviderType } from '../types';

const optionalText = (max: number, message: string) => z.string().trim().max(max, message);

const schema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200, 'Ce nom est trop long.'),
  typeId: z.string().trim(),
  phone: optionalText(40, 'Ce numéro est trop long.'),
  email: z.string().trim().refine((value) => value === '' || z.email().safeParse(value).success, {
    message: 'Adresse e-mail invalide.',
  }),
  address: optionalText(200, 'Cette adresse est trop longue.'),
  postalCode: optionalText(12, 'Ce code postal est trop long.'),
  city: optionalText(120, 'Ce nom de ville est trop long.'),
  notes: optionalText(2000, 'Ces notes sont trop longues.'),
});

type ProviderFormValues = z.infer<typeof schema>;

function toDraft(values: ProviderFormValues): ProviderDraft {
  return {
    typeId: values.typeId || null,
    name: values.name,
    phone: values.phone || null,
    email: values.email || null,
    address: values.address || null,
    postalCode: values.postalCode || null,
    city: values.city || null,
    notes: values.notes || null,
  };
}

function defaultsFor(provider: Provider | null): ProviderFormValues {
  if (!provider) return { name: '', typeId: '', phone: '', email: '', address: '', postalCode: '', city: '', notes: '' };
  return {
    name: provider.name,
    typeId: provider.typeId ?? '',
    phone: provider.phone ?? '',
    email: provider.email ?? '',
    address: provider.address ?? '',
    postalCode: provider.postalCode ?? '',
    city: provider.city ?? '',
    notes: provider.notes ?? '',
  };
}

export interface ProviderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null;
  types: ProviderType[];
  saving?: boolean;
  onSubmit: (draft: ProviderDraft) => void | Promise<void>;
}

/**
 * Fiche prestataire : identité, type, coordonnées et adresse. Le type reste
 * facultatif : un contact sans type reste retrouvable par la recherche.
 */
export function ProviderFormDialog({ open, onOpenChange, provider, types, saving = false, onSubmit }: ProviderFormDialogProps) {
  const wasOpen = useRef(false);
  const defaults = useMemo(() => defaultsFor(provider), [provider]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProviderFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open && !wasOpen.current) reset(defaults);
    wasOpen.current = open;
  }, [open, defaults, reset]);

  const editing = Boolean(provider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow">Prestataires</p>
          <DialogTitle>{editing ? `Modifier ${provider?.name}` : 'Ajouter un prestataire'}</DialogTitle>
          <DialogDescription>
            Un contact complet, prêt à être retrouvé par toute la famille.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" noValidate onSubmit={handleSubmit((values) => onSubmit(toDraft(values)))}>
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input placeholder="Ex. Cabinet du Dr Morel" {...props} {...register('name')} />}
          </Field>
          <Field
            label="Type"
            optional
            error={errors.typeId?.message}
            hint={types.length === 0 ? 'Créez d’abord un type depuis « Gérer les types ».' : undefined}
          >
            {(props) => (
              <Select {...props} {...register('typeId')}>
                <option value="">{UNASSIGNED_TYPE_LABEL}</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Téléphone" optional error={errors.phone?.message}>
              {(props) => <Input type="tel" placeholder="Ex. 04 72 00 00 00" {...props} {...register('phone')} />}
            </Field>
            <Field label="E-mail" optional error={errors.email?.message}>
              {(props) => <Input type="email" placeholder="contact@exemple.fr" {...props} {...register('email')} />}
            </Field>
          </div>
          <Field label="Adresse" optional error={errors.address?.message}>
            {(props) => <Input placeholder="Ex. 18 rue des Tilleuls" {...props} {...register('address')} />}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Code postal" optional error={errors.postalCode?.message}>
              {(props) => <Input inputMode="numeric" placeholder="69006" {...props} {...register('postalCode')} />}
            </Field>
            <Field label="Ville" optional error={errors.city?.message}>
              {(props) => <Input placeholder="Lyon" {...props} {...register('city')} />}
            </Field>
          </div>
          <Field label="Notes" optional error={errors.notes?.message}>
            {(props) => (
              <Textarea rows={3} placeholder="Ex. Prendre rendez-vous avant 17 h." {...props} {...register('notes')} />
            )}
          </Field>
          {provider ? (
            <div className="flex flex-wrap gap-2">
              {provider.phone ? (
                <Button asChild variant="secondary" size="sm" icon="phone">
                  <a href={telHref(provider.phone)}>Appeler</a>
                </Button>
              ) : null}
              {provider.email ? (
                <Button asChild variant="secondary" size="sm" icon="message">
                  <a href={mailtoHref(provider.email)}>Écrire</a>
                </Button>
              ) : null}
            </div>
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer le contact' : 'Ajouter le contact'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
