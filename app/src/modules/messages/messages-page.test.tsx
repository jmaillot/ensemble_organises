import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessagesPage from './messages-page';

describe('Messages', () => {
  it('ouvre la conversation de Lina et y ajoute un message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);

    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    expect(within(log).getByText('Tu as vu le nouveau parc ?')).toBeInTheDocument();
    expect(within(log).getByText('Pas encore, tu me donneras l’adresse ?')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Écrire un message'), 'Je passe ce soir avec les pizzas');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    // L'envoi est optimiste puis confirmé par une relecture : le fil peut être
    // remplacé pendant la requête, on réévalue le journal à chaque tour.
    await waitFor(
      () => {
        expect(within(screen.getByRole('log')).getByText('Je passe ce soir avec les pizzas')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    // Le champ se vide dès l'envoi ; la confirmation arrive ensuite.
    await waitFor(() => expect(screen.getByLabelText('Écrire un message')).toHaveValue(''), { timeout: 4000 });
  });

  it('affiche toutes les bulles en fond clair, texte sombre', async () => {
    // Écriture sombre sur fond blanc des deux côtés : seul l'alignement
    // distingue envoyés et reçus. RTL ne voit pas les contrastes : on
    // verrouille l'absence de tout fond sombre dans le fil.
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);
    const log = await screen.findByRole('log', { name: /Messages de Lina/ });

    const received = within(log).getByText('Tu as vu le nouveau parc ?').closest('div');
    expect(received?.className).toMatch(/bg-surface/);

    await user.type(screen.getByLabelText('Écrire un message'), 'Je passe ce soir');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));
    // La bulle optimiste est remplacée par la confirmée au retour du réseau :
    // on réévalue depuis le journal à chaque tour, jamais sur un nœud périmé.
    await waitFor(() => {
      const text = within(log).getByText('Je passe ce soir');
      const current = text.closest('div');
      expect(current?.className).toMatch(/bg-surface/);
      expect(within(current as HTMLElement).getByText('Camille Martin :')).toBeInTheDocument();
    });
    expect(log.querySelectorAll('.bg-fg').length).toBe(0);
  });

  it('expose la conversation active et le fil de discussion de façon accessible', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    const lina = await screen.findByRole('button', { name: /^Lina/ });
    await user.click(lina);
    expect(lina).toHaveAttribute('aria-current', 'true');

    const log = screen.getByRole('log', { name: /Messages de Lina/ });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText('Écrire un message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeInTheDocument();
  });

  it('crée un échange privé avec un membre et le sélectionne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await user.click(screen.getByRole('button', { name: 'Nouveau message' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Thomas Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le direct avec Thomas apparaît dans la liste et devient actif.
    expect(await screen.findByRole('log', { name: 'Messages de Thomas' })).toBeInTheDocument();
  });

  it('exige un titre pour un groupe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);
    await screen.findByRole('button', { name: /^Lina/ });

    await user.click(screen.getByRole('button', { name: 'Nouveau message' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Groupe' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Thomas Martin' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Inviter Lina Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));

    expect(await within(dialog).findByText('Un groupe exige un titre.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Titre du groupe/), 'Projet cabane');
    await user.click(within(dialog).getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('log', { name: 'Messages de Projet cabane' })).toBeInTheDocument();
  });

  it('fait entrer un membre manquant, enfant compris', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    await user.click(await screen.findByRole('button', { name: /Ajouter un membre/ }));
    const dialog = await screen.findByRole('dialog');
    // Noé est enfant : il converse comme les autres, y compris ici.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Ajouter Noé Martin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('joint une image au message et l’affiche dans le fil', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:testapercu',
      revokeObjectURL: () => undefined,
    });
    renderWithProviders(<MessagesPage />);

    await user.click(await screen.findByRole('button', { name: /^Lina/ }));
    const file = new File(['pixels'], 'parc.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Joindre une image', { selector: 'input' }), file);
    expect(await screen.findByText(/parc\.png/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Écrire un message'), 'La photo du parc');
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    const log = await screen.findByRole('log', { name: /Messages de Lina/ });
    await waitFor(() => expect(within(log).getByText('La photo du parc')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(log).getByRole('link', { name: /Ouvrir l’image/ })).toBeInTheDocument();
  });
});
