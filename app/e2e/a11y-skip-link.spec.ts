import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Garde permanente A11Y-49-07 (phase 50-04) : le skip-link « Aller au
 * contenu principal » (a[href="#contenu-principal"]) ne doit PAS rester
 * focusable (tabindex=0) sous une couche modale Radix (dialog de
 * confirmation de suppression, tiroir mobile « Plus ») — Radix pose
 * aria-hidden="true" sur la page (déviation documentée dialog.tsx:17,
 * D-15), ce qui alimentait le résultat axe aria-hidden-focus (le skip-link
 * y figurait dans les 6 scans sous voile de l'audit 49/50). Hors couche
 * modale, le skip-link reste la première cible de Tab (garde vitest
 * existante app-shell.test.tsx:112).
 *
 * Deux preuves distinctes (D-04 : comportement prouvé par exécution
 * navigateur, pas de test vitest) :
 * 1. axe-core lancé SOUS VOILE — le moteur exact du constat : le skip-link
 *    ne doit figurer dans aucun nœud aria-hidden-focus. (Le piège de focus
 *    Radix intercepte Tab, donc la navigation ne « voit » pas le défaut :
 *    la mesure statique de focusabilité est la seule qui l'attrape.)
 * 2. Tab répété sous voile : le focus ne doit jamais atterrir sur le
 *    skip-link (garde de navigation, complement de la preuve statique).
 */

/** Attend que la mise en page ait fini de bouger (même discipline que
 *  attendreMiseEnPageStable de a11y-audit.spec.ts, dupliquée assumée pour
 *  garder les specs existantes intactes). */
async function attendreMiseEnPageStable(page: Page) {
  await expect
    .poll(async () => {
      const mesurer = async () => {
        const cible = (await page.locator('main').count()) !== 0 ? 'main' : 'body';
        const boite = await page.locator(cible).boundingBox();
        return boite === null ? null : { y: boite.y, h: boite.height };
      };
      const a = await mesurer();
      await page.waitForTimeout(250);
      const b = await mesurer();
      return a !== null && b !== null && Math.abs(a.y - b.y) < 1 && Math.abs(a.h - b.h) < 1;
    }, { timeout: 15_000, message: 'la mise en page n’a jamais cessé de bouger' })
    .toBe(true);
}

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/** Le focus courant est-il sur le skip-link ? Mesure DOM, pas de capture. */
function focusEstSkipLink(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLAnchorElement && el.getAttribute('href') === '#contenu-principal';
  });
}

/**
 * Preuve axe SOUS VOILE (moteur exact du constat A11Y-49-07) : aucun nœud
 * du résultat aria-hidden-focus ne doit être le skip-link. Les focus-guards
 * Radix restent attendus (« par conception », D-15) : seuls les nœuds
 * correspondant au skip-link échouent le test. `target-size` réactivée par
 * options.rules comme le harnais corrigé (50-01) pour tourner avec les
 * règles par défaut — la règle visée ici est aria-hidden-focus (désactivée
 * par défaut, règle WCAG 2.2 / best-practice « skip-link sous voile »).
 */
async function skipLinkAbsentDuResultatAriaHiddenFocus(page: Page) {
  const analyse = await new AxeBuilder({ page })
    .options({
      rules: {
        'target-size': { enabled: true },
        'aria-hidden-focus': { enabled: true },
      },
    })
    .analyze();

  const nœudsAriaHiddenFocus = [
    ...analyse.violations.filter((v) => v.id === 'aria-hidden-focus'),
    ...analyse.incomplete.filter((v) => v.id === 'aria-hidden-focus'),
  ].flatMap((v) => v.nodes.map((n) => n.html));

  const skipLinkTouche = nœudsAriaHiddenFocus.some((html) =>
    html.includes('#contenu-principal') || html.includes('Aller au contenu principal'),
  );
  expect(
    skipLinkTouche,
    `le skip-link figure encore parmi les nœuds aria-hidden-focus : ${nœudsAriaHiddenFocus.join(' | ')}`,
  ).toBe(false);
}

test.describe('Skip-link sous couche modale (A11Y-49-07)', () => {
  test('dialog suppression (chromium) : skip-link non focusable sous voile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'dialog de suppression : projet chromium (plan 50-04)');
    await openDemoSession(page);
    await page.goto('/taches');
    await attendreMiseEnPageStable(page);

    // Hors couche modale : le skip-link EST la première cible de Tab
    // (comportement existant préservé).
    await page.keyboard.press('Tab');
    expect(await focusEstSkipLink(page)).toBe(true);

    // Couche modale : dialog de confirmation de suppression de tâche
    // (même surface que a11y-audit.spec.ts taches-dialog-suppression).
    await page.getByRole('button', { name: /^Supprimer Valider les rendez-vous/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();

    // Preuve statique axe sous voile (moteur exact du constat).
    await skipLinkAbsentDuResultatAriaHiddenFocus(page);

    // Garde de navigation : le focus ne doit jamais atterrir sur le
    // skip-link pendant la circulation sous voile.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const surSkip = await focusEstSkipLink(page);
      expect(surSkip, `Tab #${i + 1} a porté le focus sur le skip-link sous dialog`).toBe(false);
    }

    // Refermé : le skip-link redevient atteignable (nouveau chargement,
    // sans focus restauré qui décalerait la première tabulation).
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.goto('/taches');
    await attendreMiseEnPageStable(page);
    await page.keyboard.press('Tab');
    expect(await focusEstSkipLink(page)).toBe(true);
  });

  test('tiroir mobile (mobile) : skip-link non focusable sous voile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'tiroir mobile : projet mobile (plan 50-04)');
    await openDemoSession(page);
    await page.goto('/taches');
    await attendreMiseEnPageStable(page);

    // Hors couche modale : première cible de Tab.
    await page.keyboard.press('Tab');
    expect(await focusEstSkipLink(page)).toBe(true);

    // Tiroir mobile « Plus » (barre basse, exact: true comme l'audit).
    await page.getByRole('button', { name: 'Plus', exact: true }).click();
    const tiroir = page.getByRole('dialog', { name: 'Menu des espaces du foyer' });
    await expect(tiroir).toBeVisible();

    // Preuve statique axe sous voile (moteur exact du constat).
    await skipLinkAbsentDuResultatAriaHiddenFocus(page);

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const surSkip = await focusEstSkipLink(page);
      expect(surSkip, `Tab #${i + 1} a porté le focus sur le skip-link sous tiroir`).toBe(false);
    }

    await page.keyboard.press('Escape');
    await expect(tiroir).toBeHidden();
    await page.goto('/taches');
    await attendreMiseEnPageStable(page);
    await page.keyboard.press('Tab');
    expect(await focusEstSkipLink(page)).toBe(true);
  });
});
