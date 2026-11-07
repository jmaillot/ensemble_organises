---
phase: 261019-gwh
plan: 01
subsystem: ui
tags: [tanstack-query, online-manager, offline, bandeau, pwa, react, vitest, playwright]

# Dependency graph
requires:
  - phase: 261019-dw6
    provides: "Politique réseau partagée (`networkMode: 'always'`, `refetchOnReconnect: true`), bandeau hors ligne global et gardes de classe — non modifiés ici, seulement complétés par l'état initial manquant"
provides:
  - "`seedOnlineStatus()` (`app/src/lib/online-status.ts`) : pose UNE fois l'état initial d'`onlineManager` depuis `navigator.onLine`, avec garde `typeof navigator` pour le pré-rendu"
  - "Appel dans le bootstrap `app/src/main.tsx`, au niveau module, après `registerSW` et avant `createRoot(` — donc avant que `QueryClientProvider` ne monte le client (et n'installe `onlineManager.subscribe`)"
  - "Un démarrage à froid hors ligne affiche le bandeau dès le premier rendu, ET le retour du réseau redevient un CHANGEMENT d'état notifié (le `refetchOnReconnect` de dw6 reprend vie sur ce chemin)"
affects: [use-online-status, offline-banner, toutes-les-pages-lisant-via-useResource]

actuals:
  tokens: 2740    # chars/4 sur le diff realisé (10 958 caracteres, 3 fichiers), MEME instrument que le poste de dw6 ; voir la note d'echelle plus bas
  tasks: 2
  commits: 2      # MESURE : git rev-list --count b5448da..HEAD (#3968)
  plan_head_before: b5448da7a5fea96b76b3d062f947c36792618041
  plan_head_after: c0694377c77971533305b4859b5d3a1059b60929

tech-stack:
  added: []
  patterns:
    - "Amorcer l'état initial d'un singleton tiers au niveau MODULE du bootstrap (pas dans un effet, pas à l'abonnement) : le premier rendu porte déjà la bonne valeur, et l'état est juste avant que le client ne s'abonne"
    - "Couture dédiée et testable (`seedOnlineStatus`) plutôt qu'un appel inline dans `main.tsx` : l'amorçage s'exerce SANS le harnais de bootstrap (#root, routeur, authentification mockés)"
    - "Seul `navigator.onLine` amorce l'état, jamais un succès réseau ; l'état suit ensuite les événements `online`/`offline` — une seule vérité"

key-files:
  created:
    - app/src/lib/online-status.ts
    - app/src/lib/online-status.test.ts
  modified:
    - app/src/main.tsx

key-decisions:
  - "Amorcer depuis `navigator.onLine` UNE fois au démarrage, au niveau module du bootstrap : decide par le CONTEXT (decisions 1 et 2), reproduit dans le commentaire de main.tsx qui dit pourquoi c'est le bootstrap et pourquoi une fois"
  - "Garde `typeof navigator === 'undefined'` : en pre-rendu, rien a amorcer et l'etat par defaut reste en ligne — meme arbitrage que l'instantane serveur de use-online-status.ts"
  - "Aucune modification de la politique reseau de dw6 : ni networkMode, ni refetchOnReconnect, ni le bandeau, ni les gardes de classe. Seul l'etat initial manquant est ajoute"
  - "Le fichier de test reste en .ts (le plan le nomme ainsi et ses commandes de verification aussi) : JSX interdit dans un .ts, donc `createElement(OfflineBanner)` au lieu de `<OfflineBanner />`"
  - "Garde D TEXTUELLE plutot que comportementale, choix assume et limite dit : la propriete du bootstrap est doublee par le Test A cote effet, et main.test.tsx importe deja ./main sous npm test"

patterns-established:
  - "Stub de `navigator.onLine` par propriete propre (`Object.defineProperty`) + restauration du descripteur d'origine dans `finally` ; on ne remplace jamais tout `navigator` sauf pour le Test C ou `vi.stubGlobal('navigator', undefined)` est le moyen exact de tester l'absence"

requirements-completed: []

coverage:
  - id: D1
    description: "Un demarrage a froid hors ligne affiche le bandeau des le premier rendu (l'etat initial reflete navigator.onLine)"
    verification:
      - kind: unit
        ref: "app/src/lib/online-status.test.ts#amorçage de l’état réseau au démarrage › A."
        status: pass
    human_judgment: false
  - id: D2
    description: "Apres amorcage hors ligne, le retour du reseau est un CHANGEMENT notifie [false, true] — le refetchOnReconnect de dw6 reprend vie sur ce chemin"
    verification:
      - kind: unit
        ref: "app/src/lib/online-status.test.ts#... › B."
        status: pass
    human_judgment: false
  - id: D3
    description: "Sans navigator (pre-rendu), seedOnlineStatus() ne leve pas et laisse l'etat en ligne"
    verification:
      - kind: unit
        ref: "app/src/lib/online-status.test.ts#... › C."
        status: pass
    human_judgment: false
  - id: D4
    description: "Le bootstrap appelle seedOnlineStatus() avant createRoot("
    verification:
      - kind: unit
        ref: "app/src/lib/online-status.test.ts#... › D."
        status: pass
    human_judgment: false

status: complete
---

# Tâche rapide 261019-gwh : amorcer l'état réseau depuis le navigateur — Summary

`seedOnlineStatus()` pose une fois l'état initial d'`onlineManager` depuis `navigator.onLine`, appelée au niveau module de `main.tsx` avant le premier rendu : un démarrage à froid hors ligne affiche enfin le bandeau, et le retour du réseau redevient un changement d'état notifié — le `refetchOnReconnect` posé par `261019-dw6` cesse d'être mort sur le chemin exact qu'il visait.

## Tasks

| # | Nom | Type | Statut | Commits |
|---|----|------|--------|---------|
| 1 | Amorcer l'état réseau au démarrage — la tranche minimale, et ses preuves rouges | tracer | ✓ | `7fa4293` (rouge), `c069437` (vert) |
| 2 | La chaîne §2.7 en une passe, et les quatre suites du singleton vertes ensemble | auto | ✓ | (aucun fichier de `app/src` — `COVERAGE.md` est sous `.planning/`, gitignoré) |

## Chaîne §2.7 — chaque commande prescrite, et son sort

Section exigée par §2.7 I (une omission affirmée est une affirmation : ici chaque ligne est nommée, jouée ou justifiée, jamais passée sous silence).

| Commande (AGENTS.md §2.7) | Sort | Totaux / raison |
|---|---|---|
| `cd app && npm run typecheck` | **verte** | `tsc --noEmit`, exit 0 |
| `cd app && npm test` | **verte** | **154 fichiers passés (154), 1292 tests passés (1292)**, 0 échec — durée 513,78 s |
| `cd app && npm run build` | **verte** | `tsc --noEmit && vite build` ; bundle + `sw.js` (injectManifest) générés, exit 0 |
| `cd app && npm run test:e2e` | **verte — JOUÉE, pas seulement mentionnée** | **123 passés, 5 skippés**, exit 0 (2,1 min). Exerce le bootstrap que ce changement déplace : connexion, création/rejoint de foyer, tâche, dépense, scan de fidélité, sur `chromium` ET `mobile`. `playwright.config.ts` démarre lui-même son serveur (`npm run build && npm run preview`, port 4173) |
| `app/src/lib/no-eslint-directive.test.ts` | **verte** | 1 fichier, 3 tests passés (rejoué en isolé pour être nommé, et déjà vert dans les 154) |
| `python3 scripts/check-sql-statique.py` | **sans objet** | Raison : aucun SQL écrit. La tâche ne touche ni `supabase/migrations` ni aucune fonction |
| `sh scripts/test-db.sh` | **sans objet** | Raison : aucune migration, aucune fonction SQL, aucun secret (Vault) touché |
| `sh scripts/test-dispatch-push.sh` | **sans objet** | Raison : ni Vault, ni `pg_net`, ni Edge Function, ni abonnement push concernés |

Rien n'est resté non joué faute de pouvoir l'être : **aucune ligne « Chaîne non jouée »** — la ligne e2e a été jouée jusqu'au bout.

### L'appel groupé des quatre suites du singleton (Task 2, step 1)

`npm --prefix app run test -- src/lib/online-status.test.ts src/components/shared/offline-banner.test.tsx src/lib/query-policy.test.ts src/modules/courses/courses-offline.test.tsx` →

**4 fichiers passés (4), 13 tests passés (13).**

Ce que cet appel prouve, et rien de plus : le nouveau fichier tient son ORDRE INTRA-FICHIER (`afterEach` restaure `onlineManager` ET `navigator.onLine` à son accesseur d'origine pour ses propres tests suivants) et suit la convention des trois voisins. La contagion INTER-FICHIERS n'est PAS ce qu'il mesure : Vitest tourne avec `isolate: true` (seuls `pool: 'forks'` et `fileParallelism: false` sont posés dans `vite.config.ts`) — le rapport a d'ailleurs confirmé `Isolate 4 workers spawned`, un registre de modules par fichier.

## Démonstration rouge → vert

Le rouge a été capturé **mot pour mot** à l'exécution ; le plan n'a prédit aucune chaîne du moteur. **Aucune assertion n'a bougé entre le rouge et le vert** : le seul delta est le corps d'`online-status.ts` et l'appel dans `main.tsx`.

### Rouge, sur un corps VIDE (gardes A, B et D)

`npm --prefix app run test -- src/lib/online-status.test.ts` — sur le code d'aujourd'hui (couture vide, `main.tsx` non câblé) :

```
 ❯ src/lib/online-status.test.ts (4 tests | 3 failed) 37ms
   ❯ amorçage de l’état réseau au démarrage (4)
     × A. un démarrage à froid hors ligne affiche le bandeau dès le premier rendu 26ms
     × B. après amorçage hors ligne, le retour du réseau est un CHANGEMENT notifié 4ms
     × D. le bootstrap appelle seedOnlineStatus() avant createRoot( 2ms
```

**Test A** (le bandeau absent — sur un état resté `true`) :

```
FAIL  src/lib/online-status.test.ts > amorçage de l’état réseau au démarrage > A. un démarrage à froid hors ligne affiche le bandeau dès le premier rendu
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/lib/online-status.test.ts:89:40
     87|       seedOnlineStatus();
     88|
     89|       expect(onlineManager.isOnline()).toBe(false);
```

**Test B** (la conséquence 2 — le journal VIDE, `setOnline(true)` n'est pas un changement) :

```
FAIL  src/lib/online-status.test.ts > amorçage de l’état réseau au démarrage > B. après amorçage hors ligne, le retour du réseau est un CHANGEMENT notifié
AssertionError: expected [] to deeply equal [ false, true ]

- Expected
+ Received

- [
-   false,
-   true,
- ]
+ []

 ❯ src/lib/online-status.test.ts:113:29
    113|       expect(notifications).toEqual([false, true]);
```

**Test D** (l'appel au bootstrap absent de `main.tsx`) :

```
FAIL  src/lib/online-status.test.ts > amorçage de l’état réseau au démarrage > D. le bootstrap appelle seedOnlineStatus() avant createRoot(
AssertionError: app/src/main.tsx n’appelle pas seedOnlineStatus(): expected -1 to be greater than or equal to 0
 ❯ src/lib/online-status.test.ts:145:76
```

**Test C, lui, PASSE sur le corps vide** (`1 passed`) : c'est attendu — son rouge propre vient de la variante suivante. Le dire évite de lire ce basculement comme une assertion retouchée.

### Rouge de Test C, sur la variante NON GARDÉE

Corps remplacé temporairement par `onlineManager.setOnline(navigator.onLine)` (sans la garde `typeof navigator`), puis `npm --prefix app run test -- src/lib/online-status.test.ts -t "sans navigator"` :

```
 × C. sans navigator, l’amorçage ne lève pas et laisse l’état en ligne 26ms

AssertionError: expected [Function] to not throw an error but 'TypeError: Cannot read properties of …' was thrown

- Expected:
undefined

+ Received:
"TypeError: Cannot read properties of undefined (reading 'onLine')"

 ❯ src/lib/online-status.test.ts:127:44
    125|     vi.stubGlobal('navigator', undefined);
    126|     try {
    127|       expect(() => seedOnlineStatus()).not.toThrow();
```

Le mécanisme observé est celui qu'annonçait le plan, **avec sa chaîne réelle** : `vi.stubGlobal('navigator', undefined)` **lie** l'identifiant à `undefined` sans le supprimer, donc `typeof navigator` vaut `'undefined'` (la garde reste efficace) et c'est la lecture `navigator.onLine` sur `undefined` qui échoue — un **`TypeError`** du moteur, **jamais un `ReferenceError`**. Sur cette variante, A et B passent (attendu). Le corps gardé a ensuite été restauré.

### Vert (Task 1, step 6 — sans aucune retouche d'assertion)

`npm --prefix app run test -- src/lib/online-status.test.ts` →

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Le partage des rouges, nommé : **A et B** sur un corps vide (assertion) ; **C** sur un corps non gardé (lancer) ; **D** avant le câblage de `main.tsx`. Aucun rouge n'est un import manquant (§2.7 D.6).

## La politique réseau de `261019-dw6` est intacte

Vérifié par le diff des commits : `git diff --name-only b5448da..HEAD` ne rend que trois chemins — `app/src/lib/online-status.test.ts`, `app/src/lib/online-status.ts`, `app/src/main.tsx`. Aucun fichier livré par `dw6` n'apparaît :

- `app/src/lib/query-policy.ts` **non modifié** — `networkMode: 'always'`, `refetchOnReconnect: true` (requêtes ET mutations) inchangés ;
- `app/src/components/shared/offline-banner.tsx` **non modifié** ;
- `app/src/app/router.tsx` **non modifié** ;
- les gardes de classe et tests de `dw6` **non modifiés**.

Seul l'état initial manquant a été ajouté. Le Test D de `query-policy.test.ts` (valeurs résolues du client réel) et les 3 tests d'`offline-banner.test.tsx` restent verts dans les deux exécutions (groupée et pleine suite).

## Deviations from Plan

**1. [Rule 3 — blocage] JSX interdit dans un fichier `.ts` : `createElement` au lieu de `<OfflineBanner />`**

- **Found during:** Task 1, step 3 (premier lancement rouge).
- **Issue:** le plan nomme le fichier `app/src/lib/online-status.test.ts` (extension `.ts`) et ses commandes de vérification ciblent ce chemin exact, mais le plan prescrit aussi `render(<OfflineBanner />)` dans Test A. La syntaxe JSX exige une extension `.tsx` : le premier lancement a échoué non pas en assertion mais en **PARSE_ERROR** du moteur de transformation (`Expected \`>\` but found \`/\``, `src/lib/online-status.test.ts:90`), donc avant même d'exécuter un test.
- **Fix:** garder le nom et le chemin EXACTS du plan (`.ts`), et remplacer le JSX par `createElement(OfflineBanner)` — un seul appel, sémantique identique. Renommer en `.tsx` aurait été le choix inverse : il aurait rompu le chemin que le plan et les commandes de vérification prescrivent, pour un seul caractère de syntaxe.
- **Files modified:** `app/src/lib/online-status.test.ts` (import `createElement` + `render(createElement(OfflineBanner))`, avec un commentaire qui dit pourquoi).
- **Commit:** `7fa4293`.
- **Après ce correctif, le rouge est bien celui du plan** (A sur l'assertion, B sur le journal vide) — le rouge n'a pas été déplacé, il a été atteint.

Aucune autre déviation. Aucune assertion n'a été retouchée entre le rouge et le vert.

## Auth gates

Aucune. Aucune authentification n'a été requise.

## Known Stubs

Aucun. Aucun `=[]`/`={}`/`=null`/texte « à venir » laissé : le corps vide d'`online-status.ts` était l'état INTERMÉDIAIRE du rouge (commit `7fa4293`), remplacé par l'implémentation finale au commit `c069437`.

## Threat Flags

Aucune surface nouvelle hors du `<threat_model>` du plan. Le fichier amorcé (`app/src/lib/online-status.ts`) et son point d'appel (`main.tsx`) sont exactement ceux que le registre STRIDE couvre (T-261019-gwh-01 `accept`, T-261019-gwh-03 `accept`) ; T-261019-gwh-02 (`refetchOnReconnect` notifiable) est `mitigate` et prouvé par le Test B.

## Observations

- `.playwright-mcp/` était déjà présent, **non suivi**, avant le premier commit de cette tâche (sortie générée par un serveur Playwright MCP) : laissé tel quel, il ne fait pas partie de `files_modified`.
- Aucun échec de test constaté, aucun test non attribuable. `app-shell.test.tsx` et `use-notifications.test.tsx` (documentés comme flakes ordre-dépendants) ne sont pas ressortis : la pleine suite est verte du premier coup (154/154).
- **Note d'échelle sur `actuals.tokens`** : la mesure (2740) est chars/4 sur le diff réalisé, le même instrument que `261019-dw6`. L'`estimate` du plan (30 000) est ~11× cette valeur : l'échelle de l'estimation n'est pas celle du diff (elle compte visiblement la lecture et la planification, pas les octets modifiés). Les deux ne se comparent donc pas directement — c'est dit ici plutôt que masqué par un chiffre arrondi.

## Self-Check: PASSED

- `app/src/lib/online-status.ts` — FOUND
- `app/src/lib/online-status.test.ts` — FOUND
- `app/src/main.tsx` contient `seedOnlineStatus()` avant `createRoot(` — FOUND (Test D vert)
- Commit `7fa4293` — FOUND
- Commit `c069437` — FOUND
- `COVERAGE.md` — FOUND (sous `.planning/`, gitignoré)
- Fichiers `dw6` modifiés — NONE (diff limité aux trois chemins prévus)
