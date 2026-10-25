---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: "04"
subsystem: frontend-auth-bootstrap
tags: [wr-04, in-11, amorcage, auth, ecran-de-chargement, reprise, information-disclosure, vitest, jsdom]
status: complete

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-01 (c2e655e, 34cd0de), 18-02 (6727e73, 5de0b17, 556a212), 18-03 (e7c5aea, 9d093e4, 80a4351) : plans précédents de la phase"
provides:
  - "Contrat d'amorçage `AuthBootstrap { ready, error, retry }` rendu par `useAuthBootstrap` : `ready` reste vrai sur TOUTES les branches, échec compris"
  - "Branche d'échec unique (`fail`) posée par `.catch` sur la chaîne `getSession` ET par un `try/catch` autour d'`applySession` — le garde `active` est respecté dans les deux"
  - "Reprise par compteur de tentative dans les dépendances de l'effet (aucune seconde copie de l'amorçage à faire diverger)"
  - "`Root` (`app/src/main.tsx`) rend trois états : chargement, erreur générique + bouton « Réessayer », application ; le message d'erreur n'est jamais rendu (T-18-11)"
  - "`app/src/main.test.tsx` : premier test de l'écran d'amorçage (racine de l'application), trois états verrouillés"
affects: [main, hooks-auth, revue-de-code-wr-04, revue-de-code-in-11]

actuals:
  tokens: 3592
  tasks: 2
  commits: 2
plan_head_before: 80a43514dcd33e2b844462bec839632515288bdc
plan_head_after: a184489c5297ba5cc79d181f88d66b4d8537bd3e

tech-stack:
  added: []
  patterns:
    - "Reprise d'un effet par compteur d'état dans ses dépendances, plutôt que par duplication de la logique d'amorçage dans une seconde fonction"
    - "Un seul chemin d'échec (`fail`) appelé par les deux portes (rejet de `getSession`, rejet d'`applySession`), pour que le résultat visible ne dépende pas de l'origine de l'erreur"
    - "Objet d'erreur conservé dans l'état React pour l'observabilité, message fixe dans le DOM : la frontière de fuite est le rendu, pas l'état"
    - "Vue racine testable : `Root` exporté de `main.tsx`, hook et routeur moqués, conteneur `#root` créé avant import du module à effet de bord"

key-files:
  created:
    - app/src/main.test.tsx
  modified:
    - app/src/hooks/use-auth.ts
    - app/src/main.tsx
    - app/src/hooks/use-auth.test.ts

key-decisions:
  - "La reprise RELANCE l'effet (compteur `attempt` dans les dépendances) au lieu de rejouer l'amorçage dans une seconde fonction : deux copies divergeraient, et c'est ainsi que la branche d'échec avait disparu de la première"
  - "`ready` retombe à faux au début de chaque tentative, pas seulement `error` : sinon la reprise afficherait le routeur avec le statut laissé par la tentative précédente, et la garde renverrait vers `/connexion` (le défaut que le commentaire de `setReady` raconte)"
  - "`applySession` est enveloppé d'un `try/catch` en plus du `.catch` de la chaîne : un rejet de lecture de profil ou de foyer doit produire le même écran que celui de `getSession`, sans dépendre de la position du rejet dans la chaîne"
  - "Message rendu générique et fixe (« Votre foyer n’a pas pu être chargé. ») ; l'objet d'erreur reste dans l'état React — un message réseau peut transporter l'URL appelée et la clé de la requête (T-18-11)"
  - "Le rendu de `Root` est testé par un fichier dédié (`main.test.tsx`) plutôt que par une assertion tautologique côté hook : le plan désigne ce test comme le lieu de la preuve du message générique"
  - "La migration de la seule lecture du contrat dans `use-auth.test.ts` est faite en tâche 1 et non en tâche 2 : sans elle, le commit de la tâche 1 laissait `npm run typecheck` rouge (AGENTS.md §2.7)"

metrics:
  duration: "16 min"
  completed: "2026-10-15"
  tasks_completed: 2
  files_changed: 4
---

# Phase 18 Plan 04 : un amorçage qui échoue visiblement, et qui se reprend

`useAuthBootstrap` rend un contrat `{ ready, error, retry }`, pose `ready` sur
**toutes** ses branches — échec compris — et `Root` affiche un message générique
avec un bouton de reprise au lieu de « Chargement… » pour toujours (WR-04), sans
jamais rendre le détail de l'erreur (T-18-11).

## Objectif et résultat

Le défaut (WR-04) n'était pas un défaut de style : `getSession().then(async …)`
n'avait **aucun `.catch`**, et `setReady(true)` n'était atteint que sur le chemin
de succès. Un backend indisponible, un réseau instable ou une lecture de foyer
refusée laissaient donc l'application sur « Chargement de votre foyer… »
indéfiniment — sans message, sans reprise, sans expiration (le `retry: 1` du
QueryClient ne s'applique pas à une chaîne de promesses brute).

D-05 demandait un échec **visible et rejouable** ; le plan demandait en plus que
la garantie soit **structurelle** et non accidentelle, et que le commentaire
dupliqué (IN-11) disparaisse. Le mode démo ne peut pas montrer le défaut (aucun
appel réseau) : c'est donc la structure du hook qui porte la garantie, et les
tests qui la verrouillent.

| Tâche | Type | Résultat |
|---|---|---|
| 1 | tracer | Contrat `AuthBootstrap`, branche d'échec unique, reprise par compteur de tentative, `Root` à trois états, commentaire dédupliqué (IN-11) |
| 2 | auto | 3 cas de régression côté hook + `main.test.tsx` : chargement, erreur générique + reprise, application |

## Contrat et branches (état final)

`useAuthBootstrap` rend `{ ready, error, retry }` :

| Chemin | `ready` | `error` | Statut |
|---|---|---|---|
| Démo, session persistée | `true` | `null` | `authenticated` (`setStatus`) |
| Démo, aucune session | `true` | `null` | `guest` |
| `getSession` → aucune session | `true` | `null` | `guest` |
| `getSession` → session, `applySession` réussit | `true` après `applySession` | `null` | `authenticated` |
| `getSession` rejette | `true` (`fail`) | l'objet rejeté | inchangé |
| `applySession` rejette | `true` (`fail`) | l'objet rejeté | selon l'avancement de `signIn` |
| Démontage pendant l'attente | aucun état posé | — | — |

Les deux portes d'échec appellent la **même** fonction `fail`, qui respecte le
garde `active` et n'accepte aucune valeur non-`Error` sans la normaliser.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — typecheck rouge] La migration du contrat dans `use-auth.test.ts` est faite en tâche 1, pas en tâche 2**
- **Found during:** Task 1
- **Issue:** le plan confie la tâche 1 (changement de contrat du hook) et place en
  tâche 2 « adapter au nouveau contrat les tests existants qui lisent la valeur de
  retour » et « les cas déjà présents doivent rester verts **sans
  modification** ». Or `use-auth.test.ts:197-203` lit `const ready =
  useAuthBootstrap()` et l'empile dans `Array<{ready: boolean}>` : avec le nouveau
  contrat, le commit de la tâche 1 aurait laissé `npm run typecheck` en erreur
  (`Type '{ ready: AuthBootstrap }' is not assignable to type '{ ready: boolean }'`)
  — et l'assertion de fond aurait échoué, l'objet étant toujours vrai.
- **Fix:** la **seule** ligne de lecture du contrat (`bootstrap.ready`) est migrée
  dans le commit de la tâche 1 ; les cas préexistants restent sinon inchangés
  (aucun des 14 autres cas n'a bougé — voir ci-dessous). État final identique à
  celui demandé, chaque commit vert (AGENTS.md §2.7).
- **Files modified:** `app/src/hooks/use-auth.test.ts` (en tâche 1)
- **Commit:** `79c3e69`

**2. [Rule 3 — fichier absent du périmètre déclaré] `app/src/main.test.tsx` est ajouté en tâche 2**
- **Found during:** Task 2
- **Issue:** le `files_modified` du plan ne liste que trois fichiers, mais la
  tâche 2 désigne explicitement un « test de `main.tsx` » comme le lieu de la
  preuve du rendu générique (« le rendu générique est vérifié dans le test de
  `main.tsx` de la tâche 2 »), et le registre de menaces `T-18-11` exige une
  « assertion dans le test » pour la non-fuite du détail. Aucun test ne couvrait
  `Root` : sans ce fichier, la garantie n'aurait été vérifiée nulle part, et
  l'écrire côté hook aurait produit l'assertion tautologique que le plan
  interdit.
- **Fix:** `Root` est exporté de `main.tsx` (changement de deux caractères,
  aucun effet à l'exécution), et `app/src/main.test.tsx` verrouille les trois
  états et la non-fuite. `virtual:pwa-register`, `@/hooks/use-auth` et
  `@/app/router` sont moqués ; `document.body` porte `#root` avant l'import, le
  module montant l'application dès son évaluation.
- **Files modified:** `app/src/main.tsx` (export), `app/src/main.test.tsx` (nouveau)
- **Commit:** `a184489`

Aucune autre déviation : les deux tâches ont été exécutées comme écrites, et
aucun cas préexistant de `use-auth.test.ts` n'a eu besoin de bouger au-delà de la
ligne de lecture migrée en tâche 1 (les 14 autres, y compris inscription,
connexion, confirmation d'adresse, nom de profil, renouvellement de jeton,
SIGNED_OUT, comptes liés, restent verts sans modification ; les deux cas de
bootstrap préexistants — « établit la session quand l'événement d'état apporte
une session » et « n'affiche jamais l'application avant que la session restaurée
soit posée » — n'ont reçu que la relecture de `bootstrap.ready`, le second
gardant son assertion de fond : aucun rendu `ready` sans `status ===
'authenticated'`).

## Preuve que les tests peuvent échouer

AGENTS.md §B/§D : une assertion se prouve sur un cas qui doit échouer. Trois
mesures ont été faites, chacune suivie d'une restauration vérifiée par
`git status` (index propre, aucun fichier du dépôt laissé en arrière) :

| Mesure | Résultat |
|---|---|
| Ancien hook et ancien `main.tsx` (`79c3e69~1`) + nouveaux tests | **7 échecs / 22** : les 3 cas neufs de `use-auth.test.ts`, le cas préexistant de non-régression, et les 3 cas de `main.test.tsx` (dont 1 seul du fait de `Root` non exporté) |
| `main.tsx` muté pour rendre `{error.message}` + `main.test.tsx` | **1 échec / 3** — l'assertion anti-fuite attrape bien le message rendu |
| `data.list('household_members')` rejetant au 1er essai, harnais jetable | a révélé un angle mort hors périmètre, consigné en `deferred-items.md` §4 |

Le troisième point mérite d'être dit : la reprise **rétablit la session mais pas
le foyer** quand l'échec vient de `loadHousehold` (`signIn` pose
`status = 'authenticated'` avant d'attendre le foyer, donc la seconde tentative
sort par la branche « session déjà établie »). Mesuré : `status =
authenticated`, `householdId = null`, 0 appel à `household_members` après
reprise. C'est une correction **distincte** de D-05 (l'échec est bien visible et
rejouable, ce que le plan demandait) : elle touche `signIn`/`applySession` et
reste hors périmètre de 18-04, documentée avec sa mesure.

## Décisions prises

- **`ready` retombe au début de chaque tentative.** Le plan ne demandait que la
  réinitialisation de l'erreur. Sans la remise à faux de `ready`, la reprise
  aurait rendu `AppRouter` avec le statut laissé par la tentative précédente —
  exactement le défaut que le commentaire de `setReady` raconte (garde →
  `/connexion` pour un utilisateur connecté). La remise est sans effet sur le
  premier montage (`ready` valant déjà faux, React ne rend rien).
- **Deux portes, un seul chemin d'échec.** `.catch(fail)` couvre le rejet de
  `getSession` ; le `try/catch` autour d'`applySession` couvre la lecture de
  profil et le chargement du foyer. Le plan demandait les deux : le résultat
  visible ne dépend donc pas de l'endroit du rejet.
- **Normalisation du rejet.** `fail` accepte `unknown` et ne conserve l'objet
  que s'il est une `Error`, sinon en fabrique une générique — aucun `undefined`
  ne peut faire retomber `error` à une valeur fausse au rendu.
- **`retry` passe par l'état, pas par une fonction.** Un compteur `attempt` dans
  les dépendances de l'effet : une seule copie de l'amorçage, une seule branche
  d'échec, un seul endroit à corriger si le contrat évolue.
- **Le message générique vit dans le DOM, l'objet vit dans l'état.** Le test
  vérifie les deux : le texte fixe est rendu, et ni le message d'origine, ni
  l'URL, ni la clé de la requête n'apparaissent dans le conteneur.

## Vérification

| Contrôle | Résultat |
|---|---|
| `npm run typecheck && npm test -- src/hooks/use-auth.test.ts` (tâche 1) | 16 passés, typecheck vert |
| `npm test -- src/hooks/use-auth.test.ts src/main.test.tsx` (tâche 2) | **22 passés** (19 + 3) |
| `npm run typecheck` | vert |
| `npm test` (suite complète) | **120 fichiers, 964 tests, tous verts** |
| `npm run build` | vert (`tsc --noEmit` + Vite + PWA `injectManifest`, 103 entrées précachées) |
| `python3 scripts/check-sql-statique.py` | 180 fonctions effectives, **aucun défaut** |
| `npm run test:e2e` | 117 passés, 5 ignorés, **4 échecs préexistants** (2 specs × 2 projets, cf. `deferred-items.md` §2) |

Le plan ne modifie **aucune** migration ni fonction SQL : `migrate.sh` /
`test-db.sh` n'ont pas de prise sur lui (le contrôle statique tourne, lui, sur
tout le dépôt). Les 4 échecs e2e sont ceux relevés en 18-01 — `critical-paths`
(exigence « Continuer avec Facebook », chaîne retirée le 2026-10-13) et
`voyage-workspace` (exigence d'une `checkbox` là où l'affordance est un
`switch`) — aucun parcours d'amorçage n'y figure, aucun échec nouveau, aucun
spec modifié.

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucun libellé d'attente, aucun composant
sans source de données : l'état d'erreur est un état réel du hook, pas un
placeholder.

## Threat Flags

Aucun nouveau. Le changement **referme** les deux menaces du plan (T-18-10
déni de service : plus aucun chemin ne laisse l'interface bloquée ; T-18-11
divulgation : le message rendu est fixe, l'objet d'erreur n'atteint pas le DOM),
et n'ouvre ni route, ni accès fichier, ni frontière de confiance. Aucun paquet
ajouté (T-18-SC non déclenché).

## Self-Check: PASSED

- `app/src/main.test.tsx` — FOUND
- `app/src/hooks/use-auth.ts`, `app/src/main.tsx`, `app/src/hooks/use-auth.test.ts` — FOUND
- `79c3e69` (tâche 1) — FOUND
- `a184489` (tâche 2) — FOUND
