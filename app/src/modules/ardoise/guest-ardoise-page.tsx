import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { MetricRow, ModuleShell, Panel } from '@/components/shared/module-shell';
import { formatEuro } from '@/lib/utils';
import { setArdoiseLanding } from '@/lib/invites';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { useIsAuthenticated } from '@/hooks/use-auth';
import {
  exchangeArdoiseCodeForHouseholdToken,
  fetchGuestLinkView,
  InviteRequestError,
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
 * il faut un compte puis rejoindre l'ardoise (l'adhésion rattache la
 * participation passée au compte).
 *
 * G-37-2 : un visiteur CONNECTÉ n'était traité nulle part. Il voit désormais
 * une branche « Rejoindre via mon compte » qui appelle le chemin join réel —
 * parité d'ENTRÉE avec cadeaux/voyages, sans en copier la sémantique :
 * l'ardoise reste binaire (lien anonyme lecture seule ↔ rattachement membre
 * du foyer). Le 403 serveur d'un non-membre est le comportement CORRECT du
 * modèle binaire : il s'affiche tel quel, jamais maquillé en succès.
 */
export default function GuestArdoisePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  // WR-03 (37-REVIEW) : un code venu de l'URL ne contourne pas le garde de
  // configuration que le chemin formulaire applique — sans backend configuré,
  // l'URL aboutit au formulaire (même message que la saisie manuelle), pas à
  // une requête promise à l'échec.
  const fromUrl = (params.get('code') ?? '').trim();
  const codeDepuisUrl = isSupabaseConfigured && fromUrl.length >= 22 ? fromUrl : null;
  const [activeCode, setActiveCode] = useState<string | null>(codeDepuisUrl);
  // Le code suit l'URL : naviguer de ?code=A vers ?code=B change d'ardoise
  // dans le MÊME montage (défaut révéré par le test WR-05 — le state initial
  // seul ne se recalcule jamais). La saisie formulaire reste maître quand
  // l'URL ne porte pas de code : l'effet ne court que sur codeDepuisUrl.
  useEffect(() => {
    setActiveCode(codeDepuisUrl);
  }, [codeDepuisUrl]);
  const [formError, setFormError] = useState<string | null>(null);
  const isAuthenticated = useIsAuthenticated();
  const [joinState, setJoinState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  // WR-01 (37-REVIEW) : l'aide « bon compte » est déclenchée par le STATUT
  // HTTP (403 = non-membre, refus attendu du modèle binaire), jamais par un
  // test sur la copie du message serveur — une reformulation côté Edge ne
  // doit pas faire disparaître (ni inventer) l'aide.
  const [joinIs403, setJoinIs403] = useState(false);

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

  // WR-05 (37-REVIEW) : l'état du rattachement appartient à UN code — un
  // succès ou une erreur de l'ardoise A ne doit pas survivre à l'affichage de
  // l'ardoise B (le formulaire permet de repartir sur un autre code). Le
  // dialog de confirmation suit la même règle : ouvert sur A, il ne doit pas
  // hanter l'ardoise B.
  useEffect(() => {
    setJoinState('idle');
    setJoinError(null);
    setJoinIs403(false);
    setConfirmOpen(false);
  }, [activeCode]);

  const view = viewQuery.data ?? null;
  const balances = view?.settlement ? toServerBalances(view.settlement, []) : [];
  const settlements = view?.settlement ? toServerSettlements(view.settlement) : [];
  const total = view?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;

  /**
   * Message d'échec du lien, différencié par le STATUT porté par
   * `InviteRequestError` (WR-02) : un 4xx est un lien réellement invalide
   * (révoqué, expiré) ; tout le reste — 5xx, réseau, statut inconnu — ne
   * permet PAS d'affirmer que le lien ne passe plus (WR-01 : ne plus juger
   * sur la copie du message).
   */
  const messageEchecLien = !isSupabaseConfigured
    ? 'Connexion au serveur indisponible pour le moment.'
    : viewQuery.error instanceof InviteRequestError &&
        viewQuery.error.status >= 400 &&
        viewQuery.error.status < 500
      ? 'Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur.'
      : 'Impossible de charger cette ardoise pour le moment. Réessayez.';

  /**
   * Pont invité→foyer (phase 40) : le clic n'OUVRE QUE le dialog — aucun
   * appel Edge tant que la personne n'a pas confirmé (anti-feature
   * « adhésion implicite », REQUIREMENTS v1.3). À la confirmation, l'échange
   * code→token serveur délivre un token foyer à usage unique, le marqueur
   * d'atterrissage est posé, et le pré-écran foyer existant prend le relais
   * (/foyer/rejoindre?token=…). Les échecs (401 session expirée, 403 déjà
   * membre du foyer, 404 code mort) s'affichent tels quels, WR-02.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rejoindre = async () => {
    if (activeCode === null) return;
    setJoinState('loading');
    setJoinError(null);
    try {
      const { token } = await exchangeArdoiseCodeForHouseholdToken(activeCode);
      setArdoiseLanding();
      navigate(`/foyer/rejoindre?token=${encodeURIComponent(token)}`);
    } catch (cause) {
      // Le statut HTTP porte la distinction (WR-02) : le message serveur
      // s'affiche tel quel, jamais maquillé en succès.
      const status = cause instanceof InviteRequestError ? cause.status : 0;
      const message = cause instanceof Error ? cause.message : 'Adhésion impossible.';
      setJoinError(message);
      setJoinIs403(status === 403);
      setJoinState('error');
    }
  };

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
          <ErrorState message={messageEchecLien} onRetry={() => setActiveCode(null)} />
        ) : (
          <div className="grid gap-[18px]">
            {view.ardoise.coverUrl ? (
              <img
                src={view.ardoise.coverUrl}
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
              description="La lecture est libre, mais avancer une dépense demande un compte. Le compteur d'utilisations du lien compte les rachats (redeem), pas les consultations."
            >
              {isAuthenticated ? (
                <div className="grid gap-3">
                  <p className="m-0 text-[12px] text-muted">
                    Vous êtes connecté : rejoignez l'ardoise via votre compte pour avancer des dépenses — votre
                    participation passée sera rattachée à votre compte à l'adhésion. Un non-membre du foyer recevra
                    un refus explicite.
                  </p>
                  {joinError ? (
                    <div className="grid gap-1.5 rounded-[11px] bg-coral-soft px-3 py-2.5" role="alert">
                      <p className="m-0 text-[12px]">{joinError}</p>
                      {joinIs403 ? (
                        <p className="m-0 text-[12px] text-muted" role="status">
                          Connectez-vous avec le bon compte : celui du foyer de cette ardoise.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {joinState === 'done' ? (
                    <Link
                      to="/ardoise"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
                    >
                      Ouvrir l’ardoise
                    </Link>
                  ) : (
                    <div>
                      <Button icon="arrow" disabled={joinState === 'loading'} onClick={() => setConfirmOpen(true)}>
                        {joinState === 'loading' ? 'Adhésion en cours…' : 'Rejoindre via mon compte'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="m-0 mb-3 text-[12px] text-muted">
                    Créez un compte, puis rejoignez l’ardoise : votre participation passée sera rattachée à votre
                    compte à l’adhésion.
                  </p>
                  <Link
                    to="/connexion"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
                  >
                    Créer un compte
                  </Link>
                </>
              )}
            </Panel>
          </div>
        )}
      </Panel>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => setConfirmOpen(open)}
        title={
          view?.householdName
            ? `Vous allez rejoindre le foyer ${view.householdName}`
            : 'Vous allez rejoindre le foyer de cette ardoise'
        }
        description="Vous deviendrez membre du foyer et votre participation passée à cette ardoise sera rattachée à votre compte."
        confirmLabel="Rejoindre le foyer"
        cancelLabel="Ne pas rejoindre"
        destructive={false}
        onConfirm={() => {
          setConfirmOpen(false);
          void rejoindre();
        }}
        icon="users"
      />
    </ModuleShell>
  );
}
