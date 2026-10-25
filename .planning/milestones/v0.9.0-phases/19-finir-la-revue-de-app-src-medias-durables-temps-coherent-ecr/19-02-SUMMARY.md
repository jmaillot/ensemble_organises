---
phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr
plan: 02
subsystem: ui
tags: [datetime, timezone, datetime-local, date-fns, rappels, taches, routines, calendrier, dashboard, wr-07, wr-12, d05, d06]

# Dependency graph
requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "les constats WR-07 et WR-12 (`18-REVIEW.md`), et la doctrine d'heure murale `eventWallDate` (`lib/utils.ts`)"
provides:
  - "`app/src/lib/datetime.ts` — point unique de conversion dans les deux sens : `instantToLocalInput` (relecture) et `instantOfDatetimeLocal` (écriture)"
  - "les trois `<input type=\"datetime-local\">` du dépôt (tâches, routines, calendrier) convertissent par ce helper, dans les deux sens"
  - "`nextBirthdayIso` borne le jour par la longueur réelle du mois (`getDaysInMonth`) : 29 février inclus, sans `NaN` ni débordement au 1er mars"
  - "la graine de démonstration distingue un instant (`atInstant`) d'une heure murale (`at`)"
affects: [19-03, 19-04]

actuals:
  tokens: 7806
  tasks: 3
  commits: 7

plan_head_before: c6add75e0f61e2661f593a5398ab0e2d0c329677
plan_head_after: 024cdf56ad2a3f3d8977dc3947d30bbc11588bac

tech-stack:
  added: []
  patterns:
    - "un instant se relit par `format` (date-fns) dans le fuseau local, jamais par un découpage de chaîne (WR-07/D-05)"
    - "un `datetime-local` s'écrit par un helper qui vit dans le même module que sa relecture : l'aller-retour est testable, donc prouvable"
    - "le calcul d'une date passe par `date-fns` (`getDaysInMonth`), la concaténation de chaîne est bannie (D-06)"
    - "un test de temps épingle son fuseau (`process.env.TZ`) et son jour (`vi.setSystemTime`), puis restaure l'un et l'autre"

key-files:
  created:
    - app/src/lib/datetime.ts
    - app/src/lib/datetime.test.ts
    - app/src/modules/dashboard/hooks/next-birthday.test.ts
    - app/src/modules/calendrier/api.test.ts
  modified:
    - app/src/modules/taches/api.ts
    - app/src/modules/taches/components/task-form-dialog.tsx
    - app/src/modules/routines/api.ts
    - app/src/modules/routines/types.ts
    - app/src/modules/routines/components/routine-form-dialog.tsx
    - app/src/modules/calendrier/api.ts
    - app/src/modules/calendrier/components/event-form-dialog.tsx
    - app/src/modules/dashboard/hooks/use-dashboard.ts
    - app/src/lib/data/seed.ts

key-decisions:
  - "Les deux directions portent les noms des `must_haves` (`instantToLocalInput`, `instantOfDatetimeLocal`) et non ceux de la prose de l'action (`datetimeLocalOf`, `instantOfDatetimeLocal`) : un seul jeu de noms exporté, celui que le vérificateur lit."
  - "`replaceEventReminder` continue de recevoir un `string | null` : c'est `saveEvent` qui convertit. Le contrat du helper reste « chaîne vide = aucun rappel »."
  - "`remindersToIso` (routines/types.ts) n'a aucun appelant de production : il délègue au helper au lieu d'être supprimé, car sa suppression imposerait d'éditer `routines-page.test.tsx`, hors du périmètre de ce plan (un seul plan par fichier en vague parallèle)."
  - "`at()` de la graine n'est PAS modifié : il porte l'heure murale des événements (`eventWallDate`) ; un helper distinct `atInstant()` porte l'instant des rappels."
  - "`autoMinus1` reste dans `routines/api.ts` : dédoublonnage, tri et doublon « −24 h » sont une règle métier, pas une conversion."
  - "Un test de fuseau épingle `Europe/Paris` et restaure `process.env.TZ` : sans cela le test mesure la machine (et masque WR-07 sur un hôte en UTC)."

patterns-established:
  - "Temps affiché : `instantToLocalInput` à la relecture, `instantOfDatetimeLocal` à l'écriture — une seule règle de fuseau pour tout rappel."
  - "Preuve de conversion : l'assertion discriminante est « la date existe » (relue à l'identique après `Date`), pas « ce n'est pas `NaN` » — V8 déborde le 29 février au 1er mars au lieu de rendre `Invalid Date`."

requirements-completed: [WR-07, WR-12]

coverage:
  - id: D1
    description: "Un rappel saisi à 18:30 heure locale est réaffiché 18:30, et le réenregistrer sans y toucher restitue le même instant (WR-07, D-05)."
    requirement: WR-07
    verification:
      - kind: unit
        ref: "app/src/lib/datetime.test.ts#restitue le même instant"
        status: pass
      - kind: unit
        ref: "app/src/lib/datetime.test.ts#ne dérive pas après deux allers-retours consécutifs (défaut de WR-07 : 2 h par enregistrement)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Les trois sites de saisie du dépôt (tâches, routines, calendrier) relisent et écrivent leurs rappels par le même helper."
    requirement: WR-07
    verification:
      - kind: unit
        ref: "grep -rn 'type=\"datetime-local\"' app/src -> 3 sites, chacun importe `@/lib/datetime`"
        status: pass
      - kind: unit
        ref: "app/src/modules/calendrier/api.test.ts#convertit la valeur locale du champ en instant, et la relit à l’identique"
        status: pass
    human_judgment: false
  - id: D3
    description: "Le rappel d'un événement est stocké comme un instant (`event_reminders.remind_at`), alors que `events.start_at`/`end_at` restent l'heure murale du foyer (WR-07, T-19-06)."
    requirement: WR-07
    verification:
      - kind: unit
        ref: "app/src/modules/calendrier/api.test.ts#conserve `start_at`/`end_at` en heure murale (doctrine `eventWallDate`)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un anniversaire né un 29 février affiche un nombre de jours fini sur trois années consécutives, dont une non bissextile (WR-12, D-06)."
    requirement: WR-12
    verification:
      - kind: unit
        ref: "app/src/modules/dashboard/hooks/next-birthday.test.ts#rend une date qui existe sur trois années consécutives, dont une non bissextile"
        status: pass
      - kind: unit
        ref: "app/src/modules/dashboard/hooks/next-birthday.test.ts#nourrit au comparateur de tri une date réelle, donc un ordre stable"
        status: pass
    human_judgment: false
  - id: D5
    description: "Les deux dialogues de tâches et de routines relisent leur rappel par le helper (au lieu de `slice(0, 16)`)."
    requirement: WR-07
    verification: []
    human_judgment: true
    rationale: "La conversion est prouvée (D1) et le câblage est vérifié par lecture (`task-form-dialog.tsx:56`, `routine-form-dialog.tsx:105`), mais aucun test de rendu n'exerce ces deux dialogues avec un rappel existant : le plan ne l'a pas demandé et n'incluait pas leurs fichiers de test. Un œil humain sur un rappel réaffiché reste la preuve la plus directe."

duration: 17min
completed: 2026-10-15
status: complete
---

# Phase 19 Plan 02: Temps affiché — un seul helper de conversion, un 29 février qui existe

**`lib/datetime.ts` porte l'aller et le retour d'un instant, les trois `<input type="datetime-local">` du dépôt (tâches, routines, calendrier) passent par lui, et `nextBirthdayIso` borne le 29 février par `getDaysInMonth` — plus de dérive de 2 h à l'enregistrement, plus de date qui n'existe pas.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-15T16:47:39Z
- **Completed:** 2026-10-15T17:04:20Z
- **Tasks:** 3
- **Files modified:** 13 (4 créés, 9 modifiés)

## Accomplishments

- `app/src/lib/datetime.ts` : `instantToLocalInput` (relecture par `format` de date-fns, fuseau local) et `instantOfDatetimeLocal` (écriture en instant ISO). Le commentaire du module cite WR-07/D-05 pour que `slice(0, 16)` ne revienne pas.
- **Les trois** sites de saisie de rappel du dépôt convertissent par ce helper, dans les deux sens : `tâches`, `routines` (dialogue **et** API, `toReminderIso`/`toReminderIsos`), `calendrier` (dialogue **et** `saveEvent`).
- Le troisième convertisseur (`routines/types.ts:remindersToIso`) délègue : une seule règle de fuseau subsiste dans le dépôt.
- `saveEvent` n'écrit plus une chaîne naïve (`2026-10-15T18:30:00`) que le serveur castait à **son** fuseau : c'est l'instant qui est stocké. `start_at`/`end_at` restent en heure murale (doctrine `eventWallDate`), et un test tient les deux frontières dans le même fichier.
- `nextBirthdayIso` borne le jour par la longueur réelle du mois : un 29 février tombe sur le 28 en année non bissextile.
- La graine de démonstration distingue enfin ce qu'elle est : `at()` (heure murale des événements) et `atInstant()` (instant des rappels).

## Task Commits

Each task was committed atomically (TDD tasks carry their RED then GREEN):

1. **Task 1 — RED** : `50c78de` (test) — l'aller-retour d'un rappel doit rester l'instant d'origine (9 assertions rouges)
2. **Task 1 — GREEN** : `b0af76b` (feat) — la relecture passe par date-fns, plus par slice
3. **Task 2** : `3ec4f3e` (fix) — tâches et routines lisent leurs rappels par le helper partagé
4. **Task 3 — RED** : `fb96819` (test) — un 29 février doit rendre une date qui existe (4 assertions rouges)
5. **Task 3 — GREEN (WR-12)** : `765f7d0` (fix) — le prochain anniversaire borne son jour par la longueur du mois
6. **Task 3 (WR-07, 3ᵉ site)** : `cd88871` (fix) — le rappel d'événement est un instant, la date reste murale
7. **Task 3 (graine)** : `024cdf5` (fix) — la graine de démonstration dit un instant pour un rappel

**Plan metadata:** aucun — `commit_docs: false` dans `.planning/config.json`, `.planning/` n'est pas commité.

## Red proofs (assertion mutée → rouge, restaurée → vert)

| Preuve | Geste | Résultat observé |
|---|---|---|
| WR-07, relecture | `git show 50c78de:app/src/lib/datetime.ts` = relecture d'origine (`slice(0, 16)`) | **9 tests rouges / 12**, dont « la dérive de 2 h par enregistrement » (`14:30Z` attendu, `12:30Z` reçu) |
| WR-07, relecture (mutation sur l'état vert) | `instantToLocalInput` remis à `value.toISOString().slice(0, 16)` puis restauré | **8 tests rouges**, puis **12/12 verts** après `git checkout -- app/src/lib/datetime.ts` |
| WR-07, écriture du calendrier | `saveEvent` remis à `` `${input.remindAt.trim()}:00` `` puis restauré | **2 tests rouges** (`api.test.ts`), puis **6/6 verts** |
| WR-12 | `fb96819` = implémentation d'origine (concaténation `${year}-02-29`) | **4 tests rouges / 5**, dont `'2027-03-01'` attendu `'2027-02-29'` : la date n'existe pas |

## Files Created/Modified

- `app/src/lib/datetime.ts` *(créé)* — point unique de conversion, les deux directions, la raison de D-05 en commentaire.
- `app/src/lib/datetime.test.ts` *(créé)* — fuseau épinglé, aller-retour sur dix formes d'entrée, valeurs vides/illisibles, 29 février.
- `app/src/modules/dashboard/hooks/next-birthday.test.ts` *(créé)* — jour figé, trois années consécutives, comparateur de tri.
- `app/src/modules/calendrier/api.test.ts` *(créé)* — adaptateur simulé : ce qui est écrit dans `event_reminders` vs `events.start_at`, et la relecture.
- `app/src/modules/taches/api.ts` — `toReminderIso` délègue (la signature est conservée : `use-taches.ts` ne change pas ici, c'est le plan 19-03).
- `app/src/modules/taches/components/task-form-dialog.tsx` — `toReminderValue` supprimé, `instantToLocalInput` à la relecture.
- `app/src/modules/routines/api.ts` — `toReminderIso` délègue, `autoMinus1` commenté comme soustraction d'instant.
- `app/src/modules/routines/types.ts` — `remindersToIso` délègue la conversion, garde dédoublonnage et tri.
- `app/src/modules/routines/components/routine-form-dialog.tsx` — `toReminderValue` supprimé, `instantToLocalInput` à la relecture.
- `app/src/modules/calendrier/api.ts` — `saveEvent` écrit `instantOfDatetimeLocal(input.remindAt)`.
- `app/src/modules/calendrier/components/event-form-dialog.tsx` — `toReminderValue` supprimé, `instantToLocalInput` aux deux `defaultValues`.
- `app/src/modules/dashboard/hooks/use-dashboard.ts` — `nextBirthdayIso` + `birthdayInYear` (bornage par `getDaysInMonth`).
- `app/src/lib/data/seed.ts` — `atInstant()` pour les rappels, `at()` inchangé pour les événements.

## Decisions Made

- **Nommage** : l'action du plan nomme les deux directions `datetimeLocalOf`/`instantOfDatetimeLocal`, les `must_haves` les nomment `instantToLocalInput`/`localInputToInstant`. Un seul jeu est exporté — celui des `must_haves` (contrat lu par le vérificateur) : `instantToLocalInput` et `instantOfDatetimeLocal`. Aucun alias, pour ne pas installer deux noms pour une seule chose (le défaut que D-05 corrige).
- **`remindersToIso` délégué, pas supprimé** : ses seuls appelants sont `routines-page.test.tsx` (un fichier de test hors du périmètre de ce plan). La suppression aurait imposé d'éditer un fichier que la vague parallèle peut toucher ; la délégation ferme le même défaut (plus de conversion à la main) sans conflit.
- **`at()` de la graine intact** : il porte aussi `events.start_at`/`end_at`, qui doivent rester muraux. Un helper distinct est la seule façon de corriger les rappels sans casser la doctrine `eventWallDate` (T-19-06).
- **Test de fuseau** : `process.env.TZ = 'Europe/Paris'` est posé **et restauré** (worker réutilisé par `pool: 'forks'`). Sans cela, sur un hôte en UTC, la mutation `slice` passerait inaperçue : c'est exactement le mécanisme qui a masqué WR-07 (`18-REVIEW.md`).

## Deviations from Plan

### Auto-fixed / plan-authorised additions

**1. [Rule 2 - Missing critical proof] `app/src/modules/calendrier/api.test.ts` créé (fichier absent de `files_modified`)**
- **Found during:** Task 3 (audit du troisième site)
- **Issue:** le plan demande « une preuve rouge→vert » par correctif et D-05 exige que la conversion soit prouvée *dans les deux sens*. Or aucun test du dépôt n'observait la valeur écrite dans `event_reminders` : la mutation de `saveEvent` ne faisait rougir aucun test — la preuve aurait été une affirmation.
- **Fix:** test unitaire à adaptateur simulé (6 cas), qui tient dans le même fichier les deux frontières : ce qu'on convertit (`remind_at`) et ce qu'on ne convertit **pas** (`start_at`/`end_at`).
- **Files modified:** `app/src/modules/calendrier/api.test.ts` (ajouté aux `files_modified` du plan)
- **Verification:** mutation de `saveEvent` → 2 rouges ; restauré → 6 verts.

**2. [Rule 2 - Missing critical correctness] `app/src/lib/data/seed.ts` corrigé (mentionné par l'action, absent de `files_modified`)**
- **Found during:** Task 3, étape 3 de l'action (« vérifier la graine de démo »)
- **Issue:** `demoEventReminders`/`demoTaskReminders` écrivaient `at('18:30')`, une chaîne **naïve** dans une colonne `timestamptz` : la graine annonçait une heure locale en la faisant passer pour un instant (AGENTS.md §2.7I).
- **Fix:** `atInstant()` construit l'instant ISO à partir de l'heure locale annoncée ; `at()` reste l'heure murale des événements. Ajouté aux `files_modified`.
- **Verification:** la relecture rend bien 18:30 (`instantToLocalInput(atInstant('18:30'))`), vérifié par la suite complète (126 fichiers verts).

**Total deviations:** 2, toutes deux autorisées par le texte de l'action du plan (audit D-05 et graine) et documentées ici ; aucune modification de comportement hors du périmètre WR-07/WR-12.
**Impact on plan:** sans elles, deux affirmations du plan (preuve rouge→vert du 3ᵉ site, graine qui dit ce qu'elle est) restaient sans preuve.

## Issues Encountered

**WR-12 : le mécanisme observé n'est pas exactement celui de `18-REVIEW.md`.** La revue annonce « Dans NaN jours » parce que `new Date('2027-02-29')` serait invalide. Sur V8 (Node 24 / jsdom / Chromium), cette chaîne n'est **pas** refusée : elle déborde sur **2027-03-01**. Le défaut est donc réel mais autrement visible — l'anniversaire s'affichait au 1er mars (jours comptés faux, tri faux), et `NaN` n'apparaîtrait que sur un moteur qui refuse la date. C'est pourquoi l'assertion du test n'est pas « ce n'est pas `NaN` » (qui passe avant comme après la correction sur V8, donc tautologique) mais « la date rendue existe », relue à l'identique après passage par `Date`. La correction demandée par D-06 est la même ; seule la preuve change de forme.

## Verification

| Contrôle | Résultat |
|---|---|
| `cd app && npm run typecheck` | vert |
| `cd app && npm test` | **126 fichiers / 1028 tests**, tous verts (base : 123 / 1005) |
| `cd app && npm run build` | vert (`tsc --noEmit` + Vite, `dist/index.html` 5,61 kB) |
| `python3 scripts/check-sql-statique.py` | `aucun défaut` — 180 fonctions effectives, 123 migrations |
| `grep -rn 'type="datetime-local"' app/src` | 3 sites (tâches, routines, calendrier), chacun important `@/lib/datetime` |
| `grep -rn 'slice(0, 16)' app/src` | plus aucune conversion de rappel : 2 occurrences, toutes deux dans la documentation du défaut (`datetime.ts`, `datetime.test.ts`) |

`migrate.sh` / `test-db.sh` n'ont **pas** été exécutés, et ne l'auraient pas pu valider ce plan : il ne touche aucune migration, aucune fonction SQL ni aucun test de base. Docker est disponible, mais ici il n'a pas de prise — le dire autrement serait une preuve fausse.

`npm run test:e2e` n'a pas été relancé : les 4 échecs préexistants (specs périmés `critical-paths`, `voyage-workspace`) appartiennent au plan 19-06, et aucun test e2e ne couvre la saisie de rappel.

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucune donnée de démonstration laissée en place pour un chemin de production.

## Deferred / non couvert

- **Les deux dialogues (tâches, routines) n'ont pas de test de rendu** exerçant un rappel existant (voir D5 `human_judgment: true`). Le câblage est vérifié par lecture et la conversion par test ; un test de dialogue serait une amélioration, pas une preuve manquante pour WR-07 lui-même.
- Le constat de revue sur l'origine « `NaN` » est corrigé ici sur le fond, mais `18-REVIEW.md` reste inchangé (document historique, non réécrit).

## Next Phase Readiness

- `@/lib/datetime` est le point d'entrée pour toute nouvelle saisie de rappel ; `19-03` (WR-14, `use-taches.ts`) et `19-04` (WR-13/WR-17/WR-19) n'ont pas besoin d'y toucher — les deux fichiers qu'ils modifient (`taches/hooks/use-taches.ts`, `dashboard` non concerné) sont restés intacts ici.
- Aucun blocage. Les autres plans de la vague 1 restent indépendants.

---
*Phase: 19-finir-la-revue-de-app-src-medias-durables-temps-coherent-ecr*
*Completed: 2026-10-15*

## Self-Check: PASSED

- Fichiers créés : les 5 présents (`lib/datetime.ts`, `lib/datetime.test.ts`, `dashboard/hooks/next-birthday.test.ts`, `calendrier/api.test.ts`, ce SUMMARY).
- Commits : les 7 présents (`50c78de`, `b0af76b`, `3ec4f3e`, `fb96819`, `765f7d0`, `cd88871`, `024cdf5`) ; `git rev-list --count c6add75..HEAD` = **7**.
- Working tree : aucune modification non commitée (seuls des fichiers non suivis préexistants, hors plan : `.claude/`, `.gsd/`, `app/shot-toggle-on.mjs`).
