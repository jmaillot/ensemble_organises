import { ModuleGuide } from '@/components/shared/module-guide';
import { VOYAGES_GUIDE_QUESTIONS, VOYAGES_GUIDE_SECTIONS } from './voyages-guide-content';

/**
 * Mode d'emploi de l'espace Voyages.
 *
 * Le contenu vit dans `voyages-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function VoyagesGuidePage() {
  return (
    <ModuleGuide
      module="voyages"
      title="Comment ça marche"
      description="Les projets de voyage, et tout ce qu'il faut y emporter."
      sections={VOYAGES_GUIDE_SECTIONS}
      questions={VOYAGES_GUIDE_QUESTIONS}
      backTo="/voyages"
      backLabel="Retour aux voyages"
    />
  );
}
