# Phase 41 : Gate SW simulable — Carte des patrons

**Généré :** 2026-11-10
**Fichiers analysés :** 6
**Analogues trouvés :** 6 / 6

## Classification des fichiers

| Fichier (nouveau/modifié) | Rôle | Flux de données | Analogue le plus proche | Qualité |
|---------------------------|------|-----------------|-------------------------|---------|
| `app/e2e/sw-gate.spec.ts` | test e2e | request-response (build+preview local) | `app/e2e/join-token-real.spec.ts` (+ `offline-shared-device.spec.ts`) | exact (structurale) |
| `scripts/test-sw-gate.sh` | script d'orchestration shell | batch (2 builds → preview → spec) | `scripts/test-join-token-real.sh` | exact |
| `app/src/lib/sw-register.ts` (modification) | hook/provider (hors-React) | event-driven (SW lifecycle) | lui-même + `use-outbox-gate.ts` (contrat de frontière) | n/a (pas de fork) |
| `update-banner.tsx` + `banner-store.ts` (lecture/modif légère) | component + store | event-driven (pub-sub zustand) | eux-mêmes — extraits pour la spec | n/a |
| `app/vite.config.ts` (probable lecture seule) | config build | transform | lui-même — bloc `VitePWA` l.63-94 | n/a |
| `docs/EXPLOITATION.md` (enregistrement GATE-PROD) | doc exploitation | n/a | conventions du fichier (§2.7 I : toute affirmation vérifiée) | partielle |

Conventions qui pilotent tout le plan (AGENTS.md §2.7) : **aucune directive
linter**, commentaires en **français qui nomment les raisons**, preuve
**rouge-avant-vert** (un contrôle se prouve sur un cas qui doit échouer),
**aucun skip silencieux** (JT-03), un **seul projet Playwright** dans un run
wrapper (Pitfall 4 / T-39-06).

## Affectations de patrons

### `app/e2e/sw-gate.spec.ts` (test e2e, build+preview réel)

**Analogues :** `app/e2e/join-token-real.spec.ts` (structure), `app/e2e/offline-shared-device.spec.ts` (lecture navigateur via `page.evaluate`), `app/e2e/critical-paths.spec.ts` (mode démonstration local).

**En-tête documentaire à copier** (join-token-real.spec.ts l.3-36) : un bloc
JSDoc qui dit **ce que la spec prouve et ce qu'elle ne prouve pas**, avec
références aux décisions D-xx et aux critères de la phase :

```typescript
/**
 * Spec e2e RÉELLE du parcours join-token (flux 31-03) — JT-02, TEST-02.
 *
 * Elle ne tourne QUE contre la stack déployée, orchestrée par
 * `scripts/test-join-token-real.sh` : ...
 *
 * BORNAGE — CE QUE CETTE SPEC VÉRIFIE, ET CE QU'ELLE NE PEUT PAS VÉRIFIER
 *   ...
 *   Aucun marquage conditionnel d'omission dans ce fichier : sans stack, le
 *   wrapper refuse et la spec échoue — elle ne s'ignore jamais (JT-03 ;
 *   contre-modèle explicite : offline-shared-device.spec.ts l.38).
 */
```

**Refus nommé sans entrées** (join-token-real.spec.ts l.40-52) — à reproduire
pour `VITE_BUILD_ID` / artefacts des deux builds :

```typescript
function variableRequise(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. ` +
        '... Elle échoue sans ses entrées — jamais de skip conditionnel (JT-03).',
    );
  }
  return valeur;
}
```

**Assertion sur la valeur réelle posée par l'app, jamais un doublon du test**
(join-token-real.spec.ts l.64-71) — même discipline pour le verbatim du
bandeau « Une mise à jour est disponible » / « Recharger » / « Mise à jour en
préparation… » (update-banner.tsx l.25-32, verbatim exact dans les deux
branches de `isEmpty`) :

```typescript
// D-17 — le verbatim de `translateRedeemError` pour un token expiré. Il est
// écrit ici en toutes lettres parce que la spec vérifie le DOM réel : le
// renommer côté application DOIT casser cette spec.
const VERBATIM_EXPIRE = 'Ce lien a expiré. Demandez-en un nouveau à l’administrateur.';
```

**Lectures navigateur brutes** (offline-shared-device.spec.ts l.41-63) —
patron pour lire l'état du SW depuis la page (registration, caches precache)
au lieu de deviner via le DOM seul :

```typescript
async function clesCacheBrutes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        /* ... indexedDB.open(...) ... */
      }),
  );
}
```

**Différence attendue avec l'analogue** : la spec sw-gate tourne contre le
**build+preview local** (mode des critical-paths, l.3-7 : « mode
démonstration — aucun backend requis »), pas contre la stack déployée. Le
`testIgnore` de la config Playwright (voir plus bas) devra donc la router
comme join-token-real, ou par variable dédiée (ex. `E2E_SW_GATE=1`).

---

### `scripts/test-sw-gate.sh` (orchestration des deux builds)

**Analogue :** `scripts/test-join-token-real.sh`.

**En-tête « ce que ce script prouve, et ce qu'il ne prouve pas »** (l.8-28) —
structure à reproduire intégralement, en remplaçant « stack déployée » par
« build+preview local, deux builds successifs » :

```sh
# scripts/test-join-token-real.sh
# Spec e2e RÉELLE du parcours join-token (flux 31-03) contre la stack déployée.
#
# CE QUE CE SCRIPT PROUVE, ET CE QU'IL NE PROUVE PAS
#   La suite e2e standard tourne en mode démonstration (build + preview, aucun
#   backend) : elle prouve le UI, pas la chaîne réelle. Ce script, lui, fait
#   tourner ...
#
#   C'est l'analogue de `test-dispatch-push.sh` pour l'application : un run
#   séparé, documenté, qui exige une ressource réelle (stack déployée) et qui
#   REFUSE sans elle — jamais de skip silencieux (JT-03). La suite e2e
#   standard reste 100 % verte sans ce script (JT-01).
```

**Validation des prérequis AVANT tout travail, refus nommé** (l.56-64, l.107-114)
— ici le « prérequis » sera : toolchain dispo, `npm run build` paramétrable
par `VITE_BUILD_ID`, Playwright installé :

```sh
if [ ! -f "$STACK_ENV" ]; then
  echo "test-join-token-real.sh: $STACK_ENV introuvable." >&2
  echo "  Le run réel exige le .env de la stack (...)" >&2
  exit 1
fi
```

**Run de la spec : UN seul projet + sous-shell `cd app`** (l.283-293) — la
config définit chromium ET mobile ; sans `--project=chromium`, la spec
sw-gate (deux builds, ~plusieurs minutes) tournerait 2× pour rien :

```sh
cd "$REPO_DIR"
if (cd app && npx playwright test e2e/join-token-real.spec.ts --project=chromium); then
  SPEC_STATUS=0
else
  SPEC_STATUS=$?
fi
```

**Différences attendues avec l'analogue** (à nommer en commentaire) :
1. Pas de secrets §2.7 H — la ressource est un build local, la seule variable
   sensible éventuelle est publique (`VITE_BUILD_ID` est une valeur de test).
2. Pas de cleanup de comptes — mais **un cleanup du répertoire d'artefacts**
   (les deux `dist-<id>` ou répertoires de preview) avec verdict rapporté
   (§2.7 F : aucun succès muet).
3. Le script doit **construire deux fois** avec deux `VITE_BUILD_ID` distincts
   et vérifier que les hash de precache diffèrent AVANT de lancer la spec —
   sinon la preuve n'est pas tenable (contrôle se prouve sur son entrée).

---

### `app/src/lib/sw-register.ts` (modification, SANS fork de la gate)

**Analogue :** le fichier lui-même + `app/src/hooks/use-outbox-gate.ts`
(contrat de frontière figé).

**Ce qui existe et ne doit pas être dupliqué** (sw-register.ts l.26-36) — la
gate « file vide » vit ici et dans `update-banner.tsx` ; le harnais injecte
dans les stores existants, il ne réimplémente jamais :

```typescript
export const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Dédupliqué par le store (Pitfall 4) — un push répété ne duplique pas.
    useBannerStore.getState().push({ kind: 'sw-update', priority: 1 });
    useSwState.setState({ needsRefresh: true });
  },
  onRegisteredSW(_, registration) {
    useSwState.getState().setRegistration(registration ?? null);
  },
});
```

**Style du hook de frontière** (use-outbox-gate.ts l.3-14) : signature stable,
contrat documenté, « AUCUN composant de la phase 32 ne change » — le hook de
harnais ajouté à `sw-register.ts` doit suivre exactement cette forme :

```typescript
/**
 * Contrat D-10 : le bouton « Recharger » ... Branchée en phase 34 (D-03) sur
 * la source unique `useOutbox` : ... le hook garde sa signature
 * `{ isEmpty: boolean }` — le contrat de frontière est que AUCUN composant de
 * la phase 32 ne change.
 */
export function useOutboxGate(): { isEmpty: boolean } {
```

**Comment déclarer l'injection sans fork** : patron `VITE_*` build-time (le
projet n'injecte encore aucun `import.meta.env.VITE_BUILD_ID`) — s'appuyer sur
la convention Docker documentée (AGENTS.md §8.2 : `ARG VITE_...` → `ENV` →
Vite l'incorpore au bundle). L'exposition test devrait être un accès
`import.meta.env.VITE_BUILD_ID` dans le module + un point d'injection
`dev-only` (ex. `window.__swGateHarness` posé conditionnellement quand
`import.meta.env.DEV` ou une variable dédiée est définie) — jamais un
doublon de `onNeedRefresh`.

**Garde anti-fork** : l'extraction hors de `main.tsx` existe pour l'accès au
store hors-React (« patron `session-store.ts` », sw-register.ts l.1-5) — le
harnais doit consommer `useSwState` / `useBannerStore` via `getState()`, pas
recréer des stores parallèles.

---

### `update-banner.tsx` + `banner-store.ts` (référence de la spec, modif au plus léger)

**Analogues :** eux-mêmes — la spec e2e doit consommer leur DOM réel.

**Verbatim du DOM réel** (update-banner.tsx l.20-37) — ce que la spec
asserte, en toutes lettres :

```tsx
<div role="status" className="flex flex-wrap ...">
  <p className="m-0">Une mise à jour est disponible</p>
  <Button variant="secondary" disabled={!isEmpty} onClick={() => void updateSW()}>
    {isEmpty ? 'Recharger' : 'Mise à jour en préparation…'}
  </Button>
  <Button variant="quiet" onClick={() => dismiss('sw-update')}>Plus tard</Button>
</div>
```

**La gate elle-même** (update-banner.tsx l.19) : `const { isEmpty } =
useOutboxGate();` — condition « file vide → banner présent, bouton actif » et
« file non vide → bouton désactivé » sont les DEUX conditions que GATE-01 doit
prouver. Le chemin « banner absent » passe par la déduplication du store
(banner-store.ts l.27-37 : un `kind` déjà présent est remplacé, jamais
dupliqué) et par l'absence d'appel `onNeedRefresh` quand aucun worker en
attente n'existe.

**Test unitaire existant à ne pas casser** : `app/src/components/banners/update-banner.test.tsx` et `banner-store.test.ts` couvrent déjà les deux branches en RTL — la spec e2e ajoute la preuve **runtime avec un vrai SW**, elle ne remplace pas ces tests.

---

### `app/vite.config.ts` (probable lecture seule)

**Analogue :** le bloc `VitePWA` existant (l.63-94). Points qui contraignent
la simulation :

```typescript
strategies: 'injectManifest',   // sw.ts main — le precache est un manifeste injecté
srcDir: 'src', filename: 'sw.ts',
devOptions: { enabled: false }, // aucun SW en dev : la simulation passe forcément par build+preview
```

- `devOptions.enabled: false` l.92 : **impossible de simuler la gate en dev** — les deux builds + `npm run preview` (cf. webServer du playwright.config l.36 : `npm run build && npm run preview`) sont la seule voie réelle.
- Deux builds successifs sur le même `dist/` écrasent le premier : l'orchestration devra soit sortir chaque build dans un `outDir` distinct (option `build.outDir` l.100 en surcharge CLI `--outDir`), soit servir un build depuis un répertoire figé pendant que le second est construit — à trancher dans le plan (RESEARCH.md).
- Si `VITE_BUILD_ID` est ajouté au build, il doit être documenté dans la chaîne `compose.app.yaml` l.25-26 (les seuls `VITE_*` actuels) uniquement s'il doit circuler en prod ; pour un usage test-only, le laisser en variable de build du wrapper suffit.

---

### `docs/EXPLOITATION.md` (enregistrement GATE-PROD)

**Analogue partiel :** style du document lui-même (en-tête qui affirme et
prouve, §2.7 I). Extrait de ton à imiter (l.1-7) :

```markdown
# Exploitation — objectifs, restauration, sources des checks

Ce document consigne ce que les scripts d'exploitation (`backup.sh`, les checks
`check-*.sh`) lisent réellement dans la base, relevé **sur la base vivante**
avant d'écrire les requêtes (§2.7-D : lire la fonction/table avant
l'assertion).
```

**Forme de l'entrée GATE-PROD** : une section « hors jalon, observatoire
événementiel, non planifiable » (vocabulaire de REQUIREMENTS.md l.44), qui
consigne : les deux tests UAT à rejouer (32-UAT 7 et 35-UAT 2 — cf. STATE.md
l.68), la condition de déclenchement (première mise en production **naturelle**,
jamais provoquée), et l'affirmation de ce qui est prouvé par la phase 41 vs ce
qui ne l'est pas (le build+preview simule l'origine ; il ne prouve pas le
déploiement Traefik/nginx réel). **Toute absence affirmée doit être vérifiée
au grep avant d'être écrite** (§2.7 I) — les contre-modèles sont dans
AGENTS.md §2.7 I (trois affirmations fausses sur le champ `reminderAt`).

## Patrons partagés

### Discipline wrapper (Rule 3 / JT-01, JT-03)
**Source :** `scripts/test-join-token-real.sh` + `app/playwright.config.ts` l.8-14
**Appliquer à :** `scripts/test-sw-gate.sh` + routage de `sw-gate.spec.ts`

```typescript
testIgnore: process.env.E2E_BASE_URL ? [] : ['**/join-token-real.spec.ts'],
```

Le run standard reste 100 % vert sans le wrapper ; la spec réelle vit dans son
run séparé. Pour la phase 41 : même mécanisme, probablement
`['**/sw-gate.spec.ts']` hors run standard — sauf si le planning préfère la
garder au run standard (coût : +2 builds par run e2e). Décision à trancher en
plan-phase, jamais en grepExclude ni test.skip (J-02, 38-E2E-SIGNATURE.md l.38).

### Refus nommé, jamais de skip silencieux
**Source :** `join-token-real.spec.ts` l.40-52 (fonction `variableRequise`)
**Appliquer à :** la spec sw-gate pour toutes ses entrées (chemins des deux
builds, `VITE_BUILD_ID` A et B)

### Français qui nomme la raison, zéro directive linter
**Source :** tous les extraits ci-dessus ; garde `app/src/lib/no-eslint-directive.test.ts`
**Appliquer à :** tout fichier écrit ou modifié par la phase. Un effet dont on
omet volontairement une dépendance porte un commentaire qui **nomme la raison
de l'omission** — jamais « dépendances volontairement omises ».

### Rouge-avant-vert pour toute la chaîne de simulation
**Source :** STATE.md décision 38 (l.89) : « un cas-qui-doit-échouer qui ne
peut pas échouer est une tautologie »
**Appliquer à :** la preuve que les deux builds produisent des precache
distincts — le scénario « build A servi, build B construit, banner apparaît »
doit d'abord être prouvé **échouant** si l'on sert deux fois le même build
(contrôle se prouve sur le cas qu'on a soi-même écrit, §2.7 B).

### Verbatims DOM réels en toutes lettres dans la spec
**Source :** `join-token-real.spec.ts` l.68-71, `update-banner.tsx` l.25-32
**Appliquer à :** la spec sw-gate (libellés du bandeau, états du bouton)

## Aucun analogue trouvé

| Fichier | Rôle | Flux | Raison |
|---------|------|------|--------|
| Injection `VITE_BUILD_ID` (dans sw-register.ts / vite.config.ts) | config build | transform | Aucune variable `VITE_*` de test n'existe encore dans le dépôt (les seules sont les deux variables Supabase de `compose.app.yaml`). Utiliser les patterns de RESEARCH.md + la convention `ARG/ENV` Docker §8.2. |
| Harnais dev-only d'injection dans le store SW | hook | event-driven | Aucun harnais équivalent côté runtime existe (les harnais existants sont des tests Vitest, ex. D-17). Le plan devra trancher la forme (window hook conditionnel vs variable d'environnement lue dans `sw-register.ts`) en suivant la discipline « pas de fork » documentée plus haut. |

## Métadonnées

**Périmètre de recherche :** `app/e2e/`, `app/src/lib/`, `app/src/hooks/`, `app/src/components/banners/`, `app/` (configs), `scripts/`, `docs/`, `.planning/phases/38-filet-de-tests-fiable/`
**Fichiers lus :** 12 (analogues + configs + docs planning)
**Date d'extraction :** 2026-11-10
