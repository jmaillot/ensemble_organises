import { useCallback, useState } from 'react';
import { MetricRow, ModuleShell } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { SearchInput, Select } from '@/components/ui/input';
import { Badge, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { Icon } from '@/components/shared/icon';
import { PlaceFormDialog } from './components/place-form-dialog';
import { useAdresses } from './hooks/use-adresses';
import {
  placeTypeIcon,
  placeTypes,
  ratingStars,
  type Place,
  type PlaceInput,
  type PlaceType,
  type PlaceVisitFilter,
} from './types';

const visitFilters: { value: PlaceVisitFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'todo', label: 'À visiter' },
  { value: 'done', label: 'Déjà visités' },
];

export default function AdressesPage() {
  const {
    places,
    visiblePlaces,
    cityGroups,
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,
    total,
    visited,
    todo,
    averageRating,
    isLoading,
    isFetching,
    isError,
    error,
    isMutating,
    refetch,
    addPlace,
    editPlace,
    removePlace,
    toggleVisited,
  } = useAdresses();
  const toast = useToast();

  const [view, setView] = useState<'grid' | 'map'>('grid');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Place | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Place | null>(null);

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((place: Place) => {
    setEditing(place);
    setFormOpen(true);
  }, []);

  const savePlace = useCallback(
    async (input: PlaceInput) => {
      try {
        if (editing) {
          await editPlace(editing, input);
          toast('Lieu mis à jour.', 'success');
        } else {
          await addPlace(input);
          toast('Lieu enregistré.', 'success');
        }
      } catch (caught) {
        toast(caught instanceof Error ? caught.message : 'Enregistrement impossible.', 'error');
      }
    },
    [addPlace, editPlace, editing, toast],
  );

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    setPendingDelete(null);
    try {
      await removePlace(pendingDelete);
      toast(`Lieu ${name} supprimé.`, 'success');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Suppression impossible.', 'error');
    }
  }, [pendingDelete, removePlace, toast]);

  const onToggleVisited = useCallback(
    async (place: Place) => {
      try {
        await toggleVisited(place);
        toast(place.visited ? `${place.name} redevient à visiter.` : `${place.name} marqué comme visité.`, 'success');
      } catch (caught) {
        toast(caught instanceof Error ? caught.message : 'Mise à jour impossible.', 'error');
      }
    },
    [toast, toggleVisited],
  );

  return (
    <ModuleShell
      module="adresses"
      actions={
        <>
          <Button
            variant="secondary"
            icon={view === 'grid' ? 'map' : 'grid'}
            aria-pressed={view === 'map'}
            onClick={() => setView(view === 'grid' ? 'map' : 'grid')}
          >
            {view === 'grid' ? 'Vue carte' : 'Vue grille'}
          </Button>
          <Button icon="plus" onClick={openCreate}>
            Ajouter une adresse
          </Button>
        </>
      }
    >
      <MetricRow
        items={[
          { label: 'Lieux', value: total, caption: 'adresses sauvegardées' },
          { label: 'Déjà visités', value: visited, caption: 'dans vos souvenirs' },
          { label: 'À découvrir', value: todo, caption: 'encore à tester' },
          { label: 'Note moyenne', value: averageRating.toFixed(1), caption: 'sur 5 étoiles' },
        ]}
      />

      <div className="mb-4 grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_180px_170px] sm:items-center">
        <SearchInput
          value={filters.query}
          onChange={(event) => setFilters({ query: event.target.value })}
          placeholder="Rechercher un lieu ou une ville"
          aria-label="Rechercher un lieu ou une ville"
          containerClassName="sm:max-w-[340px]"
        />
        <Select
          aria-label="Filtrer par type de lieu"
          value={filters.type}
          onChange={(event) => setFilters({ type: event.target.value as PlaceType | 'all' })}
        >
          <option value="all">Tous les types</option>
          {placeTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Note minimale"
          value={String(filters.minRating)}
          onChange={(event) => setFilters({ minRating: Number(event.target.value) })}
        >
          <option value="0">Toutes les notes</option>
          <option value="1">1 étoile et plus</option>
          <option value="2">2 étoiles et plus</option>
          <option value="3">3 étoiles et plus</option>
          <option value="4">4 étoiles et plus</option>
          <option value="5">5 étoiles</option>
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par visite">
          {visitFilters.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={filters.visit === item.value ? 'primary' : 'secondary'}
              aria-pressed={filters.visit === item.value}
              onClick={() => setFilters({ visit: item.value })}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {hasActiveFilters ? (
          <Button size="sm" variant="quiet" icon="close" onClick={resetFilters}>
            Réinitialiser les filtres
          </Button>
        ) : null}
        <span className="ml-auto text-[11px] text-muted" aria-live="polite">
          {isFetching ? 'Actualisation…' : `${visiblePlaces.length} lieu${visiblePlaces.length > 1 ? 'x' : ''}`}
        </span>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : isError ? (
        <ErrorState message={error?.message ?? 'Les adresses n’ont pas pu être chargées.'} onRetry={refetch} />
      ) : places.length === 0 ? (
        <EmptyState
          icon="pin"
          title="Aucune adresse sauvegardée"
          description="Gardez les bons coins de la famille : un restaurant, un parc, une pharmacie de garde."
          actionLabel="Ajouter une adresse"
          onAction={openCreate}
        />
      ) : visiblePlaces.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Aucun lieu ne correspond"
          description="Ajustez la recherche, le type de lieu ou la note minimale pour retrouver vos adresses."
          actionLabel="Réinitialiser les filtres"
          onAction={resetFilters}
        />
      ) : view === 'map' ? (
        <MapView groups={cityGroups} onSelect={openEdit} />
      ) : (
        <div className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1" aria-busy={isFetching}>
          {visiblePlaces.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onEdit={() => openEdit(place)}
              onDelete={() => setPendingDelete(place)}
              onToggleVisited={() => void onToggleVisited(place)}
            />
          ))}
        </div>
      )}

      <PlaceFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={setFormOpen}
        place={editing}
        isSaving={isMutating}
        onSubmit={savePlace}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Supprimer ce lieu ?"
        description={`${pendingDelete?.name ?? 'Ce lieu'} sera retiré du carnet d’adresses du foyer.`}
        confirmLabel="Supprimer le lieu"
        onConfirm={confirmDelete}
      />
    </ModuleShell>
  );
}

interface PlaceCardProps {
  place: Place;
  onEdit: () => void;
  onDelete: () => void;
  onToggleVisited: () => void;
}

function PlaceCard({ place, onEdit, onDelete, onToggleVisited }: PlaceCardProps) {
  const itinerary = encodeURIComponent([place.addressLine, place.city].filter(Boolean).join(' '));
  return (
    <article className="panel-surface overflow-hidden rounded-[16px] p-0">
      {place.photoUrl ? (
        <img src={place.photoUrl} alt="" loading="lazy" className="h-[138px] w-full object-cover" />
      ) : (
        <div className="grid h-[138px] w-full place-items-center bg-accent-soft text-accent-strong">
          <Icon name={placeTypeIcon[place.type]} size="lg" />
        </div>
      )}

      <div className="p-[15px]">
        <div className="flex items-start justify-between gap-2">
          <h3 className="mb-1 truncate font-display text-[17px] tracking-[-0.035em]">{place.name}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" icon="edit" onClick={onEdit} aria-label={`Modifier ${place.name}`} />
            <Button variant="ghost" size="icon" icon="trash" onClick={onDelete} aria-label={`Supprimer ${place.name}`} />
          </div>
        </div>

        <p className="m-0 text-[11px] text-muted">
          {place.typeLabel} · {place.rating}/5
        </p>
        <p className="m-0 text-[11px] text-muted">{place.addressLine}</p>
        {place.note ? <p className="mt-2 mb-0 text-[12px]">{place.note}</p> : null}

        <div className="mt-3.5 flex items-center justify-between gap-2">
          <span className="text-[12px] tracking-[0.2em] text-amber" role="img" aria-label={`${place.rating} sur 5`}>
            {ratingStars(place.rating)}
          </span>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Déjà visité
            <Switch
              checked={place.visited}
              onCheckedChange={onToggleVisited}
              aria-label={place.visited ? `Marquer ${place.name} comme non visité` : `Marquer ${place.name} comme visité`}
            />
          </label>
        </div>

        {place.phone || place.city ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px]">
            {place.phone ? (
              <a className="inline-flex items-center gap-1.5 text-accent-strong hover:underline" href={`tel:${place.phone}`}>
                <Icon name="phone" size="sm" />
                {place.phone}
              </a>
            ) : null}
            {place.city ? (
              <a
                className="inline-flex items-center gap-1.5 text-accent-strong hover:underline"
                href={`https://www.openstreetmap.org/search?query=${itinerary}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="pin" size="sm" />
                Itinéraire
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MapView({ groups, onSelect }: { groups: { city: string; places: Place[] }[]; onSelect: (place: Place) => void }) {
  return (
    <div className="grid gap-3.5" data-view="map">
      {groups.map((group) => (
        <section key={group.city} className="rounded-[16px] border border-border bg-accent-faint p-4">
          <div className="mb-3 flex items-center gap-2">
            <Icon name="pin" size="sm" className="text-accent-strong" />
            <h3 className="m-0 font-display text-[17px] tracking-[-0.035em]">{group.city}</h3>
            <span className="text-[11px] text-muted">
              {group.places.length} lieu{group.places.length > 1 ? 'x' : ''}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {group.places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onSelect(place)}
                  className="panel-surface flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-[var(--duration-quick)] hover:border-accent"
                >
                  <Icon name={placeTypeIcon[place.type]} size="sm" className="text-accent-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-[750]">{place.name}</span>
                    <span className="block text-[10px] text-muted">{place.typeLabel}</span>
                  </span>
                  <span className="text-[11px] tracking-[0.1em] text-amber" aria-hidden="true">
                    {ratingStars(place.rating)}
                  </span>
                  {place.visited ? <Badge tone="muted">Déjà visité</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
