import { ModuleGuide } from '@/components/shared/module-guide';
import { COURSES_GUIDE_QUESTIONS, COURSES_GUIDE_SECTIONS } from './courses-guide-content';

/**
 * Mode d'emploi des listes de courses.
 *
 * Le contenu vit dans `courses-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function CoursesGuidePage() {
  return (
    <ModuleGuide
      module="courses"
      title="Comment ça marche"
      description="La liste partagée, le catalogue des produits, et ce que l’application fait vraiment."
      sections={COURSES_GUIDE_SECTIONS}
      questions={COURSES_GUIDE_QUESTIONS}
      backTo="/courses"
      backLabel="Retour aux listes"
    />
  );
}
