import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import CalendrierPage from './calendrier-page';
import { addDays, daysBetween, formatLongDate, formatMonthLabel, todayIso, toIsoDate } from '@/lib/utils';
import type { UserEvent } from '@testing-library/user-event';

// jsdom n'implémente pas ResizeObserver, utilisé par les primitives Radix
// (Dialog, AlertDialog). Le stub mériterait d'être mutualisé dans
// `src/test/setup.ts`, hors périmètre de ce module.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: ResizeObserverStub });
}

const today = todayIso();
const year = Number(today.slice(0, 4));
const month = Number(today.slice(5, 7)) - 1;

/** Jours occupés par le jeu de démonstration (événements + anniversaires). */
const busyDays = [0, 2, 4]
  .map((offset) => addDays(today, offset))
  .concat([
    `${today.slice(0, 4)}-07-10`,
    `${today.slice(0, 4)}-19-10`,
    `${today.slice(0, 4)}-03-11`,
    `${today.slice(0, 4)}-29-09`,
  ]);

/** Jour libre le plus proche, toujours dans le mois affiché par la grille. */
const freeDay = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) =>
  toIsoDate(new Date(year, month, index + 1)),
)
  .filter((iso) => !busyDays.includes(iso))
  .sort((a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b)))[0];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Les cases du calendrier portent un libellé capitalisé. */
const dayLabel = (iso: string) => {
  const label = formatLongDate(iso);
  return escape(`${label[0].toUpperCase()}${label.slice(1)}`);
};

/** Clique sur une case de la grille, en changeant de mois si nécessaire. */
const selectDay = async (user: UserEvent, iso: string) => {
  const button = () => screen.queryByRole('button', { name: new RegExp(`^${dayLabel(iso)}`) });
  if (!button()) await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
  await user.click(button() as HTMLElement);
};

describe('CalendrierPage', () => {
  it('sélectionner une date met à jour l’agenda du jour', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendrierPage />, { route: '/calendrier' });

    // Une journée sans rendez-vous affiche l’état vide soigné.
    await selectDay(user, freeDay);
    expect(await screen.findByText('Journée libre')).toBeInTheDocument();

    // Le rendez-vous du samedi se retrouve dans l’agenda du bon jour.
    await selectDay(user, addDays(today, 2));
    expect(await screen.findByText('Courses du samedi')).toBeInTheDocument();
    expect(screen.queryByText('Journée libre')).not.toBeInTheDocument();
  });

  it('ajoute un événement via le dialogue et l’affiche dans la grille et l’agenda', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendrierPage />, { route: '/calendrier' });

    await selectDay(user, freeDay);
    expect(await screen.findByText('Journée libre')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter à cette journée' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^Titre/)).toBeInTheDocument();
    // La date retenue est celle de la journée affichée.
    expect(within(dialog).getByLabelText(/^Date/)).toHaveValue(freeDay);

    await user.type(within(dialog).getByLabelText(/^Titre/), 'Balade au lac');
    await user.type(within(dialog).getByLabelText(/^Lieu/), 'Parc du Quartier');
    await user.click(within(dialog).getByRole('button', { name: /Ajouter l’événement/ }));

    expect(await screen.findByText('Balade au lac')).toBeInTheDocument();
    expect(screen.getByText('Parc du Quartier')).toBeInTheDocument();

    // La pastille de la grille passe à « a un événement ».
    const dayButton = screen.getByRole('button', {
      name: new RegExp(`^${dayLabel(freeDay)}, \\d+ événement`),
    });
    expect(dayButton).toHaveAttribute('data-has-event', 'true');
  });

  it('supprime un événement après confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendrierPage />, { route: '/calendrier' });

    const seededDay = addDays(today, 2);
    await selectDay(user, seededDay);
    expect(await screen.findByText('Courses du samedi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Supprimer Courses du samedi' }));
    const alert = await screen.findByRole('alertdialog');
    await user.click(within(alert).getByRole('button', { name: 'Supprimer l’événement' }));

    expect(await screen.findByText('Journée libre')).toBeInTheDocument();
    expect(screen.queryByText('Courses du samedi')).not.toBeInTheDocument();
  });

  it('distingue un jour férié d’un événement du foyer dans l’agenda', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendrierPage />, { route: '/calendrier' });

    // Chaque « Mois suivant » sélectionne le 1er du mois : on avance jusqu’à
    // un jour férié (au plus tard le 1er janvier de l’année suivante).
    for (let step = 0; step < 4 && !screen.queryByText('Jour férié'); step += 1) {
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }

    expect(await screen.findByText('Jour férié')).toBeInTheDocument();
    // Un jour férié n’est ni modifiable ni supprimable par le foyer.
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument();
  });

  it('ouvre le formulaire par appui long sur une date, sans casser le clic', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendrierPage />, { route: '/calendrier' });
    const day = await screen.findByRole('button', { name: new RegExp(`^${dayLabel(freeDay)}`) });

    // Les minuteries ne sont simulées qu'autour de l'appui long, le chargement
    // des données (IndexedDB) ayant besoin de vraies macrotâches.
    vi.useFakeTimers();
    fireEvent.pointerDown(day);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^Date/)).toHaveValue(freeDay);
    vi.useRealTimers();

    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));

    // Le clic simple reste une sélection : la journée affichée ne bouge pas et
    // l’agenda prend le relais sur la journée visée.
    await user.click(day);
    expect(await screen.findByText('Journée libre')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: new RegExp(`^${escape(formatMonthLabel(new Date()))}`) }),
    ).toBeInTheDocument();
  });
});
