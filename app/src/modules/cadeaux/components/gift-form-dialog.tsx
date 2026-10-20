import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { roundPrice, visibilityLabel, type GiftItem, type GiftList, type NewGiftItemInput } from '../types';

const urlPattern = /^https?:\/\/\S+$/i;

const schema = z.object({
  listId: z.string().min(1, 'Choisissez la liste qui recevra cette idée.'),
  name: z.string().trim().min(1, 'Donnez un nom au cadeau.').max(80, '80 caractères maximum.'),
  price: z.string().trim().refine((value) => value === '' || parsePrice(value) >= 0, 'Prix positif attendu.'),
  url: z.string().trim().refine((value) => value === '' || urlPattern.test(value), 'Lien invalide.'),
  comment: z.string().trim().max(280, '280 caractères maximum.'),
});

type FormValues = z.infer<typeof schema>;

const parsePrice = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface GiftFormResult {
  values: NewGiftItemInput;
  /** Fichier déposé par la page à l'enregistrement (`depositHouseholdFile`, dossier `cadeaux`). */
  photoFile: File | null;
  photoRemoved: boolean;
}

export interface GiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: GiftList[];
  defaultListId: string | null;
  /** Idée en cours d'édition, `null` pour une création. */
  item?: GiftItem | null;
  onSubmit: (result: GiftFormResult) => void;
  isPending?: boolean;
}

export function GiftFormDialog({
  open,
  onOpenChange,
  lists,
  defaultListId,
  item = null,
  onSubmit,
  isPending = false,
}: GiftFormDialogProps) {
  // Valeur de COLONNE soumise : chemin de bucket pour un dépôt, `data:`/`blob:`
  // hérité pour un article ancien. La page la remplace par le chemin du dépôt
  // quand `photoFile` est fourni (même partage des rôles que la boîte « idée »).
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { listId: defaultListId ?? '', name: '', price: '', url: '', comment: '' },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      listId: item?.listId ?? defaultListId ?? lists[0]?.id ?? '',
      name: item?.name ?? '',
      price: item?.price === null || item?.price === undefined ? '' : String(item.price),
      url: item?.url ?? '',
      comment: item?.comment ?? '',
    });
    setPhotoFile(null);
    setPhotoRemoved(false);
    setPreviewUrl(null);
    setFileName(null);
  }, [defaultListId, item, lists, open, reset]);

  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const displayedPhoto = previewUrl ?? (photoRemoved ? null : (item?.photoUrl ?? null));

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setPhotoFile(file);
    setPhotoRemoved(false);
  };

  const submit = (values: FormValues) => {
    onSubmit({
      values: {
        listId: values.listId,
        name: values.name,
        price: values.price === '' ? null : roundPrice(parsePrice(values.price)),
        url: values.url === '' ? null : values.url,
        comment: values.comment === '' ? null : values.comment,
        // Valeur de COLONNE si la photo n'est pas touchée (chemin du bucket,
        // D-01) : re-soumettre `photoUrl` persisterait l'URL signée affichée.
        photoUrl: photoRemoved ? null : (item?.photoStored ?? null),
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
          <DialogTitle>{item ? 'Modifier l’idée' : 'Ajouter une idée cadeau'}</DialogTitle>
          <DialogDescription>
            Une idée, un prix, un lien… et le partage reste sous contrôle.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit(submit)} className="grid gap-3.5">
          <Field label="Liste" error={errors.listId?.message}>
            {(props) => (
              <Select {...props} {...register('listId')}>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {`${list.name}${list.isPrivate ? ' (privée)' : ''}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Nom du cadeau" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} placeholder="Ex. Atelier céramique" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
            <Field label="Prix" error={errors.price?.message} optional>
              {(props) => <Input {...props} type="number" step="0.01" min="0" inputMode="decimal" placeholder="45" {...register('price')} />}
            </Field>
            <Field label="URL" error={errors.url?.message} optional>
              {(props) => <Input {...props} type="url" placeholder="https://…" {...register('url')} />}
            </Field>
          </div>
          <Field label="Commentaire" error={errors.comment?.message} optional>
            {(props) => <Textarea {...props} rows={2} placeholder="Ex. offrir avec un petit voucher" {...register('comment')} />}
          </Field>
          <Field label="Photo" optional hint="Bucket privé, compression WebP au dépôt">
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
                  onChange={(event) => pickPhoto(event.target.files?.[0])}
                />
                {displayedPhoto ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoRemoved(true);
                      setFileName(null);
                    }}
                  >
                    Retirer
                  </Button>
                ) : null}
                {fileName ? <span className="text-[11px] text-muted">{fileName}</span> : null}
              </div>
            )}
          </Field>
          {lists.some((list) => list.isPrivate && list.id === (item?.listId ?? defaultListId)) ? (
            <p className="m-0 text-[11px] text-muted">
              {`Cette liste est ${visibilityLabel.privee.toLowerCase()} : personne ne la verra tant que vous ne l’aurez pas partagée.`}
            </p>
          ) : null}
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="arrow" disabled={isPending}>
              {isPending ? 'Enregistrement…' : item ? 'Enregistrer les modifications' : 'Ajouter l’idée'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
