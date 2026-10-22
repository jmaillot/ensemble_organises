import { ModuleGuide } from '@/components/shared/module-guide';
import { CALENDRIER_GUIDE_QUESTIONS, CALENDRIER_GUIDE_SECTIONS } from './calendrier-guide-content';

/**
 * Mode d'emploi de l'espace Calendrier.
 *
 * Le contenu vit dans `calendrier-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function CalendrierGuidePage() {
  return (
    <ModuleGuide
      module="calendrier"
      title="Comment ça marche"
      description="Les rendez-vous du foyer, et ce qu'ils rappellent."
      sections={CALENDRIER_GUIDE_SECTIONS}
      questions={CALENDRIER_GUIDE_QUESTIONS}
      backTo="/calendrier"
      backLabel="Retour au calendrier"
    />
  );
}
