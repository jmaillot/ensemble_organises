import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/primitives';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { useToast } from '@/components/ui/toast';
import { formatEuro } from '@/lib/utils';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { useIsAuthenticated, useSessionUser } from '@/hooks/use-auth';
import {
  fetchGuestGiftView,
  markGuestReservedItem,
  readGuestName,
  readGuestReservedIds,
  redeemGiftListInvite,
  reserveGuestGiftItem,
  writeGuestName,
} from './api';

/**
 * Page PUBLIQUE d'invitation cadeau : un lien `/invitation/cadeau?code=…`
 * mène ici.
 *
 * Deux parcours coexistent (phase 06, D-05) :
 * - AVEC compte (branche historique, OQ-1 OPTION A) : l'échange active le
 *   partage via la branche e-mail de `redeem_gift_list_invite`, puis la
 *   réservation se fait dans le module.
 * - SANS compte (branche invitée, override D-05) : le visiteur déclare un
 *   nom (1 à 80 caractères) et réserve via les actions publishable
 *   `guest-view` / `guest-reserve`. Le code EST le contrôle d'accès ; la
 *   charge utile ne porte qu'un booléen `reserved` par article (D-07).
 */
export default function GuestCadeauPage() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(() => params.get('code') ?? '');
  const [activeCode, setActiveCode] = useState<string | null>(() => {
    const initial = (params.get('code') ?? '').trim();
    return initial.length >= 22 ? initial : null;
  });
  const [formError, setFormError] = useState<string | null>(null);
  const isAuthenticated = useIsAuthenticated();
  const user = useSessionUser();

  const redeemQuery = useQuery({
    queryKey: ['cadeaux', 'invite-redeem', activeCode ?? ''],
    enabled: activeCode !== null && isAuthenticated && isSupabaseConfigured,
    retry: false,
    queryFn: () => redeemGiftListInvite(activeCode as string, user?.email ?? undefined),
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

  const result = redeemQuery.data ?? null;

  return (
    <ModuleShell module="cadeaux">
      <Panel
        id="guest-cadeau-panel"
        title="Invitation à une liste de cadeaux"
        description={
          isAuthenticated
            ? 'Votre compte active le partage : vous pourrez réserver (D-17).'
            : 'Réservez sans compte : indiquez un nom, choisissez un article.'
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
          <GuestAnonymousView code={activeCode} onResetCode={() => setActiveCode(null)} />
        ) : redeemQuery.isLoading ? (
          <LoadingRows rows={2} />
        ) : redeemQuery.isError || !result ? (
          <ErrorState
            message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
            onRetry={() => setActiveCode(null)}
          />
        ) : (
          <div className="grid gap-3">
            <p className="m-0 text-[13px]">
              {result.already_shared
                ? 'Vous participez déjà à cette liste : vos réservations sont conservées.'
                : 'Partage activé : vous pouvez désormais réserver des articles de cette liste.'}
            </p>
            <div>
              <Link
                to="/cadeaux"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
              >
                Ouvrir les cadeaux
              </Link>
            </div>
          </div>
        )}
        {!isSupabaseConfigured ? (
          <EmptyState
            icon="gift"
            title="Mode hors ligne"
            description="L’échange du code exige le serveur : reconnectez-vous pour continuer."
          />
        ) : null}
      </Panel>
    </ModuleShell>
  );
}

/**
 * Parcours invité sans compte (D-05/D-06/D-07/D-09) : nom déclaré + réserve.
 * La vérité reste côté serveur (relecture après chaque réserve) ; le nom
 * mémorisé et le surlignage local sont purement cosmétiques.
 */
function GuestAnonymousView({ code, onResetCode }: { code: string; onResetCode: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(() => readGuestName(code) ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [mineIds, setMineIds] = useState<string[]>(() => readGuestReservedIds(code));

  const viewQuery = useQuery({
    queryKey: ['cadeaux', 'guest-view', code],
    enabled: isSupabaseConfigured,
    retry: false,
    queryFn: () => fetchGuestGiftView(code),
  });

  const reserve = (itemId: string, itemName: string) => {
    setNameError(null);
    setNotice(null);
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      setNameError('Indiquez un nom (1 à 80 caractères).');
      return;
    }
    setPendingItemId(itemId);
    reserveGuestGiftItem(code, itemId, trimmed)
      .then((outcome) => {
        writeGuestName(code, trimmed);
        markGuestReservedItem(code, outcome.itemId);
        setMineIds(readGuestReservedIds(code));
        setNotice(
          outcome.alreadyReserved
            ? `« ${itemName} » est déjà réservé à ce nom : rien à changer.`
            : `« ${itemName} » réservé au nom de ${trimmed} : merci !`,
        );
        toast('Réservation enregistrée.');
        // La vérité reste côté serveur : on relit sans faire échouer le succès.
        void viewQuery.refetch().catch(() => {});
      })
      .catch((reserveError: unknown) => {
        const message = reserveError instanceof Error ? reserveError.message : 'Réservation impossible.';
        if (/déjà réservé/.test(message)) {
          // Conflit (409) : un AUTRE nom tient déjà l'article — distinct de l'oracle.
          setNotice('Quelqu’un vient de réserver cet article : choisissez-en un autre.');
          void viewQuery.refetch().catch(() => {});
        } else if (/nom.*80|Indiquez un nom/.test(message)) {
          setNameError('Indiquez un nom (1 à 80 caractères).');
        } else if (/invalide|ne passe plus|Partage impossible/.test(message)) {
          // Oracle (404) : le lien ne passe plus — on propose de recommencer.
          setNotice('Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur.');
        } else {
          setNotice(message);
        }
      })
      .finally(() => setPendingItemId(null));
  };

  if (viewQuery.isLoading) return <LoadingRows rows={3} />;
  if (viewQuery.isError || !viewQuery.data) {
    return (
      <ErrorState
        message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
        onRetry={onResetCode}
      />
    );
  }

  const view = viewQuery.data;

  return (
    <div className="grid gap-3.5">
      <p className="m-0 text-[13px]">
        {view.listName ? (
          <>
            Liste « <strong>{view.listName}</strong> » : indiquez votre nom, puis réservez un article libre.
          </>
        ) : (
          'Indiquez votre nom, puis réservez un article libre.'
        )}
      </p>
      <Field label="Votre nom" error={nameError ?? undefined} hint="1 à 80 caractères, affiché à personne">
        {(props) => (
          <Input
            {...props}
            value={name}
            onChange={(change) => setName(change.target.value)}
            autoComplete="nickname"
            placeholder="Ex. Mamie"
            maxLength={80}
          />
        )}
      </Field>
      {notice ? (
        <p className="m-0 rounded-[11px] bg-accent-faint px-3 py-2.5 text-[12px]" role="status">
          {notice}
        </p>
      ) : null}
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {view.items.map((item) => {
          const looksMine = mineIds.includes(item.id);
          return (
            <li
              key={item.id}
              className="panel-surface flex items-center justify-between gap-3 rounded-[14px] p-3.5"
            >
              <div className="grid gap-0.5">
                <strong className="text-[14px]">{item.name}</strong>
                {item.comment ? <span className="text-[11px] text-muted">{item.comment}</span> : null}
                <span className="text-[12px] font-semibold">{item.price ? formatEuro(item.price) : '—'}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.reserved ? <Badge tone="amber">{looksMine ? 'Réservé par vous' : 'Réservé'}</Badge> : null}
                {!item.reserved ? (
                  <Button size="sm" disabled={pendingItemId !== null} onClick={() => reserve(item.id, item.name)}>
                    {pendingItemId === item.id ? 'Réservation…' : 'Réserver'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {view.items.length === 0 ? (
        <p className="m-0 text-[12px] text-muted" role="status">
          Cette liste ne contient aucun article pour le moment.
        </p>
      ) : null}
      <p className="m-0 text-[11px] text-muted">
        Un compte ?{' '}
        <Link to="/connexion" className="font-semibold text-accent-strong">
          Connectez-vous avec l’e-mail invité
        </Link>{' '}
        pour activer le partage durable.
      </p>
    </div>
  );
}
