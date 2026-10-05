import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Panel } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { productPhotoUrl } from '../products-api';
import { useHouseholdStore } from '@/stores/household-store';
import { compressImage } from '@/modules/cercle/lib/media';
import { depositHouseholdFile } from '@/lib/storage';
import { isQueryableEan } from '../off-client';
import { normalizeRayon, RAYONS } from '../types';
import type { ProductRow } from '@/types';

const editSchema = z.object({
  name: z.string().trim().min(2, 'Nommez le produit.').max(200, '200 caractères maximum.'),
  brand: z.string().trim().max(200, '200 caractères maximum.'),
  rayon: z.enum(RAYONS),
  ean: z
    .string()
    .trim()
    .refine((value) => isQueryableEan(value), 'Code-barres invalide (8 à 14 chiffres).'),
});

type EditFormValues = z.infer<typeof editSchema>;

/**
 * Catalogue des produits scannés du foyer : photo, code-barres et rayon
 * modifiables. L'édition suit la RLS (créateur ou ligne sans auteur) :
 * un refus serveur remonte en toast, sans écran d'erreur.
 */
export function ProductCatalog({ products, onEdit }: { products: ProductRow[]; onEdit: (
  id: string,
  values: { name: string; brand: string; category: string; ean: string; photoUrl?: string | null },
) => Promise<void> }) {
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [rayonFilter, setRayonFilter] = useState<string | null>(null);

  const rayons = [...new Set(products.map((product) => normalizeRayon(product.category)))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const visible =
    rayonFilter === null ? products : products.filter((product) => normalizeRayon(product.category) === rayonFilter);

  return (
    <Panel
      id="products-catalog-panel"
      title="Catalogue des produits scannés"
      description="Vos produits, modifiables : photo, code-barres, rayon."
    >
      {products.length === 0 ? (
        <EmptyState
          icon="scan"
          title="Aucun produit scanné"
          description="Scannez un code-barres pour constituer le catalogue du foyer."
        />
      ) : (
        <>
          {rayons.length > 1 ? (
            <div className="mb-2.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer par rayon">
              <button
                type="button"
                role="tab"
                aria-selected={rayonFilter === null}
                onClick={() => setRayonFilter(null)}
                className={
                  rayonFilter === null
                    ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
                    : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
                }
              >
                Tous
              </button>
              {rayons.map((rayon) => {
                const active = rayonFilter === rayon;
                return (
                  <button
                    key={rayon}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRayonFilter(active ? null : rayon)}
                    className={
                      active
                        ? 'rounded-full bg-accent px-3.5 py-2 text-[12px] font-extrabold text-white'
                        : 'rounded-full border border-border bg-surface px-3.5 py-2 text-[12px] font-bold text-muted hover:text-fg'
                    }
                  >
                    {rayon}
                  </button>
                );
              })}
            </div>
          ) : null}
          <ul className="grid gap-2">
            {visible.map((product) => {
              const photo = productPhotoUrl(product);
              return (
                <li
                  key={product.id}
                  className="flex min-h-11 items-center gap-2.5 rounded-[12px] border border-border px-3 py-2.5"
                >
                  {photo ? (
                    <img src={photo} alt="" aria-hidden="true" className="size-9 shrink-0 rounded-[7px] object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[7px] bg-bg text-muted">
                      <Icon name="image" size="sm" />
                    </span>
                  )}
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13px] font-[760]">{product.name}</p>
                <small className="text-[11px] text-muted">
                  {product.ean} · {product.category ?? 'Divers'}
                </small>
              </div>
              <Button
                variant="ghost"
                size="icon"
                icon="edit"
                className="size-8 min-h-8 shrink-0 hover:bg-accent-faint hover:text-fg"
                aria-label={`Modifier ${product.name}`}
                onClick={() => setEditing(product)}
              />
            </li>
              );
            })}
          </ul>
        </>
      )}
      <ProductEditDialog product={editing} onOpenChange={(open) => { if (!open) setEditing(null); }} onEdit={onEdit} />
    </Panel>
  );
}

function ProductEditDialog({
  product,
  onOpenChange,
  onEdit,
}: {
  product: ProductRow | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (
    id: string,
    values: { name: string; brand: string; category: string; ean: string; photoUrl?: string | null },
  ) => Promise<void>;
}) {
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: '', brand: '', rayon: 'Divers', ean: '' },
  });

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        brand: product.brand ?? '',
        rayon: (RAYONS as readonly string[]).includes(product.category ?? '') ? (product.category as EditFormValues['rayon']) : 'Divers',
        ean: product.ean,
      });
      setPhotoFile(null);
      setPhotoPreview(product.photo_url);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }, [product, reset]);

  const submit = handleSubmit(async (values) => {
    if (!product) return;
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        if (!householdId) throw new Error('Aucun foyer actif : reconnectez-vous.');
        const compressed = await compressImage(photoFile);
        const uploadable = new File([compressed.blob], compressed.name, { type: compressed.mime });
        photoUrl = (await depositHouseholdFile({ householdId, folder: 'products', file: uploadable })).url;
      }
      await onEdit(product.id, {
        name: values.name.trim(),
        brand: values.brand.trim(),
        category: values.rayon,
        ean: values.ean.trim(),
        ...(photoUrl !== undefined ? { photoUrl } : {}),
      });
      onOpenChange(false);
      toast(`« ${values.name.trim()} » mis à jour.`, 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Modification impossible.', 'error');
    }
  });

  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Catalogue</p>
          <DialogTitle>Modifier le produit</DialogTitle>
          <DialogDescription>Photo, code-barres et rayon du produit scanné.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3.5" noValidate onSubmit={submit}>
          {photoPreview ? (
            <figure className="m-0 overflow-hidden rounded-[14px] border border-border">
              <img src={photoPreview} alt="Photo du produit" className="max-h-44 w-full object-cover" />
            </figure>
          ) : null}
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input {...props} {...register('name')} maxLength={200} autoComplete="off" />}
          </Field>
          <Field label="Marque" optional error={errors.brand?.message}>
            {(props) => <Input {...props} {...register('brand')} maxLength={200} autoComplete="off" />}
          </Field>
          <div className="grid grid-cols-2 gap-3 max-[650px]:grid-cols-1">
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
            <Field label="Code-barres" error={errors.ean?.message}>
              {(props) => <Input {...props} {...register('ean')} inputMode="numeric" autoComplete="off" />}
            </Field>
          </div>
          <Field label="Photo" optional>
            {(props) => (
              <Input
                {...props}
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={(change) => {
                  const file = change.target.files?.[0] ?? null;
                  setPhotoFile(file);
                  if (file) {
                    try {
                      setPhotoPreview(URL.createObjectURL(file));
                    } catch {
                      setPhotoPreview(product?.photo_url ?? null);
                    }
                  } else {
                    setPhotoPreview(product?.photo_url ?? null);
                  }
                }}
              />
            )}
          </Field>
          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
