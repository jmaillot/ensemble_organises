import { expect, test, type Page } from '@playwright/test';

/**
 * Gap G-17-3 (phase 17, plan 17-05) : à l'état ON, la pastille du Switch
 * partagé dépassait d'~4px le bord droit de la piste (18px + translate-x-4
 * 16px = 34px > 30px utiles). Preuve bounding-box à 390px que la course
 * corrigée (translate-x-3, 12px) contient la pastille à ON comme à OFF.
 * Membre uniquement en e2e : l'invitée partage le même primitif (D-16).
 */

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

test.describe('Recettes — géométrie du switch Mode cuisine (G-17-3)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('pastille contenue dans la piste à ON et à OFF', async ({ page }) => {
    await openDemoSession(page);
    await page.goto('/recettes/recipe-1');
    await expect(page.getByRole('heading', { name: 'Tartiflette de saison' })).toBeVisible();

    const toggle = page.getByRole('button', { name: 'Mode cuisine', exact: true });
    await expect(toggle).toBeVisible();
    // Piste = le visuel Switch (span portant data-state, rendu asChild ;
    // role="switch" inutilisable ici car aria-hidden l'exclut de l'arbre
    // d'accessibilité), pastille = son unique enfant span.
    const track = toggle.locator(':scope > span[data-state]');
    const thumb = track.locator(':scope > span');

    // État ON.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const trackOn = await track.boundingBox();
    const thumbOn = await thumb.boundingBox();
    expect(trackOn, 'piste visible à ON').not.toBeNull();
    expect(thumbOn, 'pastille visible à ON').not.toBeNull();
    expect(
      thumbOn!.x + thumbOn!.width,
      'bord droit pastille ≤ bord droit piste à ON (tolérance sous-pixel 1px)',
    ).toBeLessThanOrEqual(trackOn!.x + trackOn!.width + 1);

    // État OFF.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const trackOff = await track.boundingBox();
    const thumbOff = await thumb.boundingBox();
    expect(trackOff, 'piste visible à OFF').not.toBeNull();
    expect(thumbOff, 'pastille visible à OFF').not.toBeNull();
    expect(
      thumbOff!.x,
      'bord gauche pastille ≥ bord gauche piste à OFF (tolérance sous-pixel 1px)',
    ).toBeGreaterThanOrEqual(trackOff!.x - 1);
  });
});
