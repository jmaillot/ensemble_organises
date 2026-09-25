import { describe, expect, it } from 'vitest';
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
});
