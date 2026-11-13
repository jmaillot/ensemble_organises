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
  '../.planning/phases/50-fixes-a11y-majeurs/brut';

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
  // `/connexion` et `/foyer/rejoindre` sont des pages autonomes sans `<main>`
  // (flux public, hors app-shell) : la mesure porte sur `main` quand il
  // existe, sinon sur `body`.
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

/**
 * Lance un scan axe sur l'état DOM courant et exporte le JSON réduit vers
 * brut/<projet>-<parcours>.json. AUCUNE assertion sur les violations : c'est
 * le contrat D-04 — la spec échoue seulement si l'infrastructure échoue
 * (navigation, axe) ; toute violation collectée passe par la classification
 * de 49-SPEC §3 faite par le plan 03, jamais par un expect ici.
 */
async function scanAxe(page: Page, parcours: string, infos: { project: string }) {
  const analyse = await new AxeBuilder({ page })
    // Correction de la limite L1 de 49-AUDIT : withRules LIMITE axe à une
    // règle au lieu d'ajouter. `target-size` est désactivée par défaut dans
    // axe-core (règle WCAG 2.2) : `options.rules` la réactive SANS toucher
    // au jeu de règles par défaut (89–90 règles), contrairement à
    // withRules/withTags qui restreignent l'analyse à leur liste.
    .options({ rules: { 'target-size': { enabled: true } } })
    .analyze();

  const reduction = {
    projet: infos.project,
    parcours,
    viewport: page.viewportSize(),
    // Preuve d'exécution effective (§2.7-F : un « 0 violation » sur des
    // règles jamais lancées est un succès muet) : axe renvoie chaque règle
    // dans `passes` (exécutée, aucun nœud fautif) ou `inapplicable` (exécutée,
    // aucun nœud éligible). Les règles présentes nulle part n'ont PAS tourné.
    // La présence de `target-size` ici prouve son exécution réelle.
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
  /**
   * Les 6 parcours clés (49-SPEC §4, D-11) scannés en page-base sur les deux
   * projets (D-03). Slugs FIGÉS : le plan 03 et le verify attendent les 12
   * fichiers brut/{chromium,mobile}-{connexion,rejoindre,dashboard,courses,
   * taches,ardoise}.json.
   *
   * Chaque scan part de la page-base ; les surfaces interactives connues
   * (tiroir mobile, dialog de confirmation de suppression) sont ouvertes,
   * scannées puis refermées avant le scan suivant — axe ne voit que l'état
   * DOM courant (Pattern 2 du RESEARCH : un dialog Radix fermé est invisible
   * d'axe).
   */
  for (const [parcours, chemin, avecDemoSession] of [
    ['connexion', '/connexion', false],
    ['rejoindre', '/foyer/rejoindre', true],
    ['dashboard', '/accueil', true],
    ['courses', '/courses', true],
    ['taches', '/taches', true],
    ['ardoise', '/ardoise', true],
  ] as const) {
    test(parcours, async ({ page }, testInfo) => {
      if (avecDemoSession) await openDemoSession(page);
      await page.goto(chemin);
      await attendreMiseEnPageStable(page);
      await scanAxe(page, parcours, { project: testInfo.project.name });

      // Surface interactive : le tiroir mobile « Plus » n'existe que sous
      // 650 px ET dans l'app-shell — `/connexion` et `/foyer/rejoindre`
      // (pré-écran public, hors shell) n'ont ni barre basse ni tiroir.
      // Ouvert, scanné, refermé avant tout autre scan.
      if (
        avecDemoSession
        && viewportIsMobile(page)
        && parcours !== 'connexion'
        && parcours !== 'rejoindre'
      ) {
        // `exact: true` : la barre basse porte le seul « Plus » exact — les
        // pages de module ont aussi un « Plus d’actions » (strict mode).
        await page.getByRole('button', { name: 'Plus', exact: true }).click();
        const tiroir = page.getByRole('dialog', { name: 'Menu des espaces du foyer' });
        await expect(tiroir).toBeVisible();
        await scanAxe(page, `${parcours}-tiroir`, { project: testInfo.project.name });
        await page.keyboard.press('Escape');
        await expect(tiroir).toBeHidden();
      }
    });
  }

  test('taches-dialog-suppression', async ({ page }, testInfo) => {
    // La confirmation de suppression de tâche existe sur les deux projets :
    // le dialog de confirmation ouvre une couche Radix que la page-base ne
    // montre pas (Pattern 2 du RESEARCH).
    await openDemoSession(page);
    await page.goto('/taches');
    await attendreMiseEnPageStable(page);
    await page.getByRole('button', { name: /^Supprimer Valider les rendez-vous/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await scanAxe(page, 'taches-dialog-suppression', { project: testInfo.project.name });
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toBeHidden();
  });
});
