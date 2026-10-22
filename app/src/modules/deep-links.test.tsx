import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { OPEN_RECORD_PARAM } from '@/lib/record-paths';
import TachesPage from '@/modules/taches/taches-page';
import NotesPage from '@/modules/notes/notes-page';
import CoursesPage from '@/modules/courses/courses-page';
import ContactsPage from '@/modules/contacts/contacts-page';
import RoutinesPage from '@/modules/routines/routines-page';
import AnniversairesPage from '@/modules/anniversaires/anniversaires-page';
import PrestatairesPage from '@/modules/prestataires/prestataires-page';
import AnimauxPage from '@/modules/animaux/animaux-page';
import FidelitePage from '@/modules/fidelite/fidelite-page';
import CadeauxPage from '@/modules/cadeaux/cadeaux-page';
import CalendrierPage from '@/modules/calendrier/calendrier-page';

/**
 * Le lien profond d'une recherche, testé MODULE PAR MODULE.
 *
 * La palette trouve une fiche et ouvre son URL (`/taches?ouvrir=task-1`) :
 * la page doit alors ouvrir CETTE fiche, et pas seulement son espace. Un
 * crochet partagé ne suffit pas à le prouver — il faut que chaque module
 * branche le sien sur ses propres données, avec ses propres identifiants.
 *
 * L'identifiant est celui de la graine de démonstration : le test porte donc
 * sur des données RÉELLES, pas sur des jetons inventés.
 */
const CAS = [
  { module: 'tâches', Page: TachesPage, id: 'task-1' },
  { module: 'notes', Page: NotesPage, id: 'note-1' },
  { module: 'courses', Page: CoursesPage, id: 'item-1' },
  { module: 'contacts', Page: ContactsPage, id: 'contact-maya' },
  { module: 'routines', Page: RoutinesPage, id: 'routine-1' },
  { module: 'anniversaires', Page: AnniversairesPage, id: 'birthday-1' },
  { module: 'prestataires', Page: PrestatairesPage, id: 'provider-1' },
  { module: 'animaux', Page: AnimauxPage, id: 'pet-1' },
  { module: 'fidélité', Page: FidelitePage, id: 'loyalty-1' },
  { module: 'cadeaux', Page: CadeauxPage, id: 'idea-2' },
  { module: 'calendrier', Page: CalendrierPage, id: 'event-1' },
] as const;

describe('les liens profonds ouvrent la fiche demandée', () => {
  for (const cas of CAS) {
    it(`${cas.module} ouvre sa fiche depuis l’URL`, async () => {
      const Page = cas.Page;
      renderWithProviders(<Page />, { route: `/?${OPEN_RECORD_PARAM}=${cas.id}` });

      // La fiche s'ouvre dans un dialogue : c'est là que l'utilisateur
      //atterrit, et non sur la simple liste de l'espace.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  }

  it('n’ouvre aucune fiche quand l’identifiant est inconnu', async () => {
    renderWithProviders(<TachesPage />, { route: `/?${OPEN_RECORD_PARAM}=task-inexistante` });

    // La page s'affiche, mais aucune fiche ne s'ouvre : un lien périmé ne
    // doit pas ouvrir un dialogue vide.
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
