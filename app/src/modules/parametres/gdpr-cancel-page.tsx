import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { cancelAccountDeletion } from './api';

/**
 * Page d'annulation du lien e-mail (phase 27, D-05/T-27-10) : l'e-mail de
 * confirmation renvoie ici avec `?annuler=<id de demande>`. La page ne crée
 * JAMAIS de session — le lien traverse l'e-mail comme une simple adresse de
 * l'application ; l'utilisateur se reconnecte normalement (RequireAuth le
 * conduit ici après connexion) et c'est DANS cette session réauthentifiée
 * que le RPC `cancel_account_deletion` (D-05 : restauration de
 * l'instantané) est appelé. L'identifiant dans l'URL n'est qu'un indice
 * d'affichage : le serveur n'agit que sur la demande du compte connecté
 * (42501 — jamais cru).
 */
export default function GdprCancelPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  // Présent ou non, l'id ne pilote rien : affichage seul.
  const requestId = searchParams.get('annuler')?.trim() ?? '';

  const onConfirm = async () => {
    setPending(true);
    setError(null);
    try {
      await cancelAccountDeletion();
      void queryClient.invalidateQueries({ queryKey: ['account-deletion-requests'] });
      setCancelled(true);
      toast('Votre demande a été annulée. Tout est restauré.');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Annulation impossible.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-5 text-center">
      <div className="max-w-[480px]">
        {cancelled ? (
          <>
            <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">Demande annulée</h1>
            <p className="lede mx-auto mb-6 text-[14px]">
              Votre compte est restauré : nom, photo et accès retrouvés. Bon retour !
            </p>
            <Button onClick={() => navigate('/parametres', { replace: true })}>
              Retour aux paramètres
            </Button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">Annuler la suppression de votre compte</h1>
            <p className="lede mx-auto mb-2 text-[14px]">
              Vous avez cliqué sur le lien d’annulation de l’e-mail de confirmation. Votre compte est encore là :
              confirmez ici pour tout restaurer.
            </p>
            {requestId ? (
              <p className="mx-auto mb-2 text-[12px] text-muted">Demande visée : {requestId}</p>
            ) : null}
            <p className="mx-auto mb-6 text-[12px] text-muted">
              Cette page ne connecte aucune session : c’est votre connexion habituelle qui vous identifie.
            </p>
            {error ? (
              <p role="alert" className="mb-2 text-[11px] font-semibold text-coral-text">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" asChild>
                <Link to="/accueil">Retour au tableau de bord</Link>
              </Button>
              <Button variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
                Annuler ma demande
              </Button>
            </div>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Annuler la suppression de votre compte ?"
              description="Votre nom, votre photo et vos accès seront restaurés immédiatement, comme avant la demande."
              confirmLabel={pending ? 'Annulation…' : 'Oui, tout restaurer'}
              onConfirm={() => {
                if (!pending) void onConfirm();
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
