import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { Badge, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MetricRow, ModuleShell, SectionHeading } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { formatEuro, formatShortDate, pluralize } from '@/lib/utils';
import { useHouseholdStore } from '@/stores/household-store';
import {
  useAddGiftIdea,
  useAddGiftItem,
  useAddGiftList,
  useCadeaux,
  useDeleteGiftIdea,
  useDeleteGiftItem,
  useDeleteGiftList,
  useSyncGiftListShares,
  useUpdateGiftIdea,
  useUpdateGiftItem,
} from './hooks/use-cadeaux';
import {
  ideaStatusLabel,
  visibilityLabel,
  type GiftIdea,
  type GiftItem,
  type GiftList,
  type GiftShareInput,
  type GiftVisibility,
  type NewGiftItemInput,
} from './types';
import { GiftFormDialog } from './components/gift-form-dialog';
import { GiftIdeaFormDialog, type GiftIdeaFormResult } from './components/gift-idea-form-dialog';
import { GiftShareDialog } from './components/gift-share-dialog';

const shareButtonBase =
  'inline-flex min-h-[33px] items-center gap-1.5 rounded-[9px] bg-bg px-2.5 text-[10px] font-extrabold text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-soft hover:text-accent-strong';

const cardAction =
  'grid size-[31px] shrink-0 place-items-center rounded-[9px] bg-transparent text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg';

/** Actions des cartes d'idées : zones tactiles ≥ 44px (D-05). */
const ideaAction =
  'inline-flex min-h-11 items-center gap-1.5 rounded-[9px] px-2.5 text-[12px] font-bold text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-accent-strong';

type CadeauxTab = 'listes' | 'idees' | 'contacts';

export default function CadeauxPage() {
  const {
    lists,
    items,
    shares,
    ideas,
    contactLists,
    contacts,
    members,
    currentMember,
    nextOccasion,
    isLoading,
    isError,
    error,
    refetch,
  } = useCadeaux();
  const householdId = useHouseholdStore((state) => state.householdId);
  const addItem = useAddGiftItem();
  const updateItem = useUpdateGiftItem();
  const deleteItem = useDeleteGiftItem();
  const addList = useAddGiftList();
  const deleteList = useDeleteGiftList();
  const syncShares = useSyncGiftListShares();
  const addIdea = useAddGiftIdea();
  const updateIdea = useUpdateGiftIdea();
  const deleteIdea = useDeleteGiftIdea();
  const toast = useToast();

  const [tab, setTab] = useState<CadeauxTab>('listes');
  const [requestedListId, setRequestedListId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editedItem, setEditedItem] = useState<GiftItem | null>(null);
  const [ideaFormOpen, setIdeaFormOpen] = useState(false);
  const [editedIdea, setEditedIdea] = useState<GiftIdea | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [creatingList, setCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListVisibility, setNewListVisibility] = useState<GiftVisibility>('privee');
  const [pendingItemDeletion, setPendingItemDeletion] = useState<GiftItem | null>(null);
  const [pendingListDeletion, setPendingListDeletion] = useState<GiftList | null>(null);
  const [pendingIdeaDeletion, setPendingIdeaDeletion] = useState<GiftIdea | null>(null);

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

  const openCreateIdea = () => {
    setEditedIdea(null);
    setIdeaFormOpen(true);
  };

  const openEditIdea = (idea: GiftIdea) => {
    setEditedIdea(idea);
    setIdeaFormOpen(true);
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

  const handleSubmitIdea = async ({ values, photoFile }: GiftIdeaFormResult) => {
    let photoUrl = values.photoUrl;
    let depositedPath: string | null = null;
    try {
      if (photoFile) {
        if (!householdId) throw new Error('Aucun foyer sélectionné.');
        const deposited = await depositHouseholdFile({ householdId, folder: 'cadeaux', file: photoFile });
        photoUrl = deposited.url;
        depositedPath = deposited.path;
      }
      if (editedIdea) {
        await updateIdea.mutateAsync({
          id: editedIdea.id,
          values: {
            name: values.name,
            price: values.price,
            url: values.url,
            comment: values.comment,
            photo_url: photoUrl,
            status: values.status,
            giftee_text: values.gifteeText,
            giftee_contact_id: values.gifteeContactId,
          },
        });
        toast('Idée mise à jour.');
      } else {
        await addIdea.mutateAsync({ ...values, photoUrl });
        toast('Idée ajoutée.');
      }
      setIdeaFormOpen(false);
      setEditedIdea(null);
    } catch (creationError) {
      // Compensation T-05-09 : aucun dépôt orphelin en bucket privé.
      if (depositedPath) await removeHouseholdFile(depositedPath).catch(() => {});
      toast(creationError instanceof Error ? creationError.message : 'Enregistrement impossible.', 'error');
    }
  };

  const handleToggleIdeaStatus = async (idea: GiftIdea) => {
    const next = idea.status === 'offert' ? 'a_offrir' : 'offert';
    try {
      await updateIdea.mutateAsync({ id: idea.id, values: { status: next } });
      toast(
        next === 'offert'
          ? 'Idée marquée offerte : les articles liés suivront côté serveur.'
          : 'Idée remise à offrir.',
      );
    } catch {
      toast('Mise à jour impossible.', 'error');
    }
  };

  const handleDeleteIdea = async () => {
    if (!pendingIdeaDeletion) return;
    setPendingIdeaDeletion(null);
    try {
      await deleteIdea.mutateAsync(pendingIdeaDeletion.id);
      toast('Idée supprimée.');
    } catch {
      toast('Suppression impossible.', 'error');
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
        tab === 'idees' ? (
          <Button icon="plus" onClick={openCreateIdea}>
            Noter une idée
          </Button>
        ) : tab === 'listes' ? (
          <Button icon="plus" onClick={openCreate} disabled={!activeList}>
            Ajouter une idée
          </Button>
        ) : null
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

      <Tabs value={tab} onValueChange={(value) => setTab(value as CadeauxTab)}>
        <TabsList aria-label="Cadeaux : listes, idées, contacts">
          <TabsTrigger value="listes" className="min-h-11">
            {`Listes (${lists.length})`}
          </TabsTrigger>
          <TabsTrigger value="idees" className="min-h-11">
            {`Idées (${ideas.length})`}
          </TabsTrigger>
          <TabsTrigger value="contacts" className="min-h-11">
            Contacts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listes">
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
        </TabsContent>

        <TabsContent value="idees">
          <SectionHeading
            title="Les idées en réflexion"
            description="Pour qui, quel prix, quel statut — et la prochaine occasion du contact lié."
          />

          {isLoading ? (
            <LoadingRows rows={3} />
          ) : isError ? (
            <ErrorState message={error?.message ?? 'Les idées cadeau sont inaccessibles.'} onRetry={refetch} />
          ) : ideas.length === 0 ? (
            <EmptyState
              icon="gift"
              title="Aucune idée pour le moment"
              description="Notez une envie en deux champs : pour qui, et à quel prix. La surprise reste protégée côté serveur."
              actionLabel="Noter une idée"
              onAction={openCreateIdea}
            />
          ) : (
            <ul className="m-0 grid list-none grid-cols-3 gap-[14px] p-0 max-[650px]:grid-cols-1">
              {ideas.map((idea) => (
                <li key={idea.id} className="panel-surface overflow-hidden rounded-[16px]">
                  {idea.photoUrl ? (
                    <img src={idea.photoUrl} alt={idea.name} className="h-[146px] w-full object-cover" />
                  ) : (
                    <div className="grid h-[146px] w-full place-items-center bg-accent-faint text-accent-soft">
                      <Icon name="gift" size="lg" />
                    </div>
                  )}
                  <div className="p-[15px]">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="mb-0 font-display text-[16px] tracking-[-0.035em]">{idea.name}</h3>
                      <Badge tone={idea.status === 'offert' ? 'accent' : 'muted'}>{ideaStatusLabel[idea.status]}</Badge>
                    </div>
                    {idea.gifteeName ? (
                      <p className="mb-1 text-[11px] font-semibold text-muted">Pour {idea.gifteeName}</p>
                    ) : null}
                    {idea.nextOccasionDate ? (
                      <p className="mb-1 text-[11px] text-muted">
                        Prochaine occasion · {formatShortDate(idea.nextOccasionDate)}
                      </p>
                    ) : null}
                    {idea.comment ? <p className="mb-3 text-[11px] text-muted">{idea.comment}</p> : <div className="mb-3" />}
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <strong className="font-display text-[18px] tracking-[-0.04em]">
                        {idea.price === null ? '—' : formatEuro(idea.price)}
                      </strong>
                      <button type="button" className={ideaAction} onClick={() => void handleToggleIdeaStatus(idea)}>
                        <Icon name="check" size="sm" />
                        {idea.status === 'offert' ? 'Remettre à offrir' : 'Marquer offert'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" className={ideaAction} aria-label={`Modifier l’idée ${idea.name}`} onClick={() => openEditIdea(idea)}>
                        <Icon name="edit" size="sm" />
                        Modifier
                      </button>
                      <button
                        type="button"
                        className={`${ideaAction} hover:bg-coral-soft hover:text-coral`}
                        aria-label={`Supprimer l’idée ${idea.name}`}
                        onClick={() => setPendingIdeaDeletion(idea)}
                      >
                        <Icon name="trash" size="sm" />
                        Supprimer
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="contacts">
          <SectionHeading
            title="Les contacts à gâter"
            description="Les fiches vivent dans le module Contacts : ici, juste le lien vers la prochaine occasion."
          />
          {isLoading ? (
            <LoadingRows rows={1} />
          ) : (
            <div className="panel-surface grid gap-3 rounded-[16px] p-[15px]">
              <p className="m-0 text-[12px] text-muted">
                {`${contactLists.length} ${pluralize(contactLists.length, 'liste')} · ${contacts.length} ${pluralize(contacts.length, 'contact')} suivi(s).`}
              </p>
              <p className="m-0 text-[12px] text-muted">
                Liez une idée à un contact pour voir sa prochaine occasion — et la surprise suit automatiquement.
              </p>
              <div>
                <Button variant="secondary" asChild>
                  <Link to="/contacts">
                    <Icon name="arrow" size="sm" />
                    Ouvrir les contacts
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

      <GiftIdeaFormDialog
        open={ideaFormOpen}
        onOpenChange={(open) => {
          setIdeaFormOpen(open);
          if (!open) setEditedIdea(null);
        }}
        contacts={contacts}
        idea={editedIdea}
        onSubmit={handleSubmitIdea}
        isPending={addIdea.isPending || updateIdea.isPending}
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
        open={Boolean(pendingIdeaDeletion)}
        onOpenChange={(open) => {
          if (!open) setPendingIdeaDeletion(null);
        }}
        title={pendingIdeaDeletion ? `Supprimer « ${pendingIdeaDeletion.name} »` : 'Supprimer l’idée'}
        description="Cette idée sera retirée du foyer. Les articles de liste déjà créés depuis elle sont conservés."
        confirmLabel="Supprimer"
        onConfirm={() => void handleDeleteIdea()}
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
