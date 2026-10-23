import { ModuleGuide } from '@/components/shared/module-guide';
import { MESSAGES_GUIDE_QUESTIONS, MESSAGES_GUIDE_SECTIONS } from './messages-guide-content';

/**
 * Mode d'emploi de l'espace Messages.
 *
 * Le contenu vit dans `messages-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function MessagesGuidePage() {
  return (
    <ModuleGuide
      module="messages"
      title="Comment ça marche"
      description="Les échanges privés, et ce qui reste lisible après un départ."
      sections={MESSAGES_GUIDE_SECTIONS}
      questions={MESSAGES_GUIDE_QUESTIONS}
      backTo="/messages"
      backLabel="Retour aux messages"
    />
  );
}
