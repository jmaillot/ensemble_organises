import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { documentFolderColorClasses, documentFolderColorLabels, documentFolderColors, documentFolderFormSchema, type DocumentFolder, type DocumentFolderFormValues } from '../types';

export interface DocumentFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création, sinon édition du dossier. */
  folder: DocumentFolder | null;
  onSave: (values: DocumentFolderFormValues) => Promise<void>;
}

const emptyValues: DocumentFolderFormValues = {
  name: '',
  color: 'sage',
};

/**
 * Formulaire de dossier coloré (ajout / édition). La teinte est choisie dans
 * la palette fermée de l'interface (`documentFolderColors`) : la colonne
 * `color` porte ce que l'écran peint, jamais une couleur libre.
 */
export function DocumentFolderDialog({ open, onOpenChange, folder, onSave }: DocumentFolderDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DocumentFolderFormValues>({
    resolver: zodResolver(documentFolderFormSchema),
    defaultValues: emptyValues,
  });

  const selectedColor = watch('color');

  useEffect(() => {
    if (!open) return;
    reset(folder ? { name: folder.name, color: folder.color } : emptyValues);
  }, [open, folder, reset]);

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
          <DialogTitle>{folder ? 'Modifier le dossier' : 'Nouveau dossier'}</DialogTitle>
          <DialogDescription>
            {folder ? 'Ajustez le nom ou la teinte du dossier.' : 'Un dossier par thème : assurance, santé, école…'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" onSubmit={submit} noValidate>
          <Field label="Nom du dossier" error={errors.name?.message}>
            {(props) => <Input placeholder="Assurance" autoFocus {...props} {...register('name')} />}
          </Field>
          <Field label="Teinte" error={errors.color?.message}>
            {(props) => (
              <div {...props} className="flex flex-wrap gap-2" role="radiogroup" aria-label="Teinte du dossier">
                {documentFolderColors.map((color) => (
                  <label
                    key={color}
                    className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-[14px] border border-border bg-surface px-3 py-2 text-[12px] font-semibold text-fg transition-colors has-checked:border-accent has-checked:bg-accent-faint"
                  >
                    <input type="radio" value={color} className="sr-only" {...register('color')} />
                    <span
                      className={cn('size-4 rounded-full ring-1 ring-border', documentFolderColorClasses[color], selectedColor === color && 'ring-accent ring-2')}
                      aria-hidden="true"
                    />
                    {documentFolderColorLabels[color]}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} icon="check">
              {isSubmitting ? 'Enregistrement…' : folder ? 'Enregistrer' : 'Créer le dossier'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
