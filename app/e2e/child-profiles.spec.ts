import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours enfant géré (phase 25, plans 25-05) — socle e2e des profils
 * enfants. Tourne en mode démonstration (aucun backend requis) : création de
 * fiche depuis la liste des membres (D-02), alimentation du picker de tâches,
 * routine cochée par le parent pour l'enfant, modération du Cercle (D-12).
 *
 * L'exécution effective dépend de l'environnement : la chaîne unitaire
 * (typecheck, vitest, build) est la verification obligatoire de 25-05 ; la
 * suite Playwright est exécutée quand les navigateurs sont installés
 * (`npm run test:e2e`), et l'état réel d'exécution est déclaré dans le
 * SUMMARY du plan.
 */

const DATE_NAISSANCE_JADE = '2019-05-14';

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Crée la fiche de Jade depuis le panneau des membres (onglet Foyer des
 * paramètres). Chaque essai repart d'un jeu démo vierge : la fiche est
 * recréée à chaque parcours qui en dépend.
 */
async function createFicheJade(page: Page) {
  await page.goto('/parametres');
  await page.getByRole('tab', { name: 'Foyer' }).click();
  await page.getByRole('button', { name: 'Ajouter un enfant' }).click();
  await page.getByLabel(/Prénom de l’enfant/).fill('Jade Martin');
  await page.getByLabel(/Date de naissance/).fill(DATE_NAISSANCE_JADE);
  await page.getByRole('button', { name: 'Ajouter la fiche' }).click();
  // La fiche apparaît dans la liste, avec l'âge dérivé (D-05) et l'avis
  // « adulte agit pour elle ».
  await expect(page.getByText('Jade Martin')).toBeVisible();
  await expect(page.getByText('7 ans')).toBeVisible();
  await expect(page.getByText(/Jade n’a pas de compte : un adulte agit pour lui, ici et dans les listes/)).toBeVisible();
}

test('le parent crée une fiche enfant depuis la liste des membres', async ({ page }) => {
  await openDemoSession(page);
  await createFicheJade(page);

  // Les actions adultes de la fiche sont là (D-02) ; pas de bouton « Rôle » :
  // un enfant géré ne reçoit pas de rôle (D-07).
  await expect(page.getByRole('button', { name: 'Modifier la fiche de Jade Martin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Espaces de Jade Martin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirer Jade Martin du foyer' })).toHaveCount(0);
});

test('la fiche enfant alimente le picker d’assignation des tâches', async ({ page }) => {
  await openDemoSession(page);
  await createFicheJade(page);

  await page.goto('/taches');
  await page.getByRole('button', { name: 'Ajouter une tâche' }).first().click();
  // Le picker liste les membres vivants, enfant compris (filtre unique du store).
  await expect(page.getByRole('checkbox', { name: 'Assigner à Jade Martin' })).toBeVisible();
});

test('le parent coche une routine assignée à l’enfant', async ({ page }) => {
  await openDemoSession(page);
  await createFicheJade(page);

  await page.goto('/routines');
  await page.getByRole('button', { name: 'Nouvelle routine' }).click();
  await page.getByLabel(/Nom de la routine/).fill('Lecture du soir');
  await page.getByRole('checkbox', { name: 'Assigner à Jade Martin' }).click();
  await page.getByRole('button', { name: 'Créer la routine' }).click();
  await expect(page.getByRole('heading', { name: 'Lecture du soir' })).toBeVisible();

  // Le parent agit POUR l'enfant ; la trace (attributaire enfant, acteur
  // adulte) est vérifiée en base avec le rebranchage du plan 25-07.
  await page.getByRole('checkbox', { name: /Cocher la routine Lecture du soir/ }).click();
  await expect(page.getByRole('checkbox', { name: /Rouvrir la routine Lecture du soir/ })).toBeVisible();
});

test('le parent supprime la publication d’un enfant dans le Cercle (D-12)', async ({ page }) => {
  await openDemoSession(page);

  await page.goto('/cercle');
  const postNoe = page.getByText(/J’ai fini mon dessin de l’école/);
  await expect(postNoe).toBeVisible();

  // La modération adulte rend la suppression atteignable sur le contenu d'un
  // enfant ; un adulte qui publierait resterait maître de son seul message.
  await page.getByRole('button', { name: 'Supprimer la publication de Noé Martin' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByText(/J’ai fini mon dessin de l’école/)).toBeHidden();
});
