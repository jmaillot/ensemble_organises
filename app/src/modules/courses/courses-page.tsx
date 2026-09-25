import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ModuleShell, Panel, MetricRow } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore, useMemberName } from '@/stores/household-store';
import { formatMediumDate, formatWeekday, pluralize, relativeDayLabel, toLocalDate } from '@/lib/utils';
import { useCourses } from './hooks/use-courses';
import { ItemFormDialog } from './components/item-form-dialog';
import { ShoppingGroupCard } from './components/shopping-group-card';
import type { Grouping, ItemFormValues, ShoppingItem, ShoppingListView } from './types';

const listSchema = z.object({
  name: z.string().trim().min(2, 'Donnez un nom à la liste.').max(60, '60 caractères maximum.'),
});

const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Heure locale d'un `start_at` timestamptz. */
const formatTime = (iso: string) => timeFormatter.format(toLocalDate(iso));

type ListFormValues = z.infer<typeof listSchema>;

export default function CoursesPage() {
  const toast = useToast();
  const householdName = useHouseholdStore((state) => state.householdName);
  const currentMemberName = useMemberName();
  const {
    lists,
    itemCount,
    checkedCount,
    suggestionsFor,
    nextCourse,
    isLoading,
    isError,
    error,
    refetch,
    isMutating,
    toggleItem,
    addItem,
    addItemToList,
    addList,
    removeItem,
    removeList,
  } = useCourses();

  const [grouping, setGrouping] = useState<Grouping>('rayon');
  const [itemDialog, setItemDialog] = useState<{ open: boolean }>({ open: false });
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<ShoppingItem | null>(null);
  const [pendingList, setPendingList] = useState<ShoppingListView | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ListFormValues>({ resolver: zodResolver(listSchema), defaultValues: { name: '' } });

  const openNewList = () => {
    reset({ name: '' });
    setListDialogOpen(true);
  };

  const submitList = handleSubmit(async (values) => {
    await addList(values.name);
    setListDialogOpen(false);
    toast(`Liste « ${values.name.trim()} » créée.`, 'success');
  });

  const submitItem = async (values: ItemFormValues) => {
    await addItem(values);
    setItemDialog({ open: false });
    toast(`« ${values.name.trim()} » ajouté à votre liste.`, 'success');
  };

  /** L'apparition de la ligne suffit comme retour : seul l'erreur est signalée. */
  const runQuietly = (action: () => Promise<void>, fallback: string) => {
    void action().catch((actionError: unknown) => {
      toast(actionError instanceof Error ? actionError.message : fallback, 'error');
    });
  };

  const handleQuickAdd = (listId: string, name: string) => {
    runQuietly(() => addItemToList(listId, name), 'Ajout impossible.');
  };

  const handleToggle = (item: ShoppingItem) => {
    runQuietly(() => toggleItem(item), 'Mise à jour impossible.');
  };

  return (
    <ModuleShell
      module="courses"
      actions={
        <>
          <Button variant="secondary" icon="plus" onClick={openNewList}>
            Nouvelle liste
          </Button>
          <Button icon="plus" disabled={isLoading} onClick={() => setItemDialog({ open: true })}>
            Ajouter un article
          </Button>
        </>
      }
    >
      <p className="sr-only" aria-live="polite">
        {`${lists.length} listes, ${itemCount} articles, dont ${checkedCount} dans le panier.`}
      </p>

      <MetricRow
        items={[
          { label: 'Listes', value: lists.length, caption: lists.length > 1 ? 'listes actives' : 'liste active' },
          { label: 'Articles', value: itemCount, caption: 'à acheter au total' },
          { label: 'Dans le panier', value: checkedCount, caption: 'articles cochés' },
          {
            label: 'Prochaine course',
            value: nextCourse ? formatWeekday(nextCourse.start_at).toUpperCase() : '—',
            caption: nextCourse
              ? `${relativeDayLabel(nextCourse.start_at.slice(0, 10))} · ${formatTime(nextCourse.start_at)}`
              : 'aucune course planifiée',
          },
        ]}
      />

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] gap-[18px] max-[920px]:grid-cols-1">
        <Panel
          id="shopping-list-panel"
          title="Listes de courses"
          description="Cochez, partagez, et laissez le reste au foyer."
          action={
            <div className="flex items-center gap-2">
              <label htmlFor="courses-grouping" className="text-[11px] font-extrabold text-muted">
                Regroupement
              </label>
              <Select
                id="courses-grouping"
                value={grouping}
                onChange={(event) => setGrouping(event.target.value === 'ajout' ? 'ajout' : 'rayon')}
                className="min-w-[170px]"
              >
                <option value="rayon">Par rayon</option>
                <option value="ajout">Par ordre d’ajout</option>
              </Select>
            </div>
          }
        >
          {isLoading ? <LoadingRows rows={3} /> : null}

          {!isLoading && isError ? (
            <ErrorState message={error?.message ?? 'Les listes de courses sont inaccessibles.'} onRetry={refetch} />
          ) : null}

          {!isLoading && !isError && lists.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="Aucune liste pour ce foyer"
              description="Créez une première liste, puis ajoutez les articles au fil de vos passages en magasin."
              actionLabel="Nouvelle liste"
              onAction={openNewList}
            />
          ) : null}

          {!isLoading && !isError && lists.length > 0 ? (
            <div className="grid grid-cols-1 gap-[17px]">
              {lists.map((list) => (
                <ShoppingGroupCard
                  key={list.id}
                  list={list}
                  grouping={grouping}
                  suggestions={suggestionsFor(list.id)}
                  disabled={isMutating}
                  onToggle={handleToggle}
                  onQuickAdd={handleQuickAdd}
                  onDelete={setPendingItem}
                  onDeleteList={setPendingList}
                />
              ))}
            </div>
          ) : null}
        </Panel>

        <aside className="grid min-w-0 grid-cols-1 gap-[14px]">
          <div className="relative min-h-[150px] overflow-hidden rounded-[16px] bg-fg p-[18px] text-surface">
            <span aria-hidden="true" className="coupon-ring" />
            <p className="mb-4 text-[11px] text-on-dark">Liste partagée · {householdName}</p>
            <strong className="block font-display text-[27px] tracking-[-0.06em]">
              {pluralize(lists.length, 'liste')}
            </strong>
            <small className="text-[10px] text-on-dark">
              Tout le monde voit les changements en temps réel.
            </small>
          </div>

          <Panel title="Prochaine course" description="Depuis votre calendrier.">
            {nextCourse ? (
              <div className="flex items-start gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent-soft text-accent-strong">
                  <Icon name="receipt" size="sm" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-[13px]">{nextCourse.title}</strong>
                  <small className="text-[11px] text-muted">
                    {formatMediumDate(nextCourse.start_at)} · {formatTime(nextCourse.start_at)} ·{' '}
                    {relativeDayLabel(nextCourse.start_at.slice(0, 10))}
                  </small>
                  {nextCourse.location ? (
                    <small className="block text-[11px] text-muted">{nextCourse.location}</small>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="m-0 text-xs text-muted">
                Aucune course planifiée. Ajoutez un événement « Courses » au calendrier pour la retrouver ici.
              </p>
            )}
          </Panel>

          <Panel>
            <Button
              variant="secondary"
              icon="plus"
              fullWidth
              disabled={isLoading}
              onClick={() => setItemDialog({ open: true })}
            >
              Ajouter à une liste
            </Button>
          </Panel>
        </aside>
      </div>

      <ItemFormDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog({ open })}
        lists={lists}
        currentMemberName={currentMemberName}
        isMutating={isMutating}
        onSubmit={submitItem}
      />

      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <p className="eyebrow mb-2">Listes de courses</p>
            <DialogTitle>Nouvelle liste</DialogTitle>
            <DialogDescription>Un rayon, un magasin, une semaine : la liste s’adapte à vos courses.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3.5" noValidate onSubmit={submitList}>
            <Field label="Nom de la liste" error={errors.name?.message}>
              {(props) => <Input placeholder="Ex. Weekend" {...props} {...register('name')} />}
            </Field>
            <DialogActions>
              <Button variant="secondary" onClick={() => setListDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" icon="arrow" disabled={isSubmitting || isMutating}>
                {isSubmitting || isMutating ? 'Création…' : 'Créer la liste'}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingItem)}
        onOpenChange={(open) => {
          if (!open) setPendingItem(null);
        }}
        title="Supprimer cet article ?"
        description={pendingItem ? `« ${pendingItem.name} » sera retiré de la liste pour tout le foyer.` : undefined}
        confirmLabel="Supprimer l’article"
        onConfirm={() => {
          if (pendingItem) runQuietly(() => removeItem(pendingItem.id), 'Suppression impossible.');
          setPendingItem(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingList)}
        onOpenChange={(open) => {
          if (!open) setPendingList(null);
        }}
        title="Supprimer cette liste ?"
        description={
          pendingList
            ? `« ${pendingList.name} » et ${pluralize(pendingList.items.length, 'article')} seront supprimés pour tout le foyer.`
            : undefined
        }
        confirmLabel="Supprimer la liste"
        onConfirm={() => {
          if (pendingList) runQuietly(() => removeList(pendingList.id), 'Suppression impossible.');
          setPendingList(null);
        }}
      />
    </ModuleShell>
  );
}
