import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { InvitationInput } from '../types';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const schema = z.object({
  name: z.string().trim().min(1, 'Indiquez le nom de la personne.').max(60, '60 caractères maximum.'),
  email: z
    .string()
    .trim()
    .min(1, 'Indiquez un email.')
    .refine((value) => emailPattern.test(value), 'Indiquez un email valide.'),
  role: z.enum(['membre', 'enfant']),
  access: z.enum(['foyer', 'cercle', 'ardoise']),
});

type FormValues = z.infer<typeof schema>;

const accessOptions: { value: FormValues['access']; label: string }[] = [
  { value: 'foyer', label: 'Foyer' },
  { value: 'cercle', label: 'Cercle' },
  { value: 'ardoise', label: 'Ardoise uniquement' },
];

const roleOptions: { value: FormValues['role']; label: string }[] = [
  { value: 'membre', label: 'Membre' },
  { value: 'enfant', label: 'Enfant' },
];

export interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InvitationInput) => Promise<unknown>;
  isPending?: boolean;
}

/**
 * Invitation ciblée vers une personne précise, distincte du token d'accès au
 * foyer. Aucune ligne `household_members` n'est modifiée ici : le rôle est
 * accordé à l'acceptation, jamais depuis le client.
 */
export function InviteMemberDialog({ open, onOpenChange, onSubmit, isPending = false }: InviteMemberDialogProps) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'membre', access: 'foyer' },
  });

  const submit = async (values: FormValues) => {
    try {
      await onSubmit(values);
      toast(`Invitation envoyée à ${values.email.trim()}.`);
      reset({ name: '', email: '', role: 'membre', access: 'foyer' });
      onOpenChange(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Invitation impossible.', 'error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Ardoise</p>
          <DialogTitle>Inviter un membre</DialogTitle>
          <DialogDescription>
            Une invitation peut cibler une seule personne. Elle ne change aucun rôle existant.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Ex. Julie Durand" />}
          </Field>
          <Field label="Email" error={errors.email?.message}>
            {(props) => <Input {...props} type="email" {...register('email')} placeholder="julie@exemple.fr" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Rôle">
              {(props) => (
                <Select {...props} {...register('role')}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Accès">
              {(props) => (
                <Select {...props} {...register('access')}>
                  {accessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <p className="m-0 text-[11px] text-muted">
            L’invitation est enregistrée dans le foyer. Le périmètre choisi s’applique à son acceptation, côté serveur.
          </p>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isPending}>
              {isPending ? 'Envoi…' : 'Envoyer l’invitation'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
