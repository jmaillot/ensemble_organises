import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ModuleShell, MetricRow, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { FolderTabs } from '@/components/shared/folder-tabs';
import {
  memberFirstName,
  isOpenForMe,
  sortedIdsFor,
  taskFilters,
  taskGroup,
  type Task,
  type TaskGroup,
  type TaskSort,
  type TaskStatus,
} from './types';
import { TaskRow } from './components/task-row';
import { TaskFormDialog } from './components/task-form-dialog';
import { TaskBoard } from './components/task-board';
import { useTaches } from './hooks/use-taches';
import { useOpenRecord } from '@/hooks/use-open-record';

type TaskView = 'liste' | 'tableau';

const VIEW_STORAGE_KEY = 'eo:taches:view';

/** Vue choisie la dernière fois ; la liste reste le défaut d'un premier passage. */
function readStoredView(): TaskView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'tableau' ? 'tableau' : 'liste';
  } catch {
    return 'liste';
  }
}

const screenReaderInstructions = {
  draggable:
    'Pour réordonner une tâche, appuyez sur Espace puis sur les flèches haut ou bas, puis Espace pour déposer, ou Échap pour annuler.',
};

/**
 * Un dépôt qui franchit une frontière de groupe est refusé : c'est la frontière
 * que `sortTasks` ne franchit jamais, donc la position promise n'arriverait pas
 * — la ligne reviendrait à sa place juste après l'écriture (D-11). Le message
 * nomme la frontière en cause plutôt que de laisser le geste sans réponse.
 */
function groupBoundaryMessage(active: TaskGroup, over: TaskGroup): string | null {
  if (active === over) return null;
  if (active === 'retard' || over === 'retard') {
    return 'Les tâches en retard restent en tête ; déplacez la tâche dans son groupe.';
  }
  return 'Les tâches terminées restent en dernier ; déplacez la tâche dans son groupe.';
}

export default function TachesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    tasks,
    visibleTasks,
    reminders,
    members,
    filter,
    setFilter,
    assigneeFilter,
    setAssigneeFilter,
    folders,
    activeFolderId,
    setActiveFolderId,
    canWrite,
    isAdmin,
    canDeleteFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    total,
    highPriority,
    assigneeCount,
    assigneesUnknown,
    currentMemberId,
    isLoading,
    isError,
    error,
    isMutating,
    refetch,
    boardTasks,
    toggleStatus,
    setTaskStatus,
    saveTask,
    removeTask,
    reorder,
  } = useTaches();
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null; dueDate: string | null }>({
    open: false,
    task: null,
    dueDate: null,
  });
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [dragged, setDragged] = useState<Task | null>(null);
  const [view, setView] = useState<TaskView>(readStoredView);
  const [sort, setSort] = useState<TaskSort | 'manuel'>('manuel');

  // Raccourci depuis le calendrier : l'échéance voyage dans l'état de
  // navigation et ouvre la création, consommé une seule fois (sans quoi chaque
  // retour rouvrirait le dialogue).
  const navStateConsumed = useRef(false);
  useEffect(() => {
    if (navStateConsumed.current) return;
    navStateConsumed.current = true;
    const incoming = (location.state as { dueDate?: unknown } | null)?.dueDate;
    if (typeof incoming === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(incoming)) {
      setDialog({ open: true, task: null, dueDate: incoming });
      navigate('/taches', { replace: true });
    }
    // Montage uniquement : l'état de navigation ne se rejoue pas (la ref
    // `navStateConsumed` le garantit). `location.state`, `navigate` et
    // `setDialog` sont donc omis volontairement — les inclure rejouerait
    // l'ouverture du dialogue à chaque navigation.
  }, []);

  const sensors = useSensors(
    // Un simple clic ne doit pas démarrer un déplacement.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const changeView = (next: TaskView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Stockage indisponible : la vue reste en mémoire pour la session.
    }
  };

  const moveTask = (task: Task, status: TaskStatus) => {
    void setTaskStatus(task, status).catch((moveError: unknown) =>
      toast(moveError instanceof Error ? moveError.message : 'Le statut n’a pas pu être mis à jour.', 'error'),
    );
  };

  const openCreate = () => setDialog({ open: true, task: null, dueDate: null });
  const openEdit = (task: Task) => setDialog({ open: true, task, dueDate: null });
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }));
  // Lien profond : `/taches?ouvrir=<id>` ouvre la fiche de la tâche.
  useOpenRecord(tasks, openEdit);

  // Compteur « À faire » personnel : ouvertes sans assigné (foyer) ou pour
  // moi — jamais celles des autres membres.
  const openMine = useMemo(
    () => tasks.filter((task) => isOpenForMe(task, currentMemberId)).length,
    [tasks, currentMemberId],
  );

  // Les annonces du glisser-déposer citent le nom de la tâche, pas son identifiant.
  const names = useRef<Map<string, string>>(new Map());
  names.current = new Map(visibleTasks.map((task) => [task.id, task.name]));
  const nameOf = (id: string | number) => names.current.get(String(id)) ?? String(id);

  /**
   * Message de refus d'un dépôt, `null` quand il est permis. Écrit une seule
   * fois : l'annonce lecteur d'écran et l'écriture effective lisent la même
   * décision, sans quoi elles pourraient se contredire.
   */
  const refusalFor = (activeId: string, overId: string): string | null => {
    const activeTask = visibleTasks.find((task) => task.id === activeId);
    const overTask = visibleTasks.find((task) => task.id === overId);
    if (!activeTask || !overTask) return null;
    return groupBoundaryMessage(taskGroup(activeTask), taskGroup(overTask));
  };

  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `${nameOf(active.id)} saisie.`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `Position de ${nameOf(over.id)} atteinte.` : 'Position hors liste.',
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
      if (!over) return 'Déplacement annulé.';
      // Un dépôt refusé ne s'annonce pas comme « déposée à la place de … » :
      // l'annonce dit ce qui s'est réellement passé.
      return refusalFor(String(active.id), String(over.id)) ?? `${nameOf(active.id)} déposée à la place de ${nameOf(over.id)}.`;
    },
    onDragCancel: () => 'Déplacement annulé.',
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragged(visibleTasks.find((task) => task.id === String(event.active.id)) ?? null);
  };

  /**
   * LE TRI EN UN CLIC : réordonner tout d'un coup, par échéance ou par
   * responsable. Les rangs sont ÉCRITS, comme au glisser-déposer — l'ordre
   * trié devient l'ordre du foyer.
   */
  const appliquerTri = (value: TaskSort | 'manuel') => {
    setSort(value);
    if (value === 'manuel') return;
    void reorder(sortedIdsFor(visibleTasks, value))
      .then(() =>
        toast(value === 'echeance' ? 'Tâches triées par échéance.' : 'Tâches triées par responsable.'),
      )
      .catch((sortError: unknown) =>
        toast(
          sortError instanceof Error ? sortError.message : 'Le tri n’a pas pu être enregistré.',
          'error',
        ),
      );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragged(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visibleTasks.map((task) => task.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Frontière de groupe : on refuse au lieu d'écrire un ordre que le
    // `refresh()` déferait aussitôt (le dépôt n'écrit que `priority_order`,
    // l'échéance et le retard n'en dépendent pas).
    const refusal = refusalFor(String(active.id), String(over.id));
    if (refusal !== null) {
      toast(refusal, 'error');
      return;
    }
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    void reorder(next)
      .then(() => toast('Ordre des tâches mis à jour.'))
      .catch((reorderError: unknown) =>
        toast(
          reorderError instanceof Error ? reorderError.message : 'L’ordre n’a pas pu être enregistré.',
          'error',
        ),
      );
  };

  return (
    <ModuleShell
      module="taches"
      infoTo="/taches/aide"
      actions={
        canWrite ? (
          <Button icon="plus" onClick={openCreate}>
            Ajouter une tâche
          </Button>
        ) : null
      }
    >
      <MetricRow
        items={[
          { label: 'À faire', value: openMine, caption: 'pour moi ou sans assigné' },
          { label: 'Total', value: total, caption: 'dans la liste' },
          { label: 'Priorité haute', value: highPriority, caption: 'à regarder aujourd’hui' },
          { label: 'Membres', value: assigneesUnknown ? '…' : assigneeCount, caption: 'participants actifs' },
        ]}
      />

      <div className="mb-4">
        <FolderTabs
          folders={folders}
          activeId={activeFolderId}
          onSelect={setActiveFolderId}
          onCreate={async (name, visibility) => {
            // Le dialogue affiche lui-même l'erreur en ligne et reste ouvert.
            await createFolder(name, visibility);
            toast('Dossier créé.');
          }}
          onRename={async (id, name) => {
            try {
              await renameFolder(id, name);
              toast('Dossier renommé.');
            } catch (folderError) {
              toast(folderError instanceof Error ? folderError.message : 'Le dossier n’a pas pu être renommé.', 'error');
              throw folderError;
            }
          }}
          onDelete={async (folder) => {
            try {
              await deleteFolder(folder.id);
              toast(
                folder.visibility === 'perso'
                  ? 'Dossier perso supprimé avec son contenu.'
                  : 'Dossier supprimé, contenu rangé dans Général.',
              );
            } catch (folderError) {
              toast(folderError instanceof Error ? folderError.message : 'Le dossier n’a pas pu être supprimé.', 'error');
              throw folderError;
            }
          }}
          canManage={canWrite}
          canDelete={canDeleteFolder}
          label="Dossiers de tâches"
        />
      </div>

      <div className="mb-4 flex items-center justify-end">
        <div
          role="group"
          aria-label="Affichage des tâches"
          className="flex gap-1 rounded-full border border-border bg-surface p-1"
        >
          {(
            [
              { value: 'liste', label: 'Liste' },
              { value: 'tableau', label: 'Tableau' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => changeView(option.value)}
              className={
                view === option.value
                  ? 'rounded-full bg-accent px-3 py-1.5 text-[11.5px] font-extrabold text-white'
                  : 'rounded-full px-3 py-1.5 text-[11.5px] font-bold text-muted hover:text-fg'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Les tâches du foyer n’ont pas pu être chargées.'}
          onRetry={refetch}
        />
      ) : (
        // Le tableau prend toute la largeur : trois colonnes dans la colonne
        // de gauche écrasaient les titres à un mot par ligne.
        <div
          className={
            view === 'tableau'
              ? 'grid grid-cols-1 items-start gap-[18px]'
              : 'grid grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] items-start gap-[18px] max-[920px]:grid-cols-1'
          }
        >
          <Panel
            id="task-list-panel"
            title={view === 'tableau' ? 'Tableau des tâches' : 'Vos prochaines tâches'}
            description={
              view === 'tableau'
                ? 'Trois colonnes valent tous les statuts : glissez une carte par sa poignée, ou choisissez le statut sur la carte.'
                : 'Glissez les lignes pour réordonner, ou changez la priorité.'
            }
            action={
              <div className="flex flex-wrap items-end gap-2">
                {view === 'liste' ? (
                  <Select
                  aria-label="Filtrer les tâches"
                  className="w-auto min-w-[190px] max-[650px]:w-full max-[650px]:min-w-0"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as typeof filter)}
                  >
                    {taskFilters.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Select
                  aria-label="Trier les tâches"
                  className="w-auto min-w-[150px] max-[650px]:w-full max-[650px]:min-w-0"
                  value={sort}
                  onChange={(event) => appliquerTri(event.target.value as TaskSort | 'manuel')}
                  title={
                    assigneesUnknown
                      ? 'Les assignés ne sont pas encore connus : le tri attendra leur lecture.'
                      : undefined
                  }
                >
                  <option value="manuel">L’ordre du foyer</option>
                  <option value="echeance">Par échéance</option>
                  <option value="responsable" disabled={assigneesUnknown}>
                    Par responsable
                  </option>
                </Select>
                <Select
                  aria-label="Filtrer par assigné"
                  className="w-auto min-w-[170px] max-[650px]:w-full max-[650px]:min-w-0"
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                >
                  <option value="tous">Tous les assignés</option>
                  <option value="non-assigne">Non assignées</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name}
                    </option>
                  ))}
                </Select>
              </div>
            }
          >
            {isLoading ? (
              <LoadingRows rows={4} />
            ) : view === 'tableau' ? (
              boardTasks.length === 0 ? (
                <EmptyState
                  icon="checkCircle"
                  title="Aucune tâche dans ce dossier"
                  description="Les tâches de ce dossier se rangeront ici, par statut. Ajoutez-en une pour commencer."
                  actionLabel={canWrite ? 'Ajouter une tâche' : undefined}
                  onAction={canWrite ? openCreate : undefined}
                />
              ) : (
                <TaskBoard tasks={boardTasks} canWrite={canWrite} onEdit={openEdit} onMove={moveTask} />
              )
            ) : visibleTasks.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title={filter === 'terminees' ? 'Aucune tâche terminée' : 'Aucune tâche à faire'}
                description={
                  filter === 'terminees'
                    ? 'Les tâches cochées apparaîtront ici, avec leur date d’échéance.'
                    : 'Rien ne presse pour le moment. Ajoutez une tâche avec une échéance claire pour que le foyer s’organise.'
                }
                actionLabel={canWrite ? 'Ajouter une tâche' : undefined}
                onAction={canWrite ? openCreate : undefined}
              />
            ) : !canWrite ? (
              <div role="list" aria-label="Tâches du foyer" className="grid gap-1">
                {visibleTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    readOnly
                    canDelete={isAdmin}
                    onToggle={(target) => {
                      void toggleStatus(target).catch((toggleError: unknown) =>
                        toast(
                          toggleError instanceof Error
                            ? toggleError.message
                            : 'Le statut n’a pas pu être mis à jour.',
                          'error',
                        ),
                      );
                    }}
                    onEdit={openEdit}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={{ announcements, screenReaderInstructions }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDragged(null)}
              >
                <SortableContext items={visibleTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                  <div role="list" aria-label="Tâches du foyer" className="grid gap-1">
                    {visibleTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        readOnly={!canWrite}
                        canDelete={isAdmin}
                        onToggle={(target) => {
                          void toggleStatus(target).catch((toggleError: unknown) =>
                            toast(
                              toggleError instanceof Error
                                ? toggleError.message
                                : 'Le statut n’a pas pu être mis à jour.',
                              'error',
                            ),
                          );
                        }}
                        onEdit={openEdit}
                        onDelete={setPendingDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {dragged ? (
                    <p className="rounded-[14px] border border-accent/30 bg-surface px-3 py-2 text-[13.5px] font-[700] shadow-[var(--shadow-md)]">
                      {dragged.name}
                    </p>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </Panel>

          <Panel
            id="task-reminders-panel"
            title="Rappels du jour"
            description="Ce qui mérite un petit rappel aujourd’hui."
          >
            {reminders.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                Aucun rappel aujourd’hui. Ajoutez-en un depuis le formulaire d’une tâche.
              </p>
            ) : (
              <div className="grid gap-1">
                {reminders.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2.5 rounded-[14px] px-1 py-2.5 transition-colors duration-[var(--duration-quick)] hover:bg-accent-faint/60"
                  >
                    <span className="w-[44px] shrink-0 text-[11.5px] font-extrabold text-accent-strong tabular-nums">
                      {task.reminderTime}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] font-[700]">{task.name}</p>
                      <small className="text-[11px] text-muted">
                        {task.assignees.length > 0
                          ? task.assignees.map((assignee) => memberFirstName(assignee.member.display_name)).join(', ')
                          : 'Personne assigné'}
                      </small>
                    </div>
                    {task.assignees[0] ? <MemberAvatar member={task.assignees[0].member} size="sm" /> : null}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 mb-0 text-[11px] text-muted">
              {total > 0 ? `${openMine} tâche${openMine > 1 ? 's' : ''} pour moi ou sans assigné sur ${total}.` : 'Créez votre première tâche pour lancer le compteur.'}
            </p>
          </Panel>
        </div>
      )}

      <TaskFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        task={dialog.task}
        currentMemberId={currentMemberId}
        initialDueDate={dialog.dueDate}
        initialFolderId={activeFolderId}
        folders={folders}
        isSaving={isMutating}
        onSubmit={async (values) => {
          const editing = dialog.task;
          try {
            await saveTask(editing, values);
            closeDialog();
            toast(editing ? 'Tâche mise à jour.' : 'Tâche ajoutée à la liste du foyer.');
          } catch (submissionError) {
            toast(
              submissionError instanceof Error ? submissionError.message : 'La tâche n’a pas pu être enregistrée.',
              'error',
            );
          }
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Supprimer « ${pendingDelete?.name ?? ''} » ?`}
        description="La tâche, ses assignataires et son rappel seront retirés de la liste du foyer."
        confirmLabel="Supprimer la tâche"
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          void removeTask(target)
            .then(() => toast('Tâche supprimée.'))
            .catch((removalError: unknown) =>
              toast(
                removalError instanceof Error ? removalError.message : 'La tâche n’a pas pu être supprimée.',
                'error',
              ),
            );
        }}
      />
    </ModuleShell>
  );
}
