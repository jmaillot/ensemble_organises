import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { documentFormSchema, documentKindOf, formatDocumentSize, type Document, type DocumentFormValues } from '../types';

export interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création (fichier requis), sinon édition (fichier conservé). */
  document: Document | null;
  onSave: (values: DocumentFormValues) => Promise<void>;
}

/**
 * Formulaire de document (ajout / édition). À la création, le fichier est
 * obligatoire — un document sans fichier serait un papier fantôme. À
 * l'édition, le fichier du dépôt d'origine est conservé : le champ est
 * facultatif et son libellé dit clairement ce qui se passe si on le remplit.
 */
export function DocumentDialog({ open, onOpenChange, document, onSave }: DocumentDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: { name: '', folderId: null, file: null, expiresOn: null, notes: null },
  });

  // Le nom du fichier choisi, pour confirmer la sélection avant l'envoi.
  const chosenFile = watch('file');

  useEffect(() => {
    if (!open) return;
    reset(
      document
        ? {
            name: document.name,
            folderId: document.folderId,
            file: null,
            expiresOn: document.expiresOn,
            notes: document.notes,
          }
        : { name: '', folderId: null, file: null, expiresOn: null, notes: null },
    );
  }, [open, document, reset]);

  const submit = handleSubmit(async (values) => {
    // À la création, le fichier est requis : le schéma reste compatible avec
    // l'édition (`File | null`), c'est ici que l'exigence s'énonce, avec le
    // même message que le champ — pas une erreur réseau en toast.
    if (!document && !values.file) {
      setError('file', { type: 'manual', message: 'Choisissez une photo ou un PDF.' });
      return;
    }
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
          <DialogTitle>{document ? 'Modifier le document' : 'Ajouter un document'}</DialogTitle>
          <DialogDescription>
            {document ? 'Ajustez le nom, le dossier, l’échéance ou la note.' : 'Facture, contrat, ordonnance : une photo ou un PDF.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" onSubmit={submit} noValidate>
          <Field label="Nom du document" error={errors.name?.message}>
            {(props) => <Input placeholder="Attestation 2026" autoFocus {...props} {...register('name')} />}
          </Field>
          <Field label="Dossier (optionnel)" error={errors.folderId?.message}>
            {(props) => <Input placeholder="Assurance, Santé…" {...props} {...register('folderId')} />}
          </Field>
          <Field
            label={document ? 'Remplacer le fichier (optionnel)' : 'Fichier'}
            error={errors.file?.message}
            hint={
              document?.mime
                ? `Fichier actuel : ${documentKindOf(document.mime) === 'image' ? 'image' : 'PDF'}${document.size ? ` · ${formatDocumentSize(document.size)}` : ''}`
                : undefined
            }
            optional
          >
            {(props) => (
              <div className="grid gap-1.5">
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  {...props}
                  onChange={(event) => {
                    // Un champ file natif donne une `FileList` : on extrait le
                    // `File` et on le pose dans le formulaire. Le champ est
                    // remis à vide pour permettre de re-choisir le même fichier.
                    const chosen = event.target.files?.[0];
                    event.target.value = '';
                    setValue('file', chosen ?? null, { shouldValidate: Boolean(chosen) });
                  }}
                />
                {chosenFile ? (
                  <span className="text-[11px] font-semibold text-accent-strong">
                    {chosenFile.name} · {formatDocumentSize(chosenFile.size)}
                  </span>
                ) : null}
              </div>
            )}
          </Field>
          <Field label="Échéance (optionnel)" error={errors.expiresOn?.message}>
            {(props) => <Input type="date" {...props} {...register('expiresOn')} />}
          </Field>
          <Field label="Note (optionnel)" error={errors.notes?.message}>
            {(props) => <Textarea rows={2} placeholder="Renouveler avant le 31 mars…" {...props} {...register('notes')} />}
          </Field>
          <DialogActions>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} icon="check">
              {isSubmitting ? 'Enregistrement…' : document ? 'Enregistrer' : 'Ajouter le document'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
