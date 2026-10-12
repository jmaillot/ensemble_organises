import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours Espace voyage (phase 15, D-01 → D-08) en mode démonstration
 * (aucun backend requis).
 *
 * Couvert ici, via les vrais contrôles (dialogue 15-02, onglets 15-03) :
 * création d'un voyage avec atterrissage sur sa fiche, étanchéité des
 * onglets entre deux voyages (D-02), budget lié avec répartition serveur
 * réutilisée telle quelle (D-03), bascule d'une rubrique sans suppression
 * (D-05).
 *
 * Non rejouable en démo (voie Edge `trip-invite` exigée, D-01/D-04/D-08) :
 * émission puis régénération du code, départ volontaire, fermeture douce
 * et réouverture. Sans backend, seuls le refus explicite « Edge Function
 * indisponible. » et l'absence d'écriture locale sont déterministes — et
 * c'est exactement ce que ces tests verrouillent : un chemin client aurait
 * silencieusement forgé un code, retiré le membre ou figé la fiche. Les
 * succès adossés au serveur sont prouvés par la suite SQL 0053 (atomicité,
 * oracle, idempotence, close/reopen/leave) et les suites Vitest à faux
 * serveur frontalier (`trip-parametres.test.tsx`, `trip-share-dialog`) —
 * pas rejouables sans relais.
 *
 * Les projets Playwright `chromium` (bureau) et `mobile` (Pixel 7) rejouent
 * chaque test : la preuve desktop + mobile est portée par la configuration,
 * sans duplication.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Crée un voyage via le dialogue 15-02 et renvoie son URL de fiche. Ne
 * touche ni aux participants (tous présélectionnés : Camille y figure) ni
 * aux rubriques (toutes présélectionnées) : le parcours reste celui que
 * l'utilisateur clique.
 */
async function createTrip(page: Page, name: string, destination: string): Promise<string> {
  await page.goto('/voyages');
  await page.getByRole('button', { name: 'Créer un voyage' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Créer un voyage' })).toBeVisible();
  await dialog.getByLabel('Nom du voyage').fill(name);
  await dialog.getByLabel('Destination').fill(destination);
  await dialog.getByLabel('Départ').fill('2028-05-04');
  await dialog.getByLabel('Retour').fill('2028-05-10');
  await dialog.getByRole('button', { name: 'Créer le voyage', exact: true }).click();

  await page.waitForURL(/\/voyages\/.+/);
  await expect(page.getByRole('heading', { level: 2, name: destination })).toBeVisible();
  return page.url();
}

async function openTripTab(page: Page, tab: string) {
  await page.getByRole('tab', { name: tab }).click();
}

test.describe('Espace voyage — création et onglets étanches', () => {
  test('créer un voyage ouvre sa fiche', async ({ page }) => {
    await openDemoSession(page);
    const url = await createTrip(page, 'Escale E2E à Porto', 'Porto');
    expect(url).toMatch(/\/voyages\/.+/);
    // La barre d'onglets de la fiche est là, Infos en tête.
    await expect(page.getByRole('tablist', { name: 'Rubriques du voyage' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Infos' })).toHaveAttribute('aria-selected', 'true');
  });

  test('une tâche créée dans un voyage n’apparaît pas dans l’autre', async ({ page }) => {
    await openDemoSession(page);
    await createTrip(page, 'Escale E2E à Porto', 'Porto');

    // Une ligne dans l'onglet Tâches du nouveau voyage…
    await openTripTab(page, 'Tâches');
    await page.getByLabel('Nom de la tâche').fill('E2E Valise Porto');
    await page.getByRole('button', { name: 'Ajouter au voyage' }).click();
    const newTripList = page.getByRole('list', { name: 'Tâches du voyage' });
    await expect(newTripList.getByText('E2E Valise Porto')).toBeVisible();
    // …où la graine du voyage sibling ne fuit pas (le filtre vit, sinon
    // « Réserver le vol » apparaîtrait ici).
    await expect(newTripList.getByText('Réserver le vol')).toHaveCount(0);

    // Miroir : la graine de Lisbonne est là, la ligne E2E ne fuit pas.
    await page.goto('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();
    await openTripTab(page, 'Tâches');
    const seedList = page.getByRole('list', { name: 'Tâches du voyage' });
    await expect(seedList.getByText('Réserver le vol')).toBeVisible();
    await expect(seedList.getByText('E2E Valise Porto')).toHaveCount(0);
  });

  test('le budget lié rend les dépenses et la répartition', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();

    await openTripTab(page, 'Budget');
    const expenses = page.getByRole('list', { name: 'Dépenses du voyage' });
    await expect(expenses.getByText('Vols aller-retour')).toBeVisible();
    await expect(expenses.getByText('Logement')).toBeVisible();
    // La répartition réutilise les panneaux de l'ardoise tels quels (D-09) :
    // son titre prouve que le règlement lié a rendu, pas un onglet vide.
    await expect(page.getByText('Qui doit quoi ?')).toBeVisible();
  });

  test('masquer une rubrique la retire sans supprimer son contenu', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();

    await openTripTab(page, 'Paramètres');
    const toggle = page.getByRole('checkbox', { name: 'Afficher la rubrique Notes' });
    // La case est cochée par défaut même avant chargement : l'onglet visible
    // prouve que le `tab_state` est chargé (sinon le clic part dans le vide).
    await expect(page.getByRole('tab', { name: 'Notes' })).toBeVisible();
    await expect(toggle).toBeChecked();

    // `click()` + assertions auto-réessayées plutôt que `uncheck()` : la case
    // est contrôlée par le `tab_state` serveur (écriture + relecture), et le
    // cycle natif→serveur→rendu dépasse la vérification unique de `uncheck`.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('tab', { name: 'Notes' })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toBeChecked();
    const notesTab = page.getByRole('tab', { name: 'Notes' });
    await expect(notesTab).toBeVisible();
    await notesTab.click();
    // Le contenu a survécu au masquage (D-05 : jamais supprimé).
    await expect(page.getByRole('list', { name: 'Notes du voyage' }).getByText('Passeports')).toBeVisible();
  });
});

test.describe('Espace voyage — voies serveur en démo (refus explicites)', () => {
  test('partager sans serveur : aucun code forgé en local', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();

    await openTripTab(page, 'Paramètres');
    await page.getByRole('button', { name: 'Partager le voyage' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Partager le voyage' })).toBeVisible();
    await expect(dialog.getByText('Aucun code actif. Générez-en un pour inviter.')).toBeVisible();

    // La génération part vers l'Edge, indisponible en démo : le refus
    // explicite prouve qu'aucun code n'a été forgé côté client (un chemin
    // client aurait affiché un code en mono + QR).
    await dialog.getByRole('button', { name: 'Générer un code' }).click();
    await expect(page.getByText('Edge Function indisponible.')).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Partager le voyage' })).toBeVisible();
  });

  test('quitter puis figer sans serveur : refus explicites, fiche intacte', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();

    await openTripTab(page, 'Paramètres');

    // Départ volontaire : la voie serveur refuse en démo, rien n'est retiré
    // en local (un chemin client aurait silencieusement quitté la fiche).
    await page.getByRole('button', { name: 'Quitter ce voyage' }).click();
    const leaveDialog = page.getByRole('alertdialog');
    await expect(leaveDialog.getByText('Quitter ce voyage ?')).toBeVisible();
    await leaveDialog.getByRole('button', { name: 'Quitter', exact: true }).click();
    const refusal = page.getByText('Edge Function indisponible.');
    await expect(refusal).toBeVisible();
    expect(page.url()).toContain('/voyages/trip-1');
    await expect(page.getByRole('heading', { level: 2, name: 'Lisbonne' })).toBeVisible();
    // Le toast vit 2,8 s : attendre sa disparition pour que le refus suivant
    // soit asserté seul (pas de double match en mode strict).
    await expect(refusal).toHaveCount(0);

    // L'historique reste : les lignes déjà écrites sont toujours là.
    await openTripTab(page, 'Tâches');
    await expect(page.getByRole('list', { name: 'Tâches du voyage' }).getByText('Réserver le vol')).toBeVisible();

    // Fermeture douce : même refus, aucun bandeau « figé ».
    await openTripTab(page, 'Paramètres');
    await page.getByRole('button', { name: 'Figer le voyage' }).click();
    const closeDialog = page.getByRole('alertdialog');
    await expect(closeDialog.getByText('Figer ce voyage ?')).toBeVisible();
    await closeDialog.getByRole('button', { name: 'Figer le voyage' }).click();
    await expect(page.getByText('Edge Function indisponible.')).toBeVisible();
    await expect(page.getByText('Voyage figé')).toHaveCount(0);
  });
});
