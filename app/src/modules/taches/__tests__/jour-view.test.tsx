import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TachesJourPage from '../taches-jour-page';
import { renderWithProviders } from '@/test/render';

/**
 * Le harnais `renderWithProviders` rend le composant HORS `Routes` : une
 * navigation réelle ne monterait jamais `/taches`. Le retour (D-03) est donc
 * prouvé au niveau du geste — `navigate('/taches')` appelé — et non du rendu
 * de la page cible.
 */
const navigateMock = vi.fn();
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useNavigate: () => navigateMock,
}));
afterEach(() => navigateMock.mockClear());

/**
 * Vue « Tâches du jour » (D-02/D-03/D-04) — route /taches/jour, cible du
 * raccourci manifest. Le filtre D-02 est éprouvé via le RENDU (comportement),
 * pas en relisant la fonction : aujourd'hui + retards, jamais les faites ni
 * les futures, retards triés en tête par `sortTasks`.
 */

const LIST_NAME = 'Tâches du jour';

async function findJourList() {
  return within(await screen.findByRole('list', { name: LIST_NAME }));
}

describe('TachesJourPage', () => {
  it('affiche les tâches dues aujourd’hui et les retards, retards en tête, sans les faites ni les futures', async () => {
    renderWithProviders(<TachesJourPage />, { route: '/taches/jour' });

    const list = await findJourList();
    // Retard (échéance d'hier) épinglé en tête par `sortTasks`.
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('Choisir le menu du week-end');
    // Échéance du jour : présente.
    expect(list.getByText('Valider les rendez-vous du carnet')).toBeInTheDocument();
    // Échéance future (demain) : absente.
    expect(list.queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
    // Tâche faite : absente, même avec une échéance atteinte.
    expect(list.queryByText('Ranger les photos de l’été')).not.toBeInTheDocument();
  });

  it('coche une tâche : elle quitte la vue du jour (statut passé à fait)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesJourPage />, { route: '/taches/jour' });

    const list = await findJourList();
    await user.click(list.getByRole('checkbox', { name: 'Terminer Valider les rendez-vous du carnet' }));

    // Mise à jour optimiste : une tâche faite n'est plus « du jour ».
    await waitFor(() =>
      expect(screen.queryByText('Valider les rendez-vous du carnet')).not.toBeInTheDocument(),
    );
  });

  it('porte les assignés avec leur code couleur (color_tag, D-04)', async () => {
    renderWithProviders(<TachesJourPage />, { route: '/taches/jour' });

    const list = await findJourList();
    const item = list.getByText('Choisir le menu du week-end').closest<HTMLElement>('[role="listitem"]')!;
    // Thomas Martin, color_tag « ink » → l'avatar porte la classe profonde
    // associée, comme partout où les assignés passent par `useTaches`.
    const avatar = within(item).getByTitle('Thomas Martin');
    expect(avatar).toHaveClass('bg-fg');
  });

  it('le bouton retour ramène vers la liste complète /taches', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesJourPage />, { route: '/taches/jour' });

    await findJourList();
    await user.click(screen.getByRole('button', { name: 'Retour aux tâches' }));
    expect(navigateMock).toHaveBeenCalledWith('/taches');

    await user.click(screen.getByRole('button', { name: 'Voir toutes les tâches' }));
    expect(navigateMock).toHaveBeenCalledWith('/taches');
  });
});
