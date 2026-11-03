import { useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/shared/module-shell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { QrCode } from '@/components/shared/qr-code';
import { Icon } from '@/components/shared/icon';
import { useToast } from '@/components/ui/toast';
import { createInviteToken, forgetInviteToken, isRecallValid, listInviteTokens, recallInviteToken, rememberInviteToken, revokeInviteToken, revokeInviteTokenById } from '@/lib/invites';
import { addDays, formatMediumDate, pluralize, todayIso } from '@/lib/utils';
import { useHouseholdStore, useIsAdmin } from '@/stores/household-store';
import type { InviteTokenSummary } from '@/types';

const inviteKeys = { all: ['parametres', 'invitations'] as const };

// Pitfall 6 : la base clampe l'expiration à 90 jours — la contrainte est
// affichée et validée côté client plutôt que clampée en silence.
const MAX_EXPIRY_DAYS = 90;
const MAX_USES = 100;
// Valeur sentinelle de `confirmRevokeId` : la révocation GLOBALE existante
// (action `revoke`) partage la modale des révocations individuelles (D-16).
const REVOKE_ALL = 'all';

/** « Actif » seulement si réellement utilisable : révoqué, épuisé ou expiré se dit « Révoqué ». */
function statusOf(token: InviteTokenSummary): 'Actif' | 'Révoqué' {
  const expired = token.expiresAt ? new Date(token.expiresAt).getTime() <= Date.now() : false;
  return token.isActive && token.useCount < token.maxUses && !expired ? 'Actif' : 'Révoqué';
}

/** Tri par création décroissante : le lien le plus récent en tête. */
function byCreationDesc(a: InviteTokenSummary, b: InviteTokenSummary) {
  return b.createdAt.localeCompare(a.createdAt);
}

export function InvitationsPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const householdId = useHouseholdStore((state) => state.householdId);
  const householdName = useHouseholdStore((state) => state.householdName);
  const qrId = useId();
  const [expiresOn, setExpiresOn] = useState(() => addDays(todayIso(), 30));
  const [maxUses, setMaxUses] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresError, setExpiresError] = useState<string | null>(null);
  const [usesError, setUsesError] = useState<string | null>(null);
  const [recallBump, setRecallBump] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const tokensQuery = useQuery({
    queryKey: inviteKeys.all,
    queryFn: listInviteTokens,
  });

  const tokens: InviteTokenSummary[] = useMemo(
    () => [...(tokensQuery.data ?? [])].sort(byCreationDesc),
    [tokensQuery.data],
  );

  // Le brut n'existe côté serveur qu'à la génération : le rappel local permet
  // de le réafficher tant que le lien est encore actif dans la liste (match
  // par `tokenId`, modèle liste — Pitfall 5).
  const recalled = useMemo(() => recallInviteToken(), [tokens, recallBump]);
  const displayed =
    recalled && isRecallValid(recalled, tokens) && recalled.householdId === householdId ? recalled : null;

  const validateForm = (): boolean => {
    const today = todayIso();
    let valid = true;
    if (!expiresOn || expiresOn < today) {
      setExpiresError('Choisissez une date dans le futur.');
      valid = false;
    } else if (expiresOn > addDays(today, MAX_EXPIRY_DAYS)) {
      setExpiresError(`Le lien expire au plus tard dans ${MAX_EXPIRY_DAYS} jours.`);
      valid = false;
    } else {
      setExpiresError(null);
    }
    if (!Number.isInteger(maxUses) || maxUses < 1) {
      setUsesError('Indiquez au moins 1 utilisation.');
      valid = false;
    } else if (maxUses > MAX_USES) {
      setUsesError(`Indiquez au plus ${MAX_USES} utilisations.`);
      valid = false;
    } else {
      setUsesError(null);
    }
    return valid;
  };

  const generate = async () => {
    if (!validateForm()) return;
    setPending(true);
    setError(null);
    try {
      const preview = await createInviteToken({
        expiresAt: `${expiresOn}T23:59:00.000Z`,
        maxUses,
      });
      await queryClient.invalidateQueries({ queryKey: inviteKeys.all });
      // La liste fraîche porte le lien qui vient de naître : le rappel est
      // ancré sur son `tokenId` (le plus récent), pas sur l'instant local.
      const { data: fresh } = await tokensQuery.refetch();
      const newest = [...(fresh ?? [])].sort(byCreationDesc)[0];
      if (preview.token && newest) {
        rememberInviteToken({
          token: preview.token,
          householdId: preview.householdId || householdId || '',
          tokenId: newest.tokenId,
        });
      }
      setRecallBump((bump) => bump + 1);
      setShowQr(false);
      toast('Nouveau lien généré. Les liens précédents restent actifs jusqu’à leur expiration ou leur révocation.');
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Génération impossible.');
    } finally {
      setPending(false);
    }
  };

  const confirmRevoke = async () => {
    const target = confirmRevokeId;
    if (!target) return;
    try {
      if (target === REVOKE_ALL) {
        await revokeInviteToken();
        forgetInviteToken();
        toast('Tous les liens sont révoqués.');
      } else {
        await revokeInviteTokenById(target);
        // Le lien révoqué n'est plus rappelable : on nettoie le stockage local.
        if (recalled?.tokenId === target) forgetInviteToken();
        toast('Lien révoqué.');
      }
      setRecallBump((bump) => bump + 1);
      setShowQr(false);
      await queryClient.invalidateQueries({ queryKey: inviteKeys.all });
    } catch (revokeError) {
      toast(revokeError instanceof Error ? revokeError.message : 'Révocation impossible.', 'error');
    } finally {
      setConfirmRevokeId(null);
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
        <div className="grid gap-3 rounded-[20px] border border-dashed border-accent/40 bg-accent-faint p-4">
          <p className="m-0 text-xs text-muted">
            Seul un administrateur peut générer, régénérer ou révoquer un lien d’invitation. Demandez-le-lui depuis son
            téléphone ou son ordinateur : le lien n’est affiché qu’au moment de sa création.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Inviter un membre"
      description="Un lien d’accès au foyer, à transmettre en privé. La liste ci-dessous suit tous les liens actifs du foyer."
    >
      <div className="grid gap-4">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Expire le" hint={`Au plus ${MAX_EXPIRY_DAYS} jours.`} error={expiresError ?? undefined}>
            {(props) => (
              <Input
                type="date"
                min={todayIso()}
                value={expiresOn}
                onChange={(event) => {
                  setExpiresOn(event.target.value);
                  setExpiresError(null);
                }}
                {...props}
              />
            )}
          </Field>
          <Field
            label="Utilisations maximum"
            hint="Le foyer compte 5 membres : laissez de la marge pour les invités."
            error={usesError ?? undefined}
          >
            {(props) => (
              <Input
                type="number"
                min={1}
                max={MAX_USES}
                value={maxUses}
                onChange={(event) => {
                  const next = event.target.valueAsNumber;
                  setMaxUses(Number.isNaN(next) ? 0 : next);
                  setUsesError(null);
                }}
                {...props}
              />
            )}
          </Field>
        </div>
        {error ? (
          <p role="alert" className="m-0 text-[11px] font-semibold text-coral-text">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button icon="key" disabled={pending} onClick={() => void generate()}>
            {pending ? 'Génération…' : 'Générer un nouveau lien'}
          </Button>
          <Button
            variant="secondary"
            icon="trash"
            disabled={pending || tokens.length === 0}
            onClick={() => setConfirmRevokeId(REVOKE_ALL)}
          >
            Révoquer tous les liens
          </Button>
        </div>

        {displayed ? (
          <div className="grid gap-4 rounded-[20px] border border-border bg-bg p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="eyebrow mb-2">Lien d’invitation</p>
              <p className="mb-4 font-mono text-lg tracking-[0.12em] break-all">{displayed.token}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon="copy"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(displayed.token);
                    toast('Lien copié dans le presse-papiers.');
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
                <Button variant="secondary" icon="share" onClick={() => void share(displayed.token)}>
                  Partager
                </Button>
              </div>
              <p className="mt-4 mb-0 text-[11px] text-muted">
                La base n’en conserve que l’empreinte : ce lien est rappelé depuis cet appareil et ne sera plus
                affichable ailleurs.
              </p>
            </div>
            {showQr ? (
              <div id={qrId} className="rounded-[20px] border border-border bg-surface p-3">
                <QrCode value={displayed.token} size={168} label="QR code du lien d’invitation" />
              </div>
            ) : null}
          </div>
        ) : null}

        {tokensQuery.data && tokens.length === 0 ? (
          <EmptyState
            icon="key"
            title="Aucun lien d’invitation actif"
            description="Générez un lien pour inviter un nouveau membre."
            actionLabel="Générer un lien"
            onAction={() => void generate()}
          />
        ) : tokens.length > 0 ? (
          <div className="rounded-[20px] border border-border p-4">
            <p className="eyebrow mb-3">Liens actifs</p>
            <div className="grid gap-0">
              {tokens.map((token) => (
                <div
                  key={token.tokenId}
                  className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-[11px] text-[13px] first:border-t-0"
                >
                  <span className="text-muted">Créé le {formatMediumDate(token.createdAt.slice(0, 10))}</span>
                  <span className="text-muted">
                    Expire le {token.expiresAt ? formatMediumDate(token.expiresAt.slice(0, 10)) : '—'}
                  </span>
                  <span>{`${token.useCount} / ${token.maxUses} ${pluralize(token.useCount, 'utilisation').replace(/^\d+ /, '')}`}</span>
                  <strong>{statusOf(token)}</strong>
                  <Button variant="secondary" icon="trash" onClick={() => setConfirmRevokeId(token.tokenId)}>
                    Révoquer
                  </Button>
                </div>
              ))}
            </div>
            <p className="mt-3 mb-0 flex items-start gap-1.5 text-[11px] text-muted">
              <Icon name="info" size="sm" className="mt-px" />
              La rotation de la clé `INVITE_TOKEN_HMAC_SECRET` invalide tous les liens actifs et impose leur
              régénération.
            </p>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmRevokeId !== null}
        onOpenChange={(open) => setConfirmRevokeId(open ? confirmRevokeId : null)}
        title={confirmRevokeId === REVOKE_ALL ? 'Révoquer tous les liens ?' : 'Révoquer ce lien ?'}
        description={
          confirmRevokeId === REVOKE_ALL
            ? 'Chaque lien devient immédiatement inutilisable. Les membres qui les ont déjà utilisés restent dans le foyer.'
            : 'Plus personne ne pourra rejoindre le foyer avec ce lien, y compris ceux qui l’ont déjà.'
        }
        confirmLabel="Révoquer"
        onConfirm={() => void confirmRevoke()}
      />
    </Panel>
  );
}
