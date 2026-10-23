import { expect, test } from '@playwright/test';

/**
 * Parcours principal du menu (vague 3.1), en mode démonstration : ouvrir
 * l'espace, lire la semaine semée (recette du foyer + texte libre), planifier
 * un repas libre, le retirer avec confirmation.
 */
test.describe('Menu', () => {
  test('lire, planifier puis retirer un repas', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL('**/accueil');

    await page.goto('/menu');
    // Les deux contenus du semis : la recette du foyer et le texte libre.
    await expect(page.getByText('Tartiflette de saison').first()).toBeVisible();
    await expect(page.getByText('Restes du frigo')).toBeVisible();

    // Planification d'un repas texte libre via le formulaire.
    await page.getByRole('button', { name: /^Planifier Midi du / }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Texte libre' }).click();
    await dialog.getByLabel(/^Repas/).fill('Pique-nique au parc');
    await dialog.getByRole('button', { name: 'Planifier', exact: true }).click();
    await expect(page.getByText('Pique-nique au parc')).toBeVisible();

    // Le retrait demande la confirmation (aucune suppression en un tap),
    // et la recette du foyer reste dans le foyer.
    await page.getByRole('button', { name: 'Retirer Pique-nique au parc du menu' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Retirer' }).click();
    await expect(page.getByText('Pique-nique au parc')).toHaveCount(0);
    await expect(page.getByText('Tartiflette de saison').first()).toBeVisible();
  });

  test('la navigation change de semaine et revient', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL('**/accueil');

    await page.goto('/menu');
    const currentWeek = await page.getByRole('heading', { name: /^Semaine du / }).first().textContent();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    const nextWeek = await page.getByRole('heading', { name: /^Semaine du / }).first().textContent();
    expect(nextWeek).not.toBe(currentWeek);
    // Une semaine vide d'invitations reste lisible : sept jours, aucun repas.
    await expect(page.getByText('Tartiflette de saison')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cette semaine' }).click();
    await expect(page.getByRole('heading', { name: currentWeek ?? '' }).first()).toBeVisible();
    await expect(page.getByText('Tartiflette de saison').first()).toBeVisible();
  });

  test('la génération remplit la liste de courses', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
    await page.waitForURL('**/accueil');

    await page.goto('/menu');
    await expect(page.getByText('Tartiflette de saison').first()).toBeVisible();
    await page.getByRole('button', { name: 'Générer les courses' }).click();
    const dialog = page.getByRole('dialog');
    // Deux repas-recette semés cette semaine : la génération a de quoi faire.
    await expect(dialog.getByText(/^2 repas-recette cette semaine/)).toBeVisible();
    await dialog.getByLabel(/Liste de courses/).selectOption({ label: 'Fresque' });
    await dialog.getByRole('button', { name: 'Envoyer vers la liste' }).click();
    // Les ingrédients de la tartiflette arrivent dans la liste, mis à
    // l'échelle sur les portions de chaque repas (×4 puis ×2, fusionnés).
    await expect(page.getByText(/ingrédients? envoyé/)).toBeVisible();
  });
});
