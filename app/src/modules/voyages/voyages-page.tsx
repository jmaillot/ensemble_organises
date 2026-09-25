import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { ModuleShell, SectionHeading } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { Badge, Progress } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useVoyages } from './hooks/use-voyages';
import { TripFormDialog } from './components/trip-form-dialog';
import { DEFAULT_TRIP_COVER, memberStack, type Trip } from './types';

const MAX_STACK = 3;

export default function VoyagesPage() {
  const { trips, featuredTrip, prep, members, isLoading, isError, error, refetch, isMutating, save, remove } = useVoyages();
  const stack = memberStack(members, MAX_STACK);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Trip | null>(null);

  // Le voyage mis en avant suit le prochain voyage tant que rien n'est choisi.
  useEffect(() => {
    if (selectedId && trips.some((trip) => trip.id === selectedId)) return;
    setSelectedId(featuredTrip?.id ?? null);
  }, [featuredTrip, selectedId, trips]);

  const trip = trips.find((entry) => entry.id === selectedId) ?? featuredTrip;
  const others = trips.filter((entry) => entry.id !== trip?.id);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (target: Trip) => {
    setEditing(target);
    setFormOpen(true);
  };

  return (
    <ModuleShell
      module="voyages"
      actions={
        <Button icon="plus" onClick={openCreate}>
          Créer un voyage
        </Button>
      }
    >
      {isError ? (
        <ErrorState message={error?.message ?? 'Les voyages n’ont pas pu être chargés.'} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingRows rows={2} />
      ) : !trip ? (
        <EmptyState
          icon="map"
          title="Aucun voyage prévu"
          description="Une destination, quelques dates : le foyer pourra tout préparer ensemble."
          actionLabel="Créer un voyage"
          onAction={openCreate}
        />
      ) : (
        <>
          <section
            className="relative mb-[18px] min-h-[350px] overflow-hidden rounded-[22px] bg-cover bg-center max-[650px]:min-h-[280px]"
            style={{ backgroundImage: `url(${trip.coverPhoto || DEFAULT_TRIP_COVER})` }}
            aria-label={`Voyage vers ${trip.destination}`}
          >
            <div className="trip-overlay absolute inset-0" aria-hidden="true" />
            <div className="absolute right-[25px] bottom-[24px] left-[25px] z-1 text-surface">
              <p className="eyebrow mb-2 text-on-dark">
                {trip.upcoming ? 'Prochain voyage' : 'Dernier voyage'} · {trip.statusLabel}
              </p>
              <h2 className="mb-1.5 font-display text-[34px] tracking-[-0.035em] max-[650px]:text-[28px]">{trip.destination}</h2>
              <p className="m-0 text-[12px] text-on-dark">
                {trip.dateLabel}
                {trip.notes ? ` · ${trip.notes}` : ''}
              </p>
            </div>
          </section>

          <div className="mb-[18px] grid grid-cols-3 gap-3.5 max-[650px]:grid-cols-1">
            <div className="rounded-[16px] border border-border bg-surface p-[17px]">
              <strong className="block font-display text-[25px] tracking-[-0.05em]">{prep.openTasks}</strong>
              <span className="text-[11px] text-muted">éléments à préparer</span>
              <Progress value={prep.progress} label="Avancement des tâches du foyer" />
            </div>
            <div className="rounded-[16px] border border-border bg-surface p-[17px]">
              <strong className="block font-display text-[25px] tracking-[-0.05em]">{trip.days}</strong>
              <span className="text-[11px] text-muted">jours sur place</span>
              <p className="mt-[13px] mb-0 text-[11px] text-muted">{trip.dateLabel}</p>
            </div>
            <div className="rounded-[16px] border border-border bg-surface p-[17px]">
              <strong className="block font-display text-[25px] tracking-[-0.05em]">{members.length}</strong>
              <span className="text-[11px] text-muted">membres invités</span>
              <div className="mt-[13px] flex items-center">
                {stack.shown.map((member) => (
                  <MemberAvatar key={member.id} member={member} size="sm" className="-ml-[7px] border-2 border-surface first:ml-0" />
                ))}
                {stack.overflow > 0 ? (
                  <span className="-ml-[7px] grid size-[23px] place-items-center rounded-[8px] border-2 border-surface bg-fg text-[9px] font-extrabold text-surface">
                    +{stack.overflow}
                    <span className="sr-only">
                      {stack.overflow} autre{stack.overflow > 1 ? 's' : ''} membre{stack.overflow > 1 ? 's' : ''}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {others.length > 0 ? (
            <section>
              <SectionHeading
                title={others.length === 1 ? 'Un autre voyage' : 'Autres voyages'}
                description="Sélectionnez un voyage pour l’afficher dans le héros."
              />
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((other) => (
                  <div
                    key={other.id}
                    className={cn(
                      'rounded-[16px] border border-border bg-surface p-[17px]',
                      other.id === selectedId && 'border-accent shadow-[inset_0_0_0_1px_var(--color-accent)]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(other.id)}
                      aria-current={other.id === selectedId ? 'true' : undefined}
                      className="block w-full text-left"
                    >
                      <span className="block font-display text-[17px] tracking-[-0.03em]">{other.destination}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{other.dateLabel}</span>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge tone={other.upcoming ? 'accent' : 'muted'}>{other.statusLabel}</Badge>
                      <span className="flex gap-1.5">
                        <Button variant="secondary" size="sm" icon="edit" onClick={() => openEdit(other)}>
                          Modifier
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          icon="trash"
                          onClick={() => setPendingDelete(other)}
                          aria-label={`Supprimer le voyage vers ${other.destination}`}
                        >
                          <span className="sr-only">Supprimer</span>
                        </Button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-[18px] flex flex-wrap gap-2">
            <Button variant="secondary" icon="edit" onClick={() => openEdit(trip)}>
              Modifier ce voyage
            </Button>
            <Button variant="danger" icon="trash" onClick={() => setPendingDelete(trip)}>
              Supprimer ce voyage
            </Button>
          </div>
        </>
      )}

      <TripFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        trip={editing}
        busy={isMutating}
        onSubmit={(input, id) => save(input, id)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Supprimer ce voyage ?"
        description={pendingDelete ? `${pendingDelete.destination} · ${pendingDelete.dateLabel}` : undefined}
        confirmLabel="Supprimer"
        onConfirm={() => {
          if (pendingDelete) {
            void remove(pendingDelete.id);
            if (selectedId === pendingDelete.id) setSelectedId(null);
          }
          setPendingDelete(null);
        }}
      />
    </ModuleShell>
  );
}
