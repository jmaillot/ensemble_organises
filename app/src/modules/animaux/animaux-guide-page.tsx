import { ModuleGuide } from '@/components/shared/module-guide';
import { ANIMAUX_GUIDE_QUESTIONS, ANIMAUX_GUIDE_SECTIONS } from './animaux-guide-content';

/**
 * Mode d'emploi de l'espace Animaux.
 *
 * Le contenu vit dans `animaux-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function AnimauxGuidePage() {
  return (
    <ModuleGuide
      module="animaux"
      title="Comment ça marche"
      description="La santé de la famille, et les rappels qui vont avec."
      sections={ANIMAUX_GUIDE_SECTIONS}
      questions={ANIMAUX_GUIDE_QUESTIONS}
      backTo="/animaux"
      backLabel="Retour aux animaux"
    />
  );
}
