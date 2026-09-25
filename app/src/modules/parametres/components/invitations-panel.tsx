import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/shared/module-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QrCode } from '@/components/shared/qr-code';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { createInviteToken, getInviteTokenSummary, revokeInviteToken } from '@/lib/invites';
import { addDays, formatMediumDate, pluralize, todayIso } from '@/lib/utils';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import type { InviteTokenPreview, InviteTokenSummary } from '@/types';

const inviteKeys = { all: ['parametres', 'invitations'] as const };

export function InvitationsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const householdName = useHouseholdStore((state) => state.householdName);
  const qrId = useId();
  const [expiresOn, setExpiresOn] = useState(() => addDays(todayIso(), 30));
  const [maxUses, setMaxUses] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<InviteTokenPreview | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const summaryQuery = useQuery({
    queryKey: inviteKeys.all,
    queryFn: getInviteTokenSummary,
  });

  const summary: InviteTokenSummary | null = summaryQuery.data ?? null;

  const generate = async () => {
    setPending(true);
    setError(null);
    try {
      const preview = await createInviteToken({
        expiresAt: expiresOn ? `${expiresOn}T23:59:00.000Z` : null,
        maxUses,
      });
      setGenerated(preview);
      setShowQr(false);
      await queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      toast('Nouveau token généré. Le précédent est invalidé.');
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Génération impossible.');
    } finally {
      setPending(false);
    }
  };

  const share = async (token: string) => {
    const url = `${window.location.origin}/foyer/rejoindre?token=${encodeURIComponent(token)}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Rejoindre mon foyer', text: `Rejoins ${householdName} sur Ensemble & Organisés`, url });
        return;
      } catch {
        // Partage annulé ou non pris en charge : on retombe sur le presse-papiers.
      }
    }
    await navigator.clipboard?.writeText(url);
    toast('Lien de partage copié.');
  };

  if (!isAdmin) {
    return (
      <Panel title="Inviter un membre" description="Les invitations sont gérées par les administrateurs du foyer.">
        <div className="grid gap-3 rounded-[16px] border border-dashed border-accent/40 bg-accent-faint p-4">
          <p className="m-0 text-xs text-muted">
            Seul un administrateur peut générer, régénérer ou révoquer un token d’invitation. Demandez-le-lui depuis son
            téléphone ou son ordinateur : le token n’est affiché qu’au moment de sa création.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Inviter un membre"
      description="Un token d’accès au foyer, à transmettre en privé. Générer un nouveau token invalide le précédent."
    >
      <div className="grid gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Expiration du token" hint="Laissez vide pour un token sans date de fin." optional>
            {(props) => (
              <Input type="date" min={todayIso()} value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} {...props} />
            )}
          </Field>
          <Field label="Nombre maximal d’utilisations" hint="Le foyer compte 5 membres : laissez de la marge pour les invités.">
            {(props) => (
              <Input
                type="number"
                min={1}
                max={50}
                value={maxUses}
                onChange={(event) => setMaxUses(Math.max(1, Number(event.target.value) || 1))}
                {...props}
              />
            )}
          </Field>
        </div>
        {error ? (
          <p role="alert" className="m-0 text-[11px] font-semibold text-coral">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button icon="key" disabled={pending} onClick={() => void generate()}>
            {pending ? 'Génération…' : 'Générer un nouveau token'}
          </Button>
          <Button variant="secondary" icon="trash" disabled={pending || !summary?.isActive} onClick={() => setConfirmRevoke(true)}>
            Révoquer le token
          </Button>
        </div>

        {generated ? (
          <div className="grid gap-4 rounded-[16px] border border-border bg-bg p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="eyebrow mb-2">Token d’invitation</p>
              <p className="mb-4 font-mono text-lg tracking-[0.12em] break-all">{generated.token}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon="copy"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(generated.token);
                    toast('Token copié dans le presse-papiers.');
                  }}
                >
                  Copier
                </Button>
                <Button
                  variant="secondary"
                  icon="scan"
                  aria-expanded={showQr}
                  aria-controls={qrId}
                  onClick={() => setShowQr((visible) => !visible)}
                >
                  {showQr ? 'Masquer le QR' : 'QR'}
                </Button>
                <Button variant="secondary" icon="share" onClick={() => void share(generated.token)}>
                  Partager
                </Button>
              </div>
              <p className="mt-4 mb-0 text-[11px] text-muted">
                Maximum {pluralize(generated.maxUses, 'utilisation')}
                {generated.expiresAt ? ` · valide jusqu’au ${formatMediumDate(generated.expiresAt.slice(0, 10))}` : ' · sans date d’expiration'}. La
                base n’en conserve que l’empreinte : ce token ne sera plus affiché ensuite.
              </p>
            </div>
            {showQr ? (
              <div id={qrId} className="rounded-[16px] border border-border bg-surface p-3">
                <QrCode value={generated.token} size={168} label="QR code du token d’invitation" />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-[16px] border border-border p-4">
          <p className="eyebrow mb-3">Token en cours</p>
          <div className="grid gap-0">
            <div className="flex items-center justify-between gap-2.5 py-[11px] text-xs">
              <span className="text-muted">État</span>
              <strong>{summary ? (summary.isActive ? 'Actif' : 'Inactif') : 'Aucun token'}</strong>
            </div>
            <div className="flex items-center justify-between gap-2.5 border-t border-border py-[11px] text-xs">
              <span className="text-muted">Utilisations</span>
              <strong>{summary ? `${summary.useCount} / ${summary.maxUses}` : '—'}</strong>
            </div>
            <div className="flex items-center justify-between gap-2.5 border-t border-border py-[11px] text-xs">
              <span className="text-muted">Expiration</span>
              <strong>{summary?.expiresAt ? formatMediumDate(summary.expiresAt.slice(0, 10)) : 'Aucune'}</strong>
            </div>
          </div>
          <p className="mt-3 mb-0 flex items-start gap-1.5 text-[11px] text-muted">
            <Icon name="info" size="sm" className="mt-px" />
            La rotation de la clé `INVITE_TOKEN_HMAC_SECRET` invalide tous les tokens actifs et impose leur régénération.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Révoquer le token d’invitation ?"
        description="Le token devient immédiatement inutilisable. Les membres qui l’ont déjà utilisé restent dans le foyer."
        confirmLabel="Révoquer"
        onConfirm={async () => {
          try {
            await revokeInviteToken();
            setGenerated(null);
            setShowQr(false);
            await queryClient.invalidateQueries({ queryKey: inviteKeys.all });
            toast('Token révoqué.');
          } catch (revokeError) {
            toast(revokeError instanceof Error ? revokeError.message : 'Révocation impossible.', 'error');
          } finally {
            setConfirmRevoke(false);
          }
        }}
      />
    </Panel>
  );
}
