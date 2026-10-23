import { ModuleGuide } from '@/components/shared/module-guide';
import { TACHES_GUIDE_QUESTIONS, TACHES_GUIDE_SECTIONS } from './taches-guide-content';

/**
 * Mode d'emploi de l'espace Tâches.
 *
 * Le contenu vit dans `taches-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function TâchesGuidePage() {
  return (
    <ModuleGuide
      module="taches"
      title="Comment ça marche"
      description="Ce qu'il y a à faire, pour tout le monde, et qui s'en occupe."
      sections={TACHES_GUIDE_SECTIONS}
      questions={TACHES_GUIDE_QUESTIONS}
      backTo="/taches"
      backLabel="Retour aux tâches"
    />
  );
}
