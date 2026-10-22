import { ModuleGuide } from '@/components/shared/module-guide';
import { ACCUEIL_GUIDE_QUESTIONS, ACCUEIL_GUIDE_SECTIONS } from './dashboard-guide-content';

/**
 * Mode d'emploi de l'espace Accueil.
 *
 * Le contenu vit dans `dashboard-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function AccueilGuidePage() {
  return (
    <ModuleGuide
      module="accueil"
      title="Comment ça marche"
      description="La page qui ouvre l'application : le point du jour, vos widgets et les accès aux espaces."
      sections={ACCUEIL_GUIDE_SECTIONS}
      questions={ACCUEIL_GUIDE_QUESTIONS}
      backTo="/accueil"
      backLabel="Retour à l'accueil"
    />
  );
}
