import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { pantryCategories, pantryCategoryLabels, pantryFormSchema, pantryLocationLabels, pantryLocations, type PantryFormValues, type PantryItem, type PantryLocation } from '../types';

export interface PantryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création, sinon édition de l'article. */
  item: PantryItem | null;
  defaultLocation: PantryLocation;
  onSave: (values: PantryFormValues) => Promise<void>;
}

const emptyValues: PantryFormValues = {
  name: '',
  category: 'produit_frais',
  quantity: '1',
  unit: '',
  location: 'frigo',
  expiresOn: '',
  openedOn: '',
  notes: '',
};

/**
 * Formulaire d'article du frigo (ajout / édition). La validation est portée
 * par le schéma Zod partagé avec l'écriture en base ; les dates passent par
 * des champs `date` natifs (ISO), les listes fermées par des `Select`.
 */
export function PantryDialog({ open, onOpenChange, item, defaultLocation, onSave }: PantryDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PantryFormValues>({
    resolver: zodResolver(pantryFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      item
        ? {
            name: item.name,
            category: item.category,
            quantity: String(item.quantity),
            unit: item.unit ?? '',
            location: item.location,
            expiresOn: item.expiresOn ?? '',
            openedOn: item.openedOn ?? '',
            notes: item.notes ?? '',
          }
        : { ...emptyValues, location: defaultLocation },
    );
  }, [open, item, defaultLocation, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSave(values);
      onOpenChange(false);
    } catch {
      // L'échec a été signalé par le parent (toast) : le dialogue reste
      // ouvert, la saisie est conservée.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Modifier l’article' : 'Ajouter un article'}</DialogTitle>
          <DialogDescription>
            {item ? 'Ajustez la quantité, l’emplacement ou la date de péremption.' : 'Ce que vous mettez au frais, au congélateur ou au placard.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" onSubmit={submit} noValidate>
          <Field label="Article" error={errors.name?.message}>
            {(props) => <Input placeholder="Yaourts nature" autoFocus {...props} {...register('name')} />}
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Catégorie" error={errors.category?.message}>
              {(props) => (
                <Select {...props} {...register('category')}>
                  {pantryCategories.map((value) => (
                    <option key={value} value={value}>
                      {pantryCategoryLabels[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Emplacement" error={errors.location?.message}>
              {(props) => (
                <Select {...props} {...register('location')}>
                  {pantryLocations.map((value) => (
                    <option key={value} value={value}>
                      {pantryLocationLabels[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Quantité" error={errors.quantity?.message}>
              {(props) => <Input type="number" step="0.5" min="0" {...props} {...register('quantity')} />}
            </Field>
            <Field label="Unité (optionnel)" error={errors.unit?.message}>
              {(props) => <Input placeholder="pots, kg…" {...props} {...register('unit')} />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Péremption (optionnel)" error={errors.expiresOn?.message}>
              {(props) => <Input type="date" {...props} {...register('expiresOn')} />}
            </Field>
            <Field label="Ouvert le (optionnel)" error={errors.openedOn?.message}>
              {(props) => <Input type="date" {...props} {...register('openedOn')} />}
            </Field>
          </div>
          <Field label="Note (optionnel)" error={errors.notes?.message}>
            {(props) => <Textarea rows={2} placeholder="Marque, rangement, rappel…" {...props} {...register('notes')} />}
          </Field>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} icon="check">
              {isSubmitting ? 'Enregistrement…' : item ? 'Enregistrer' : 'Ajouter au frigo'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
