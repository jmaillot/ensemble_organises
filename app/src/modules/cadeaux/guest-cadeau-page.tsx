import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/empty-state';
import { ModuleShell, Panel } from '@/components/shared/module-shell';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { useIsAuthenticated, useSessionUser } from '@/hooks/use-auth';
import { redeemGiftListInvite } from './api';

/**
 * Page PUBLIQUE d'invitation cadeau (OQ-1 OPTION A, D-16/D-17) : un lien
 * `/invitation/cadeau?code=…` mène ici. Contrairement à l'ardoise
 * (lecture anonyme), l'échange exige un compte : sans session, la page
 * invite à se connecter / créer un compte AVEC L'E-MAIL INVITÉ, puis
 * l'échange active le partage via la branche e-mail de
 * `redeem_gift_list_invite`. En session, l'échange est immédiat
 * (membre du foyer : e-mail inutile).
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
            : 'Un compte suffit : connectez-vous avec l’e-mail invité.'
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
          <div className="grid gap-3">
            <p className="m-0 text-[13px] text-muted">
              Cette liste se partage avec un compte : créez-en un (ou connectez-vous) avec l’e-mail qui a reçu
              l’invitation, puis rouvrez ce lien pour activer votre réservation.
            </p>
            <div>
              <Link
                to="/connexion"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[12px] bg-accent-strong px-[15px] text-[13px] font-[760] text-white"
              >
                Se connecter / créer un compte
              </Link>
            </div>
          </div>
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
