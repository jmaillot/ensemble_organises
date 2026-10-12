import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { useTripDetail } from './hooks/use-trip-detail';
import { isServableCoverUrl } from './voyages-page';
import { visibleTripTabs, type TripTabKey } from './types';

/**
 * Fiche d'un voyage (phase 15) : héros + barre d'onglets (Infos, Courses,
 * Notes, Tâches, Adresses, Budget, Paramètres). Les onglets désactivés sont
 * masqués, jamais supprimés (D-05). 15-02 tâche 2 remplit Infos et
 * Paramètres ; 15-03 remplit les cinq rubriques.
 */
export default function TripDetailPage() {
  const { tripId } = useParams();
  const detail = useTripDetail(tripId ?? null);
  const { trip, tabState, isLoading, isError, error, notAuthorized, readOnly, participantMembers } = detail;
  const [activeTab, setActiveTab] = useState<TripTabKey>('infos');

  const visible = tabState ? visibleTripTabs(tabState) : [];

  // L'onglet actif suit les bascules : un onglet masqué rend la main au
  // premier visible (jamais de panneau orphelin).
  useEffect(() => {
    if (!tabState) return;
    if (!tabState[activeTab]) {
      const first = visibleTripTabs(tabState)[0];
      if (first) setActiveTab(first.key);
    }
  }, [tabState, activeTab]);

  return (
    <ModuleShell module="voyages">
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : isError ? (
        <ErrorState
          message={error?.message ?? 'Ce voyage n’a pas pu être chargé.'}
          onRetry={detail.refetch}
        />
      ) : notAuthorized || !trip ? (
        <Panel id="trip-not-authorized" title="Voyage non accessible" description="Ce voyage n’existe pas ou vous n’y participez pas.">
          <p className="m-0 text-[13px] text-muted">
            Seuls les participants du voyage et les administrateurs du foyer peuvent l’ouvrir. Si vous pensez
            qu’il s’agit d’une erreur, demandez à un participant de vous partager son code d’invitation.
          </p>
          <div className="mt-3">
            <Button asChild variant="secondary">
              <Link to="/voyages">Retour aux voyages</Link>
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          {trip.closed ? (
            <p
              role="status"
              className="mb-[14px] rounded-[14px] border border-border bg-bg px-[15px] py-3 text-[13px] font-semibold"
            >
              Voyage figé : lecture seule. Un administrateur du foyer peut le rouvrir depuis l’onglet Paramètres.
            </p>
          ) : null}
          {readOnly ? (
            <p
              role="status"
              className="mb-[14px] rounded-[14px] border border-border bg-bg px-[15px] py-3 text-[13px] text-muted"
            >
              Vue de modération : vous administrez ce voyage sans y participer — aucune action de membre ne vous
              est proposée.
            </p>
          ) : null}

          <section
            className="relative mb-[18px] min-h-[280px] overflow-hidden rounded-[22px] bg-cover bg-center max-[650px]:min-h-[220px]"
            style={isServableCoverUrl(trip.coverPhoto) ? { backgroundImage: `url(${trip.coverPhoto})` } : undefined}
            aria-label={`Voyage vers ${trip.destination}`}
          >
            <div className="trip-overlay absolute inset-0" aria-hidden="true" />
            <div className="absolute right-[25px] bottom-[24px] left-[25px] z-1 text-surface">
              <p className="eyebrow mb-2 text-on-dark">
                {trip.statusLabel} · {trip.dateLabel}
              </p>
              <h2 className="mb-1.5 font-display text-[34px] tracking-[-0.035em] max-[650px]:text-[28px]">
                {trip.destination}
              </h2>
              <p className="m-0 text-[12px] text-on-dark">{trip.name}</p>
              {trip.notes ? <p className="m-0 mt-1 text-[12px] text-on-dark">{trip.notes}</p> : null}
            </div>
          </section>

          <div className="mb-[18px] flex flex-wrap items-center gap-2" role="tablist" aria-label="Rubriques du voyage">
            {visible.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  activeTab === tab.key
                    ? 'min-h-11 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white'
                    : 'min-h-11 rounded-[12px] border border-border bg-surface px-[15px] text-[13px] font-semibold text-muted'
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={visible.find((tab) => tab.key === activeTab)?.label ?? 'Rubrique'}>
            {activeTab === 'infos' ? (
              <TripInfosPlaceholder participantCount={participantMembers.length} />
            ) : activeTab === 'parametres' ? (
              <TripParametresPlaceholder />
            ) : (
              <TripTabPlaceholder
                label={visible.find((tab) => tab.key === activeTab)?.label ?? ''}
                participantNames={participantMembers.map((member) => member.display_name)}
              />
            )}
          </div>
        </>
      )}
    </ModuleShell>
  );
}

function TripInfosPlaceholder({ participantCount }: { participantCount: number }) {
  return (
    <Panel
      id="trip-infos"
      title="Infos"
      description="Les compteurs réels arrivent avec la suite de la fiche (membres, lignes, budget)."
    >
      <p className="m-0 text-[13px]" role="status">
        {participantCount} participant{participantCount > 1 ? 's' : ''} pour le moment.
      </p>
    </Panel>
  );
}

function TripParametresPlaceholder() {
  return (
    <Panel
      id="trip-parametres"
      title="Paramètres"
      description="Édition, rubriques, code d’invitation et cycle de vie arrivent avec la suite de la fiche."
    >
      <EmptyState
        icon="settings"
        title="Paramètres en préparation"
        description="La gestion du voyage (édition, code, fermeture douce) arrive juste après."
      />
    </Panel>
  );
}

function TripTabPlaceholder({ label, participantNames }: { label: string; participantNames: string[] }) {
  return (
    <Panel id={`trip-tab-${label}`} title={label} description="Cette rubrique s’ouvre avec la suite de l’espace voyage.">
      <div className="mb-3 flex items-center">
        {participantNames.slice(0, 3).map((name) => (
          <span
            key={name}
            className="-ml-[7px] grid size-[23px] place-items-center rounded-[8px] border-2 border-surface bg-fg text-[9px] font-extrabold text-surface first:ml-0"
            title={name}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <EmptyState
        icon="map"
        title={`${label} : bientôt relié au voyage`}
        description="Les lignes propres au voyage (création, onglets étanches, budget) arrivent avec la phase 15-03."
      />
    </Panel>
  );
}
