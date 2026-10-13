import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { QrCode } from '@/components/shared/qr-code';
import { useToast } from '@/components/ui/toast';
import {
  createTripInviteCode,
  fetchTripInviteSummary,
  readTripCode,
  revokeTripInviteCode,
  tripInviteLink,
  type TripInviteSummary,
} from '../api';

export interface TripShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string | null;
  tripName: string;
}

/**
 * Partage d'un voyage par code (phase 15, D-09) : calqué sur le panneau code
 * des cadeaux — lien `/invitation/voyage?code=`, Copier/Partager
 * (navigator.share avec repli presse-papiers), Générer/Régénérer (invalide
 * immédiatement), code brut affiché une fois en mono + QR, mention
 * code-actif-créé-ailleurs, « Arrêter le partage » avec revoke.
 *
 * Le code brut vit dans l'état du dialogue, adossé à la mémoire appareil
 * (`eo:trip:code:<tripId>`, posée à la génération, effacée à l'arrêt) :
 * rouvrir le partage réaffiche QR + lien sans régénérer.
 * Les invités externes rejoignent par le lien (compte du foyer ou pseudonyme
 * invité) ; l'échange passe par l'Edge `trip-invite`, jamais en direct.
 */
export function TripShareDialog({ open, onOpenChange, tripId, tripName }: TripShareDialogProps) {
  const toast = useToast();
  const [summary, setSummary] = useState<TripInviteSummary | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      // Fermeture : le code affiché repart, la mémoire appareil (`readTripCode`)
      // le rendra à la prochaine ouverture si le partage est toujours actif.
      setLastCode(null);
      return;
    }
    if (!tripId) return;
    let active = true;
    fetchTripInviteSummary(tripId)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setCodeError(false);
        // 0121 : un code actif généré sur cet appareil se réaffiche (QR +
        // lien) sans régénérer ; sinon, seule la régénération l'affiche.
        if (result?.hasCode) {
          setLastCode(readTripCode(tripId));
        } else {
          setLastCode(null);
        }
      })
      .catch(() => {
        if (active) setCodeError(true);
      });
    return () => {
      active = false;
    };
  }, [open, tripId]);

  const refreshSummary = () => {
    if (!tripId) return Promise.resolve();
    return fetchTripInviteSummary(tripId)
      .then((result) => {
        setSummary(result);
        setCodeError(false);
      })
      .catch(() => setCodeError(true));
  };

  if (!tripId) return null;

  const inviteUrl = (code: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}${tripInviteLink(code)}`;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Code copié.');
    } catch {
      toast(code);
    }
  };

  const shareCode = async (code: string) => {
    const link = inviteUrl(code);
    try {
      if (navigator.share) {
        await navigator.share({ title: tripName, text: `Rejoins notre voyage « ${tripName} » : ${link}` });
        return;
      }
    } catch {
      // Partage annulé : repli copie du lien ci-dessous.
    }
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié.');
    } catch {
      toast(link);
    }
  };

  const generate = () => {
    setBusy(true);
    createTripInviteCode(tripId)
      .then((created) => {
        setLastCode(created.code);
        return refreshSummary();
      })
      .then(() => toast('Nouveau code généré : l’ancien est invalidé.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Code impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  const revoke = () => {
    setBusy(true);
    revokeTripInviteCode(tripId)
      .then(() => {
        setLastCode(null);
        return refreshSummary();
      })
      .then(() => toast('Partage arrêté : le code ne passe plus.'))
      .catch((inviteError: unknown) =>
        toast(inviteError instanceof Error ? inviteError.message : 'Arrêt impossible.', 'error'),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <p className="eyebrow mb-2">Voyage</p>
          <DialogTitle>Partager le voyage</DialogTitle>
          <DialogDescription>
            {`Un proche hors foyer rejoint « ${tripName} » avec ce code : avec son compte il participe, sans compte il visite en invité.`}
          </DialogDescription>
        </DialogHeader>
        {codeError ? (
          <p className="m-0 text-[12px] text-muted" role="status">
            Le partage par code exige le backend (Edge Function) : indisponible dans ce mode.
          </p>
        ) : (
          <div className="grid gap-3">
            <p className="m-0 text-[12px] text-muted" role="status">
              {summary?.hasCode
                ? `Partage ${summary.isActive ? 'actif' : 'coupé'} · ${summary.useCount}${summary.maxUses ? `/${summary.maxUses}` : ''} utilisations${summary.expiresAt ? ` · expire le ${summary.expiresAt.slice(0, 10)}` : ''}.`
                : 'Aucun code actif. Générez-en un pour inviter.'}
            </p>
            {lastCode ? (
              <>
                <p className="m-0 rounded-[11px] bg-bg px-3 py-2.5 font-mono text-[13px] break-all" role="status">
                  {lastCode}
                </p>
                <p className="m-0 text-[12px] break-all text-muted">Lien à partager : {inviteUrl(lastCode)}</p>
                <QrCode value={inviteUrl(lastCode)} label={`QR du partage de ${tripName}`} />
              </>
            ) : summary?.hasCode ? (
              <p className="m-0 text-[12px] text-muted">Code actif créé ailleurs : régénérez pour l’afficher sur cet appareil.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon="plus" disabled={busy} onClick={generate}>
                {summary?.hasCode ? 'Régénérer' : 'Générer un code'}
              </Button>
              {lastCode ? (
                <>
                  <Button variant="secondary" disabled={busy} onClick={() => void copyCode(lastCode)}>
                    Copier
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void shareCode(lastCode)}>
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
              Le lien mène vers la page invitée : sans compte, un pseudonyme suffit pour visiter.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
