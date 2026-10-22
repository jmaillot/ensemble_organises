import { ModuleGuide } from '@/components/shared/module-guide';
import { CONTACTS_GUIDE_QUESTIONS, CONTACTS_GUIDE_SECTIONS } from './contacts-guide-content';

/**
 * Mode d'emploi de l'espace Contacts.
 *
 * Le contenu vit dans `contacts-guide-content.ts` : la page reste lisible, et
 * le texte se relit sans toucher à la mise en page.
 */
export default function ContactsGuidePage() {
  return (
    <ModuleGuide
      module="contacts"
      title="Comment ça marche"
      description="Les visages du foyer, et ceux que l'on garde hors du foyer."
      sections={CONTACTS_GUIDE_SECTIONS}
      questions={CONTACTS_GUIDE_QUESTIONS}
      backTo="/contacts"
      backLabel="Retour aux contacts"
    />
  );
}
