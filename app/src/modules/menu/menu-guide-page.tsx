import { ModuleGuide } from '@/components/shared/module-guide';
import { MENU_GUIDE_QUESTIONS, MENU_GUIDE_SECTIONS } from './menu-guide-content';

/**
 * Mode d'emploi de l'espace Menu.
 *
 * Le contenu vit dans `menu-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function MenuGuidePage() {
  return (
    <ModuleGuide
      module="menu"
      title="Comment ça marche"
      description="Les repas de la semaine, case par case — et la liste de courses qui en découle."
      sections={MENU_GUIDE_SECTIONS}
      questions={MENU_GUIDE_QUESTIONS}
      backTo="/menu"
      backLabel="Retour au menu"
    />
  );
}
