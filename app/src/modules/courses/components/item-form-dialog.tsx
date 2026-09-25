import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { RAYONS, NEW_LIST_OPTION, type ItemFormValues, type ShoppingListView } from '../types';

/** Libellés du dialogue repris de l'export de design. */
const ITEM_DIALOG_COPY = {
  eyebrow: 'Courses',
  title: 'Ajouter un article',
  intro: 'Ajoutez-le à une liste partagée par le foyer.',
  submit: 'Ajouter l’article',
} as const;

const schema = z
  .object({
    name: z.string().trim().min(2, 'Indiquez l’article à acheter.').max(80, '80 caractères maximum.'),
    quantity: z
      .string()
      .trim()
      .refine((value) => value === '' || /^\d+([.,]\d+)?$/.test(value), 'Saisissez un nombre positif.'),
    unit: z.string().trim().max(20, '20 caractères maximum.'),
    rayon: z.enum(RAYONS),
    listId: z.string().min(1, 'Choisissez une liste.'),
    newListName: z.string().trim().max(60, '60 caractères maximum.'),
  })
  .superRefine((values, context) => {
    if (values.listId === NEW_LIST_OPTION && values.newListName.trim().length < 2) {
      context.addIssue({
        code: 'custom',
        path: ['newListName'],
        message: 'Donnez un nom à la nouvelle liste.',
      });
    }
  });

/** Valeurs initiales : la première liste du foyer, ou la création à la volée. */
const emptyValues = (lists: ShoppingListView[]): ItemFormValues => ({
  name: '',
  quantity: '',
  unit: '',
  rayon: 'Divers',
  listId: lists[0]?.id ?? NEW_LIST_OPTION,
  newListName: '',
});

export interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: ShoppingListView[];
  /** Nom du membre courant, rappelé en lecture dans le champ « Ajouté par ». */
  currentMemberName: string;
  isMutating?: boolean;
  onSubmit: (values: ItemFormValues) => Promise<void> | void;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  lists,
  currentMemberName,
  isMutating = false,
  onSubmit,
}: ItemFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(lists),
  });

  const listId = watch('listId');
  const wasOpen = useRef(false);

  // Le formulaire n'est réinitialisé qu'à l'ouverture : une arrivée tardive des
  // listes ne doit jamais effacer une saisie en cours.
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      reset(emptyValues(lists));
    }
    if (!open) wasOpen.current = false;
  }, [lists, open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">{ITEM_DIALOG_COPY.eyebrow}</p>
          <DialogTitle>{ITEM_DIALOG_COPY.title}</DialogTitle>
          <DialogDescription>{ITEM_DIALOG_COPY.intro}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3.5"
          noValidate
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Article" error={errors.name?.message}>
            {(props) => <Input placeholder="Ex. Lait d’agne" {...props} {...register('name')} />}
          </Field>

          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Quantité" optional error={errors.quantity?.message}>
              {(props) => (
                <Input type="text" inputMode="decimal" placeholder="Ex. 3" {...props} {...register('quantity')} />
              )}
            </Field>
            <Field label="Unité" optional error={errors.unit?.message}>
              {(props) => <Input placeholder="Ex. briques" {...props} {...register('unit')} />}
            </Field>
          </div>

          <Field label="Rayon" error={errors.rayon?.message}>
            {(props) => (
              <Select {...props} {...register('rayon')}>
                {RAYONS.map((rayon) => (
                  <option key={rayon} value={rayon}>
                    {rayon}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Liste"
            error={errors.listId?.message}
            hint={listId === NEW_LIST_OPTION ? 'La liste sera créée en même temps que l’article.' : undefined}
          >
            {(props) => (
              <Select {...props} {...register('listId')}>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
                <option value={NEW_LIST_OPTION}>Nouvelle liste</option>
              </Select>
            )}
          </Field>

          {listId === NEW_LIST_OPTION ? (
            <Field label="Nom de la nouvelle liste" error={errors.newListName?.message}>
              {(props) => <Input placeholder="Ex. Épicerie du mois" {...props} {...register('newListName')} />}
            </Field>
          ) : null}

          {/* Membre courant : information en lecture, pas un champ éditable. */}
          <div className="grid gap-1.5">
            <label htmlFor="item-added-by" className="text-[11px] font-extrabold text-muted">
              Ajouté par
            </label>
            <Input id="item-added-by" readOnly value={currentMemberName} className="bg-bg" />
          </div>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSubmitting || isMutating}>
              {isSubmitting || isMutating ? 'Ajout…' : ITEM_DIALOG_COPY.submit}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
