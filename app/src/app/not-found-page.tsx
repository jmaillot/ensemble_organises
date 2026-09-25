import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/shared/icon';

export default function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center px-5 text-center">
      <div className="max-w-[440px]">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-[18px] bg-accent-soft text-accent-strong">
          <Icon name="search" size="lg" />
        </span>
        <h1 className="mb-2 text-[clamp(24px,3vw,36px)] leading-[1.05]">Cette page n’existe pas</h1>
        <p className="lede mx-auto mb-6 text-[14px]">
          Le lien est peut-être obsolète. Revenez au tableau de bord pour retrouver votre foyer.
        </p>
        <Link to="/accueil">
          <Button icon="arrow">Retour au tableau de bord</Button>
        </Link>
      </div>
    </div>
  );
}
