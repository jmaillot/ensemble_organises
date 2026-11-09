import { expect, test, type Page } from '@playwright/test';

/**
 * Spec e2e RÉELLE du parcours join-token (flux 31-03) — JT-02, TEST-02.
 *
 * Elle ne tourne QUE contre la stack déployée, orchestrée par
 * `scripts/test-join-token-real.sh` : ce wrapper crée les deux comptes
 * (Admin GoTrue), le foyer et le token (Edge household-invite), puis purge
 * tout en sortie. Aucun gating de skip ici : la spec ÉCHOUE si ses entrées
 * manquent (JT-03 — le gating vit dans le wrapper, qui refuse sans stack).
 *
 * Les sélecteurs consomment le DOM réel de `join-household-page.tsx`,
 * `sign-in-page.tsx` et `create-household-page.tsx` — jamais de doublon.
 *
 * BORNAGE — CE QUE CETTE SPEC VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 *   Les 6 points JT-02 du flux 31-03 : (1) création de foyer depuis l'UI avec
 *   token copiable + QR ; (2) pré-écran public nommant l'invitant (D-20, via
 *   la preview Edge publishable) ; (3) traversée D-06 — token posé en
 *   sessionStorage AVANT la navigation vers /connexion en mode inscription ;
 *   (4) redeem authentifié D-08 par le CTA explicite, retour au pré-écran par
 *   la mémoire du parcours (D-07) ; (5) atterrissage non bloquant D-09 après
 *   un échec de redeem (message D-17 d'abord, navigation ensuite) ;
 *   (6) message uniforme sur token mort — D-03 en pré-écran public, verbatim
 *   D-17 au redeem authentifié.
 *
 *   Elle ne peut PAS vérifier le passage réel par l'email de confirmation de
 *   l'inscription : aucun accès IMAP, et le contournement `generate_link` de
 *   l'Admin GoTrue ferait emprunter un chemin qu'aucun vrai utilisateur
 *   n'emprunte — volontairement non contourné. Le testage de la traversée
 *   s'arrête donc au hand-off sessionStorage (D-06) ; le redeem est effectué
 *   par un compte pré-confirmé via l'Admin (grant password, A1).
 *
 *   Aucun marquage conditionnel d'omission dans ce fichier : sans stack, le
 *   wrapper refuse et la spec échoue — elle ne s'ignore jamais (JT-03 ;
 *   contre-modèle explicite : offline-shared-device.spec.ts l.38).
 */

// La spec échoue nommément sans ses entrées : un échec est une information,
// un skip silencieux serait un vert mensonger (JT-03).
function variableRequise(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. ` +
        'Cette spec vérifie le flux réel 31-03 contre la stack déployée : ' +
        'elle se lance via `sh scripts/test-join-token-real.sh` (DS-01), qui ' +
        'prépare les comptes et le token. Elle échoue sans ses entrées — ' +
        'jamais de skip conditionnel (JT-03).',
    );
  }
  return valeur;
}

const TOKEN = variableRequise('E2E_JOIN_TOKEN');
const HOUSEHOLD_ID = variableRequise('E2E_JOIN_HOUSEHOLD_ID');
const INVITER_EMAIL = variableRequise('E2E_INVITER_EMAIL');
const INVITER_PASSWORD = variableRequise('E2E_INVITER_PASSWORD');
const JOIN_EMAIL = variableRequise('E2E_JOIN_EMAIL');
const JOIN_PASSWORD = variableRequise('E2E_JOIN_PASSWORD');
const INVITER_NAME = variableRequise('E2E_JOIN_INVITER_NAME');
const API_URL = variableRequise('E2E_API_URL');
const PUBLISHABLE_KEY = variableRequise('E2E_PUBLISHABLE_KEY');

// D-06 : la clé sessionStorage du flux 31-03 (invites.ts) — l'assertion porte
// sur la valeur réelle posée par l'application, pas sur un doublon du test.
const PENDING_INVITE_KEY = 'ensemble-organises-pending-invite-token';

// D-17 — le verbatim de `translateRedeemError` pour un token expiré. Il est
// écrit ici en toutes lettres parce que la spec vérifie le DOM réel : le
// renommer côté application DOIT casser cette spec.
const VERBATIM_EXPIRE = 'Ce lien a expiré. Demandez-en un nouveau à l’administrateur.';

/**
 * Connexion par le formulaire réel de /connexion — le chemin d'un vrai
 * utilisateur (les comptes du run sont confirmés par l'Admin, A1 : le grant
 * password fonctionne sans autoconfirm).
 */
async function seConnecter(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/(accueil|foyer)$/);
  // D-17 : un compte neuf n'a jamais attesté son âge — la modale CGU bloque
  // toute la page jusqu'à confirmation. Le spec atteste comme un utilisateur
  // réel (JT-02) : cocher la case 15+, confirmer, et attendre la fermeture.
  const attestation = page.getByRole('dialog');
  if (await attestation.getByText('Une dernière étape avant de commencer').isVisible().catch(() => false)) {
    await attestation.getByRole('checkbox').check();
    await attestation.getByRole('button', { name: 'Confirmer' }).click();
    await expect(attestation).toBeHidden();
  }
}

test.describe.configure({ mode: 'serial' });

test.describe('Parcours réel du lien d’invitation (stack déployée)', () => {
  test('point 1 — le foyer créé depuis l’UI affiche un token copiable et un QR code', async ({ page }) => {
    await seConnecter(page, INVITER_EMAIL, INVITER_PASSWORD);
    await page.goto('/foyer/nouveau');
    await page.getByLabel('Nom du foyer').fill('Foyer de vérification e2e');
    await page.getByRole('button', { name: 'Créer mon foyer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre foyer est prêt' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'QR code du token d’invitation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copier' })).toBeVisible();
  });

  test('point 2 (D-20) — le pré-écran public nomme l’invitant, sans session', async ({ page }) => {
    // Contexte Playwright neuf : aucune session — c'est l'étranger porteur du
    // lien, celui pour qui la preview Edge `publishable` existe (D-01).
    await page.goto(`/foyer/rejoindre?token=${TOKEN}`);
    const titre = page.getByRole('heading', { level: 1 });
    await expect(titre).toContainText(`${INVITER_NAME} t’invite à rejoindre`);
  });

  test('point 3 (D-06) — le token part en sessionStorage AVANT la navigation vers /connexion', async ({ page }) => {
    await page.goto(`/foyer/rejoindre?token=${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('t’invite à rejoindre');
    await page.getByRole('button', { name: 'Continuer vers l’inscription' }).click();
    await page.waitForURL('/connexion');
    // L'assertion sessionStorage est placée AVANT toute autre action : elle
    // prouve que le hand-off (D-06) est posé au moment du départ.
    const attendu = await page.evaluate((clé) => sessionStorage.getItem(clé), PENDING_INVITE_KEY);
    expect(attendu).toBe(TOKEN);
    // Le `state.mode` du pré-écran ouvre /connexion directement en inscription.
    await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();
  });

  test('point 4 (D-08/D-07) — l’invité connecté rejoint le foyer par le CTA explicite', async ({ page }) => {
    await page.goto(`/foyer/rejoindre?token=${TOKEN}`);
    await page.getByRole('button', { name: 'Continuer vers l’inscription' }).click();
    await page.waitForURL('/connexion');
    // D-07 : le retour au pré-écran se fait par la mémoire du parcours — la
    // connexion honore `state.from` et ramène au pré-écran du token.
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByLabel('Adresse e-mail').fill(JOIN_EMAIL);
    await page.getByLabel('Mot de passe').fill(JOIN_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(`/foyer/rejoindre?token=${TOKEN}`);
    await expect(page.getByRole('button', { name: 'Rejoindre le foyer' })).toBeVisible();
    // D-19 : jamais de redeem au chargement — il n'a lieu que sur ce clic.
    await page.getByRole('button', { name: 'Rejoindre le foyer' }).click();
    await expect(page.getByText('Vous avez rejoint le foyer.')).toBeVisible();
    await page.waitForURL('/accueil');
  });

  test('point 6a (D-03) — un token mort affiche LE message uniforme, session ou non', async ({ page }) => {
    // Chaîne inconnue de la base (≥ 22 caractères, frontière Zod respectée) :
    // la preview Edge répond 404 uniforme, l'UI ne nuance jamais le motif.
    const mort = `e2e-mort-${Date.now()}-${HOUSEHOLD_ID.slice(0, 8)}`;
    await page.goto(`/foyer/rejoindre?token=${mort}`);
    await expect(page.getByRole('alert')).toHaveText(
      'Ce lien d’invitation n’est plus valable. Demandez un nouveau lien à l’administrateur de votre foyer.',
    );
  });

  test('point 6b (D-17 puis D-09) — le redeem d’un token expiré affiche le verbatim, puis atterrit', async ({ page }) => {
    // L'invitante crée UN token à très courte durée de vie via la vraie Edge
    // (session réelle de l'UI) : la preview est consultée AVANT l'expiration,
    // le redeem APRÈS — le seul état où la preview réussit et le redeem échoue
    // sans aucune horloge figée (interdite, phase 38).
    await seConnecter(page, INVITER_EMAIL, INVITER_PASSWORD);
    const jeton = await page.evaluate(
      async ({ api, key, householdId }) => {
        const cléSession = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
        if (!cléSession) throw new Error('aucune session supabase dans localStorage');
        const session = JSON.parse(localStorage.getItem(cléSession) ?? '{}') as { access_token?: string };
        if (!session.access_token) throw new Error('session sans access_token');
        const réponse = await fetch(`${api}/functions/v1/household-invite`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            action: 'create',
            householdId,
            expiresAt: new Date(Date.now() + 6_000).toISOString(),
          }),
        });
        if (!réponse.ok) throw new Error(`création du token éphémère refusée (${réponse.status})`);
        return ((await réponse.json()) as { token: string }).token;
      },
      { api: API_URL, key: PUBLISHABLE_KEY, householdId: HOUSEHOLD_ID },
    );
    expect(jeton.length).toBeGreaterThanOrEqual(22);

    // L'invité, lui, consulte puis clique APRÈS l'expiration : redeem → 410
    // → verbatim D-17 dans un role=alert (l.215 du pré-écran). La session de
    // l'invitante est remplacée par la sienne : seuls les deux comptes jetables
    // du run sont impliqués.
    await seConnecter(page, JOIN_EMAIL, JOIN_PASSWORD);
    await page.goto(`/foyer/rejoindre?token=${jeton}`);
    await expect(page.getByRole('button', { name: 'Rejoindre le foyer' })).toBeVisible();
    // L'expiration survient pendant cette attente — aucune horloge figée :
    // c'est le temps RÉEL qui fait passer le token de l'autre côté.
    await page.waitForTimeout(9_000);
    await page.getByRole('button', { name: 'Rejoindre le foyer' }).click();
    await expect(page.getByRole('alert')).toHaveText(VERBATIM_EXPIRE);
    // D-09 : le message reste lisible, puis l'utilisateur atterrit sur son
    // état normal — `DELAI_ATERRISSAGE_MS = 3000` côté application, le
    // timeout est donc EXPLICITEMENT supérieur à 3 000 ms (Pitfall 7).
    await page.waitForURL('/foyer', { timeout: 10_000 });
  });
});
