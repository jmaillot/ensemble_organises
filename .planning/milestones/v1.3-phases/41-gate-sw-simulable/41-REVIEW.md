---
phase: 41-gate-sw-simulable
reviewed: 2026-11-10T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/src/lib/e2e-sw-harness.ts
  - app/src/main.tsx
  - app/src/sw.ts
  - app/playwright.config.ts
  - app/e2e/sw-gate-real.spec.ts
  - scripts/e2e-sw-server.mjs
  - scripts/test-sw-gate.sh
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-11-10
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Revue de la phase 41 (harnais e2e de la gate SW « file vide »). Périmètre vérifié via `git show --stat` : **aucune surface SQL/RLS touchée** (claim du plan confirmé) — le seul code de production modifié est `app/src/sw.ts` (retrait du `skipWaiting()` de démarrage + handler `SKIP_WAITING`) et le branchement flag-compilé de `main.tsx`. Les deux changements de production sont corrects :

- le handler `SKIP_WAITING` (sw.ts:301-304) correspond exactement au message que `updateSW()` de `vite-plugin-pwa` (`wb.messageSkipWaiting()`) envoie au worker en attente ; la chaîne banner → `updateSW` → `SKIP_WAITING` → skipWaiting → reload sur `controllerchange` est complète (vérifié : `sw-register.ts` exporte `updateSW = registerSW({...})`, consommé par `update-banner.tsx` et `offline-panel.tsx`).
- le harnais `e2e-sw-harness.ts` est correctement mort en production : garde `import.meta.env.VITE_E2E_SW_HARNESS === '1'` évaluée au build, import dynamique derrière la même garde dans `main.tsx`, preuve A2 par grep du bundle standard exigée par le wrapper (et non supposée). `enqueueOutbox` est bien la source unique (D-03), et le `scopeProvider` est enregistré au chargement de `session-store.ts` (l.332), donc l'enfilage du harnais n'est pas un no-op silencieux après `signInDemo()`.

Les 4 warnings portent sur la **robustesse du harnais lui-même** (fiabilité du run, preuves du wrapper), pas sur la production. Aucun blocage : phase advisory.

## Warnings

### WR-01: Le serveur du harnais meurt sur une exception non attrapée dans le handler de requête

**File:** `scripts/e2e-sw-server.mjs:81,90`
**Issue:** deux sources d'exception dans le callback `createServer` ne sont pas protégées :
1. `decodeURIComponent(new URL(...).pathname)` lève un `URIError` sur une séquence `%` malformée (ex. `/sw%.js`) ;
2. `statSync(cheminFichier)` (l.90) peut lever `ENOENT` si la cible disparaît entre `existsSync` (l.90) et `statSync` — fenêtre réelle puisque le symlink `dist-current` est commuté à chaud pendant le run.

Toute exception dans un handler `http` est une exception non attrapée : **le processus Node meurt en plein run**, et les tests suivants échouent sur des erreurs de connexion sans rien dire du cause racine. Contradictoire avec l'esprit du fichier (« un échec ici est bruyant » — mais seulement pour `racine()`, pas pour le reste).
**Fix:**
```js
createServer((req, res) => {
  try {
    // corps actuel du handler
  } catch (erreur) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`e2e-sw-server : ${erreur?.message ?? erreur}`);
  }
})
```
Plus, pour le TOCTOU : remplacer `!existsSync(...) || statSync(...).isDirectory()` par un unique `try { statSync(cheminFichier) } catch { fallback SPA }`.

### WR-02: La preuve anti-prod A2 devient un contrôle qui ne regarde rien si `find` ne rend aucun fichier

**File:** `scripts/test-sw-gate.sh:85-86`
**Issue:** `FICHIERS_STD=$(find ... -name '*.js' ...)` peut être vide (build atypique, assets déplacés). Alors `grep -l "pattern" $FICHIERS_STD` s'exécute **sans opérande fichier** : `grep` lit l'entrée standard (dans un run non interactif : EOF immédiat, `wc -l` = 0) et la preuve A2 « 0 occurrence » est verte **sans avoir regardé aucun fichier** — précisément le motif « un contrôle qui ne regarde rien » documenté en §2.7 B du projet. Le `set -eu` ne protège pas : l'échec de `grep` (exit 2) est absorbé par le pipe dont le statut est celui de `wc`.
**Fix:**
```sh
if [ -z "$FICHIERS_STD" ]; then
  echo "test-sw-gate.sh: aucun bundle JS dans dist-std/assets — preuve A2 impossible." >&2
  exit 1
fi
```
(et idéalement vérifier que `$FICHIERS_STD` n'est pas vide aussi pour le grep de diagnostic l.89).

### WR-03: Un run interrompu laisse `app/dist` cassé et `dist.original-sw-gate` orphelin

**File:** `scripts/test-sw-gate.sh:126-143,68-77`
**Issue:** le swap de couverture precache déplace le vrai `app/dist` vers `dist.original-sw-gate` puis crée un symlink `app/dist` → `dist-v1`. Si le run est interrompu (Ctrl-C, crash de Playwright) pendant ce bloc, le trap `purger` supprime `dist-v1` mais **ne restaure ni ne nettoie `dist.original-sw-gate`** : `app/dist` reste un symlink pendant, et le répertoire de sauvegarde traîne indéfiniment — un état incohérent que la prochaine exécution de build (`--emptyOutDir` sur `dist`) ne réparerait pas proprement. Le chemin normal (l.140-141) restaure, le chemin d'échec non.
**Fix:** ajouter au trap de purge (ou à `purger`) :
```sh
if [ -d "$APP_DIR/dist.original-sw-gate" ] && [ ! -e "$APP_DIR/dist" ]; then
  mv "$APP_DIR/dist.original-sw-gate" "$APP_DIR/dist"
  echo "✓ app/dist restauré depuis dist.original-sw-gate"
fi
rm -rf "$APP_DIR/dist.original-sw-gate"   # sinon, après restauration explicite
```
et tester `[ -e "$APP_DIR/dist" ]` (lien pendant compris) plutôt que l'existence du seul répertoire.

### WR-04: Fenêtre de course résiduelle entre `kill -0` et le curl de readiness

**File:** `scripts/test-sw-gate.sh:157-173`
**Issue:** le défaut du 2026-10-10 (serveur étranger sur 4173) est corrigé par `kill -0` avant chaque curl — mais si le nôtre meurt en `EADDRINUSE` **entre** le `kill -0` et le `curl`, le 200 du processus étranger passe quand même : le run est dirigé contre un serveur inconnu avec un feu vert. La fenêtre est étroite mais c'est exactement le mode de défaillance que le correctif prétend fermer (§2.7 F). Un succès de curl ne prouve toujours pas que le serveur qui répond est le nôtre.
**Fix:** rendre le readiness **attribuable** : faire répondre le serveur harnais une réponse distinctive et la vérifier, p.ex. un header `X-E2E-SW-Server: 1` dans `writeHead`, puis `curl -fsS -D - -o /dev/null ... | grep -q '^X-E2E-SW-Server: 1'`. Alternative simple : écrire un fichier marqueur `/tmp/opencode/e2e-sw-server-ready.$$` côté serveur au démarrage réussi de `listen` et faire attendre ce fichier au wrapper (le pid du wrapper est alors celui qui a créé le marqueur).

## Info

### IN-01: `ready()` est un no-op alors que sa doc promet « l'app est montée »

**File:** `app/src/lib/e2e-sw-harness.ts:30-32,49-52`
**Issue:** le contrat documenté (« l'app est montée et le harnais est utilisable ») n'est pas tenu : le corps est vide, la promesse ne vérifie rien. Sans conséquence aujourd'hui (la spec sonde la présence de `__eoSwHarness` avant d'appeler `ready`), mais un futur appelant croirait à une vraie barrière de synchronisation.
**Fix:** soit faire de `ready()` une vraie attente (p.ex. `document.readyState === 'complete'` ou présence d'un nœud DOM), soit corriger la docstring pour dire qu'elle ne garantit que la disponibilité du module.

### IN-02: Aucune garde contre le cumul `E2E_BASE_URL` + `E2E_SW_BASE_URL`

**File:** `app/playwright.config.ts:6,19-20`
**Issue:** si les deux variables sont posées simultanément (erreur d'opérateur), les deux specs réelles sont incluses et pointent sur la même `baseURL` — join-token partira contre le serveur du harnais, sw-gate contre la stack déployée : échecs croisés déroutants. Le commentaire documente le routage à une variable, pas l'interdiction du cumul.
**Fix:** refus nommé en tête de config :
```ts
if (process.env.E2E_BASE_URL && process.env.E2E_SW_BASE_URL) {
  throw new Error('E2E_BASE_URL et E2E_SW_BASE_URL sont mutuellement exclusifs.');
}
```

### IN-03: Fenêtre d'observation d'absence de 3 s fondée sur le temps dans le cas « gate fermée »

**File:** `app/e2e/sw-gate-real.spec.ts:244-245`
**Issue:** l'affirmation négative (« un clic forcé ne provoque aucun reload ») observe le `buildId` pendant 3 s seulement. C'est la forme la plus faible possible d'une preuve d'absence — acceptable pour un test de harnais (l'essentiel est le bouton désactivé, l.239), mais un vrai bug de gate ouvrirait le reload potentiellement après cette fenêtre.
**Fix (si renforcé un jour):** basculer l'attente sur un état positif qui ne peut se produire que si la gate fuit (p.ex. écoute `framenavigated` / surveillance du worker `controlling` pendant la durée du test), plutôt qu'un poll borné dans le temps.

## Points vérifiés sans finding

- **sw.ts (production)** : retrait du `skipWaiting()` de démarrage conforme à D-09 ; `clientsClaim()` conservé ; handler `SKIP_WAITING` compatible avec `vite-plugin-pwa` (`updateSW()` → `wb.messageSkipWaiting()` → `{type:'SKIP_WAITING'}`) — la chaîne production est complète, y compris pour `offline-panel.tsx` « Appliquer maintenant ».
- **Anti-prod du harnais** : garde build-time cohérente dans `main.tsx` et `e2e-sw-harness.ts`, preuve A2 exigée par le wrapper sur le bundle (hors `.map`), aucun chemin de composition (compose.app.yaml / Dockerfile) ne passe le flag — vérifié par lecture du Dockerfile §8.2 dans AGENTS.md.
- **Périmètre** : `git show --stat` des 4 commits (d0d44b5, 84b8a26, 9b99cbf, a8b627c) — aucune migration, aucun SQL, aucune RLS. Claim du plan confirmé.
- **Gardes §2.7** : contrôle négatif vu rouge consigné, refus nommé sans prérequis (`variableRequise`), purge rapportée, `kill -0` attribuable (hors WR-04), aucun `waitForTimeout`, aucun skip silencieux.

---

_Reviewed: 2026-11-10T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
