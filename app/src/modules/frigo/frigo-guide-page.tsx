import { ModuleGuide } from '@/components/shared/module-guide';
import { FRIGO_GUIDE_QUESTIONS, FRIGO_GUIDE_SECTIONS } from './frigo-guide-content';

/**
 * Mode d'emploi de l'espace Frigo.
 *
 * Le contenu vit dans `frigo-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function FrigoGuidePage() {
  return (
    <ModuleGuide
      module="frigo"
      title="Comment ça marche"
      description="Ce que le foyer possède, et ce qui va périmer — au réfrigérateur, au congélateur et au garde-manger."
      sections={FRIGO_GUIDE_SECTIONS}
      questions={FRIGO_GUIDE_QUESTIONS}
      backTo="/frigo"
      backLabel="Retour au frigo"
    />
  );
}
