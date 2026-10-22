import { ModuleGuide } from '@/components/shared/module-guide';
import { CERCLE_GUIDE_QUESTIONS, CERCLE_GUIDE_SECTIONS } from './cercle-guide-content';

/**
 * Mode d'emploi de l'espace Cercle.
 *
 * Le contenu vit dans `cercle-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function CercleGuidePage() {
  return (
    <ModuleGuide
      module="cercle"
      title="Comment ça marche"
      description="Le fil du foyer : photos, réactions et messages."
      sections={CERCLE_GUIDE_SECTIONS}
      questions={CERCLE_GUIDE_QUESTIONS}
      backTo="/cercle"
      backLabel="Retour au Cercle"
    />
  );
}
