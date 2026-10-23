import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';

/**
 * Avis « espace éteint par le foyer » (menu des applications, migration 0140).
 *
 * Un accès direct à l'URL d'un espace désactivé par le foyer rend un avis
 * sobre — jamais une 404 mensongère (l'espace existe), jamais une redirection
 * silencieuse. Même philosophie que la garde « réservé aux grands »
 * (`Forbidden`, phase 14 D-06), mais la cause n'est pas un rôle : le foyer a
 * choisi de couper cet espace, et un administrateur peut le réactiver dans
 * les paramètres. Les données ne sont pas touchées : seul l'accès disparaît.
 */
export function ModuleDisabled({ label, isAdmin }: { label: string; isAdmin: boolean }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 text-center">
      <div className="max-w-[440px]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name="info" size="lg" />
        </span>
        <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">« {label} » est désactivé</h1>
        <p className="lede mx-auto mb-6 text-[14px]">
          {isAdmin
            ? 'Un administrateur a désactivé cet espace pour votre foyer. Vous pouvez le réactiver dans les paramètres, onglet Application.'
            : 'Un administrateur a désactivé cet espace pour votre foyer. Vos données y sont conservées ; parlez-en à un administrateur si cet espace vous manque.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button asChild>
            <Link to="/accueil">
              <Icon name="arrow" size="sm" />
              Retour au tableau de bord
            </Link>
          </Button>
          {isAdmin ? (
            <Button variant="secondary" asChild>
              <Link to="/parametres">
                <Icon name="settings" size="sm" />
                Paramètres du foyer
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
