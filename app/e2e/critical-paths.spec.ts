import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours critiques (AGENTS.md §2.4) : connexion, création/rejoint de foyer,
 * tâche, dépense, carte de fidélité. Les tests tournent en mode démonstration
 * (aucun backend requis) : c'est le mode local documenté de l'application.
 */

/** Le projet Playwright « mobile » utilise la navigation basse. */
function viewportIsMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) <= 650;
}

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  // Le fil d'Ariane est toujours visible ; la barre latérale, elle, cède la
  // place à la navigation basse sous 650 px.
  await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Connexion et foyer', () => {
  test('la landing page présente les trois chemins de connexion', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tout le foyer');
    await expect(page.getByRole('link', { name: 'Commencer avec Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuer avec Facebook' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continuer avec un email' })).toBeVisible();
  });

  test('la session de démonstration ouvre le tableau de bord', async ({ page }) => {
    await openDemoSession(page);
    // Sur mobile, la navigation basse remplace la barre latérale.
    const navigation = page.getByRole('navigation', {
      name: viewportIsMobile(page) ? 'Navigation mobile' : 'Navigation principale',
    });
    await expect(navigation).toBeVisible();
    // Le nom du foyer figure dans l'en-tête de l'accueil, visible partout.
    await expect(page.locator('main').getByText(/Foyer Martin/)).toBeVisible();
  });

  test('créer un foyer génère un token copiable et un QR code', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.goto('/foyer/nouveau');
    await page.getByLabel('Nom du foyer').fill('Foyer de test');
    await page.getByRole('button', { name: 'Créer mon foyer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre foyer est prêt' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code du token d’invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier' })).toBeVisible();
  });

  test('rejoindre un foyer valide le format du token', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/foyer/rejoindre');
    await page.getByLabel('Token d’invitation').fill('court');
    await page.getByRole('button', { name: 'Rejoindre le foyer' }).click();
    await expect(page.getByText(/token fait au moins 22 caractères/)).toBeVisible();
  });
});

test.describe('Parcours des modules', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('une tâche peut être créée puis cochée', async ({ page }) => {
    await page.goto('/taches');
    await page.getByRole('button', { name: 'Ajouter une tâche' }).first().click();
    await page.getByLabel(/Nom de la tâche/).fill('Acheter du pain');
    await page.getByRole('button', { name: 'Ajouter la tâche' }).click();
    await expect(page.getByText('Acheter du pain')).toBeVisible();
    await page.getByRole('checkbox', { name: /Terminer Acheter du pain/ }).click();

    // Le filtre par défaut ne montre que les tâches ouvertes : la tâche cochée
    // en sort, puis la revient via l'onglet « Terminées ».
    await expect(page.getByText('Acheter du pain')).toBeHidden();
    await page.getByLabel('Filtrer les tâches').selectOption({ label: 'Terminées' });
    await expect(page.getByRole('checkbox', { name: /Rouvrir Acheter du pain/ })).toBeVisible();
  });

  test('la suppression d’une tâche demande confirmation', async ({ page }) => {
    await page.goto('/taches');
    await page.getByRole('button', { name: /^Supprimer Valider les rendez-vous/ }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
  });

  test('une dépense alimente l’ardoise', async ({ page }) => {
    await page.goto('/ardoise');
    await page.getByRole('button', { name: 'Ajouter une dépense' }).first().click();
    await page.getByLabel(/Libellé/).fill('Balade à la boulangerie');
    await page.getByLabel(/Montant/).fill('12.50');
    await page.getByRole('button', { name: /Ajouter la dépense/ }).last().click();
    await expect(page.getByText('Balade à la boulangerie')).toBeVisible();
    await expect(page.getByText('Qui doit quoi ?')).toBeVisible();
  });

  test('une carte de fidélité s’affiche en plein écran', async ({ page }) => {
    await page.goto('/fidelite');
    await page.getByRole('button', { name: /Afficher le code de/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).last().click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('le calendrier affiche les jours fériés et l’agenda du jour', async ({ page }) => {
    await page.goto('/calendrier');
    await expect(page.getByRole('heading', { name: 'Calendrier' })).toBeVisible();
    await expect(page.getByText('Jours fériés').first()).toBeVisible();
  });
});

test.describe('Accessibilité et responsive', () => {
  test('aucun débordement horizontal de 360px à 1920px', async ({ page }) => {
    await openDemoSession(page);
    for (const path of ['/accueil', '/taches', '/calendrier', '/ardoise', '/cercle']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `débordement sur ${path}`).toBeLessThanOrEqual(1);
    }
  });

  test('le lien d’évitement conduit au contenu principal', async ({ page }) => {
    await openDemoSession(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toBeFocused();
  });
});
