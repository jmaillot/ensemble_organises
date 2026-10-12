/**
 * Onglet Adresses d'un voyage (phase 15, 15-03) : fourche à filtre `tripId`,
 * jamais un drop-in du carnet foyer (D-09).
 *
 * - Lecture : lieux `trip_id = voyage courant`.
 * - Création : charge du formulaire foyer (`toPlacePayload`, jamais
 *   réinventée) + `trip_id` posé explicitement ; `visited` naît à `false`,
 *   seule la bascule dédiée y touche ensuite.
 * - Photos : relues telles quelles (aucun dépôt dans la fourche).
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { data } from '@/lib/data';
import { placeTypes, type PlaceType } from '@/modules/adresses/types';
import { toVisitedPayload } from '@/modules/adresses/api';
import type { PlaceRow } from '@/types';
import { createTripPlace, fetchTripPlaces } from '../api';

export const tripPlacesKeys = {
  all: ['voyages', 'trip-places'] as const,
  list: (tripId: string) => ['voyages', 'trip-places', tripId] as const,
};

export interface TripPlacesTabProps {
  tripId: string;
  householdId: string;
  readOnly?: boolean;
}

export function TripPlacesTab({ tripId, householdId, readOnly = false }: TripPlacesTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<PlaceType>('cafe');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlaceRow | null>(null);

  const placesQuery = useQuery({
    queryKey: tripPlacesKeys.list(tripId),
    queryFn: () => fetchTripPlaces(tripId),
  });
  const places = useMemo(
    () => [...(placesQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [placesQuery.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: tripPlacesKeys.list(tripId) });
  };

  const submit = async () => {
    if (saving || name.trim() === '') return;
    setSaving(true);
    try {
      await createTripPlace({ tripId, householdId, input: { name, type, city: city || null } });
      setName('');
      setCity('');
      refresh();
      toast('Adresse ajoutée au voyage.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'L’adresse n’a pas pu être ajoutée.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisited = (place: PlaceRow) => {
    void data
      .update('places', place.id, toVisitedPayload(!place.visited))
      .then(refresh)
      .catch((toggleError: unknown) =>
        toast(toggleError instanceof Error ? toggleError.message : 'Le statut n’a pas pu être mis à jour.', 'error'),
      );
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    void data
      .remove('places', target.id)
      .then(() => {
        refresh();
        toast('Adresse du voyage supprimée.');
      })
      .catch((removalError: unknown) =>
        toast(removalError instanceof Error ? removalError.message : 'L’adresse n’a pas pu être supprimée.', 'error'),
      );
  };

  if (placesQuery.isError) {
    return (
      <Panel id="trip-places" title="Adresses" description="Les adresses propres à ce voyage.">
        <ErrorState
          message={placesQuery.error instanceof Error ? placesQuery.error.message : 'Les adresses du voyage n’ont pas pu être chargées.'}
          onRetry={() => void placesQuery.refetch()}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-3.5">
      {!readOnly ? (
        <Panel id="trip-places-new" title="Ajouter une adresse" description="L’adresse appartient au voyage, jamais au carnet du foyer.">
          <div className="grid gap-3.5">
            <Field label="Nom du lieu">
              {(props) => (
                <Input {...props} value={name} onChange={(change) => setName(change.target.value)} maxLength={120} placeholder="Café du port" />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1">
              <Field label="Type de lieu">
                {(props) => (
                  <Select {...props} value={type} onChange={(change) => setType(change.target.value as PlaceType)}>
                    {placeTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Ville" optional>
                {(props) => (
                  <Input {...props} value={city} onChange={(change) => setCity(change.target.value)} maxLength={120} placeholder="Lisbonne" />
                )}
              </Field>
            </div>
            <div>
              <Button icon="plus" disabled={saving || name.trim() === ''} onClick={() => void submit()}>
                {saving ? 'Ajout…' : 'Ajouter au voyage'}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel id="trip-places" title="Adresses du voyage" description="Celles de ce voyage seul — jamais celles du carnet.">
        {placesQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : places.length === 0 ? (
          <EmptyState
            icon="pin"
            title="Aucune adresse pour ce voyage"
            description="Ajoutez la première adresse du voyage : elle n’apparaîtra pas dans le carnet du foyer."
          />
        ) : (
          <div role="list" aria-label="Adresses du voyage" className="grid gap-2.5">
            {places.map((place) => (
              <div key={place.id} role="listitem" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3.5 py-3">
                <div className="min-w-[150px] flex-1">
                  <p className="m-0 text-[13px] font-[760]">{place.name}</p>
                  <small className="text-[11px] text-muted">
                    {place.city ?? 'Ville à préciser'}
                    {place.visited ? ' · déjà visité' : ' · à visiter'}
                  </small>
                </div>
                {!readOnly ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleVisited(place)}
                      aria-label={place.visited ? `Marquer ${place.name} à visiter` : `Marquer ${place.name} visité`}
                      aria-pressed={place.visited}
                      className="grid min-h-11 place-items-center rounded-[9px] px-2.5 text-[12px] font-semibold text-muted hover:bg-accent-faint hover:text-fg"
                    >
                      {place.visited ? 'Visité' : 'À visiter'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(place)}
                      aria-label={`Supprimer ${place.name}`}
                      className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                    >
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.name ?? ''} » ?`}
        description="L’adresse sera retirée du voyage."
        confirmLabel="Supprimer l’adresse"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
