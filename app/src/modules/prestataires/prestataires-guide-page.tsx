import { ModuleGuide } from '@/components/shared/module-guide';
import { PRESTATAIRES_GUIDE_QUESTIONS, PRESTATAIRES_GUIDE_SECTIONS } from './prestataires-guide-content';

/**
 * Mode d'emploi de l'espace Prestataires.
 *
 * Le contenu vit dans `prestataires-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function PrestatairesGuidePage() {
  return (
    <ModuleGuide
      module="prestataires"
      title="Comment ça marche"
      description="Les professionnels du foyer, à portée d'appel."
      sections={PRESTATAIRES_GUIDE_SECTIONS}
      questions={PRESTATAIRES_GUIDE_QUESTIONS}
      backTo="/prestataires"
      backLabel="Retour aux prestataires"
    />
  );
}
