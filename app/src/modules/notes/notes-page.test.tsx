import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { data } from '@/lib/data';
import type { NoteAttachmentRow, NoteRow } from '@/types';
import userEvent from '@testing-library/user-event';
import NotesPage from './notes-page';
import { renderWithProviders } from '@/test/render';
import { DEMO_HOUSEHOLD_ID } from '@/lib/data/seed';

/** jsdom n'implémente pas `scrollIntoView`, utilisé par Radix à l'ouverture d'un dialogue. */
function supportScrollIntoView() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  }
}

describe('NotesPage', () => {
  it('filtre les notes avec la recherche plein texte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
    expect(screen.getByText('Idées de week-end')).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Rechercher une note' });
    await user.type(search, 'week-end');

    expect(screen.getByText('Idées de week-end')).toBeInTheDocument();
    expect(screen.queryByText('Liste de rentrée')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'kangourou');
    expect(screen.getByText('Aucune note ne correspond à votre recherche.')).toBeInTheDocument();
  });

  it('filtre les notes par catégorie', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    const group = await screen.findByRole('group', { name: 'Filtrer par catégorie' });
    await user.click(within(group).getByRole('button', { name: 'Foyer' }));

    expect(screen.getByText('À demander à Léa')).toBeInTheDocument();
    expect(screen.queryByText('Liste de rentrée')).not.toBeInTheDocument();
  });

  it('valide puis crée une note depuis le dialogue', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer une note' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));
    expect(await within(dialog).findByText('Donnez un titre à votre note.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Titre/), 'Courses de la semaine');
    await user.type(within(dialog).getByLabelText(/Contenu/), 'Yaourts, fruits et lait d’agne.');
    await user.selectOptions(within(dialog).getByLabelText(/Visibilité/), 'foyer');
    await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));

    expect(await screen.findByText('Courses de la semaine')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prévisualise le Markdown sans perdre la saisie', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer une note' }));

    const dialog = await screen.findByRole('dialog');
    const textarea = within(dialog).getByLabelText(/Contenu/);
    await user.type(textarea, '**Préparer** les cartables');

    await user.click(within(dialog).getByRole('button', { name: 'Aperçu' }));
    expect(await within(dialog).findByText('Préparer', { selector: 'strong' })).toBeInTheDocument();
    // Le champ reste monté mais masqué : c'est lui qui porte la valeur envoyée.
    expect(textarea).not.toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Écrire' }));
    expect(textarea).toBeVisible();
    expect(textarea).toHaveValue('**Préparer** les cartables');
  });

  it('joint un PDF à la création et l’affiche sur la carte', async () => {
    supportScrollIntoView();
    // Mode démo : le dépôt renvoie un aperçu local.
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:piece-jointe' });
    try {
      const user = userEvent.setup();
      renderWithProviders(<NotesPage />, { route: '/notes' });

      expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Créer une note' }));

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Titre/), 'Note avec pièce jointe');
      await user.type(within(dialog).getByLabelText(/Contenu/), 'Voir le document joint.');
      await user.upload(
        within(dialog).getByLabelText(/Joindre des fichiers/),
        new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' }),
      );
      expect(await within(dialog).findByText(/devis\.pdf/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Créer la note' }));

      expect(await screen.findByText('Note avec pièce jointe')).toBeInTheDocument();
      // Le dialogue ne se referme qu'après le dépôt : attendre sa fermeture
      // prouve le circuit complet, pas seulement la création de la note.
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('devis.pdf')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * D-09 : un état vide dit la vérité de ce qui est vide. La graine n'a aucun
   * `note_folders` et toutes ses notes ont `folder_id` nul : créer un dossier
   * puis l'ouvrir produit le cas « dossier vide », sans filtre actif.
   */
  it('un dossier vide dit sa vérité et propose de le remplir (D-09)', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();

    // Le hook persiste l'onglet dans `localStorage` : une clé laissée ferait
    // démarrer les tests suivants sur un dossier qui n'existe plus.
    try {
      await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
      const createDialog = await screen.findByRole('dialog');
      await user.type(within(createDialog).getByLabelText(/Nom du dossier/), 'Vacances');
      await user.click(within(createDialog).getByRole('button', { name: 'Créer le dossier' }));

      await user.click(await screen.findByRole('tab', { name: 'Vacances' }));

      // L'état vide du dossier dit sa vérité : il n'invite pas à réinitialiser
      // des filtres qui ne le rempliraient pas.
      expect(await screen.findByRole('heading', { name: 'Ce dossier est vide' })).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Aucune note ne correspond à votre recherche.' }),
      ).not.toBeInTheDocument();
      // L'action de création est offerte : en-tête + état vide = deux boutons.
      expect(screen.getAllByRole('button', { name: 'Créer une note' })).toHaveLength(2);

      // Une recherche active sans résultat reprend l'état de recherche, et le
      // dossier vide n'est plus rendu : les deux états ne coexistent jamais.
      const search = screen.getByRole('searchbox', { name: 'Rechercher une note' });
      await user.type(search, 'kangourou');
      expect(screen.getByRole('heading', { name: 'Aucune note ne correspond à votre recherche.' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Ce dossier est vide' })).not.toBeInTheDocument();

      await user.clear(search);
      expect(await screen.findByRole('heading', { name: 'Ce dossier est vide' })).toBeInTheDocument();

      // L'état n'est pas collé à l'onglet : Général rend de nouveau la grille.
      await user.click(screen.getByRole('tab', { name: 'Général' }));
      expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Ce dossier est vide' })).not.toBeInTheDocument();
    } finally {
      window.localStorage.removeItem(`eo:notes:folder:${DEMO_HOUSEHOLD_ID}`);
    }
  });

  /**
   * D-09 : « Général vide » est un état distinct de « dossier vide ». Des notes
   * rangées dans un dossier laissent le Général sans contenu, et le message le
   * dit — sans confondre avec une recherche restée active.
   */
  it('Général vide alors que des notes sont rangées ailleurs dit son propre titre (D-09)', async () => {
    supportScrollIntoView();
    const user = userEvent.setup();
    renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();

    try {
      await user.click(screen.getByRole('button', { name: 'Nouveau dossier' }));
      const createDialog = await screen.findByRole('dialog');
      await user.type(within(createDialog).getByLabelText(/Nom du dossier/), 'Vacances');
      await user.click(within(createDialog).getByRole('button', { name: 'Créer le dossier' }));
      await screen.findByRole('tab', { name: 'Vacances' });

      // Ranger toutes les notes du Général dans le dossier : Général devient
      // vide alors que des notes existent toujours (le titre du dossier, lui,
      // porte les notes).
      for (const title of ['Liste de rentrée', 'Idées de week-end', 'À demander à Léa']) {
        const card = screen.getByText(title).closest('article');
        expect(card).not.toBeNull();
        await user.click(within(card as HTMLElement).getByRole('button', { name: 'Modifier' }));
        const editDialog = await screen.findByRole('dialog');
        await user.selectOptions(
          within(editDialog).getByLabelText(/Dossier/),
          within(editDialog).getByRole('option', { name: 'Vacances' }),
        );
        await user.click(within(editDialog).getByRole('button', { name: 'Enregistrer les modifications' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      }

      expect(await screen.findByRole('heading', { name: 'Aucune note dans Général' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Ce dossier est vide' })).not.toBeInTheDocument();
    } finally {
      window.localStorage.removeItem(`eo:notes:folder:${DEMO_HOUSEHOLD_ID}`);
    }
  });

  /**
   * 0136 — la couverture est un bandeau sur la carte. La graine donne une photo
   * désignée à « Liste de rentrée » et une photo non désignée à « Idées de
   * week-end » : le second cas prouve le repli sur la première image, sans quoi
   * la fonctionnalité ne s'afficherait que pour qui a fait le geste exprès.
   */
  it('affiche la photo de couverture, et la première image à défaut de choix', async () => {
    const { container } = renderWithProviders(<NotesPage />, { route: '/notes' });

    expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();

    const coverOf = (title: string) =>
      (screen.getByText(title).closest('article') as HTMLElement).querySelector('img');
    // `alt=""` : le bandeau est décoratif, le titre de la carte nomme déjà la
    // note et la pièce jointe reparaît plus bas avec son nom de fichier.
    expect(coverOf('Liste de rentrée')).toHaveAttribute('src', '/assets/adresses.jpg');
    expect(coverOf('Liste de rentrée')).toHaveAttribute('alt', '');
    expect(coverOf('Idées de week-end')).toHaveAttribute('src', '/assets/lisbonne.jpg');
    expect(container.querySelectorAll('article img[alt=""]')).toHaveLength(2);
  });

  it('désigne une autre photo comme couverture depuis le dialogue', async () => {
    supportScrollIntoView();
    const second: NoteAttachmentRow = await data.create<NoteAttachmentRow>('note_attachments', {
      id: 'note-attachment-test-2',
      note_id: 'note-1',
      household_id: DEMO_HOUSEHOLD_ID,
      file_url: '/assets/courses.jpg',
      file_name: 'Liste imprimée.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 1024,
      created_at: '2026-10-21T09:00:00.000Z',
    });

    try {
      const user = userEvent.setup();
      const { container } = renderWithProviders(<NotesPage />, { route: '/notes' });

      expect(await screen.findByText('Liste de rentrée')).toBeInTheDocument();
      const coverOf = () =>
        (screen.getByText('Liste de rentrée').closest('article') as HTMLElement).querySelector('img');
      expect(coverOf()).toHaveAttribute('src', '/assets/adresses.jpg');

      await user.click(
        within(screen.getByText('Liste de rentrée').closest('article') as HTMLElement).getByRole('button', {
          name: 'Modifier',
        }),
      );
      const dialog = await screen.findByRole('dialog');
      const group = within(dialog).getByRole('group', { name: 'Choisir la photo de couverture' });
      // La photo désignée est celle qui est enfoncée à l'ouverture.
      expect(within(group).getByRole('button', { name: 'Choisir Cartables prêts.jpg comme couverture' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await user.click(within(group).getByRole('button', { name: 'Choisir Liste imprimée.jpg comme couverture' }));
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer les modifications' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await waitFor(() => expect(coverOf()).toHaveAttribute('src', '/assets/courses.jpg'));
      const [stored] = await data.list<NoteRow>('notes', { id: 'note-1' });
      expect(stored.cover_attachment_id).toBe(second.id);
      expect(container.querySelectorAll('article img[alt=""]')).toHaveLength(2);
    } finally {
      await data.remove('note_attachments', second.id);
    }
  });
});
