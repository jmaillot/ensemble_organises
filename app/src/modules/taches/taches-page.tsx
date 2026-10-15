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
import { memberFirstName, isOpenForMe, taskFilters, taskGroup, type Task, type TaskGroup } from './types';
import { TaskRow } from './components/task-row';
import { TaskFormDialog } from './components/task-form-dialog';
import { useTaches } from './hooks/use-taches';

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
    createFolder,
    renameFolder,
    deleteFolder,
    total,
    highPriority,
    assigneeCount,
    currentMemberId,
    isLoading,
    isError,
    error,
    isMutating,
    refetch,
    toggleStatus,
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
    // Montage uniquement : l'état de navigation ne se rejoue pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sensors = useSensors(
    // Un simple clic ne doit pas démarrer un déplacement.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const openCreate = () => setDialog({ open: true, task: null, dueDate: null });
  const openEdit = (task: Task) => setDialog({ open: true, task, dueDate: null });
  const closeDialog = () => setDialog((current) => ({ ...current, open: false }));

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
          { label: 'Membres', value: assigneeCount, caption: 'participants actifs' },
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
              toast('Dossier supprimé, contenu rangé dans Général.');
            } catch (folderError) {
              toast(folderError instanceof Error ? folderError.message : 'Le dossier n’a pas pu être supprimé.', 'error');
              throw folderError;
            }
          }}
          canManage={canWrite}
          canDelete={isAdmin}
          label="Dossiers de tâches"
        />
      </div>

      {isError ? (
        <ErrorState
          message={error?.message ?? 'Les tâches du foyer n’ont pas pu être chargées.'}
          onRetry={refetch}
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] items-start gap-[18px] max-[920px]:grid-cols-1">
          <Panel
            id="task-list-panel"
            title="Vos prochaines tâches"
            description="Glissez les lignes pour réordonner, ou changez la priorité."
            action={
              <div className="flex flex-wrap gap-2">
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
              <div role="list" aria-label="Tâches du foyer" className="grid gap-2.5">
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
                  <div role="list" aria-label="Tâches du foyer" className="grid gap-2.5">
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
                    <p className="rounded-[10px] border border-accent bg-surface px-3 py-2 text-[13px] font-[760] shadow-[var(--shadow-md)]">
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
              <div className="grid gap-2.5">
                {reminders.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-[9px] border-t border-border py-2.5 first:border-t-0 first:pt-0"
                  >
                    <span className="w-[43px] text-[11px] font-extrabold text-accent-strong">
                      {task.reminderTime}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-xs font-[760]">{task.name}</p>
                      <small className="text-[10px] text-muted">
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
