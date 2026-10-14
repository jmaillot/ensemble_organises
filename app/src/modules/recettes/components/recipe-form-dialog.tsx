import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { DEFAULT_RECIPE_CATEGORY, type Recipe, type RecipeFormValues } from '../types';

const NEW_CATEGORY_VALUE = '__nouvelle__';

const intInRange = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((raw) => raw === '' || /^\d+$/.test(raw), { message: 'Nombre invalide.' })
    .refine((raw) => raw === '' || (Number(raw) >= min && Number(raw) <= max), { message });

const recipeSchema = z.object({
  title: z.string().trim().min(1, 'Donnez un nom à votre recette.').max(200, '200 caractères maximum.'),
  categoryId: z.string(),
  newCategoryName: z.string().trim().max(200, '200 caractères maximum.'),
  servings: intInRange(1, 48, 'Entre 1 et 48 personnes.').refine((raw) => raw !== '', {
    message: 'Indiquez le nombre de personnes.',
  }),
  prepHours: intInRange(0, 168, 'Heures invalides.'),
  prepMins: intInRange(0, 59, 'Minutes invalides.'),
  cookHours: intInRange(0, 168, 'Heures invalides.'),
  cookMins: intInRange(0, 59, 'Minutes invalides.'),
  tags: z.array(z.string()),
  coverFile: z.instanceof(File).nullable(),
  existingCover: z.string().nullable(),
}).superRefine((values, ctx) => {
  if (values.categoryId === NEW_CATEGORY_VALUE && values.newCategoryName.trim() === '') {
    ctx.addIssue({ code: 'custom', path: ['newCategoryName'], message: 'Nommez votre catégorie.' });
  }
});

type RecipeSchemaValues = z.infer<typeof recipeSchema>;

function defaultValues(
  recipe: Recipe | null,
  categories: { id: string; name: string }[],
): RecipeSchemaValues {
  const categoryId = recipe?.categoryId ?? categories.find((category) => category.name === DEFAULT_RECIPE_CATEGORY)?.id ?? categories[0]?.id ?? '';
  const split = (total: number | null) => (total == null ? { hours: '', mins: '' } : { hours: String(Math.floor(total / 60)), mins: String(total % 60) });
  const prep = split(recipe?.prepMinutes ?? null);
  const cook = split(recipe?.cookMinutes ?? null);
  return {
    title: recipe?.title ?? '',
    categoryId,
    newCategoryName: '',
    servings: String(recipe?.servings ?? 4),
    prepHours: prep.hours,
    prepMins: prep.mins,
    cookHours: cook.hours,
    cookMins: cook.mins,
    tags: recipe?.tags ?? [],
    coverFile: null,
    existingCover: recipe?.coverPhoto ?? null,
  };
}

const toNullableInt = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

function toFormValues(values: RecipeSchemaValues): RecipeFormValues {
  return {
    title: values.title,
    categoryId: values.categoryId,
    newCategoryName: values.newCategoryName,
    servings: Number(values.servings),
    prepHours: toNullableInt(values.prepHours),
    prepMins: toNullableInt(values.prepMins),
    cookHours: toNullableInt(values.cookHours),
    cookMins: toNullableInt(values.cookMins),
    tags: values.tags,
    coverFile: values.coverFile,
    existingCover: values.existingCover,
  };
}

export interface RecipeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe | null;
  categories: { id: string; name: string }[];
  /** Tous les tags du foyer (pastilles + frappe libre, D-09). */
  allTags: string[];
  isSaving?: boolean;
  onSubmit: (values: RecipeFormValues) => Promise<void> | void;
}

/** Creation et modification d'une recette (7 champs, R3/D-05/D-08/D-09). */
export function RecipeFormDialog({ open, onOpenChange, recipe, categories, allTags, isSaving = false, onSubmit }: RecipeFormDialogProps) {
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<RecipeSchemaValues>({
    resolver: zodResolver(recipeSchema),
    mode: 'onSubmit',
  });
  const errors = formState.errors;
  const categoryId = watch('categoryId');
  const selectedTags = watch('tags') ?? [];
  const [tagDraft, setTagDraft] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(recipe, categories));
    setTagDraft('');
    setCoverPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipe?.id]);

  useEffect(() => {
    const file = watch('coverFile');
    if (!file) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('coverFile')]);

  const toggleTag = (name: string) => {
    const current = selectedTags;
    setValue('tags', current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name], {
      shouldDirty: true,
    });
  };

  const addTagDraft = () => {
    const name = tagDraft.trim().replace(/^#+/, '');
    if (name === '' || selectedTags.some((tag) => tag.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'))) {
      setTagDraft('');
      return;
    }
    setValue('tags', [...selectedTags, name], { shouldDirty: true });
    setTagDraft('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="eyebrow mb-2">Recettes</p>
          <DialogTitle>{recipe ? 'Modifier la recette' : 'Créer une recette'}</DialogTitle>
          <DialogDescription>Nom, catégorie, tags, personnes de référence et temps — le reste se remplit dans la fiche.</DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(toFormValues(values));
          })}
        >
          <Field label="Nom" error={errors.title?.message}>
            {(props) => <Input {...props} {...register('title')} placeholder="Ex. Gratin dauphinois" autoComplete="off" />}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Catégorie" error={errors.categoryId?.message}>
              {(props) => (
                <Select {...props} {...register('categoryId')}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY_VALUE}>+ Nouvelle catégorie…</option>
                </Select>
              )}
            </Field>

            <Field label="Personnes (référence)" error={errors.servings?.message}>
              {(props) => (
                <Input {...props} {...register('servings')} type="number" min={1} max={48} inputMode="numeric" />
              )}
            </Field>
          </div>

          {categoryId === NEW_CATEGORY_VALUE ? (
            <Field label="Nom de la catégorie" error={errors.newCategoryName?.message}>
              {(props) => (
                <Input
                  {...props}
                  value={watch('newCategoryName')}
                  onChange={(event) => {
                    setValue('categoryId', NEW_CATEGORY_VALUE);
                    setValue('newCategoryName', event.target.value, { shouldDirty: true });
                  }}
                  placeholder="Ex. Desserts"
                  autoComplete="off"
                />
              )}
            </Field>
          ) : null}

          <div className="grid gap-3.5 sm:grid-cols-2">
            <fieldset className="m-0 grid grid-cols-2 gap-2 border-0 p-0">
              <legend className="pb-1 text-[11px] font-[700] text-muted">Préparation (optionnel)</legend>
              <Input {...register('prepHours')} type="number" min={0} max={168} placeholder="Heures" aria-label="Heures de préparation" />
              <Input {...register('prepMins')} type="number" min={0} max={59} placeholder="Minutes" aria-label="Minutes de préparation" />
            </fieldset>
            <fieldset className="m-0 grid grid-cols-2 gap-2 border-0 p-0">
              <legend className="pb-1 text-[11px] font-[700] text-muted">Cuisson (optionnel)</legend>
              <Input {...register('cookHours')} type="number" min={0} max={168} placeholder="Heures" aria-label="Heures de cuisson" />
              <Input {...register('cookMins')} type="number" min={0} max={59} placeholder="Minutes" aria-label="Minutes de cuisson" />
            </fieldset>
          </div>

          <Field label="Étiquettes" optional hint="La frappe libre crée l’étiquette.">
            {(props) => (
              <div className="grid gap-2" {...props}>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Étiquettes choisies">
                  {selectedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-pressed="true"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[12px] font-[760] text-accent-strong"
                    >
                      #{tag}
                      <Icon name="close" size="sm" />
                    </button>
                  ))}
                  {allTags
                    .filter((tag) => !selectedTags.includes(tag))
                    .slice(0, 14)
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        aria-pressed="false"
                        className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-2.5 text-[12px] font-[600] text-muted hover:text-fg"
                      >
                        #{tag}
                      </button>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTagDraft();
                      }
                    }}
                    placeholder="Nouvelle étiquette…"
                    aria-label="Nouvelle étiquette"
                    autoComplete="off"
                  />
                  <Button type="button" variant="secondary" icon="plus" onClick={addTagDraft}>
                    Ajouter
                  </Button>
                </div>
              </div>
            )}
          </Field>

          <Field label="Photo de couverture" optional>
            {(props) => (
              <div className="grid gap-2" {...props}>
                {coverPreview ? (
                  <img src={coverPreview} alt="Aperçu de la couverture" className="h-24 w-full rounded-[11px] object-cover" />
                ) : null}
                <label className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-[11px] text-[12px] font-[760] text-fg hover:border-accent hover:bg-accent-faint">
                  <Icon name="plus" size="sm" />
                  {coverPreview ? 'Changer de photo' : 'Choisir une photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setValue('coverFile', file, { shouldDirty: true });
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {recipe ? 'Enregistrer les modifications' : 'Créer la recette'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { NEW_CATEGORY_VALUE };
