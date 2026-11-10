# Phase 41: Gate SW simulable — Recherche

**Researched:** 2026-11-10
**Domain:** Vite PWA (injectManifest), mise à jour de service worker en mode `prompt`, Playwright e2e contre build+preview réel, harnais dev-only d'injection dans les stores existants
**Confidence:** HIGH (tout le code cité a été lu ce session ; aucune dépendance externe nouvelle)

---

## Résumé

La gate « file vide » existe déjà et est complète côté code : `app/src/lib/sw-register.ts` enregistre le SW en mode `prompt` (`registerSW`, `registerType: 'prompt'` configuré dans `vite.config.ts`), pousse le bandeau `sw-update` dans `useBannerStore` via `onNeedRefresh`, et `app/src/components/banners/update-banner.tsx` désactive le bouton « Recharger » tant que `useOutboxGate()` (`app/src/hooks/use-outbox-gate.ts`) rapporte une file non vide. Ce qui manque n'est pas du code produit mais une **preuve runtime** : personne n'a jamais vu deux builds successifs à hash de precache distinct produire un worker en attente réel sur ce dépôt, ni la gate se refermer sur les deux branches.

Le scénario est simulable sans aucun backend : les specs e2e tournent en mode démonstration (`critical-paths.spec.ts`, build + `vite preview` port 4173, aucune stack). La mécanique est la suivante : (1) construire deux `dist/` successifs — tout changement de source change les hash des entrées de precache générées par `injectManifest`, donc `dist/sw.js` diffère octet par octet — ; (2) servir les deux sur **le même origin** (127.0.0.1:4173), d'abord build 1 puis build 2 ; (3) un contexte Playwright neuf charge build 1 (SW actif), puis build 2 est servi, un rechargement déclenche le check de mise à jour du SW (le navigateur revalide `/sw.js` à chaque navigation — et nginx a déjà la règle `no-cache` pour ce chemin, §2.7 09-02) ; (4) `onNeedRefresh` pousse le bandeau réel, non mocké.

La simulation de la **file non vide** ne doit PAS passer par le bandeau ni par `sw-register.ts` (SC3 : logique non forkée). La source unique de la file est un état client TanStack Query (`useOutbox`, `setQueryData` sur la clé `[...OUTBOX_KEY, userId, householdId]`) — un harnais compilé sous flag (`VITE_E2E_SW_HARNESS`) exposé sur `window` peut enfiler une entrée pendante via `queryClient.setQueryData`, exactement comme le fait le `MutationCache` en production. Le harnais ne touche ni `sw-register.ts` ni `use-outbox-gate.ts` ni `update-banner.tsx`.

**Recommandation principale :** une spec e2e `app/e2e/sw-gate-real.spec.ts` + un wrapper `scripts/test-sw-gate.sh` (pattern `test-join-token-real.sh` de la phase 39) qui construit deux dists avec `VITE_BUILD_ID` distincts, sert un serveur statique no-cache maison (Node `http` natif, aucune dépendance) commutant de dist 1 à dist 2 par symlink, et lance la spec sur les deux branches (file vide → bandeau + rechargement ; file non vide → bouton bloqué). La spec est exclue du run e2e standard (`testIgnore` sur variable d'environnement, pattern existant de `join-token-real.spec.ts`) — le run standard reste 100 % vert, et la construction d'un second build ne ralentit pas chaque run e2e.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Détection du worker en attente (`onNeedRefresh`) | Navigateur (SW lifecycle) | — | Cycle de vie natif du navigateur ; `registerSW` n'y ajoute que l'écoute |
| Gate « file vide » (désactivation bouton) | Frontend (React) | — | `useOutboxGate` lit l'état client TanStack Query, jamais le serveur |
| File sortante (source unique) | Frontend (état client persisté) | — | D-01 : `setQueryData` uniquement, query structuralement inrefetchable (CR-01) |
| Différence de build (hash precache) | Build (Vite) | — | Générée par Rollup au build, consommée par `workbox-precaching` |
| Servir deux builds / revalidation `/sw.js` | Serveur statique | — | `no-cache` sur `/sw.js` (nginx en prod, serveur harnais en e2e) |
| Harnais d'injection file non vide | Frontend (flag build) | — | Écrit dans le store existant, élagué des builds production |

---

## User Constraints (project instructions — strict, §2.7)

- **Aucune directive de linter** : pas d'ESLint/Biome/Prettier ; les raisons s'écrivent en commentaires français nommés. `app/src/lib/no-eslint-directive.test.ts` refuse leur réintroduction.
- **Rouge avant vert** : sur un fichier de test nouveau, un échec est la norme ; un contrôle se prouve sur un cas qui doit échouer.
- **Aucun flag watch-mode** dans les commandes de vérification.
- **Chaîne §2.7 avant commit** : `npm run typecheck && npm test && npm run build`, `npm run test:e2e`, `check-sql-statique.py` + son auto-test (`test-db.sh` requis seulement si SQL touché — ici aucun SQL, donc non requis).
- **Un succès muet est un échec inexpliqué** (§2.7 F) : chaque étape du wrapper doit produire une preuve citée.
- **Commentaires français nommant les raisons** ; pas de réparation opportuniste hors périmètre.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GATE-01 | Chemin runtime complet de la gate « file vide » validé e2e au moins une fois contre build+preview réel (deux builds successifs, hash de precache distinct, contexte Playwright neuf, build ID injecté `VITE_BUILD_ID`) ; GATE-PROD reste observatoire hors jalon | Mécanique en deux dists + même origin décrite ci-dessous ; `VITE_BUILD_ID` n'existe PAS encore (`grep VITE_BUILD_ID` sur `app/` : zéro occurrence [VERIFIED: session]) — à introduire via `import.meta.env` + define/ENV au build |

---

## Standard Stack

Aucun package nouveau n'est nécessaire. Toute la mécanique existe :

### Core (déjà installés)
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `vite-plugin-pwa` | (installé, `strategies: 'injectManifest'`) | Génère `dist/sw.js` avec manifeste de precache à hash | [VERIFIED: app/vite.config.ts, bloc VitePWA] |
| `workbox-precaching` (dans `src/sw.ts`) | — | `precacheAndRoute(self.__WB_MANIFEST)` consomme les hash | [VERIFIED: app/src/sw.ts imports] |
| `@playwright/test` | (config existante) | Contextes neufs = registre SW isolé par contexte | [VERIFIED: app/playwright.config.ts] |
| Node `http` (natif) | runtime | Serveur statique no-cache du harnais — PAS de `serve`/`http-server` (dépendance nouvelle inutile) | [VERIFIED: npm global, natif] |

### À créer (pas des dépendances)
- `VITE_BUILD_ID` : lu par `import.meta.env.VITE_BUILD_ID` dans le harnais ; passé au build via variable d'environnement (`VITE_BUILD_ID=$(date +%s) npm run build`) — Vite expose les `VITE_*` de l'environnement à `import.meta.env`. [ASSUMED: mécanisme `import.meta.env` Vite — vérifier en premier plan via un `console.log` au build 1]

---

## Comment la gate fonctionne aujourd'hui (lu ce session)

### Chaîne complète

1. **`app/src/main.tsx`** (ligne 3-5) : importe `@/lib/sw-register` pour l'effet de bord. [VERIFIED]
2. **`app/src/lib/sw-register.ts`** : store Zustand `useSwState` (`registration`, `needsRefresh`) + `registerSW({ immediate: true, onNeedRefresh(), onRegisteredSW })`. `onNeedRefresh` pousse `{ kind: 'sw-update', priority: 1 }` dans `useBannerStore` (dédupliqué par le store) et pose `needsRefresh: true`. `updateSW` (retour de `registerSW`) est la fonction d'application de la mise à jour. [VERIFIED: fichier entier lu]
3. **`app/src/components/banners/banner-slot.tsx`** : mapping `kind → composant` ; `'sw-update'` rend `<UpdateBanner updateSW={updateSW} />` ; monté dans `app/src/app/app-shell.tsx:395`. [VERIFIED]
4. **`app/src/components/banners/update-banner.tsx`** : `const { isEmpty } = useOutboxGate()` ; bouton `disabled={!isEmpty}`, libellé `'Recharger'` si vide, `'Mise à jour en préparation…'` sinon ; clic → `updateSW()`. « Plus tard » → `dismiss('sw-update')`. [VERIFIED: fichier entier lu]
5. **`app/src/hooks/use-outbox-gate.ts`** : `{ isEmpty: pendingCount === 0 }` dérivé de `useOutbox()`. Contrat D-10 : « la gate désactive le bouton, elle ne filtre jamais l'appel ». [VERIFIED: fichier entier lu]
6. **`app/src/hooks/use-outbox.ts`** : source unique D-03. La file n'est JAMAIS fetchée — `queryFn` rend l'état actuel, `staleTime: Infinity`, refetch désactivés (CR-01). Clé : `[...OUTBOX_KEY, userId, householdId]` où `userId` vient de `useSessionStore` et `householdId` de `useHouseholdStore`. **Le hook est inactif sans couple (utilisateur, foyer) établi** (`enabled`). `OUTBOX_KEY` et le type `OutboxEntry` sont exportés par `app/src/lib/offline/outbox.ts` (non lu ce session — le planneur doit citer la forme exacte de `OutboxEntry` verbatim avant d'écrire l'injection du harnais). [VERIFIED partiellement ; OutboxEntry: ASSUMED]

### Configuration Vite PWA [VERIFIED: app/vite.config.ts]

- `registerType: 'prompt'`, `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, `devOptions: { enabled: false }` — **le SW ne s'enregistre jamais sous `vite dev`**, uniquement sur un build (`vite preview` OK). `maximumFileSizeToCacheInBytes: 4 Mio`.
- Le manifeste de precache est généré par injectManifest : chaque chunk `dist/assets/*.js` porte un hash d'URL ; deux builds avec une source différente produisent deux `sw.js` octet-distincts. Preuve mécanique disponible : `scripts/check-precache-coverage.sh` vérifie déjà que chaque chunk de `dist/assets` apparaît dans `dist/sw.js` — le wrapper peut réutiliser ce test pour prouver que les deux dists ont des hash distincts (`diff dist-v1/sw.js dist-v2/sw.js` non vide = preuve, §2.7 F).

### Cache HTTP [VERIFIED: app/nginx.conf lignes ~48-80]

- `location = /sw.js { expires -1; }` → `Cache-Control: no-cache` ; `location /assets/ { expires 1y; }` ; `location / { expires -1; try_files $uri $uri/ /index.html; }`. Le serveur du harnais doit reproduire ces trois règles (no-cache partout sauf assets, fallback SPA) pour que le check de mise à jour du SW voie le nouveau `sw.js`.

### Playwright [VERIFIED: app/playwright.config.ts]

- `PORT = 4173`, `baseURL = E2E_BASE_URL ?? http://127.0.0.1:4173` ; `testIgnore: process.env.E2E_BASE_URL ? [] : ['**/join-token-real.spec.ts']` — **pattern exact à copier** pour `sw-gate-real.spec.ts` (exclue du run standard, incluse dans le run du wrapper qui pose une variable).
- `webServer` standard : `npm run build && npm run preview -- --port 4173 --strictPort` (un seul build). Le run SW contourne ce webServer en posant `E2E_SW_BASE_URL` (voir wrapper).
- Projets `chromium` + `mobile` ; `fullyParallel: true`. Les contextes Playwright sont isolés (registre SW par contexte) — « contexte neuf » est le comportement par défaut de chaque test. **Attention** : deux projets sur le même origin + serveur commuté → sérialiser la spec (voir Pitfalls).

---

## Architecture Patterns

### Diagramme du scénario e2e (flux de données)

```
wrapper scripts/test-sw-gate.sh
  ├─ build 1 : VITE_BUILD_ID=<id1> npm run build  → dist-v1/ (hash A)
  ├─ build 2 : VITE_BUILD_ID=<id2> npm run build  → dist-v2/ (hash B ≠ A)
  ├─ preuve : diff dist-v1/sw.js dist-v2/sw.js non vide (§2.7 F)
  ├─ serveur Node natif (no-cache, SPA fallback) : symlink dist-current → dist-v1
  ├─ E2E_SW_BASE_URL=http://127.0.0.1:4173 npx playwright test e2e/sw-gate-real.spec.ts
  │
  spec (2 tests, contexte neuf chacun) :
  ├─ TEST A — file vide → bandeau + application :
  │    page 1 : charge / (dist-v1) → SW v1 actif, PAS de bandeau
  │    [wrapper/symlink] dist-current → dist-v2
  │    page.reload() → navigateur revalide /sw.js → diff octets →
  │    worker v2 installé, EN ATTENTE (pas de skipWaiting) →
  │    onNeedRefresh → bandeau « Une mise à jour est disponible » RÉEL
  │    file vide (harnais n'injecte rien) → bouton « Recharger » actif
  │    clic → updateSW() → reload → precache v2 servi ; assert build id = id2
  │
  └─ TEST B — file non vide → bouton bloqué :
       même mécanique jusqu'au bandeau, puis :
       harnais window hook : setQueryData(outbox, [1 entrée pending])
       → useOutboxGate isEmpty:false → libellé « Mise à jour en préparation… »
       → clic impossible (disabled) ; « Plus tard » referme
```

### Harnais dev-only (SC3 : injection dans le store, sans fork)

- **Flag de compilation** : module `app/src/lib/e2e-sw-harness.ts` (nom à décider au plan) importé depuis `main.tsx` derrière `if (import.meta.env.VITE_E2E_SW_HARNESS === '1')` — les builds production et le build e2e standard ne posent jamais ce flag, le module est élagué (tree-shaking sur constante d'environnement). [ASSUMED: l'élimination de code morte sur `import.meta.env.X === '1'` fonctionne avec Rollup — vérifier dans le bundle du build 1]
- **Exposition** : `window.__eoSwHarness = { buildId, injectOutboxPending(), clearOutbox() }`. `injectOutboxPending` récupère le `queryClient` (le même singleton que l'app — il existe un accès hors-React au store, patron `sw-register.ts` qui fait `useBannerStore.getState()` ; pour TanStack Query, passer le `QueryClient` au module harnais à l'initialisation, jamais un second client) et fait `setQueryData([...OUTBOX_KEY, userId, householdId], [entrée])` avec `userId`/`householdId` lus via `useSessionStore.getState()` / `useHouseholdStore.getState()` (patron existant). Le harnais écrit dans la source unique — il ne duplique aucun comptage.
- **Prérequis** : la query outbox n'existe que si un couple (utilisateur, foyer) est établi. Le mode démo e2e fournit une session (voir `critical-paths.spec.ts`) — le planneur doit vérifier comment la session/le foyer démo s'établissent au chargement de `/` avant d'écrire l'injection ; si aucun couple n'est posé au premier paint, le harnais doit d'abord poser l'état des deux stores, puis `setQueryData`.

### Pattern du wrapper (phase 39) [VERIFIED: scripts/test-join-token-real.sh]

- En-tête documenté (« CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS »), `set -eu`, refuse explicitement sans sa ressource (ici : jamais de skip silencieux), ne peuple jamais la suite standard.
- Copie à adapter : le script `test-sw-gate.sh` construit les deux dists, prouve la distinction des hash, démarre le serveur, pose `E2E_SW_BASE_URL` (et `E2E_SW_HARNESS=1` pour le flag de compilation du harnais), lance la spec, purge les artefacts (dist-v1/dist-v2/dist-current) en sortie — pattern « guard + purge » demandé.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Détection de mise à jour SW | Scrutation manuelle de `registration.waiting` | Le chemin `registerSW`/`onNeedRefresh` existant (SC3) | Forker la logique invaliderait la preuve |
| Hash de precache | Invention d'un hash maison | Les hash Rollup réels de `dist/sw.js` | SC1 exige des hash réels, non mockés |
| Serveur statique e2e | nginx + Docker | Node `http` natif ~50 lignes | Reproduire 3 règles nginx suffit ; Docker est lourd et non requis pour un build statique |
| Génération de fichier contrôlé | API de contrôle réseau sur le serveur | Symlink `dist-current` commuté par le script | Simple, inspectable, aucune surface réseau de contrôle |

---

## Common Pitfalls

### Pitfall 1: `vite dev` n'enregistre jamais le SW
**What goes wrong:** vouloir « simuler » contre le dev server. `devOptions: { enabled: false }` [VERIFIED: vite.config.ts].
**Avoid:** tout passe par `npm run build` + serveur statique — c'est d'ailleurs exactement « build+preview réel » exigé par SC1.

### Pitfall 2: deux origins ≠ même registre SW
**What goes wrong:** servir build 1 sur `:4173` et build 2 sur `:4174` — le worker de l'origin A ne voit jamais les fichiers de l'origin B ; aucune mise à jour ne se déclenche.
**Avoid:** même port, même host (`127.0.0.1:4173`) pour les deux dists ; commutation par symlink + rechargement de page.

### Pitfall 3: cache du sw.js
**What goes wrong:** si le serveur du harnais met `sw.js` en cache agressif, le navigateur peut ne pas voir la nouvelle version. Le navigateur ignore le cache HTTP pour le script SW si sa réponse date de moins de 24 h (comportement par défaut `updateViaCache: 'imports'`), mais reproduire `expires -1` (no-cache) élimine toute la question. [ASSUMED: comportement de revalidation du script SW — ceinture: no-cache serveur rend le point sans objet]
**Avoid:** `Cache-Control: no-cache` sur TOUTES les réponses du serveur harnais (le precache hashed n'a pas besoin de cache long dans un run e2e).

### Pitfall 4: `fullyParallel` + serveur commuté
**What goes wrong:** pendant que le projet `mobile` attend dist-v2, le projet `chromium` re-commute le symlink → flake.
**Avoid:** la spec SW tourne seule (le wrapper ne passe qu'elle à `playwright test <fichier>`), avec `workers: 1` pour ce run ; ou les deux tests dans un seul `test.describe.serial`. La commutation dist-current doit être faite par le script entre les deux tests via un fichier de contrôle lu par le serveur, OU les deux tests utilisent chacun leur propre sous-scénario : plus simple — le symlink commute par un fichier de contrôle `dist-current` que le serveur relit à chaque requête, et le test lui-même écrit la commutation via `exec` côté script (voir recommandation : la spec orchestre la commutation elle-même en écrivant le fichier de contrôle, un seul test séquentiel couvre les deux branches dans un seul parcours — c'est le plus simple et le plus déterministe).

### Pitfall 5: le harnais doit poser la session avant d'injecter
**What goes wrong:** `useOutbox` est `enabled` seulement avec `userId` ET `householdId` [VERIFIED: use-outbox.ts] — `setQueryData` sur une clé d'une query jamais montée ne fait rien de visible : le comptage reste 0, le bouton reste actif, le test A2 passe à tort.
**Avoid:** le harnais pose d'abord `useSessionStore`/`useHouseholdStore` (ou attend le couple démo), puis `setQueryData` sur la clé calculée depuis les stores — et le test vérifie l'effet AVANT l'assertion de gate (rouge avant vert : sans session posée, le test doit échouer).

### Pitfall 6: `preview` vite vs serveur harnais
**What goes wrong:** réutiliser `vite preview` pour les deux dists impose d'arrêter/redémarrer le serveur entre les builds (même port requis) — fenêtre de coupure pendant que le navigateur attend.
**Avoid:** serveur Node natif du wrapper, relecture du symlink à chaque requête — commutation à chaud sans coupure.

### Pitfall 7: timing de `onNeedRefresh`
**What goes wrong:** après le reload sur dist-v2, le worker v2 doit finir `install` avant d'être `waiting` ; le bandeau n'apparaît qu'ensuite.
**Avoid:** `expect.poll` / attente de visibilité du bandeau avec le timeout `expect: 8_000` existant ; ne jamais `waitForTimeout` figé.

---

## Code Examples

### Serveur statique du harnais (Node natif, no-cache, SPA fallback, symlink)

```javascript
// scripts/e2e-sw-server.mjs — reprend les 3 règles de app/nginx.conf
// (no-cache /sw.js, /assets long — inutile ici, no-cache global accepté,
// fallback SPA). Relecture du symlink à CHAQUE requête : commutation à chaud.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = () => readFileSync(new URL('./dist-current', import.meta.url), 'utf8').trim();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

createServer((req, res) => {
  const base = root();
  let path = join(base, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(base, 'index.html'); // fallback SPA
  res.setHeader('Cache-Control', 'no-cache'); // reproduit expires -1 de nginx.conf
  res.setHeader('Content-Type', MIME[extname(path)] ?? 'application/octet-stream');
  res.end(readFileSync(path));
}).listen(4173, '127.0.0.1');
```

### Squelette du test A (branche file vide)

```typescript
// app/e2e/sw-gate-real.spec.ts — extrait illustratif
import { expect, test } from '@playwright/test';

const id1 = process.env.E2E_SW_BUILD_ID_1!; // prouvé distincts par le wrapper
const id2 = process.env.E2E_SW_BUILD_ID_2!;

test('gate « file vide » : bandeau réel sur worker en attente, puis application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveCount(0); // pas de bandeau sur v1
  await page.evaluate(() => (window as any).__eoSwHarness.ready());
  expect(await page.evaluate(() => (window as any).__eoSwHarness.buildId)).toBe(id1);

  await commuterVersBuild2(); // écrit le fichier de contrôle / symlink (voir plan)

  await page.reload(); // le navigateur revalide /sw.js → worker v2 en attente
  const banner = page.getByText('Une mise à jour est disponible');
  await expect(banner).toBeVisible(); // bandeau RÉEL, poussé par onNeedRefresh

  const recharger = page.getByRole('button', { name: 'Recharger' });
  await expect(recharger).toBeEnabled(); // file vide
  await recharger.click();
  await expect(page.evaluate(() => (window as any).__eoSwHarness.buildId))
    .resolves.toBe(id2); // la mise à jour est appliquée
});
```

*(Le `buildId` vient de `import.meta.env.VITE_BUILD_ID` lu par le harnais — jamais d'une chaîne codée en dur.)*

---

## Approches considérées (effort / risque)

| Approche | Effort | Risque | Verdict |
|----------|--------|--------|---------|
| **A. Wrapper + spec dédiée + serveur Node natif + symlink** (recommandée) | ~1 plan : harnais (~80 lignes), serveur (~50), spec (~120), script (~80) | Faible — tout est inspectable, aucun nouveau package | ✅ Satisfait SC1-SC4 |
| B. `vite preview` redémarré entre les deux dists | Plus simple côté serveur | Fenêtre de coupure + gestion de port strict ; le webServer standard tourne déjà sur 4173 → collision | ❌ Fragile |
| C. Docker nginx pour le harnais | Réutilise nginx.conf exact | Docker requis pour un run e2e (chaîne §2.7 dit « Docker n'est pas toujours disponible ») ; lourd | ❌ Contre l'esprit de la chaîne |
| D. Interception réseau Playwright pour servir le 2e sw.js | Aucun second build | SC1 exige de VRAIS hash de precache de deux builds réels ; l'interception des requêtes SW par Playwright est par ailleurs peu fiable | ❌ Viole SC1 |
| E. Spec dans le run e2e standard (build double dans webServer) | Zéro wrapper | Double build (~min) à CHAQUE run e2e ; le run standard doit rester rapide et vert | ❌ Coût permanent injustifié |

---

## Runtime State Inventory

Non applicable (pas de rename/refactor/migration). Aucun SQL touché — `test-db.sh` non requis.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | serveur harnais + builds | ✓ (runtime du projet, 24 LTS) | — | — |
| Playwright | spec e2e | ✓ (installé, config existante) | — | — |
| Docker | — (aucun SQL, aucun service) | non requis | — | — |

Aucune dépendance manquante. Aucun package npm nouveau à installer — **Package Legitimacy Audit : sans objet** (aucune installation externe).

## Security Domain

Phase de test sans surface d'attaque nouvelle : le harnais est compilé uniquement sous `VITE_E2E_SW_HARNESS=1` (jamais en production), n'expose aucune donnée, aucune fonction sensible — seulement un `setQueryData` local. Aucune clé, aucun réseau sortant. ASVS : sans objet (V5 sans objet — aucune entrée utilisateur). Vérification résiduelle : s'assurer que le flag n'est posé par aucun Dockerfile/build production (`grep VITE_E2E_SW_HARNESS app/Dockerfile compose.app.yaml` → 0 occurrence).

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | Vitest 5 + Playwright (existants) |
| Quick run command | `cd app && npm run test:e2e -- e2e/sw-gate-real.spec.ts` **via le wrapper** `sh scripts/test-sw-gate.sh` (la spec est `testIgnore` hors du run standard) |
| Full suite command | `cd app && npm run test:e2e` (doit rester 100 % vert sans le wrapper) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | Deux builds, bandeau réel, gate vide/non vide | e2e (Playwright, chromium d'abord — mobile peut suivre) | `sh scripts/test-sw-gate.sh` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `app/e2e/sw-gate-real.spec.ts` — couvre GATE-01 (rouge avant vert)
- [ ] `app/src/lib/e2e-sw-harness.ts` + branchement flag dans `main.tsx`
- [ ] `scripts/e2e-sw-server.mjs` + `scripts/test-sw-gate.sh`

---

## GATE-PROD : consignation de l'observatoire

L'obligation existe déjà [VERIFIED: .planning/REQUIREMENTS.md:44 « GATE-PROD : re-test des tests 32-UAT 7 et 35-UAT 2 à la première utilisation observée d'un déploiement naturel (observatoire événementiel, non planifiable) » et .planning/STATE.md:68]. La phase 41 ne doit PAS la consommer : la livraison nomme explicitement, dans le résumé de phase (ou un court `41-GATE-PROD.md` dans le répertoire de phase, pattern 38-E2E-SIGNATURE.md pour un artefact de preuve), que (a) cette validation est une simulation contre build+preview, (b) le re-test réel à la prochaine mise en production naturelle reste dû, (c) la ligne STATE.md:68 reste inchangée.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import.meta.env.VITE_BUILD_ID` est peuplé depuis la variable d'environnement du même nom au build | Standard Stack | La spec ne peut pas distinguer id1/id2 → recours : `define` dans vite.config.ts |
| A2 | Le tree-shaking élimine le harnais des builds sans flag | Harnais | Faux positif de sécurité (harnais en prod) — vérifier `grep` sur le bundle du build standard |
| A3 | Le navigateur ignore le cache HTTP pour la revalidation de sw.js (<24 h) | Pitfall 3 | Sans conséquence si no-cache serveur (ceinture posée) |
| A4 | La forme exacte de `OutboxEntry` (champs, statuts) — fichier `app/src/lib/offline/outbox.ts` NON lu ce session | Harnais | Injection mal formée → comptage faux, test A2 vert à tort → le planneur DOIT citer le type verbatim avant d'écrire le harnais |
| A5 | Le mode démo e2e établit un couple (session, foyer) au chargement de `/` | Pitfall 5 | `useOutbox` inactif → injection sans effet |

## Open Questions (RESOLVED in 41-01-PLAN.md)

1. **Lecture de SC2 « file non vide (bandeau absent) »** — le code actuel affiche le bandeau AVEC bouton désactivé quand la file est non vide et un worker attend [VERIFIED: update-banner.tsx]. Deux lectures possibles : (a) « pas de bandeau » = scénario où seul le harnais a injecté une file, sans mise à jour SW → aucun bandeau n'apparaît (preuve que la file seule ne déclenche rien) ; (b) coquille voulant dire « bouton bloqué ». **RESOLVED (Task 2)** : les DEUX branches sont couvertes — file seule sans update → aucun bandeau (cas 3, branche OQ-1a) ; file + update → bandeau + bouton bloqué (cas 1, branche OQ-1b).
2. **chromium seul ou aussi projet `mobile`** — **RESOLVED (Task 1, décision 1)** : chromium seul, un seul `--project=chromium` (pattern phase 39, T-39-06).
3. **A5 : comment la session démo s'établit** — **RESOLVED (Task 2, étape 0)** : OutboxEntry citée verbatim (A4) et établissement session/foyer démo vérifiés AVANT toute assertion — HALT si non vérifiable.

## Recommended Approach (résumé)

**Approche A — wrapper + spec dédiée + harnais flag-compilé + serveur Node natif :**

1. `VITE_BUILD_ID` : lu par le harnais via `import.meta.env`, posé par le wrapper au build (A1 à vérifier en premier).
2. `app/src/lib/e2e-sw-harness.ts` : module flag-compilé exposant `window.__eoSwHarness { buildId, ready(), injectOutboxPending(), clearOutbox() }` — écrit UNIQUEMENT dans les stores existants (`queryClient.setQueryData` sur la clé D-03, stores session/household si nécessaire). Aucune touche à `sw-register.ts`, `use-outbox-gate.ts`, `update-banner.tsx` (garde §2.7 : `git diff` sur ces trois fichiers = 0 ligne hors import du harnais).
3. `scripts/e2e-sw-server.mjs` : serveur statique no-cache + fallback SPA, symlink `dist-current` relu à chaque requête.
4. `scripts/test-sw-gate.sh` : pattern `test-join-token-real.sh` — deux builds (`dist-v1`, `dist-v2`, `VITE_BUILD_ID` distincts), preuve `diff dist-v1/sw.js dist-v2/sw.js` non vide, garde si dists identiques, purge en sortie, `E2E_SW_BASE_URL` + run de la spec seule (`workers: 1`).
5. `app/e2e/sw-gate-real.spec.ts` : `testIgnore` sur variable (pattern `join-token-real.spec.ts`), un parcours séquentiel : v1 sans bandeau → commutation → reload → bandeau réel + file vide → « Recharger » → build id v2 ; puis harnais file non vide → « Mise à jour en préparation… » bloqué ; puis file seule sans update → aucun bandeau (OQ-1a).
6. Consignation GATE-PROD : ligne STATE.md:68 inchangée + rappel dans le résumé de phase.

**Effort estimé :** 1 plan unique, ~350 lignes de code/tests/scripts, aucune dépendance nouvelle, aucun SQL, Docker non requis.

---

## Sources

### Primary (HIGH confidence — code lu ce session)
- `app/src/lib/sw-register.ts` (entier) — gate, stores, onNeedRefresh
- `app/src/hooks/use-outbox-gate.ts` (entier) — contrat D-10
- `app/src/hooks/use-outbox.ts` (l.1-40) — source unique D-03, clé, CR-01
- `app/src/components/banners/update-banner.tsx`, `banner-slot.tsx`, `banner-store.ts` — bandeau, déduplication, mapping
- `app/vite.config.ts` — VitePWA injectManifest, prompt, devOptions disabled
- `app/playwright.config.ts` — webServer, testIgnore pattern, ports
- `app/nginx.conf` (l.30-80) — règles cache
- `app/src/sw.ts` (l.1-120) — injectManifest, workbox-precaching
- `app/src/main.tsx` — branchement sw-register
- `scripts/test-join-token-real.sh` (l.1-80) — pattern wrapper
- `scripts/check-precache-coverage.sh` — preuve precache/sw.js
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` — GATE-01, GATE-PROD
- `grep VITE_BUILD_ID app/` → 0 occurrence (n'existe pas encore)

### Secondary (MEDIUM)
- `app/e2e/offline-shared-device.spec.ts` — pattern d'écart documenté mode démo
- `.planning/phases/38-filet-de-tests-fiable/38-E2E-SIGNATURE.md` — pattern d'artefact de preuve

### Tertiary (LOW)
- Comportements navigateur SW (revalidation sw.js, cycle install/waiting) : [ASSUMED] — mécanismes standard, ceintures posées dans le design (no-cache serveur, attentes par visibilité)
