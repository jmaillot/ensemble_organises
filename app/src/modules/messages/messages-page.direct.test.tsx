import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessagesPage from './messages-page';

/**
 * D-04 côté UI : un tap sur un membre du picker « À qui écrire ? » démarre ou
 * rouvre la directe immédiatement, sans bouton « créer » intermédiaire. Le
 * second tap rouvre le fil existant (D-05 : le RPC le garantit côté serveur,
 * le mode démo rejoue la même sémantique localement).
 */

// L'implémentation réelle reste branchée : seuls les tests d'échec/pending
// dévient, en rebranchant `openDirectConversation` à la volée.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, openDirectConversation: vi.fn(actual.openDirectConversation) };
});


const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Démarrer une conversation' }));
  await screen.findByRole('dialog', { name: 'À qui écrire ?' });
};

describe('Member-picker « À qui écrire ? »', () => {
  beforeEach(() => {
    // La migration D-03 ne doit pas interférer : ces tests portent sur le
    // démarrage de directe, pas sur les accusés.
    localStorage.clear();
  });

  it('un tap sur un membre démarre la directe et la sélectionne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Écrire à Noé Martin' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le fil ouvert est celui de Noé, créé par le tap — pas par un formulaire.
    expect(await screen.findByRole('log', { name: 'Messages de Noé' })).toBeInTheDocument();
    // Un seul fil avec Noé : le démarrage n'a pas doublonné la liste.
    expect(screen.getAllByRole('button', { name: /^Noé/ })).toHaveLength(1);
  });

  it('le second tap sur le même membre rouvre le fil existant, sans doublon', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Écrire à Noé Martin' }));
    expect(await screen.findByRole('log', { name: 'Messages de Noé' })).toBeInTheDocument();

    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Écrire à Noé Martin' }));
    expect(await screen.findByRole('log', { name: 'Messages de Noé' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Noé/ })).toHaveLength(1);
  });

  it('un échec du démarrage affiche le toast contractuel et reste rejouable', async () => {
    const { openDirectConversation } = await import('./api');
    vi.mocked(openDirectConversation).mockRejectedValueOnce(new Error(''));
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await openPicker(user);
    await user.click(screen.getByRole('button', { name: 'Écrire à Noé Martin' }));

    // Toast contractuel (UI-SPEC) : le message serveur lisible prime, le
    // repli sans message est ce libellé.
    expect(await screen.findByText('Impossible d’ouvrir la conversation. Réessayez.')).toBeInTheDocument();

    // Rejouable : le second tap repart de zéro (spinner retiré, ligne active).
    const picker = screen.getByRole('dialog', { name: 'À qui écrire ?' });
    const line = within(picker).getByRole('button', { name: 'Écrire à Noé Martin' });
    expect(line).toBeEnabled();
    vi.mocked(openDirectConversation).mockRejectedValueOnce(new Error('cette personne n’appartient pas à votre foyer'));
    await user.click(line);
    expect(await screen.findByText('cette personne n’appartient pas à votre foyer')).toBeInTheDocument();
  });

  it('le tap en cours désactive la ligne membre, libellé inchangé', async () => {
    const { openDirectConversation } = await import('./api');
    let release: ((value: { id: string; created: boolean }) => void) | undefined;
    vi.mocked(openDirectConversation).mockImplementationOnce(
      () =>
        new Promise<{ id: string; created: boolean }>((resolve) => {
          release = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await openPicker(user);
    const line = screen.getByRole('button', { name: 'Écrire à Noé Martin' });
    await user.click(line);

    // Double-tap protégé : la ligne est désactivée pendant l'appel, le
    // libellé reste « Écrire à Noé Martin » (jamais un « Connexion… »).
    expect(screen.getByRole('button', { name: 'Écrire à Noé Martin' })).toBeDisabled();
    release?.({ id: 'conversation-noe', created: true });    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('la ligne d’appel n’est jamais proposée dans le picker', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await openPicker(user);
    const picker = screen.getByRole('dialog', { name: 'À qui écrire ?' });
    expect(within(picker).queryByRole('button', { name: 'Écrire à Camille Martin' })).not.toBeInTheDocument();
    expect(within(picker).getByRole('button', { name: 'Écrire à Lina Martin' })).toBeInTheDocument();
  });
});
