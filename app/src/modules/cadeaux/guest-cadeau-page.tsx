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
 *   charge utile porte le contenu (url, photoUrl) et un booléen `reserved`
 *   par article (D-07, G-06-1a).
 *
 * Un visiteur CONNECTÉ choisit explicitement (G-06-1b) : « Rejoindre via mon
 * compte » déclenche le redeem historique (inchangé), « Continuer sans lier
 * mon compte » rend la même vue invitée en mode détaché (`withoutSession` :
 * aucun porteur joint, T-06-11) avec une copie d'attribution anonyme.
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
  // Choix explicite du visiteur connecté (G-06-1b) : le redeem ne part
  // qu'après « Rejoindre via mon compte ». `null` = choix pas encore fait.
  const [choice, setChoice] = useState<'join' | 'anonymous' | null>(null);

  const redeemQuery = useQuery({
    queryKey: ['cadeaux', 'invite-redeem', activeCode ?? ''],
    enabled: activeCode !== null && isAuthenticated && choice === 'join' && isSupabaseConfigured,
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
    setChoice(null);
    setActiveCode(trimmed);
  };

  /** Retour au formulaire de code (le choix est oublié avec le code). */
  const resetCode = () => {
    setChoice(null);
    setActiveCode(null);
  };

  const result = redeemQuery.data ?? null;

  return (
    <ModuleShell module="cadeaux">
      <Panel
        id="guest-cadeau-panel"
        title="Invitation à une liste de cadeaux"
        description={
          !isAuthenticated || choice === 'anonymous'
            ? 'Réservez sans compte : indiquez un nom, choisissez un article.'
            : 'Votre compte active le partage : vous pourrez réserver (D-17).'
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
        ) : choice === 'anonymous' ? (
          <div className="grid gap-3.5">
            <p className="m-0 text-[13px]">
              Vous continuez <strong>sans lier votre compte</strong> : votre réservation sera{' '}
              <strong>anonyme</strong> (nom déclaré seul, comme pour les visiteurs sans compte) —
              rien ne sera rattaché à votre compte.
            </p>
            <GuestAnonymousView code={activeCode} detached onResetCode={resetCode} />
            <div>
              <Button variant="quiet" size="sm" onClick={() => setChoice(null)}>
                Revenir au choix
              </Button>
            </div>
          </div>
        ) : choice === 'join' ? (
          redeemQuery.isLoading ? (
            <LoadingRows rows={2} />
          ) : redeemQuery.isError || !result ? (
            <ErrorState
              message="Ce lien ne passe plus (code révoqué ou expiré). Demandez un nouveau lien à l’organisateur."
              onRetry={resetCode}
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
          )
        ) : (
          <div className="grid gap-3.5">
            <p className="m-0 text-[13px]">Ce lien vous propose deux façons de participer :</p>
            <div className="grid gap-1.5">
              <div>
                <Button icon="arrow" onClick={() => setChoice('join')}>
                  Rejoindre via mon compte
                </Button>
              </div>
              <p className="m-0 text-[12px] text-muted">
                Active le partage sur votre compte : vos réservations seront liées à votre membre,
                la liste apparaîtra dans vos cadeaux.
              </p>
            </div>
            <div className="grid gap-1.5">
              <div>
                <Button variant="secondary" onClick={() => setChoice('anonymous')}>
                  Continuer sans lier mon compte
                </Button>
              </div>
              <p className="m-0 text-[12px] text-muted">
                Votre réservation sera anonyme (nom déclaré seul, comme les visiteurs sans compte) :
                rien ne sera rattaché à votre compte ni à un foyer.
              </p>
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
 * Garde de rendu des valeurs servies (T-06-10) : seules les URL http(s)
 * — liens organizers et photoUrl forgées par l'Edge (passage hérité ou
 * signée https) — atteignent le DOM. Toute autre forme (donnée corrompue,
 * schéma non-http) ne rend rien : échec fermé côté client aussi.
 */
function isServableHttpUrl(value: string | null): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * Parcours invité sans compte (D-05/D-06/D-07/D-09) : nom déclaré + réserve.
 * La vérité reste côté serveur (relecture après chaque réserve) ; le nom
 * mémorisé et le surlignage local sont purement cosmétiques.
 *
 * `detached` (G-06-1b) : un visiteur CONNECTÉ qui continue sans lier son
 * compte voit exactement la même vue, mais aucun porteur n'est joint aux
 * appels publishable (`withoutSession`, T-06-11) — la réserve reste anonyme.
 */
function GuestAnonymousView({
  code,
  detached = false,
  onResetCode,
}: {
  code: string;
  detached?: boolean;
  onResetCode: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(() => readGuestName(code) ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [mineIds, setMineIds] = useState<string[]>(() => readGuestReservedIds(code));
  // Détail inline par article (G-06-1a-bis) : bascules indépendantes — chaque
  // ligne s'ouvre sans refermer les autres. Aucune donnée nouvelle : le
  // détail ne relit que les clés déjà servies (url, photoUrl, comment).
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const toggleExpanded = (itemId: string) =>
    setExpandedIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId],
    );

  const viewQuery = useQuery({
    queryKey: ['cadeaux', 'guest-view', code],
    enabled: isSupabaseConfigured,
    retry: false,
    queryFn: () => fetchGuestGiftView(code, detached ? { withoutSession: true } : undefined),
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
    reserveGuestGiftItem(code, itemId, trimmed, detached ? { withoutSession: true } : undefined)
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
          const expanded = expandedIds.includes(item.id);
          return (
            <li key={item.id} className="panel-surface grid gap-2 rounded-[14px] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`guest-item-detail-${item.id}`}
                  onClick={() => toggleExpanded(item.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <strong className="text-[14px]">{item.name}</strong>
                    <span className="text-[12px] font-semibold">
                      {item.price ? formatEuro(item.price) : '—'}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[13px] text-muted">
                    {expanded ? '▾' : '▸'}
                  </span>
                  <span className="sr-only">{expanded ? 'Masquer le détail' : 'Afficher le détail'}</span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {item.reserved ? (
                    <Badge tone="amber">{looksMine ? 'Réservé par vous' : 'Réservé'}</Badge>
                  ) : null}
                  {!item.reserved ? (
                    <Button
                      size="sm"
                      disabled={pendingItemId !== null}
                      onClick={() => reserve(item.id, item.name)}
                    >
                      {pendingItemId === item.id ? 'Réservation…' : 'Réserver'}
                    </Button>
                  ) : null}
                </div>
              </div>
              {expanded ? (
                <div id={`guest-item-detail-${item.id}`} className="grid gap-1.5 pt-1">
                  {isServableHttpUrl(item.photoUrl) ? (
                    <img
                      src={item.photoUrl}
                      alt=""
                      loading="lazy"
                      className="h-44 w-full rounded-[10px] object-cover"
                    />
                  ) : null}
                  {item.comment ? <p className="m-0 text-[12px]">{item.comment}</p> : null}
                  <span className="text-[12px] font-semibold">
                    {item.price ? formatEuro(item.price) : '—'}
                  </span>
                  {isServableHttpUrl(item.url) ? (
                    <span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener"
                        aria-label={`Voir : ${item.name} (nouvel onglet)`}
                        className="text-[12px] font-semibold text-accent-strong underline underline-offset-2"
                      >
                        Voir
                      </a>
                    </span>
                  ) : null}
                </div>
              ) : null}
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
        {detached ? (
          <>Votre réservation restera anonyme : seul le nom déclaré sera transmis.</>
        ) : (
          <>
            Un compte ?{' '}
            <Link to="/connexion" className="font-semibold text-accent-strong">
              Connectez-vous avec l’e-mail invité
            </Link>{' '}
            pour activer le partage durable.
          </>
        )}
      </p>
    </div>
  );
}
