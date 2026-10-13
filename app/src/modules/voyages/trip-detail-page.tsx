import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/primitives';
import { MemberAvatar } from '@/components/shared/member-avatar';
import { useToast } from '@/components/ui/toast';
import { useHouseholdStore } from '@/stores/household-store';
import { formatEuro } from '@/lib/utils';
import { useTripDetail, type TripDetailState } from './hooks/use-trip-detail';
import { TripFormDialog } from './components/trip-form-dialog';
import { TripMembersSection } from './components/trip-members-section';
import { TripShareDialog } from './components/trip-share-dialog';
import { TripTasksTab } from './components/trip-tasks-tab';
import { TripCoursesTab } from './components/trip-courses-tab';
import { TripNotesTab } from './components/trip-notes-tab';
import { TripPlacesTab } from './components/trip-places-tab';
import { TripBudgetTab } from './components/trip-budget-tab';
import { isServableCoverUrl } from './voyages-page';
import {
  closeTrip,
  leaveTrip,
  reopenTrip,
  saveTripMeta,
  updateTripMeta,
  type TripCounts,
} from './api';
import {
  TRIP_TOGGLABLE_TABS,
  TRIP_TABS,
  visibleTripTabs,
  type Trip,
  type TripInput,
  type TripTabKey,
} from './types';

/**
 * Fiche d'un voyage (phase 15) : héros + barre d'onglets (Infos, Courses,
 * Notes, Tâches, Adresses, Budget, Paramètres). Les onglets désactivés sont
 * masqués, jamais supprimés (D-05). 15-02 remplit Infos et Paramètres ;
 * 15-03 remplit les cinq rubriques.
 */
export default function TripDetailPage() {
  const { tripId } = useParams();
  const detail = useTripDetail(tripId ?? null);
  const { trip, tabState, isLoading, isError, error, notAuthorized, readOnly } = detail;
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
              <TripInfosTab detail={detail} />
            ) : activeTab === 'parametres' ? (
              <TripParametresTab detail={detail} trip={trip} />
            ) : activeTab === 'taches' ? (
              <TripTasksMount detail={detail} />
            ) : activeTab === 'courses' ? (
              <TripCoursesMount detail={detail} />
            ) : activeTab === 'notes' ? (
              <TripNotesMount detail={detail} />
            ) : activeTab === 'adresses' ? (
              <TripPlacesMount detail={detail} />
            ) : activeTab === 'budget' ? (
              <TripBudgetMount detail={detail} />
            ) : (
              <TripTabPlaceholder
                label={visible.find((tab) => tab.key === activeTab)?.label ?? ''}
              />
            )}
          </div>
        </>
      )}
    </ModuleShell>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Infos : participants, invités, compteurs réels, budget lié   */
/* ------------------------------------------------------------------ */

function CountCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-[17px]">
      <strong className="block font-display text-[25px] tracking-[-0.05em]">
        {value === null ? '—' : value}
      </strong>
      <span className="text-[11px] text-muted">{label}</span>
      {value === null ? (
        <p className="mt-1 mb-0 text-[11px] text-muted">Illisible pour le moment.</p>
      ) : null}
    </div>
  );
}

function TripInfosTab({ detail }: { detail: TripDetailState }) {
  const { participantMembers, guests, counts, countsLoading } = detail;
  const budget: TripCounts | null = counts;
  const emptyTrip = participantMembers.length === 0 && guests.length === 0;
  return (
    <div className="grid gap-3.5">
      {emptyTrip ? (
        <p
          role="status"
          className="m-0 rounded-[14px] border border-accent bg-accent-faint px-[15px] py-3 text-[13px] font-semibold text-accent-strong"
        >
          Aucun participant ni invité pour le moment — ajoutez des membres dans l’onglet Paramètres ou
          partagez le voyage par code.
        </p>
      ) : null}
      <Panel id="trip-infos-people" title="Participants" description="Membres du voyage et invités externes.">
        <div className="flex flex-wrap items-center gap-2">
          {participantMembers.map((member) => (
            <span key={member.id} className="inline-flex items-center gap-1.5 rounded-[10px] bg-bg px-2 py-1 text-[12px] font-semibold">
              <MemberAvatar member={member} size="sm" />
              {member.display_name}
            </span>
          ))}
        </div>
        {guests.length > 0 ? (
          <p className="mt-2.5 mb-0 text-[12px] text-muted">
            Invités : {guests.map((guest) => guest.display_name).join(', ')}.
          </p>
        ) : (
          <p className="mt-2.5 mb-0 text-[12px] text-muted" role="status">
            Aucun invité pour le moment — le partage par code se gère dans l’onglet Paramètres.
          </p>
        )}
      </Panel>

      {countsLoading ? (
        <LoadingRows rows={2} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3.5 max-[650px]:grid-cols-1">
            <CountCard label="listes de courses du voyage" value={budget?.lists ?? null} />
            <CountCard label="notes du voyage" value={budget?.notes ?? null} />
            <CountCard label="tâches du voyage" value={budget?.tasks ?? null} />
            <CountCard label="adresses du voyage" value={budget?.places ?? null} />
          </div>
          <Panel id="trip-infos-budget" title="Budget" description="Ardoise liée au voyage (répartition complète dans l’onglet Budget).">
            {budget?.ardoiseId ? (
              <p className="m-0 text-[13px]" role="status">
                {budget.expenseCount ?? '—'} dépense{(budget.expenseCount ?? 0) > 1 ? 's' : ''}
                {' · '}
                total {budget.expenseTotal === null ? '—' : formatEuro(budget.expenseTotal)}.
              </p>
            ) : (
              <p className="m-0 text-[13px] text-muted" role="status">
                Aucune ardoise liée pour le moment.
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onglet Paramètres : édition, rubriques, fermeture douce, départ      */
/*                                                                     */
/* Pas de suppression en cascade, nulle part (D-08) : fermer fige,      */
/* rouvrir répare, partir retire — détruire n’existe pas.              */
/* ------------------------------------------------------------------ */

function TripParametresTab({ detail, trip }: { detail: TripDetailState; trip: Trip }) {
  const toast = useToast();
  const navigate = useNavigate();
  const householdId = useHouseholdStore((state) => state.householdId);
  const { tabState, isParticipant, isAdmin, readOnly, storedCover } = detail;
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<TripTabKey | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [pendingLeave, setPendingLeave] = useState(false);
  const [acting, setActing] = useState(false);
  const tabLabels = new Map(TRIP_TABS.map((tab) => [tab.key, tab.label]));
  const frozen = trip.closed;

  if (readOnly) {
    return (
      <div className="grid gap-3.5">
        <Panel
          id="trip-parametres"
          title="Paramètres"
          description="Vue de modération : ce voyage ne vous attend pas comme participant."
        >
          <p className="m-0 text-[13px] text-muted">
            Édition, rubriques, fermeture et départ sont réservés aux participants ; la liste des membres, le
            partage par code et la réouverture d’un voyage figé restent possibles ci-dessous pour les
            administrateurs.
          </p>
          {!frozen && isAdmin ? (
            <div className="mt-3">
              <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>
                Partager le voyage
              </Button>
            </div>
          ) : null}
          {frozen && isAdmin ? (
            <div className="mt-3">
              <Button
                variant="secondary"
                icon="check"
                disabled={acting}
                onClick={() => {
                  setActing(true);
                  reopenTrip(detail.tripId as string)
                    .then(() => {
                      toast('Voyage rouvert.', 'success');
                      detail.refetch();
                    })
                    .catch((reopenError: unknown) =>
                      toast(reopenError instanceof Error ? reopenError.message : 'Réouverture impossible.', 'error'),
                    )
                    .finally(() => setActing(false));
                }}
              >
                {acting ? 'Réouverture…' : 'Rouvrir le voyage'}
              </Button>
            </div>
          ) : null}
          <TripShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            tripId={detail.tripId}
            tripName={trip.name}
          />
        </Panel>
        <TripMembersSection
          tripId={detail.tripId as string}
          participantIds={detail.participantMembers.map((member) => member.id)}
          guests={detail.guests}
          canManage={isAdmin && !frozen}
          frozen={frozen}
          onChanged={detail.refetch}
        />
      </div>
    );
  }

  const saveEdit = async (input: TripInput, id: string | null): Promise<boolean> => {
    if (!householdId || !id || frozen) return false;
    setSaving(true);
    try {
      await saveTripMeta({ tripId: id, householdId, input, previousCover: storedCover });
      detail.refetch();
      toast('Voyage mis à jour.', 'success');
      return true;
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Mise à jour impossible.', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setTab = (key: TripTabKey, on: boolean) => {
    if (!tabState || frozen || toggling) return;
    setToggling(key);
    updateTripMeta(detail.tripId as string, { tab_state: { ...tabState, [key]: on } })
      .then(() => {
        detail.refetch();
        toast(on ? `Rubrique « ${tabLabels.get(key)} » affichée.` : `Rubrique « ${tabLabels.get(key)} » masquée (contenu conservé).`);
      })
      .catch((toggleError: unknown) =>
        toast(toggleError instanceof Error ? toggleError.message : 'Rubrique impossible.', 'error'),
      )
      .finally(() => setToggling(null));
  };

  const confirmClose = () => {
    setPendingClose(false);
    setActing(true);
    closeTrip(detail.tripId as string)
      .then(() => {
        toast('Voyage figé.', 'success');
        detail.refetch();
      })
      .catch((closeError: unknown) =>
        toast(closeError instanceof Error ? closeError.message : 'Fermeture impossible.', 'error'),
      )
      .finally(() => setActing(false));
  };

  const confirmLeave = () => {
    setPendingLeave(false);
    setActing(true);
    leaveTrip(detail.tripId as string)
      .then(() => {
        toast('Vous avez quitté ce voyage.');
        navigate('/voyages');
      })
      .catch((leaveError: unknown) => {
        toast(leaveError instanceof Error ? leaveError.message : 'Départ impossible.', 'error');
        setActing(false);
      });
  };

  return (
    <div className="grid gap-3.5">
      <Panel id="trip-parametres-edit" title="Infos du voyage" description="Nom, destination, dates, couverture, notes.">
        {frozen ? (
          <p className="m-0 text-[12px] text-muted" role="status">
            Voyage figé : l’édition reprendra à la réouverture.
          </p>
        ) : (
          <div>
            <Button variant="secondary" icon="edit" onClick={() => setEditOpen(true)}>
              Modifier les infos
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        id="trip-parametres-tabs"
        title="Rubriques affichées"
        description="Masquer retire l’onglet de la barre — le contenu est conservé, jamais supprimé."
      >
        <div className="grid gap-2">
          {TRIP_TOGGLABLE_TABS.map((key) => {
            const checked = tabState?.[key] !== false;
            return (
              <div
                key={key}
                className="flex min-h-11 items-center justify-between gap-3 rounded-[9px] border border-border bg-bg px-2.5"
              >
                <label
                  htmlFor={`trip-tab-${key}`}
                  className="flex-1 text-[12px] font-semibold text-muted"
                >
                  {tabLabels.get(key)}
                  {toggling === key ? '…' : ''}
                </label>
                <Switch
                  id={`trip-tab-${key}`}
                  checked={checked}
                  disabled={frozen || toggling !== null}
                  onCheckedChange={(next) => setTab(key, next)}
                  aria-label={`Afficher la rubrique ${tabLabels.get(key)}`}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        id="trip-parametres-share"
        title="Partage par code"
        description="Un proche hors foyer rejoint avec le code : avec son compte il participe, sans compte il visite en invité."
      >
        {frozen ? (
          <p className="m-0 text-[12px] text-muted" role="status">
            Voyage figé : le partage reprendra à la réouverture.
          </p>
        ) : (
          <div>
            <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>
              Partager le voyage
            </Button>
          </div>
        )}
      </Panel>

      <TripMembersSection
        tripId={detail.tripId as string}
        participantIds={detail.participantMembers.map((member) => member.id)}
        guests={detail.guests}
        canManage={isAdmin && !frozen}
        frozen={frozen}
        onChanged={detail.refetch}
      />

      <Panel
        id="trip-parametres-lifecycle"
        title="Cycle de vie"
        description="Fermer fige sans détruire ; partir retire sans effacer ; rouvrir répare (admin seul)."
      >
        <div className="flex flex-wrap gap-2">
          {!frozen ? (
            <Button variant="secondary" icon="check" disabled={acting} onClick={() => setPendingClose(true)}>
              Figer le voyage
            </Button>
          ) : isAdmin ? (
            <Button
              variant="secondary"
              icon="check"
              disabled={acting}
              onClick={() => {
                setActing(true);
                reopenTrip(detail.tripId as string)
                  .then(() => {
                    toast('Voyage rouvert.', 'success');
                    detail.refetch();
                  })
                  .catch((reopenError: unknown) =>
                    toast(reopenError instanceof Error ? reopenError.message : 'Réouverture impossible.', 'error'),
                  )
                  .finally(() => setActing(false));
              }}
            >
              {acting ? 'Réouverture…' : 'Rouvrir le voyage'}
            </Button>
          ) : null}
          {isParticipant ? (
            <Button variant="danger" icon="arrow" disabled={acting} onClick={() => setPendingLeave(true)}>
              Quitter ce voyage
            </Button>
          ) : null}
        </div>
        {!frozen ? (
          <p className="mt-2.5 mb-0 text-[11px] text-muted">
            Figer rend toutes les rubriques en lecture seule ; le contenu reste intact.
          </p>
        ) : null}
      </Panel>

      <TripFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        trip={trip}
        busy={saving}
        onSubmit={saveEdit}
      />

      <TripShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tripId={detail.tripId}
        tripName={trip.name}
      />

      <ConfirmDialog
        open={pendingClose}
        onOpenChange={setPendingClose}
        title="Figer ce voyage ?"
        description={`${trip.destination} · ${trip.dateLabel} — les rubriques passeront en lecture seule, sans rien supprimer.`}
        confirmLabel="Figer le voyage"
        onConfirm={confirmClose}
      />

      <ConfirmDialog
        open={pendingLeave}
        onOpenChange={setPendingLeave}
        title="Quitter ce voyage ?"
        description="Vous ne verrez plus sa fiche ; vos lignes déjà écrites restent pour le foyer."
        confirmLabel="Quitter"
        onConfirm={confirmLeave}
      />
    </div>
  );
}

/**
 * Montage de l'onglet Tâches (15-03) : la fourche reçoit les participants
 * du voyage (assignations trip-only) ; figé ou modération = lecture seule.
 */
function TripTasksMount({ detail }: { detail: TripDetailState }) {
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  if (!householdId || !detail.tripId) return null;
  return (
    <TripTasksTab
      tripId={detail.tripId}
      householdId={householdId}
      members={detail.participantMembers}
      currentMemberId={currentMemberId}
      readOnly={detail.readOnly || detail.trip?.closed === true}
    />
  );
}

/**
 * Socle commun des fourches Courses/Notes/Adresses : identifiants, foyer,
 * lecture seule (figé ou modération).
 */
function useTripForkMount(detail: TripDetailState): {
  tripId: string;
  householdId: string;
  currentMemberId: string | null;
  readOnly: boolean;
} | null {
  const householdId = useHouseholdStore((state) => state.householdId);
  const currentMemberId = useHouseholdStore((state) => state.currentMemberId);
  if (!householdId || !detail.tripId) return null;
  return {
    tripId: detail.tripId,
    householdId,
    currentMemberId,
    readOnly: detail.readOnly || detail.trip?.closed === true,
  };
}

function TripCoursesMount({ detail }: { detail: TripDetailState }) {
  // Les hooks ne sont jamais conditionnels : le socle est lu dans un
  // composant enfant qui rend `null` sans identifiants.
  return <TripForkMount detail={detail} kind="courses" />;
}

function TripNotesMount({ detail }: { detail: TripDetailState }) {
  return <TripForkMount detail={detail} kind="notes" />;
}

function TripPlacesMount({ detail }: { detail: TripDetailState }) {
  return <TripForkMount detail={detail} kind="adresses" />;
}

/**
 * Montage de l'onglet Budget (15-03) : enveloppe fine sur l'ardoise liée —
 * participants et invités du voyage pour les dépenses, lecture seule si
 * figé ou modération.
 */
function TripBudgetMount({ detail }: { detail: TripDetailState }) {
  return <TripBudgetForkMount detail={detail} />;
}

function TripBudgetForkMount({ detail }: { detail: TripDetailState }) {
  const mount = useTripForkMount(detail);
  if (!mount) return null;
  return (
    <TripBudgetTab
      tripId={mount.tripId}
      householdId={mount.householdId}
      members={detail.participantMembers}
      guests={detail.guests}
      currentMemberId={mount.currentMemberId}
      readOnly={mount.readOnly}
    />
  );
}

function TripForkMount({ detail, kind }: { detail: TripDetailState; kind: 'courses' | 'notes' | 'adresses' }) {
  const mount = useTripForkMount(detail);
  if (!mount) return null;
  if (kind === 'courses') {
    return (
      <TripCoursesTab
        tripId={mount.tripId}
        householdId={mount.householdId}
        currentMemberId={mount.currentMemberId}
        readOnly={mount.readOnly}
      />
    );
  }
  if (kind === 'notes') {
    return (
      <TripNotesTab
        tripId={mount.tripId}
        householdId={mount.householdId}
        currentMemberId={mount.currentMemberId}
        readOnly={mount.readOnly}
      />
    );
  }
  return <TripPlacesTab tripId={mount.tripId} householdId={mount.householdId} readOnly={mount.readOnly} />;
}

function TripTabPlaceholder({ label }: { label: string }) {
  return (
    <Panel id={`trip-tab-${label}`} title={label} description="Cette rubrique s’ouvre avec la suite de l’espace voyage.">
      <EmptyState
        icon="map"
        title={`${label} : bientôt relié au voyage`}
        description="Les lignes propres au voyage (création, onglets étanches, budget) arrivent avec la phase 15-03."
      />
    </Panel>
  );
}
