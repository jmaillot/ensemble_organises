import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore } from '@/stores/household-store';
import { useQueryClient } from '@tanstack/react-query';
import { compressImage } from '@/modules/cercle/lib/media';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { createShoppingItem, SHOPPING_ITEMS_TABLE, SHOPPING_LISTS_TABLE } from '../api';
import { isQueryableEan, type OffProduct } from '../off-client';
import { offCategoriesToRayon } from '../off-rayon';
import * as productsApi from '../products-api';
import { normalizeRayon, RAYONS } from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom du produit.').max(200, '200 caractères maximum.'),
  rayon: z.enum(RAYONS),
});

type FormValues = z.infer<typeof schema>;

export interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` (404, invalide, hors-ligne) : chemin création manuelle (D-01). */
  offProduct: OffProduct | null;
  /** EAN scanné ou tapé, déjà trimmé par l'appelant. */
  ean: string;
  /** Listes candidates : le scan n'est plus câblé sur `lists[0]` (CR-04). */
  lists: { id: string; name: string }[];
  /** Enrichissement en échec (réseau/timeout/5xx) : réessayer, pas créer en double (WR-04). */
  offError?: boolean;
  onRetry?: () => void;
}

/** Types bitmap explicites : le SVG (conteneur actif) est refusé (WR-10). */
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif'];
/** Garde-fou avant décodage : pas de fichier géant vers `compressImage` (WR-10). */
const PHOTO_MAX_BYTES = 15_000_000;

/**
 * Fiche produit scan (D-02) : un bouton principal unique enregistre le
 * produit ET l'ajoute à la liste courante en un tap. L'image OpenFoodFacts
 * n'est qu'un affichage transitoire avec crédit : `photo_url` reste réservé
 * à la photo locale signée (D-05, T-04-06) — assertion dédiée en test.
 */
export function ProductSheet({ open, onOpenChange, offProduct, ean, lists, offError = false, onRetry }: ProductSheetProps) {
  const toast = useToast();
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  const queryClient = useQueryClient();

  const suggestedRayon = offProduct ? offCategoriesToRayon(offProduct.categoriesTags) : 'Divers';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: offProduct?.name ?? '', rayon: suggestedRayon },
  });

  // La fiche est pré-remplie à chaque ouverture : un scan tardif ne doit
  // jamais écraser une saisie en cours, ni un EAN précédent survivre.
  // La photo suit le même cycle : vidée à chaque ouverture (D-05).
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [targetListId, setTargetListId] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      reset({ name: offProduct?.name ?? '', rayon: suggestedRayon });
      setPhotoFile(null);
      setPhotoError(null);
      setTargetListId((current) =>
        current && lists.some((list) => list.id === current) ? current : (lists[0]?.id ?? null),
      );
      setPhotoPreview((previous) => {
        if (previous && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previous);
        return null;
      });
      previewRef.current = null;
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
    // `suggestedRayon` dérive de `offProduct` : le watcher porte sur la source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offProduct, reset]);

  // Fuite d'URL objet à la fermeture et au démontage (WR-11) : le ref miroir
  // suit la valeur courante, la fermeture du cleanup serait périmée sinon.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      const current = previewRef.current;
      previewRef.current = null;
      if (current && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(current);
        } catch {
          // jsdom : l'aperçu n'a jamais existé, rien à révoquer.
        }
      }
    },
    [],
  );

  /** Sélection photo (D-05) : seules les images partent vers le bucket privé. */
  const onPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPhotoError(null);
    previewRef.current = null;
    setPhotoPreview((previous) => {
      if (previous && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previous);
      return null;
    });
    if (!file) {
      setPhotoFile(null);
      return;
    }
    if (!PHOTO_MIMES.includes(file.type) || file.type === 'image/svg+xml') {
      setPhotoFile(null);
      setPhotoError('Sélectionnez une photo (JPEG, PNG, WebP, HEIC ou AVIF).');
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoFile(null);
      setPhotoError('Photo trop lourde (15 Mo maximum).');
      return;
    }
    setPhotoFile(file);
    // jsdom expose un `createObjectURL` qui lève : l'aperçu est un confort,
    // jamais un prérequis à l'upload.
    try {
      const preview = URL.createObjectURL(file);
      previewRef.current = preview;
      setPhotoPreview(preview);
    } catch {
      previewRef.current = null;
      setPhotoPreview(null);
    }
  };

  /** Un EAN interrogeable persiste en produit du foyer, sinon article simple. */
  const canPersistProduct = isQueryableEan(ean);

  const submit = handleSubmit(async (values) => {
    if (!householdId) {
      toast('Aucun foyer actif : reconnectez-vous.', 'error');
      return;
    }
    const name = values.name.trim();
    const rayon = normalizeRayon(values.rayon);
    if (!targetListId) {
      toast('Choisissez une liste pour y ajouter ce produit.', 'error');
      return;
    }
    try {
      if (canPersistProduct) {
        // D-05 atomique (CR-05) : photo déposée PUIS produit créé avec son URL
        // en UNE écriture — jamais de `update` séparé (demi-échec RLS sur le
        // produit d'autrui), et tout échec après dépôt nettoie l'objet (pas
        // d'orphelin en bucket).
        let photoUrl: string | null = null;
        let depositedPath: string | null = null;
        try {
          if (photoFile) {
            const compressed = await compressImage(photoFile);
            const uploadable = new File([compressed.blob], compressed.name, { type: compressed.mime });
            const deposited = await depositHouseholdFile({ householdId, folder: 'products', file: uploadable });
            photoUrl = deposited.url;
            depositedPath = deposited.path;
          }
          const resolution = await productsApi.resolveScannedProduct(
            offProduct
              ? {
                  ...productsApi.productInputFromOff(householdId, offProduct, {
                    category: rayon,
                    createdBy: currentMemberId,
                  }),
                  photoUrl,
                  listId: targetListId,
                  addedBy: currentMemberId,
                }
              : {
                  householdId,
                  ean: ean.trim(),
                  name,
                  brand: null,
                  category: rayon,
                  photoUrl,
                  createdBy: currentMemberId,
                  listId: targetListId,
                  addedBy: currentMemberId,
                },
          );
          toast(productsApi.scanAddedToast(resolution.product.name, resolution.incremented), 'success');
        } catch (resolveError) {
          if (depositedPath) await removeHouseholdFile(depositedPath).catch(() => {});
          throw resolveError;
        }
      } else {
        // Code non interrogeable (T-04-05) : pas d'appel OFF, article simple.
        await createShoppingItem({
          householdId,
          listId: targetListId,
          name,
          quantity: null,
          unit: null,
          rayon,
          addedBy: currentMemberId,
        });
        toast(`« ${name} » ajouté à la liste`, 'success');
      }
      // La résolution écrit via `data.*` hors hook : invalider ici, comme
      // `useCourses`, sinon l'article n'apparaît qu'au rechargement.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [SHOPPING_LISTS_TABLE] }),
        queryClient.invalidateQueries({ queryKey: [SHOPPING_ITEMS_TABLE] }),
        queryClient.invalidateQueries({ queryKey: [productsApi.PRODUCTS_TABLE] }),
      ]);
      onOpenChange(false);
    } catch (error) {
      // Refus serveur (RLS enfant, T-04-07) : l'erreur est relayée en toast.
      toast(error instanceof Error ? error.message : 'Enregistrement impossible.', 'error');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Courses</p>
          <DialogTitle>{offProduct ? offProduct.name : 'Produit non trouvé — créez-le'}</DialogTitle>
          <DialogDescription>
            {offProduct
              ? 'Vérifiez la fiche, puis enregistrez et ajoutez en un tap.'
              : 'Ce code est inconnu d’Open Food Facts : nommez-le pour votre foyer.'}
          </DialogDescription>
        </DialogHeader>

        {photoPreview ? (
          <figure className="m-0 overflow-hidden rounded-[14px] border border-border">
            <img src={photoPreview} alt="Aperçu de la photo du produit" className="max-h-44 w-full object-cover" />
            <figcaption className="bg-bg px-3 py-1.5 text-[10px] text-muted">
              Photo locale — enregistrée avec le produit.
            </figcaption>
          </figure>
        ) : offProduct?.imageUrl ? (
          <figure className="m-0 overflow-hidden rounded-[14px] border border-border">
            <img src={offProduct.imageUrl} alt={`Photo ${offProduct.name} (Open Food Facts)`} className="max-h-44 w-full object-cover" />
            <figcaption className="bg-bg px-3 py-1.5 text-[10px] text-muted">
              Photo Open Food Facts — affichage seul, non enregistrée.
            </figcaption>
          </figure>
        ) : null}

        {offProduct?.brand ? (
          <p className="m-0 text-[12px] text-muted">Marque : {offProduct.brand}</p>
        ) : null}

        {offError && !offProduct && onRetry ? (
          <div className="rounded-[11px] border border-coral/30 bg-coral-soft/40 px-3 py-2.5 text-[12px]">
            <p className="m-0 mb-2 font-semibold text-coral">
              Enrichissement indisponible (réseau) : réessayez ou créez l’article manuellement.
            </p>
            <Button variant="secondary" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        ) : null}

        {lists.length > 1 ? (
          <Field label="Liste destinataire">
            {(props) => (
              <Select
                {...props}
                value={targetListId ?? ''}
                onChange={(change) => setTargetListId(change.target.value || null)}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <form className="grid gap-3.5" noValidate onSubmit={submit}>
          <Field label="Nom" error={errors.name?.message}>
            {(props) => <Input placeholder="Ex. Comté affiné" {...props} {...register('name')} />}
          </Field>

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

          <Field
            label="Photo"
            hint="Optionnelle : la photo locale est prioritaire sur Open Food Facts."
            error={photoError ?? undefined}
            optional
          >
            {(props) => (
              <Input
                {...props}
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
              />
            )}
          </Field>

          {!canPersistProduct ? (
            <p className="m-0 text-[11px] text-muted" role="note">
              Code non standard : l’article sera ajouté à la liste sans fiche produit.
            </p>
          ) : null}

          <DialogActions>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={isSubmitting}>
              {isSubmitting ? 'Ajout…' : 'Enregistrer et ajouter à la liste'}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
