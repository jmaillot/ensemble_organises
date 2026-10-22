import { ModuleGuide } from '@/components/shared/module-guide';
import { RECETTES_GUIDE_QUESTIONS, RECETTES_GUIDE_SECTIONS } from './recettes-guide-content';

/**
 * Mode d'emploi de l'espace Recettes.
 *
 * Le contenu vit dans `recettes-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function RecettesGuidePage() {
  return (
    <ModuleGuide
      module="recettes"
      title="Comment ça marche"
      description="Le carnet de cuisine du foyer, et le mode cuisine pour les mains dans la pâte."
      sections={RECETTES_GUIDE_SECTIONS}
      questions={RECETTES_GUIDE_QUESTIONS}
      backTo="/recettes"
      backLabel="Retour aux recettes"
    />
  );
}
