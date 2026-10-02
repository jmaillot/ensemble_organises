import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { formatEuro } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  fetchGuestArdoiseView,
  readGuestLinkArdoise,
  readGuestTicket,
  redeemGuestTicket,
  toServerBalances,
  toServerSettlements,
  writeGuestLinkArdoise,
} from './api';
import { MemberBalances } from './components/balance-panel';
import { SettlementsPanel } from './components/settlements-panel';

interface GuestSession {
  ticket: string;
  ardoiseId: string;
}

function readStoredSession(code: string): GuestSession | null {
  const trimmed = code.trim();
  if (trimmed === '') return null;
  const ardoiseId = readGuestLinkArdoise(trimmed);
  if (!ardoiseId) return null;
  const ticket = readGuestTicket(ardoiseId);
  if (!ticket) return null;
  return { ticket, ardoiseId };
}

/**
 * Page PUBLIQUE d'invitation (hors authentification) : un lien
 * `/invitation/ardoise?code=…` suffit, aucun compte requis.
 *
 * Parcours : code (pré-rempli) + pseudonyme → échange contre un ticket stocké
 * sur l'appareil → lecture seule de l'ardoise. L'échange n'a lieu qu'une fois
 * par appareil (ni doublon d'invité, ni consommation du compteur au retour).
 * Pour AVANCER des dépenses, il faut un compte puis rejoindre l'ardoise.
 */
export default function GuestArdoisePage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [displayName, setDisplayName] = useState('');
  const [session, setSession] = useState<GuestSession | null>(() => readStoredSession(params.get('code') ?? ''));
  const [formError, setFormError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const viewQuery = useQuery({
    queryKey: ['ardoise', 'guest-view', session?.ardoiseId ?? ''],
    enabled: Boolean(session),
    retry: false,
    queryFn: () => fetchGuestArdoiseView((session as GuestSession).ticket),
  });

  const join = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!isSupabaseConfigured) {
      setFormError('Connexion au serveur indisponible pour le moment.');
      return;
    }
    setIsJoining(true);
    void redeemGuestTicket(code, displayName)
      .then(({ ardoiseId }) => {
        writeGuestLinkArdoise(code, ardoiseId);
        const ticket = readGuestTicket(ardoiseId);
        setSession(ticket ? { ticket, ardoiseId } : null);
      })
      .catch((joinError: unknown) =>
        setFormError(joinError instanceof Error ? joinError.message : 'Code invalide.'),
      )
      .finally(() => setIsJoining(false));
  };

  const view = viewQuery.data ?? null;
  const balances = view?.settlement ? toServerBalances(view.settlement, []) : [];
  const settlements = view?.settlement ? toServerSettlements(view.settlement) : [];
  const total = view?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;

  return (
    <ModuleShell module="ardoise">
      <Panel
        id="guest-ardoise-panel"
        title={view ? view.ardoise.name : 'Invitation à une ardoise'}
        description={
          view
            ? `Invité : ${view.guest.display_name} · lecture seule`
            : 'Un code suffit, aucun compte n’est requis pour regarder.'
        }
      >
        {!session ? (
          <form noValidate className="grid gap-3.5" onSubmit={join}>
            <Field label="Code d’invitation" error={formError ?? undefined}>
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  onChange={(change) => setCode(change.target.value)}
                  autoComplete="off"
                  placeholder="Code partagé par l’organisateur"
                />
              )}
            </Field>
            <Field label="Votre pseudonyme">
              {(props) => (
                <Input
                  {...props}
                  value={displayName}
                  onChange={(change) => setDisplayName(change.target.value)}
                  maxLength={120}
                  autoComplete="nickname"
                  placeholder="Ex. Hugo"
                />
              )}
            </Field>
            <div>
              <Button type="submit" icon="arrow" disabled={isJoining || code.trim().length < 22}>
                {isJoining ? 'Vérification…' : 'Voir l’ardoise'}
              </Button>
            </div>
          </form>
        ) : viewQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : viewQuery.isError || !view ? (
          <ErrorState
            message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau code à l’organisateur."
            onRetry={() => {
              setSession(null);
              void queryClient.invalidateQueries({ queryKey: ['ardoise', 'guest-view'] });
            }}
          />
        ) : (
          <div className="grid gap-[18px]">
            {view.ardoise.cover_url ? (
              <img
                src={view.ardoise.cover_url}
                alt={`Couverture de ${view.ardoise.name}`}
                className="h-36 w-full rounded-[12px] object-cover"
              />
            ) : null}
            <MetricRow
              items={[
                { label: 'Total dépensé', value: formatEuro(total), caption: `${view.expenses.length} dépenses` },
                { label: 'Participants', value: balances.length, caption: 'soldes serveur' },
              ]}
            />
            {view.expenses.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="Aucune dépense pour le moment"
                description="Revenez plus tard : l’organisateur n’a encore rien ajouté."
              />
            ) : (
              <div role="list" aria-label="Dépenses de l’ardoise" className="grid gap-2.5">
                {view.expenses.map((expense) => (
                  <div
                    key={expense.id}
                    role="listitem"
                    className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border px-3.5 py-3"
                  >
                    <div className="min-w-[150px] flex-1">
                      <p className="m-0 text-[13px] font-[760]">{expense.title}</p>
                      <small className="text-[11px] text-muted">
                        {expense.paidByName} · {expense.participants.length} participant
                        {expense.participants.length > 1 ? 's' : ''}
                      </small>
                    </div>
                    <strong className="text-[15px]">{formatEuro(expense.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
            <MemberBalances balances={balances} source="serveur" />
            <SettlementsPanel settlements={settlements} />
            <Panel
              id="guest-ardoise-join-panel"
              title="Participer ?"
              description="La lecture est libre, mais avancer une dépense demande un compte."
            >
              <p className="m-0 mb-3 text-[12px] text-muted">
                Créez un compte, puis rejoignez l’ardoise avec ce code : gardez-le précieusement.
              </p>
              <p className="m-0 mb-3 rounded-[11px] bg-bg px-3 py-2.5 font-mono text-[13px] break-all">{code.trim()}</p>
              <Link
                to="/connexion"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
              >
                Créer un compte
              </Link>
            </Panel>
          </div>
        )}
      </Panel>
    </ModuleShell>
  );
}
