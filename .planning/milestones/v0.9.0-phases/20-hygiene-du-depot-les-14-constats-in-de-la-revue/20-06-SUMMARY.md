---
phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
plan: 06
subsystem: data-cache
tags: [react-query, cache-key, useResource, app-shell, anniversaires, d-08, d-11, d-13, in-08, in-11, in-13]

# Dependency graph
requires:
  - phase: 20-hygiene-du-depot-les-14-constats-in-de-la-revue
    provides: D-08/D-11/D-13 (décisions verrouillées) ; `useResource`/`queryKeys` et le shell déjà en place
provides:
  - "`queryKeys.table` porte un 4e élément `selectKey` ; `UseResourceOptions` est une union discriminée (`select` ⇒ `selectKey` requis)"
  - "la clé d'assignés du shell vit sous `queryKeys.tableAll('task_assignees')`, atteinte par les invalidations d'assignation"
  - "la règle du nom persisté énoncée une seule fois dans `use-auth.ts`"
  - "le point de calendrier d'un anniversaire d'origine contact mène à `/contacts`, sans édition"
affects: [verify-work, secure-phase]

# Actuals (#2632) — chars/4 sur le diff réalisé
actuals:
  tokens: 3422
  tasks: 3
  commits: 3
  plan_head_before: d9007f3
  plan_head_after: 44a99ad

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "La clé de cache contient tout ce qui change le résultat, sous une forme STABLE : un `selectKey` déclaré par l'appelant, jamais la fonction `select` (une flèche en ligne bouclerait le rechargement)"
    - "Le type porte la règle : une union discriminée rend l'oubli de `selectKey` impossible à compiler, pas seulement à relire"
    - "Une clé de requête vit sous le préfixe que les invalidations touchent réellement — un préfixe maison échappe silencieusement à tout rafraîchissement"

key-files:
  created:
    - app/src/lib/data/useResource.test.ts
  modified:
    - app/src/lib/data/useResource.ts
    - app/src/app/app-shell.tsx
    - app/src/app/app-shell.test.tsx
    - app/src/hooks/use-auth.ts
    - app/src/modules/anniversaires/anniversaires-page.tsx
    - app/src/modules/anniversaires/anniversaires-page.test.tsx

key-decisions:
  - "`selectKey` est une chaîne STABLE déclarée par l'appelant, jamais la fonction `select` : l'introduire dans la clé provoquerait une boucle de rechargement (D-08)"
  - "L'union discriminée porte l'obligation sur le compilateur : une ligne `@ts-expect-error` la prouve, et `tsc` échouerait si le type relâchait l'exigence"
  - "Le constat IN-11 de la revue est inexact : aucune ligne de commentaire n'est répétée dans `use-auth.ts` ; c'est la MÊME RÈGLE énoncée deux fois, consolidée en une seule (D-11)"

patterns-established:
  - "Preuve d'une clé de cache par deux sélecteurs sous le même QueryClient : deux entrées distinctes et des lignes différentes prouvent que la clé — et non le hasard — sépare les requêtes"

requirements-completed: [IN-08, IN-11, IN-13]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "La clé de `useResource` porte un `selectKey` stable ; deux `select` sur la même table/filtre ne partagent plus d'entrée (D-08a)"
    requirement: "IN-08"
    verification:
      - kind: unit
        ref: "app/src/lib/data/useResource.test.ts#ne fait pas partager une entrée de cache à deux `select` différents"
        status: pass
      - kind: other
        ref: "app/src/lib/data/useResource.test.ts#refuse `select` sans `selectKey` — l’union discriminée le porte (vérifiée par `npm run typecheck` via `@ts-expect-error`)"
        status: pass
    human_judgment: false
  - id: D2
    description: "La clé d'assignés du shell vit sous le préfixe que les invalidations touchent ; une réassignation retire le badge (D-08b)"
    requirement: "IN-08"
    verification:
      - kind: unit
        ref: "app/src/app/app-shell.test.tsx#retire le badge quand la tâche est réassignée (D-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "La règle du nom persisté est énoncée une seule fois dans `use-auth.ts`, l'autre site nomme `applySession` (D-11)"
    requirement: "IN-11"
    verification:
      - kind: other
        ref: "lecture de app/src/hooks/use-auth.ts (une énonciation complète dans `applySession`, renvoi nommé dans le bootstrap)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Le point de calendrier d'un anniversaire d'origine contact est un lien vers `/contacts` qui n'ouvre aucun dialogue (D-13)"
    requirement: "IN-13"
    verification:
      - kind: unit
        ref: "app/src/modules/anniversaires/anniversaires-page.test.tsx#mène à la fiche pour un anniversaire d’origine contact, sans ouvrir d’édition (D-13)"
        status: pass
      - kind: unit
        ref: "app/src/modules/anniversaires/anniversaires-page.test.tsx#garde le point d’un anniversaire d’origine anniversaire comme bouton d’édition (D-13, pendant)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-16
status: complete
---

# Phase 20 Plan 06: la clé de cache contient tout ce qui change le résultat Summary

**La clé de cache de `useResource` porte désormais un `selectKey` stable que le type exige, la clé d'assignés du shell vit sous le préfixe que les invalidations touchent, la règle du nom persisté est énoncée une fois, et le point de calendrier d'un anniversaire d'origine contact mène à sa fiche au lieu d'ouvrir une édition sans effet.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 / 3
- **Files modified:** 7 (1 créé, 6 modifiés)
- **Tests:** 142 fichiers / 1192 tests verts (`npm test`) ; `typecheck` vert ; `check-sql-statique.py` vert (« aucun défaut »)

## Accomplishments

- **D-08a** — `queryKeys.table` prend un 4e paramètre `selectKey` (défaut `null`) ; `UseResourceOptions` devient une union discriminée : `select` sans `selectKey` ne compile pas. `useResource` passe `selectKey` à sa clé, `useLinkedRows` reste sur le `null` par défaut (même forme de clé). Le seul site de production avec `select` (`app-shell.tsx`) déclare `selectKey: 'tasks-open'`.
- **D-08b** — la clé d'assignés du shell passe de `['app-shell', 'task-assignees', openTaskIds]` à `[...queryKeys.tableAll('task_assignees'), openTaskIds]`, identique à celle de `use-notifications.ts` pour la même table et le même `queryFn`. Une réassignation suivie d'un refetch par préfixe de table fait disparaître le badge.
- **D-11** — la règle du nom persisté est ramenée à UNE énonciation dans `applySession` ; le commentaire du bootstrap nomme `applySession` au lieu de la répéter. Correctif de documentation, sans effet d'exécution.
- **D-13** — le point de calendrier d'un anniversaire d'origine contact (`contact-<uuid>`) rend un `<Link to="/contacts">` avec le même libellé et la même icône que la liste ; il n'appelle plus `onOpen`. Le point d'origine anniversaire reste un bouton d'édition.

## Correction du constat IN-11 (le constat de la revue est inexact)

La revue annonçait une duplication « mot pour mot ». **Ce n'est pas le cas** : aucune ligne de commentaire n'est répétée dans `use-auth.ts` (ni maintenant, ni avant `f79d553`). Ce qui subsiste est la **même règle** — « un nom vide persisté se répare, on ne redemande pas la saisie » — **énoncée deux fois**. Le constat est donc **corrigé ici, pas recopié** : la consolidation ramène l'énonciation à un seul site (`applySession`) et le bootstrap y renvoie en le nommant.

## Task Commits

Chaque tâche a été commitée atomiquement sur `main` :

1. **Task 1 : la clé de cache contient le `selectKey`, le type l'exige** — `b278505` (fix)
2. **Task 2 : le badge de tâches ouvertes est atteint par les invalidations d'assignation** — `0547183` (fix)
3. **Task 3 : la règle énoncée une fois, et le point contact qui mène à sa fiche** — `44a99ad` (fix)

**Plan metadata :** aucun (`.planning/` gitignoré, `commit_docs: false`).

## Signatures finales

`queryKeys` (`app/src/lib/data/useResource.ts:7-15`) :

```ts
export const queryKeys = {
  table: (table: string, householdId: string | null, filter?: RowFilter, selectKey?: string) =>
    [table, householdId, filter ?? {}, selectKey ?? null] as const,
  tableAll: (table: string) => ['all', table] as const,
};
```

`UseResourceOptions` (`app/src/lib/data/useResource.ts`) :

```ts
interface ResourceOptionsBase {
  filter?: RowFilter;
  enabled?: boolean;
  optimistic?: boolean;
  scoped?: boolean;
  refetchInterval?: number | false;
}

export type UseResourceOptions =
  | (ResourceOptionsBase & { select?: undefined; selectKey?: never })
  | (ResourceOptionsBase & { select: (rows: Row[]) => Row[]; selectKey: string });
```

Clé finale du shell (`app/src/app/app-shell.tsx:75`) :

```ts
    queryKey: [...queryKeys.tableAll('task_assignees'), openTaskIds],
```

## Textes finaux des deux commentaires de `use-auth.ts` (D-11)

`applySession` (`use-auth.ts:56-60`) — l'énonciation qui fait foi :

```
    // Le nom de référence vit dans `profiles` (chemin complet ci-dessous) :
    // un renouvellement de jeton n'apporte que les métadonnées Auth et
    // écraserait le nom du profil par l'email. On garde le nom déjà connu.
    // Règle (énoncée ici, une seule fois dans ce fichier) : un nom vide
    // persisté se répare, on ne redemande pas la saisie.
```

Bootstrap (`use-auth.ts:129-131`) — ce qu'il a d'unique + renvoi nommé :

```
        // Le miroir local du profil est la ligne membre : c'est de là que se
        // lit le nom à réparer. La règle qui commande cette réparation est
        // énoncée une seule fois, dans `applySession` (cf. ci-dessus).
```

## Preuves rouge → vert

### D-08a — deux `select` sur la même table/filtre (`useResource.test.ts`)

- **Rouge** (`selectKey` retiré de la clé : `queryKeys.table(table, householdId, effectiveFilter)`) :
  `FAIL … ne fait pas partager une entrée de cache à deux `select` différents`
  `AssertionError: expected [ { id: 'task-foyer', …(3) } ] to have a length of 2 but got 1`
  → `1 failed | 1 passed` — le second sélecteur recevait la réponse du premier.
- **Vert** (correctif restauré) : `2 passed`.

### D-08b — le badge après réassignation (`app-shell.test.tsx`)

- **Rouge** (clé maison remise : `['app-shell', 'task-assignees', openTaskIds]`) :
  `FAIL … retire le badge quand la tâche est réassignée (D-08)`
  `expect(within(nav).queryByLabelText('1 tâches ouvertes')).not.toBeInTheDocument()` expire — le refetch par préfixe ne touchait plus la requête du shell, le badge restait affiché.
  → `1 failed | 18 passed`.
- **Vert** (correctif restauré) : `19 passed`.

### D-13 — le point contact (`anniversaires-page.test.tsx`), deux observables prouvées rouges

- **Rouge 1** (le point contact redevient un bouton d'édition — `onOpen`) :
  `FAIL … mène à la fiche pour un anniversaire d’origine contact, sans ouvrir d’édition (D-13)`
  `AssertionError: expected null not to be null` (le lien vers `/contacts` n'existe plus).
  → `1 failed | 4 passed`.
- **Rouge 2** (le `<Link>` est conservé mais appelle aussi `onOpen`) :
  `expect(screen.queryByRole('dialog')).not.toBeInTheDocument()` échoue — le clic ouvrait bien un dialogue d'édition.
  → `1 failed | 4 passed`.
- **Vert** (correctif restauré) : `5 passed`.

### D-11 — hors du régime rouge → vert, par nature

Le correctif de D-11 est **purement documentaire** (deux blocs de commentaires). Il n'a **aucun effet d'exécution**, donc **aucune preuve rouge n'est possible** : il n'y a pas d'observable à faire échouer. Le dire ainsi plutôt que de présenter un vert comme une preuve — c'est ce que le plan exigeait. Le seul contrôle est la lecture : `applySession` porte l'énonciation, le bootstrap la nomme.

## Confirmation : le test de bascule des anniversaires passe sans modification

Le test existant `bascule entre la vue liste et la vue calendrier` (qui clique le point de Maya Martin et attend le dialogue d'édition) n'a **pas été touché** — il fait partie des 5 cas verts de `anniversaires-page.test.tsx`. La bifurcation ne casse pas le pendant d'origine anniversaire.

## Files Created/Modified

- `app/src/lib/data/useResource.ts` — `queryKeys.table` à 4 paramètres ; `UseResourceOptions` en union discriminée ; `selectKey` destructuré et passé à la clé.
- `app/src/lib/data/useResource.test.ts` — **créé** : mock `@/lib/data` (import dynamique après le mock, comme `use-auth.test.ts`) ; deux sélecteurs sous le même QueryClient rendent 1 et 2 lignes et occupent deux entrées de cache ; `@ts-expect-error` sur `select` sans `selectKey`.
- `app/src/app/app-shell.tsx` — `selectKey: 'tasks-open'` sur le seul site de production avec `select` ; clé d'assignés ramenée sous `queryKeys.tableAll('task_assignees')`.
- `app/src/app/app-shell.test.tsx` — +1 cas dans le `describe` du badge : réassignation réelle + refetch par préfixe ⇒ le badge disparaît.
- `app/src/hooks/use-auth.ts` — commentaires : une énonciation (`applySession`), un renvoi nommé (bootstrap). Aucun changement d'exécution.
- `app/src/modules/anniversaires/anniversaires-page.tsx` — bifurcation du point de calendrier sur `origin` ; `byDay` et les props de `BirthdayCalendarView` passent à `AggregatedBirthday[]`.
- `app/src/modules/anniversaires/anniversaires-page.test.tsx` — +2 cas : le lien contact (destination + aucun dialogue) et le pendant (bouton d'édition).

## Decisions Made

- **`selectKey` stable, jamais la fonction** : c'est la distinction que la revue signale et que le type rend désormais impossible à rater (D-08).
- **`byDay`/props en `AggregatedBirthday[]`** : la provenance (`origin`) est nécessaire pour bifurquer ; le typecheck l'a exigé (`Property 'origin' does not exist on type 'Birthday'`), c'est donc le type qui a guidé la correction, pas un choix esthétique.
- **Deux rouges pour D-13** : l'un prouve l'affordance (le lien existe), l'autre prouve l'effet (le clic n'ouvre aucun dialogue). Les deux observables du critère d'acceptation sont couvertes.

## Deviations from Plan

**1. [Rule 3 - Blocking] Le test `useResource.test.ts` ne pouvait pas être un `.tsx` (JSX) — la preuve passe par `createElement`**
- **Found during:** Task 1 (création du fichier de test)
- **Issue:** le plan nomme le fichier `useResource.test.ts` (extension `.ts`), mais le wrapper `QueryClientProvider` s'écrivait naturellement en JSX — or `oxc` refuse le JSX dans un `.ts` (`Expected '>' but found 'Identifier'`).
- **Fix:** le wrapper est construit avec `createElement(QueryClientProvider, { client }, children)`, ce qui préserve le nom de fichier `.test.ts` du plan sans introduire de JSX.
- **Files modified:** `app/src/lib/data/useResource.test.ts`
- **Verification:** test vert (2/2) ; typecheck vert.
- **Committed in:** `b278505` (Task 1).

**2. [Rule 1 - Bug] Le mock hissé référençait `listMock` avant initialisation — import dynamique après le mock**
- **Found during:** Task 1 (première exécution du test)
- **Issue:** `vi.mock` étant hissé, la factory s'exécutait pendant l'import statique de `useResource` (`ReferenceError: Cannot access 'listMock' before initialization`).
- **Fix:** `useResource` est importé dynamiquement **après** le `vi.mock` (le motif de `use-auth.test.ts`), le type restant en import statique (effacé).
- **Files modified:** `app/src/lib/data/useResource.test.ts`
- **Verification:** test vert ; typecheck vert.
- **Committed in:** `b278505` (Task 1).

**3. [Rule 1 - Bug] `byDay` restait typé `Birthday[]` après le passage des props à `AggregatedBirthday[]`**
- **Found during:** Task 3 (`npm run typecheck` après les modifications de la page)
- **Issue:** `Record<string, Birthday[]>` faisait perdre `origin` à `dayBirthdays`, donc `birthday.origin` était une erreur de type (`Property 'origin' does not exist on type 'Birthday'`).
- **Fix:** `Record<string, AggregatedBirthday[]>` — la provenance remonte jusqu'au point du calendrier.
- **Files modified:** `app/src/modules/anniversaires/anniversaires-page.tsx`
- **Verification:** typecheck vert ; suite complète verte.
- **Committed in:** `44a99ad` (Task 3).

Aucune autre déviation. Aucun paquet ajouté (T-20-SC intact), aucun linter introduit (le garde `no-eslint-directive.test.ts` reste vert), aucun SQL touché.

---

**Total deviations:** 3 auto-fixées (1 blocking, 2 bugs)
**Impact on plan:** corrections de mise en œuvre du harnais de test et du typage, sans débordement de périmètre ni changement de comportement non prévu.

## Issues Encountered

Le couplage annoncé avec le plan 20-05 (même fichier `use-auth.ts`, hunks disjoints) a été respecté : ce plan n'a touché que les **deux commentaires** de la règle du nom persisté (`applySession`, bootstrap) — ni les branches « pas de session », ni le sélecteur mort, ni les dépendances de l'effet, tous possédés par 20-05. Aucun conflit.

## Threat Flags

Aucun : pas de nouvelle surface réseau, auth, accès fichier ou schéma. Le plan **réduit** la surface : T-20-16 (clé sans `selectKey`), T-20-17 (clé hors convention) et T-20-18 (édition sous id synthétique) sont mitigés par les trois correctifs et leurs preuves.

## Known Stubs

Aucun.

## User Setup Required

None - aucune configuration de service externe requise.

## Self-Check: PASSED

- `app/src/lib/data/useResource.ts` : FOUND
- `app/src/lib/data/useResource.test.ts` : FOUND
- `app/src/app/app-shell.tsx` : FOUND
- `app/src/app/app-shell.test.tsx` : FOUND
- `app/src/hooks/use-auth.ts` : FOUND
- `app/src/modules/anniversaires/anniversaires-page.tsx` : FOUND
- `app/src/modules/anniversaires/anniversaires-page.test.tsx` : FOUND
- Commit `b278505` : FOUND
- Commit `0547183` : FOUND
- Commit `44a99ad` : FOUND

## Next Phase Readiness

- IN-08 (les deux volets), IN-11 et IN-13 sont fermés ; la chaîne `typecheck`/`test` est verte et `check-sql-statique.py` ne signale aucun défaut.
- Le volet D-08 est en place pour tout futur appelant de `useResource` : un `select` sans `selectKey` ne compile pas.
