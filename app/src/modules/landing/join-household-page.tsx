import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  clearPendingInviteToken,
  getPendingInviteToken,
  previewHouseholdInvite,
  redeemInviteToken,
  setPendingInviteToken,
  translateRedeemError,
} from '@/lib/invites';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { joinHouseholdLocal, loadHousehold } from '@/stores/session-store';
import { useIsAuthenticated } from '@/hooks/use-auth';

/**
 * Pré-écran d'invitation (31-03, D-18/D-19/D-20).
 *
 * La page n'est plus un formulaire : c'est l'écran UNIQUE que voit quiconque
 * arrive par un lien d'invitation, connecté ou non. Au montage, le token de
 * l'URL est consulté via l'Edge preview (31-02) — sans Bearer, sans écriture,
 * réponse minimale — et le titre nomme l'inviteur et le foyer (D-20). Un seul
 * gabarit porte deux actions (D-19) : l'étranger poursuit vers l'inscription
 * (token copié en sessionStorage au départ, D-06), la personne déjà connectée
 * confirme explicitement avec « Rejoindre le foyer » (D-08 — jamais de redeem
 * au simple chargement : un aperçu de lien ne consomme pas un token à usage
 * compté).
 *
 * D-03 : tout échec de consultation (token mort, réseau) affiche LE MÊME
 * message public — l'UI ne nuance jamais inconnu/expiré/épuisé/erreur.
 */

// Même règle que la validation serveur (Edge preview et redeem, 31-01/31-02) :
// trim, 22 caractères minimum — le token brut ne quitte jamais ce schéma.
const tokenSchema = z.string().trim().min(22, 'Un lien d’invitation fait au moins 22 caractères.');

const MESSAGE_LIEN_MORT = 'Ce lien d’invitation n’est plus valable. Demandez un nouveau lien à l’administrateur de votre foyer.';

// D-09 : après un échec de redeem, le message dédié reste lisible quelques
// secondes, puis l'utilisateur atterrit sur son état normal (le choix
// créer/rejoindre s'il est sans foyer, son tableau de bord sinon — les gardes
// de route décident). Jamais un écran bloquant, jamais un « retour » muet.
const DELAI_ATERRISSAGE_MS = 3000;

type PreviewState =
  | { phase: 'loading' }
  | { phase: 'ready'; householdName: string | null; inviterFirstName: string | null }
  | { phase: 'dead' };

export default function JoinHouseholdPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const isAuthenticated = useIsAuthenticated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ phase: 'loading' });

  // Résolution du lien, UNE fois par montage : l'URL d'abord (le lien partagé),
  // puis le token en attente (D-07 — le mail de confirmation ramène de façon
  // générique sur SITE_URL, la sessionStorage est la seule mémoire du
  // parcours). Sans aucun des deux, il n'y a rien à consulter : la page
  // affichera le message uniforme, qui ne révèle rien.
  useEffect(() => {
    const parsed = tokenSchema.safeParse(searchParams.get('token') ?? '');
    if (parsed.success) {
      setToken(parsed.data);
      return;
    }
    // Dépendance volontairement vide : le token est résolu une seule fois par
    // montage de l'écran — `searchParams` ne change pas sans remplacement de
    // la page entière, rejouer la résolution ne servirait à rien.
    setToken(getPendingInviteToken());
  }, []);

  // Consultation preview (D-01) : uniquement avec un backend configuré (même
  // sonde que le reste de l'application, D-10). En démonstration, aucune Edge
  // n'existe — le pré-écran s'affiche sans nom de foyer et le redeem LOCAL
  // reste possible : le mode démo ne régresse pas.
  useEffect(() => {
    if (token === null) {
      setPreview({ phase: 'dead' });
      return;
    }
    if (!isSupabaseConfigured) {
      setPreview({ phase: 'ready', householdName: null, inviterFirstName: null });
      return;
    }
    let active = true;
    setPreview({ phase: 'loading' });
    previewHouseholdInvite(token)
      .then((reponse) => {
        if (active) setPreview({ phase: 'ready', householdName: reponse.householdName, inviterFirstName: reponse.inviterFirstName ?? null });
      })
      .catch(() => {
        // D-03 : mort ou réseau, le même message — aucun motif n'est distingué.
        if (active) setPreview({ phase: 'dead' });
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Abandon : un lien mort au retour (ou une session jamais poursuivie) ne
  // laisse pas de token en attente traîner en sessionStorage (D-06).
  useEffect(() => {
    if (preview.phase === 'dead') clearPendingInviteToken();
  }, [preview.phase]);

  const titre =
    preview.phase === 'ready' && preview.inviterFirstName
      ? `${preview.inviterFirstName} t’invite à rejoindre ${preview.householdName ?? 'un foyer'}`
      : `Vous avez été invité à rejoindre ${preview.phase === 'ready' ? (preview.householdName ?? 'un foyer') : 'un foyer'}`;

  const lede =
    preview.phase === 'ready' && isAuthenticated
      ? `Vous allez rejoindre ${preview.householdName ?? 'un nouveau foyer'}.`
      : `Un seul clic après votre inscription et vous retrouvez les membres de ${preview.phase === 'ready' ? (preview.householdName ?? 'votre nouveau foyer') : 'votre nouveau foyer'}.`;

  // D-06 : le token part en sessionStorage AVANT de quitter le pré-écran. La
  // route d'origine voyage aussi dans `state.from` : une session immédiate
  // (connexion existante, SSO) revient au pré-écran ; un compte à confirmer
  // repassera par le lien générique du mail et réadoptera le token (D-07).
  const continuerVersInscription = () => {
    if (!token) return;
    setPendingInviteToken(token);
    navigate('/connexion', { state: { from: `/foyer/rejoindre?token=${token}`, mode: 'inscription' } });
  };

  // D-08/D-19 : le redeem n'a lieu QUE sur clic explicite de la personne
  // connectée — jamais au chargement de la page.
  const rejoindre = async () => {
    if (!token || pending) return;
    setPending(true);
    setError(null);
    try {
      await redeemInviteToken(token);
      // La MÊME sonde que le reste de l'application (D-10, voir sign-in) : en
      // démonstration, le foyer local est joint au lieu du foyer serveur.
      if (!isSupabaseConfigured) {
        await joinHouseholdLocal();
      }
      await loadHousehold();
      // Application réussie : la traversée est terminée, la mémoire s'efface.
      clearPendingInviteToken();
      toast('Vous avez rejoint le foyer.');
      navigate('/accueil');
    } catch (joinError) {
      // D-17 : le motif serveur devient le verbatim dédié — jamais le message
      // technique brut (« token », statut HTTP) ni un détail exposé.
      setError(translateRedeemError(joinError instanceof Error ? joinError.message : ''));
      // Échec de l'application : la traversée est terminée, la mémoire aussi.
      clearPendingInviteToken();
      // D-09 : le message reste lisible, puis atterrissage sur l'état normal.
      window.setTimeout(() => navigate('/foyer'), DELAI_ATERRISSAGE_MS);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-screen max-w-[620px] place-items-center px-5 py-12 max-[650px]:items-start max-[650px]:px-[15px]">
      <div className="w-full">
        {!isAuthenticated ? (
          <Link to="/connexion" className="mb-6 inline-flex items-center gap-2 text-xs text-muted hover:text-fg">
            <Icon name="arrowLeft" size="sm" />
            Retour à la connexion
          </Link>
        ) : null}
        <p className="eyebrow mb-2">Invitation</p>
        {preview.phase === 'loading' ? (
          // D-01 : tant que la consultation n'a pas répondu, seule la ligne du
          // foyer est en attente — jamais de nom deviné ni de troncature.
          <Skeleton className="mb-2.5 h-8 w-4/5 max-w-[360px]" />
        ) : (
          <h1 className="mb-2.5 text-[clamp(26px,3.2vw,40px)] leading-[1.05]">{titre}</h1>
        )}
        {preview.phase === 'ready' ? <p className="lede mb-6 text-[15px]">{lede}</p> : null}
        {preview.phase === 'dead' ? (
          <p role="alert" className="mb-6 text-[11px] font-semibold text-coral-text">
            {MESSAGE_LIEN_MORT}
          </p>
        ) : null}
        {preview.phase !== 'dead' ? (
          isAuthenticated ? (
            <Button
              type="button"
              size="lg"
              fullWidth
              disabled={pending || preview.phase === 'loading'}
              icon="arrow"
              onClick={() => void rejoindre()}
            >
              {pending ? 'Vérification…' : 'Rejoindre le foyer'}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              fullWidth
              disabled={preview.phase === 'loading'}
              icon="arrow"
              onClick={continuerVersInscription}
            >
              Continuer vers l’inscription
            </Button>
          )
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 mb-0 text-[11px] font-semibold text-coral-text">
            {error}
          </p>
        ) : null}
        <div className="mt-6 rounded-[16px] border border-dashed border-accent/40 bg-accent-faint p-4">
          <h2 className="mb-1.5 font-display text-[15px] tracking-[-0.03em]">Pas de lien sous la main ?</h2>
          <p className="mb-0 text-xs text-muted">
            Demandez-le directement à un administrateur du foyer : il peut en générer un nouveau à tout moment depuis
            les préférences, ce qui invalide immédiatement le précédent.
          </p>
        </div>
        <p className="mt-4 mb-0 text-xs text-muted">
          Vous n’avez pas encore de foyer ?{' '}
          <Link to="/foyer/nouveau" className="font-bold text-accent-strong">
            Créer le vôtre
          </Link>
        </p>
      </div>
    </div>
  );
}
