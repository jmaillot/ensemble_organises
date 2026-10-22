import { ModuleGuide } from '@/components/shared/module-guide';
import { ANNIVERSAIRES_GUIDE_QUESTIONS, ANNIVERSAIRES_GUIDE_SECTIONS } from './anniversaires-guide-content';

/**
 * Mode d'emploi de l'espace Anniversaires.
 *
 * Le contenu vit dans `anniversaires-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function AnniversairesGuidePage() {
  return (
    <ModuleGuide
      module="anniversaires"
      title="Comment ça marche"
      description="Les dates à ne pas oublier, et celles que l'on prépare."
      sections={ANNIVERSAIRES_GUIDE_SECTIONS}
      questions={ANNIVERSAIRES_GUIDE_QUESTIONS}
      backTo="/anniversaires"
      backLabel="Retour aux anniversaires"
    />
  );
}
