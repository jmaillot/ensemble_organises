import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { formatBytes, isImageMime } from '@/lib/storage';
import {
  NOTE_CATEGORIES,
  OTHER_CATEGORY,
  noteVisibilityOptions,
  type Note,
  type NoteAttachment,
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
    folderId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.category === OTHER_CATEGORY && values.customCategory.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['customCategory'], message: 'Nommez votre catégorie.' });
    }
  });

const isKnownCategory = (category: string): category is (typeof NOTE_CATEGORIES)[number] =>
  (NOTE_CATEGORIES as readonly string[]).includes(category);

function defaultValues(note: Note | null, initialFolderId: string | null = null): NoteFormValues {
  if (!note) {
    return { title: '', category: 'Maison', customCategory: '', content: '', visibility: 'privee', folderId: initialFolderId ?? '' };
  }
  const category: NoteCategoryChoice = isKnownCategory(note.category) ? note.category : OTHER_CATEGORY;
  return {
    title: note.title,
    category,
    customCategory: isKnownCategory(note.category) ? '' : note.category,
    content: note.content,
    visibility: note.visibility,
    folderId: note.folderId ?? '',
  };
}

export interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
  /** Dossier pré-rempli à la création (onglet courant). */
  initialFolderId?: string | null;
  folders?: { id: string; name: string }[];
  isSaving?: boolean;
  onSubmit: (values: NoteFormValues, files: File[], removedAttachmentIds: string[]) => Promise<void> | void;
}

/** Création et modification d'une note du foyer, pièces jointes comprises. */
export function NoteFormDialog({ open, onOpenChange, note, initialFolderId = null, folders = [], isSaving = false, onSubmit }: NoteFormDialogProps) {
  const { register, handleSubmit, reset, watch, formState } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    mode: 'onSubmit',
  });
  const errors = formState.errors;
  const category = watch('category');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(note, initialFolderId));
    setNewFiles([]);
    setRemovedIds([]);
    // `note` identifie une ouverture : le formulaire n'est pas réinitialisé à
    // chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note?.id, initialFolderId]);

  const existing: NoteAttachment[] = (note?.attachments ?? []).filter(
    (attachment) => !removedIds.includes(attachment.id),
  );

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setNewFiles((current) => [...current, ...files]);
  };

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
            await onSubmit(values, newFiles, removedIds);
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

          {folders.length > 0 ? (
            <Field label="Dossier" optional error={errors.folderId?.message}>
              {(props) => (
                <Select {...props} {...register('folderId')}>
                  <option value="">Général</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

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

          <Field label="Pièces jointes" optional hint="Photos et PDF, comme pour le Cercle.">
            {(props) => (
              <div className="grid gap-2" {...props}>
                {existing.length > 0 ? (
                  <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Fichiers déjà joints">
                    {existing.map((attachment) => (
                      <li key={attachment.id} className="flex items-center gap-2 rounded-[9px] bg-bg px-2.5 py-2">
                        {isImageMime(attachment.mime) ? (
                          <img
                            src={attachment.url}
                            alt={`Aperçu de ${attachment.fileName}`}
                            className="size-8 shrink-0 rounded-[7px] border border-border object-cover"
                          />
                        ) : (
                          <span className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-surface text-muted">
                            <Icon name="receipt" size="sm" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs">{attachment.fileName}</span>
                        <button
                          type="button"
                          onClick={() => setRemovedIds((current) => [...current, attachment.id])}
                          className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
                          aria-label={`Retirer ${attachment.fileName}`}
                        >
                          <Icon name="close" size="sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {newFiles.length > 0 ? (
                  <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Nouveaux fichiers">
                    {newFiles.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-2 rounded-[9px] bg-bg px-2.5 py-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-border bg-surface text-muted">
                          <Icon name={file.type.startsWith('image/') ? 'image' : 'receipt'} size="sm" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs">
                          {file.name} <span className="text-muted">· {formatBytes(file.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewFiles((current) => current.filter((_, i) => i !== index))}
                          className="grid size-8 shrink-0 place-items-center rounded-[9px] text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral"
                          aria-label={`Retirer ${file.name}`}
                        >
                          <Icon name="close" size="sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <label className="inline-flex min-h-9 w-fit cursor-pointer items-center gap-2 rounded-[10px] border border-border bg-surface px-[11px] text-[12px] font-[760] text-fg transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint">
                  <Icon name="plus" size="sm" />
                  Joindre des fichiers
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      addFiles([...(event.target.files ?? [])]);
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
              {note ? 'Enregistrer les modifications' : 'Créer la note'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
