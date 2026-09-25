import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import {
  NOTE_CATEGORIES,
  OTHER_CATEGORY,
  noteVisibilityOptions,
  type Note,
  type NoteCategoryChoice,
  type NoteFormValues,
} from '../types';

const noteSchema = z
  .object({
    title: z.string().trim().min(2, 'Donnez un titre à votre note.').max(80, '80 caractères maximum.'),
    category: z.enum([...NOTE_CATEGORIES, OTHER_CATEGORY]),
    customCategory: z.string().trim().max(40, '40 caractères maximum.'),
    content: z.string().trim().min(2, 'Écrivez ce qu’il ne faut pas oublier.').max(2000, '2000 caractères maximum.'),
    visibility: z.enum(['privee', 'foyer']),
  })
  .superRefine((values, ctx) => {
    if (values.category === OTHER_CATEGORY && values.customCategory.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['customCategory'], message: 'Nommez votre catégorie.' });
    }
  });

const isKnownCategory = (category: string): category is (typeof NOTE_CATEGORIES)[number] =>
  (NOTE_CATEGORIES as readonly string[]).includes(category);

function defaultValues(note: Note | null): NoteFormValues {
  if (!note) {
    return { title: '', category: 'Maison', customCategory: '', content: '', visibility: 'privee' };
  }
  const category: NoteCategoryChoice = isKnownCategory(note.category) ? note.category : OTHER_CATEGORY;
  return {
    title: note.title,
    category,
    customCategory: isKnownCategory(note.category) ? '' : note.category,
    content: note.content,
    visibility: note.visibility,
  };
}

export interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
  isSaving?: boolean;
  onSubmit: (values: NoteFormValues) => Promise<void> | void;
}

/** Création et modification d'une note du foyer. */
export function NoteFormDialog({ open, onOpenChange, note, isSaving = false, onSubmit }: NoteFormDialogProps) {
  const { register, handleSubmit, reset, watch, formState } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    mode: 'onSubmit',
  });
  const errors = formState.errors;
  const category = watch('category');

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(note));
    // `note` identifie une ouverture : le formulaire n'est pas réinitialisé à
    // chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <p className="eyebrow mb-2">Notes</p>
          <DialogTitle>{note ? 'Modifier la note' : 'Créer une note'}</DialogTitle>
          <DialogDescription>
            Une idée, une information ou une mémoire à garder. Une note peut rester privée ou devenir un point de
            repère partagé.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Titre" error={errors.title?.message}>
            {(props) => (
              <Input
                {...props}
                {...register('title')}
                placeholder="Ex. Liste de rentrée"
                autoComplete="off"
              />
            )}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Catégorie" error={errors.category?.message}>
              {(props) => (
                <Select {...props} {...register('category')}>
                  {NOTE_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value={OTHER_CATEGORY}>Autre catégorie…</option>
                </Select>
              )}
            </Field>

            <Field label="Visibilité" error={errors.visibility?.message}>
              {(props) => (
                <Select {...props} {...register('visibility')}>
                  {noteVisibilityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {category === OTHER_CATEGORY ? (
            <Field label="Nom de la catégorie" error={errors.customCategory?.message}>
              {(props) => (
                <Input
                  {...props}
                  {...register('customCategory')}
                  placeholder="Ex. Vacances"
                  autoComplete="off"
                />
              )}
            </Field>
          ) : null}

          <Field label="Contenu" error={errors.content?.message}>
            {(props) => (
              <Textarea
                {...props}
                {...register('content')}
                rows={6}
                placeholder="Cartables, crayons, gourdes et un goûter pour le premier jour."
              />
            )}
          </Field>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving}>
              {note ? 'Enregistrer les modifications' : 'Créer la note'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
