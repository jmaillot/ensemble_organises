import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useHouseholdStore } from '@/stores/household-store';
import {
  loyaltyBrandColors,
  loyaltyCodeTypes,
  type LoyaltyCard,
  type LoyaltyCardInput,
} from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom de l’enseigne.').max(60, '60 caractères maximum.'),
  codeType: z.enum(['barcode', 'qr']),
  codeValue: z.string().trim().min(3, 'Saisissez ou scannez le code de la carte.'),
  brandColor: z.enum(['accent', 'coral', 'amber', 'ink']),
  memberId: z.string(),
});

type FormValues = z.infer<typeof schema>;

export interface CardFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` pour un ajout, la carte pour une modification. */
  card: LoyaltyCard | null;
  /** Valeurs issues d'un scan, pré-remplies avant enregistrement. */
  prefill?: Partial<LoyaltyCardInput>;
  isSaving: boolean;
  onSubmit: (input: LoyaltyCardInput) => Promise<void>;
}

export function CardFormDialog({ open, onOpenChange, card, prefill, isSaving, onSubmit }: CardFormDialogProps) {
  const members = useHouseholdStore((state) => state.members);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: card?.name ?? prefill?.name ?? '',
      codeType: card?.codeType ?? prefill?.codeType ?? 'barcode',
      codeValue: card?.codeValue ?? prefill?.codeValue ?? '',
      brandColor: card?.brandColor ?? prefill?.brandColor ?? 'accent',
      memberId: card?.memberId ?? prefill?.memberId ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit({ ...values, memberId: values.memberId || null });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Fidélité</p>
          <DialogTitle>{card ? 'Modifier la carte' : 'Ajouter une carte'}</DialogTitle>
          <DialogDescription>
            Scannez le code ou saisissez-le manuellement pour le retrouver au moment de passer en caisse.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="grid gap-3.5">
          <Field label="Nom de la carte" error={errors.name?.message}>
            {(props) => (
              <Input
                {...props}
                {...register('name')}
                placeholder="Ex. Marché de proximité"
                autoComplete="off"
                enterKeyHint="next"
              />
            )}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Type de code" error={errors.codeType?.message}>
              {(props) => (
                <Select {...props} {...register('codeType')}>
                  {loyaltyCodeTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Couleur de marque" error={errors.brandColor?.message}>
              {(props) => (
                <Select {...props} {...register('brandColor')}>
                  {loyaltyBrandColors.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field
            label="Code"
            error={errors.codeValue?.message}
            hint={card?.codeType === 'qr' ? 'Le contenu exact du QR code de l’enseigne.' : 'Les chiffres imprimés sous le code-barres.'}
          >
            {(props) => (
              <Input
                {...props}
                {...register('codeValue')}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="text"
                placeholder="Ex. 6284 1190 3312"
                className="font-mono tracking-[0.06em]"
              />
            )}
          </Field>

          <Field label="Membre propriétaire" error={errors.memberId?.message} hint="Une carte du foyer entier reste accessible à tous.">
            {(props) => (
              <Select {...props} {...register('memberId')}>
                <option value="">Foyer entier</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon="close" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={isSaving}>
              {card ? 'Enregistrer les modifications' : 'Enregistrer la carte'}
            </Button>
          </div>

          <p className="mb-0 flex items-center gap-2 text-[11px] text-muted">
            <Icon name="info" size="sm" />
            Le code reste stocké dans le foyer : ne le partagez pas en message ouvert.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
