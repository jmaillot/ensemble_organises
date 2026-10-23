import { ModuleGuide } from '@/components/shared/module-guide';
import { ADRESSES_GUIDE_QUESTIONS, ADRESSES_GUIDE_SECTIONS } from './adresses-guide-content';

/**
 * Mode d'emploi de l'espace Adresses.
 *
 * Le contenu vit dans `adresses-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function AdressesGuidePage() {
  return (
    <ModuleGuide
      module="adresses"
      title="Comment ça marche"
      description="Les lieux à retrouver, visités ou à visiter."
      sections={ADRESSES_GUIDE_SECTIONS}
      questions={ADRESSES_GUIDE_QUESTIONS}
      backTo="/adresses"
      backLabel="Retour aux adresses"
    />
  );
}
