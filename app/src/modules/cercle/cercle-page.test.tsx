import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS, demoMembers } from '@/lib/data/seed';
import type { PostCommentRow, PostMediaRow, PostRow } from '@/types';
import CerclePage from './cercle-page';
import { PostCard } from './components/post-card';
import { CommentsDialog } from './components/comments-dialog';
import type { FeedPost } from './types';

/**
 * D-01/WR-08 — la lecture forge l'URL affichable depuis le CHEMIN de colonne
 * (`resolveHouseholdMediaUrls`, point unique de 19-01). On l'observe au niveau
 * du fil : un chemin rend l'URL du faux Storage, un échec laisse l'image
 * absente — jamais le chemin brut ni un `src="null"`. Le retrait d'objet
 * (`removeHouseholdFile`) est doublé pour prouver la compensation de
 * suppression (D-03/WR-10).
 */
const { resolveMock, removeFileMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  removeFileMock: vi.fn(async () => {}),
}));

vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>();
  return { ...actual, resolveHouseholdMediaUrls: resolveMock, removeHouseholdFile: removeFileMock };
});

/** Ce que le Storage rendrait : une URL signée par ligne de média. */
function signEveryRow(rows: { id: string }[]): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const row of rows) resolved[row.id] = `https://signe.example/${row.id}`;
  return resolved;
}

/** Publication de Camille (l'auteur courant) portant un média à la `url` donnée. */
async function seedPostWithMedia(id: string, url: string): Promise<void> {
  await data.create<PostRow>('posts', {
    id,
    household_id: DEMO_HOUSEHOLD_ID,
    author_id: DEMO_MEMBERS.camille,
    text: `Média ${id}`,
    created_at: new Date().toISOString(),
  });
  await data.create<PostMediaRow>('post_media', {
    id: `${id}-media`,
    post_id: id,
    household_id: DEMO_HOUSEHOLD_ID,
    media_type: 'photo',
    url,
  });
}

function mediaImageOf(container: HTMLElement, postId: string): HTMLImageElement | null {
  return container.querySelector(`article[data-post-id="${postId}"] img`);
}

describe('Cercle', () => {
  it('publie un moment depuis le composeur et l’ajoute en tête du fil', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CerclePage />);

    // Le fil de démonstration est chargé depuis le jeu local.
    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();

    const composer = screen.getByLabelText(/Votre commentaire/);
    await user.type(composer, 'Promenade au marché dimanche matin.');
    await user.click(screen.getByRole('button', { name: 'Publier' }));

    const newPost = await screen.findByText('Promenade au marché dimanche matin.');
    const cards = container.querySelectorAll('article[data-post-id]');
    expect(cards.length).toBeGreaterThan(2);
    // La publication optimiste apparaît immédiatement, avant les publications existantes.
    expect(cards[0]).toHaveTextContent('Promenade au marché dimanche matin.');
    expect(cards[0]).toHaveTextContent('Camille Martin');
    expect(newPost.closest('article')).toBe(cards[0]);
    // Le composeur est vidé après publication.
    await waitFor(() => expect(screen.getByLabelText(/Votre commentaire/)).toHaveValue(''));
  });

  it('masque le composeur pour un enfant géré (D-12) : aucune interface de publication', async () => {
    renderWithProviders(<CerclePage />);
    // seedHouseholdStore (dans l'aide de rendu) remet Camille en membre
    // courant : la bascule vers l'enfant vient APRÈS le rendu.
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.noe });

    // Le fil se charge pour l'enfant ; la publication, elle, est interdite…
    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();
    // … côté serveur (0146), et l'écran ne montre pas un composeur mort.
    expect(screen.queryByLabelText(/Votre commentaire/)).not.toBeInTheDocument();
  });

  it('fait basculer la réaction et incrémente le compteur', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CerclePage />);

    expect(await screen.findByText(/J’ai retrouvé le numéro de la bibliothèque/)).toBeInTheDocument();

    // `post-2` n’a qu’une réaction, posée par Lina : Camille ne l’a pas encore mise.
    const card = screen.getByText(/J’ai retrouvé le numéro de la bibliothèque/).closest('article') as HTMLElement;
    const reaction = within(card).getByRole('button', { name: 'Réagir à cette publication' });
    expect(reaction).toHaveAttribute('aria-pressed', 'false');
    expect(reaction).toHaveTextContent('1 réaction');

    await user.click(reaction);

    const liked = within(card).getByRole('button', { name: 'Retirer ma réaction' });
    expect(liked).toHaveAttribute('aria-pressed', 'true');
    expect(liked).toHaveTextContent('2 réactions');

    // Un second clic retire la réaction et revient au compte initial.
    await user.click(liked);
    await waitFor(() =>
      expect(within(card).getByRole('button', { name: 'Réagir à cette publication' })).toHaveTextContent('1 réaction'),
    );

    // Le fil garde ses publications d’origine (dont celle de Noé, 25-05), le compteur global suit.
    expect(container.querySelectorAll('article[data-post-id]')).toHaveLength(3);
  });

  it('ajoute un commentaire depuis la modale et le montre dans la carte', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    // Le fil est chargé et lu : aucune notification en attente.
    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    expect(screen.getByText('Tout est lu')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Ouvrir les commentaires' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Votre commentaire/), 'Je prends le pique-nique.');
    await user.click(within(dialog).getByRole('button', { name: 'Publier' }));

    // Le commentaire apparaît dans la modale…
    await waitFor(() => expect(within(dialog).getByText('Je prends le pique-nique.')).toBeInTheDocument());
    await user.click(within(dialog).getAllByRole('button', { name: 'Fermer' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // …puis dans l’aperçu de la carte, qui devient la publication sélectionnée.
    expect(within(card).getByText('Je prends le pique-nique.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Ouvrir les commentaires' })).toHaveTextContent('3 commentaires');
    expect(card).toHaveAttribute('data-active', 'true');
    // Ses propres commentaires ne comptent pas comme des notifications.
    expect(within(card).queryByText(/nouveau commentaire/)).not.toBeInTheDocument();
  });

  it('regroupe les commentaires reçus d’un autre membre en notification', async () => {
    renderWithProviders(<CerclePage />);
    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    expect(screen.getByText('Tout est lu')).toBeInTheDocument();

    // Écriture d'un autre membre (autre onglet / temps réel) : le fil se met à jour.
    await data.create<PostCommentRow>('post_comments', {
      id: 'post-comment-live',
      post_id: 'post-1',
      household_id: DEMO_HOUSEHOLD_ID,
      author_id: DEMO_MEMBERS.thomas,
      content: 'On maintient le plan du lac ?',
      created_at: new Date().toISOString(),
    });

    await waitFor(() => expect(within(card).getByText('1 nouveau commentaire')).toBeInTheDocument());
    expect(screen.getByText('1 non lus')).toBeInTheDocument();
    expect(screen.getByText('nouveaux commentaires')).toBeInTheDocument();
  });

  it('supprime sa propre publication après confirmation et l’annonce', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CerclePage />);

    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();

    // Sa propre publication (Camille) porte l’affordance offerte par canDelete = mienne.
    await user.type(screen.getByLabelText(/Votre commentaire/), 'Pique-nique annulé, pluie annoncée.');
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    const card = (await screen.findByText('Pique-nique annulé, pluie annoncée.')).closest(
      'article',
    ) as HTMLElement;

    // Corbeille → modale de confirmation (AGENTS.md §6) → suppression annoncée.
    await user.click(
      within(card).getByRole('button', { name: /Supprimer la publication de Camille Martin/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Supprimer cette publication ?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(screen.queryByText('Pique-nique annulé, pluie annoncée.')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Publication supprimée.')).toBeInTheDocument();
    // Les publications d’origine survivent : la suppression ne déborde pas.
    expect(container.querySelectorAll('article[data-post-id]')).toHaveLength(3);
  });

  it('modifie sa propre publication en ligne et l’annonce', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Votre commentaire/), 'Moment à retoucher.');
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    const card = (await screen.findByText('Moment à retoucher.')).closest('article') as HTMLElement;

    // L’auteur seul voit « Modifier » ; l’éditeur est pré-rempli.
    await user.click(within(card).getByRole('button', { name: /Modifier la publication de Camille Martin/ }));
    const editor = within(card).getByLabelText('Modifier votre publication');
    expect(editor).toHaveValue('Moment à retoucher.');
    await user.clear(editor);
    await user.type(editor, 'Moment retouché par son auteur.');
    await user.click(within(card).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(within(card).getByText('Moment retouché par son auteur.')).toBeInTheDocument(),
    );
    expect(await screen.findByText('Publication modifiée.')).toBeInTheDocument();
  });

  it('annule l’édition d’une publication sans rien changer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Votre commentaire/), 'Moment à garder tel quel.');
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    const card = (await screen.findByText('Moment à garder tel quel.')).closest('article') as HTMLElement;

    await user.click(within(card).getByRole('button', { name: /Modifier la publication de Camille Martin/ }));
    const editor = within(card).getByLabelText('Modifier votre publication');
    await user.type(editor, ' (brouillon abandonné)');
    await user.click(within(card).getByRole('button', { name: 'Annuler' }));

    // L’éditeur se referme, le texte d’origine est intact, rien n’est annoncé.
    await waitFor(() =>
      expect(within(card).queryByLabelText('Modifier votre publication')).not.toBeInTheDocument(),
    );
    expect(within(card).getByText('Moment à garder tel quel.')).toBeInTheDocument();
    expect(screen.queryByText('Publication modifiée.')).not.toBeInTheDocument();
  });

  it('modifie son propre commentaire en ligne et l’annonce', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Ouvrir les commentaires' }));
    const dialog = await screen.findByRole('dialog');

    // Son propre commentaire (Camille) porte l’édition inline.
    const row = within(dialog).getByText('Parfait, je prépare le sac.').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Modifier ce commentaire' }));
    const editor = within(row).getByLabelText('Modifier votre commentaire');
    expect(editor).toHaveValue('Parfait, je prépare le sac.');
    await user.clear(editor);
    await user.type(editor, 'Parfait, je prépare deux sacs.');
    await user.click(within(row).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(within(dialog).getByText('Parfait, je prépare deux sacs.')).toBeInTheDocument(),
    );
    expect(await screen.findByText('Commentaire modifié.')).toBeInTheDocument();
  });

  it('supprime son propre commentaire après confirmation et l’annonce', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Ouvrir les commentaires' }));
    const dialog = await screen.findByRole('dialog');

    const row = within(dialog).getByText('Parfait, je prépare le sac.').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Supprimer ce commentaire' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Supprimer ce commentaire ?')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() =>
      expect(within(dialog).queryByText('Parfait, je prépare le sac.')).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Commentaire supprimé.')).toBeInTheDocument();
    // Le commentaire de Thomas survit : la suppression ne déborde pas.
    expect(within(dialog).getByText('Je suis partant pour 16 h.')).toBeInTheDocument();
  });

  it('l’admin ne peut plus supprimer la publication d’autrui (D-07)', async () => {
    renderWithProviders(<CerclePage />);

    // post-1 appartient à Lina ; Camille, admin de démonstration, ne voit
    // plus aucune affordance de retrait dessus — ni Modifier, ni Supprimer.
    // La publication survit et le fil garde ses deux cartes.
    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    expect(within(card).queryByRole('button', { name: /Modifier la publication/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Supprimer la publication/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Le soleil est enfin revenu/)).toBeInTheDocument();
  });

  it('n’offre aucune affordance d’écriture sur le contenu d’autrui (non-admin)', () => {
    const thomas = demoMembers.find((member) => member.id === DEMO_MEMBERS.thomas) ?? null;
    const camille = demoMembers.find((member) => member.id === DEMO_MEMBERS.camille) ?? null;
    const now = new Date().toISOString();
    const foreignPost: FeedPost = {
      id: 'post-x',
      authorId: DEMO_MEMBERS.thomas,
      author: thomas,
      text: 'Contenu d’autrui.',
      createdAt: now,
      createdLabel: 'À l’instant',
      media: [],
      comments: [
        { id: 'c-1', postId: 'post-x', authorId: DEMO_MEMBERS.thomas, author: thomas, content: 'À moi.', createdAt: now },
        { id: 'c-2', postId: 'post-x', authorId: DEMO_MEMBERS.camille, author: camille, content: 'À Camille.', createdAt: now },
      ],
      commentCount: 2,
      reactionCount: 0,
      liked: false,
      unreadComments: 0,
      mine: false,
        isNew: false,
    };
    const noop = () => {};

    // Carte : ni Modifier ni Supprimer sur le post d’autrui…
    renderWithProviders(
      <PostCard
        post={foreignPost}
        active={false}
        canDelete={false}
        canEdit={false}
        onSelect={noop}
        onToggleReaction={noop}
        onOpenComments={noop}
        onRequestDelete={noop}
        onSaveEdit={async () => true}
      />,
    );
    expect(screen.queryByRole('button', { name: /Modifier la publication/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer la publication/ })).not.toBeInTheDocument();
    // …mais la réaction et les commentaires restent offerts.
    expect(screen.getByRole('button', { name: 'Réagir à cette publication' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir les commentaires' })).toBeInTheDocument();

    // Fil : Thomas non-admin retouche et retire le sien, ne touche pas à celui de Camille.
    renderWithProviders(
      <CommentsDialog
        post={foreignPost}
        open
        currentMemberId={DEMO_MEMBERS.thomas}
        onOpenChange={noop}
        onSubmit={async () => true}
        onUpdateComment={async () => true}
        onDeleteComment={async () => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const ownRow = within(dialog).getByText('À moi.').closest('li') as HTMLElement;
    const otherRow = within(dialog).getByText('À Camille.').closest('li') as HTMLElement;
    expect(within(ownRow).getByRole('button', { name: 'Modifier ce commentaire' })).toBeInTheDocument();
    expect(within(ownRow).getByRole('button', { name: 'Supprimer ce commentaire' })).toBeInTheDocument();
    expect(within(otherRow).queryByRole('button', { name: 'Modifier ce commentaire' })).not.toBeInTheDocument();
    expect(within(otherRow).queryByRole('button', { name: 'Supprimer ce commentaire' })).not.toBeInTheDocument();
  });

  it('l’admin ne supprime ni ne retouche le commentaire d’autrui (D-07)', () => {
    const thomas = demoMembers.find((member) => member.id === DEMO_MEMBERS.thomas) ?? null;
    const camille = demoMembers.find((member) => member.id === DEMO_MEMBERS.camille) ?? null;
    const now = new Date().toISOString();
    const noop = () => {};
    renderWithProviders(
      <CommentsDialog
        post={{
          id: 'post-y',
          authorId: DEMO_MEMBERS.thomas,
          author: thomas,
          text: 'Fil modéré.',
          createdAt: now,
          createdLabel: 'À l’instant',
          media: [],
          comments: [
            { id: 'c-9', postId: 'post-y', authorId: DEMO_MEMBERS.camille, author: camille, content: 'À modérer.', createdAt: now },
          ],
          commentCount: 1,
          reactionCount: 0,
          liked: false,
          unreadComments: 0,
          mine: false,
        isNew: false,
        }}
        open
        currentMemberId={DEMO_MEMBERS.thomas}
        onOpenChange={noop}
        onSubmit={async () => true}
        onUpdateComment={async () => true}
        onDeleteComment={async () => {}}
      />,
    );
    const row = within(screen.getByRole('dialog')).getByText('À modérer.').closest('li') as HTMLElement;
    expect(within(row).queryByRole('button', { name: 'Modifier ce commentaire' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Supprimer ce commentaire' })).not.toBeInTheDocument();
  });

  it('l’adulte voit la suppression sur le commentaire d’un enfant géré quand la grille du hook est passée (D-12/WR-05)', () => {
    const camille = demoMembers.find((member) => member.id === DEMO_MEMBERS.camille) ?? null;
    const noe = demoMembers.find((member) => member.id === DEMO_MEMBERS.noe) ?? null;
    const now = new Date().toISOString();
    const noop = () => {};
    // Grille du hook (useCercleFeed.canDeleteComment) : un adulte modère le
    // contenu d'un enfant — les deux composants la reçoivent en prop.
    const grilleAdulte = (authorId: string) =>
      authorId === DEMO_MEMBERS.noe || authorId === DEMO_MEMBERS.camille;
    const postEnfant = {
      id: 'post-z',
      authorId: DEMO_MEMBERS.camille,
      author: camille,
      text: 'Fil avec une réplique d’enfant.',
      createdAt: now,
      createdLabel: 'À l’instant',
      media: [],
      comments: [
        { id: 'c-10', postId: 'post-z', authorId: DEMO_MEMBERS.noe, author: noe, content: 'Réplique d’enfant.', createdAt: now },
      ],
      commentCount: 1,
      reactionCount: 0,
      liked: false,
      unreadComments: 0,
      mine: true,
      isNew: false,
    } as FeedPost;

    // Carte : le bouton inline apparaît sur le commentaire de l'enfant…
    renderWithProviders(
      <PostCard
        post={postEnfant}
        active={false}
        canDelete
        canEdit
        currentMemberId={DEMO_MEMBERS.camille}
        canDeleteInline={(comment) => grilleAdulte(comment.authorId)}
        onSelect={noop}
        onToggleReaction={noop}
        onOpenComments={noop}
        onRequestDelete={noop}
        onSaveEdit={async () => true}
        onSubmitComment={async () => true}
        onUpdateComment={async () => true}
        onDeleteComment={async () => {}}
      />,
    );
    const ligneInline = screen.getByText('Réplique d’enfant.').closest('li') as HTMLElement;
    expect(within(ligneInline).getByRole('button', { name: 'Supprimer ce commentaire' })).toBeInTheDocument();
    // …mais pas l'édition, qui reste auteur-seul (D-07).
    expect(within(ligneInline).queryByRole('button', { name: 'Modifier ce commentaire' })).not.toBeInTheDocument();

    // Dialogue : même grille, même bouton sur le commentaire de l'enfant.
    renderWithProviders(
      <CommentsDialog
        post={postEnfant}
        open
        currentMemberId={DEMO_MEMBERS.camille}
        canDeleteComment={(comment) => grilleAdulte(comment.authorId)}
        onOpenChange={noop}
        onSubmit={async () => true}
        onUpdateComment={async () => true}
        onDeleteComment={async () => {}}
      />,
    );
    const ligneDialogue = within(screen.getByRole('dialog')).getByText('Réplique d’enfant.').closest('li') as HTMLElement;
    expect(within(ligneDialogue).getByRole('button', { name: 'Supprimer ce commentaire' })).toBeInTheDocument();
  });

  it('l’admin ne voit aucune suppression sur le contenu d’autrui, la sienne reste (D-07)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    // Camille, connectée et admin du foyer de démo : les deux publications
    // grainées sont celles de Lina et Thomas — aucune affordance de retrait.
    const cardLina = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest(
      'article',
    ) as HTMLElement;
    const cardThomas = (await screen.findByText(/J’ai retrouvé le numéro de la bibliothèque/, {}, { timeout: 5000 })).closest(
      'article',
    ) as HTMLElement;
    expect(within(cardLina).queryByRole('button', { name: /Supprimer la publication/ })).not.toBeInTheDocument();
    expect(within(cardThomas).queryByRole('button', { name: /Supprimer la publication/ })).not.toBeInTheDocument();

    // Dans la modale : le commentaire de Thomas n’offre rien à Camille (ni
    // Modifier ni Supprimer), le sien garde les deux — dont la suppression
    // confirmée par modale. Le levier admin restant vit dans Messages
    // (archivage du fil, figé sans détruire — prouvé intact côté base).
    await user.click(within(cardLina).getByRole('button', { name: 'Ouvrir les commentaires' }));
    const dialog = await screen.findByRole('dialog');
    const rowThomas = within(dialog).getByText('Je suis partant pour 16 h.').closest('li') as HTMLElement;
    const rowCamille = within(dialog).getByText('Parfait, je prépare le sac.').closest('li') as HTMLElement;
    expect(within(rowThomas).queryByRole('button', { name: 'Modifier ce commentaire' })).not.toBeInTheDocument();
    expect(within(rowThomas).queryByRole('button', { name: 'Supprimer ce commentaire' })).not.toBeInTheDocument();
    expect(within(rowCamille).getByRole('button', { name: 'Modifier ce commentaire' })).toBeInTheDocument();
    expect(within(rowCamille).getByRole('button', { name: 'Supprimer ce commentaire' })).toBeInTheDocument();
  });

  it('publie un texte long sous le plafond base et refuse au-delà', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<CerclePage />);

    expect(await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).toBeInTheDocument();

    // 800 caractères : au-delà de l’ancien 600, dans le CHECK base (4000).
    const withinDb = `a`.repeat(800);
    fireEvent.change(screen.getByLabelText(/Votre commentaire/), { target: { value: withinDb } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publier' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    await screen.findByText(withinDb);
    expect(container.querySelectorAll('article[data-post-id]')).toHaveLength(4);

    // 4001 caractères : la validation client reflète le CHECK et rien ne part.
    fireEvent.change(screen.getByLabelText(/Votre commentaire/), { target: { value: `b`.repeat(4001) } });
    await user.click(screen.getByRole('button', { name: 'Publier' }));
    expect(await screen.findByText('Le message est limité à 4000 caractères.')).toBeInTheDocument();
    expect(container.querySelectorAll('article[data-post-id]')).toHaveLength(4);
  });

  it('publie un commentaire long sous le plafond base et refuse au-delà', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Ouvrir les commentaires' }));
    const dialog = await screen.findByRole('dialog');

    // 600 caractères : au-delà de l’ancien 400, dans le CHECK base (2000).
    const withinDb = `c`.repeat(600);
    fireEvent.change(within(dialog).getByLabelText(/Répondre au foyer/), { target: { value: withinDb } });
    await user.click(within(dialog).getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(within(dialog).getByText(withinDb)).toBeInTheDocument());

    // 2001 caractères : la validation client reflète le CHECK et rien ne part.
    fireEvent.change(within(dialog).getByLabelText(/Répondre au foyer/), { target: { value: `d`.repeat(2001) } });
    await user.click(within(dialog).getByRole('button', { name: 'Publier' }));
    expect(await within(dialog).findByText('Le commentaire est limité à 2000 caractères.')).toBeInTheDocument();
  });

  it('répond en ligne sans ouvrir la modale et garde l’historique complet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CerclePage />);

    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    await user.type(within(card).getByLabelText(/Répondre à/), 'On apporte la nappe à carreaux.');
    await user.click(within(card).getByRole('button', { name: /Envoyer la réponse/ }));

    // Le commentaire apparaît en ligne, sans modale ouverte.
    await waitFor(() => expect(within(card).getByText('On apporte la nappe à carreaux.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Ouvrir les commentaires' })).toHaveTextContent('3 commentaires');
    // L’historique masqué devient accessible via le lien dédié.
    expect(within(card).getByText('Tous les commentaires (3)')).toBeInTheDocument();

    // Le dialogue complet garde l’historique, inline compris.
    await user.click(within(card).getByText('Tous les commentaires (3)'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('On apporte la nappe à carreaux.')).toBeInTheDocument();
    expect(within(dialog).getByText('Parfait, je prépare le sac.')).toBeInTheDocument();
    expect(within(dialog).getByText('Je suis partant pour 16 h.')).toBeInTheDocument();
  });

  it('ignore l’envoi inline vide sans rien changer', async () => {
    renderWithProviders(<CerclePage />);

    const card = (await screen.findByText(/Le soleil est enfin revenu/, {}, { timeout: 5000 })).closest('article') as HTMLElement;
    const reply = within(card).getByLabelText(/Répondre à/) as HTMLInputElement;
    expect(reply).toHaveValue('');
    fireEvent.submit(reply.closest('form') as HTMLFormElement);

    // Rien ne part : ni modale, ni commentaire, ni compteur modifié.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Ouvrir les commentaires' })).toHaveTextContent('2 commentaires');
    expect(within(card).queryByText(/Tous les commentaires/)).not.toBeInTheDocument();
  });

  it('montre les N derniers commentaires en ligne avec les affordances d’auteur', async () => {
    const user = userEvent.setup();
    const camille = demoMembers.find((member) => member.id === DEMO_MEMBERS.camille) ?? null;
    const thomas = demoMembers.find((member) => member.id === DEMO_MEMBERS.thomas) ?? null;
    const now = new Date().toISOString();
    const noop = () => {};
    const sent: { postId: string; content: string }[] = [];
    const opened: string[] = [];
    const inlinePost: FeedPost = {
      id: 'post-inline',
      authorId: DEMO_MEMBERS.thomas,
      author: thomas,
      text: 'Fil inline.',
      createdAt: now,
      createdLabel: 'À l’instant',
      media: [],
      comments: [
        { id: 'c-old', postId: 'post-inline', authorId: DEMO_MEMBERS.thomas, author: thomas, content: 'Premier, masqué.', createdAt: now },
        { id: 'c-mid', postId: 'post-inline', authorId: DEMO_MEMBERS.thomas, author: thomas, content: 'Deuxième de Thomas.', createdAt: now },
        { id: 'c-own', postId: 'post-inline', authorId: DEMO_MEMBERS.camille, author: camille, content: 'Réponse de Camille.', createdAt: now },
      ],
      commentCount: 3,
      reactionCount: 0,
      liked: false,
      unreadComments: 0,
      mine: false,
        isNew: false,
    };
    renderWithProviders(
      <PostCard
        post={inlinePost}
        active={false}
        canDelete={false}
        canEdit={false}
        currentMemberId={DEMO_MEMBERS.camille}
        onSubmitComment={async (input) => {
          sent.push(input);
          return true;
        }}
        onUpdateComment={async () => true}
        onDeleteComment={async () => {}}
        onSelect={noop}
        onToggleReaction={noop}
        onOpenComments={() => {
          opened.push(inlinePost.id);
        }}
        onRequestDelete={noop}
        onSaveEdit={async () => true}
      />,
    );

    // Seuls les 2 derniers sont visibles en ligne, l’historique passe par le lien.
    expect(screen.queryByText('Premier, masqué.')).not.toBeInTheDocument();
    expect(screen.getByText('Deuxième de Thomas.')).toBeInTheDocument();
    expect(screen.getByText('Réponse de Camille.')).toBeInTheDocument();
    expect(screen.getByText('Tous les commentaires (3)')).toBeInTheDocument();

    // Affordances d’auteur intactes : Camille retouche et retire le sien, pas celui de Thomas.
    const ownRow = screen.getByText('Réponse de Camille.').closest('li') as HTMLElement;
    const otherRow = screen.getByText('Deuxième de Thomas.').closest('li') as HTMLElement;
    expect(within(ownRow).getByRole('button', { name: 'Modifier ce commentaire' })).toBeInTheDocument();
    expect(within(ownRow).getByRole('button', { name: 'Supprimer ce commentaire' })).toBeInTheDocument();
    expect(within(otherRow).queryByRole('button', { name: 'Modifier ce commentaire' })).not.toBeInTheDocument();
    expect(within(otherRow).queryByRole('button', { name: 'Supprimer ce commentaire' })).not.toBeInTheDocument();

    // Le lien ouvre le dialogue existant, inchangé.
    await user.click(screen.getByText('Tous les commentaires (3)'));
    expect(opened).toEqual(['post-inline']);

    // Le compositeur inline envoie par le verbe partagé.
    await user.type(screen.getByLabelText(/Répondre à/), 'Bien reçu !');
    await user.click(screen.getByRole('button', { name: /Envoyer la réponse/ }));
    await waitFor(() => expect(sent).toEqual([{ postId: 'post-inline', content: 'Bien reçu !' }]));
  });
});

/**
 * D-01, WR-08 — la colonne porte le CHEMIN, l'URL se forge à la lecture. Un
 * chemin non résolu (signature refusée) laisse l'image absente : le DOM ne
 * reçoit jamais le chemin brut ni un `src="null"`. L'aperçu optimiste (`blob:`)
 * n'est pas un chemin, donc il traverse la lecture tel quel — c'est ce qui garde
 * la publication instantanée.
 */
describe('Cercle — média en chemin, URL signée à la lecture (D-01, WR-08)', () => {
  beforeEach(() => {
    resolveMock.mockReset();
    resolveMock.mockImplementation(async (rows: { id: string }[]) => signEveryRow(rows));
    removeFileMock.mockReset().mockResolvedValue(undefined);
  });

  it('affiche l’URL signée forgée depuis le chemin, jamais le chemin brut', async () => {
    await seedPostWithMedia('post-resolu', 'hh-1/posts/post-resolu/photo.webp');
    const { container } = renderWithProviders(<CerclePage />);

    await screen.findByText('Média post-resolu', {}, { timeout: 5000 });

    await waitFor(() =>
      expect(mediaImageOf(container, 'post-resolu')?.getAttribute('src')).toBe(
        'https://signe.example/post-resolu-media',
      ),
    );
    // Le chemin du bucket n'est jamais écrit dans le DOM.
    expect(container.innerHTML).not.toContain('hh-1/posts/post-resolu/photo.webp');
  });

  it('laisse l’image absente quand la signature échoue (échec fermé)', async () => {
    resolveMock.mockImplementation(async () => ({}));
    await seedPostWithMedia('post-echec', 'hh-1/posts/post-echec/photo.webp');
    const { container } = renderWithProviders(<CerclePage />);

    await screen.findByText('Média post-echec', {}, { timeout: 5000 });

    await waitFor(() => expect(mediaImageOf(container, 'post-echec')).toBeNull());
    // Ni chemin brut, ni lien mort : la carte reste, l'image simplement manque.
    expect(container.innerHTML).not.toContain('hh-1/posts/post-echec/photo.webp');
    expect(container.innerHTML).not.toContain('src="null"');
  });

  it('affiche tel quel l’aperçu `blob:` d’une publication optimiste, sans le re-signer', async () => {
    await seedPostWithMedia('post-apercu', 'blob:apercu-optimiste');
    const { container } = renderWithProviders(<CerclePage />);

    await screen.findByText('Média post-apercu', {}, { timeout: 5000 });

    await waitFor(() =>
      expect(mediaImageOf(container, 'post-apercu')?.getAttribute('src')).toBe('blob:apercu-optimiste'),
    );
    // Un aperçu local n'est pas un objet de bucket : rien à signer pour lui.
    expect(resolveMock).not.toHaveBeenCalledWith([
      { id: 'post-apercu-media', file_url: 'blob:apercu-optimiste' },
    ]);
  });

  it('supprime la publication en retirant du bucket l’objet de son média', async () => {
    const user = userEvent.setup();
    await seedPostWithMedia('post-suppr', 'hh-1/posts/post-suppr/photo.webp');
    const { container } = renderWithProviders(<CerclePage />);

    const card = (await screen.findByText('Média post-suppr', {}, { timeout: 5000 })).closest(
      'article',
    ) as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /Supprimer la publication de Camille Martin/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(removeFileMock).toHaveBeenCalledWith('hh-1/posts/post-suppr/photo.webp'));
    expect(await screen.findByText('Publication supprimée.')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('article[data-post-id="post-suppr"]')).toBeNull());
  });
});
