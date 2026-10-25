---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 01
subsystem: testing
tags: [lint, react-hooks, exhaustive-deps, guard-test, agents-md, hygiene]

requires: []
provides:
  - "AGENTS.md §2.7 — la règle écrite : aucun linter n'est configuré, une directive de linter est proscrite"
  - "app/src/lib/no-eslint-directive.test.ts — garde de classe contre la réintroduction"
  - "15 sites de dépendances d'effet documentés par leur motif réel (13 fichiers sources)"
affects: [20-02, 20-03, 20-04, 20-05, 20-06, 20-07]

actuals:
  tokens: 4852
  tasks: 3
  commits: 3
  plan_head_before: 79e0fbd33d3c6fbbb7fbb7db259be8eb625ca6e1
  plan_head_after: ee77b4c4a3fd812e2fbb7e67a52fe49880e8d39d

tech-stack:
  added: []
  patterns:
    - "Garde de classe textuel : parcours récursif de app/src, aiguille construite par join pour ne pas se dénoncer, comptage des fichiers parcourus, échec bruyant si le parcours est vide"

key-files:
  created:
    - app/src/lib/no-eslint-directive.test.ts
  modified:
    - AGENTS.md
    - app/src/components/shared/mobile-drawer.tsx
    - app/src/modules/anniversaires/components/birthday-form-dialog.tsx
    - app/src/modules/ardoise/components/expense-form-dialog.tsx
    - app/src/modules/calendrier/components/event-form-dialog.tsx
    - app/src/modules/contacts/components/contact-form-dialog.tsx
    - app/src/modules/notes/components/note-form-dialog.tsx
    - app/src/modules/recettes/components/recipe-form-dialog.tsx
    - app/src/modules/routines/components/routine-form-dialog.tsx
    - app/src/modules/courses/components/product-catalog.tsx
    - app/src/modules/courses/components/product-sheet.tsx
    - app/src/modules/recettes/hooks/use-cuisine-progress.ts
    - app/src/modules/taches/components/task-form-dialog.tsx
    - app/src/modules/taches/taches-page.tsx

key-decisions:
  - "D-01 : la directive est retirée, pas la règle configurée — aucun linter n'est installé, la phase n'en installe pas, la chaîne prescrite (typecheck && test && build) ne change pas"
  - "Le garde couvre app/src ENTIER, fichiers de test compris : la porte de D-01 (grep -rn sur app/src) les couvre, un garde plus laxiste que la règle qu'il sert serait faux"
  - "L'aiguille du garde est construite par join(['eslint','disable']) : le fichier ne contient nulle part la suite littérale, sinon il se dénoncerait lui-même"
  - "product-catalog.tsx : la directive y était inerte (aucune dépendance réellement omise) — le commentaire le dit honnêtement plutôt que d'inventer une omission"
  - "Le garde est vu ROUGE sur un cas réel (directive réinjectée dans taches-page.tsx) avant d'être vu vert (AGENTS.md §2.7 B)"

patterns-established:
  - "Un commentaire qui explique une omission de dépendance nomme l'objet/la fonction recréé à chaque rendu et la partie stable qui le remplace (id, clé d'ids), jamais « dépendances volontairement omises »"

requirements-completed: [IN-01]

coverage:
  - id: D1
    description: "Les 15 directives de linter inertes retirées de app/src, chacune remplacée par un commentaire qui nomme le motif réel de l'omission de dépendance (13 fichiers, 15 sites)"
    requirement: IN-01
    verification:
      - kind: unit
        ref: "app/src/lib/no-eslint-directive.test.ts#aucun fichier ne porte de directive de linter"
        status: pass
      - kind: other
        ref: "cd app && grep -rn \"eslint-disable\" src | wc -l   (attendu 0, obtenu 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "AGENTS.md §2.7 énonce la règle : aucun linter n'est configuré, donc une directive de linter est proscrite"
    requirement: IN-01
    verification:
      - kind: manual_procedural
        ref: "AGENTS.md §2.7, paragraphe inséré après le bloc « La chaîne, dans cet ordre »"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-16
status: complete
---

# Phase 20 Plan 01: Hygiène du dépôt — directives de linter inertes (IN-01)

**Les 15 directives `eslint-disable` inertes retirées de `app/src`, chacune remplacée par le motif réel de l'omission de dépendance, plus une règle écrite dans AGENTS.md §2.7 et un garde de classe prouvé rouge avant d'être vert.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-16T08:10:00+02:00
- **Completed:** 2026-10-16T08:35:18+02:00
- **Tasks:** 3
- **Files modified:** 15 (13 sources + AGENTS.md + le nouveau garde)

## Accomplishments

- **La classe est fermée** : `grep -rn "eslint-disable" app/src` passe de **15** à **0**. La revue en
  comptait 14 ; la vérification du code actuel en avait trouvé 15 (`mobile-drawer.tsx` porte deux
  sites).
- **Chaque site porte son motif** : les 15 sites (dans 13 fichiers) sont remplacés par un commentaire
  qui dit *pourquoi* la dépendance est omise — l'identité d'un objet ou d'un rappel recréé à chaque
  rendu, remplacée par sa partie stable (`birthday?.id`, `initialId`, `event?.id`, `knownKey`…) —
  jamais une formule générique.
- **La règle est écrite** dans `AGENTS.md` §2.7 : aucun linter n'est configuré (ni ESLint, ni Biome,
  ni Prettier), donc une directive de linter est proscrite ; elle ne serait lue par personne.
- **Un garde de classe interdit la réintroduction** (`app/src/lib/no-eslint-directive.test.ts`),
  et il a été **vu rouge** sur un cas réel avant d'être vu vert (§2.7 B).

## Task Commits

Chaque tâche a été committée atomiquement (sur `main`, `commit_docs: false` — le plan et le SUMMARY
ne sont pas committés, `.planning/` est gitignoré) :

1. **Task 1 : la règle écrite, la garde créée, les 5 premières directives** — `7602ba7` (refactor)
2. **Task 2 : les 5 directives suivantes — contacts, notes, recettes, routines** — `e4c2acb` (refactor)
3. **Task 3 : les 5 derniers sites, la garde verte, la preuve rouge** — `ee77b4c` (refactor)

**Plan metadata:** aucun commit (SUMMARY et `.planning/` gitignorés — non committés par conception).

## Le compte global : avant → après

| Mesure | Avant | Après |
|---|---|---|
| `grep -rn "eslint-disable" app/src \| wc -l` | **15** | **0** |

Répartition des 15 sites (par fichier) :

| Fichier | Sites |
|---|---|
| `app/src/components/shared/mobile-drawer.tsx` | 2 |
| `app/src/modules/recettes/components/recipe-form-dialog.tsx` | 2 |
| `app/src/modules/anniversaires/components/birthday-form-dialog.tsx` | 1 |
| `app/src/modules/ardoise/components/expense-form-dialog.tsx` | 1 |
| `app/src/modules/calendrier/components/event-form-dialog.tsx` | 1 |
| `app/src/modules/contacts/components/contact-form-dialog.tsx` | 1 |
| `app/src/modules/notes/components/note-form-dialog.tsx` | 1 |
| `app/src/modules/routines/components/routine-form-dialog.tsx` | 1 |
| `app/src/modules/courses/components/product-catalog.tsx` | 1 |
| `app/src/modules/courses/components/product-sheet.tsx` | 1 |
| `app/src/modules/recettes/hooks/use-cuisine-progress.ts` | 1 |
| `app/src/modules/taches/components/task-form-dialog.tsx` | 1 |
| `app/src/modules/taches/taches-page.tsx` | 1 |
| **Total** | **15** |

## La preuve rouge → verte du garde (§2.7 B)

Preuve prise en tâche 3, sur un cas réel : la directive a été **réinjectée temporairement** au-dessus
du premier `useEffect` de `app/src/modules/taches/taches-page.tsx`, le garde relancé, puis la ligne
**retirée** et le garde relancé.

**Sortie ROUGE** (le garde échoue en **nommant le fichier muté**) :

```
 FAIL  src/lib/no-eslint-directive.test.ts > aucune directive de linter inerte (D-01, IN-01) > aucun fichier ne porte de directive de linter
AssertionError: directive de linter inerte détectée (aucun linter n'est configuré, AGENTS.md §2.7) : modules/taches/taches-page.tsx — la remplacer par un commentaire qui dit la raison de l'omission: expected [ 'modules/taches/taches-page.tsx' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "modules/taches/taches-page.tsx",
+ ]

 ❯ src/lib/no-eslint-directive.test.ts:98:7

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

**Sortie VERTE** (après restauration) :

```
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Le garde est donc **exercé** : il a refusé quelque chose, en nommant le fautif — il n'est pas
« vert sans rien voir ».

## Texte ajouté à `AGENTS.md` §2.7

Inséré après le bloc de code « La chaîne, dans cet ordre » :

> **Aucun linter n'est configuré dans ce dépôt** — ni ESLint, ni Biome, ni Prettier — et la chaîne
> ci-dessus est la seule vérification : elle ne change pas. Une directive de linter est donc
> **proscrite** : elle ne serait lue par personne, et elle escamoterait sous une formule creuse la
> raison d'un choix que le code doit dire en français. Un effet dont on omet volontairement une
> dépendance porte à sa place un commentaire qui **nomme la raison de l'omission** — l'identité d'un
> objet ou d'une fonction recréé à chaque rendu, une valeur dérivée recalculée — jamais « dépendances
> volontairement omises ». `app/src/lib/no-eslint-directive.test.ts` refuse la réintroduction d'une
> directive, et il a été vu rouge avant d'être vu vert (§2.7 B).

## Le garde de classe (`app/src/lib/no-eslint-directive.test.ts`)

Trois tests, calqués sur `media-path-contract.test.ts` avec les deux différences qu'exige D-01 :

- la racine se reconnaît à `lib/data/useResource.ts` (et non `lib/storage.ts`), et le parcours retient
  **tous** les `.ts`/`.tsx`, **fichiers de test compris** — la porte `grep -rn … app/src` les couvre ;
- l'aiguille est construite dynamiquement, `['eslint', 'disable'].join('-')` : le fichier ne contient
  nulle part la suite littérale, donc le garde ne se dénonce pas lui-même (T-20-02) ;
- il **compte ce qu'il parcourt** (échec si moins de 100 fichiers — 356 sont parcourus) et échoue
  bruyamment si la racine est introuvable (« un contrôle qui ne regarde rien est vert et muet ») ;
- l'échec **nomme** chaque fichier fautif (chemin relatif à la racine), pas seulement un compte.

## Files Created/Modified

- `AGENTS.md` — §2.7 : la règle de proscription des directives de linter (+11 lignes)
- `app/src/lib/no-eslint-directive.test.ts` — **créé**, le garde de classe (100 lignes)
- 13 fichiers sources — la directive retirée, remplacée par le motif réel du site (commentaires seuls)

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Le fichier du garde contenait la suite littérale recherchée**

- **Found during:** Task 1 (création du garde)
- **Issue:** la première version du garde citait `eslint-disable` **en toutes lettres** dans son
  en-tête (une fois dans une phrase, une fois en commentant la commande `grep`). Le garde se serait
  donc **dénoncé lui-même** : jamais vert, quels que soient les fichiers sources. C'est exactement le
  piège que le plan décrit (T-20-02) — mais il guettait aussi dans la prose, pas seulement dans
  l'aiguille.
- **Fix:** reformuler l'en-tête pour ne plus écrire la suite littérale (l'aiguille reste
  `['eslint','disable'].join('-')`), puis vérifier par `grep -c` que le fichier ne la contient plus
  (0 occurrence).
- **Files modified:** `app/src/lib/no-eslint-directive.test.ts`
- **Verification:** `grep -c "eslint-disable" src/lib/no-eslint-directive.test.ts` → `0`, puis le
  garde passe au vert en tâche 3.
- **Committed in:** `7602ba7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Sans ce correctif, le garde aurait été vert-blocage permanent (faux positif) —
l'inverse du défaut visé. Aucun changement de périmètre : c'est le garde lui-même, avant tout run.

## Issues Encountered

- `product-catalog.tsx:190` portait une directive **inerte** : aucune dépendance n'y était réellement
  omise (`product` et `reset` sont dans les deps ; `normalizeRayon` est importé ; les setState et la
  ref sont stables). Le commentaire le dit honnêtement au lieu d'inventer une omission — D-01 corrige
  l'information escamotée, il ne demande pas d'en fabriquer une.
- La suite Vitest complète dépasse les 5 min (449 s, 139 fichiers, 1173 tests) : exécutée avec un
  timeout élargi.

## Non-régression (aucun comportement d'exécution changé)

Le diff ne porte que des lignes de commentaire, `AGENTS.md` et le nouveau garde : aucun tableau de
dépendances d'effet n'est modifié. Vérifié par `git diff 79e0fbd..HEAD --stat` (ajouts ≈ retraits par
fichier source) et par filtrage des lignes non-commentaire du diff sur `app/src` (seul `AGENTS.md`
porte de la prose).

## Verification

Chaîne de la phase (§2.7), depuis `app/` sauf mention :

1. `npm run typecheck` → vert
2. `npm test` → **139 fichiers, 1173 tests passés** (0 échec)
3. `npm run build` → vert (71 modules, PWA précache 100 entrées)
4. `grep -rn "eslint-disable" src | wc -l` → **0**
5. `npx vitest run src/lib/no-eslint-directive.test.ts` → vert **après** preuve rouge attribuable
6. `python3 scripts/check-sql-statique.py` → vert (181 fonctions effectives, aucun défaut ; aucun SQL
   touché)
7. `git diff --stat` → commentaires seuls sur les 13 sources

## Next Phase Readiness

- IN-01 est fermé ; les autres constats `IN-*` de la phase 20 (plans 20-02…) restent ouverts.
- Aucun linter n'a été ajouté, conformément à D-01 : la chaîne `typecheck && test && build` reste la
  seule vérification, et le garde couvre désormais la réintroduction d'une directive.

---
*Phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue*
*Completed: 2026-10-16*

## Self-Check: PASSED

- FOUND: `app/src/lib/no-eslint-directive.test.ts`
- FOUND: `7602ba7` (Task 1)
- FOUND: `e4c2acb` (Task 2)
- FOUND: `ee77b4c` (Task 3)
- `grep -rn "eslint-disable" app/src | wc -l` → `0`
- Working tree: aucun fichier de ce plan laissé non committé (seuls les non-suivis préexistants
  `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs` — hors périmètre, IN-02 — demeurent).
