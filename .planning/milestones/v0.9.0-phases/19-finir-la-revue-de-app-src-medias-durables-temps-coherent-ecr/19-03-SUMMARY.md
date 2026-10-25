---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 03
subsystem: ui
tags: [taches, tri, ordre-manuel, priority-order, glisser-deposer, dnd-kit, rappels, wr-13, wr-14, d-11, d-07]

# Dependency graph
requires:
  - phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
    provides: "`app/src/lib/datetime.ts` et la graine qui distingue un instant d'une heure murale (19-02) — les rappels de démonstration sont de vrais instants, donc comparables à `now`"
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "les constats WR-13 et WR-14 (`18-REVIEW.md`)"
provides:
  - "`taches/types.ts` — `lateDaysFor` (règle de retard nommée une seule fois), `taskGroup` (frontière d'épinglage), `sortTasks` (statut → retard → ordre manuel → `id`)"
  - "`taches/types.ts` — `reminderTasks(tasks, now)` : même jour local que `now` et rappels encore à venir, triés"
  - "`taches/taches-page.tsx` — un dépôt qui franchit une frontière de groupe est refusé sans écriture, et le toast comme l'annonce lecteur d'écran le disent"
affects: []

actuals:
  tokens: 6683
  tasks: 3
  commits: 5

plan_head_before: 024cdf56ad2a3f3d8977dc3947d30bbc11588bac
plan_head_after: b5b6e111c23d437dd4e1eb7356157903d160eb3c

tech-stack:
  added: []
  patterns:
    - "un groupe d'épinglage est une frontière nommée (`taskGroup`) que le tri et le glisser-déposer lisent tous les deux : ils ne peuvent plus diverger (D-11)"
    - "la règle de retard est écrite une fois (`lateDaysFor`) et relue par `toTask` et `sortTasks` — deux définitions auraient fini par se contredire"
    - "un panneau borne sa liste à ce que son titre annonce : la borne entre par paramètre (`now`) pour être posable par un test"
    - "un geste refusé émet une seule décision, lue par le toast et par l'annonce lecteur d'écran : l'annonce ne peut plus mentir"
    - "test de glisser-déposer : les rectangles des lignes sont posés (jsdom les rend nuls), puis le geste clavier réel est joué"

key-files:
  created:
    - app/src/modules/taches/sort.test.ts
    - app/src/modules/taches/reminders.test.ts
  modified:
    - app/src/modules/taches/types.ts
    - app/src/modules/taches/taches-page.tsx
    - app/src/modules/taches/hooks/use-taches.ts
    - app/src/modules/taches/taches-page.test.tsx

key-decisions:
  - "L'échéance ne départage plus rien dans `sortTasks` : elle n'était qu'un second critère, mais c'est lui qui faisait rebondir la ligne déposée après le `refresh()` (WR-13). Elle reste un badge."
  - "`taskGroup` (« retard » / « ouverte » / « terminée ») est le concept partagé entre le tri et le refus de dépôt ; le tri l'ordonne, le geste le respecte."
  - "Le départage final par `id` rend le tri déterministe : deux rangs égaux ne s'échangent plus au gré des re-rendus, ce que l'ancien comparateur laissait au moteur."
  - "Le refus de dépôt se prouve par l'absence d'écriture (`data.update` sur `tasks`), pas par l'ordre affiché : sans la garde, l'ordre affiché serait **identique** — c'est précisément la promesse vide que WR-13 décrit."
  - "Un second message nomme la frontière « terminées » quand c'est elle qui est franchie ; le texte du plan pour la frontière « retard » est conservé mot pour mot."
  - "La borne des rappels vient de l'appelant (`new Date()` dans `use-taches`) : le panneau ne se rafraîchit pas tout seul, comme le reste de la page."

patterns-established:
  - "Groupe d'épinglage : une valeur nommée, lue par le tri et par le geste — la cohérence entre les deux est structurelle, pas testée à l'œil."
  - "Preuve d'un refus : compter les écritures, pas relire l'écran (un tri qui défait un dépôt rend l'écran identique)."
  - "Un geste clavier réel (Espace, flèche, Espace) exerce dnd-kit de bout en bout, à condition de poser les rectangles des lignes."

requirements-completed: [WR-13, WR-14]

coverage:
  - id: D1
    description: "L'ordre affiché suit statut → retard épinglé → ordre manuel saisi, et une tâche déposée en tête y reste après un `refresh()` (WR-13, D-11)."
    requirement: WR-13
    verification:
      - kind: unit
        ref: "app/src/modules/taches/sort.test.ts#rend en tête la tâche de plus petit rang, même d’échéance plus lointaine (scénario exact de WR-13)"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx#un dépôt dans le même groupe persiste l’ordre affiché, même après le refresh"
        status: pass
    human_judgment: false
  - id: D2
    description: "Une tâche en retard reste épinglée en tête de son groupe, quel que soit le rang ; les tâches faites restent en dernier, y compris une tâche faite en retard (D-11)."
    requirement: WR-13
    verification:
      - kind: unit
        ref: "app/src/modules/taches/sort.test.ts#épingle le retard devant un meilleur rang"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/sort.test.ts#range les retards entre eux par ordre manuel, pas par ancienneté du retard"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/sort.test.ts#garde les tâches faites en dernier / #ne remonte pas une tâche faite dont l’échéance est passée"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un dépôt qui franchit la frontière d'un groupe est refusé, annoncé comme tel, et n'écrit aucun rang (WR-13, D-11)."
    requirement: WR-13
    verification:
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx#refuse un dépôt qui franchit la frontière d’un groupe, sans rien écrire (toast, aucune écriture `tasks`, pas d'annonce « déposée à la place de … »)"
        status: pass
    human_judgment: false
  - id: D4
    description: "« Rappels du jour » ne liste que les rappels du même jour local encore à venir ; un rappel passé ne consomme plus une place, sans être supprimé pour autant (WR-14, D-07)."
    requirement: WR-14
    verification:
      - kind: unit
        ref: "app/src/modules/taches/reminders.test.ts#ne retient que le rappel du jour, pas les rappels passés (trois rappels de juin + un du jour)"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/reminders.test.ts#écarte un rappel du jour déjà passé / #écarte un rappel de demain / #garde ce soir 23:59 et écarte cette nuit 00:01"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/reminders.test.ts#filtre sans supprimer : le rappel écarté reste sur sa tâche"
        status: pass
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx#ne liste que le rappel du jour encore à venir (horloge figée à midi)"
        status: pass
    human_judgment: false
  - id: D5
    description: "L'ordre affiché d'un groupe se lit toujours de la même façon dans l'interface après un dépôt réel (geste clavier, pas un appel direct au gestionnaire)."
    requirement: WR-13
    verification:
      - kind: unit
        ref: "app/src/modules/taches/taches-page.test.tsx — Espace / flèche / Espace via `userEvent`, rectangles posés"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 03: Tâches — l'ordre manuel gouverne, les rappels se bornent au jour

**`sortTasks` suit désormais statut → retard épinglé → ordre manuel saisi → `id` (l'échéance ne départage plus, c'est elle qui faisait rebondir la ligne déposée), un dépôt qui franchit une frontière de groupe est refusé sans écriture au lieu d'être promis, et `reminderTasks(tasks, now)` borne « Rappels du jour » au jour local encore à venir sans jamais supprimer un rappel passé.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-10-15T17:08:00Z
- **Completed:** 2026-10-15T17:31:35Z
- **Tasks:** 3
- **Files modified:** 6 (2 créés, 4 modifiés) — 445 insertions, 22 suppressions

## Accomplishments

- **Le tri ne se contredit plus avec le geste.** L'échéance était le deuxième critère de `sortTasks` alors que le dépôt n'écrit que `priority_order` : chaque `refresh()` défaisait le geste. Le tri est maintenant `taskGroup` (retard → ouverte → terminée), puis `priority_order`, puis `id` — un départage stable que l'ancien comparateur laissait au moteur.
- **La règle de retard n'existe qu'une fois.** `lateDaysFor` est lue par `toTask` (`isLate`, `lateDays`) et par `sortTasks` : deux définitions n'auraient pas pu rester d'accord longtemps. `taskGroup` donne un nom à la frontière que le tri ne franchit pas.
- **Un dépôt hors de son groupe est refusé, pas promis.** « Les tâches en retard restent en tête ; déplacez la tâche dans son groupe. » Le toast et l'annonce lecteur d'écran lisent la même décision, donc l'annonce ne peut plus dire « déposée à la place de … » pour un geste que le tri annulerait.
- **« Rappels du jour » tient ce que son titre annonce.** Même jour local que `now`, et seulement les rappels encore à venir ; triés du plus proche au plus lointain. La doctrine D-07 est écrite dans le code : c'est un **filtrage**, pas un nettoyage — la ligne `task_reminders` garde sa valeur, le formulaire la réaffiche, le badge de la tâche garde son heure.
- **Deux tests purs neufs et deux preuves de page.** Le geste clavier réel (Espace, flèche, Espace) exerce dnd-kit de bout en bout — possible seulement parce que les rectangles des lignes sont posés (jsdom les rend nuls).

## Task Commits

Each task was committed atomically (TDD tasks carry their RED then GREEN):

1. **Task 1 — RED** : `3b089df` (test) — l'ordre manuel doit gouverner l'ordre affiché (4 assertions rouges)
2. **Task 1 — GREEN** : `425ddde` (fix) — le tri des tâches suit statut, retard, ordre manuel
3. **Task 2** : `853fe87` (fix) — un dépôt hors de son groupe est refusé, pas promis (+ les deux tests de page)
4. **Task 3 — RED** : `614d4b9` (test) — les rappels du jour doivent se borner à la journée (6 assertions rouges)
5. **Task 3 — GREEN** : `b5b6e11` (fix) — « Rappels du jour » ne liste que la journée à venir

**Plan metadata:** aucun — `commit_docs: false` dans `.planning/config.json`, `.planning/` n'est pas commité (et `.gitignore:58` l'ignore).

## Red proofs (assertion mutée → rouge, restaurée → vert)

| Preuve | Geste | Résultat observé |
|---|---|---|
| WR-13, tri | `3b089df` = comparateur d'origine (échéance, puis rang) | **4 tests rouges / 8** — « rend en tête la tâche de plus petit rang » (`[a,b,c]` reçu, `[c,b,a]` attendu), « range les retards entre eux par ordre manuel », « départage deux rangs égaux », « `dueDate` nul ne pèse plus » |
| WR-13, dépôt | `groupBoundaryMessage` neutralisée (`return null` avant la comparaison des groupes), puis restaurée | **1 test rouge** (« Les tâches en retard restent en tête » introuvable), puis **31/31 verts** |
| WR-14, borne | `614d4b9` = `reminderTasks` d'origine (tout rappel non nul, sans filtre de date) | **6 tests rouges / 7**, dont `['juin-1','juin-2','juin-3','aujourd-hui']` attendu `['aujourd-hui']` |
| WR-14, panneau | borne du jour neutralisée (`return true` dans le filtre), puis restaurée | **6 rouges**, dont le test de panneau (« Ajouter le lait d'agne », rappel de demain, listé à tort), puis **31/31 verts** |

## Files Created/Modified

- `app/src/modules/taches/sort.test.ts` *(créé)* — 8 cas : rang gouverneur (scénario WR-13), retard épinglé, rangs égaux déterministes, `dueDate` nul, tâches faites, non-mutation.
- `app/src/modules/taches/reminders.test.ts` *(créé)* — 7 cas, tous avec un `now` posé : bornes `>= now` et même jour local, 23:59 / 00:01, tri, filtre sans suppression, rappel illisible.
- `app/src/modules/taches/types.ts` — `lateDaysFor` extraite (lue par `toTask` **et** `sortTasks`), `taskGroup` + `sortTasks` recomposés, `reminderTasks(tasks, now)` bornée et triée sur des instants analysés.
- `app/src/modules/taches/taches-page.tsx` — `groupBoundaryMessage` (message par frontière), `refusalFor` (une seule décision pour l'annonce et pour l'écriture), `handleDragEnd` refuse et le dit, panneau des rappels : description et état vide bornés à « aujourd'hui ».
- `app/src/modules/taches/hooks/use-taches.ts` — `reminderTasks(tasks, new Date())` ; le type retourné reste `Task[]`, aucun changement de contrat.
- `app/src/modules/taches/taches-page.test.tsx` — rectangles des lignes posés + deux cas de dépôt (même groupe / frontière franchie) + un cas de panneau à horloge figée.

## Decisions Made

- **L'échéance disparaît du comparateur, pas de l'écran.** D-11 la garde comme badge ; la retirer du tri est ce qui rend le geste visible.
- **Une seule décision de refus.** `refusalFor` sert `handleDragEnd` **et** `announcements.onDragEnd` : écrire la règle deux fois aurait permis à l'annonce de dire autre chose que ce qui s'est passé.
- **Le refus se prouve par les écritures.** Sans la garde, l'ordre affiché après un dépôt inter-groupes serait **identique** (le tri réépingle le retard) : une assertion d'écran n'aurait rien distingué. `vi.spyOn(data, 'update')` filtré sur la table `tasks` mesure le fait, et le toast mesure ce qui est dit.
- **Deuxième message pour la frontière « terminées ».** Le plan ne cite que celui des retards ; sous le filtre « Toutes les tâches » la frontière franchie peut être celle des tâches faites, et un message qui parlerait de retards serait faux (Rule 2). Le texte du plan est conservé mot pour mot là où il s'applique.
- **`now` vient de l'appelant.** Le panneau ne se rafraîchit pas tout seul ; la borne suit donc le rendu de la page, comme le reste de ses données.

## Deviations from Plan

### Auto-fixed / plan-authorised additions

**1. [Rule 2 - Missing critical proof] Le cas de refus s'appuie sur un espion d'écriture plutôt que sur « aucun appel à `reorder` » (Task 2)**
- **Found during:** Task 2, écriture du test demandé par l'action
- **Issue:** `reorder` vit à l'intérieur du hook et n'est pas observable depuis la page ; surtout, un dépôt inter-groupes **sans** la garde produit le même ordre affiché (le tri réépingle le retard). Une assertion d'écran n'aurait donc pas distingué le refus d'une écriture aussitôt défaite — la preuve aurait été vide.
- **Fix:** espion sur `data.update` filtré sur la table `tasks` (le seul chemin d'écriture de `updateTaskOrders`), en plus du toast, de l'annonce et de l'ordre affiché.
- **Files modified:** `app/src/modules/taches/taches-page.test.tsx`
- **Commit:** `853fe87` — prouvé rouge par mutation de la garde (1 rouge), puis vert.

**2. [Rule 2 - Message faux évité] Un second message pour la frontière « terminées » (Task 2)**
- **Found during:** Task 2, implémentation de `groupBoundaryMessage`
- **Issue:** le plan ne cite que le message des retards ; or la frontière peut aussi être celle des tâches faites (filtre « Toutes les tâches »).
- **Fix:** `groupBoundaryMessage` choisit le message de la frontière réellement franchie ; le texte du plan est conservé lorsque la frontière est celle du retard.
- **Files modified:** `app/src/modules/taches/taches-page.tsx`
- **Commit:** `853fe87`

**3. [Rule 3 - Preuve de câblage] Un cas de panneau ajouté à `taches-page.test.tsx` (Task 3)**
- **Found during:** Task 3, après la preuve du test pur
- **Issue:** le test pur prouve la règle, pas le câblage (`use-taches` qui passe `new Date()`). Un `use-taches` oublié aurait laissé le panneau tel quel avec des tests purs verts.
- **Fix:** test de page à horloge figée à midi (seul `Date` est simulé, pour ne pas geler React Query, Dexie ni `waitFor`) : seul le rappel du jour de la graine est listé, celui de demain ne l'est pas.
- **Files modified:** `app/src/modules/taches/taches-page.test.tsx` (dans les `files_modified` du plan, hors de la liste `<files>` de la Task 3)
- **Commit:** `b5b6e11` — prouvé rouge par mutation de la borne (6 rouges, dont celui-ci).

**4. [Interprétation] « sous la liste, la mention existante » (Task 3)**
- **Found during:** Task 3, retouche du panneau
- **Issue:** l'action demande d'ajuster « la mention existante » sous la liste pour « ne pas promettre les rappels passés ». Les deux mentions du panneau relatives aux rappels sont la description (« Ce qui mérite un petit rappel. ») et l'état vide (« Aucun rappel programmé. ») ; toutes deux sont désormais bornées à « aujourd'hui ». La phrase qui suit la liste (« N tâche(s) pour moi ou sans assigné sur M. ») ne parle pas des rappels.
- **Fix:** description et état vide bornés ; la phrase du compteur est laissée intacte, la retoucher aurait changé un texte sans rapport (le plan n'admet comme retouches d'interface que l'état vide et le message de refus).
- **Files modified:** `app/src/modules/taches/taches-page.tsx`
- **Commit:** `b5b6e11`

**Total deviations:** 4 — deux preuves renforcées, un message rendu exact, une interprétation écrite. Aucun changement de comportement hors du périmètre WR-13/WR-14.

## Issues Encountered

- **Le premier passage de GREEN a référencé `toIsoDate` sans l'importer** (`types.ts` n'importait que `daysBetween`, `relativeDayLabel`, `toLocalDate`, `todayIso`) : les 7 tests de rappel sont tombés d'un coup. Corrigé par l'import ; `npm run typecheck` reste vert sur l'état final.
- **Une horloge simulée complète gèle la page.** `vi.useFakeTimers({ shouldAdvanceTime: true })` ne laissait jamais apparaître la liste (React Query/Dexie/`waitFor` ne progressaient plus). `vi.useFakeTimers({ toFake: ['Date'] })` fige le jour sans geler les minuteries — c'est ce que le test emploie, et `vi.useRealTimers()` est restauré en `afterEach`.

## Verification

| Contrôle | Résultat |
|---|---|
| `cd app && npm run typecheck` | vert |
| `cd app && npm test` | **128 fichiers / 1046 tests**, tous verts (base : 126 / 1028) |
| `cd app && npm test -- src/modules/taches` | **4 fichiers / 31 tests**, verts |
| `cd app && npm run build` | vert (Vite + `sw.ts` injectManifest, 104 entrées de précache) |
| `python3 scripts/check-sql-statique.py` | `aucun défaut` — 180 fonctions effectives, 123 migrations, 62 tests |
| `grep -n "dueDate" app/src/modules/taches/types.ts` | plus aucune comparaison d'échéance dans `sortTasks` ; les seules lectures sont la règle de retard (`lateDaysFor`, partagée avec `toTask`) et le passage de champ |

`migrate.sh` / `test-db.sh` n'ont **pas** été exécutés, et ne l'auraient pas pu valider ce plan : il n'ajoute ni migration, ni fonction SQL, ni test de base. Docker est disponible, mais ici il n'a pas de prise — le dire autrement serait une preuve fausse.

`npm run test:e2e` n'a pas été relancé : les 4 échecs préexistants appartiennent au plan 19-06, et aucun test e2e ne couvre le glisser-déposer des tâches ni le panneau des rappels (les specs `critical-paths` sur `/taches` créent, cochent, rangent en dossier et suppriment — chemins que ce plan ne touche pas).

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucun texte d'attente, aucun composant sans source de données (recherche `TODO|FIXME|placeholder|coming soon|not available` : rien dans les six fichiers du plan).

## Deferred / non couvert

- Le tri reste appliqué **après** les filtres (`filterTasks` → dossiers → assigné → `sortTasks`) : un dépôt ne peut donc réordonner que ce qui est visible, comportement inchangé par ce plan.
- `manualRanks` continue d'attribuer les rangs sur l'ensemble des tâches du foyer triées par `priority_order`, pas seulement sur l'onglet courant. Hors périmètre (WR-13 porte sur l'effet visible du geste), mais c'est la raison pour laquelle un dépôt intra-groupe peut décaler des rangs hors de l'onglet affiché.

## Next Phase Readiness

- Les frontières de groupe sont nommées (`taskGroup`) : toute évolution du tri doit passer par là, jamais par une seconde définition du retard.
- Aucun blocage. Les autres plans de la vague 1 (`19-04` routes et gardes, `19-06` e2e) ne touchent aucun fichier de ce plan.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Fichiers créés : les 3 présents (`taches/sort.test.ts`, `taches/reminders.test.ts`, ce SUMMARY).
- Commits : les 5 présents (`3b089df`, `425ddde`, `853fe87`, `614d4b9`, `b5b6e11`) ; `git rev-list --count 024cdf5..HEAD` = **5**.
- Working tree : aucune modification non commitée hors plan (seuls des fichiers non suivis préexistants : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`).
