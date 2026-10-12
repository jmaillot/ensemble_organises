import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_HOUSEHOLD_ID, DEMO_MEMBERS } from '@/lib/data/seed';
import { addDays, formatMediumDate, todayIso } from '@/lib/utils';
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

  it('affiche la pièce jointe de démonstration sous le carnet de santé', async () => {
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    expect(await screen.findByRole('heading', { name: 'Pièces jointes' })).toBeInTheDocument();
    expect(screen.getByText('Ordonnance — Nala.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText(/Joindre des fichiers/)).toBeInTheDocument();
  });

  it('propose de choisir une photo locale dans le dialogue de fiche', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    await user.click(screen.getByRole('button', { name: 'Modifier la fiche' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Choisir une photo/)).toBeInTheDocument();
  });

  it('lit les notes et le rappel de la fiche depuis ses colonnes', async () => {
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('tabpanel');
    // Notes ensemencées sur `pets.notes`, pas dans une ligne du carnet.
    expect(screen.getByText(/Suivie chez le vétérinaire du quartier/)).toBeInTheDocument();
    // Rappel ensemencé sur `pets.next_reminder_date`, affiché tel quel.
    const fact = screen.getByText('Prochain rappel').closest('div');
    expect(fact).toHaveTextContent(formatMediumDate(addDays(todayIso(), 13)));
  });

  it('masque les trois suppressions aux non-administrateurs, sans erreur', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    renderWithProviders(<AnimauxPage />, { route: '/animaux', withHousehold: false });

    await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    // Fiche, suivi, pièces : aucun affordance de suppression.
    expect(screen.queryByRole('button', { name: 'Supprimer la fiche' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer le suivi/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer Ordonnance/ })).not.toBeInTheDocument();
    // Lecture et modification restent offertes : seul le delete est admin-only.
    expect(screen.getByRole('button', { name: 'Modifier la fiche' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Modifier le suivi/ }).length).toBeGreaterThan(0);
  });

  it('modifie un suivi via le dialogue, et annule sans effet', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    const editName = 'Modifier le suivi Rappel annuel — rage';

    // Annulation : le dialogue se ferme, la ligne est intacte.
    await user.click(screen.getByRole('button', { name: editName }));
    const cancelDialog = await screen.findByRole('dialog', { name: 'Modifier ce suivi' });
    await user.click(within(cancelDialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Rappel annuel — rage')).toBeInTheDocument();

    // Enregistrement : la ligne porte le nouveau nom dans la chronologie…
    await user.click(screen.getByRole('button', { name: editName }));
    const editDialog = await screen.findByRole('dialog', { name: 'Modifier ce suivi' });
    const nameField = within(editDialog).getByLabelText(/Nom du suivi/);
    await user.clear(nameField);
    await user.type(nameField, 'Rappel annuel — rage (revu)');
    await user.click(within(editDialog).getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const timeline = await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    expect(await within(timeline).findByText('Rappel annuel — rage (revu)')).toBeInTheDocument();
    // …et dans l'onglet correspondant.
    await user.click(screen.getByRole('tab', { name: 'Vaccins' }));
    expect(within(screen.getByRole('tabpanel')).getByText('Rappel annuel — rage (revu)')).toBeInTheDocument();
  });

  it('fait apparaître un suivi créé ailleurs sans rechargement manuel', async () => {
    // Couture temps réel : l'écriture émet sur l'adaptateur, `usePetRecords`
    // s'y est abonné (publication 0110 côté serveur) et ré-invalide sa
    // requête — aucun `refetch` manuel dans ce test.
    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    expect(screen.queryByText('Relevé realtime')).not.toBeInTheDocument();

    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    await getLocalAdapter().create('pet_records', {
      pet_id: 'pet-1',
      household_id: DEMO_HOUSEHOLD_ID,
      type: 'vaccin',
      name: 'Relevé realtime',
      record_date: todayIso(),
      next_due_date: null,
      notes: null,
    });

    expect(await screen.findByText('Relevé realtime')).toBeInTheDocument();
  });

  it('exclut la ligne magique résiduelle des comptes et de la chronologie', async () => {
    // Une base locale ancienne peut encore porter une ex-ligne magique : elle
    // est filtrée à la lecture (comptes, chronologie), jamais écrite, pendant
    // que la fiche lit ses colonnes.
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    await getLocalAdapter().create('pet_records', {
      pet_id: 'pet-1',
      household_id: DEMO_HOUSEHOLD_ID,
      type: 'info',
      name: 'Informations de la fiche',
      record_date: '2026-01-05',
      next_due_date: '2026-02-05',
      notes: 'Contenu magique résiduel',
    });

    renderWithProviders(<AnimauxPage />, { route: '/animaux' });

    const timeline = await screen.findByRole('list', { name: 'Historique des suivis de santé' });
    // Les 4 vrais suivis de démo, pas 5 : la ligne magique ne compte pas.
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('Contenu magique résiduel')).not.toBeInTheDocument();
    // Et la fiche lit ses colonnes, pas la ligne : notes ensemencées visibles.
    expect(screen.getByText(/Suivie chez le vétérinaire du quartier/)).toBeInTheDocument();
  });
});
