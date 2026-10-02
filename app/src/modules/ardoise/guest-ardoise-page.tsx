import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { formatEuro } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  fetchGuestLinkView,
  toServerBalances,
  toServerSettlements,
} from './api';
import { MemberBalances } from './components/balance-panel';
import { SettlementsPanel } from './components/settlements-panel';

/**
 * Page PUBLIQUE d'invitation (hors authentification) : un lien
 * `/invitation/ardoise?code=…` suffit — aucun compte, aucun nom demandé.
 *
 * Accès anonyme en lecture seule : le code EST le contrôle d'accès (actif,
 * non expiré). Aucune ligne invitée créée, compteur d'utilisations intact,
 * l'invité n'apparaît pas dans la répartition. Pour AVANCER des dépenses,
 * il faut un compte puis rejoindre l'ardoise (l'adhésion inscrit aux
 * dépenses à part zéro sur le passé).
 */
export default function GuestArdoisePage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [activeCode, setActiveCode] = useState(() => {
    const initial = (params.get('code') ?? '').trim();
    return initial.length >= 22 ? initial : null;
  });
  const [formError, setFormError] = useState<string | null>(null);

  const viewQuery = useQuery({
    queryKey: ['ardoise', 'link-view', activeCode ?? ''],
    enabled: activeCode !== null,
    retry: false,
    queryFn: () => fetchGuestLinkView(activeCode as string),
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
    setActiveCode(trimmed);
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
        description={view ? 'Accès invité · lecture seule' : 'Un lien suffit, aucun compte n’est requis pour regarder.'}
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
                Voir l’ardoise
              </Button>
            </div>
          </form>
        ) : viewQuery.isLoading ? (
          <LoadingRows rows={3} />
        ) : viewQuery.isError || !view ? (
          <ErrorState
            message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
            onRetry={() => setActiveCode(null)}
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
                Créez un compte, puis rejoignez l’ardoise : vous serez ajouté aux dépenses (part zéro sur le
                passé, partage normal ensuite).
              </p>
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
