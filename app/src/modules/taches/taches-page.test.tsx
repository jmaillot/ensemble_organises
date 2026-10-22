import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { instantOfDatetimeLocal } from '@/lib/datetime';
import { data } from '@/lib/data';
import { DEMO_MEMBERS } from '@/lib/data/seed';
import { todayIso } from '@/lib/utils';
import { useHouseholdStore } from '@/stores/household-store';
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

  /**
   * TODO #4, segment client : le rappel d'une tâche était le seul maillon que
   * rien ne couvrait. Le formulaire écrit `task_reminders` par
   * `replace_task_reminders` (0133) — une seule fonction, donc une transaction
   * — et la relecture doit rendre le même instant, pas un décalage de fuseau
   * (WR-07). Le serveur est prouvé séparément : `test-db.sh` pour les
   * fonctions, et la sonde du dispatch pour la sélection.
   */
  async function remindersOf(name: string) {
    const task = (await data.list<{ id: string; name: string }>('tasks')).find((row) => row.name === name);
    if (!task) throw new Error(`tâche introuvable : ${name}`);
    return data.list<{ task_id: string; remind_at: string }>('task_reminders', { task_id: task.id });
  }

  async function createTaskWithReminder(name: string, reminder: string) {
    supportDialogEnvironment();
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });
    await findTaskList();
    await user.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Nom de la tâche/), name);
    // `datetime-local` se remplit par un changement de valeur : `type` y écrit
    // segment par segment et laisse le champ dans un état intermédiaire.
    fireEvent.change(dialog.getByLabelText(/Rappel/), { target: { value: reminder } });
    await user.click(dialog.getByRole('button', { name: 'Ajouter la tâche' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await (await findTaskList()).findByText(name);
    return user;
  }

  it('écrit le rappel saisi et le relit à l’édition', async () => {
    const name = 'Appeler le plombier';
    const reminder = '2030-01-02T09:30';
    const user = await createTaskWithReminder(name, reminder);

    expect((await remindersOf(name)).map((row) => row.remind_at)).toEqual([instantOfDatetimeLocal(reminder)]);

    await user.click(screen.getByRole('button', { name: `Modifier ${name}` }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByLabelText(/Rappel/)).toHaveValue(reminder);
  });

  it('retire le rappel quand le champ est vidé', async () => {
    const name = 'Passer chez le dentiste';
    const user = await createTaskWithReminder(name, '2030-01-02T09:30');
    expect(await remindersOf(name)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: `Modifier ${name}` }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Rappel/), { target: { value: '' } });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(async () => expect(await remindersOf(name)).toHaveLength(0));
  });

  it('ouvre la création pré-remplie depuis l’état de navigation (raccourci calendrier)', async () => {
    supportDialogEnvironment();
    renderWithProviders(<TachesPage />, { route: { pathname: '/taches', state: { dueDate: '2026-10-15' } } });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Ajouter une tâche')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Échéance/)).toHaveValue('2026-10-15');
  });

  it('ignore un état de navigation invalide sans ouvrir le dialogue', async () => {
    renderWithProviders(<TachesPage />, { route: { pathname: '/taches', state: { dueDate: 'n’importe quoi' } } });

    await findTaskList();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/**
 * WR-14 côté panneau : la borne est posée par l'appelant (`use-taches` passe
 * `new Date()`). L'horloge est figée à midi — le rappel du jour de la graine
 * (18:30) est donc encore à venir, et celui de demain (18:00) reste dehors,
 * quelle que soit l'heure d'exécution de la suite.
 */
describe('TachesPage — « Rappels du jour » borné à la journée (WR-14, D-07)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ne liste que le rappel du jour encore à venir', async () => {
    // Seul `Date` est figé : les minuteries réelles restent en place, sans quoi
    // React Query, Dexie et `waitFor` ne progresseraient plus.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${todayIso()}T12:00:00`));
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    const panelElement = document.getElementById('task-reminders-panel');
    expect(panelElement).not.toBeNull();
    const panel = within(panelElement as HTMLElement);

    expect(panel.getByText('Valider les rendez-vous du carnet')).toBeInTheDocument();
    // Rappel de demain : hors de la journée, donc hors du panneau.
    expect(panel.queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
  });
});

describe('TachesPage — compteur À faire personnel', () => {
  it('ne compte que mes tâches ouvertes et celles sans assigné', async () => {
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    // Camille connectée : task-1 à elle, task-2/task-4 à Thomas, 1 faite, 2 de voyage.
    expect(screen.getByText('pour moi ou sans assigné').previousSibling).toHaveTextContent('1');
  });
});

/**
 * WR-13 : le glisser-déposer doit changer ce que l'utilisateur voit (D-11).
 *
 * dnd-kit mesure pour de vrai : jsdom rend des rectangles nuls, donc aucune
 * cible n'est désignable et le dépôt n'a lieu nulle part. Chaque ligne reçoit
 * ici une bande verticale distincte (60 px), ce qui rend le geste clavier
 * déterministe : Espace saisit, la flèche descend d'un cran, Espace dépose.
 */
const ROW_HEIGHT = 60;

function stubRowRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function stub(this: Element) {
    const element = this as HTMLElement;
    const isRow = element.getAttribute('role') === 'listitem';
    const index = element.parentElement ? Array.from(element.parentElement.children).indexOf(element) : 0;
    const height = isRow ? ROW_HEIGHT : 600;
    const top = isRow ? 100 + index * ROW_HEIGHT : 0;
    return {
      x: 0,
      y: top,
      width: 300,
      height,
      top,
      left: 0,
      right: 300,
      bottom: top + height,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

/** Saisit la poignée, descend d'un cran, dépose. */
async function dragDownOne(user: ReturnType<typeof userEvent.setup>, taskName: string) {
  const grip = screen.getByRole('button', { name: `Réordonner : ${taskName}` });
  grip.focus();
  await user.keyboard(' ');
  await user.keyboard('{ArrowDown}');
  await user.keyboard(' ');
}

/** Les noms des lignes affichées, dans l'ordre où l'utilisateur les voit. */
function visibleNames() {
  return within(screen.getByRole('list', { name: LIST_NAME }))
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '');
}

describe('TachesPage — le dépôt tient la promesse du tri (WR-13, D-11)', () => {
  it('un dépôt dans le même groupe persiste l’ordre affiché, même après le refresh', async () => {
    stubRowRects();
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    // Ordre de départ : retard épinglé, puis rangs 0 et 1.
    expect(visibleNames().map((name) => name.slice(0, 12))).toEqual([
      'Choisir le m',
      'Valider les ',
      'Ajouter le l',
    ]);

    await dragDownOne(user, 'Valider les rendez-vous du carnet');

    // La ligne reste là où elle a été déposée : c'est le défaut d'origine, où
    // le tri par échéance la ramenait sous « Ajouter le lait d'agne ».
    await waitFor(() => {
      expect(visibleNames()[1]).toContain('Ajouter le lait d’agne');
      expect(visibleNames()[2]).toContain('Valider les rendez-vous du carnet');
    });
    expect(visibleNames()[0]).toContain('Choisir le menu du week-end');
  });

  it('refuse un dépôt qui franchit la frontière d’un groupe, sans rien écrire', async () => {
    stubRowRects();
    const updateSpy = vi.spyOn(data, 'update');
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    // La tâche en retard (1re ligne) est déposée sur une tâche à jour : le tri
    // la réépinglerait aussitôt, la position promise n'arriverait jamais.
    await dragDownOne(user, 'Choisir le menu du week-end');

    // Le refus est dit à l'écran, avec la frontière en cause.
    const toastRegion = () => within(screen.getByRole('region', { name: 'Notifications de l’application' }));
    expect(await toastRegion().findByText(/Les tâches en retard restent en tête/)).toBeInTheDocument();
    // Aucune écriture de rang : ni par le dépôt, ni après coup.
    expect(updateSpy.mock.calls.filter(([table]) => table === 'tasks')).toHaveLength(0);
    // Et l'annonce lecteur d'écran ne prétend pas que la tâche a été déposée.
    expect(screen.queryByText(/déposée à la place de/)).not.toBeInTheDocument();
    // L'ordre affiché est inchangé.
    expect(visibleNames()[0]).toContain('Choisir le menu du week-end');
  });
});

/**
 * LE TRI EN UN CLIC : la référence range les tâches « d'un coup par date
 * limite ou par responsable », à côté du glisser-déposer.
 *
 * Le tri ÉCRIT les rangs : l'ordre trié devient l'ordre du foyer, comme au
 * dépôt. Un simple filtre d'affichage se disputerait avec le geste — les deux
 * voudraient tenir l'ordre.
 */
describe('TachesPage — le tri en un clic', () => {
  it('range par responsable et écrit les rangs', async () => {
    const updateSpy = vi.spyOn(data, 'update');
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });
    await findTaskList();

    await user.selectOptions(screen.getByLabelText('Trier les tâches'), 'responsable');

    // Les rangs sont écrits : l'ordre trié devient l'ordre du foyer.
    await waitFor(() => {
      const ecrits = updateSpy.mock.calls.filter(([table]) => table === 'tasks');
      expect(ecrits.length).toBeGreaterThan(0);
    });
    // Et le foyer est prévenu, parce qu'un ordre qui change en silence
    // ressemblerait à un tri qui n'a rien fait.
    const toastRegion = () => within(screen.getByRole('region', { name: 'Notifications de l’application' }));
    expect(await toastRegion().findByText(/Tâches triées par responsable/)).toBeInTheDocument();
  });
});

/**
 * WR-02 : la corbeille suit le rôle, pas la capacité d'écriture.
 *
 * Le mode démo (Dexie) ne porte **ni RLS ni contrainte** : c'est la raison
 * structurelle du défaut (une suppression non autorisée y réussit, donc l'écart
 * entre l'interface et le serveur ne se voyait pas). Ce qui est vérifié ici est
 * donc l'**affichage**, pas l'autorisation serveur : celle-ci est portée par
 * `tasks_delete_admin` (0118:349-354) et par le test SQL de la phase.
 */
describe('TachesPage — corbeille réservée à l’administrateur', () => {
  const TRASH = 'Supprimer Choisir le menu du week-end';
  const EDIT = 'Modifier Choisir le menu du week-end';

  it('expose la corbeille à un administrateur', async () => {
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    expect(taskList().getByRole('button', { name: TRASH })).toBeInTheDocument();
  });

  it('masque la corbeille à un membre non admin, sans retirer l’édition ni la création', async () => {
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    // Thomas est un `membre` : il écrit, mais ne supprime pas.
    await act(async () => {
      useHouseholdStore.setState({ currentMemberId: DEMO_MEMBERS.thomas });
    });

    expect(taskList().queryByRole('button', { name: TRASH })).not.toBeInTheDocument();
    expect(taskList().getByRole('button', { name: EDIT })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une tâche' })).toBeInTheDocument();
  });
});

describe('TachesPage — la vue Tableau (Lot 2)', () => {
  afterEach(() => {
    // La vue choisie est retenue d'une session à l'autre : sans ce nettoyage,
    // le test suivant démarrerait sur le tableau.
    window.localStorage.removeItem('eo:taches:view');
  });

  it('change le statut depuis une carte et range la tâche dans sa colonne', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    await user.click(screen.getByRole('button', { name: 'Tableau' }));

    const aFaire = screen.getByRole('region', { name: 'À faire' });
    expect(within(aFaire).getByText('Ajouter le lait d’agne')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Statut de « Ajouter le lait d’agne »'), 'en_cours');

    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: 'En cours' })).getByText('Ajouter le lait d’agne'),
      ).toBeInTheDocument();
    });
    expect(within(aFaire).queryByText('Ajouter le lait d’agne')).not.toBeInTheDocument();
    const rows = await data.list<{ name: string; status: string }>('tasks');
    expect(rows.find((row) => row.name === 'Ajouter le lait d’agne')?.status).toBe('en_cours');
  });

  it('montre les tâches terminées même quand le filtre par défaut masque les tâches closes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TachesPage />, { route: '/taches' });

    await findTaskList();
    // Filtrer les tâches terminées est impossible : la colonne le porte.
    expect(screen.getByLabelText('Filtrer les tâches')).toHaveValue('ouvertes');

    await user.click(screen.getByRole('button', { name: 'Tableau' }));

    expect(screen.queryByLabelText('Filtrer les tâches')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Terminée' })).getByText('Ranger les photos de l’été'),
    ).toBeInTheDocument();
  });
});
