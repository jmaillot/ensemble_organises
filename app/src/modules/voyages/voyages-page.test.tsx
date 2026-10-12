import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, seedHouseholdStore } from '@/test/render';
import { useHouseholdStore } from '@/stores/household-store';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import VoyagesPage from './voyages-page';
import { isServableCoverUrl } from './voyages-page';

describe('Voyages', () => {
  it('met en avant le voyage de démonstration avec sa destination et ses dates', async () => {
    renderWithProviders(<VoyagesPage />);

    // Le héros affiche la destination puis la période, comme dans l’export.
    const hero = await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    expect(hero).toBeInTheDocument();
    expect(screen.getByText(/Prochain voyage · Confirmé/)).toBeInTheDocument();
    // La période apparaît dans le héros puis dans l’indicateur « jours sur place ».
    expect(screen.getAllByText(/12 — 18 avril 2027/)).toHaveLength(2);
    // Les indicateurs : jours sur place, tâches et membres nommés à l'échelle du foyer.
    expect(screen.getByText('jours sur place').previousSibling).toHaveTextContent('6');
    expect(screen.getByText('tâches du foyer à préparer').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('membres du foyer').previousSibling).toHaveTextContent('5');
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

  it('masque les suppressions aux non-administrateurs, sans les remplacer par une erreur', async () => {
    seedHouseholdStore();
    useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    renderWithProviders(<VoyagesPage />, { withHousehold: false });

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    // Aucun affordance de suppression : ni sur le héros, ni ailleurs.
    expect(screen.queryByRole('button', { name: 'Supprimer ce voyage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer le voyage/ })).not.toBeInTheDocument();
    // La modification reste offerte : seul le delete est admin-only.
    expect(screen.getByRole('button', { name: 'Modifier ce voyage' })).toBeInTheDocument();
  });

  it('ne propose plus de statut et exige les dates comme la base', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VoyagesPage />);

    await screen.findByRole('heading', { level: 2, name: 'Lisbonne' });
    await user.click(screen.getAllByRole('button', { name: 'Créer un voyage' })[0]);

    const dialog = await screen.findByRole('dialog');
    // Le sélecteur mort a disparu du formulaire…
    expect(within(dialog).queryByLabelText(/Statut/)).not.toBeInTheDocument();

    // …et un envoi sans dates est refuse, comme le NOT NULL de `trips`.
    await user.click(within(dialog).getByRole('button', { name: 'Créer le voyage' }));
    expect(await within(dialog).findByText('Indiquez la date de départ.')).toBeInTheDocument();
    expect(within(dialog).getByText('Indiquez la date de retour.')).toBeInTheDocument();
    expect(screen.queryByText('Copenhague')).not.toBeInTheDocument();
  });

  it('ne rend aucune image de héros quand la couverture est invalide', async () => {
    const { getLocalAdapter } = await import('@/lib/data/local-adapter');
    await getLocalAdapter().update('trips', 'trip-1', { cover_photo: 'ftp://exemple.fr/x.jpg' } as never);
    renderWithProviders(<VoyagesPage />);

    const hero = await screen.findByRole('region', { name: 'Voyage vers Lisbonne' });
    // Échec fermé : pas d'image, jamais d'erreur — le titre reste lisible.
    expect((hero as HTMLElement).style.backgroundImage).toBe('');
    expect(screen.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeInTheDocument();
  });

  it('laisse passer les couvertures http(s) et premier parti', () => {
    expect(isServableCoverUrl('https://exemple.fr/lisbonne.jpg')).toBe(true);
    expect(isServableCoverUrl('/assets/lisbonne.jpg')).toBe(true);
    expect(isServableCoverUrl('ftp://exemple.fr/x.jpg')).toBe(false);
    expect(isServableCoverUrl('javascript:alert(1)')).toBe(false);
    expect(isServableCoverUrl('')).toBe(false);
    expect(isServableCoverUrl(null)).toBe(false);
  });
});
