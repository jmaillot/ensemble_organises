import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, toIsoDate, toLocalDate, todayIso } from '@/lib/utils';
import { data } from '@/lib/data';
import { renderWithProviders } from '@/test/render';
import type { RoutineAssigneeRow, RoutineRow } from '@/types';
import RoutinesPage from './routines-page';
import {
  MAX_OCCURRENCE_DAYS,
  describeRecurrence,
  isDueOn,
  occurrencesBetween,
  occurrencesBetweenIso,
  ruleForPreset,
  validateRRule,
} from './types';

const TODAY = todayIso();

/** Routines du jeu de démonstration et leur RRULE. */
const DAILY = 'Sortie canine';
const MONDAY = 'Penser aux anniversaires';
const WEDNESDAY = 'Mettre la poubelle';

const weekday = toLocalDate(TODAY).getDay();

/** Occurrences attendues aujourd'hui, déduites des seules RRULE du jeu. */
const expectedToday = [
  DAILY,
  ...(weekday === 1 ? [MONDAY] : []),
  ...(weekday === 3 ? [WEDNESDAY] : []),
];

const todayList = () => within(screen.getByRole('list', { name: 'Occurrences du jour' }));
const routinesList = () => within(screen.getByRole('list', { name: 'Routines du foyer' }));
const historyList = () => within(screen.getByRole('list', { name: 'Historique des occurrences' }));

/** Valeur d'une carte de métrique, à partir de sa légende. */
const metric = (caption: string) => screen.getByText(caption).previousElementSibling;

async function findTodayList() {
  return within(await screen.findByRole('list', { name: 'Occurrences du jour' }));
}

describe('occurrencesBetween', () => {
  it('énumère les occurrences d’une RRULE entre deux jours, bornes incluses', () => {
    const dates = occurrencesBetween('FREQ=DAILY', toLocalDate(TODAY), toLocalDate(addDays(TODAY, 3)));
    expect(dates.map(toIsoDate)).toEqual([TODAY, addDays(TODAY, 1), addDays(TODAY, 2), addDays(TODAY, 3)]);
  });

  it('respecte BYDAY et INTERVAL d’une récurrence hebdomadaire', () => {
    const span = 28;
    const mondays = occurrencesBetweenIso('FREQ=WEEKLY;BYDAY=MO', TODAY, addDays(TODAY, span));
    expect(mondays.every((iso) => toLocalDate(iso).getDay() === 1)).toBe(true);
    // Nombre de lundis réellement contenus dans la fenêtre, jour courant inclus.
    const firstMonday = (1 - weekday + 7) % 7;
    const expected = firstMonday > span ? 0 : Math.floor((span - firstMonday) / 7) + 1;
    expect(mondays).toHaveLength(expected);
    // Le premier lundi est le premier à venir, jamais un jour déjà passé.
    expect(mondays[0] >= TODAY).toBe(true);
    expect(mondays[1] === addDays(mondays[0], 7)).toBe(true);

    const everyThird = occurrencesBetweenIso('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO', TODAY, addDays(TODAY, 84));
    expect(everyThird.length).toBeLessThanOrEqual(5);
    expect(everyThird.every((iso, index) => index === 0 || toLocalDate(iso).getDay() === 1)).toBe(true);
  });

  it('ignore un DTSTART passé et plafonne la fenêtre explorée', () => {
    const legacy = 'DTSTART:20190101T080000Z\nRRULE:FREQ=DAILY';
    expect(occurrencesBetweenIso(legacy, TODAY, TODAY)).toEqual([TODAY]);
    // Au-delà de 90 jours, la fenêtre est bornée : pas d'explosion mémoire.
    const capped = occurrencesBetweenIso('FREQ=DAILY', TODAY, addDays(TODAY, 730));
    expect(capped).toHaveLength(MAX_OCCURRENCE_DAYS + 1);
    expect(isDueOn('FREQ=WEEKLY;BYDAY=MO', TODAY)).toBe(weekday === 1);
  });

  it('renvoie une liste vide pour une règle illisible', () => {
    expect(occurrencesBetween('nawak', toLocalDate(TODAY), toLocalDate(addDays(TODAY, 10)))).toEqual([]);
    expect(occurrencesBetween('', toLocalDate(TODAY), toLocalDate(addDays(TODAY, 10)))).toEqual([]);
    // Une fenêtre inversée ne produit rien non plus.
    expect(occurrencesBetween('FREQ=DAILY', toLocalDate(TODAY), toLocalDate(addDays(TODAY, -3)))).toEqual([]);
  });

  it('décrit une RRULE en français et valide une saisie libre', () => {
    expect(describeRecurrence('FREQ=DAILY')).toBe('Tous les jours');
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=MO')).toBe('Chaque lundi');
    expect(describeRecurrence('FREQ=WEEKLY')).toBe('Chaque semaine');
    expect(describeRecurrence('FREQ=MONTHLY')).toBe('Chaque mois');
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Le 15 de chaque mois');
    expect(describeRecurrence('FREQ=YEARLY')).toBe('Chaque année');
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=3;BYDAY=MO')).toBe('Toutes les 3 semaines, les lundis');
    expect(describeRecurrence('Fampak')).toBe('Récurrence à vérifier');

    expect(ruleForPreset('hebdomadaire', '')).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(ruleForPreset('personnalise', '  freq=weekly;byday=tu ')).toBe('FREQ=WEEKLY;BYDAY=TU');
    expect(validateRRule('FREQ=WEEKLY;BYDAY=MO')).toBeNull();
    expect(validateRRule('FREQ=WEEKLY;BYDAY=XX')).toMatch(/Règle invalide/);
    expect(validateRRule('')).toMatch(/Saisissez une règle RRULE/);
  });
});

describe('RoutinesPage', () => {
  it('ne liste aujourd’hui que les occurrences dues d’après la RRULE', async () => {
    renderWithProviders(<RoutinesPage />, { route: '/routines' });

    const list = await findTodayList();
    const items = list.getAllByRole('listitem');
    expect(items).toHaveLength(expectedToday.length);
    expectedToday.forEach((name) => expect(list.getByText(name)).toBeInTheDocument());
    [DAILY, MONDAY, WEDNESDAY]
      .filter((name) => !expectedToday.includes(name))
      .forEach((name) => expect(list.queryByText(name)).not.toBeInTheDocument());

    // Le jeu de démonstration coche toutes les occurrences du jour.
    expect(metric('déjà cochées')).toHaveTextContent(`${expectedToday.length}/${expectedToday.length}`);
    // La série est calculée sur l'historique, jamais codée en dur.
    expect(metric('jours d’affilée')).toHaveTextContent('12');
  });

  it('coche puis décoche une occurrence du jour et met à jour le compteur et la série', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutinesPage />, { route: '/routines' });

    const list = await findTodayList();
    const open = () => todayList().getByRole('checkbox', { name: /la routine Sortie canine pour aujourd’hui/ });
    expect(open()).toBeChecked();
    expect(list.getByText('12 jours d’affilée')).toBeInTheDocument();

    // Décocher remet l'occurrence à « manquée » : le compteur et la série suivent.
    await user.click(open());
    await waitFor(() => expect(open()).not.toBeChecked());
    expect(metric('déjà cochées')).toHaveTextContent(`${expectedToday.length - 1}/${expectedToday.length}`);
    expect(todayList().getByText('Série à relancer')).toBeInTheDocument();

    // Cocher de nouveau restaure l'occurrence et la série de 12 jours.
    await user.click(open());
    await waitFor(() => expect(open()).toBeChecked());
    expect(metric('déjà cochées')).toHaveTextContent(`${expectedToday.length}/${expectedToday.length}`);
    expect(todayList().getByText('12 jours d’affilée')).toBeInTheDocument();
  });

  it('crée une routine hebdomadaire, compose la RRULE et l’ajoute à l’historique', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutinesPage />, { route: '/routines' });

    await findTodayList();
    await user.click(screen.getByRole('button', { name: 'Nouvelle routine' }));

    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Nom de la routine/), 'Arroser les plantes');
    await user.selectOptions(dialog.getByLabelText(/Récurrence/), 'hebdomadaire');

    // L'aperçu rend la règle transparente avant même l'enregistrement.
    expect(dialog.getByText(/Aperçu :/)).toHaveTextContent('Aperçu : chaque lundi');
    expect(dialog.getByText('FREQ=WEEKLY;BYDAY=MO')).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Créer la routine' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // La RRULE composée est bien celle qui part en base.
    const rows = await data.list<RoutineRow>('routines');
    const created = rows.find((row) => row.name === 'Arroser les plantes');
    expect(created?.recurrence_rule).toBe('FREQ=WEEKLY;BYDAY=MO');

    // La routine rejoint la liste complète et l'historique, en « à venir ».
    const row = routinesList().getByText('Arroser les plantes').closest('[role="listitem"]');
    expect(row).toHaveTextContent('Chaque lundi');
    expect(await historyList().findByText('Arroser les plantes')).toBeInTheDocument();
  });

  it('supprime une routine et ses assignataires après confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutinesPage />, { route: '/routines' });

    await findTodayList();
    await user.click(screen.getByRole('button', { name: 'Supprimer la routine Sortie canine' }));

    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('Supprimer « Sortie canine » ?');
    await user.click(within(alert).getByRole('button', { name: 'Supprimer la routine' }));

    await waitFor(() => expect(screen.queryByText('Sortie canine')).not.toBeInTheDocument());
    expect(metric('rituels suivis')).toHaveTextContent('2');
    const rows = await data.list<RoutineRow>('routines');
    expect(rows.map((row) => row.name)).not.toContain(DAILY);
    // La table de jointure est purgée : IndexedDB n'a pas de cascade.
    expect(await data.list<RoutineAssigneeRow>('routine_assignees', { routine_id: 'routine-1' })).toHaveLength(0);
  });

  it('refuse une RRULE libre invalide et accepte une règle sur mesure', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutinesPage />, { route: '/routines' });

    await findTodayList();
    await user.click(screen.getByRole('button', { name: `Modifier la routine ${MONDAY}` }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByLabelText(/Récurrence/)).toHaveValue('hebdomadaire');

    await user.selectOptions(dialog.getByLabelText(/Récurrence/), 'personnalise');
    const field = dialog.getByLabelText(/Règle RRULE/);
    await user.clear(field);
    await user.type(field, 'FREQ=WEEKLY;BYDAY=XX');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(await dialog.findByText(/Règle invalide/)).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
    expect(dialog.getByText(/Aperçu :/)).toHaveTextContent('toutes les 2 semaines, les lundis et vendredis');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const rows = await data.list<RoutineRow>('routines');
    expect(rows.find((row) => row.name === MONDAY)?.recurrence_rule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
  });
});
