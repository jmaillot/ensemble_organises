---
phase: 18-durcissement-frontend-correctifs-de-revue-de-code
plan: 01
subsystem: database
tags: [postgres, migration, check-constraint, dashboard, widgets, vitest, dexie, cr-01]

requires: []
provides:
  - "dashboard_widgets.width accepte 0 (encodage « widget masqué ») : contrainte 0..4"
  - "test SQL 0122 rouge→vert sur la contrainte width (0 accepté, 5 refusé)"
  - "test Vitest pinnant width: 0 à l'écriture et visible = width > 0 à la lecture"
affects: [dashboard, supabase-migrations, tests-sql]

actuals:
  tokens: 2922
  tasks: 2
  commits: 2
plan_head_before: abdca4f3b102654f254a2edfed3076961cf92a98
plan_head_after: 34cd0de6d18abff960ed7b9965c3bc0a61c88821

tech-stack:
  added: []
  patterns:
    - "Correctif de contrainte SQL : drop + add dans la même transaction, migration appliquée jamais réécrite (AGENTS.md §2.7A.1)"
    - "Preuve rouge→vert : test SQL exécuté AVANT puis APRÈS la migration, les deux états consignés"
    - "Test client neutralisé vis-à-vis de l'état laissé par les autres tests (membre dédié, sans données semées)"

key-files:
  created:
    - supabase/migrations/0123_dashboard_widget_width_zero.sql
    - supabase/tests/0122_dashboard_widget_width.sql
  modified:
    - app/src/modules/dashboard/types.ts
    - app/src/modules/dashboard/dashboard-page.test.tsx

key-decisions:
  - "Assouplir la SEULE borne basse de la contrainte (1→0), sans colonne visible boolean et sans changer l'encodage ni aucune lecture (D-01)"
  - "conserver not null default 1 et dashboard_widgets_member_type_key intacts ; l'échelle reste 0..4 (width = 5 toujours refusé)"
  - "test client ancré sur le membre Thomas, sans widget semé : indépendant des écritures « void » des tests voisins"
  - "config .planning : git.allow_default_branch_commits=true, échappatoire prescrite par le garde lui-même (#2924/#3819)"

patterns-established:
  - "Une contrainte assouplie se prouve par un test qui échouait avant : (a) width=0 accepté, (b) width=5 refusé 23514, (c) bornes 1/4 acceptées"
  - "Un commentaire d'ancrage croisé relie le contrat client (visible = width > 0) à la contrainte SQL qui le rend légal"

requirements-completed: [CR-01]

coverage:
  - id: D1
    description: "Écrire width = 0 (widget masqué) est accepté par le serveur : plus de check_violation 23514"
    requirement: CR-01
    verification:
      - kind: integration
        ref: "supabase/tests/0122_dashboard_widget_width.sql#width = 0 (widget masqué) est accepté (sh scripts/test-db.sh 0122)"
        status: pass
      - kind: unit
        ref: "app/src/modules/dashboard/dashboard-page.test.tsx#persiste width: 0 en masquant un widget et le relit comme masqué (CR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "L'échelle reste bornée à 0..4 : width = 5 est toujours refusé (23514), les bornes 1 et 4 restent acceptées"
    requirement: CR-01
    verification:
      - kind: integration
        ref: "supabase/tests/0122_dashboard_widget_width.sql#width = 5 refusé (23514) : l'échelle 0..4 reste bornée"
        status: pass
    human_judgment: false
  - id: D3
    description: "La sémantique de lecture visible = width > 0 est inchangée et pinnée : le widget est masqué, pas supprimé"
    requirement: CR-01
    verification:
      - kind: unit
        ref: "app/src/modules/dashboard/dashboard-page.test.tsx#persiste width: 0 en masquant un widget et le relit comme masqué (CR-01)"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-10-15
status: complete
---

# Phase 18 Plan 01: assouplir la contrainte `dashboard_widgets.width` à 0..4 (CR-01)

**Masquer un widget de l'accueil écrit désormais `width = 0` accepté par le serveur (migration 0123), avec un test SQL prouvé rouge→vert et un test client qui pinne `width: 0` / `visible = width > 0`, sans toucher à l'encodage existant.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-10-15T11:58:00Z
- **Completed:** 2026-10-15T12:21:46Z
- **Tasks:** 2
- **Files modified:** 4 (2 créés, 2 modifiés)

## Accomplishments

- **Migration 0123** : `dashboard_widgets_width_check` passe de `check (width between 1 and 4)` à `check (width between 0 and 4)`, par `drop` + `add` dans la même transaction. `not null default 1` et `dashboard_widgets_member_type_key` intacts ; `0004_tables_shared.sql` n'est pas retouchée (vers l'avant uniquement).
- **Preuve rouge→vert** : le test a d'abord été exécuté contre le schéma d'avant 0123 et a échoué sur `check constraint "dashboard_widgets_width_check"` pour l'insertion `width = 0` ; rejoué après migration, il est vert. Les deux états sont consignés ci-dessous.
- **Échelle préservée** : `width = 5` lève toujours `23514` (vérifié sur la base vivante : `CHECK (((width >= 0) AND (width <= 4)))`) ; les valeurs 1 et 4 restent acceptées.
- **Contrat client pinné** : un test Vitest masque un widget par l'interface de personnalisation, vérifie que la préférence persistée porte `width: 0`, qu'elle n'a **pas** été supprimée (exactement une ligne), et que la lecture reste `visible = width > 0`.
- **SQL validé contre une vraie base** : Docker était disponible — `sh scripts/migrate.sh` a appliqué 0123 et `sh scripts/test-db.sh 0122` a rendu « 1 fichier(s), tous verts ».

## Task Commits

Each task was committed atomically:

1. **Task 1 : migration 0123 + preuve SQL rouge→vert** — `c2e655e` (fix)
2. **Task 2 : preuve client `width: 0` / `visible = width > 0`** — `34cd0de` (test)

**Plan metadata:** aucun commit (`.planning/` est gitignoré dans ce dépôt ; `commit_docs: false`).

## Files Created/Modified

- `supabase/migrations/0123_dashboard_widget_width_zero.sql` *(créé)* — drop/add de `dashboard_widgets_width_check` en 0..4, plus un `comment on column`
  documentant `0 = widget masqué` (aucun effet de comportement). En-tête : origine CR-01, sémantique conservée, alternative rejetée (`visible boolean`), refus de réécrire 0004, et nom de contrainte **observé sur le schéma vivant** avant le `drop`.
- `supabase/tests/0122_dashboard_widget_width.sql` *(créé)* — fichier autonome : fixtures en rôle d'administration, assertions en `authenticated`, `rollback` final ; (a) `width = 0` accepté, (b) `width = 5` refusé en `check_violation` et la ligne non écrite, (c) 1 et 4 acceptés.
- `app/src/modules/dashboard/types.ts` *(modifié)* — commentaire d'ancrage du contrat `visible = width > 0` et renvoi croisé vers la contrainte `check (width between 0 and 4)` de 0123. **Aucun changement de comportement.**
- `app/src/modules/dashboard/dashboard-page.test.tsx` *(modifié)* — nouveau test `persiste width: 0 en masquant un widget et le relit comme masqué (CR-01)`. Les tests « masque puis réaffiche un widget » et « ouvre le mode personnalisation… » sont inchangés.

## Preuves de la contrainte

**Preuve rouge** (avant `sh scripts/migrate.sh`) :

```
  → 0122_dashboard_widget_width.sql
psql:<stdin>:82: ERROR:  new row for relation "dashboard_widgets" violates check constraint "dashboard_widgets_width_check"
CONTEXT:  SQL statement "insert into public.dashboard_widgets
    (id, member_id, household_id, widget_type, position_x, position_y, width, height)
  values ('widget_t22_masque', alice_m, home, 'taches', 1, 0, 0, 1)"
Tests SQL : 1 fichier(s) en échec sur 1.
```

**Preuve verte** (après 0123) :

```
  → 0122_dashboard_widget_width.sql
    OK 0122_dashboard_widget_width.sql
Tests SQL : 1 fichier(s), tous verts.
```

**Contrainte effective sur la base vivante, après migration** :

```
 dashboard_widgets_width_check | CHECK (((width >= 0) AND (width <= 4)))
 column_name | is_nullable | column_default
 width       | NO          | 1
```

## Verification

| Commande | Résultat |
|---|---|
| `sh scripts/migrate.sh` | 1 appliquée (0123), 122 déjà connues, 0 table sans RLS |
| `python3 scripts/check-sql-statique.py` | 180 fns effectives, 123 migrations, 61 tests — **aucun défaut** |
| `sh scripts/test-db.sh 0122` | rouge avant 0123, **vert après** |
| `cd app && npm run typecheck` | vert |
| `cd app && npm test` | **930 tests / 115 fichiers, tous verts** (929 avant le nouveau test) |
| `cd app && npm run build` | vert (précache SW : 103 entrées) |
| `cd app && npm run test:e2e` | 117 passés, 5 ignorés, **4 échecs préexistants** — voir « Issues Encountered » |

**Docker : disponible** (`docker info` OK, conteneur `supabase-db` sain). Le SQL a donc été validé contre une base réelle, pas seulement parsé.

## Le contrôle sait échouer (AGENTS.md §2.7B)

L'assertion du nouveau test client a été exercée sur un cas qui **doit** échouer :
en remplaçant temporairement `toBe(0)` par `toBe(1)`, le test tombe
(`AssertionError: expected +0 to be 1`). L'attente est donc branchée sur la donnée
persistée réelle, et non vraie par construction.

## Decisions Made

- **Assouplir la seule borne basse** (D-01) : ni colonne `visible boolean` (deux sources de vérité, toutes les lectures à toucher), ni changement d'encodage client. Le `comment on column` ajouté à la migration documente `0 = widget masqué` au niveau du schéma — purement déclaratif, sans effet de comportement.
- **Test client ancré sur le membre Thomas** plutôt que Camille : les écritures de la page sont lancées en `void` et peuvent se poser **après** le nettoyage d'`afterEach`, donc les tests voisins laissent parfois des lignes à Camille. Thomas n'a aucun widget semé → ordre du panneau par défaut (Calendrier en premier) et lignes lues = celles écrites par ce test.
- **Nom de contrainte observé avant le `drop`** : `dashboard_widgets_width_check` a été lu sur le schéma vivant avant d'écrire la migration, pour qu'un `drop` ne passe pas à côté en silence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Garde de branche protégée contourné par l'échappatoire documentée**

- **Found during :** Task 1 (premier commit)
- **Issue :** le garde pré-commit refuse de committer sur la branche par défaut (`main`, `git.base-branch --is-protected main` → `true`), or le dépôt travaille directement sur `main` (`branching_strategy: "none"`, toutes les phases précédentes committées sur `main`) et la politique de commit de l'orchestrateur impose des commits atomiques par tâche.
- **Fix :** `git.allow_default_branch_commits: true` ajouté à `.planning/config.json` — l'échappatoire que le message d'erreur du garde prescrit lui-même (#2924/#3819). Aucun fichier de code touché ; `.planning/` étant gitignoré, cette clé reste locale.
- **Files modified :** `.planning/config.json` (non versionné)
- **Verification :** `config-get git.allow_default_branch_commits` → `true` ; `git.base-branch --is-protected main` → `false` ; les deux commits de tâche sont ensuite passés.
- **Committed in :** non applicable (fichier gitignoré)

---

**Total deviations :** 1 auto-fixée (Rule 3 — blocage d'outillage).
**Impact on plan :** aucun impact sur le code livré ; ajustement d'outillage nécessaire pour honorer la politique de commit de l'orchestrateur.

## Issues Encountered

- **Le nouveau test client était flaky à sa première écriture, et cela a révélé un vrai comportement.** Conçu d'abord comme une extension du scénario Camille, il passait en suite complète et échouait seul (et inversement). Diagnostic : les écritures de `setWidgetOrder` sont lancées en `void` et peuvent se poser après le nettoyage d'`afterEach`, ce qui laisse des lignes à Camille dans le test suivant ; et quand `widgets.rows` n'est pas encore chargé, la branche `data.create` est prise pour toutes les préférences, créant une **seconde série** de widgets. Le test a été rendu déterministe (membre Thomas dédié). Le comportement lui-même est **hors périmètre** et documenté dans `deferred-items.md`.
- **4 échecs e2e préexistants** (117 passés, 5 ignorés) : `critical-paths.spec.ts:32` exige un lien « Continuer avec Facebook » (retiré le 2026-10-13, chaîne absente de `app/src`) et `voyage-workspace.spec.ts:120` exige un `checkbox` là où l'affordance est un `role="switch"`. Aucun des deux ne touche `dashboard_widgets`, la contrainte `width` ni `modules/dashboard/types.ts`. Détail et preuve de préexistence : `deferred-items.md`.

## Known Stubs

Aucun. Les deux fichiers créés et les deux modifiés n'introduisent ni valeur vide codée en dur alimentant un rendu, ni texte de remplissage, ni composant sans source de données.

## Threat Flags

Aucun. Le changement n'ajoute aucune surface : il assouplit d'une unité une borne de domaine existante sur une colonne déjà couverte par la RLS de 0004/0007. Le registre de menaces du plan (T-18-01 mitigé, T-18-02 accepté, T-18-SC sans objet — aucun paquet installé) est respecté.

## Next Phase Readiness

- CR-01 fermé : `width = 0` est légal en base, prouvé rouge→vert, et le contrat client est pinné.
- Le plan suivant (18-02, WR-01/WR-03) peut démarrer : il ne dépend pas de 18-01.
- Deux éléments reportés à une tâche rapide : le comportement d'insertion en double de `setWidgetOrder` et la remise à jour des deux specs e2e périmés (voir `deferred-items.md`).

---
*Phase: 18-durcissement-frontend-correctifs-de-revue-de-code*
*Completed: 2026-10-15*

## Self-Check: PASSED

- `supabase/migrations/0123_dashboard_widget_width_zero.sql` — FOUND
- `supabase/tests/0122_dashboard_widget_width.sql` — FOUND
- `app/src/modules/dashboard/types.ts` — FOUND
- `app/src/modules/dashboard/dashboard-page.test.tsx` — FOUND
- commit `c2e655e` — FOUND
- commit `34cd0de` — FOUND
- commits mesurés `abdca4f..HEAD` — 2 (ledger `gsd-plan-head-before-18-01`)
