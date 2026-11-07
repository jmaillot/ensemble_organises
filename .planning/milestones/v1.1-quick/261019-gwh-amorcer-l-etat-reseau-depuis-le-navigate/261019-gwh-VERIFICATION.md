---
phase: 261019-gwh
verified: 2026-10-19T10:48:49Z
status: human_needed
score: 6/6 must-haves verified
covered_files: [".planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/261019-gwh-CONTEXT.md", ".planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/261019-gwh-PLAN.md", ".planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/261019-gwh-SUMMARY.md", ".planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/COVERAGE.md", "app/src/lib/online-status.test.ts", "app/src/lib/online-status.ts", "app/src/main.tsx"]
covered_digest: "v2:sha256:bd4f06fd8204ecb12ca2eefd1c6fb5c44cbbe6b8d94036e7732e74f64425cb08"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Sur l'app déployée (ou un build de prévisualisation), démarrer À FROID hors ligne : passer le navigateur hors ligne (F12 → Réseau → « Hors ligne ») PUIS recharger la page (ou l'ouvrir à froid)."
    expected: "Le bandeau global « Vous êtes hors ligne… » (rôle `status`) est affiché DÈS LA PREMIÈRE PEINTURE, sans qu'aucun événement `offline` ait à survenir. Puis, en revenant en ligne, l'application recharge les données du foyer sans action de l'utilisateur (`refetchOnReconnect`)."
    why_human: "Le défaut d'origine a été mesuré sur l'app déployée avec une coupure RÉELLE (CONTEXT §« cause prouvée 2 »). L'automatisé prouve (a) l'EFFET de `seedOnlineStatus()` sur l'état ET le bandeau (Test A), (b) la notifiabilité du retour réseau (Test B), et (c) la PRÉSENCE textuelle de l'appel dans `main.tsx` (Test D). Aucun test du dépôt ne pilote le VRAI bootstrap de production avec le VRAI `navigator.onLine` dans un navigateur : `app/e2e/*.spec.ts` ne contient AUCUNE occurrence de `offline`/`onLine`/`setOffline` (`grep` vide), et Test D est TEXTUEL (il ne prouve pas que l'appel s'EXÉCUTE avant le premier rendu). La chaîne production complète — module `main.tsx` évalué hors ligne, puis `createRoot().render()` — reste à confirmer à l'œil."
---

# Quick Task 261019-gwh : amorcer l'état réseau depuis le navigateur — VERIFICATION

**Goal (CONTEXT, décisions 1–2) :** corriger le défaut découvert après `261019-dw6` — le bandeau hors ligne est muet sur un démarrage à froid hors ligne — en amorçant `onlineManager` depuis `navigator.onLine` UNE fois, au bootstrap `app/src/main.tsx`, avant le premier rendu, sans modifier la politique réseau de `dw6`.

**Verified:** 2026-10-19T10:48:49Z
**Status:** human_needed
**Re-verification:** No — initial verification (aucune VERIFICATION.md préalable pour `261019-gwh`).

## Méthode et ce que j'ai exécuté moi-même

J'ai vérifié contre la CODEBASE et le comportement observable, pas contre la prose du SUMMARY. J'ai reproduit les rouges de ma main (sur l'arbre réel, restauré par `git checkout` après chaque manipulation — vérifié `git status` propre, seul `.playwright-mcp/` non suivi).

Exécutions menées par moi (toutes sur HEAD = `c069437`) :

| Commande | Résultat |
| --- | --- |
| `git diff 7fa4293 c069437 -- app/src/lib/online-status.test.ts` | **VIDE** (aucune assertion ne bouge entre le rouge et le vert) |
| `git diff --name-only b5448da..HEAD` | **exactement 3 chemins** (les trois attendus) |
| `git diff --quiet b5448da..HEAD -- <fichier dw6>` × 3 | **IDENTICAL** pour `query-policy.ts`, `offline-banner.tsx`, `router.tsx` |
| `npm --prefix app run test -- src/lib/online-status.test.ts` | **4 passed / 4** (vert de référence) |
| idem, corps de `seedOnlineStatus()` vidé | **2 failed / 2 passed** — A `expected true to be false` ; B `expected [] to deeply equal [false, true]` |
| idem, corps non gardé `setOnline(navigator.onLine)`, `-t "sans navigator"` | **1 failed / 3 skipped** — C `TypeError: Cannot read properties of undefined (reading 'onLine')` |
| idem, appel retiré de `main.tsx`, `-t "bootstrap appelle"` | **1 failed** — D `expected -1 to be greater than or equal to 0` |
| idem, appel COMMENTÉ (`// seedOnlineStatus();`) → démonstration de la limite | **1 passed / 3 skipped** — la garde textuelle ne voit PAS le commentaire |
| `npm --prefix app run test -- src/lib/no-eslint-directive.test.ts` | **1 file / 3 passed** |
| `npm --prefix app run test -- <4 suites du singleton>` | **4 files / 13 passed** |

Je n'ai **pas** rejoué `npm run typecheck`, `npm run build`, la suite `npm test` complète ni `npm run test:e2e`. Le SUMMARY annonce typecheck vert, 154 fichiers / 1292 tests, build vert, et e2e 123 passés / 5 skippés : **ce ne sont pas mes mesures** ; je les cite comme des déclarations de l'exécuteur, non comme mes conclusions. Mes vérifications de code et mes exécutions ciblées portent sur l'arbre exact (HEAD `c069437`, `git status` propre hors `.playwright-mcp/` non suivi).

## Goal Achievement

### Observable Truths

| # | Truth (must_haves.truths) | Statut | Preuve (récoltée soi-même) |
| --- | --- | --- | --- |
| 1 | Un démarrage à froid hors ligne affiche le bandeau dès le premier rendu : l'état initial reflète `navigator.onLine`, sans attendre un événement qui n'arrivera jamais. | ✓ VERIFIED | `app/src/lib/online-status.ts:30` → `onlineManager.setOnline(navigator.onLine)`. Test A vert ; vu **rouge** par moi sur un corps vide (`expected true to be false` à `online-status.test.ts:89` — l'état reste `true`, donc `render(createElement(OfflineBanner))` ne rend rien). L'effet (seed → état → bandeau, rôle `status`) est exercé, pas seulement présent. |
| 2 | Après un démarrage à froid hors ligne, le retour du réseau est un CHANGEMENT d'état d'`onlineManager`, donc notifiable : le `refetchOnReconnect: true` posé par `261019-dw6` n'est plus mort sur ce chemin. | ✓ VERIFIED | Test B vert ; vu **rouge** par moi sur un corps vide (`expected [] to deeply equal [false, true]` à `:113` — sans amorçage, `setOnline(true)` n'est pas un changement). Chaîne prouvée dans la source installée : `onlineManager.js:77-84` `if (this.#online !== online)` (notifie seulement sur changement) ; `queryClient.js:49,58` `mount()` pose `onlineManager.subscribe` ; `QueryClientProvider.js:44` appelle `client.mount()` au rendu — donc APRÈS l'appel module-scope de `main.tsx`. |
| 3 | Dans un environnement sans `navigator` (pré-rendu/SSR), l'amorçage ne lève pas et laisse l'état par défaut en ligne — le même arbitrage que l'instantané serveur de `use-online-status.ts`. | ✓ VERIFIED | Garde `if (typeof navigator === 'undefined') return;` présente (`online-status.ts:28`). Test C vert ; vu **rouge** par moi sur le corps NON GARDÉ, avec le **`TypeError`** annoncé (« Cannot read properties of undefined (reading 'onLine') ») — et **pas** un `ReferenceError`, comme le plan l'exigeait. L'instantané serveur `() => true` de `use-online-status.ts:25` confirme l'arbitrage reproduit. |
| 4 | Après chaque test, `onlineManager` ET `navigator.onLine` sont restaurés : l'ordre INTRA-FICHIER est tenu et la convention des deux fichiers voisins suivie ; la contagion INTER-FICHIERS est déjà exclue par `isolate: true`. | ✓ VERIFIED | `beforeEach`/`afterEach` `onlineManager.setOnline(true)` (`:37-43`) ; chaque Test A/B restaure `navigator.onLine` via `finally` (`stubNavigatorOnline` rend une fonction de restauration, `:56-66`) ; Test C restaure par `vi.unstubAllGlobals()` en `finally` (`:129-131`). Les **4 suites du singleton passent ENSEMBLE** : 4 fichiers / 13 tests verts (rejoué par moi). `app/vite.config.ts:76-77` pose `pool: 'forks'` et `fileParallelism: false` et ne surcharge PAS `isolate` → défaut Vitest `true` : la contagion inter-fichiers est bien exclue. |
| 5 | La politique réseau de `261019-dw6` n'est pas modifiée : `networkMode: 'always'`, `refetchOnReconnect: true`, le bandeau, les gardes de classe et les commentaires corrigés restent tels quels — seul l'état initial est ajouté. | ✓ VERIFIED | `git diff --name-only b5448da..HEAD` = exactement `app/src/lib/online-status.test.ts`, `app/src/lib/online-status.ts`, `app/src/main.tsx`. `git diff --quiet` renvoie **IDENTICAL** pour `app/src/lib/query-policy.ts`, `app/src/components/shared/offline-banner.tsx`, `app/src/app/router.tsx`. Contenu confirmé intact : `query-policy.ts:39,44,49` (`networkMode: 'always'`, `refetchOnReconnect: true`, mutations `networkMode: 'always'`). |
| 6 | L'amorçage n'est pas déduit d'un succès réseau : une seule source reste `navigator.onLine` et les événements. | ✓ VERIFIED | `online-status.ts` ne lit que `navigator.onLine` (`:30`) ; aucune occurrence de `fetch`/`axios`/`XMLHttpRequest`/`response` hors commentaire (`grep` : seul un match dans un commentaire, `:11`). Aucune réintroduction de file de rejeu. |

**Score:** 6/6 truths verified (0 present-but-behavior-unverified, 0 overrides).

### Required Artifacts

| Artifact | Expected | Statut | Détails |
| --- | --- | --- | --- |
| `app/src/lib/online-status.ts` | La couture d'amorçage : `seedOnlineStatus()` pose une fois l'état initial d'`onlineManager` depuis `navigator.onLine`, avec garde `typeof navigator`. | ✓ VERIFIED | 31 l. **WIRED** : importé par `main.tsx:7` et `online-status.test.ts:7`. Corps réel (non vide), garde présente, source unique `navigator.onLine`. |
| `app/src/lib/online-status.test.ts` | Les quatre gardes (A, B, C, D) avec leur rouge nommé. | ✓ VERIFIED | 160 l. **WIRED** : importe le seam depuis `@/lib/online-status` (pas `main.tsx`), le bandeau depuis `@/components/shared/offline-banner`. 4 tests verts ; rouges reproduits par moi (A/B sur corps vide, C sur corps non gardé, D sur appel retiré). |
| `app/src/main.tsx` | Le point d'appel de production : `seedOnlineStatus()` au niveau module, après `registerSW`, avant `createRoot(...).render(...)`. | ✓ VERIFIED | `:18` `seedOnlineStatus();` (module-scope), avant `createRoot(container).render(` (`:53`) ; import `:7` ; `registerSW({ immediate: true })` `:10`. Ordre vérifié dans le fichier, ET gardé par Test D. |
| `.planning/quick/…/COVERAGE.md` | Déclaration d'absence d'intégration d'API externe (une ligne raisonnée). | ✓ VERIFIED | Présent, une ligne raisonnée : « amorce un état en mémoire … depuis `navigator.onLine` … ne parle à aucun service ». `covered_files` l'inclut. |

Aucun artefact `MISSING`, `STUB`, `ORPHANED` ni `HOLLOW`.

### Key Link Verification

| From | To | Via | Statut | Détails |
| --- | --- | --- | --- | --- |
| `app/src/main.tsx` | `app/src/lib/online-status.ts` | `seedOnlineStatus()` au niveau module, avant `createRoot(` | ✓ WIRED (textuel) | Fichier lu : `:18` précède `:53`. Test D vert ; vu **rouge** par moi en retirant l'appel. **Limite dite** : garde TEXTUELLE — elle ne prouve pas que l'appel S'EXÉCUTE avant le premier rendu, seulement que la chaîne est présente. |
| `app/src/lib/online-status.ts` | `onlineManager` (TanStack) | `onlineManager.setOnline(navigator.onLine)` | ✓ WIRED | `:30`. `onlineManager` importé de `@tanstack/react-query` (`:1`). Chaîne de notification confirmée dans la source installée (`onlineManager.js:77-84`, `queryClient.js:49,58`, `QueryClientProvider.js:44`). |
| `onlineManager` | `OfflineBanner` | `useOnlineStatus` (`useSyncExternalStore`) → `onlineManager.isOnline()` | ✓ WIRED | `use-online-status.ts:22-24` ; Test A monte le bandeau réel et lit son `role=status` hors ligne. Chemin réel de production, pas un appel direct à `setOnline` dans le test. |
| `app/src/lib/online-status.test.ts` | `@/lib/online-status` | import du seam (pas `main.tsx`) | ✓ WIRED | `:7`. Rend l'amorçage exerçable sans le harnais de bootstrap (`#root`) que `main.test.tsx` reproduit. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Statut |
| --- | --- | --- | --- | --- |
| `seedOnlineStatus()` | (état d'`onlineManager`) | `navigator.onLine` (propriété du navigateur, pas une constante/mock en production) | Oui — état réseau réel ; l'argv du test le stubbe, la production lit le vrai `navigator` | ✓ FLOWING |
| `OfflineBanner` | `isOnline` | `onlineManager.isOnline()` via `useSyncExternalStore` | Oui — magasin externe réel, abonné | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Statut |
| --- | --- | --- | --- |
| Les 4 gardes vertes sur HEAD | `npm --prefix app run test -- src/lib/online-status.test.ts` | 1 fichier, **4/4** | ✓ PASS |
| Red-capability A (état initial non amorcé) | corps de `seedOnlineStatus()` vidé → idem | **A rouge** : `expected true to be false` (état resté `true`) ; B rouge aussi (`[]`) ; C, D verts | ✓ PASS (rouge observé, restauré) |
| Red-capability C (garde `typeof navigator` retirée) | corps = `onlineManager.setOnline(navigator.onLine)` → `-t "sans navigator"` | **C rouge** : `TypeError: Cannot read properties of undefined (reading 'onLine')` | ✓ PASS (rouge observé, restauré) |
| Red-capability D (appel du bootstrap retiré) | ligne `seedOnlineStatus();` retirée de `main.tsx` → `-t "bootstrap appelle"` | **D rouge** : `expected -1 to be greater than or equal to 0` | ✓ PASS (rouge observé, restauré) |
| Limite de D (contrôle qui ne peut pas tout voir) | ligne remplacée par `// seedOnlineStatus();` → `-t "bootstrap appelle"` | **D VERT** — la garde textuelle ne détecte pas un appel commenté | ✓ PASS (limite **démontrée**) |
| Aucun linter introduit | `npm --prefix app run test -- src/lib/no-eslint-directive.test.ts` | 1 fichier, **3/3** | ✓ PASS |
| Les 4 suites du singleton ensemble | `npm --prefix app run test -- src/lib/online-status.test.ts src/components/shared/offline-banner.test.tsx src/lib/query-policy.test.ts src/modules/courses/courses-offline.test.tsx` | 4 fichiers, **13/13** | ✓ PASS |
| Marqueurs de dette sur les fichiers modifiés | `grep -nE 'TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER'` | **NONE** | ✓ PASS |
| Porte rouge→vert : assertions gelées | `git diff 7fa4293 c069437 -- app/src/lib/online-status.test.ts` | **VIDE** | ✓ PASS |

### Probe Execution

Aucune sonde déclarée (ni dans PLAN/SUMMARY, ni conventionnelle `scripts/*/tests/probe-*.sh`). Étape sans objet — cette tâche n'est ni une migration, ni du CLI/outillage, et sa vérification ne mentionne aucune sonde.

### Requirements Coverage

`must_haves.requirements` du PLAN = `[]` ; le plan porte `requirements: []`. `docs/TODO.md` #15 est le constat d'origine de `dw6`, pas une exigence `REQ-*`. Aucune exigence orpheline. La ligne « Terminé quand » de #15 (« un test rend une page avec `navigator.onLine = false` en exigeant une erreur qui échoue sur le code d'aujourd'hui ») a été satisfaite au niveau de `dw6` et ici par Test A/B (rouges reproduits).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (aucun) | — | `TBD`/`FIXME`/`XXX` réels | — | `grep` sur les trois fichiers modifiés ne rend **rien**. Robuste à la porte-frein de §2.7. |
| (aucun) | — | `return null` / `return {}` / `= []` / `=> {}` | — | `grep` sur `online-status.ts` ne rend **rien** : pas de corps vide, pas de données en dur. |
| (aucun) | — | directive de linter | — | `grep` sur les trois fichiers modifiés ne rend **rien** ; `no-eslint-directive.test.ts` rejoué vert (3/3). |
| `app/src/lib/online-status.test.ts` | 134-159 | Garde D **TEXTUELLE** (peut être satisfaite par un commentaire) | ℹ️ Info | La limite est EXACTEMENT celle que le plan assume et que le commentaire du test dit (`:148-158`). Ce n'est pas un défaut non vu : c'est un choix consigné, et je l'ai **démontré** (appel commenté → Test D vert). Doublé par Test A côté effet et par `main.test.tsx` qui importe déjà `./main`. |

Aucun 🛑 BLOCKER.

### Human Verification Required

#### 1. Rejeu du constat d'origine en usage réel (démarrage à froid hors ligne)

**Test :** sur l'app déployée (ou un build de prévisualisation), mettre le navigateur hors ligne (F12 → Réseau → « Hors ligne »), puis RECHARGER la page (démarrage à froid) ; observer le premier rendu.
**Expected :** le bandeau global « Vous êtes hors ligne… » (rôle `status`) est présent **dès la première peinture**, sans attendre un événement `offline`. Puis, de retour en ligne, les données du foyer se rechargent sans action (`refetchOnReconnect`).
**Why human :** le défaut d'origine a été mesuré sur l'app déployée avec une coupure réelle (CONTEXT §« cause prouvée 2 »). Aucun test du dépôt ne pilote le vrai bootstrap de production avec le vrai `navigator.onLine` : `app/e2e/*.spec.ts` ne contient aucune occurrence de `offline`/`onLine`/`setOffline` (`grep` vide), et Test D est TEXTUEL — il ne prouve pas que l'appel s'EXÉCUTE avant le premier rendu. La chaîne production « module `main.tsx` évalué hors ligne → `createRoot().render()` → premier rendu hors ligne » n'est couverte qu'au niveau unitaire (Test A) + textuel (Test D).

#### 2. Limite du contrôle textuel D — à connaître pour la prochaine régression

**Test :** lire `online-status.test.ts:134-159` et le commentaire de `main.tsx:12-17`.
**Expected :** le contrôle est compris pour ce qu'il est — il garde la forme de régression OBSERVÉE (retrait de l'appel), **pas** contre un appel commenté ou déplacé après `createRoot(`. 
**Why human :** c'est un jugement d'ingénierie (garder une garde textuelle plutôt qu'un harnais comportemental complet), assumé et consigné par le plan ; cette vérification le **dit** plutôt que de le laisser implicite (§2.7 D.6 / §2.7 I).

### Gaps Summary

Aucun gap. Les six truths sont vraies sur l'arbre actuel (HEAD = `c069437`), et je les ai vérifiées par mes propres mains : rouges reproduits (A/B sur corps vide, C sur corps non gardé avec `TypeError` — pas `ReferenceError`, D sur appel retiré), assertions **gelées** entre `7fa4293` et `c069437` (`git diff` vide), `dw6` **intact** (les trois fichiers byte-identiques à `b5448da`, `name-only` limité aux trois chemins prévus), garde `typeof navigator` ET source unique `navigator.onLine` présentes, appel module-scope avant `createRoot(`, aucun linter, aucune dette.

Le statut est **human_needed** — non par défaut de code, mais parce que la chaîne production complète (démarrage à froid hors ligne dans un VRAI navigateur) n'est couverte qu'au niveau unitaire et textuel : le dépôt ne pilote nulle part le vrai `navigator.onLine` à travers le vrai bootstrap, et aucun e2e ne traite le hors ligne. C'est le résidu que le SUMMARY annonce lui-même comme `human_judgment` indirect (Test D textuel).

---

_Verified: 2026-10-19T10:48:49Z_
_Verifier: the agent (gsd-verifier)_
