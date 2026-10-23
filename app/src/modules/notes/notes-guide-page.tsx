import { ModuleGuide } from '@/components/shared/module-guide';
import { NOTES_GUIDE_QUESTIONS, NOTES_GUIDE_SECTIONS } from './notes-guide-content';

/**
 * Mode d'emploi de l'espace Notes.
 *
 * Le contenu vit dans `notes-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function NotesGuidePage() {
  return (
    <ModuleGuide
      module="notes"
      title="Comment ça marche"
      description="Vos memoires et vos idées, partagées ou privées."
      sections={NOTES_GUIDE_SECTIONS}
      questions={NOTES_GUIDE_QUESTIONS}
      backTo="/notes"
      backLabel="Retour aux notes"
    />
  );
}
