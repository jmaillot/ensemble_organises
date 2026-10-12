import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';

/**
 * Page « non autorisé » sobre (phase 14, D-06) : accès direct à un espace du
 * foyer réservé aux grands. Jamais une 404 mensongère (l'espace existe), et
 * jamais une redirection silencieuse — l'enfant comprend, puis revient à ses
 * espaces. Le serveur refuse de toute façon (14-01) : cette page n'est que la
 * présentation d'un refus déjà acté.
 */
export function Forbidden() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="max-w-[440px]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name="info" size="lg" />
        </span>
        <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">Un espace réservé aux grands</h1>
        <p className="lede mx-auto mb-6 text-[14px]">
          Cet espace du foyer est réservé aux adultes. Si tu penses qu’il s’agit d’une erreur, parles-en à un
          parent.
        </p>
        <Button asChild>
          <Link to="/accueil">
            <Icon name="arrow" size="sm" />
            Retour au tableau de bord
          </Link>
        </Button>
      </div>
    </div>
  );
}
