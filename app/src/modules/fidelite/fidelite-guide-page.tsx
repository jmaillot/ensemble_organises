import { ModuleGuide } from '@/components/shared/module-guide';
import { FIDELITE_GUIDE_QUESTIONS, FIDELITE_GUIDE_SECTIONS } from './fidelite-guide-content';

/**
 * Mode d'emploi de l'espace Fidélité.
 *
 * Le contenu vit dans `fidelite-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function FidélitéGuidePage() {
  return (
    <ModuleGuide
      module="fidelite"
      title="Comment ça marche"
      description="Les cartes du foyer, et le code que l'on ne retrouve jamais."
      sections={FIDELITE_GUIDE_SECTIONS}
      questions={FIDELITE_GUIDE_QUESTIONS}
      backTo="/fidelite"
      backLabel="Retour à Fidélité"
    />
  );
}
