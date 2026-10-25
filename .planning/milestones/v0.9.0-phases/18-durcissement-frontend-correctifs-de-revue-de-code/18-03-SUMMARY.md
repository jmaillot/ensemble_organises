---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: "03"
subsystem: frontend-authorization
tags: [rls, wr-02, authorization, taches, routines, notes, dossiers, folder-tabs, accessibilite, vitest]

requires:
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-01 (c2e655e, 34cd0de) : correctifs CR-01 et commits de revue"
  - phase: 18-durcissement-frontend-correctifs-de-revue-de-code
    provides: "18-02 (6727e73, 5de0b17, 556a212) : suppression bruyante (`data.remove` compte ses lignes, `DataError`)"
provides:
  - "Capacité `isAdmin` exposée par `useTaches` et `useRoutines`, distincte de `canWrite`, alimentée par `useIsAdmin()` du store (aucune requête supplémentaire)"
  - "`FolderTabs` porte deux capacités : `canManage` (créer/renommer, ouvert au membre) et `canDelete` (corbeille, admin seul), défaut `canManage` pour tout appelant non migré"
  - "`TaskRow.canDelete` (défaut `!readOnly`) et `RoutineHistory.canDelete` (défaut `true`) : la corbeille de l'historique obéit à la conjonction rôle ∧ `entry.canDelete`"
  - "Garde admin sur les six actions destructrices sans exception : `removeTask`, `deleteFolder` (tâches), `removeRoutine`, `deleteFolder`, `removeOccurrence` (routines), `deleteFolder` (notes) — `removeOccurrence` n'avait aucune garde"
  - "Tests négatifs par membre réel du jeu de démo (`DEMO_MEMBERS.thomas`, rôle `membre`) : aucune corbeille n'est rendue, édition et création restent"
  - "Correspondance demande ↔ politique serveur consignée (§ « Alignement » ci-dessous)"
affects: [taches, routines, notes, composants-partages, revue-de-code-wr-02]

actuals:
  tokens: 9680
  tasks: 3
  commits: 3
plan_head_before: 556a2128057aff6d5be6f89b4f61e6bfeaac4d7c
plan_head_after: 80a43514dcd33e2b844462bec839632515288bdc

tech-stack:
  added: []
  patterns:
    - "Une capacité d'écriture (`canWrite`) n'implique pas une capacité de suppression : le rôle effectif est lu dans le store (`useIsAdmin`), jamais redérivé par une requête"
    - "Deux capacités séparées portées par un composant partagé, avec un défaut qui reproduit exactement le comportement antérieur de l'appelant non migré"
    - "Conjonction (rôle ∧ règle de la ligne) plutôt que substitution quand une donnée porte déjà sa propre règle métier (`entry.canDelete`)"

key-files:
  created:
    - app/src/modules/notes/hooks/use-notes.test.tsx
  modified:
    - app/src/modules/taches/hooks/use-taches.ts
    - app/src/modules/taches/components/task-row.tsx
    - app/src/modules/taches/taches-page.tsx
    - app/src/modules/taches/taches-page.test.tsx
    - app/src/components/shared/folder-tabs.tsx
    - app/src/components/shared/folder-tabs.test.tsx
    - app/src/modules/notes/notes-page.tsx
    - app/src/modules/notes/hooks/use-notes.ts
    - app/src/modules/routines/hooks/use-routines.ts
    - app/src/modules/routines/routines-page.tsx
    - app/src/modules/routines/components/routine-history.tsx
    - app/src/modules/routines/routines-page.test.tsx

key-decisions:
  - "`canDelete` est un prop **distinct** de `canManage` : créer et renommer son propre dossier est légitime pour un membre (0051:62-80), le supprimer est admin-seul (0051:82-87) — une capacité unique ne peut pas porter les deux"
  - "Défauts retrocompatibles partout (`canDelete = canManage` dans FolderTabs, `= !readOnly` dans TaskRow, `= true` dans RoutineHistory) : aucun appelant existant ne change de rendu sans migration explicite"
  - "`RoutineHistory` combine `canDelete` et `entry.canDelete` au lieu de substituer : `entry.canDelete` exprime qu'une occurrence est réellement enregistrée, règle que le rôle admin ne doit pas contourner"
  - "`useNotes.deleteFolder` rejoint la classe (Rule 2) : `note_folders_delete` est admin-seul, et laisser ce troisième dossier dériver était exactement le défaut que D-03 demande de corriger"
  - "Le prop `canDelete` de `FolderTabs` est passé par `taches-page` en tâche 2 et non en tâche 1 (reséquencement) : le prop n'existait pas encore en tâche 1, et un commit ne doit pas laisser `npm run typecheck` rouge (AGENTS.md §2.7)"

metrics:
  duration: "14 min"
  completed: "2026-10-15"
  tasks_completed: 3
  files_changed: 13
status: complete
---

# Phase 18 Plan 03 : l'interface ne propose que les suppressions que le serveur accorde

Le rôle gouverne désormais chaque corbeille : une capacité `isAdmin` exposée par
les hooks, `canDelete` distinct de `canManage` dans `FolderTabs`, et six actions
destructrices gardées — dont `removeOccurrence`, qui n'avait jusqu'ici **aucun**
contrôle.

## Objectif et résultat

WR-02 est un écart entre ce que l'interface propose et ce que la RLS accorde :
les corbeilles étaient rendues pour tout `canWrite` (`role !== 'enfant'`), alors
que la suppression est admin-seule côté serveur. Un `membre` cliquait donc une
action que le serveur refuse — et qui, avant 18-02, échouait en silence (la ligne
restait, le message annonçait le succès).

`purpose` du plan : D-03 demande que le rôle sans droit **ne voie pas** l'action,
et qu'un refus résiduel reste visible. Le point délicat est que créer et renommer
sont légitimes pour un membre (il gère ses propres dossiers) alors que supprimer
est admin-seul : une seule capacité `canManage` ne pouvait pas porter les deux.

| Tâche | Type | Résultat |
|---|---|---|
| 1 | tracer | Le rôle gouverne la corbeille des tâches, page comprise (`isAdmin`, `TaskRow.canDelete`, gardes `removeTask`/`deleteFolder`) |
| 2 | auto | `canDelete` scindé de `canManage` sur les trois modules à dossiers ; gardes admin sur les suppressions de Routines ; `use-notes` rejoint la classe |
| 3 | auto | `RoutineHistory` filtrée par admin (conjonction rôle ∧ occurrence), preuve de page et d'appel direct |

## Alignement demande ↔ politique serveur (exigé par le plan)

| Affordance / action | Fichier | Politique serveur | Référence |
|---|---|---|---|
| Corbeille de tâche | `modules/taches/components/task-row.tsx` | `tasks_delete_admin` (admin **et** voyage ouvert ou `trip_id` nul) | `0118_trip_workspace.sql:349-354` |
| Dossier de tâches (corbeille) | `components/shared/folder-tabs.tsx` | `task_lists_delete` (admin **et** `not is_default`) | `0051_folders_rls.sql:82-87` |
| Corbeille de routine | `modules/routines/routines-page.tsx` | `routines_delete_admin` | boucle `0007_rls_policies.sql:237-241` |
| Occurrence de l'historique | `modules/routines/components/routine-history.tsx` | `routine_completions_delete_admin` | boucle `0007_rls_policies.sql:237-241` |
| Dossier de routines (corbeille) | `components/shared/folder-tabs.tsx` | `routine_folders_delete` | `0051_folders_rls.sql:82-87` |
| Dossier de notes (corbeille) | `components/shared/folder-tabs.tsx` + `hooks/use-notes.ts` | `note_folders_delete` | `0051_folders_rls.sql:82-87` |

Politiques **non** touchées, à dessein (créer et renommer restent ouverts au
membre) : `*_insert` / `*_update` du dossier (`0051:62-80`, qui exigent que
`owner_member_id` soit le membre courant), et l'écriture d'item (`canWrite` seul).
C'est cette asymétrie exacte — écrire oui, supprimer non — qui impose deux
capacités au lieu d'une.

Le dossier `is_default` (Général) reste hors du dialogue « Gérer » : `T-18-09`
classe la menace en `accept`, le serveur refusant déjà (`not is_default` et
trigger `guard_folder_default`) et le client n'étant pas la barrière.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — autorisation manquante] `useNotes.deleteFolder` rejoint la classe**
- **Found during:** Task 2
- **Issue:** le plan ne demandait que `canDelete={isAdmin}` sur le `FolderTabs` de
  Notes. Mais `use-notes.ts:deleteFolder` n'était gardé que par `canWrite`, alors
  que `note_folders_delete` (0051:82-87) est admin-seul — **troisième occurrence
  de la même classe**, dans le troisième des modules que le plan dit explicitement
  devoir traiter ensemble. Laisser ce site dériver est exactement ce que D-03
  (« corriger la classe ») et `18-CONTEXT.md` (« recenser tous les sites
  concernés ») demandent d'éviter ; AGENTS.md §E en fait une obligation.
- **Fix:** garde admin + message identique aux deux autres modules
  (« Seul un administrateur du foyer peut supprimer. »), et un test d'appel direct
  (négatif et positif) pour que le garde soit **prouvé**, pas seulement écrit.
- **Files modified:** `app/src/modules/notes/hooks/use-notes.ts` (+ nouveau
  `app/src/modules/notes/hooks/use-notes.test.tsx`)
- **Commit:** `9d093e4`

**2. [Rule 3 — typecheck rouge] Le prop `canDelete` de `FolderTabs` est passé en tâche 2, pas en tâche 1**
- **Found during:** Task 1
- **Issue:** la tâche 1 demandait de passer `canDelete={isAdmin}` au `FolderTabs`
  de `taches-page.tsx`, en notant elle-même que « le prop `canDelete` arrive en
  tâche 2 ». Or `FolderTabsProps` ne déclarait pas `canDelete` : le commit de la
  tâche 1 aurait laissé `npm run typecheck` en erreur, ce qu'AGENTS.md §2.7
  interdit (la chaîne de vérification passe avant le commit).
- **Fix:** la ligne est passée dans la tâche 2, là où le prop est déclaré. État
  final identique à celui demandé (`canManage={canWrite}` **et**
  `canDelete={isAdmin}`), chaque commit vert.
- **Files modified:** `app/src/modules/taches/taches-page.tsx` (en tâche 2)
- **Commit:** `9d093e4`

Aucune autre déviation : les tâches 2 et 3 ont été exécutées comme écrites.

## Décisions prises

- **`canDelete` par défaut = `canManage`** (FolderTabs), **`!readOnly`**
  (TaskRow), **`true`** (RoutineHistory) : un appelant non migré garde
  exactement son rendu. Le défaut est prouvé par test (`folder-tabs.test.tsx`,
  « conserve exactement le rendu antérieur quand canDelete est omis »).
- **`RoutineHistory` : conjonction, pas substitution.** `entry.canDelete` existe
  pour une raison propre à la ligne — seule une occurrence **enregistrée** est
  supprimable ; une occurrence « en retard » ou « à venir » n'a aucune ligne à
  effacer. Substituer le rôle à cette règle rouvrirait une corbeille sans cible.
- **`isAdmin` n'est pas redérivé.** `useIsAdmin()` (`household-store.ts:74-76`)
  compare déjà le rôle du membre courant à `'admin'` : aucune requête nouvelle,
  et l'interface suit la même source que le reste de l'app.
- **Le message de refus est uniforme** dans les trois modules
  (« Seul un administrateur du foyer peut supprimer. »), après la garde
  `canWrite` conservée en première position pour le rôle `enfant`.

## Vérification

| Contrôle | Résultat |
|---|---|
| `npm test -- src/modules/taches/taches-page.test.tsx` (tâche 1, tracer) | 8 passés |
| `npm test -- src/components/shared/folder-tabs.test.tsx src/modules/routines/routines-page.test.tsx` (tâche 2) | 20 passés |
| `npm test -- src/modules/routines/routines-page.test.tsx && npm run typecheck` (tâche 3) | 18 passés, typecheck vert |
| `npm run typecheck` | vert |
| `npm test` (suite complète) | **119 fichiers, 958 tests, tous verts** |
| `npm run build` | vert (PWA `injectManifest`, 103 entrées précachées) |
| `python3 scripts/check-sql-statique.py` | 180 fonctions effectives, **aucun défaut** |
| `npm run test:e2e` | 117 passés, 5 ignorés, **4 échecs préexistants** (2 specs × 2 projets) — voir ci-dessous |

Le plan ne modifie **aucune** migration ni fonction SQL : `migrate.sh` /
`test-db.sh` n'ont pas de prise sur ce plan (le contrôle statique tourne, lui,
sur tout le dépôt).

Les 4 échecs e2e sont ceux déjà relevés en 18-01 (`deferred-items.md` §2) :
`critical-paths.spec.ts:28` exige un lien « Continuer avec Facebook » (chaîne
retirée le 2026-10-13) et `voyage-workspace.spec.ts:110` exige une `checkbox` là
où l'affordance est un `switch`. Aucun spec e2e ne touche une corbeille de tâche,
de dossier ou de routine : aucun échec nouveau, et **aucun** des deux specs n'a
été modifié.

## Preuve que le négatif est vraiment négatif

Les cas négatifs ne simulent pas une erreur : ils **basculent le store** sur
`DEMO_MEMBERS.thomas`, un `membre` réel du jeu de démonstration
(`app/src/lib/data/seed.ts:122-131`), après le rendu initial en administrateur
(Camille). Le même test affirme ensuite que l'édition et la création restent, ce
qui interdit de « réussir » le cas négatif en masquant tout.

Le mode démo (Dexie) ne porte ni RLS ni contrainte : c'est la raison structurelle
du défaut, et donc l'**affichage** et les gardes de hook sont testés ici, pas
l'autorisation serveur. Ce périmètre est écrit en commentaire dans les fichiers
de test concernés pour qu'aucun lecteur ne s'y trompe.

`removeOccurrence` et `useNotes.deleteFolder` sont en plus prouvés par appel
direct (`renderHook`) : sans cela, le test d'affichage ne les exercerait pas, la
corbeille étant de toute façon absente de l'écran d'un membre.

## Known Stubs

Aucun. Aucune valeur vide codée en dur, aucun libellé d'attente, aucun composant
sans source de données n'a été introduit ; les défauts de props sont des valeurs
de compatibilité, pas des données d'affichage.

## Threat Flags

Aucun nouveau. Les changements ne créent ni route, ni accès fichier, ni frontière
de confiance : ils **retirent** des affordances (T-18-07) et ajoutent les gardes
manquantes (T-18-08), conformément au modèle de menace du plan. Aucun paquet n'a
été ajouté (T-18-SC non déclenché).

## Self-Check: PASSED

- `app/src/modules/notes/hooks/use-notes.test.tsx` — FOUND
- `e7c5aea` (tâche 1) — FOUND
- `9d093e4` (tâche 2) — FOUND
- `80a4351` (tâche 3) — FOUND
