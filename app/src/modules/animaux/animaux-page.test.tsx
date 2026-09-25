import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import AnimauxPage from './animaux-page';

describe('AnimauxPage', () => {
  it('n’affiche que les vaccins dans l’onglet Vaccins', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    // Onglet ouvert par défaut : les produits du foyer Martin, pas les vaccins.
    const produits = await screen.findByRole('tabpanel');
    expect(await within(produits).findByText('Alimentation — croquettes XL')).toBeInTheDocument();
    expect(within(produits).queryByText('Rappel annuel — rage')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Vaccins' }));

    const vaccins = screen.getByRole('tabpanel');
    expect(within(vaccins).getByText('Rappel annuel — rage')).toBeInTheDocument();
    expect(within(vaccins).queryByText('Alimentation — croquettes XL')).not.toBeInTheDocument();
    expect(within(vaccins).queryByText('Antiparasitaire')).not.toBeInTheDocument();
  });

  it('ajoute un suivi via le dialogue et le retrouve dans le carnet de santé', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un suivi' })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un suivi' });
    await user.selectOptions(within(dialog).getByLabelText(/Type de suivi/), 'traitement');
    await user.type(within(dialog).getByLabelText(/Nom du suivi/), 'Comprimé antiparasitaire');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));

    const timeline = await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    expect(await within(timeline).findByText('Comprimé antiparasitaire')).toBeInTheDocument();
    // Le suivi créé apparaît aussi dans l'onglet correspondant.
    await user.click(screen.getByRole('tab', { name: 'Traitements' }));
    expect(within(screen.getByRole('tabpanel')).getByText('Comprimé antiparasitaire')).toBeInTheDocument();
  });

  it('refuse une échéance antérieure à la date du suivi', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter un suivi' })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Ajouter un suivi' });
    await user.type(within(dialog).getByLabelText(/Nom du suivi/), 'Rappel à tester');
    await user.clear(within(dialog).getByLabelText(/Date du suivi/));
    await user.type(within(dialog).getByLabelText(/Date du suivi/), '2026-10-01');
    await user.type(within(dialog).getByLabelText(/Prochaine échéance/), '2026-09-30');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le suivi' }));

    expect(await within(dialog).findByText('La prochaine échéance doit suivre la date du suivi.')).toBeInTheDocument();
  });
});
