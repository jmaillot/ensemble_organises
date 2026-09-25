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

const MAX_EDGE = 1200;

/**
 * Compression native avant enregistrement : `createImageBitmap` + `<canvas>`,
 * WebP lorsque le navigateur l'encode, JPEG sinon. Sans ces API, l'aperçu
 * objet est conservé tel quel.
 */
async function readPhoto(file: File): Promise<string> {
  if (typeof createImageBitmap !== 'function') return URL.createObjectURL(file);
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return URL.createObjectURL(file);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.82);
    if (webp.startsWith('data:image/webp')) return webp;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap.close();
  }
}

export interface GiftFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: GiftList[];
  defaultListId: string | null;
  /** Idée en cours d'édition, `null` pour une création. */
  item?: GiftItem | null;
  onSubmit: (values: NewGiftItemInput) => void;
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photoUrl ?? null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    setPhotoUrl(item?.photoUrl ?? null);
    setFileName(null);
    setPhotoError(null);
  }, [defaultListId, item, lists, open, reset]);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    try {
      setPhotoUrl(await readPhoto(file));
      setPhotoError(null);
    } catch {
      setPhotoUrl(URL.createObjectURL(file));
      setPhotoError('Photo conservée sans compression sur ce navigateur.');
    }
  };

  const submit = (values: FormValues) => {
    onSubmit({
      listId: values.listId,
      name: values.name,
      price: values.price === '' ? null : roundPrice(parsePrice(values.price)),
      url: values.url === '' ? null : values.url,
      comment: values.comment === '' ? null : values.comment,
      photoUrl,
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
          <Field label="Photo" optional hint="Compression automatique en WebP">
            {(props) => (
              <div className="flex flex-wrap items-center gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-14 w-14 rounded-[11px] object-cover" />
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
                  onChange={(event) => void pickPhoto(event.target.files?.[0])}
                />
                {fileName ? <span className="text-[11px] text-muted">{fileName}</span> : null}
              </div>
            )}
          </Field>
          {photoError ? (
            <p role="status" className="m-0 text-[11px] text-muted">
              {photoError}
            </p>
          ) : null}
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
