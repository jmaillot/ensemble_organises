import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TachesPage from './taches-page';
import { renderWithProviders } from '@/test/render';

/**
 * jsdom n'implémente ni `scrollIntoView` (ouverture d'un dialogue Radix) ni
 * `ResizeObserver` (mesure des cases à cocher Radix).
 */
function supportDialogEnvironment() {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {
      return undefined;
    };
  }
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    } as unknown as typeof ResizeObserver;
  }
}

const LIST_NAME = 'Tâches du foyer';

/** La liste du panneau « Vos prochaines tâches », hors panneau des rappels. */
function taskList() {
  return within(screen.getByRole('list', { name: LIST_NAME }));
}

/** Même liste, avec attente : le contenu de fond est masqué tant qu'un dialogue est ouvert. */
async function findTaskList() {
  return within(await screen.findByRole('list', { name: LIST_NAME }));
}

describe('TachesPage', () => {
  it('affiche les tâches du foyer, les retards en tête', async () => {
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    const list = taskList();
    // Filtre « À faire par échéance » : la tâche terminée n'est pas listée.
    expect(list.queryByText('Ranger les photos de l’été')).not.toBeInTheDocument();
    // Échéance d'hier : le retard est annoncé et la tâche remonte en tête.
    expect(list.getByText('En retard de 1 j')).toBeInTheDocument();
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('Choisir le menu du week-end');
    expect(list.getByRole('button', { name: 'Réordonner : Choisir le menu du week-end' })).toBeInTheDocument();
  });

  it('coche une tâche puis filtre sur les tâches terminées', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(taskList().getByRole('checkbox', { name: 'Terminer Valider les rendez-vous du carnet' }));

    // Mise à jour optimiste : la tâche quitte la liste des tâches à faire.
    expect(taskList().queryByText('Valider les rendez-vous du carnet')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrer les tâches'), 'terminees');

    expect(await (await findTaskList()).findByText('Valider les rendez-vous du carnet')).toBeInTheDocument();
    expect(taskList().getByText('Ranger les photos de l’été')).toBeInTheDocument();
    expect(taskList().queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
    expect(taskList().getByRole('checkbox', { name: 'Rouvrir Valider les rendez-vous du carnet' })).toBeChecked();
  });

  it('ajoute une tâche depuis le dialogue', async () => {
    supportDialogEnvironment();
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));

    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));
    expect(await dialog.findByText('Indiquez ce qu’il reste à faire.')).toBeInTheDocument();

    // Le membre courant est assigné par défaut.
    expect(dialog.getByRole('checkbox', { name: 'Assigner à Camille Martin' })).toBeChecked();

    await user.type(dialog.getByLabelText(/Nom de la tâche/), 'Réserver la table du restaurant');
    await user.selectOptions(dialog.getByLabelText(/Priorité/), 'haute');
    await user.click(dialog.getByRole('checkbox', { name: 'Assigner à Thomas Martin' }));
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));

    expect(await (await findTaskList()).findByText('Réserver la table du restaurant')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Le foyer compte désormais une tâche de plus.
    expect(screen.getByText('dans la liste').previousElementSibling).toHaveTextContent('5');
  });
});
