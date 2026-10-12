import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { useIsAuthenticated, useSessionUser } from '@/hooks/use-auth';
import { isServableCoverUrl } from './voyages-page';
import {
  fetchTripGuestView,
  fetchTripLinkView,
  joinTripWithCode,
  redeemTripGuest,
  writeTripTicket,
  type TripGuestView,
} from './api';

/**
 * Page PUBLIQUE d'invitation voyage : un lien `/invitation/voyage?code=…`
 * mène ici (phase 15, D-09, motif gift-share-dialog).
 *
 * Deux parcours :
 * - AVEC compte (même foyer) : « Rejoindre via mon compte » échange le code
 *   (`join`) puis mène à la fiche — participation complète.
 * - SANS compte (ou sans lier son compte) : la vue anonyme par lien
 *   (`link-view`, sans création d'invité) présente le voyage ; « Rejoindre
 *   comme invité » déclare un pseudonyme, échange un ticket (`redeem-guest`,
 *   persisté en `eo:trip:ticket:<tripId>`) et rend la vue invitée
 *   (`guest-view`). Aucun contrôle de membre n'est jamais rendu.
 *
 * La vue servie est l'identité du voyage seule (15-01) : compteurs et budget
 * arriveront avec les rubriques (15-03) — la page l'avoue au lieu d'inventer.
 */
export default function GuestTripPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [activeCode, setActiveCode] = useState<string | null>(() => {
    const initial = (params.get('code') ?? '').trim();
    return initial.length >= 22 ? initial : null;
  });
  const [formError, setFormError] = useState<string | null>(null);
  const isAuthenticated = useIsAuthenticated();
  const user = useSessionUser();
  // Choix explicite du visiteur connecté : le join ne part qu'après
  // « Rejoindre via mon compte ». `null` = choix pas encore fait.
  const [choice, setChoice] = useState<'join' | 'anonymous' | null>(null);

  const joinQuery = useQuery({
    queryKey: ['voyages', 'invite-join', activeCode ?? ''],
    enabled: activeCode !== null && isAuthenticated && choice === 'join' && isSupabaseConfigured,
    retry: false,
    queryFn: () => joinTripWithCode(activeCode as string),
  });

  const openLink = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!isSupabaseConfigured) {
      setFormError('Connexion au serveur indisponible pour le moment.');
      return;
    }
    const trimmed = code.trim();
    if (trimmed.length < 22) {
      setFormError('Ce lien semble incomplet.');
      return;
    }
    setChoice(null);
    setActiveCode(trimmed);
  };

  const resetCode = () => {
    setChoice(null);
    setActiveCode(null);
  };

  const joined = joinQuery.data ?? null;

  return (
    <ModuleShell module="voyages">
      <Panel
        id="guest-trip-panel"
        title="Invitation à un voyage"
        description={
          !isAuthenticated || choice === 'anonymous'
            ? 'Visitez sans compte : le voyage se présente, un pseudonyme suffit pour rejoindre comme invité.'
            : 'Votre compte active la participation : vous rejoindrez le voyage dans votre foyer.'
        }
      >
        {!activeCode ? (
          <form noValidate className="grid gap-3.5" onSubmit={openLink}>
            <Field label="Code d’invitation" error={formError ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  onChange={(change) => setCode(change.target.value)}
                  autoComplete="off"
                  placeholder="Code figurant dans le lien partagé"
                />
              )}
            </Field>
            <div>
              <Button type="submit" icon="arrow" disabled={code.trim().length < 22}>
                Ouvrir l’invitation
              </Button>
            </div>
          </form>
        ) : !isAuthenticated ? (
          <GuestTripAnonymousView code={activeCode} onResetCode={() => setActiveCode(null)} />
        ) : choice === 'anonymous' ? (
          <div className="grid gap-3.5">
            <p className="m-0 text-[13px]">
              Vous continuez <strong>sans lier votre compte</strong> : vous visiterez comme invité sous pseudonyme —
              rien ne sera rattaché à votre compte.
            </p>
            <GuestTripAnonymousView code={activeCode} onResetCode={resetCode} />
            <div>
              <Button variant="quiet" size="sm" onClick={() => setChoice(null)}>
                Revenir au choix
              </Button>
            </div>
          </div>
        ) : choice === 'join' ? (
          joinQuery.isLoading ? (
            <LoadingRows rows={2} />
          ) : joinQuery.isError || !joined ? (
            <ErrorState
              message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
              onRetry={resetCode}
            />
          ) : (
            <div className="grid gap-3">
              <p className="m-0 text-[13px]">
                {joined.already_member
                  ? 'Vous participez déjà à ce voyage : vos rubriques sont conservées.'
                  : 'Voyage rejoint : vous participez désormais à ses rubriques.'}
              </p>
              <div>
                <Link
                  to={`/voyages/${joined.trip_id}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
                >
                  Ouvrir le voyage
                </Link>
              </div>
            </div>
          )
        ) : (
          <div className="grid gap-3.5">
            <p className="m-0 text-[13px]">Ce lien vous propose deux façons de participer :</p>
            <div className="grid gap-1.5">
              <div>
                <Button icon="arrow" onClick={() => setChoice('join')}>
                  Rejoindre via mon compte
                </Button>
              </div>
              <p className="m-0 text-[12px] text-muted">
                Active la participation sur votre compte (foyer{user?.email ? ` · ${user.email}` : ''}) : la fiche
                complète apparaîtra dans vos voyages.
              </p>
            </div>
            <div className="grid gap-1.5">
              <div>
                <Button variant="secondary" onClick={() => setChoice('anonymous')}>
                  Continuer sans lier mon compte
                </Button>
              </div>
              <p className="m-0 text-[12px] text-muted">
                Vous visiterez comme invité sous pseudonyme : rien ne sera rattaché à votre compte ni à un foyer.
              </p>
            </div>
          </div>
        )}
        {!isSupabaseConfigured ? (
          <EmptyState
            icon="map"
            title="Mode hors ligne"
            description="L’échange du code exige le serveur : reconnectez-vous pour continuer."
          />
        ) : null}
      </Panel>
    </ModuleShell>
  );
}

/**
 * Parcours invité : vue anonyme par lien (sans création d'invité), puis
 * échange explicite (pseudonyme → ticket persisté → vue invitée). La vérité
 * reste côté serveur ; le ticket mémorisé ne prouve rien à lui seul.
 */
function GuestTripAnonymousView({ code, onResetCode }: { code: string; onResetCode: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const linkQuery = useQuery({
    queryKey: ['voyages', 'link-view', code],
    enabled: isSupabaseConfigured && ticket === null,
    retry: false,
    queryFn: () => fetchTripLinkView(code),
  });

  const ticketQuery = useQuery({
    queryKey: ['voyages', 'guest-view', code, ticket ?? ''],
    enabled: isSupabaseConfigured && ticket !== null,
    retry: false,
    queryFn: () => fetchTripGuestView(ticket as string),
  });

  const join = () => {
    setNameError(null);
    setNotice(null);
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 120) {
      setNameError('Indiquez un pseudonyme (1 à 120 caractères).');
      return;
    }
    setJoining(true);
    redeemTripGuest(code, trimmed)
      .then(({ tripId, ticket: fresh }) => {
        writeTripTicket(tripId, fresh);
        setTicket(fresh);
        setNotice(`Bienvenue, ${trimmed} : votre invitation est enregistrée sur cet appareil.`);
        toast('Invitation enregistrée.');
      })
      .catch((joinError: unknown) => {
        const message = joinError instanceof Error ? joinError.message : 'Invitation impossible.';
        if (/invalide|ne passe plus/.test(message)) {
          setNotice('Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur.');
        } else if (/pseudonyme/.test(message)) {
          setNameError('Indiquez un pseudonyme (1 à 120 caractères).');
        } else {
          setNotice(message);
        }
      })
      .finally(() => setJoining(false));
  };

  if (ticket !== null) {
    if (ticketQuery.isLoading) return <LoadingRows rows={3} />;
    if (ticketQuery.isError || !ticketQuery.data) {
      return (
        <ErrorState
          message="Votre invitation ne passe plus. Recommencez avec le lien partagé."
          onRetry={onResetCode}
        />
      );
    }
    return <GuestTripCard view={ticketQuery.data} notice={notice} />;
  }

  if (linkQuery.isLoading) return <LoadingRows rows={3} />;
  if (linkQuery.isError || !linkQuery.data) {
    return (
      <ErrorState
        message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
        onRetry={onResetCode}
      />
    );
  }

  const view = linkQuery.data;

  return (
    <div className="grid gap-3.5">
      <GuestTripCard view={view} notice={null} />
      <Field label="Votre pseudonyme" error={nameError ?? undefined} hint="1 à 120 caractères, pour rejoindre comme invité">
        {(props) => (
          <Input
            {...props}
            value={name}
            onChange={(change) => setName(change.target.value)}
            autoComplete="nickname"
            placeholder="Ex. Mamie"
            maxLength={120}
          />
        )}
      </Field>
      {notice ? (
        <p className="m-0 rounded-[11px] bg-accent-faint px-3 py-2.5 text-[12px]" role="status">
          {notice}
        </p>
      ) : null}
      <div>
        <Button icon="arrow" disabled={joining} onClick={join}>
          {joining ? 'Invitation…' : 'Rejoindre comme invité'}
        </Button>
      </div>
      <p className="m-0 text-[11px] text-muted">
        Rejoindre crée votre invitation (ticket conservé sur cet appareil) : les dépenses invitées suivront avec
        les rubriques.
      </p>
    </div>
  );
}

/** Carte invitée : identité du voyage seule, jamais de contrôle de membre. */
function GuestTripCard({ view, notice }: { view: TripGuestView; notice: string | null }) {
  return (
    <div className="grid gap-3">
      {isServableCoverUrl(view.coverPhoto) ? (
        <img
          src={view.coverPhoto}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-44 w-full rounded-[14px] object-cover"
        />
      ) : null}
      <div>
        <p className="eyebrow mb-1">
          {view.startDate && view.endDate ? `${view.startDate} — ${view.endDate}` : 'Dates à définir'}
        </p>
        <p className="m-0 font-display text-[22px] tracking-[-0.03em]">{view.destination || view.name}</p>
        {view.notes ? <p className="m-0 mt-1 text-[12px] text-muted">{view.notes}</p> : null}
      </div>
      {view.isClosed ? (
        <p className="m-0 text-[12px] font-semibold" role="status">
          Ce voyage est figé : visite en lecture seule.
        </p>
      ) : null}
      {view.displayName ? (
        <p className="m-0 text-[12px] text-muted" role="status">
          Invité : {view.displayName}.
        </p>
      ) : null}
      {notice ? (
        <p className="m-0 rounded-[11px] bg-accent-faint px-3 py-2.5 text-[12px]" role="status">
          {notice}
        </p>
      ) : null}
      <p className="m-0 text-[11px] text-muted">
        Détail des rubriques et budget partagé : les participants les ouvrent depuis leur fiche.
      </p>
    </div>
  );
}
