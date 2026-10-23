import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { applyPlaceHit, searchPlacesOnline, type PlaceSearchHit } from '../api';
import { placeTypeIcon, placeTypes, type Place, type PlaceInput, type PlaceType } from '../types';

const schema = z.object({
  name: z.string().trim().min(2, 'Indiquez le nom du lieu.').max(80, '80 caractères maximum.'),
  type: z.enum([
    'restaurant',
    'cafe',
    'bar',
    'hotel',
    'boutique',
    'parc',
    'musee',
    'cinema',
    'theatre',
    'bien_etre',
    'lieu_phare',
    'tourisme',
    'autre',
  ]),
  rating: z.number().int().min(0).max(5, 'Choisissez une note entre 0 et 5.'),
  street: z.string().trim().max(120, '120 caractères maximum.').optional(),
  postalCode: z.string().trim().max(10, '10 caractères maximum.').optional(),
  city: z.string().trim().max(80, '80 caractères maximum.').optional(),
  phone: z.string().trim().max(30, '30 caractères maximum.').optional(),
  note: z.string().trim().max(500, '500 caractères maximum.').optional(),
  photoUrl: z.string().trim().max(2000, '2000 caractères maximum.').optional(),
});

type FormValues = z.infer<typeof schema>;

export interface PlaceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` pour un ajout, le lieu pour une modification. */
  place: Place | null;
  isSaving: boolean;
  onSubmit: (input: PlaceInput) => Promise<void>;
}

/** Champ facultatif : chaîne vide ramenée à `null` pour la colonne SQL. */
function nullable(value: string | undefined): string | null {
  const clean = (value ?? '').trim();
  return clean.length > 0 ? clean : null;
}

/**
 * Valeurs par défaut du formulaire pour une cible donnée (`null` = ajout).
 * Partagé entre `useForm` et l'effet de remise à zéro (D-14) : une seule
 * définition de ce que « repartir de la cible » veut dire.
 */
function defaultsFor(target: Place | null): FormValues {
  return {
    name: target?.name ?? '',
    type: target?.type ?? 'restaurant',
    rating: target && target.rating > 0 ? target.rating : 4,
    street: target?.street ?? '',
    postalCode: target?.postalCode ?? '',
    city: target?.city ?? '',
    phone: target?.phone ?? '',
    note: target?.note ?? '',
    // Valeur STOCKÉE, jamais l'URL signée : c'est ce qui rend la comparaison
    // « photo changée ou retirée » de `editPlace` possible (D-06, WR-05).
    // Une photo non touchée resoumet donc exactement la valeur de colonne.
    photoUrl: target?.photoStored ?? '',
  };
}

export function PlaceFormDialog({ open, onOpenChange, place, isSaving, onSubmit }: PlaceFormDialogProps) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Recherche d'adresse en ligne : la requête part après un temps de pause
  // (400 ms) — taper une adresse n'est pas la demander. Le compteur d'ordre
  // ignore toute réponse qui arrive après une requête plus récente.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<PlaceSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeqRef = useRef(0);
  // L'aperçu affiche la valeur RÉSOLUE (URL signée) ; la valeur transportée
  // par le champ, elle, est la valeur STOCKÉE (D-06, WR-05) — voir
  // `defaultsFor.photoUrl` plus bas. Le `key` de la page ne change pas quand la
  // même cible est rouverte (D-14) : c'est l'effet ci-dessous, sur `open` et la
  // cible, qui resynchronise ces états à chaque ouverture.
  const [photoPreview, setPhotoPreview] = useState<string | null>(place?.photoUrl ?? null);
  // Fichier choisi mais pas encore déposé (D-04) : le dépôt a lieu à
  // l'enregistrement, jamais à la sélection — annuler ne laisse aucun orphelin.
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFor(place),
  });

  // D-14 : le dialogue se rouvre parfois sur la MÊME cible — le `key` de la
  // page (`adresses-page.tsx`) ne change pas quand `editing?.id` est inchangé —
  // donc l'instance survit à la fermeture et l'état local reviendrait. L'effet
  // repart de la cible à chaque ouverture.
  //
  // `place` lui-même n'est PAS une dépendance : la page reconstruit cet objet à
  // chaque rendu (`adresses-page.tsx` le reforme depuis ses lignes), l'inclure
  // rejouerait la remise à zéro pendant la saisie et effacerait ce que
  // l'utilisateur est en train de taper. `place?.id ?? 'new'` identifie la
  // cible de façon stable.
  useEffect(() => {
    if (!open) return;
    reset(defaultsFor(place));
    setPhotoPreview(place?.photoUrl ?? null);
    setPickedFile(null);
    setSearchQuery('');
    setSearchHits(null);
    setSearchError(null);
    setSearching(false);
    // Le champ fichier garde la sélection d'une ouverture précédente : un
    // fichier abandonné serait resoumis si on ne le vidait pas.
    if (fileRef.current) fileRef.current.value = '';
  }, [open, place?.id]);

  useEffect(() => {
    if (!open) return;
    const terms = searchQuery.trim();
    if (terms.length < 3) {
      setSearchHits(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const rank = ++searchSeqRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchPlacesOnline(terms)
        .then((hits) => {
          if (searchSeqRef.current !== rank) return;
          setSearchHits(hits);
          setSearchError(null);
        })
        .catch((error: unknown) => {
          if (searchSeqRef.current !== rank) return;
          setSearchHits(null);
          setSearchError(error instanceof Error ? error.message : 'La recherche a échoué.');
        })
        .finally(() => {
          if (searchSeqRef.current === rank) setSearching(false);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [open, searchQuery]);

  /** Applique un résultat : adresse remplie, nom seulement s'il est vide. */
  const pickHit = (hit: PlaceSearchHit) => {
    const applied = applyPlaceHit(hit, { name: getValues('name') ?? '' });
    if (applied.name !== undefined) setValue('name', applied.name, { shouldValidate: true });
    setValue('street', applied.street);
    setValue('postalCode', applied.postalCode);
    setValue('city', applied.city);
    setSearchQuery('');
    setSearchHits(null);
    setSearchError(null);
  };

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      name: values.name,
      type: values.type as PlaceType,
      rating: values.rating,
      street: nullable(values.street),
      postalCode: nullable(values.postalCode),
      city: nullable(values.city),
      phone: nullable(values.phone),
      note: nullable(values.note),
      photoUrl: nullable(values.photoUrl),
      photoFile: pickedFile,
    });
    onOpenChange(false);
  });

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      // Aperçu local immédiat ; le dépôt bucket attend l'enregistrement.
      // `createObjectURL` peut lever sous jsdom : l'aperçu est un confort.
      try {
        setPhotoPreview(URL.createObjectURL(file));
      } catch {
        setPhotoPreview(null);
      }
      setPickedFile(file);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Photo illisible.', 'error');
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Adresses</p>
          <DialogTitle>{place ? 'Modifier le lieu' : 'Ajouter une adresse'}</DialogTitle>
          <DialogDescription>Un lieu à retrouver, avec sa photo et votre avis.</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="grid gap-3.5">
          <div className="flex items-center gap-3.5">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Aperçu de la photo du lieu"
                className="size-[74px] shrink-0 rounded-[13px] object-cover"
              />
            ) : (
              <span className="grid size-[74px] shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-strong">
                <Icon name={placeTypeIcon[(getValues('type') ?? 'restaurant') as PlaceType] ?? 'pin'} size="lg" />
              </span>
            )}
            <div className="grid flex-1 gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="image"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {photoBusy ? 'Compression…' : 'Choisir une photo'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setValue('photoUrl', '', { shouldValidate: true });
                  setPickedFile(null);
                  setPhotoPreview(null);
                }}
              >
                Retirer la photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Photo du lieu"
                onChange={(event) => void onPickPhoto(event.target.files?.[0])}
              />
            </div>
          </div>

          {isSupabaseConfigured ? (
            <div className="rounded-[13px] border border-accent/20 bg-accent-faint px-3 py-3">
              <Field
                label="Chercher l’adresse en ligne"
                optional
                hint="OpenStreetMap propose des adresses : choisissez-en une, les champs se remplissent."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Ex. 12 rue des Tilleuls, Lyon"
                    autoComplete="off"
                  />
                )}
              </Field>
              {searching ? (
                <p className="m-0 mt-2 text-xs text-muted" role="status">
                  Recherche en cours…
                </p>
              ) : null}
              {searchError ? (
                <p className="m-0 mt-2 text-xs text-fg" role="alert">
                  {searchError}
                </p>
              ) : null}
              {searchHits !== null && searchHits.length === 0 && !searching && searchQuery.trim().length >= 3 ? (
                <p className="m-0 mt-2 text-xs text-muted" role="status">
                  Aucun résultat pour « {searchQuery.trim()} ». Vérifiez l’orthographe, ou remplissez les champs à la main
                  ci-dessous.
                </p>
              ) : null}
              {searchHits !== null && searchHits.length > 0 ? (
                <ul className="mt-2 grid gap-1.5" role="list" aria-label="Adresses proposées">
                  {searchHits.map((hit, index) => (
                    <li key={`${hit.label}-${index}`} role="listitem">
                      <button
                        type="button"
                        onClick={() => pickHit(hit)}
                        aria-label={`Remplir l’adresse avec ${hit.label}`}
                        className="flex w-full min-h-11 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 py-2 text-left transition-colors duration-[var(--duration-quick)] hover:border-accent hover:bg-accent-faint"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-strong">
                          <Icon name="pin" size="sm" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-[13px] font-[700]">{hit.name}</strong>
                          <small className="block truncate text-[11px] text-muted">
                            {[hit.street, hit.postalCode, hit.city].filter(Boolean).join(', ') || hit.label}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <Field label="Nom du lieu" error={errors.name?.message}>
            {(props) => (
              <Input {...props} {...register('name')} placeholder="Ex. Le Café du Matin" autoComplete="off" />
            )}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Type de lieu" error={errors.type?.message}>
              {(props) => (
                <Select {...props} {...register('type')}>
                  {placeTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Note" error={errors.rating?.message} hint="De 1 à 5 étoiles.">
              {(props) => (
                <Select {...props} {...register('rating', { valueAsNumber: true })}>
                  <option value="5">5 étoiles</option>
                  <option value="4">4 étoiles</option>
                  <option value="3">3 étoiles</option>
                  <option value="2">2 étoiles</option>
                  <option value="1">1 étoile</option>
                  <option value="0">Pas encore noté</option>
                </Select>
              )}
            </Field>
          </div>

          <Field label="Adresse" error={errors.street?.message} optional>
            {(props) => <Input {...props} {...register('street')} placeholder="Ex. 12 rue des Tilleuls" autoComplete="off" />}
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Code postal" error={errors.postalCode?.message} optional>
              {(props) => <Input {...props} {...register('postalCode')} inputMode="numeric" autoComplete="off" />}
            </Field>
            <Field label="Ville" error={errors.city?.message} optional>
              {(props) => <Input {...props} {...register('city')} autoComplete="off" />}
            </Field>
          </div>

          <Field label="Téléphone" error={errors.phone?.message} optional>
            {(props) => <Input {...props} {...register('phone')} type="tel" autoComplete="off" />}
          </Field>

          <Field label="Note personnelle" error={errors.note?.message} optional>
            {(props) => <Textarea {...props} {...register('note')} placeholder="Ex. Terrasse calme le matin." />}
          </Field>

          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon="close" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" icon="check" disabled={isSaving}>
              {place ? 'Enregistrer les modifications' : 'Enregistrer le lieu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
