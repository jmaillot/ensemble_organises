import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { useSessionUser } from '@/hooks/use-auth';
import {
  cancelAccountDeletion,
  fetchAccountDeletionRequests,
  requestAccountDeletion,
} from '../api';
import {
  statutDemandeSuppressionLabels,
  type AccountDeletionRequestRow,
  type StatutDemandeSuppression,
} from '../types';

/**
 * « Mes données (RGPD) — suppression du compte » : l'unique surface où le
 * membre exerce son droit à l'effacement (RGDP-01/02). Toute écriture passe
 * par les RPC serveur (api.ts) — jamais d'écriture directe des tables
 * `account_deletion_*`. La demande destructive est confirmée par une modale
 * OBLIGATOIRE (guideline §6) qui prévient AVANT le clic que la session sera
 * coupée immédiatement (RGDP-01) — l'utilisateur n'est jamais surpris en
 * pleine session. Aucune garde admin : le compte est personnel.
 */
const DELETION_QUERY_KEY = ['account-deletion-requests'] as const;

/** Les deux états d'une demande vivante : elle est active, annulable. */
export const isDemandeActive = (status: StatutDemandeSuppression) =>
  status === 'demandee' || status === 'rappellee';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export function findActiveDeletionRequest(rows: AccountDeletionRequestRow[]): AccountDeletionRequestRow | null {
  return rows.find((row) => isDemandeActive(row.status)) ?? null;
}

export function GdprDeletePanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSessionUser();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [...DELETION_QUERY_KEY, user?.id ?? ''],
    queryFn: fetchAccountDeletionRequests,
    enabled: Boolean(user?.id),
  });

  const rows = query.data ?? [];
  const active = findActiveDeletionRequest(rows);

  const request = useMutation({
    mutationFn: requestAccountDeletion,
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: (result) => {
      // Le cache est mensonger (surface déshumanisée, sessions tuées) :
      // il est vidé AVANT la redirection. Le message est rendu AVANT le
      // départ — l'utilisateur n'est jamais éjecté sans explication.
      queryClient.clear();
      // WR-04 : le message suit le verdict réel de l'Edge. sessions_revoked
      // false = la déconnexion automatique a échoué : on le dit et on invite
      // à la déconnexion manuelle, jamais le succès mensonger. L'erreur
      // serveur brute (email_error) n'atteint JAMAIS le DOM (T-27-18) :
      // l'échec d'e-mail reste un message générique sans détail technique.
      setNotice(
        result.sessions_revoked
          ? result.email_sent
            ? 'Demande enregistrée. Vos sessions ont été coupées et un e-mail de confirmation vous a été envoyé.'
            : 'Demande enregistrée. Vos sessions ont été coupées, mais l’e-mail de confirmation n’a pas pu partir.'
          : result.email_sent
            ? 'Demande enregistrée, mais la déconnexion automatique a échoué : déconnectez-vous manuellement.'
            : 'Demande enregistrée, mais la déconnexion automatique a échoué : déconnectez-vous manuellement. L’e-mail de confirmation n’a pas pu partir.',
      );
      toast('Demande de suppression enregistrée.');
      window.setTimeout(() => navigate('/connexion', { replace: true }), 2500);
    },
    onError: (requestError) => {
      const message = requestError instanceof Error ? requestError.message : 'Demande de suppression impossible.';
      setError(message);
      toast(message);
    },
  });

  const cancel = useMutation({
    mutationFn: cancelAccountDeletion,
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELETION_QUERY_KEY });
      toast('Votre demande a été annulée. Tout est restauré.');
    },
    onError: (cancelError) => {
      const message = cancelError instanceof Error ? cancelError.message : 'Annulation impossible.';
      setError(message);
      toast(message);
    },
  });

  return (
    <Panel
      title="Mes données (RGPD) — supprimer mon compte"
      description="Votre droit à l’effacement : la demande purge définitivement votre compte sous 30 jours."
    >
      {error ? (
        <p role="alert" className="m-0 text-[11px] font-semibold text-coral-text">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" aria-live="polite" className="m-0 text-[12px] font-semibold text-accent-strong">
          {notice}
        </p>
      ) : null}

      {active ? (
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="m-0 text-[13px] font-semibold">
            {statutDemandeSuppressionLabels[active.status]}
            {' — '}
            <span>suppression programmée le {dateFormatter.format(new Date(active.purge_due_at))}</span>
          </p>
          <p className="m-0 text-[12px] text-muted">
            Vous pouvez encore changer d’avis : l’annulation restaure votre nom et votre photo, puis vous vous
            reconnectez normalement.
          </p>
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (!cancel.isPending) cancel.mutate();
              }}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? 'Annulation…' : 'Annuler ma demande'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[13px] text-muted">
            La demande masque immédiatement votre nom et votre photo, coupe toutes vos sessions et envoie un e-mail
            de confirmation. Vos données personnelles sont supprimées définitivement 30 jours plus tard — d’ici là,
            vous pouvez annuler.
          </p>
          <div className="mt-1 flex flex-wrap justify-end gap-2">
            <Button variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
              Demander la suppression de mon compte
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Demander la suppression de votre compte ?"
        description="Vos sessions seront coupées immédiatement (vous serez déconnecté(e) partout) et votre nom sera masqué. La suppression devient définitive dans 30 jours. Exportez d’abord ce que vous souhaitez conserver."
        confirmLabel={request.isPending ? 'Demande en cours…' : 'Oui, supprimer mon compte'}
        onConfirm={() => {
          if (!request.isPending) request.mutate();
        }}
      />
    </Panel>
  );
}
