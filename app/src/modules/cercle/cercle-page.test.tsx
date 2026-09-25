import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { data } from '@/lib/data';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import type { PostCommentRow } from '@/types';
import CerclePage from './cercle-page';

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

    // Le fil garde ses deux publications d’origine, le compteur global suit.
    expect(container.querySelectorAll('article[data-post-id]')).toHaveLength(2);
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
});
