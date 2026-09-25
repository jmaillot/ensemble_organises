import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import VoyagesPage from './voyages-page';

describe('Voyages', () => {
  it('met en avant le voyage de démonstration avec sa destination et ses dates', async () => {
    renderWithProviders(<VoyagesPage />);

    // Le héros affiche la destination puis la période, comme dans l’export.
    const hero = await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    expect(hero).toBeInTheDocument();
    expect(screen.getByText(/Prochain voyage · Confirmé/)).toBeInTheDocument();
    // La période apparaît dans le héros puis dans l’indicateur « jours sur place ».
    expect(screen.getAllByText(/12 — 18 avril 2027/)).toHaveLength(2);
    // Les indicateurs : jours sur place, éléments à préparer, membres invités.
    expect(screen.getByText('jours sur place').previousSibling).toHaveTextContent('6');
    expect(screen.getByText('éléments à préparer').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('membres invités').previousSibling).toHaveTextContent('5');
  });

  it('crée un voyage depuis le dialogue et le fait apparaître', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/Nom du voyage/), 'Séjour à Copenhague');
    await user.type(screen.getByLabelText(/Destination/), 'Copenhague');
    await user.type(screen.getByLabelText(/Départ/), '2027-09-10');
    await user.type(screen.getByLabelText(/Retour/), '2027-09-16');
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));

    // Le dialogue se ferme et le nouveau voyage rejoint la liste des autres voyages.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Copenhague')).toBeInTheDocument();
    expect(screen.getByText('10 — 16 septembre 2027')).toBeInTheDocument();
    // Le héros reste sur le voyage à venir le plus proche.
    expect(screen.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeInTheDocument();
  });
});
