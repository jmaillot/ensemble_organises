import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours Recettes (phase 16) en mode démonstration (aucun backend
 * requis) : grille → fiche → scaler → partage → Courses, périmètre
 * enfant lecture seule, page invitée. Le lien réel (Edge `recipe-invite`)
 * exige le backend : la démo prouve le câblage (dialogue, erreur
 * explicite), les preuves serveur vivent en Vitest + suite SQL 0054.
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Session enfant en démonstration : même idiome que les suites Vitest et
 * la spec cadeaux (`currentMemberId` = Noé, rôle `enfant`), posé via le
 * store zustand persisté.
 */
async function openChildSession(page: Page) {
  await openDemoSession(page);
  await page.evaluate(() => {
    const key = 'ensemble-organises-household';
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error('store foyer absent');
    const parsed = JSON.parse(raw) as { state: Record<string, unknown> };
    localStorage.setItem(
      key,
      JSON.stringify({ ...parsed, state: { ...parsed.state, currentMemberId: 'member-noe' } }),
    );
  });
  await page.reload();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Recettes — grille vers fiche', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoSession(page);
  });

  test('la grille groupe les cartes, le clic ouvre la fiche', async ({ page }) => {
    await page.goto('/recettes');
    await expect(page.getByRole('heading', { name: 'Recettes du foyer' })).toBeVisible();
    await page.getByRole('link', { name: 'Ouvrir la fiche Tartiflette de saison' }).click();
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible();
  });

  test('le curseur recalcule puis l’envoi crée la ligne en Courses', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

    // Ajout d'un ingrédient de référence (500 g pour 4, défaut démo).
    await page.getByLabel('Ingrédient', { exact: true }).fill('Farine');
    await page.getByLabel(/Nombre/).fill('500');
    await page.getByLabel('Unité', { exact: true }).fill('g');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Farine', { exact: true })).toBeVisible();

    // Échelle 8 : la quantité double, l'unité reste invariable.
    await page.locator('#recette-personnes').fill('8');
    await expect(page.locator('section[aria-label="Ingrédients"]').getByText('1000 g', { exact: true })).toBeVisible();

    // Envoi vers la liste Fresque, à l'échelle courante.
    await page.getByRole('button', { name: 'Ajouter à une liste' }).click();
    await page.getByLabel(/Liste de courses/).selectOption({ label: 'Fresque' });
    await page.getByRole('button', { name: 'Envoyer les ingrédients' }).click();
    await expect(page.getByText(/1 ligne ajoutée à « Fresque »/)).toBeVisible();
    await expect(page.getByText(/Farine \(1000 g\)/)).toBeVisible();
  });

  test('Partager ouvre le dialogue, la démo dit l’absence de backend', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    await page.getByRole('button', { name: 'Partager' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Aucun lien actif/)).toBeVisible();
    await page.getByRole('button', { name: 'Générer un lien' }).click();
    // Câblage prouvé : l'échec dit le backend manquant, sans erreur muette.
    await expect(page.getByText(/Edge Function indisponible/)).toBeVisible();
  });

  test('la vue print existe à l’échelle, masquée à l’écran', async ({ page }) => {
    await page.goto('/recettes/recipe-1');
    const print = page.locator('.recipe-print');
    await expect(print).toBeHidden();
    await expect(print).toContainText('Tartiflette de saison');
    await expect(print).toContainText('Ingrédients');
    await expect(print).toContainText('Étapes');
  });
});

test.describe('Recettes — périmètre enfant lecture seule', () => {
  test.beforeEach(async ({ page }) => {
    await openChildSession(page);
  });

  test('enfant : lecture OK, aucune action visible sur la grille et la fiche', async ({ page }) => {
    await page.goto('/recettes');
    await expect(page.getByRole('heading', { name: 'Recettes du foyer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle recette' })).toHaveCount(0);

    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible();
    for (const name of ['Modifier', 'Partager', 'Exporter', 'Ajouter à une liste', 'Supprimer la recette']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  });
});

test.describe('Recettes — page invitée sans compte', () => {
  test('sans code : formulaire puis garde de longueur', async ({ page }) => {
    await page.goto('/invitation/recette');
    await expect(page.getByText(/aucun compte n’est requis/)).toBeVisible();
    // Code court : le bouton reste inactif (garde client, aucun appel).
    await page.getByLabel('Code d’invitation').fill('court');
    await expect(page.getByRole('button', { name: 'Voir la recette' })).toBeDisabled();
    // Code complet : la démo dit l'absence de serveur, sans appel silencieux
    // (le formulaire exige le backend avant même d'ouvrir le lien).
    await page.getByLabel('Code d’invitation').fill('codelienpartage1234567890');
    await page.getByRole('button', { name: 'Voir la recette' }).click();
    await expect(page.getByText(/Connexion au serveur indisponible/)).toBeVisible();
  });

  test('avec code en démo : le mode hors ligne est dit, pas silencieux', async ({ page }) => {
    await page.goto('/invitation/recette?code=codelienpartage1234567890');
    await expect(page.getByText(/Mode hors ligne/)).toBeVisible();
  });
});
