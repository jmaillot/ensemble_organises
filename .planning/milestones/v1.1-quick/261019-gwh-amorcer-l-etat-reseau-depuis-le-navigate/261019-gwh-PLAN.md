---
phase: 261019-gwh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/online-status.ts
  - app/src/lib/online-status.test.ts
  - app/src/main.tsx
  - .planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/COVERAGE.md
autonomous: true
requirements: []
user_setup: []

estimate:
  tokens: 30000
  raw_tokens: 60000
  tasks: 2
  confidence: high

must_haves:
  truths:
    - "Un démarrage à froid hors ligne affiche le bandeau hors ligne dès le premier rendu : l'état réseau initial reflète `navigator.onLine`, il n'attend pas un événement qui n'arrivera jamais (décisions verrouillées 1 et 2 du CONTEXT)."
    - "Après un démarrage à froid hors ligne, le retour du réseau est un CHANGEMENT d'état d'`onlineManager`, donc notifiable : le `refetchOnReconnect: true` posé par `261019-dw6` (D-10, « les erreurs réseau d'origine reviennent ») n'est plus mort sur le chemin qu'il visait."
    - "Dans un environnement sans `navigator` (pré-rendu/SSR), l'amorçage ne lève pas et laisse l'état par défaut en ligne — le même arbitrage que l'instantané serveur de `use-online-status.ts`."
    - "Après chaque test, `onlineManager` ET `navigator.onLine` sont restaurés : le singleton partagé est rendu en ligne pour l'ORDRE INTRA-FICHIER (un test laissé hors ligne ne fait pas échouer les tests suivants du MÊME fichier pour une raison étrangère), et la convention des deux fichiers voisins est suivie. La contagion INTER-FICHIERS est déjà exclue par `isolate: true`."
    - "La politique réseau de `261019-dw6` n'est pas modifiée : `networkMode: 'always'`, `refetchOnReconnect: true`, le bandeau, les gardes de classe et les commentaires corrigés restent tels quels — seul l'état initial est ajouté (décision verrouillée 3 du CONTEXT)."
    - "L'amorçage n'est pas déduit d'un succès réseau (décision verrouillée 4) : une seule source reste `navigator.onLine` et les événements."
  artifacts:
    - path: "app/src/lib/online-status.ts"
      provides: "La couture d'amorçage : `seedOnlineStatus()` pose une fois l'état initial d'`onlineManager` depuis `navigator.onLine`. Module dédié pour être exerçable depuis un test sans le harnais de bootstrap (`#root`, routeur, authentification mockés) que l'import de `main.tsx` exige."
    - path: "app/src/lib/online-status.test.ts"
      provides: "Gardes : bandeau présent au démarrage à froid hors ligne, retour du réseau notifiable, non-lancement sans `navigator`, et appel du bootstrap avant le rendu. Chacune a son rouge pendant l'exercice rouge→vert (A et B sur un corps vide, C sur la variante non gardée, D avant le câblage de `main.tsx`), et aucune assertion ne bouge entre le rouge et le vert."
    - path: "app/src/main.tsx"
      provides: "Le point d'appel de production : `seedOnlineStatus()` au niveau module, à côté de `registerSW({ immediate: true })`, avant `createRoot(...).render(...)`."
    - path: ".planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/COVERAGE.md"
      provides: "Déclaration d'absence d'intégration d'API externe (une ligne raisonnée)."
  key_links:
    - "`app/src/main.tsx` appelle `seedOnlineStatus()` avant `createRoot(...).render(...)`. L'état est donc posé avant que `QueryClientProvider` n'appelle `queryClient.mount()` — seul endroit où `onlineManager.subscribe` est posé (vérifié : `@tanstack/query-core/build/modern/queryClient.js:49-61` définit l'abonnement dans `mount()`, et `@tanstack/react-query/build/modern/QueryClientProvider.js:44` appelle `mount()`). `buildQueryClient()` ne s'abonne pas à la construction : l'ordre tient même si `router.tsx` est évalué avant le corps de `main.tsx` par la résolution des imports."
    - "`app/src/lib/online-status.test.ts` importe le seam depuis `@/lib/online-status`, pas `main.tsx` : `main.tsx` appelle `createRoot` au niveau module et n'est importable par un test qu'avec le harnais de bootstrap (`#root` pré-rempli, routeur et authentification mockés — `app/src/main.test.tsx:18-31`, qui le fait déjà). Importer le seam directement rend l'amorçage exerçable SANS ce harnais : c'est la raison d'être du module dédié, et `main.test.tsx` fournit la couverture d'exécution de l'appel au bootstrap."
    - "La garde du bandeau passe par `seedOnlineStatus()` → `onlineManager` → `OfflineBanner`, c'est-à-dire la chaîne réelle de production, et non un appel direct à `onlineManager.setOnline` (les tests existants de `offline-banner.test.tsx` couvrent ce dernier chemin ; celui-ci couvre l'état initial manquant)."
---

<objective>
Corriger le défaut découvert après `261019-dw6` : le bandeau hors ligne est muet sur un démarrage à froid hors ligne.

La cause est prouvée deux fois (source installée + reproduction navigateur réelle, voir `261019-gwh-CONTEXT.md`) : `onlineManager` a une valeur initiale codée en dur `#online = true` (`@tanstack/query-core/build/modern/onlineManager.js:13`) et ne change QUE sur un événement `online`/`offline` du document courant. Sur un chargement à froid hors ligne, aucun événement n'arrive — l'état reste `true`, le bandeau ne se rend pas, et le retour réel du réseau (`setOnline(true)`) n'est pas un changement, donc **aucune notification** : le `refetchOnReconnect: true` ajouté par `dw6` ne se déclenche jamais sur ce chemin.

Purpose: amorcer `onlineManager` depuis `navigator.onLine` une seule fois, au démarrage, avant le premier rendu — pour que le bandeau dise la vérité dès la première peinture ET que le retour du réseau redevienne un changement d'état notifiable (décisions verrouillées 1 à 5 du CONTEXT).
Output: un module d'amorçage dédié et testable, son appel dans le bootstrap, quatre gardes rouges sur le code d'aujourd'hui qui deviennent vertes, et la chaîne §2.7 jouée une fois — sans rien modifier de ce que `dw6` a livré.
</objective>

<execution_context>
@/home/jmaillot/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/jmaillot/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/261019-gwh-CONTEXT.md
@.planning/quick/261019-dw6-corriger-15-hors-ligne-l-app-affiche-un-/261019-dw6-PLAN.md

Décisions verrouillées du CONTEXT (ne pas rejouer) : amorcer `onlineManager` depuis `navigator.onLine` UNE fois au démarrage (1) ; le point d'appel est le bootstrap `app/src/main.tsx`, même endroit et même nature que `registerSW({ immediate: true })` (2) ; la politique réseau ne change pas — ni `networkMode`, ni `refetchOnReconnect`, ni le bandeau (3) ; ne pas déduire l'état d'un succès réseau (4) ; `navigator.onLine` n'est pas infaillible et sert seulement à ne pas mentir sur l'existence d'une connexion (5). Ces décisions ne sont pas remises en débat.

Code déjà lu et qui décide la forme : `app/src/main.tsx:9` (`registerSW`), `app/src/main.tsx:41-48` (`createRoot` au niveau module — importer ce fichier depuis un test est POSSIBLE, mais seulement en pré-remplissant `#root` et en mockant le routeur et l'authentification : c'est exactement ce que fait `app/src/main.test.tsx:18-31` ; le module dédié existe donc pour exercer l'amorçage SANS ce harnais, pas parce que l'import serait interdit) ; `app/src/hooks/use-online-status.ts:21-26` (l'instantané serveur vaut `true` — l'arbitrage à reproduire) ; `app/src/components/shared/offline-banner.test.tsx:17-23` et `app/src/lib/query-policy.test.ts:78-82` (les suites existantes restaurent `onlineManager` ; le nouveau fichier doit faire de même, par convention et pour son propre ordre intra-fichier) ; `app/src/lib/query-policy.test.ts:118-150` (le modèle d'une garde de classe textuelle, avec sa limite dite) ; `app/node_modules/@tanstack/query-core/build/modern/onlineManager.js:13,77-84` (la valeur initiale et la garde `if (this.#online !== online)`).

Contrainte de vérification (AGENTS.md §2.7, non négociable ; aucun linter n'est configuré et il est interdit d'en ajouter) : la chaîne prescrite pour un changement frontend est, dans cet ordre, `cd app && npm run typecheck && npm test && npm run build`, **puis** `cd app && npm run test:e2e`. Pendant le développement, n'utiliser que des exécutions ciblées ; la chaîne complète est jouée **une fois**, à la fin, comme sa propre étape. `app/src/lib/no-eslint-directive.test.ts` refuse toute directive de linter — il n'y en aura aucune. Ce changement déplace le bootstrap que tous les parcours critiques exercent : la ligne e2e est **jouée**, pas survolée. Les lignes SQL/Vault/Docker de §2.7 sont hors sujet (aucun SQL, aucune fonction, aucun secret touché) et le SUMMARY doit **nommer** chaque commande prescrite avec son sort plutôt que d'écrire « chaîne complète » (§2.7 I).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Amorcer l'état réseau au démarrage — la tranche minimale, et ses preuves rouges</name>
  <files>app/src/lib/online-status.ts, app/src/lib/online-status.test.ts, app/src/main.tsx</files>
  <behavior>
    - Test A (bandeau au démarrage à froid) : `navigator.onLine` mis à `false`, puis `seedOnlineStatus()`, puis `onlineManager.isOnline()` vaut `false` et `<OfflineBanner />` rend son rôle `status` (« Vous êtes hors ligne »). Rouge aujourd'hui : sans amorçage, l'état vaut `true` et le bandeau ne rend rien.
    - Test B (conséquence 2, la notification) : abonner un écouteur à `onlineManager`, puis `navigator.onLine = false`, `seedOnlineStatus()`, puis `onlineManager.setOnline(true)` — le chemin qu'emprunte un vrai événement `online`. Le journal des notifications doit valoir `[false, true]`, c'est-à-dire un vrai CHANGEMENT d'état. Rouge aujourd'hui : sans amorçage, `setOnline(true)` n'est pas un changement et rien n'est notifié (`[]`).
    - Test C (environnement sans navigateur) : `vi.stubGlobal('navigator', undefined)` puis `seedOnlineStatus()` ne lève pas et laisse `onlineManager.isOnline()` à `true` (même arbitrage que l'instantané serveur du hook). Rouge si la garde `typeof navigator` est retirée : la variante non gardée évalue `navigator.onLine` sur un identifiant resté lié à `undefined` — l'échec est donc une lecture de `.onLine` sur `undefined` (un `TypeError` du moteur), JAMAIS un `ReferenceError` (`vi.stubGlobal` lie le nom sans le supprimer).
    - Test D (appel du bootstrap) : le contenu de `app/src/main.tsx` contient l'appel `seedOnlineStatus()` et cet appel précède `createRoot(`. Garde TEXTUELLE de classe, de la même nature que le Test E de `query-policy.test.ts`, avec sa limite dite en commentaire : elle garde la forme de régression observée (retrait de l'appel), pas contre un auteur décidé. Choix assumé et consigné : on garde la garde TEXTUELLE plutôt qu'une garde comportementale du bootstrap. `app/src/main.test.tsx:29-31` importe DÉJÀ `./main` (avec `#root` pré-rempli et routeur/authentification mockés), donc l'appel module-level `seedOnlineStatus()` s'exécute déjà sous `npm test` — mais ce fichier n'assère pas l'amorçage, et une garde comportementale dédiée exigerait de reproduire tout ce harnais de bootstrap pour une seule ligne : disproportionné pour cette tâche. La propriété de l'effet est doublée par Test A (du côté de l'observateur) et la présence de l'appel par Test D ; la limite du contrôle textuel reste dite.
  </behavior>
  <action>
    Étape 1 — Écrire d'abord `app/src/lib/online-status.test.ts` (les quatre gardes). Imports : `afterEach, beforeEach, describe, expect, it, vi` de `vitest`, `render, screen` de `@testing-library/react`, `onlineManager` de `@tanstack/react-query`, `readFileSync`/`resolve` de `node:fs`/`node:path` pour la garde D, `seedOnlineStatus` de `@/lib/online-status`, `OfflineBanner` de `@/components/shared/offline-banner`.

      Préambule en français qui dit le POURQUOI : l'état initial d'`onlineManager` est `true` en dur et ne change qu'à un événement ; sur un démarrage à froid hors ligne il n'y a aucun événement, donc le bandeau ment et le retour du réseau n'est pas notifiable — ce que Test B mesure exactement.

      Aide de stub de `navigator.onLine` (le point que le plan précédent n'avait pas eu à traiter) : `navigator.onLine` est un accesseur en lecture seule sur le prototype (vérifié : descripteur propre `undefined`, descripteur de prototype configurable). Chaque test pose donc une propriété propre par `Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })`, et restaure en `finally` en relisant le descripteur propre d'origine (s'il existe) ou en supprimant la propriété propre pour laisser l'accesseur du prototype réapparaître. Ne pas utiliser `vi.stubGlobal('navigator', ...)` pour les Tests A et B : cela remplacerait tout `navigator`. Pour le Test C seulement, `vi.stubGlobal('navigator', undefined)` est le moyen exact de rendre `typeof navigator === 'undefined'` ; le restaurer par `vi.unstubAllGlobals()` dans `finally`.

      Restauration du singleton (impérative, guidance 3) : `beforeEach(() => onlineManager.setOnline(true))` **et** `afterEach(() => onlineManager.setOnline(true))`, avec un commentaire qui dit la VRAIE raison (§2.7 I — ne pas recopier la justification trop large des fichiers voisins) : `onlineManager` est un singleton partagé À L'INTÉRIEUR du fichier, donc un test laissé hors ligne ferait échouer les tests SUIVANTS de ce même fichier pour une raison qui n'est pas la leur ; la restauration suit aussi la convention des deux fichiers voisins (`offline-banner.test.tsx:17-23`, `query-policy.test.ts:78-82`). Ne PAS écrire que l'omission contaminerait `offline-banner.test.tsx`, `query-policy.test.ts` ou `courses-offline.test.tsx` : Vitest tourne avec `isolate: true` par défaut (seuls `pool: 'forks'` et `fileParallelism: false` sont posés dans `app/vite.config.ts`), donc chaque fichier a son propre registre de modules et la contagion INTER-FICHIERS est impossible. Chaque test restaure AUSSI `navigator.onLine` en `finally`, y compris quand une assertion échoue.

      Test D : localiser `app/src/main.tsx` comme le fait `query-policy.test.ts` (remonter depuis `process.cwd()` jusqu'à le trouver), asserter que `content.indexOf('seedOnlineStatus()') >= 0` et que cet index précède `content.indexOf('createRoot(')`. Commenter la limite : l'aiguille textuelle peut être satisfaite par un commentaire ; c'est acceptable parce que la propriété (« le bootstrap amorce avant de rendre ») n'est pas observée plus finement sans démarrer le bootstrap complet, parce que `app/src/main.test.tsx` importe déjà `./main` (donc l'appel s'exécute sous `npm test`, sans y être asserté), et parce que le Test A double la propriété du côté de l'effet. Le choix d'une garde TEXTUELLE plutôt que comportementale est justifié dans ce commentaire, pas seulement subi.

    Étape 2 — Créer `app/src/lib/online-status.ts` avec `seedOnlineStatus` dont le corps est **vide pour l'instant** (`export function seedOnlineStatus(): void {}`), avec un commentaire en français indiquant que ce corps vide existe pour que les gardes A et B échouent sur l'ASSERTION et non sur un import manquant, et que l'amorçage est le geste de cette tâche. C'est ce qui rend le rouge prouvable : un contrôle se prouve sur un cas qui doit échouer (§2.7 D.6).

    Étape 3 — Prouver les rouges (§2.7 B), et les nommer séparément :
      (a) exécuter `npm --prefix app run test -- src/lib/online-status.test.ts` → consigner MOT POUR MOT la sortie RÉELLE de Test A et de Test B, plutôt qu'une chaîne prédite par ce plan : A est l'échec de `expect(...isOnline()).toBe(false)` sur un état resté `true` (bandeau absent), B est l'échec de `expect(journal).toEqual([false, true])` sur un journal vide. La forme exacte du message appartient au moteur — c'est l'exécution qui la fixe, pas le plan, qui ne l'a pas observée. Test C et Test D : dire leur sort réel (Test C passe sur un corps vide — son rouge propre viendra à l'étape suivante ; Test D échoue parce que `main.tsx` n'appelle rien encore).
      (b) remplacer temporairement le corps par la variante NON gardée `onlineManager.setOnline(navigator.onLine)` et relancer uniquement Test C → consigner mot pour mot le lancer RÉEL, puis restaurer. Le mécanisme à décrire, sans citer une chaîne d'avance : `vi.stubGlobal('navigator', undefined)` LIE l'identifiant à `undefined` sans le supprimer, donc `typeof navigator` vaut `'undefined'` (la garde reste efficace) et c'est la lecture `navigator.onLine` sur `undefined` qui échoue — un `TypeError` du moteur (lecture d'une propriété de `undefined`), PAS un `ReferenceError` (qui exigerait un nom non lié, ce que `stubGlobal` ne produit pas). Ce texte RÉEL, capturé à l'exécution, est la preuve que la garde `typeof navigator` a une raison d'être ; le plan ne l'écrit pas d'avance. Test A et Test B passent alors — c'est attendu, et le dire évite de lire ce basculement comme une assertion retouchée.

    Étape 4 — Poser l'implémentation finale dans `app/src/lib/online-status.ts` : `seedOnlineStatus()` commence par `if (typeof navigator === 'undefined') return;` (pré-rendu sans navigateur : rien à amorcer, l'état par défaut reste en ligne, comme l'instantané serveur de `use-online-status.ts`), puis appelle `onlineManager.setOnline(navigator.onLine)`. Un commentaire en français dit les deux choses que le module doit dire et qu'un lecteur ne peut pas deviner : (i) la source de vérité reste `navigator.onLine` ET les événements, jamais un succès réseau (décision 4) ; (ii) `navigator.onLine` ne dit pas si NOTRE backend répond — cet état ne sert qu'à ne pas mentir sur l'existence d'une connexion, jamais à garantir qu'une lecture aboutira (décision 5). Ce commentaire ne doit affirmer rien de faux (§2.7 I) : ne pas écrire qu'il « garantit » la fiabilité du réseau.

    Étape 5 — Câbler le bootstrap `app/src/main.tsx` : importer `seedOnlineStatus` de `@/lib/online-status` et appeler `seedOnlineStatus();` au niveau module, juste après `registerSW({ immediate: true });` (même endroit, même nature — décision 2). Ne PAS déplacer l'amorçage dans `router.tsx` ni dans un effet de composant, et ne PAS le déduire de `navigator.onLine` recalculé à chaque événement : décision 1, et le commentaire posé sur l'appel doit dire pourquoi c'est le bootstrap et pourquoi une fois (le premier rendu doit déjà porter la bonne valeur ; `QueryClientProvider` n'appelle `queryClient.mount()` — donc `onlineManager.subscribe` — qu'au rendu, après ce point).

    Étape 6 — Reprouver : `npm --prefix app run test -- src/lib/online-status.test.ts` → les quatre gardes vertes, sans qu'aucune assertion ait été retouchée depuis l'étape 1. Le seul delta entre le rouge et le vert est le corps d'`online-status.ts` et l'appel dans `main.tsx`.

    Interdits : aucune directive de linter (un test la refuse) ; ne toucher ni à `app/src/lib/query-policy.ts`, ni au bandeau, ni aux gardes existantes ; ne pas réintroduire de file de rejeu ni de déduction d'état depuis un succès réseau ; rédaction et commentaires en français.
  </action>
  <verify>
    <automated>cd app && npm run typecheck</automated>
    <automated>npm --prefix app run test -- src/lib/online-status.test.ts</automated>
  </verify>
  <done>Le typecheck est vert. Depuis un état rouge prouvé et nommé, les quatre gardes de `app/src/lib/online-status.test.ts` sont vertes : (A) un démarrage à froid hors ligne affiche le bandeau ; (B) après amorçage hors ligne, `onlineManager.setOnline(true)` produit un CHANGEMENT notifié `[false, true]` — le `refetchOnReconnect` de `dw6` reprend vie sur ce chemin ; (C) dans un environnement sans `navigator`, `seedOnlineStatus()` ne lève pas et laisse l'état en ligne ; (D) `app/src/main.tsx` appelle `seedOnlineStatus()` avant `createRoot(`. La sortie rouge de l'étape 3 est capturée mot pour mot. Aucune assertion n'a bougé entre le rouge et le vert ; le seul delta est le corps du seam et son appel. Aucun linter n'est introduit, et ni `query-policy.ts` ni le bandeau n'ont été modifiés.</done>
</task>

<task type="auto">
  <name>Task 2: La chaîne §2.7 en une passe, et les quatre suites du singleton vertes ensemble</name>
  <files>.planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/COVERAGE.md</files>
  <action>
    Étape 1 — Vérifier que le nouveau fichier respecte la convention des fichiers qui manipulent `onlineManager` : exécuter ENSEMBLE, dans un seul appel, `npm --prefix app run test -- src/lib/online-status.test.ts src/components/shared/offline-banner.test.tsx src/lib/query-policy.test.ts src/modules/courses/courses-offline.test.tsx`. Les quatre doivent être vertes. Ce que cet appel prouve, et rien de plus : le nouveau fichier tient son ORDRE INTRA-FICHIER (`afterEach` restaure `onlineManager` et `navigator.onLine` à son accesseur d'origine pour ses propres tests suivants) et suit la convention des trois autres. La contagion INTER-FICHIERS n'est PAS ce qu'il mesure : Vitest tourne avec `isolate: true` (seuls `pool: 'forks'` et `fileParallelism: false` sont posés dans `app/vite.config.ts`), donc chaque fichier a son propre registre de modules. Consigner les totaux passés, pas un « vert » nu.

    Étape 2 — Jouer la chaîne frontend d'AGENTS.md §2.7, une seule fois, dans l'ordre exact, et DIRE ce qui a été joué et ce qui ne l'a pas été (§2.7 I). (a) `cd app && npm run typecheck && npm test && npm run build` : la suite `npm test` en entier, sans filtre, total consigné. (b) `cd app && npm run test:e2e` : **jouée**, pas seulement mentionnée — elle exerce le bootstrap que ce changement déplace (connexion, création/rejoint de foyer, tâche, dépense, scan de fidélité), ce que Vitest ne couvre pas ; `app/playwright.config.ts` démarre lui-même son serveur (`npm run build && npm run preview`, port 4173), donc la commande est autoportante. Consigner les totaux passés/skippés. (c) Les lignes sans objet, nommées avec leur raison : `python3 scripts/check-sql-statique.py`, `sh scripts/test-db.sh` et `sh scripts/test-dispatch-push.sh` ne portent que sur les migrations, les fonctions SQL et Vault — cette tâche n'écrit aucun SQL, aucune fonction, aucun secret. (d) `app/src/lib/no-eslint-directive.test.ts` doit rester vert (aucune directive introduite). Si `test:e2e` ne peut réellement pas s'exécuter (binaire navigateur absent, serveur de prévisualisation qui ne démarre pas), la commande exacte tentée et sa sortie vont dans le SUMMARY sous « Chaîne non jouée » : l'omission est dite, jamais silencieuse. Pendant le développement, n'utiliser que des exécutions ciblées ; cette étape est la seule exécution complète.

    Étape 3 — Créer `COVERAGE.md` dans le répertoire de la tâche : une seule ligne raisonnée, sans matrice de capacités inventée — cette tâche n'intègre aucune API externe, elle amorce un état en mémoire depuis une propriété du navigateur.

    Étape 4 — Écrire le SUMMARY avec : (i) une ligne « Chaîne §2.7 » qui nomme CHAQUE commande prescrite et son sort (jouée/verte, totaux ; ou sans objet + la raison) ; (ii) la démonstration rouge→vert reprise de la Task 1, avec le partage nommé des rouges (A et B sur corps vide ; C sur corps non gardé ; D avant le câblage de `main.tsx`) et le fait que les assertions n'ont pas bougé ; (iii) le rappel explicite que la politique réseau de `dw6` est intacte. Ne rien écrire dans `app/src` ici.
  </action>
  <verify>
    <automated>npm --prefix app run test -- src/lib/online-status.test.ts src/components/shared/offline-banner.test.tsx src/lib/query-policy.test.ts src/modules/courses/courses-offline.test.tsx</automated>
    <automated>cd app && npm run typecheck && npm test && npm run build</automated>
    <automated>cd app && npm run test:e2e</automated>
  </verify>
  <done>Les quatre suites qui manipulent `onlineManager` passent ensemble — la restauration `afterEach` du nouveau fichier tient l'ORDRE INTRA-FICHIER (et `navigator.onLine` est rendu à son accesseur d'origine), dans la convention des fichiers voisins ; la contagion inter-fichiers est acquise par `isolate: true`, elle n'est pas ce que cet appel prouve. La chaîne `typecheck && test && build` puis `npm run test:e2e` est verte en une passe, et le SUMMARY porte une ligne « Chaîne §2.7 » nommant chaque commande prescrite avec son sort (jouée/verte avec totaux, ou sans objet avec la raison), plutôt qu'un « chaîne complète » implicite. `COVERAGE.md` porte la déclaration d'absence d'API externe. Aucun fichier de `app/src` n'a été modifié par cette tâche.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navigateur (état réseau déclaré) → état de l'application | `navigator.onLine` est une propriété du CLIENT : un utilisateur, une extension ou les devtools peuvent la fixer à volonté. Ce plan en fait la valeur INITIALE de l'état réseau de l'application. |
| état réseau → décisions de lecture/écriture | `onlineManager` décide si une requête part (`networkMode`) et si un rechargement à la reconnexion est notifié (`refetchOnReconnect`), et pilote un bandeau cosmétique. Aucune de ces décisions n'est une autorisation. |

## Analyse honnête du risque (ASVS niveau 1, seuil `high`)

Seeding depuis `navigator.onLine` fait entrer une propriété contrôlée par le client dans l'état réseau de l'application. La question posée est : une décision d'AUTORISATION ou d'INTÉGRITÉ DES DONNÉES lit-elle cet état ? Réponse, vérifiée dans le code : **non**. La seule frontière d'autorisation reste côté serveur (RLS + Edge Functions, AGENTS.md §2.6/§8.5). Faire croire à l'application qu'elle est EN ligne la conduit à TENTER la requête — que le serveur autorisera ou refusera comme d'habitude. Faire croire qu'elle est HORS ligne la conduit à refuser localement une requête (auto-DoS local, sans escalade). Les sites qui lisent `navigator.onLine` (`route-preload.ts` pour éviter un téléchargement voué à l'échec ; `parametres/api.ts` et `ardoise/api.ts` pour un message avant tentative) sont des gardes d'expérience, pas des contrôles d'accès. Le risque résiduel est donc réel mais de gravité `low`, et il est DIT plutôt que déclaré nul : l'état affiché peut mentir sur la connexion si le client le falsifie, sans jamais desserrer une autorisation. Ce plan ne doit PAS devenir un précédent pour lire un état client dans une décision de permission : c'est écrit ici comme contrainte.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261019-gwh-01 | Spoofing (état affiché) | `app/src/lib/online-status.ts` + `app/src/hooks/use-online-status.ts` + bandeau | low | accept | Un client peut falsifier `navigator.onLine` et faire croire « hors ligne » (refus local, bandeau affiché) ou « en ligne » (tentative). Aucune autorisation ne lit cet état : la RLS/Edge reste la frontière (§2.6/§8.5). Risque résiduel assumé et consigné ; à re-promouvoir en `mitigate` le jour où un état réseau entrerait dans une décision de permission. |
| T-261019-gwh-02 | Repudiation / intégrité | `refetchOnReconnect` (conséquence 2) | low | mitigate | L'amorçage rend le retour du réseau NOTIFIABLE (Test B : le journal vaut `[false, true]`), pour que le rechargement à la reconnexion de `dw6` reprenne sur le chemin « démarrage à froid hors ligne » ; sans cela, l'application pouvait rester sur des données périmées sans jamais recharger. Ne touche ni à `networkMode` ni à l'autorisation. |
| T-261019-gwh-03 | Denial of service (local) | `main.tsx` → `seedOnlineStatus()` | low | accept | Amorcer « hors ligne » sur un mensonge du client ne coupe que ce client (lectures/écritures refusées localement par `networkMode`/les gardes) ; les autres membres du foyer et le serveur ne sont pas affectés. Aucune portée côté serveur. |
| T-261019-gwh-SC | Tampering | aucune installation de paquet | low | accept | Cette tâche n'ajoute aucune dépendance npm, ne touche à aucun lockfile et n'exécute aucun `install` : la porte de légitimité des paquets ne s'applique pas. À rejouer si une dépendance était introduite. |
</threat_model>

<verification>
- Rouge→vert, prouvé et nommé (§2.7 B/D.6) : les gardes A, B, C et D de `app/src/lib/online-status.test.ts` échouent sur le code d'aujourd'hui pour une raison qui n'est pas un import manquant (A et B sur un corps vide = assertion ; C sur un corps non gardé = lancer ; D avant le câblage). La sortie rouge est capturée mot pour mot ; aucune assertion n'est retouchée entre le rouge et le vert.
- Les quatre suites qui manipulent `onlineManager` et stubent `navigator.onLine` passent ENSEMBLE dans un seul appel : la restauration `afterEach` du nouveau fichier tient son propre ORDRE INTRA-FICHIER et suit la convention des fichiers voisins. L'isolement inter-fichiers est acquis par `isolate: true` — ce n'est pas ce que cet appel mesure.
- Chaîne frontend §2.7, une fois, en fin de Task 2 : `cd app && npm run typecheck && npm test && npm run build`, puis `cd app && npm run test:e2e`.
- Ligne « Chaîne §2.7 » dans le SUMMARY : chaque commande prescrite nommée avec son sort — `check-sql-statique.py`, `test-db.sh`, `test-dispatch-push.sh` sans objet (aucun SQL, aucune fonction, aucun secret), `test:e2e` jouée, ou son omission dite sous « Chaîne non jouée » avec la commande tentée et sa sortie.
- La politique réseau de `261019-dw6` est intacte : `networkMode: 'always'`, `refetchOnReconnect: true`, le bandeau, les gardes de classe et les commentaires ne sont pas modifiés (aucun fichier de `dw6` n'apparaît dans `files_modified`).
- Aucun linter introduit : `app/src/lib/no-eslint-directive.test.ts` reste vert.
- `COVERAGE.md` porte la déclaration d'absence d'API externe.
</verification>

<success_criteria>
- Un démarrage à froid hors ligne affiche le bandeau dès le premier rendu : l'état initial reflète `navigator.onLine` (Test A).
- Après un démarrage à froid hors ligne, le retour du réseau est un CHANGEMENT d'état notifié `[false, true]` — `refetchOnReconnect` de `dw6` n'est plus mort sur ce chemin (Test B).
- L'amorçage ne lève pas dans un environnement sans `navigator` (Test C) et est invoqué par le bootstrap avant le rendu (Test D).
- Le singleton `onlineManager` et `navigator.onLine` sont restaurés après chaque test : l'ORDRE INTRA-FICHIER est préservé et la convention des fichiers voisins est suivie (la contagion inter-fichiers est déjà exclue par `isolate: true`).
- La politique réseau de `dw6` n'est pas modifiée ; seul l'état initial manquant est ajouté.
- La chaîne §2.7 est jouée en une passe et chaque commande prescrite est nommée avec son sort dans le SUMMARY.
</success_criteria>

<output>
Créer `.planning/quick/261019-gwh-amorcer-l-etat-reseau-depuis-le-navigate/261019-gwh-SUMMARY.md` à la fin.
</output>
