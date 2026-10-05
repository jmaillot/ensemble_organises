import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import type { ContactRow } from '@/types';
import { ideaStatusLabel, roundPrice, type GiftIdea, type GiftIdeaStatus, type NewGiftIdeaInput } from '../types';

const urlPattern = /^https?:\/\/\S+$/i;

/** Statuts verrouillés à l'octet près (OQ-3) : les mêmes littéraux que les schémas. */
const schema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom à cette idée.').max(200, '200 caractères maximum.'),
  price: z.string().trim().refine((value) => value === '' || parsePrice(value) >= 0, 'Prix positif attendu.'),
  url: z.string().trim().refine((value) => value === '' || urlPattern.test(value), 'Lien invalide.'),
  comment: z.string().trim().max(280, '280 caractères maximum.'),
  gifteeText: z.string().trim().max(120, '120 caractères maximum.'),
  gifteeContactId: z.string(),
  status: z.enum(['a_offrir', 'offert']),
});

type FormValues = z.infer<typeof schema>;

const parsePrice = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface GiftIdeaFormResult {
  values: NewGiftIdeaInput;
  /** Fichier déposé par la page à l'enregistrement (`depositHouseholdFile`, dossier `cadeaux`). */
  photoFile: File | null;
  photoRemoved: boolean;
}

export interface GiftIdeaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: ContactRow[];
  /** Idée en cours d'édition, `null` pour une création. */
  idea?: GiftIdea | null;
  onSubmit: (result: GiftIdeaFormResult) => void;
  isPending?: boolean;
}

export function GiftIdeaFormDialog({
  open,
  onOpenChange,
  contacts,
  idea = null,
  onSubmit,
  isPending = false,
}: GiftIdeaFormDialogProps) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', price: '', url: '', comment: '', gifteeText: '', gifteeContactId: '', status: 'a_offrir' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: idea?.name ?? '',
      price: idea?.price === null || idea?.price === undefined ? '' : String(idea.price),
      url: idea?.url ?? '',
      comment: idea?.comment ?? '',
      gifteeText: idea?.gifteeText ?? '',
      gifteeContactId: idea?.gifteeContactId ?? '',
      status: idea?.status ?? 'a_offrir',
    });
    setPhotoFile(null);
    setPhotoRemoved(false);
    setPreviewUrl(null);
  }, [idea, open, reset]);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const displayedPhoto = previewUrl ?? (photoRemoved ? null : (idea?.photoUrl ?? null));

  const submit = (values: FormValues) => {
    onSubmit({
      values: {
        name: values.name,
        price: values.price === '' ? null : roundPrice(parsePrice(values.price)),
        url: values.url === '' ? null : values.url,
        comment: values.comment === '' ? null : values.comment,
        photoUrl: photoRemoved ? null : (idea?.photoUrl ?? null),
        status: values.status as GiftIdeaStatus,
        gifteeText: values.gifteeText === '' ? null : values.gifteeText,
        gifteeContactId: values.gifteeContactId === '' ? null : values.gifteeContactId,
      },
      photoFile,
      photoRemoved,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Cadeaux</p>
          <DialogTitle>{idea ? 'Modifier l’idée' : 'Ajouter une idée cadeau'}</DialogTitle>
          <DialogDescription>
            Une idée notée ici reste une idée : ajoutez-la à une liste quand elle devient un vrai cadeau.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <Field label="Nom de l’idée" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Ex. Stage de poterie" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Pour qui" error={errors.gifteeText?.message} optional hint="Texte libre, visible par le foyer">
              {(props) => <Input {...props} {...register('gifteeText')} placeholder="Ex. Maya" />}
            </Field>
            <Field label="Contact lié" error={errors.gifteeContactId?.message} optional hint="Porte la date et la surprise">
              {(props) => (
                <Select {...props} {...register('gifteeContactId')}>
                  <option value="">Aucun</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Prix" error={errors.price?.message} optional>
              {(props) => <Input {...props} type="number" step="0.01" min="0" inputMode="decimal" placeholder="45" {...register('price')} />}
            </Field>
            <Field label="Statut" error={errors.status?.message}>
              {(props) => (
                <Select {...props} {...register('status')}>
                  <option value="a_offrir">{ideaStatusLabel.a_offrir}</option>
                  <option value="offert">{ideaStatusLabel.offert}</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="URL" error={errors.url?.message} optional>
            {(props) => <Input {...props} type="url" placeholder="https://…" {...register('url')} />}
          </Field>
          <Field label="Commentaire" error={errors.comment?.message} optional>
            {(props) => <Textarea {...props} rows={2} placeholder="Ex. taille M, coloris bleu" {...register('comment')} />}
          </Field>
          <Field label="Photo" optional hint="Bucket privé, jamais d’hotlink">
            {(props) => (
              <div className="flex flex-wrap items-center gap-3">
                {displayedPhoto ? (
                  <img src={displayedPhoto} alt="" className="h-14 w-14 rounded-[11px] object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-[11px] bg-bg text-muted">
                    <Icon name="image" />
                  </span>
                )}
                <input
                  {...props}
                  type="file"
                  accept="image/*"
                  className="text-[11px] text-muted file:mr-3 file:min-h-9 file:rounded-[10px] file:border-0 file:bg-accent-soft file:px-3 file:text-[12px] file:font-bold file:text-accent-strong"
                  onChange={(event) => {
                    setPhotoFile(event.target.files?.[0] ?? null);
                    if (event.target.files?.[0]) setPhotoRemoved(false);
                  }}
                />
                {displayedPhoto ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoRemoved(true);
                    }}
                  >
                    Retirer
                  </Button>
                ) : null}
              </div>
            )}
          </Field>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isPending}>
              {isPending ? 'Enregistrement…' : idea ? 'Enregistrer les modifications' : 'Ajouter l’idée'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
