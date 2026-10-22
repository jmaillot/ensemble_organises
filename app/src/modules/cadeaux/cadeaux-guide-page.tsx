import { ModuleGuide } from '@/components/shared/module-guide';
import { CADEAUX_GUIDE_QUESTIONS, CADEAUX_GUIDE_SECTIONS } from './cadeaux-guide-content';

/**
 * Mode d'emploi de l'espace Cadeaux.
 *
 * Le contenu vit dans `cadeaux-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function CadeauxGuidePage() {
  return (
    <ModuleGuide
      module="cadeaux"
      title="Comment ça marche"
      description="Les idées, les listes, et la surprise que l'on garde."
      sections={CADEAUX_GUIDE_SECTIONS}
      questions={CADEAUX_GUIDE_QUESTIONS}
      backTo="/cadeaux"
      backLabel="Retour aux cadeaux"
    />
  );
}
