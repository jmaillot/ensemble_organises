import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Input, SearchInput, Select } from '@/components/ui/input';
import { Badge, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { MetricRow, ModuleShell, SectionHeading } from '@/components/shared/module-shell';
import { Icon } from '@/components/shared/icon';
import { depositHouseholdFile, removeHouseholdFile } from '@/lib/storage';
import { formatEuro, formatShortDate, pluralize } from '@/lib/utils';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import {
  useAddGiftIdea,
  useAddGiftItem,
  useAddGiftList,
  useCadeaux,
  useDeleteGiftIdea,
  useDeleteGiftItem,
  useDeleteGiftList,
  useLeaveGiftList,
  usePromoteGiftIdea,
  useReserveMemberGiftItem,
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
  const leaveList = useLeaveGiftList();
  const syncShares = useSyncGiftListShares();
  const addIdea = useAddGiftIdea();
  const updateIdea = useUpdateGiftIdea();
  const deleteIdea = useDeleteGiftIdea();
  const promoteIdea = usePromoteGiftIdea();
  const reserveForeign = useReserveMemberGiftItem();
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
  const [pendingLeave, setPendingLeave] = useState<GiftList | null>(null);
  const [pendingIdeaDeletion, setPendingIdeaDeletion] = useState<GiftIdea | null>(null);
  const [pendingRelease, setPendingRelease] = useState<GiftItem | null>(null);
  const [promotedIdea, setPromotedIdea] = useState<GiftIdea | null>(null);
  const [promoteListId, setPromoteListId] = useState('');

  const currentMemberId = currentMember?.id ?? null;
  const [listFilter, setListFilter] = useState<'toutes' | 'privees' | 'foyer' | 'partagees'>('toutes');
  const shownLists = useMemo(
    () =>
      listFilter === 'toutes'
        ? lists
        : listFilter === 'privees'
          ? lists.filter((list) => list.isPrivate)
          : listFilter === 'foyer'
            ? lists.filter((list) => !list.isPrivate && !list.isForeign)
            : lists.filter((list) => list.isForeign),
    [listFilter, lists],
  );
  const activeList = shownLists.find((list) => list.id === requestedListId) ?? shownLists[0] ?? null;
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

  const openPromote = (idea: GiftIdea) => {
    setPromotedIdea(idea);
    setPromoteListId(activeList?.id ?? lists[0]?.id ?? '');
  };

  /**
   * Promotion idée→article (D-05) : l'article porte `idea_id`. L'UI relit
   * après mutation : passer l'idée à `offert` y reflète l'achat propagé par
   * le trigger serveur (D-06).
   */
  const handlePromote = async () => {
    if (!promotedIdea || promoteListId === '') return;
    const target = lists.find((list) => list.id === promoteListId);
    try {
      await promoteIdea.mutateAsync({
        listId: promoteListId,
        idea: {
          id: promotedIdea.id,
          name: promotedIdea.name,
          price: promotedIdea.price,
          url: promotedIdea.url,
          comment: promotedIdea.comment,
          photo_url: promotedIdea.photoUrl,
        },
      });
      setPromotedIdea(null);
      toast(`Article ajouté à « ${target?.name ?? 'la liste'} ».`);
    } catch (promotionError) {
      toast(promotionError instanceof Error ? promotionError.message : 'Ajout impossible.', 'error');
    }
  };

  const handleTogglePurchased = async (item: GiftItem, purchased: boolean) => {
    // Tenu anonymement (CR-01) : refuser AVANT l'UPDATE avec un message
    // propre, plutôt que de manger une violation CHECK
    // (`gift_items_single_author_check`) en toast d'erreur.
    if (purchased && item.heldAnonymously && item.reservedBy !== currentMemberId) {
      toast('Cet article est déjà réservé.', 'error');
      return;
    }
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

  // Propriétaire : marquer « reçu » ne touche jamais à `reserved_by` (la
  // réservation reste l'affaire des invités, et la surprise intacte).
  // G-06-20 : DÉCOCHER sur un article qui s'affiche réservé (même condition
  // que le badge : `purchased || heldAnonymously`), c'est libérer la réserve
  // — l'appelant ouvre donc la confirmation existante au lieu d'effacer le
  // drapeau en silence (voir le `onCheckedChange` propriétaire).
  const handleToggleReceived = async (item: GiftItem, purchased: boolean) => {
    try {
      await updateItem.mutateAsync({ id: item.id, values: { purchased } });
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

  /**
   * Départ volontaire d'une liste rejointe (G-06-1c) : le serveur supprime
   * exactement les parts de l'appelant — la liste quitte la vue au refetch,
   * ses tenues attribuées restent, le lien rejoint normalement. Le refus
   * uniforme (404 « lien ne passe plus ») est dit tel quel, comme l'oracle
   * invité. Action confirmée par modale (AGENTS.md §6), jamais en un tap.
   */
  const handleLeave = async () => {
    if (!pendingLeave) return;
    setPendingLeave(null);
    try {
      await leaveList.mutateAsync(pendingLeave.id);
      setRequestedListId(null);
      toast('Liste quittée. Vos réservations à votre nom sont conservées.');
    } catch (leaveError) {
      toast(leaveError instanceof Error ? leaveError.message : 'Départ impossible.', 'error');
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

  /**
   * Garantit la part `lecture` d'un destinataire e-mail SANS fermer le
   * dialogue (D-04, partage d'abord) : le panneau d'envoi l'appelle avant
   * l'action serveur `send-email`, qui recrée la part côté serveur avant
   * l'envoi (jamais d'envoi sans part, jamais de dégradation d'une part
   * `reservation` existante).
   */
  const handleEnsureLectureShare = async (listId: string, email: string) => {
    const normalized = email.trim().toLowerCase();
    const existing = shares
      .filter((share) => share.listId === listId)
      .map((share) => ({
        id: share.id,
        list_id: share.listId,
        shared_with_member_id: share.memberId,
        shared_with_email: share.email,
        permission: share.permission,
      }));
    const already = shares.some(
      (share) => share.listId === listId && (share.email ?? '').trim().toLowerCase() === normalized,
    );
    const next: GiftShareInput[] = shares
      .filter((share) => share.listId === listId)
      .map((share) => ({ memberId: share.memberId, email: share.email, permission: share.permission }));
    if (!already) next.push({ memberId: null, email: email.trim(), permission: 'lecture' });
    await syncShares.mutateAsync({ listId, existing, next });
  };

  // Libération d'une réservation par l'organisateur (D-08) : les deux
  // formes d'auteur (membre comme nom déclaré) sont effacées en une action
  // explicite, confirmée par modale comme toute action destructrice. Le
  // garde serveur refuse la même écriture à un non-gestionnaire (0029).
  const isAdmin = useIsAdmin();
  // Liste rejointe d'un autre foyer (G-06-1b-bis) : lecture seule côté
  // client — pas de gestion (partage, suppression, libération), réserve
  // via la voie serveur attribuée uniquement.
  const isForeignList = activeList?.isForeign ?? false;
  const isManager = !isForeignList && ((activeList?.isOwned ?? false) || isAdmin);

  /**
   * Réserve sur liste étrangère : le garde 0083 refuse l'écriture directe
   * (prouvé en 0033 §1), seule la voie serveur attribue l'identité vérifiée.
   * Hors ligne / sans serveur, l'erreur Edge est dite telle quelle (repli
   * déterministe du mode démo).
   */
  const handleForeignReserve = async (item: GiftItem) => {
    try {
      const outcome = await reserveForeign.mutateAsync(item.id);
      toast(outcome.alreadyReserved ? 'Déjà réservé par vous.' : 'Article réservé.');
    } catch (reserveError) {
      toast(reserveError instanceof Error ? reserveError.message : 'Réserve impossible.', 'error');
    }
  };

  const handleRelease = async () => {
    if (!pendingRelease) return;
    setPendingRelease(null);
    try {
      await updateItem.mutateAsync({
        id: pendingRelease.id,
        // Les deux formes d'auteur (membre comme nom déclaré) sont effacées
        // en une action explicite : `reserved_by_name` est désormais typé
        // (WR-03), plus de contournement nécessaire.
        values: { reserved_by: null, purchased: false, reserved_by_name: null },
      });
      toast('Réservation libérée.');
    } catch {
      toast('Libération impossible.', 'error');
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
          <>
            <Button variant="secondary" icon="plus" onClick={() => setCreatingList(true)}>
              Créer une liste
            </Button>
            {!isForeignList ? (
              <Button icon="plus" onClick={openCreate} disabled={!activeList}>
                Ajouter une idée
              </Button>
            ) : null}
          </>
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

          <div className="mb-4 grid gap-2">
            <div role="group" aria-label="Filtrer les listes" className="flex items-center gap-1">
              {(
                [
                  { value: 'toutes', label: 'Toutes' },
                  { value: 'privees', label: 'Privées' },
                  { value: 'foyer', label: 'Foyer' },
                  { value: 'partagees', label: 'Partagées' },
                ] as const
              ).map((option) => (
                <Button
                  key={option.value}
                  variant={listFilter === option.value ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={listFilter === option.value}
                  onClick={() => setListFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {shownLists.length > 1 ? (
                <div role="group" aria-label="Listes de cadeaux" className="flex flex-wrap items-center gap-2">
                  {shownLists.map((list) => (
                    <Button
                      key={list.id}
                      variant={list.id === activeList?.id ? 'primary' : 'secondary'}
                      aria-pressed={list.id === activeList?.id}
                      onClick={() => setRequestedListId(list.id)}
                    >
                      {list.name}
                    </Button>
                  ))}
                </div>
              ) : shownLists.length === 1 ? (
                <span className="text-[13px] font-bold text-fg">{shownLists[0].name}</span>
              ) : null}
            </div>
            {shownLists.length === 0 ? (
              <p className="text-sm text-muted">
                {listFilter === 'privees'
                  ? 'Aucune liste privée pour le moment.'
                  : listFilter === 'partagees'
                    ? 'Aucune liste partagée rejointe pour le moment.'
                    : 'Aucune liste partagée avec le foyer pour le moment.'}
              </p>
            ) : null}

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
            ) : null}

            {activeList && !isForeignList ? (
              <button
                type="button"
                className={`${shareButtonBase} ${isShared ? 'bg-accent-soft text-accent-strong' : ''}`}
                aria-label={isShared ? `Gérer le partage de ${activeList.name}` : `Partager ${activeList.name}`}
                onClick={() => setShareOpen(true)}
              >
                <Icon name="share" size="sm" />
                {isShared ? 'Gérer' : 'Partager'}
              </button>
            ) : null}
            {activeList?.isForeign ? (
              <Badge tone="muted">
                {activeList.originLabel ? `Liste partagée · ${activeList.originLabel}` : 'Liste partagée'}
              </Badge>
            ) : null}
            {isForeignList ? (
              // Départ volontaire (G-06-1c) : même condition d'étrangeté que
              // le badge — jamais sur les listes du foyer, jamais pour un
              // gestionnaire (toujours faux sur liste étrangère : isManager
              // exige !isForeignList). Modale obligatoire (AGENTS.md §6).
              <button
                type="button"
                className={shareButtonBase}
                aria-label={`Quitter la liste ${activeList?.name ?? ''}`}
                onClick={() => activeList && setPendingLeave(activeList)}
              >
                Quitter cette liste
              </button>
            ) : null}
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

                      {activeList?.isOwned ? (
                        // Surprise (0080) : le propriétaire voit QU'un article
                        // est réservé (`purchased` exposé par la vue, ou tenue
                        // anonyme visible), jamais PAR QUI (`reserved_by` NULL
                        // via la vue, nom déclaré jamais exposé — D-07).
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {item.purchased || item.heldAnonymously ? <Badge tone="amber">Réservé</Badge> : null}
                          <label htmlFor={`gift-received-${item.id}`} className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted">
                            <Switch
                              id={`gift-received-${item.id}`}
                              checked={item.purchased}
                              onCheckedChange={(checked) => {
                                // G-06-20 : décocher « Reçu » sur un article
                                // qui s'affiche réservé (même condition que le
                                // badge), c'est libérer la réserve — la
                                // confirmation existante tranche (D-08),
                                // jamais un effacement silencieux.
                                // L'interrupteur reste coché tant que la
                                // modale n'est pas confirmée ; annuler ne
                                // touche à rien. Hors réserve affichée,
                                // simple suivi sans toucher aux auteurs.
                                if (!checked && (item.purchased || item.heldAnonymously)) {
                                  setPendingRelease(item);
                                  return;
                                }
                                void handleToggleReceived(item, checked);
                              }}
                            />
                            Reçu
                          </label>
                          {(item.purchased || item.heldAnonymously) && isManager ? (
                            <button
                              type="button"
                              className={shareButtonBase}
                              aria-label={`Libérer la réserve de ${item.name}`}
                              onClick={() => setPendingRelease(item)}
                            >
                              Libérer la réserve
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          {item.reservedBy ? (
                            <Badge tone="amber">
                              {reservedByMe
                                ? 'Réservé par vous'
                                : item.reservedByName
                                  ? `Réservé par ${item.reservedByName}`
                                  : // Membre d'un autre foyer (G-06-1b-bis) :
                                    // l'id ne se résout pas ici — « Réservé »
                                    // seul, sans auteur inconnu.
                                    'Réservé'}
                            </Badge>
                          ) : item.heldAnonymously ? (
                            // Tenue anonyme (D-05) ou attribuée inter-foyers
                            // (G-06-1b-bis) : réservé, sans auteur (D-07 — le
                            // nom déclaré ne sort jamais du mapping).
                            <Badge tone="amber">Réservé</Badge>
                          ) : null}
                          {isForeignList ? (
                            item.reservedBy || item.heldAnonymously ? (
                              // Tenue d'autrui sur liste étrangère : état
                              // visible, aucune action (ni réserve directe —
                              // garde 0083 — ni libération non-gestionnaire).
                              <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted">
                                <Switch
                                  id={`gift-purchased-${item.id}`}
                                  checked={item.purchased}
                                  disabled
                                  aria-label={`Acheté (réservé, ${item.name})`}
                                />
                                Acheté
                              </span>
                            ) : (
                              <label
                                htmlFor={`gift-purchased-${item.id}`}
                                className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted"
                              >
                                <Switch
                                  id={`gift-purchased-${item.id}`}
                                  checked={item.purchased}
                                  disabled={reserveForeign.isPending}
                                  onCheckedChange={() => void handleForeignReserve(item)}
                                />
                                Acheté
                              </label>
                            )
                          ) : (
                            <label
                              htmlFor={`gift-purchased-${item.id}`}
                              className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted"
                            >
                              <Switch
                                id={`gift-purchased-${item.id}`}
                                checked={item.purchased}
                                onCheckedChange={(checked) => void handleTogglePurchased(item, checked)}
                              />
                              Acheté
                            </label>
                          )}
                          {(item.reservedBy || item.heldAnonymously) && isManager ? (
                            <button
                              type="button"
                              className={shareButtonBase}
                              aria-label={`Libérer la réserve de ${item.name}`}
                              onClick={() => setPendingRelease(item)}
                            >
                              Libérer la réserve
                            </button>
                          ) : null}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <strong className="font-display text-[18px] tracking-[-0.04em]">
                          {item.price === null ? '—' : formatEuro(item.price)}
                        </strong>
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
                        className={ideaAction}
                        aria-label={`Ajouter l’idée ${idea.name} à une liste`}
                        onClick={() => openPromote(idea)}
                        disabled={lists.length === 0}
                      >
                        <Icon name="plus" size="sm" />
                        Ajouter à une liste
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
                {`${pluralize(contactLists.length, 'liste')} · ${pluralize(contacts.length, 'contact suivi', 'contacts suivis')}.`}
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
        onEnsureLectureShare={(listId, email) => handleEnsureLectureShare(listId, email)}
        isPending={syncShares.isPending}
      />

      <Dialog
        open={Boolean(promotedIdea)}
        onOpenChange={(open) => {
          if (!open) setPromotedIdea(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow mb-2">Cadeaux</p>
            <DialogTitle>Ajouter à une liste</DialogTitle>
            <DialogDescription>
              {promotedIdea
                ? `« ${promotedIdea.name} » deviendra un article lié : passer l’idée à « offert » l’y marquera acheté.`
                : 'Choisissez la liste qui recevra cet article.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3.5">
            <label className="grid gap-1.5 text-[11px] font-extrabold text-muted">
              Liste destinataire
              <Select
                aria-label="Liste destinataire"
                value={promoteListId}
                onChange={(event) => setPromoteListId(event.target.value)}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </Select>
            </label>
            <DialogActions>
              <Button variant="secondary" onClick={() => setPromotedIdea(null)}>
                Annuler
              </Button>
              <Button icon="plus" disabled={promoteIdea.isPending || promoteListId === ''} onClick={() => void handlePromote()}>
                {promoteIdea.isPending ? 'Ajout…' : 'Ajouter l’article'}
              </Button>
            </DialogActions>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingRelease)}
        onOpenChange={(open) => {
          if (!open) setPendingRelease(null);
        }}
        title={pendingRelease ? `Libérer « ${pendingRelease.name} »` : 'Libérer la réservation'}
        description="La réservation sera effacée et l’article redeviendra libre. Cette action est visible par tous."
        confirmLabel="Libérer la réserve"
        onConfirm={() => void handleRelease()}
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

      <ConfirmDialog
        open={Boolean(pendingLeave)}
        onOpenChange={(open) => {
          if (!open) setPendingLeave(null);
        }}
        title={pendingLeave ? `Quitter « ${pendingLeave.name} »` : 'Quitter cette liste'}
        description="La liste quittera vos Cadeaux. Vos réservations à votre nom sont conservées, et le lien d’invitation vous permettra de rejoindre à nouveau."
        confirmLabel="Quitter"
        destructive={false}
        onConfirm={() => void handleLeave()}
      />
    </ModuleShell>
  );
}
