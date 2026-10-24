import { useMemo, useState } from 'react';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, LoadingRows } from '@/components/ui/empty-state';
import { Dialog, DialogActions, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { MemberBadge } from '@/components/shared/module-shell';
import { useCurrentMember, useMembers } from '@/stores/household-store';
import { useResource } from '@/lib/data/useResource';
import type { ShoppingListRow } from '@/types';
import { useMenu } from './hooks/use-menu';
import { MealDialog } from './components/meal-dialog';
import {
  formatDayLabel,
  formatWeekLabel,
  isCurrentWeek,
  mealLabel,
  mealSlotLabels,
  mealSlots,
  shiftWeek,
  weekDatesOf,
  weekStartOf,
  type MealEntry,
  type MealFormValues,
  type MealSlot,
} from './types';

interface DialogState {
  open: boolean;
  entry: MealEntry | null;
  date: string;
  slot: MealSlot;
}

/**
 * Menu de la semaine (vague 3.1) : sept jours, trois moments, recette du
 * foyer ou texte libre, « qui mange », et génération de la liste de courses
 * (ingrédients × portions, dédoublonnage via le moteur Recettes → Courses).
 * La semaine est un regroupement dérivé des dates (0142), navigable par
 * semaines entières.
 */
export default function MenuPage() {
  const menu = useMenu();
  const toast = useToast();
  const members = useMembers();
  const currentMember = useCurrentMember();
  const canWrite = currentMember?.role !== 'enfant';

  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date().toISOString().slice(0, 10)));
  const [dialog, setDialog] = useState<DialogState>({ open: false, entry: null, date: '', slot: 'midi' });
  const [toRemove, setToRemove] = useState<MealEntry | null>(null);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [coursesListId, setCoursesListId] = useState('');
  const [coursesBusy, setCoursesBusy] = useState(false);

  const listsResource = useResource<ShoppingListRow>('shopping_lists');
  const shoppingLists = useMemo(() => listsResource.rows.filter((list) => list.trip_id == null), [listsResource.rows]);

  const weekDates = useMemo(() => weekDatesOf(weekStart), [weekStart]);
  const byDay = useMemo(() => menu.entriesOfWeek(weekStart), [menu, weekStart]);
  const recipeTitleOf = useMemo(() => {
    const titles = new Map(menu.recipes.map((recipe) => [recipe.id, recipe.title]));
    return (recipeId: string) => titles.get(recipeId) ?? null;
  }, [menu.recipes]);

  const memberNameOf = useMemo(() => new Map(members.map((member) => [member.id, member.display_name])), [members]);

  const handleSave = async (values: MealFormValues) => {
    try {
      await menu.saveEntry(dialog.entry?.id ?? null, values);
      toast(dialog.entry ? 'Repas mis à jour.' : 'Repas planifié.');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Enregistrement impossible.', 'error');
      throw saveError;
    }
  };

  const handleRemove = async () => {
    if (!toRemove) return;
    try {
      await menu.removeEntry(toRemove.id);
      toast('Repas retiré du menu.');
    } catch (removeError) {
      toast(removeError instanceof Error ? removeError.message : 'Suppression impossible.', 'error');
    } finally {
      setToRemove(null);
    }
  };

  const handleGenerate = async () => {
    if (coursesListId === '') {
      toast('Choisissez une liste de courses.', 'error');
      return;
    }
    setCoursesBusy(true);
    try {
      const result = await menu.generateCourses(coursesListId, weekStart);
      if (result.lines === 0) {
        // Deux zéros de sens différent : sans repas-recette planifié, la
        // génération n'a rien à faire ; avec, ce sont les fiches qui ne
        // portent aucun ingrédient — le message doit dire laquelle des deux
        // situations on vit, pas désigner le planning à tort.
        toast(
          recipeEntriesCount === 0
            ? 'Aucune recette planifiée cette semaine : rien à envoyer.'
            : 'Les recettes planifiées ne portent aucun ingrédient : complétez les fiches pour remplir la liste.',
          recipeEntriesCount === 0 ? undefined : 'error',
        );
      } else {
        const parts = [`${result.lines} ingrédient${result.lines > 1 ? 's' : ''} envoyé${result.lines > 1 ? 's' : ''}`];
        if (result.createdCount > 0) parts.push(`${result.createdCount} nouvelle${result.createdCount > 1 ? 's' : ''} ligne${result.createdCount > 1 ? 's' : ''}`);
        if (result.mergedCount > 0) parts.push(`${result.mergedCount} fusion${result.mergedCount > 1 ? 's' : ''}`);
        toast(`${parts.join(', ')}.`);
      }
      setCoursesOpen(false);
    } catch (generateError) {
      toast(generateError instanceof Error ? generateError.message : 'Génération impossible.', 'error');
    } finally {
      setCoursesBusy(false);
    }
  };

  const recipeEntriesCount = useMemo(() => {
    let count = 0;
    for (const list of byDay.values()) count += list.filter((entry) => entry.recipeId).length;
    return count;
  }, [byDay]);

  return (
    <ModuleShell
      module="menu"
      infoTo="/menu/aide"
      actions={
        <Button icon="receipt" onClick={() => setCoursesOpen(true)}>
          Générer les courses
        </Button>
      }
    >
      <Panel
        id="menu-week-panel"
        title={formatWeekLabel(weekStart)}
        description="Un plan de repas par jour et par moment. Les repas-recette alimentent la liste de courses."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon="arrowLeft" aria-label="Semaine précédente" onClick={() => setWeekStart((current) => shiftWeek(current, -1))} />
            {!isCurrentWeek(weekStart, menu.today) ? (
              <Button variant="secondary" size="sm" onClick={() => setWeekStart(weekStartOf(menu.today))}>
                Cette semaine
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" iconEnd="arrow" aria-label="Semaine suivante" onClick={() => setWeekStart((current) => shiftWeek(current, 1))} />
          </div>
        }
      >
        {menu.isLoading ? (
          <LoadingRows rows={5} />
        ) : menu.isError ? (
          <EmptyState
            icon="calendar"
            title="Le menu n'a pas pu être chargé."
            description={menu.error?.message ?? 'Réessayez dans un instant.'}
            actionLabel="Recharger"
            onAction={menu.refetch}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-7">
            {weekDates.map((date) => {
              const dayEntries = byDay.get(date) ?? [];
              const isToday = date === menu.today;
              return (
                <div
                  key={date}
                  className={`min-w-0 rounded-[18px] border p-2.5 ${isToday ? 'border-accent bg-accent-faint' : 'border-border/60 bg-bg'}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <strong className={`text-[12.5px] font-[700] ${isToday ? 'text-accent-strong' : 'text-fg'}`}>
                      {formatDayLabel(date)}
                    </strong>
                    {isToday ? <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-[700] text-surface">Auj.</span> : null}
                  </div>
                  <div className="grid gap-1.5">
                    {mealSlots.map((slot) => {
                      const slotEntries = dayEntries.filter((entry) => entry.slot === slot);
                      return (
                        <div key={slot} className="rounded-[14px] bg-surface p-1.5">
                          <div className="flex items-center justify-between gap-1 px-0.5">
                            <span className="text-[10px] font-extrabold text-muted">{mealSlotLabels[slot]}</span>
                            {canWrite ? (
                              <button
                                type="button"
                                aria-label={`Planifier ${mealSlotLabels[slot]} du ${formatDayLabel(date)}`}
                                onClick={() => setDialog({ open: true, entry: null, date, slot })}
                                className="grid size-6 place-items-center rounded-full text-muted transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint hover:text-fg"
                              >
                                <Icon name="plus" size="sm" />
                              </button>
                            ) : null}
                          </div>
                          <div className="grid gap-1">
                            {slotEntries.map((entry) => (
                              <MealCard
                                key={entry.id}
                                entry={entry}
                                label={mealLabel(entry, recipeTitleOf)}
                                memberNameOf={memberNameOf}
                                canWrite={canWrite}
                                onEdit={() => setDialog({ open: true, entry, date: entry.date, slot: entry.slot })}
                                onRemove={() => setToRemove(entry)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <MealDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((state) => ({ ...state, open }))}
        entry={dialog.entry}
        defaultDate={dialog.date || menu.today}
        defaultSlot={dialog.slot}
        weekDates={weekDates}
        recipes={menu.recipes}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => (open ? null : setToRemove(null))}
        title="Retirer ce repas du menu ?"
        description={toRemove ? `« ${mealLabel(toRemove, recipeTitleOf)} » disparaît du planning. La recette, elle, reste dans le foyer.` : ''}
        confirmLabel="Retirer"
        onConfirm={() => void handleRemove()}
      />

      <Dialog open={coursesOpen} onOpenChange={setCoursesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Générer les courses de la semaine</DialogTitle>
            <DialogDescription>
              {recipeEntriesCount === 0
                ? 'Aucune recette planifiée cette semaine : ajoutez des repas-recette pour remplir la liste.'
                : `${recipeEntriesCount} repas-recette cette semaine : les ingrédients seront mis à l’échelle sur les portions de chaque repas, puis fusionnés dans la liste.`}
            </DialogDescription>
          </DialogHeader>
          <Field label="Liste de courses" hint="Les ingrédients existants sont incrémentés, jamais dupliqués.">
            {(props) => (
              <Select {...props} value={coursesListId} onChange={(event) => setCoursesListId(event.target.value)}>
                <option value="">Choisir une liste…</option>
                {shoppingLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <DialogActions>
            <Button variant="secondary" onClick={() => setCoursesOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void handleGenerate()} disabled={coursesBusy || recipeEntriesCount === 0} icon="receipt">
              {coursesBusy ? 'Génération…' : 'Envoyer vers la liste'}
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}

function MealCard({
  entry,
  label,
  memberNameOf,
  canWrite,
  onEdit,
  onRemove,
}: {
  entry: MealEntry;
  label: string;
  memberNameOf: Map<string, string>;
  canWrite: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-[10px] bg-accent-faint px-2 py-1.5">
      <button
        type="button"
        onClick={canWrite ? onEdit : undefined}
        disabled={!canWrite}
        className="min-w-0 flex-1 text-left"
        aria-label={`Modifier le repas ${label}`}
      >
        <span className="block truncate text-[12px] font-[650] text-fg">{label}</span>
        {/* min-w-0 + overflow-hidden : la rangée « qui mange » ne peut pas
            imposer sa largeur min-content à la colonne du jour (120px) — sans
            elle, la carte déborde sous la colonne voisine et le bouton de
            retrait devient incliquable (probe e2e : slot 160px dans col 120px). */}
        <span className="flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-muted">
          <span className="shrink-0">×{entry.servings}</span>
          {entry.memberIds.slice(0, 5).map((memberId) => (
            <MemberBadge key={memberId} name={memberNameOf.get(memberId) ?? '?'} className="scale-90" />
          ))}
        </span>
      </button>
      {canWrite ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${label} du menu`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors duration-[var(--duration-quick)] hover:bg-coral-soft hover:text-coral-text"
        >
          <Icon name="close" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
