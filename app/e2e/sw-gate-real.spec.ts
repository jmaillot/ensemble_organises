import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';

/**
 * Spec e2e RÉELLE de la gate « file vide » de mise à jour du service worker
 * (GATE-01, phase 41).
 *
 * Elle ne tourne QUE contre les deux builds réels servis par le serveur du
 * harnais (`scripts/e2e-sw-server.mjs`) sur LE MÊME origin (127.0.0.1:4173),
 * orchestrés par `scripts/test-sw-gate.sh` : deux builds successifs à hash de
 * precache distinct (preuve `diff dist-v1/sw.js dist-v2/sw.js` non vide faite
 * par le wrapper AVANT ce run), commutation par le symlink `dist-current`
 * relu à chaque requête, revalidation RÉELLE de `/sw.js` par le navigateur au
 * `reload`, worker en attente réel, bandeau poussé par le `onNeedRefresh`
 * réel de `sw-register.ts` — jamais mocké (SC3). Le harnais
 * `window.__eoSwHarness` (compilé sous `VITE_E2E_SW_HARNESS=1` uniquement)
 * écrit la file dans les sources existantes : `enqueueOutbox` sur le
 * `queryClient` de l'app (D-03) — il ne réimplémente jamais la gate.
 *
 * BORNAGE — CE QUE CETTE SPEC VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 *   (1) scénario nominal : v1 sans bandeau → commutation → reload → bandeau
 *   RÉEL « Une mise à jour est disponible », « Recharger » actif, clic → le
 *   buildId servi passe de E2E_SW_BUILD_ID_1 à E2E_SW_BUILD_ID_2 (la mise à
 *   jour est appliquée) ;
 *   (2) gate fermée (OQ-1b) : file non vide → bouton « Mise à jour en
 *   préparation… » désactivé, aucun reload ni changement de buildId au clic
 *   forcé ; puis gate ouverte (cas 2) : file vidée → « Recharger » → build B ;
 *   (3) file seule sans mise à jour (OQ-1a) : injection sans worker en
 *   attente → AUCUN bandeau ;
 *   (4) contrôle négatif : servir deux fois le MÊME build au reload ne
 *   propose AUCUNE mise à jour — le cas qui prouve que la simulation ne
 *   ment pas (§2.7 B). Sa preuve rouge : exécuté avec
 *   E2E_SW_CONTROLE_ROUGE=1 (le rig commute vers le second build), il doit
 *   ÉCHOUER ; dans l'état committé (aucune commutation) il est vert.
 *
 *   Elle ne prouve NI le déploiement Traefik/nginx réel NI le precache servi
 *   par nginx en production : GATE-PROD reste observatoire hors jalon
 *   (docs/EXPLOITATION.md).
 *
 *   Aucun marquage conditionnel d'omission dans ce fichier : sans ses
 *   entrées, la spec ÉCHOUE (fonction `variableRequise`) — elle ne s'ignore
 *   jamais (JT-03). Aucun `waitForTimeout` : les attentes portent sur des
 *   états nommés (Pitfall 7).
 */

function variableRequise(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. ` +
        'Cette spec vérifie la gate SW contre DEUX builds réels servis sur le ' +
        'même origin : elle se lance via `sh scripts/test-sw-gate.sh`, qui ' +
        'construit les deux builds, prouve la différence de precache et ' +
        'démarre le serveur du harnais. Elle échoue sans ses entrées — ' +
        'jamais de skip conditionnel (JT-03).',
    );
  }
  return valeur;
}

const BUILD_ID_1 = variableRequise('E2E_SW_BUILD_ID_1');
const BUILD_ID_2 = variableRequise('E2E_SW_BUILD_ID_2');
// Rig du contrôle rouge (§2.7 B) : présent UNIQUEMENT dans l'exécution qui
// prouve que le contrôle négatif peut échouer (commutation forcée vers le
// second build). Jamais posé par le run normal du wrapper.
const CONTROLE_ROUGE = process.env.E2E_SW_CONTROLE_ROUGE === '1';

// D-17 — verbatims DOM réels de `update-banner.tsx`, écrits en toutes lettres
// parce que la spec vérifie le DOM réel : les renommer côté application DOIT
// casser cette spec.
const VERBATIM_MISE_A_JOUR = 'Une mise à jour est disponible';
const VERBATIM_RECHARGER = 'Recharger';
const VERBATIM_PREPARATION = 'Mise à jour en préparation…';

/** Accès typé au harnais exposé par le build flag-compilé — jamais `any`. */
interface EoSwHarnessPage {
  buildId: string;
  ready(): Promise<void>;
  injectOutboxPending(): Promise<void>;
  clearOutbox(): Promise<void>;
}

function harnais(page: Page) {
  return {
    // La lecture tolère la navigation déclenchée par l'application de la mise
    // à jour (« controlling » → window.location.reload()) : le contexte
    // d'exécution est détruit pendant le poll, l'itération suivante lit la
    // page rechargée — retourner null garde le poll vivant.
    lireBuildId: () =>
      page
        .evaluate(
          () => (window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness?.buildId ?? null,
        )
        .catch(() => null),
    ready: () =>
      page.evaluate(async () => {
        const harnais_ = (window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness;
        if (!harnais_) throw new Error('__eoSwHarness absent : le build ne porte pas le harnais e2e.');
        await harnais_.ready();
      }),
    injectOutboxPending: () =>
      page.evaluate(async () => {
        const harnais_ = (window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness;
        if (!harnais_) throw new Error('__eoSwHarness absent : le build ne porte pas le harnais e2e.');
        await harnais_.injectOutboxPending();
      }),
    clearOutbox: () =>
      page.evaluate(async () => {
        const harnais_ = (window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness;
        if (!harnais_) throw new Error('__eoSwHarness absent : le build ne porte pas le harnais e2e.');
        await harnais_.clearOutbox();
      }),
  };
}

// Commutation du symlink `scripts/dist-current` — écrite PAR LA SPEC au
// moment requis (un seul parcours séquentiel, workers: 1 : le run ne partage
// jamais le serveur avec un second worker). Le chemin est résolu depuis le
// cwd du run Playwright (`app/`, posé par le wrapper via `cd app`).
const CHEMIN_SCRIPTS = path.resolve(process.cwd(), '..', 'scripts');
const LIEN_DIST = path.join(CHEMIN_SCRIPTS, 'dist-current');

function commuterVersBuild(repertoire: 'dist-v1' | 'dist-v2'): void {
  rmSync(LIEN_DIST, { force: true });
  symlinkSync(path.join('..', 'app', repertoire), LIEN_DIST);
}

/** Session de démonstration — miroir exact de `critical-paths.spec.ts`. */
async function ouvrirDemonstration(page: Page): Promise<void> {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Entrer dans la démonstration' }).click();
  await page.waitForURL('**/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour/ })).toBeVisible();
}

/**
 * Prépare le contexte d'un test : symlink remis sur le build A (le test
 * précédent peut avoir laissé le B), navigation, session démo, harnais prêt,
 * buildId affirmé = build A.
 */
async function demarrerSurBuildA(page: Page): Promise<void> {
  commuterVersBuild('dist-v1');
  await ouvrirDemonstration(page);
  // Le harnais est chargé par import dynamique depuis main.tsx : son
  // ARRIVÉE est un état attendu (poll), jamais présumée acquise au premier
  // evaluate — sinon l'absence du chunk ferait échouer le test sans dire
  // pourquoi.
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Boolean((window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness),
        ),
      { timeout: 10_000, message: 'le harnais __eoSwHarness n’est jamais apparu sur window' },
    )
    .toBe(true);
  const { ready, lireBuildId } = harnais(page);
  await ready();
  expect(await lireBuildId()).toBe(BUILD_ID_1);
  // Le reload de `declencherMiseAJour` ne peut prouver une MISE À JOUR que si
  // le worker A est déjà ACTIVÉ : sans lui, le navigateur n'a aucun worker à
  // revalider et le build B s'installe comme PREMIER worker — il s'active
  // directement, aucun événement `waiting`, aucun bandeau (défaut observé :
  // la spec rechargait avant la fin d'install du precache, 152 entrées).
  // État nommé (worker activé), jamais un délai figé (Pitfall 7).
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return reg?.active?.state ?? null;
        }),
      { timeout: 30_000, message: 'le worker A n’est jamais passé à l’état « activated »' },
    )
    .toBe('activated');
}

/**
 * Commute vers le build B et recharge : le navigateur revalide `/sw.js`
 * réellement contre le serveur (no-cache), le worker B s'installe en
 * attente, `onNeedRefresh` pousse le bandeau réel. L'attente est un état
 * nommé (visibilité), jamais un délai figé (Pitfall 7).
 */
async function declencherMiseAJour(page: Page): Promise<void> {
  commuterVersBuild('dist-v2');
  await page.reload();
  const bandeau = page.getByText(VERBATIM_MISE_A_JOUR);
  // L'attente couvre le cycle complet : navigation → revalidation de /sw.js →
  // install du precache B (152 entrées, plusieurs secondes même en local) →
  // waiting → onNeedRefresh → push du bandeau. C'est une attente d'ÉTAT (le
  // bandeau réel), jamais un délai figé (Pitfall 7) — 30 s parce que
  // l'installation du precache dépasse le timeout global de 8 s.
  await expect(bandeau).toBeVisible({ timeout: 30_000 });
}

/** Après un reload, le harnais se recharge avec le bundle : attendre son retour. */
async function attendreHarnais(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () => Boolean((window as unknown as { __eoSwHarness?: EoSwHarnessPage }).__eoSwHarness),
        ),
      { timeout: 10_000, message: 'le harnais __eoSwHarness n’est jamais revenu après le reload' },
    )
    .toBe(true);
}

test.describe.serial('Gate SW « file vide » — deux builds réels sur le même origin', () => {
  test('scénario nominal : bandeau réel sur worker en attente, « Recharger » applique le build B', async ({ page }) => {
    await demarrerSurBuildA(page);
    // Build A servi : aucun bandeau — pas de worker en attente.
    await expect(page.getByText(VERBATIM_MISE_A_JOUR)).toHaveCount(0);

    await declencherMiseAJour(page);

    // File vide (le harnais n'a rien injecté) : « Recharger » actif.
    const recharger = page.getByRole('button', { name: VERBATIM_RECHARGER });
    await expect(recharger).toBeEnabled();
    await recharger.click();

    // La mise à jour est appliquée : le build servi est passé de A à B.
    const { lireBuildId } = harnais(page);
    await expect.poll(lireBuildId, { timeout: 15_000 }).toBe(BUILD_ID_2);
  });

  test('gate fermée puis ouverte : file non vide bloque le bouton, file vide l’ouvre', async ({ page }) => {
    await demarrerSurBuildA(page);
    await declencherMiseAJour(page);

    // CAS 1 (OQ-1b) — gate fermée : le harnais enfile une écriture pendante
    // dans la file du couple démo (source unique D-03, via le harnais).
    await attendreHarnais(page);
    const { injectOutboxPending, lireBuildId } = harnais(page);
    await injectOutboxPending();

    const bouton = page.getByRole('button', { name: VERBATIM_PREPARATION });
    await expect(bouton).toBeDisabled();

    // Affirmation négative : un clic forcé (l'événement part, le bouton
    // désactivé ne réagit pas) ne provoque AUCUN reload ni application — le
    // buildId reste celui du build A pendant la fenêtre d'observation.
    await bouton.click({ force: true, timeout: 2_000 });
    await expect.poll(lireBuildId, { timeout: 3_000 }).toBe(BUILD_ID_1);
    await expect(bouton).toBeDisabled();

    // CAS 2 — gate ouverte : la file est vidée, le bouton redevient
    // « Recharger », actif ; le clic applique réellement le build B.
    const { clearOutbox } = harnais(page);
    await clearOutbox();
    const recharger = page.getByRole('button', { name: VERBATIM_RECHARGER });
    await expect(recharger).toBeEnabled();
    await recharger.click();
    await expect.poll(lireBuildId, { timeout: 15_000 }).toBe(BUILD_ID_2);
  });

  test('file seule sans mise à jour : aucun bandeau (OQ-1a)', async ({ page }) => {
    await demarrerSurBuildA(page);

    // Une écriture pendante est enfilée SANS commutation de build : aucun
    // worker en attente n'existe. La file seule ne déclenche RIEN —
    // l'absence est observée pendant toute la fenêtre de l'expect.
    const { injectOutboxPending } = harnais(page);
    await injectOutboxPending();
    await expect(page.getByText(VERBATIM_MISE_A_JOUR)).toHaveCount(0);
  });

  test('contrôle négatif : servir deux fois le même build ne propose aucune mise à jour', async ({ page }) => {
    await demarrerSurBuildA(page);

    // PREUVE ROUGE (§2.7 B) : sous E2E_SW_CONTROLE_ROUGE=1, ce test commute
    // vers le second build avant le reload — le bandeau apparaît et le
    // contrôle ÉCHOUE (il a été vu rouge dans cette exécution, consignée au
    // résumé de plan). Dans l'état committé, aucune commutation : le même
    // build est servi deux fois, et le navigateur — octets de `/sw.js`
    // identiques — n'installe AUCUN worker en attente.
    if (CONTROLE_ROUGE) {
      await declencherMiseAJour(page);
    } else {
      await page.reload();
    }

    await expect(page.getByText(VERBATIM_MISE_A_JOUR)).toHaveCount(0);
  });
});

// Garde d'entrée du run (§2.7 F : un succès muet est un échec inexpliqué) —
// le wrapper a déjà prouvé la différence de precache ; ici on vérifie
// seulement que le répertoire de commutation et les deux builds servis
// existent bien sur disque (le serveur les relit par symlink à chaque
// requête), pour échouer nommé plutôt qu'au milieu d'un test.
if (!existsSync(CHEMIN_SCRIPTS)) {
  throw new Error(`répertoire scripts/ introuvable depuis ${process.cwd()} : ${CHEMIN_SCRIPTS}`);
}
for (const repertoire of ['dist-v1', 'dist-v2']) {
  const sw = path.join(CHEMIN_SCRIPTS, '..', 'app', repertoire, 'sw.js');
  if (!existsSync(sw)) {
    throw new Error(`build du harnais absent : ${sw} — le wrapper doit construire les deux dists avant la spec.`);
  }
  if (readFileSync(sw, 'utf8').length === 0) {
    throw new Error(`precache vide dans ${sw} : la spec ne peut pas prouver une mise à jour.`);
  }
}
