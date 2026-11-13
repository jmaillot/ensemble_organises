import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Audit accessibilité (phase 49, A11Y-01) — instrument de collecte, PAS un test
 * de conformité. Les scans axe tournent en mode démonstration (D-01) sur les
 * DEUX projets Playwright (chromium + mobile, D-03) et leurs résultats bruts
 * sont exportés en JSON dans le dossier de phase (gitigné, régime 46-A3) pour
 * la classification humaine du plan 49-03 (D-04).
 */

const DOSSIER_BRUT =
  '../.planning/phases/49-audit-accessibilit-wcag-2-2-aa/brut';

/** Le projet Playwright « mobile » (Pixel 7, 412 px) vs bureau. */
function viewportIsMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) <= 650;
}

async function openDemoSession(page: Page) {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  if (viewportIsMobile(page)) {
    await expect(page.getByRole('button', { name: 'Plus' })).toBeVisible();
  } else {
    await expect(page.getByRole('navigation', { name: 'Fil d’Ariane' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Attend que la mise en page ait fini de bouger avant un scan axe (Pitfall 3
 * du RESEARCH : un scan prématuré sur skeleton produit des résultats faux —
 * axe voit des éléments en cours de déplacement/montage). Même discipline que
 * `attendreMiseEnPageStable` de critical-paths.spec.ts, dupliquée ici : ce
 * helper y est dédié à la poignée de widget (localisateur en paramètre), non
 * exporté hors du fichier de spec ; la duplication est assumée pour garder
 * les specs existantes intactes (D-02).
 */
async function attendreMiseEnPageStable(page: Page) {
  await expect
    .poll(async () => {
      const a = await page.locator('main').boundingBox();
      await page.waitForTimeout(250);
      const b = await page.locator('main').boundingBox();
      return (
        a !== null && b !== null && Math.abs(a.y - b.y) < 1 && Math.abs(a.height - b.height) < 1
      );
    }, { timeout: 15_000, message: 'la mise en page n’a jamais cessé de bouger' })
    .toBe(true);
}

/**
 * Lance un scan axe sur l'état DOM courant et exporte le JSON réduit vers
 * brut/<projet>-<parcours>.json. AUCUNE assertion sur les violations : c'est
 * le contrat D-04 — la spec échoue seulement si l'infrastructure échoue
 * (navigation, axe) ; toute violation collectée passe par la classification
 * de 49-SPEC §3 faite par le plan 03, jamais par un expect ici.
 */
async function scanAxe(page: Page, parcours: string, infos: { project: string }) {
  const analyse = await new AxeBuilder({ page })
    // Pitfall 1 du RESEARCH : les règles WCAG 2.2 sont désactivées par défaut
    // dans axe-core ; sans activation explicite, `target-size` ne tourne pas.
    .withRules(['target-size'])
    .analyze();

  const reduction = {
    projet: infos.project,
    parcours,
    viewport: page.viewportSize(),
    regles: ['target-size'] as string[],
    // Preuve d'exécution effective (Pitfall 1 : un « 0 violation » sur des
    // règles jamais lancées est un succès muet) : axe renvoie chaque règle
    // dans `passes` (exécutée, aucun nœud fautif) ou `inapplicable` (exécutée,
    // aucun nœud éligible). Les règles présentes nulle part n'ont PAS tourné.
    reglesExecutees: [...analyse.passes, ...analyse.inapplicable].map((r) => r.id),
    violations: analyse.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        failureSummary: n.failureSummary,
      })),
    })),
    incomplete: analyse.incomplete.map((v) => ({
      id: v.id,
      impact: v.impact,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })),
    })),
  };

  const fs = await import('node:fs');
  fs.mkdirSync(DOSSIER_BRUT, { recursive: true });
  fs.writeFileSync(
    `${DOSSIER_BRUT}/${infos.project}-${parcours}.json`,
    JSON.stringify(reduction, null, 2),
  );
}

test.describe('Audit axe — collecte brute', () => {
  test('dashboard', async ({ page }, testInfo) => {
    await openDemoSession(page);
    await attendreMiseEnPageStable(page);
    await scanAxe(page, 'dashboard', { project: testInfo.project.name });
  });
});
