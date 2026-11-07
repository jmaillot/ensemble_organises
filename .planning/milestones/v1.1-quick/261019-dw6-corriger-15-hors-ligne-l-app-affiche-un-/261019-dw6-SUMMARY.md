---
phase: 261019-dw6
plan: 01
subsystem: ui
tags: [tanstack-query, network-mode, offline, pwa, react, vitest, playwright]

# Dependency graph
requires:
  - phase: 09-pwa-offline
    provides: "D-10 — retrait de l'offline (fait, mais la promesse « les erreurs réseau d'origine reviennent » n'était pas tenue : c'est l'objet de cette tâche)"
provides:
  - "Politique réseau et de cache unique et partagée (`app/src/lib/query-policy.ts`), dont dérivent l'application ET le harnais de test"
  - "`networkMode: 'always'` et `refetchOnReconnect: true` pour les requêtes ET les mutations"
  - "Bandeau global d'état hors ligne (le seul porteur de l'explication de la coupure)"
  - "Garde de classe prouvée rouge→vert (invariant de politique, valeurs résolues du client réel, refus d'un client écrit à la main)"
  - "Non-régression de bout en bout : page Courses, cache vide + navigateur hors ligne → erreur, jamais l'état vide mensonger"
affects: [pwa-offline, toutes-les-pages-lisant-via-useResource]

actuals:
  tokens: 6070    # chars/4 sur le diff realisé (24 281 caracteres), MEME echelle que l'estimate du PLAN
  tasks: 3
  commits: 3      # MESURE : git rev-list --count 0b7a8c6..HEAD (#3968)
  plan_head_before: 0b7a8c6b489598f7e0cbd185bb3041fa9e8571d9
  plan_head_after: f1d5191b58177802a1c3ab26e2c070bf78ffe6e4

tech-stack:
  added: []
  patterns:
    - "Source unique de politique: `QUERY_POLICY` + `buildQueryClient(overrides)` dans `@/lib/query-policy`, dont `router.tsx` ET `test/render.tsx` dérivent"
    - "Un magasin externe se lit par `useSyncExternalStore` sur sa source réelle (`onlineManager`), jamais par une seconde vérité (événements navigateur)"

key-files:
  created:
    - app/src/lib/query-policy.ts
    - app/src/lib/query-policy.test.ts
    - app/src/hooks/use-online-status.ts
    - app/src/components/shared/offline-banner.tsx
    - app/src/components/shared/offline-banner.test.tsx
    - app/src/modules/courses/courses-offline.test.tsx
  modified:
    - app/src/app/router.tsx
    - app/src/test/render.tsx
    - app/src/modules/dashboard/hooks/use-dashboard.ts
    - app/src/app/route-preload.ts

key-decisions:
  - "Le defaut se corrige sur la CLASSE (politique unique lue par tout client), pas sur les 10 instances `!isLoading && !isError` : les reecrire aurait ete l'erreur que §2.7 E proscrit (D-261019-dw6)"
  - "`refetchOnReconnect: true` pose EXPLICITEMENT : dans le mode 'always', TanStack le passe a false par defaut, donc l'omettre aurait perdu le rechargement a la reconnexion"
  - "L'accueil ne recoit AUCUNE gestion d'erreur propre (arbitrage utilisateur verrouille) : c'est le bandeau qui porte seul l'explication de la coupure"
  - "Le bandeau lit `onlineManager`, la MEME source que la politique reseau, donc il ne peut pas contredire ce que font les requetes"
  - "Test E (refus d'un client ecrit a la main) est une ceinture textuelle assumee et limitee, doublee par le Test D (valeurs resolues du client reel) qui porte la propriete"

patterns-established:
  - "Garde de classe aiguille construite par `join` pour ne pas se denoncer elle-meme (forme reprise de `no-eslint-directive.test.ts`), avec auto-controle : le seul fichier autorise doit MATCHER l'aiguille, sinon le garde ne regarde rien"

requirements-completed: []

coverage:
  - id: D1
    description: "Hors ligne, cache vide : CoursesPage affiche « Réessayer », jamais « Aucune liste pour ce foyer »"
    verification:
      - kind: unit
        ref: "app/src/modules/courses/courses-offline.test.tsx#Courses hors ligne (#15) › cache vide : dit qu'elle n'a pas pu lire, jamais « aucune liste »"
        status: pass
    human_judgment: false
  - id: D2
    description: "Politique reseau unique et partagee; le queryClient que main.tsx monte resout networkMode 'always' et refetchOnReconnect true (requetes ET mutations)"
    verification:
      - kind: unit
        ref: "app/src/lib/query-policy.test.ts#A / B / D / E"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bandeau global hors ligne qui porte, a lui seul, l'explication de la coupure"
    verification:
      - kind: unit
        ref: "app/src/components/shared/offline-banner.test.tsx (rendu hors ligne, rien en ligne, bascule en direct)"
        status: pass
    human_judgment: true
    rationale: "La mecanique (apparition/disparition liee a onlineManager) est testee, mais le TEXTE qui « explique la situation a lui seul » est un jugement de clarte que la machine ne tranche pas — il compense l'absence d'etat d'erreur propre sur l'accueil, arbitrage verrouille."
  - id: D4
    description: "Les deux commentaires de la file de rejeu supprimee par D-10 disent la verite"
    verification:
      - kind: other
        ref: "! grep -q 'la file rejouera' app/src/modules/dashboard/hooks/use-dashboard.ts && ! grep -q 'la file de synchro' app/src/app/route-preload.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Le constat d'origine en usage reel (Firefox deploye, F12 → Hors ligne → Courses) ne se reproduit plus"
    verification: []
    human_judgment: true
    rationale: "Observation produite sur l'app DEPLOYEE par un humain ; aucun artifice de test ne remplace ce parcours en usage reel (le defaut ne se manifeste qu'a froid, l'utilisateur l'a mesure)."

duration: 21min
completed: 2026-10-19
status: complete
---

# Quick Task 261019-dw6 : Corriger #15 — hors ligne, l'app affichait un état vide au lieu de dire qu'elle n'avait pas pu lire

**Politique réseau unique (`networkMode: 'always'` + `refetchOnReconnect` explicite) dont le client de l'application dérive réellement, bandeau global qui porte seul l'explication de la coupure, et garde de classe prouvée rouge→vert.**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-10-19T08:29:39Z
- **Completed:** 2026-10-19T08:50:15Z
- **Tasks:** 3/3
- **Files modified:** 10 (6 créés, 4 modifiés)

## Le défaut, et pourquoi il est corrigé sur la classe

TanStack Query 5.103.2 a `networkMode` par défaut à `'online'`, jamais configuré dans le dépôt. Hors ligne, une requête ne part pas : elle passe en `fetchStatus: 'paused'`. Or `isLoading = isPending && isFetching`, donc `isLoading` vaut **false** en pause, et `isError` aussi. La garde `!isLoading && !isError && rows.length === 0` s'ouvrait et rendait l'état vide ordinaire. Dix gardes étaient touchées dans cinq modules, plus l'accueil — qui n'expose aucun état d'erreur propre (arbitrage verrouillé de l'utilisateur).

Le remède porte sur la **classe** (AGENTS.md §2.7 E) : une politique réseau posée en un seul point, dont dérivent l'application **et** le harnais de test. Les dix gardes n'ont pas été touchées — elles sont correctes une fois la politique posée.

## Accomplishments

- `app/src/lib/query-policy.ts` : source **unique** des `defaultOptions` du `QueryClient` (`QUERY_POLICY` + `buildQueryClient(overrides)`). `router.tsx` et `test/render.tsx` en dérivent tous les deux — le test de non-régression exerce donc la politique **réelle** de l'application, pas une politique locale au test.
- `networkMode: 'always'` (requêtes **et** mutations) et `refetchOnReconnect: true` explicite — dans le mode `'always'`, TanStack bascule `refetchOnReconnect` à `false` par défaut (`defaultQueryOptions` de `queryClient.ts`), donc l'omettre aurait fait perdre le rechargement à la reconnexion.
- `OfflineBanner` monté une fois dans `AppRouter` (hors `Routes`) : il couvre le shell **et** les pages hors shell, l'accueil compris. Il lit `onlineManager` via `useOnlineStatus` (`useSyncExternalStore`) — la **même** source que celle qui décide de la mise en pause.
- Garde de classe `query-policy.test.ts` : invariant de politique (A), preuve **comportementale** que hors ligne une lecture en échec atteint l'erreur (B), valeurs **résolues** du `queryClient` que `main.tsx` monte (D), et refus d'un client écrit à la main hors de la politique (E).
- Non-régression `courses-offline.test.tsx` (C) : cache **vide**, navigateur **déclaré hors ligne avant le montage**, `data.list` qui rejette → le bouton « Réessayer » apparaît et « Aucune liste pour ce foyer » est absent.
- Les deux commentaires qui renvoyaient encore à la file de rejeu supprimée par D-10 disent la vérité (écriture `city` non rejouée ; préchargement hors ligne voué à l'échec, plus une histoire de bande passante).

## Task Commits

Chaque tâche committée atomiquement **sous `app/` seulement** (`.planning/` est gitignoré) :

1. **Task 1 (tracer) : politique partagée + preuves rouges** — `f3ee6fc` (test)
2. **Task 2 : politique `always` + bandeau global** — `e07c6fd` (fix)
3. **Task 3 : commentaires résiduels** — `f1d5191` (fix)

## Red → Green, et le partage des rouges

**Sortie rouge capturée** (Task 1 step 6, `/tmp/opencode/dw6-red.txt`) — les deux fichiers ciblés, `Test Files 2 failed (2)`, `Tests 4 failed | 2 passed (6)` :

```
AssertionError: expected undefined to be 'always' // Object.is equality
 ❯ src/lib/query-policy.test.ts:86:47          (Test A)
AssertionError: expected 'pending' to be 'rejected' // Object.is equality
 ❯ src/lib/query-policy.test.ts:107:21         (Test B)
AssertionError: expected undefined to be 'always' // Object.is equality
 ❯ src/lib/query-policy.test.ts:112:42         (Test D)
TestingLibraryElementError: Unable to find role="button" and name "Réessayer"
 ❯ src/modules/courses/courses-offline.test.tsx:37:25   (Test C)
```

**Sortie verte** (Task 2 step 6, `/tmp/opencode/dw6-green.txt`) — `Test Files 3 passed (3)`, `Tests 9 passed (9)`, **sans qu'aucune assertion ait été retouchée** (le seul delta de source entre les deux exécutions est la politique réseau dans `query-policy.ts`).

**Partage des rouges, nommé (pas résumé) :**
- **Tests A, B, D et C** : rouges parce que `networkMode` manquait encore ; devenus verts par la **seule** politique réseau (Task 2). C'est la preuve que la garde pouvait échouer (§2.7 B).
- **Test E** : vert à la fin de la Task 1. Sa capacité de rouge **est déduite, pas exercée** : `grep -rn "new QueryClient" app/src` ne rendait **que deux** occurrences avant la Task 1, `app/src/app/router.tsx:18` et `app/src/test/render.tsx:10` — les deux clients que la Task 1 a fait dériver de la fabrique. Avant la Task 1, ces deux fichiers auraient été les fichiers fautifs nommés par Test E (rouge) ; à la fin de la Task 1 il n'en reste aucun, donc Test E est vert. Cette rougeur n'a **jamais été observée** : elle est un raisonnement à partir du `grep` vérifié, et il est écrit ici pour ce qu'il est (le conseil du vérificateur de plan demandait cette honnêteté plutôt qu'un « observé rouge » inventé).

## Constats

- **`app/src/modules/dashboard/hooks/use-dashboard.ts:222-233` (écriture `city`)** : seule écriture initiée par l'utilisateur qui **n'affiche pas** le message d'origine — elle attrape et garde la valeur dans le store, sans toast. C'est l'arbitrage verrouillé (`09-CONTEXT`, D-10 : « laisser échouer et afficher le message d'origine » vaut pour les écritures des modules ; l'accueil, lui, n'a aucune gestion d'erreur propre). Le commentaire a été corrigé pour dire la vérité (« rien ne la rejoue ») ; le comportement n'a **pas** été changé, hors périmètre sans décision.
- **`app/src/lib/no-eslint-directive.test.ts`** reste vert (aucune directive de linter introduite ; aucun linter n'existe dans ce dépôt et il est interdit d'en ajouter).

## Inventaire des écritures — module par module (vérifié, pas affirmé)

Méthode : les trois greps prescrits (`catch {`, `catch(() => undefined)`, `catch (() => [])`) puis lecture du gestionnaire de soumission de chaque module du shell. Verdict : **aucun `catch` muet sur une écriture initiée par l'utilisateur** ; partout l'erreur **d'origine** (`error.message`) atteint un toast `'error'`.

| Module | Ce qui a été ouvert | Verdict |
|---|---|---|
| Courses | `courses-page.tsx:112-116` (`runQuietly`), `:146`, `:151`, `:176` | OK — `runQuietly` relaie `actionError.message` |
| Recettes | `recettes-page.tsx:91`, `recette-detail-page.tsx:117` (+8 sites) | OK |
| Prestataires | `prestataires-page.tsx:59, 68, 79, 92` | OK |
| Animaux | `animaux-page.tsx:123, 135, 160, 171` | OK |
| Voyages | `voyages-page.tsx:101`, `hooks/use-voyages.ts:152, 169` (+33 sites) | OK |
| Tâches | `taches-page.tsx:172, 179-182, 222, 231, 306-311, 338` | OK |
| Calendrier | `calendrier-page.tsx:129, 137, 201, 410` (+5 sites) | OK |
| Notes | `notes-page.tsx:116, 125, 335-340, 360-363` | OK |
| Routines | `routines-page.tsx:79, 120, 129` | OK |
| Ardoise | `ardoise-page.tsx:158, 180, 334, 350`, `ardoise-detail-page.tsx:228, 238, 454, 553, 672, 699` | OK |
| Cadeaux | `cadeaux-page.tsx:184, 231, 245` (+16 sites) | OK |
| Anniversaires | `anniversaires-page.tsx:242, 266` | OK |
| Adresses | `adresses-page.tsx:80, 94, 104` | OK |
| Cercle | `hooks/use-cercle.ts:249, 290, 323` (+5 sites) | OK |
| Messages | `messages-page.tsx:103, 170, 177, 190, 202` (+5 sites) | OK |
| Fidélité | `fidelite-page.tsx:60, 75, 85` | OK |
| Contacts | `contacts-page.tsx:222, 242, 263` | OK |
| Accueil (écriture `city`) | `use-dashboard.ts:222-233` | **silencieux par arbitrage** — voir Constats |

Les `catch {` muets trouvés sont, à l'ouverture, des lectures/écritures de `localStorage` (onglet de dossier, vue calendrier) ou des replis documentés (« stockage indisponible : la vue reste en mémoire »), jamais l'avalement d'une écriture utilisateur. Les `catch(() => undefined)` sont des compensations/nettoyages (`removeHouseholdFile`, annulation de dépôt) qui suivent le motif de la phase 19 (échec de retrait signalé, jamais un rejet après une suppression effective). `catch (() => [])` ne rend **aucune** occurrence ; les replis `data.list(...).catch(() => [])` repérés sont des lectures d'appui à une écriture (cascades) dont l'écriture principale remonte toujours son erreur.

## Chaîne §2.7 — chaque commande prescrite, nommée avec son sort

| Commande (§2.7) | Sort |
|---|---|
| `cd app && npm run typecheck && npm test && npm run build` | **JOUÉE, VERTE** — typecheck OK ; `npm test` **1288 passés / 1288, 153 fichiers, 0 échec** ; `vue build` OK (`✓ built in 993ms`) |
| `cd app && npm run test:e2e` | **JOUÉE** — 1er passage : **122 passés / 5 sautés / 1 échec** ; 2e passage : **123 passés / 5 sautés / 0 échec** (détail du 1er échec ci-dessous) |
| `python3 scripts/check-sql-statique.py` | **SANS OBJET** (cette tâche n'écrit aucun SQL) — jouée **par surcroît** pour que l'absence soit mesurée et non affirmée : **vert, « 181 fonction(s) effective(s) sur 128 migration(s) et 67 test(s), aucun défaut »** |
| `sh scripts/test-db.sh` | **SANS OBJET** (aucun SQL, aucune fonction, aucun secret touchés) — voir « Chaîne non jouée » |
| `sh scripts/test-dispatch-push.sh` | **SANS OBJET** (idem — ne porte que sur les migrations, les fonctions SQL et Vault) — voir « Chaîne non jouée » |

Preuve du « sans objet », vérifiée et non affirmée : `git diff --name-only 0b7a8c6..HEAD` rend **10 fichiers, tous sous `app/src/`** ; le filtre `^supabase/|^scripts/|\.sql$` ne rend **rien**. Aucune migration, aucune fonction SQL, aucun secret n'a été touché.

### Le 1er passage e2e, expliqué (et non passé sous silence)

- **Échec** : `[mobile] e2e/recettes.spec.ts:186 › enfant : toggle visible et cases cochables, rien d'autre`, assertion `:207` `getByText('1/2')` — timeout 8 s.
- **Mise au point** : re-exécution ciblée de `e2e/recettes.spec.ts` → **20/20 verts** (les deux projets) ; re-exécution **complète** → **123 passés / 5 sautés / 0 échec**.
- **Verdict** : aléa (flake) sous charge parallèle, sur une spec que cette tâche ne touche pas (aucun fichier `recettes/` modifié). La classe de course de `recettes.spec.ts` est connue (traitée en 21-05). Il n'est pas présenté comme « vert du premier coup ».

## Chaîne non jouée

- **`sh scripts/test-db.sh`** — **non tentée**. Raison : c'est un passage **obligatoire** seulement quand un changement SQL/fonction/Vault est livré (§2.7 : « `test-db.sh` devient un passage obligatoire avant de considérer un changement SQL comme validé ») ; ici **aucun** SQL, aucune fonction, aucun secret n'est touché (diff vérifié ci-dessus). La sortie associée est donc l'absence de changement à mettre à l'épreuve, pas un résultat de test.
- **`sh scripts/test-dispatch-push.sh`** — **non tentée**, même raison (ne porte que sur les migrations, Vault et la Edge Function de dispatch push), et exigerait en outre un abonnement push **réel** pour que le chiffre soit une preuve.

Aucune autre commande prescrite n'a été omise : `typecheck`, `npm test`, `build` et `test:e2e` ont **toutes** été jouées.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Le garde Test E se dénonçait lui-même**

- **Found during:** Task 1, étape 6 (exécution rouge)
- **Issue:** le préambule de `query-policy.test.ts` citait l'aiguille sous sa forme **littérale**, donc `collectSourceFiles` trouvait `lib/query-policy.test.ts` et le Test E échouait… sur le fichier du garde lui-même (`expected [ 'lib/query-policy.test.ts' ] to deeply equal []`). C'est exactement le piège que `no-eslint-directive.test.ts` documente (le garde ne doit pas se dénoncer).
- **Fix:** le commentaire a été reformulé pour ne plus porter la forme littérale ; l'aiguille reste construite par `join` (`['new QueryClient', '('].join('')`), et un **auto-contrôle** a été ajouté : le seul fichier autorisé (`query-policy.ts`) doit **matcher** l'aiguille, sinon le garde ne peut rien voir.
- **Files modified:** `app/src/lib/query-policy.test.ts`
- **Verification:** à la 2e exécution rouge, Test E **vert** ; l'auto-contrôle prouve que l'aiguille reconnaît du code réel.
- **Committed in:** `f3ee6fc` (Task 1)

---

**Total deviations:** 1 auto-corrigée (Rule 1 — bug dans le garde que je venais d'écrire, jamais un écart au plan).
**Impact on plan:** aucun. Le plan exécuté tel qu'écrit ; la déviation est interne à un fichier créé par cette tâche.

## Issues Encountered

- Le 1er passage e2e a échoué une fois (flake `recettes.spec.ts:207`, mobile) ; mis au point et rejoué vert (détail ci-dessus). Ce n'est pas une régression : aucun fichier `recettes/` n'est touché.

## User Setup Required

None — aucune configuration de service externe.

## Next Phase Readiness

- Le défaut est corrigé **sur la classe** : toute page lisant via `useResource` (ou tout client dérivant de `query-policy`) hérite de la politique ; le garde E empêche un onzième client de naître à la main.
- **Reste à démontrer par l'usage** (couverture D5, `human_judgment: true`) : sur l'app **déployée**, `F12` → Réseau → « Hors ligne » → Courses doit afficher « Réessayer » (et le bandeau hors ligne), plus l'état vide mensonger. C'est le parcours d'origine du constat #15, que seul un humain peut rejouer.
- Aucun blocker.

---

*Quick task: 261019-dw6*
*Completed: 2026-10-19*

## Self-Check: PASSED

- Les 6 fichiers créés et les 4 fichiers modifiés existent sur disque.
- Les 3 commits de tâche existent : `f3ee6fc`, `e07c6fd`, `f1d5191` (mesuré : `git rev-list --count 0b7a8c6..HEAD` = 3).
- Arbre de travail propre après le dernier commit (aucun fichier non suivi laissé derrière).
