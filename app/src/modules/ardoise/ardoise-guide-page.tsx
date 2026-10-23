import { ModuleGuide } from '@/components/shared/module-guide';
import { ARDOISE_GUIDE_QUESTIONS, ARDOISE_GUIDE_SECTIONS } from './ardoise-guide-content';

/**
 * Mode d'emploi de l'espace Ardoise.
 *
 * Le contenu vit dans `ardoise-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function ArdoiseGuidePage() {
  return (
    <ModuleGuide
      module="ardoise"
      title="Comment ça marche"
      description="Les dépenses du foyer, et qui doit quoi à qui."
      sections={ARDOISE_GUIDE_SECTIONS}
      questions={ARDOISE_GUIDE_QUESTIONS}
      backTo="/ardoise"
      backLabel="Retour à l'ardoise"
    />
  );
}
