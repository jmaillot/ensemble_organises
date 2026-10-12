/**
 * Onglet Courses d'un voyage (phase 15, 15-03) : fourche à filtre `tripId`,
 * jamais un drop-in de la page foyer (D-09).
 *
 * - Lecture : listes `trip_id = voyage courant`, articles par `list_id`
 *   (héritent du voyage par leur liste — le foyer les exclut déjà).
 * - Création : liste avec `trip_id` posé ; articles via `createShoppingItem`
 *   tel quel (liés à la liste, jamais au foyer directement).
 * - Écritures d'articles (cocher, renommer, supprimer) : helpers foyer
 *   réutilisés tels quels, scopés par la liste du voyage.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { data } from '@/lib/data';
import {
  createShoppingItem,
  deleteShoppingItem,
  deleteShoppingList,
} from '@/modules/courses/api';
import { guessRayon } from '@/modules/courses/types';
import type { ShoppingListItemRow } from '@/types';
import { createTripList, fetchTripListItems, fetchTripShoppingLists } from '../api';

export const tripCoursesKeys = {
  all: ['voyages', 'trip-courses'] as const,
  list: (tripId: string) => ['voyages', 'trip-courses', tripId] as const,
};

export interface TripCoursesTabProps {
  tripId: string;
  householdId: string;
  currentMemberId: string | null;
  readOnly?: boolean;
}

export function TripCoursesTab({ tripId, householdId, currentMemberId, readOnly = false }: TripCoursesTabProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [listName, setListName] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<string | null>(null);

  const listsQuery = useQuery({
    queryKey: tripCoursesKeys.list(tripId),
    queryFn: () => fetchTripShoppingLists(tripId),
  });
  const lists = useMemo(
    () => [...(listsQuery.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [listsQuery.data],
  );
  const listIds = useMemo(() => lists.map((list) => list.id), [lists]);
  const itemsQuery = useQuery({
    queryKey: [...tripCoursesKeys.list(tripId), 'items', listIds],
    enabled: listIds.length > 0,
    queryFn: () => fetchTripListItems(listIds),
  });
  const itemsByList = useMemo(() => {
    const grouped = new Map<string, ShoppingListItemRow[]>();
    for (const item of itemsQuery.data ?? []) {
      const bucket = grouped.get(item.list_id) ?? [];
      bucket.push(item);
      grouped.set(item.list_id, bucket);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return grouped;
  }, [itemsQuery.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: tripCoursesKeys.list(tripId) });
  };

  const submitList = async () => {
    if (savingList || listName.trim() === '') return;
    setSavingList(true);
    try {
      await createTripList({ tripId, householdId, name: listName, createdBy: currentMemberId });
      setListName('');
      refresh();
      toast('Liste ajoutée au voyage.');
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'La liste n’a pas pu être ajoutée.', 'error');
    } finally {
      setSavingList(false);
    }
  };

  const submitItem = async (listId: string) => {
    const name = (drafts[listId] ?? '').trim();
    if (savingItem || name === '') return;
    setSavingItem(listId);
    try {
      await createShoppingItem({
        householdId,
        listId,
        name,
        quantity: null,
        unit: null,
        rayon: guessRayon(name),
        addedBy: currentMemberId,
      });
      setDrafts((current) => ({ ...current, [listId]: '' }));
      refresh();
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'L’article n’a pas pu être ajouté.', 'error');
    } finally {
      setSavingItem(null);
    }
  };

  const toggleItem = (item: ShoppingListItemRow) => {
    void data
      .update('shopping_list_items', item.id, { checked: !item.checked })
      .then(refresh)
      .catch((toggleError: unknown) =>
        toast(toggleError instanceof Error ? toggleError.message : 'La case n’a pas pu être mise à jour.', 'error'),
      );
  };

  const removeItem = (item: ShoppingListItemRow) => {
    void deleteShoppingItem(item.id)
      .then(refresh)
      .catch((removalError: unknown) =>
        toast(removalError instanceof Error ? removalError.message : 'L’article n’a pas pu être supprimé.', 'error'),
      );
  };

  const confirmDeleteList = () => {
    const target = pendingDeleteList;
    setPendingDeleteList(null);
    if (!target) return;
    void deleteShoppingList(target, householdId)
      .then(() => {
        refresh();
        toast('Liste du voyage supprimée.');
      })
      .catch((removalError: unknown) =>
        toast(removalError instanceof Error ? removalError.message : 'La liste n’a pas pu être supprimée.', 'error'),
      );
  };

  if (listsQuery.isError) {
    return (
      <Panel id="trip-courses" title="Courses" description="Les listes propres à ce voyage.">
        <ErrorState
          message={listsQuery.error instanceof Error ? listsQuery.error.message : 'Les courses du voyage n’ont pas pu être chargées.'}
          onRetry={() => void listsQuery.refetch()}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-3.5">
      {!readOnly ? (
        <Panel id="trip-courses-new" title="Ajouter une liste" description="La liste appartient au voyage, jamais au foyer.">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-[200px] flex-1">
              <Field label="Nom de la liste">
                {(props) => (
                  <Input {...props} value={listName} onChange={(change) => setListName(change.target.value)} maxLength={120} placeholder="Valise" />
                )}
              </Field>
            </div>
            <Button icon="plus" disabled={savingList || listName.trim() === ''} onClick={() => void submitList()}>
              {savingList ? 'Ajout…' : 'Ajouter au voyage'}
            </Button>
          </div>
        </Panel>
      ) : null}

      {listsQuery.isLoading ? (
        <LoadingRows rows={3} />
      ) : lists.length === 0 ? (
        <Panel id="trip-courses" title="Courses du voyage" description="Celles de ce voyage seul.">
          <EmptyState
            icon="receipt"
            title="Aucune liste pour ce voyage"
            description="Ajoutez la première liste du voyage : elle n’apparaîtra pas dans les courses du foyer."
          />
        </Panel>
      ) : (
        lists.map((list) => {
          const items = itemsByList.get(list.id) ?? [];
          const checked = items.filter((item) => item.checked).length;
          return (
            <Panel
              key={list.id}
              id={`trip-courses-${list.id}`}
              title={list.name}
              description={`${items.length} article${items.length > 1 ? 's' : ''} · ${checked} coché${checked > 1 ? 's' : ''}`}
              action={
                !readOnly ? (
                  <button
                    type="button"
                    onClick={() => setPendingDeleteList(list.id)}
                    aria-label={`Supprimer la liste ${list.name}`}
                    className="grid size-11 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                ) : undefined
              }
            >
              {items.length === 0 ? (
                <p className="m-0 text-[12px] text-muted" role="status">Liste vide — ajoutez le premier article ci-dessous.</p>
              ) : (
                <div role="list" aria-label={`Articles de ${list.name}`} className="grid gap-2">
                  {items.map((item) => (
                    <div key={item.id} role="listitem" className="flex items-center gap-2.5">
                      {!readOnly ? (
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleItem(item)}
                          aria-label={`Cocher ${item.name}`}
                          className="size-6 shrink-0 accent-accent"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{item.name}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          aria-label={`Supprimer ${item.name}`}
                          className="grid size-11 shrink-0 place-items-center rounded-[9px] text-muted hover:bg-coral-soft hover:text-coral"
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {!readOnly ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Input
                    value={drafts[list.id] ?? ''}
                    onChange={(change) => setDrafts((current) => ({ ...current, [list.id]: change.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitItem(list.id);
                    }}
                    maxLength={120}
                    placeholder="Ajouter un article…"
                    aria-label={`Ajouter un article à ${list.name}`}
                    className="min-w-[180px] flex-1"
                  />
                  <Button
                    variant="secondary"
                    icon="plus"
                    disabled={savingItem === list.id || (drafts[list.id] ?? '').trim() === ''}
                    onClick={() => void submitItem(list.id)}
                  >
                    Ajouter
                  </Button>
                </div>
              ) : null}
            </Panel>
          );
        })
      )}

      <ConfirmDialog
        open={pendingDeleteList !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteList(null);
        }}
        title="Supprimer cette liste ?"
        description="La liste et ses articles seront retirés du voyage."
        confirmLabel="Supprimer la liste"
        onConfirm={confirmDeleteList}
      />
    </div>
  );
}
