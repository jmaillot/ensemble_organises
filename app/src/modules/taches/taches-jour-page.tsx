import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ModuleShell, MetricRow, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { sortTasks, tasksDuJour } from './types';
import { TaskRow } from './components/task-row';
import { useTaches } from './hooks/use-taches';

/**
 * Vue « Tâches du jour » (D-03), cible du raccourci manifest (D-01).
 *
 * Périmètre BORNÉ : liste des tâches du jour et des retards, coche, retour
 * vers `/taches`. Aucun glisser-déposer, aucun dossier, aucun filtre, aucune
 * création ni édition — la liste complète reste la seule maison de ces gestes,
 * cette vue ne fait que les résumer. Les données viennent du même `useTaches`
 * que la page `/taches` : le rendu cold-start hors-ligne est porté par le
 * cache persisté (phase 33), la vue n'écrit aucune logique de cache.
 */
export default function TachesJourPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { tasks, canWrite, isLoading, isError, error, refetch, toggleStatus } = useTaches();

  const duJour = useMemo(() => sortTasks(tasksDuJour(tasks)), [tasks]);
  const enRetard = duJour.filter((task) => task.isLate).length;

  return (
    <ModuleShell
      module="taches"
      backTo="/taches"
      backLabel="Retour aux tâches"
      title="Tâches du jour"
      actions={
        <Button variant="secondary" onClick={() => navigate('/taches')}>
          Voir toutes les tâches
        </Button>
      }
    >
      <MetricRow
        items={[
          { label: 'Aujourd’hui', value: duJour.length - enRetard, caption: 'échéance atteinte' },
          { label: 'En retard', value: enRetard, caption: 'à rattraper en priorité' },
        ]}
      />

      <Panel
        id="task-day-panel"
        title="Tâches du jour"
        description="Ce qui est dû aujourd’hui, plus les retards — cochables ici, gérées dans la liste complète."
      >
        {isLoading ? (
          <LoadingRows rows={4} />
        ) : isError ? (
          <ErrorState
            message={error?.message ?? 'Les tâches du foyer n’ont pas pu être chargées.'}
            onRetry={refetch}
          />
        ) : duJour.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Rien de dû aujourd’hui"
            description="Les tâches dont l’échéance est atteinte, et les retards, s’afficheront ici."
            actionLabel={canWrite ? 'Voir toutes les tâches' : undefined}
            onAction={canWrite ? () => navigate('/taches') : undefined}
          />
        ) : (
          <div role="list" aria-label="Tâches du jour" className="grid gap-1">
            {duJour.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                readOnly={false}
                canDelete={false}
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
              />
            ))}
          </div>
        )}
      </Panel>
    </ModuleShell>
  );
}
