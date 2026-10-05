import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useHouseholdStore, useMembers } from '@/stores/household-store';
import { depositHouseholdFile } from '@/lib/storage';
import { findLikelyDuplicates, formatFrDate, parseFrDate, type Contact, type ContactFormValues, type ContactList } from '../types';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.'),
  birthDate: z
    .string()
    .trim()
    .refine((value) => value === '' || parseFrDate(value) !== null, 'Indiquez une date valide au format JJ/MM/AAAA.'),
  listId: z.string().trim().min(1, 'Choisissez une liste.'),
  linkedMemberId: z.string(),
  photoUrl: z
    .string()
    .trim()
    .refine((value) => value === '' || /^(\/|https?:\/\/|blob:)/.test(value), 'Indiquez une adresse de photo valide.'),
});

const defaultValues = (contact: Contact | null, lists: ContactList[]): ContactFormValues =>
  contact
    ? {
        name: contact.name,
        birthDate: contact.birthDate ? formatFrDate(contact.birthDate) : '',
        listId: contact.listId,
        linkedMemberId: contact.linkedMemberId ?? '',
        photoUrl: contact.photoUrl ?? '',
      }
    : { name: '', birthDate: '', listId: lists[0]?.id ?? '', linkedMemberId: '', photoUrl: '' };

export interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  lists: ContactList[];
  existingContacts: Contact[];
  isSaving?: boolean;
  onSubmit: (values: ContactFormValues) => Promise<void> | void;
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  lists,
  existingContacts,
  isSaving = false,
  onSubmit,
}: ContactFormDialogProps) {
  const members = useMembers();
  const householdId = useHouseholdStore((state) => state.householdId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: defaultValues(contact, lists),
  });
  const errors = formState.errors;
  const name = watch('name') ?? '';
  const birthDateInput = watch('birthDate') ?? '';
  const photoUrl = watch('photoUrl') ?? '';
  const listId = watch('listId') ?? '';

  useEffect(() => {
    if (!open) return;
    reset(defaultValues(contact, lists));
    setUploadError(null);
    // L'identifiant de la fiche éditée identifie une ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id]);

  // La liste par défaut dépend des listes chargées en asynchrone : si le
  // dialogue s'ouvre avant leur arrivée, la sélection est posée dès
  // qu'elles sont là, sans jamais écraser un choix explicite.
  useEffect(() => {
    if (open && !contact && listId === '' && lists.length > 0) {
      setValue('listId', lists[0].id);
    }
  }, [open, contact, listId, lists, setValue]);

  // Avertissement doublon probable (D-04) : non bloquant, la soumission
  // reste autorisée — les homonymes réels sont possibles.
  const duplicates = findLikelyDuplicates(
    { name, birthDate: parseFrDate(birthDateInput) },
    existingContacts,
    contact?.id ?? null,
  );

  const handlePhotoFile = async (file: File | undefined) => {
    if (!file || !householdId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const deposited = await depositHouseholdFile({ householdId, folder: 'contacts', file });
      setValue('photoUrl', deposited.url, { shouldDirty: true });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'La photo n’a pas pu être déposée.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Contacts</p>
          <DialogTitle>{contact ? 'Modifier la fiche' : 'Ajouter un contact'}</DialogTitle>
          <DialogDescription>
            Un nom, une liste, et une date pour ne jamais oublier son anniversaire.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="grid gap-3.5"
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Ex. Léa Moreau" autoComplete="off" />}
          </Field>

          <Field label="Liste" error={errors.listId?.message}>
            {(props) => (
              <Select {...props} {...register('listId')}>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.isShared ? 'Famille (partagée)' : list.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Date de naissance"
            optional
            hint="Au format JJ/MM/AAAA. Laisser vide pour une fiche sans date."
            error={errors.birthDate?.message}
          >
            {(props) => (
              <Input
                {...props}
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                placeholder="JJ/MM/AAAA"
                {...register('birthDate')}
              />
            )}
          </Field>

          {duplicates.length > 0 ? (
            <p role="status" className="m-0 rounded-[11px] border border-coral/25 bg-coral-soft px-3.5 py-3 text-xs text-fg">
              <strong className="font-extrabold">Doublon probable :</strong>{' '}
              {duplicates.map((entry) => entry.name).join(', ')} — les homonymes existent, vous pouvez quand même
              enregistrer.
            </p>
          ) : null}

          <details className="rounded-[11px] border border-border px-3.5 py-3">
            <summary className="cursor-pointer text-xs font-extrabold text-fg">
              Photo et membre lié <span className="font-normal text-muted">(optionnel)</span>
            </summary>
            <div className="mt-3 grid gap-3.5">
              <Field label="Photo" optional error={errors.photoUrl?.message ?? uploadError ?? undefined}>
                {(props) => (
                  <div className="grid gap-2">
                    <Input {...props} {...register('photoUrl')} placeholder="https://… ou déposez un fichier" />
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-bg px-3.5 text-xs font-extrabold text-fg">
                      {uploading ? 'Dépôt en cours…' : 'Choisir une photo'}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={uploading}
                        onChange={(event) => void handlePhotoFile(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                )}
              </Field>

              {photoUrl.trim() !== '' ? (
                <img
                  src={photoUrl.trim()}
                  alt="Aperçu de la photo"
                  className="h-24 w-full rounded-[11px] border border-border object-cover"
                />
              ) : null}

              <Field label="Membre du foyer" optional error={errors.linkedMemberId?.message}>
                {(props) => (
                  <Select {...props} {...register('linkedMemberId')}>
                    <option value="">Aucun membre associé</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.display_name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </details>

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isSaving || uploading}>
              {contact ? 'Enregistrer les modifications' : 'Ajouter le contact'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
