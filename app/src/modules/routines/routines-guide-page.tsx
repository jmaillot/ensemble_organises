import { ModuleGuide } from '@/components/shared/module-guide';
import { ROUTINES_GUIDE_QUESTIONS, ROUTINES_GUIDE_SECTIONS } from './routines-guide-content';

/**
 * Mode d'emploi de l'espace Routines.
 *
 * Le contenu vit dans `routines-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function RoutinesGuidePage() {
  return (
    <ModuleGuide
      module="routines"
      title="Comment ça marche"
      description="Les habitudes du foyer, leur rythme, et ce qui a été fait."
      sections={ROUTINES_GUIDE_SECTIONS}
      questions={ROUTINES_GUIDE_QUESTIONS}
      backTo="/routines"
      backLabel="Retour aux routines"
    />
  );
}
