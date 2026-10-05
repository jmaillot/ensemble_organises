import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { RAYONS, NEW_LIST_OPTION, type ItemFormValues, type ShoppingListView } from '../types';
import { offCategoriesToRayon } from '../off-rayon';
import { searchOffProducts, type OffSearchHit } from '../off-client';

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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ItemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(lists),
  });

  const listId = watch('listId');
  const articleName = watch('name') ?? '';
  const wasOpen = useRef(false);

  // Recherche Open Food Facts : un tap explicite (10 req/min côté recherche),
  // jamais d'autocomplete. Remplit le rayon + montre la photo (affichage seul :
  // les articles n'ont pas de photo persistée).
  const [searchState, setSearchState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; hits: OffSearchHit[] }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [searchPhoto, setSearchPhoto] = useState<{ url: string; label: string } | null>(null);

  const runSearch = () => {
    const terms = articleName.trim();
    if (terms.length < 2 || searchState.status === 'loading') return;
    setSearchState({ status: 'loading' });
    setSearchPhoto(null);
    void searchOffProducts(terms)
      .then((hits) => setSearchState({ status: 'done', hits }))
      .catch((searchError: unknown) =>
        setSearchState({
          status: 'error',
          message: searchError instanceof Error ? searchError.message : 'Recherche impossible.',
        }),
      );
  };

  const pickHit = (hit: OffSearchHit) => {
    setValue('rayon', offCategoriesToRayon(hit.categoriesTags), { shouldValidate: true });
    setSearchPhoto(hit.imageUrl ? { url: hit.imageUrl, label: hit.name } : null);
    setSearchState({ status: 'idle' });
  };

  // Le formulaire n'est réinitialisé qu'à l'ouverture : une arrivée tardive des
  // listes ne doit jamais effacer une saisie en cours.
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      reset(emptyValues(lists));
      setSearchState({ status: 'idle' });
      setSearchPhoto(null);
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
          <div>
            <Button
              variant="secondary"
              onClick={runSearch}
              disabled={searchState.status === 'loading' || articleName.trim().length < 2}
            >
              {searchState.status === 'loading' ? 'Recherche…' : 'Rechercher photo et rayon'}
            </Button>
            <p className="m-0 mt-1.5 text-[10px] text-muted">
              Open Food Facts : remplit le rayon et montre la photo.
            </p>
          </div>
          {searchState.status === 'error' ? (
            <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
              {searchState.message} Réessayez ou remplissez manuellement.
            </p>
          ) : null}
          {searchState.status === 'done' ? (
            searchState.hits.length === 0 ? (
              <p className="m-0 text-[11px] text-muted">Aucun résultat : nommez et rangez l’article manuellement.</p>
            ) : (
              <ul className="grid gap-2">
                {searchState.hits.map((hit) => (
                  <li key={`${hit.ean}-${hit.name}`}>
                    <button
                      type="button"
                      onClick={() => pickHit(hit)}
                      className="flex w-full items-center gap-2.5 rounded-[11px] border border-border px-3 py-2.5 text-left transition-colors hover:border-accent"
                    >
                      {hit.imageUrl ? (
                        <img src={hit.imageUrl} alt="" aria-hidden="true" className="size-9 shrink-0 rounded-[7px] object-cover" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-[13px]">{hit.name}</strong>
                        {hit.brand ? <small className="text-[11px] text-muted">{hit.brand}</small> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {searchPhoto ? (
            <figure className="m-0 overflow-hidden rounded-[14px] border border-border">
              <img src={searchPhoto.url} alt={`Photo ${searchPhoto.label} (Open Food Facts)`} className="max-h-44 w-full object-cover" />
              <figcaption className="bg-bg px-3 py-1.5 text-[10px] text-muted">
                Illustration Open Food Facts — affichée seulement, non enregistrée.
              </figcaption>
            </figure>
          ) : null}

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
