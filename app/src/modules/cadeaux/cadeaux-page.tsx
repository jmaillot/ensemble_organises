import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { Badge, Switch } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MetricRow, ModuleShell, SectionHeading } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { formatEuro, formatShortDate, pluralize } from '@/lib/utils';
import {
  useAddGiftItem,
  useAddGiftList,
  useCadeaux,
  useDeleteGiftItem,
  useDeleteGiftList,
  useSyncGiftListShares,
  useUpdateGiftItem,
} from './hooks/use-cadeaux';
import { visibilityLabel, type GiftItem, type GiftList, type GiftShareInput, type GiftVisibility, type NewGiftItemInput } from './types';
import { GiftFormDialog } from './components/gift-form-dialog';
import { GiftShareDialog } from './components/gift-share-dialog';

const shareButtonBase =
  'inline-flex min-h-[33px] items-center gap-1.5 rounded-[9px] bg-bg px-2.5 text-[10px] font-extrabold text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-soft hover:text-accent-strong';

const cardAction =
  'grid size-[31px] shrink-0 place-items-center rounded-[9px] bg-transparent text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg';

export default function CadeauxPage() {
  const { lists, items, shares, members, currentMember, nextOccasion, isLoading, isError, error, refetch } = useCadeaux();
  const addItem = useAddGiftItem();
  const updateItem = useUpdateGiftItem();
  const deleteItem = useDeleteGiftItem();
  const addList = useAddGiftList();
  const deleteList = useDeleteGiftList();
  const syncShares = useSyncGiftListShares();
  const toast = useToast();

  const [requestedListId, setRequestedListId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editedItem, setEditedItem] = useState<GiftItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListVisibility, setNewListVisibility] = useState<GiftVisibility>('privee');
  const [pendingItemDeletion, setPendingItemDeletion] = useState<GiftItem | null>(null);
  const [pendingListDeletion, setPendingListDeletion] = useState<GiftList | null>(null);

  const currentMemberId = currentMember?.id ?? null;
  const activeList = lists.find((list) => list.id === requestedListId) ?? lists[0] ?? null;
  const activeItems = useMemo(
    () => items.filter((item) => item.listId === activeList?.id),
    [activeList?.id, items],
  );
  const activeShares = useMemo(
    () => shares.filter((share) => share.listId === activeList?.id),
    [activeList?.id, shares],
  );
  const isShared = activeShares.length > 0;

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return activeItems;
    return activeItems.filter((item) => `${item.name} ${item.comment ?? ''}`.toLowerCase().includes(needle));
  }, [activeItems, query]);

  const averageBudget = useMemo(() => {
    const priced = activeItems.filter((item) => item.price !== null);
    if (priced.length === 0) return 0;
    return priced.reduce((total, item) => total + (item.price ?? 0), 0) / priced.length;
  }, [activeItems]);

  const openCreate = () => {
    setEditedItem(null);
    setFormOpen(true);
  };

  const openEdit = (item: GiftItem) => {
    setEditedItem(item);
    setFormOpen(true);
  };

  const handleSubmitItem = async (values: NewGiftItemInput) => {
    try {
      if (editedItem) {
        await updateItem.mutateAsync({
          id: editedItem.id,
          values: {
            list_id: values.listId,
            name: values.name,
            price: values.price,
            comment: values.comment,
            photo_url: values.photoUrl,
            url: values.url,
          },
        });
        toast('Idée mise à jour.');
      } else {
        await addItem.mutateAsync(values);
        toast('Idée ajoutée à la liste.');
      }
      setFormOpen(false);
      setEditedItem(null);
    } catch (creationError) {
      toast(creationError instanceof Error ? creationError.message : 'Enregistrement impossible.', 'error');
    }
  };

  const handleTogglePurchased = async (item: GiftItem, purchased: boolean) => {
    try {
      await updateItem.mutateAsync({
        id: item.id,
        values: purchased
          ? { purchased: true, reserved_by: item.reservedBy ?? currentMemberId }
          : { purchased: false, reserved_by: item.reservedBy === currentMemberId ? null : item.reservedBy },
      });
    } catch {
      toast('Mise à jour impossible.', 'error');
    }
  };

  const handleDeleteItem = async () => {
    if (!pendingItemDeletion) return;
    setPendingItemDeletion(null);
    try {
      await deleteItem.mutateAsync(pendingItemDeletion.id);
      toast('Idée supprimée.');
    } catch {
      toast('Suppression impossible.', 'error');
    }
  };

  const handleDeleteList = async () => {
    if (!pendingListDeletion) return;
    setPendingListDeletion(null);
    try {
      await deleteList.mutateAsync(pendingListDeletion.id);
      setRequestedListId(null);
      toast('Liste supprimée.');
    } catch {
      toast('Suppression impossible.', 'error');
    }
  };

  const handleCreateList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newListName.trim() === '') return;
    try {
      const created = await addList.mutateAsync({ name: newListName, visibility: newListVisibility });
      setRequestedListId(created.id);
      setNewListName('');
      setCreatingList(false);
      toast('Liste créée.');
    } catch {
      toast('Création impossible.', 'error');
    }
  };

  const handleShare = async (listId: string, next: GiftShareInput[]) => {
    try {
      await syncShares.mutateAsync({
        listId,
        existing: shares.filter((share) => share.listId === listId).map((share) => ({
          id: share.id,
          list_id: share.listId,
          shared_with_member_id: share.memberId,
          shared_with_email: share.email,
          permission: share.permission,
        })),
        next,
      });
      setShareOpen(false);
      toast(next.length > 0 ? 'Partage enregistré.' : 'Partage retiré.');
    } catch (shareError) {
      toast(shareError instanceof Error ? shareError.message : 'Partage impossible.', 'error');
    }
  };

  return (
    <ModuleShell
      module="cadeaux"
      actions={
        <Button icon="plus" onClick={openCreate} disabled={!activeList}>
          Ajouter une idée
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Idées', value: activeItems.length, caption: 'dans cette liste' },
          { label: 'Partagées', value: activeShares.length, caption: pluralize(activeShares.length, 'partage') },
          { label: 'Budget moyen', value: formatEuro(averageBudget), caption: 'par idée' },
          {
            label: 'Prochaine occasion',
            value: nextOccasion?.name ?? '—',
            caption: nextOccasion ? `anniversaire · ${formatShortDate(nextOccasion.date)}` : 'aucune date suivie',
          },
        ]}
      />

      <SectionHeading
        title="Les idées à offrir"
        description="Partagez une liste précise avec le foyer ou un proche."
        action={
          <SearchInput
            aria-label="Rechercher une idée cadeau"
            placeholder="Rechercher une idée"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-[220px]"
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {lists.map((list) => (
          <div key={list.id} className="flex items-center gap-2">
            <Button
              variant={list.id === activeList?.id ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={list.id === activeList?.id}
              onClick={() => setRequestedListId(list.id)}
            >
              {list.name}
            </Button>
            {list.isPrivate ? (
              <Badge tone="coral">
                <Icon name="users" size="sm" className="mr-1" />
                {visibilityLabel.privee}
              </Badge>
            ) : null}
          </div>
        ))}

        {creatingList ? (
          <form onSubmit={handleCreateList} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Nom de la nouvelle liste"
              placeholder="Ex. Anniversaire de Lina"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              className="w-[200px]"
            />
            <Select
              aria-label="Visibilité de la liste"
              value={newListVisibility}
              onChange={(event) => setNewListVisibility(event.target.value as GiftVisibility)}
              className="w-[150px]"
            >
              <option value="privee">{visibilityLabel.privee}</option>
              <option value="foyer">{visibilityLabel.foyer}</option>
            </Select>
            <Button type="submit" size="sm" icon="check">
              Créer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreatingList(false)}>
              Annuler
            </Button>
          </form>
        ) : (
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setCreatingList(true)}>
            Créer une liste
          </Button>
        )}

        {activeList?.isOwned ? (
          <button
            type="button"
            className={`${cardAction} hover:bg-coral-soft hover:text-coral`}
            aria-label={`Supprimer la liste ${activeList.name}`}
            onClick={() => setPendingListDeletion(activeList)}
          >
            <Icon name="trash" size="sm" />
          </button>
        ) : null}
      </div>

      {activeList?.isPrivate ? (
        <p className="mb-4 rounded-[11px] bg-accent-faint px-3.5 py-2.5 text-[11px] text-ink-soft">
          Ne partagez pas cette liste : elle est votre surprise.
        </p>
      ) : null}

      {isLoading ? (
        <LoadingRows rows={3} />
      ) : isError ? (
        <ErrorState message={error?.message ?? 'Les listes de cadeaux sont inaccessibles.'} onRetry={refetch} />
      ) : lists.length === 0 ? (
        <EmptyState
          icon="gift"
          title="Aucune liste de cadeaux"
          description="Créez une liste pour garder vos idées au même endroit, puis partagez-la quand vous le décidez."
          actionLabel="Créer une liste"
          onAction={() => setCreatingList(true)}
        />
      ) : activeItems.length === 0 ? (
        <EmptyState
          icon="gift"
          title="Aucune idée cadeau pour le moment"
          description="Ajoutez une première idée : elle restera dans votre liste privée jusqu’à ce que vous la partagiez."
          actionLabel="Ajouter une idée"
          onAction={openCreate}
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon="search"
          title="Aucune idée ne correspond"
          description="Modifiez votre recherche ou ajoutez une nouvelle idée à cette liste."
          actionLabel="Ajouter une idée"
          onAction={openCreate}
          secondaryActionLabel="Effacer la recherche"
          onSecondaryAction={() => setQuery('')}
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-3 gap-[14px] p-0 max-[650px]:grid-cols-1">
          {visibleItems.map((item) => {
            const reservedByMe = item.reservedBy !== null && item.reservedBy === currentMemberId;
            return (
              <li key={item.id} className="panel-surface overflow-hidden rounded-[16px]">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.name} className="h-[146px] w-full object-cover" />
                ) : (
                  <div className="grid h-[146px] w-full place-items-center bg-accent-faint text-accent-soft">
                    <Icon name="gift" size="lg" />
                  </div>
                )}
                <div className="p-[15px]">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="mb-0 font-display text-[16px] tracking-[-0.035em]">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-accent-strong">
                          {item.name}
                        </a>
                      ) : (
                        item.name
                      )}
                    </h3>
                    {activeList?.isOwned ? (
                      <div className="flex gap-0.5">
                        <button type="button" className={cardAction} aria-label={`Modifier ${item.name}`} onClick={() => openEdit(item)}>
                          <Icon name="edit" size="sm" />
                        </button>
                        <button
                          type="button"
                          className={`${cardAction} hover:bg-coral-soft hover:text-coral`}
                          aria-label={`Supprimer l’idée ${item.name}`}
                          onClick={() => setPendingItemDeletion(item)}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {item.comment ? <p className="mb-3 text-[11px] text-muted">{item.comment}</p> : <div className="mb-3" />}

                  {activeList?.isOwned ? null : (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {item.reservedBy ? (
                        <Badge tone="amber">
                          {reservedByMe ? 'Réservé par vous' : `Réservé par ${item.reservedByName}`}
                        </Badge>
                      ) : null}
                      <label htmlFor={`gift-purchased-${item.id}`} className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted">
                        <Switch
                          id={`gift-purchased-${item.id}`}
                          checked={item.purchased}
                          onCheckedChange={(checked) => void handleTogglePurchased(item, checked)}
                        />
                        Acheté
                      </label>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-display text-[18px] tracking-[-0.04em]">
                      {item.price === null ? '—' : formatEuro(item.price)}
                    </strong>
                    <button
                      type="button"
                      className={`${shareButtonBase} ${isShared ? 'bg-accent-soft text-accent-strong' : ''}`}
                      onClick={() => setShareOpen(true)}
                    >
                      <Icon name="share" size="sm" />
                      {isShared ? 'Gérer' : 'Partager'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <GiftFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditedItem(null);
        }}
        lists={lists}
        defaultListId={activeList?.id ?? null}
        item={editedItem}
        onSubmit={handleSubmitItem}
        isPending={addItem.isPending || updateItem.isPending}
      />

      <GiftShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        list={activeList}
        members={members}
        existingShares={activeShares}
        onSubmit={(listId, next) => void handleShare(listId, next)}
        isPending={syncShares.isPending}
      />

      <ConfirmDialog
        open={Boolean(pendingItemDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingItemDeletion(null);
        }}
        title={pendingItemDeletion ? `Supprimer « ${pendingItemDeletion.name} »` : 'Supprimer l’idée'}
        description="Cette idée sera retirée de la liste. Cette action est définitive."
        confirmLabel="Supprimer"
        onConfirm={() => void handleDeleteItem()}
      />

      <ConfirmDialog
        open={Boolean(pendingListDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingListDeletion(null);
        }}
        title={pendingListDeletion ? `Supprimer la liste « ${pendingListDeletion.name} »` : 'Supprimer la liste'}
        description="Les idées et les partages de cette liste seront également supprimés."
        confirmLabel="Supprimer"
        onConfirm={() => void handleDeleteList()}
      />
    </ModuleShell>
  );
}
