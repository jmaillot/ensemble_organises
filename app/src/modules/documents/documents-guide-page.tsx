import { ModuleGuide } from '@/components/shared/module-guide';
import { DOCUMENTS_GUIDE_QUESTIONS, DOCUMENTS_GUIDE_SECTIONS } from './documents-guide-content';

/**
 * Mode d'emploi de l'espace Documents.
 *
 * Le contenu vit dans `documents-guide-content.ts` : la page reste lisible,
 * et le texte se relit sans toucher à la mise en page. Le bouton ⓘ de la
 * page Documents pointait ici depuis sa création, mais la page n'existait
 * pas (retour du 23 octobre 2026) — le clic rendait une 404.
 */
export default function DocumentsGuidePage() {
  return (
    <ModuleGuide
      module="documents"
      title="Comment ça marche"
      description="Les papiers du foyer en dossiers colorés — photo ou PDF, avec échéances et notes."
      sections={DOCUMENTS_GUIDE_SECTIONS}
      questions={DOCUMENTS_GUIDE_QUESTIONS}
      backTo="/documents"
      backLabel="Retour aux documents"
    />
  );
}
