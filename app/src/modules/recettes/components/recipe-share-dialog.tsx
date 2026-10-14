import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QrCode } from '@/components/shared/qr-code';
import { useToast } from '@/components/ui/toast';
import {
  createRecipeInviteCode,
  fetchRecipeInviteSummary,
  recipeInviteLink,
  revokeRecipeInviteCode,
  type RecipeInviteSummary,
} from '../api';

export interface RecipeShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: { id: string; title: string } | null;
}

/**
 * Partage d'une recette par lien invité (D-13, R11), calqué sur le panneau
 * code de `gift-share-dialog` réduit au lien seul : pas de part membre, pas
 * d'e-mail — l'Edge `recipe-invite` ne connaît que `link-view` (lecture
 * seule, SPEC hors-scope verrouillé, T-16-12).
 *
 * Le code brut vit dans l'état du dialogue : fermer le masque, régénérer
 * invalide le précédent, révoquer coupe tous les liens actifs aussitôt
 * (T-16-11 : jamais réaffiché depuis le serveur, jamais journalisé).
 */
export function RecipeShareDialog({ open, onOpenChange, recipe }: RecipeShareDialogProps) {
  const toast = useToast();
  const [summary, setSummary] = useState<RecipeInviteSummary | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recipeId = recipe?.id;

  useEffect(() => {
    if (!open) {
      // Fermeture : le code brut ne survit pas au dialogue.
      setLastCode(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !recipeId) return;
    let active = true;
    fetchRecipeInviteSummary(recipeId)
      .then((result) => {
        if (active) {
          setSummary(result);
          setCodeError(false);
        }
      })
      .catch(() => {
        if (active) setCodeError(true);
      });
    return () => {
      active = false;
    };
  }, [open, recipeId]);

  const refreshSummary = () => {
    if (!recipeId) return Promise.resolve();
    return fetchRecipeInviteSummary(recipeId)
      .then((result) => {
        setSummary(result);
        setCodeError(false);
      })
      .catch(() => setCodeError(true));
  };

  const inviteUrl = (code: string) => `${window.location.origin}${recipeInviteLink(code)}`;

  const copyLink = async (code: string) => {
    const link = inviteUrl(code);
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié.');
    } catch {
      toast(link);
    }
  };

  const shareLink = async (code: string) => {
    const link = inviteUrl(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: recipe?.title ?? 'Recette', text: `Ma recette « ${recipe?.title ?? ''} » : ${link}` });
        return;
      }
    } catch {
      // Partage annulé : repli copie du lien ci-dessous.
    }
    await copyLink(code);
  };

  const generate = () => {
    if (!recipeId) return;
    setBusy(true);
    createRecipeInviteCode(recipeId)
      .then((created) => {
        setLastCode(created.code);
        return refreshSummary();
      })
      .then(() => toast('Nouveau lien généré : l’ancien est invalidé.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Lien impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  const revoke = () => {
    if (!recipeId) return;
    setBusy(true);
    revokeRecipeInviteCode(recipeId)
      .then(() => {
        setLastCode(null);
        return refreshSummary();
      })
      .then(() => toast('Partage arrêté : le lien ne passe plus.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Arrêt impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Recettes</p>
          <DialogTitle>Partager la recette</DialogTitle>
          <DialogDescription>
            {recipe
              ? `Un lien suffit pour faire découvrir « ${recipe.title} » sans compte, en lecture seule. Le lien se révoque à tout moment.`
              : 'Un lien suffit pour faire découvrir la recette sans compte, en lecture seule.'}
          </DialogDescription>
        </DialogHeader>
        {codeError ? (
          <p className="m-0 text-[12px] text-muted" role="status">
            Le partage par lien exige le backend (Edge Function) : indisponible dans ce mode.
          </p>
        ) : (
          <div className="grid gap-3">
            <p className="m-0 text-[12px] text-muted" role="status">
              {summary?.hasCode
                ? `Partage ${summary.isActive ? 'actif' : 'coupé'} · ${summary.useCount}${summary.maxUses ? `/${summary.maxUses}` : ''} utilisations${summary.expiresAt ? ` · expire le ${summary.expiresAt.slice(0, 10)}` : ''}.`
                : 'Aucun lien actif. Générez-en un pour inviter.'}
            </p>
            {lastCode ? (
              <>
                <p className="m-0 rounded-[11px] bg-bg px-3 py-2.5 font-mono text-[13px] break-all" role="status">
                  {lastCode}
                </p>
                <p className="m-0 text-[12px] break-all text-muted">Lien à partager : {inviteUrl(lastCode)}</p>
                <QrCode value={inviteUrl(lastCode)} label={`QR du partage de ${recipe?.title ?? 'la recette'}`} />
              </>
            ) : summary?.hasCode ? (
              <p className="m-0 text-[12px] text-muted">Lien actif créé ailleurs : régénérez pour l’afficher sur cet appareil.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="plus" disabled={busy || !recipeId} onClick={generate}>
                {summary?.hasCode ? 'Régénérer' : 'Générer un lien'}
              </Button>
              {lastCode ? (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => void copyLink(lastCode)}>
                    Copier
                  </Button>
                  <Button variant="secondary" icon="share" disabled={busy} onClick={() => void shareLink(lastCode)}>
                    Partager
                  </Button>
                </>
              ) : null}
              {summary?.hasCode ? (
                <Button variant="secondary" disabled={busy} onClick={revoke}>
                  Arrêter le partage
                </Button>
              ) : null}
            </div>
            <p className="m-0 text-[11px] text-muted">
              Le lien mène vers la fiche en lecture seule : curseur et cases suivent, sans aucun bouton d’édition.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
