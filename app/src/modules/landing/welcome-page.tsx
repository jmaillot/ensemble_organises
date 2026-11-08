import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';
import { useSignOutWithConfirm } from '@/hooks/use-sign-out';

export default function WelcomePage() {
  const navigate = useNavigate();
  // G-37-2 : un utilisateur connecté SANS foyer n'a aucun chemin de
  // déconnexion atteignable — la purge GoTrue (D-07, session-store.signOut →
  // purgerStockageSession, prouvée en 37-01) est correcte mais inatteignable
  // depuis cette page. Un Link vers /connexion ne purge rien : le signe-out
  // doit être RÉEL, via le goulot unique useSignOutWithConfirm (scan D-17
  // inclus). /connexion et /foyer/nouveau|rejoindre restent intouchés :
  // /foyer est la page d'atterrissage de RequireHousehold, un seul point de
  // déconnexion suffit (classe, pas instance).
  const { signOut, dialog, busy } = useSignOutWithConfirm(() => navigate('/connexion'));

  return (
    <div className="mx-auto grid min-h-screen max-w-[900px] place-items-center px-5 py-12 max-[650px]:items-start max-[650px]:px-[15px]">
      <div className="w-full">
        <p className="eyebrow mb-2">Bienvenue</p>
        <h1 className="mb-2.5 text-[clamp(26px,3.2vw,40px)] leading-[1.05]">Vous n’avez pas encore de foyer</h1>
        <p className="lede mb-7 text-[15px]">
          Un foyer réunit votre famille : membres, permissions, et l’ensemble des espaces. Créez-le, ou rejoignez
          celui d’un proche avec son token d’invitation.
        </p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Link to="/foyer/nouveau" className="group">
            <article className="h-full rounded-[22px] border border-border bg-surface p-6 transition-[transform,box-shadow] duration-[var(--duration-quick)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]">
              <span className="mb-4 grid size-12 place-items-center rounded-[16px] bg-accent-soft text-accent-strong">
                <Icon name="plus" size="lg" />
              </span>
              <h2 className="mb-1.5 font-display text-xl tracking-[-0.035em]">Créer mon foyer</h2>
              <p className="m-0 text-xs text-muted">
                Vous deviendrez administrateur. Un token d’invitation sera généré immédiatement pour rejoindre vos
                proches.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-accent-strong">
                Commencer <Icon name="arrow" size="sm" />
              </span>
            </article>
          </Link>
          <Link to="/foyer/rejoindre" className="group">
            <article className="h-full rounded-[22px] border border-border bg-surface p-6 transition-[transform,box-shadow] duration-[var(--duration-quick)] hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)]">
              <span className="mb-4 grid size-12 place-items-center rounded-[16px] bg-accent-soft text-accent-strong">
                <Icon name="key" size="lg" />
              </span>
              <h2 className="mb-1.5 font-display text-xl tracking-[-0.035em]">Rejoindre un foyer</h2>
              <p className="m-0 text-xs text-muted">
                Saisissez le token reçu d’un administrateur. La validation se fait côté serveur, en une seule
                transaction.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-accent-strong">
                Rejoindre <Icon name="arrow" size="sm" />
              </span>
            </article>
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3 text-xs text-muted">
          <Link to="/accueil" className="inline-flex items-center gap-1.5 font-semibold text-accent-strong">
            <Icon name="arrowLeft" size="sm" /> Retour au tableau de bord
          </Link>
          <Button variant="ghost" size="sm" icon="logout" disabled={busy} onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>
      {dialog}
    </div>
  );
}
