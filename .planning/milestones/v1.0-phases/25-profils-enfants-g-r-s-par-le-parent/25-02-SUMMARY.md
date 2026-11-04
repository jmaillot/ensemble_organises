---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 02
subsystem: database
tags: [postgres, supabase, migration, managed-child, conversion, invariant, rls]

requires:
  - phase: 25-01 (0144)
    provides: household_members.managed_modules/birth_date/deleted_at — le socle que la conversion préserve (D-04)
  - phase: 0017/0036
    provides: définitions EFFECTIVES de redeem_household_invite_token et set_member_role, recopiées et refermées
  - phase: 0002/0009
    provides: cascades FK auth.users (ordre update-avant-delete) + grants EXECUTE service_role
provides:
  - public.convert_managed_children_to_profiles() returns jsonb — RPC SECURITY DEFINER, service_role seul, garde d'acteur 42501, verrou for update, exclusion multi-foyer, rapport converted/skipped
  - Invariant chk_members_managed_child CHECK ((user_id is null) = (role = 'enfant')) sur household_members (D-17, filet final 23514)
  - redeem_household_invite_token refermé (D-17a) : p_role='enfant' → 22023 ; set_member_role refermé (D-17b) : enfant sur membre-avec-compte → 22023
  - Conversion des enfants-avec-compte exécutée à l'application (self-call QO-5), sonde A1/A2 prouvée sur la base de dev
  - Tests SQL 0145 verts (conversion, refus 42501 double barrière, refus 22023, multi-foyer skipped, ré-invariant)
affects: [25-03 (0146 gardes lisant managed_modules), 25-04/25-05 (frontend), phase 27 (RGDP purge — lignes enfants désormais sans compte)]

tech-stack:
  added: []
  patterns:
    - "Fermeture de chemins par create or replace function recopié de la définition EFFECTIVE (0017, pas 0006) — correction vers l'avant, jamais réécriture d'une migration appliquée"
    - "RPC destructif service_role-seul avec double barrière (grant + garde runtime auth.uid() → 42501) et rapport jsonb de soi"
    - "Semis d'un état hérité interdit par un invariant : drop constraint en test, semis, conversion, re-création prouvée"

key-files:
  created:
    - supabase/migrations/0145_convert_managed_children.sql
    - supabase/tests/0145_convert_managed_children.sql
  modified: []

key-decisions:
  - "D-18 approuvée le 2026-10-25 — la conversion supprime réellement les comptes auth.users des enfants gérés (opération à sens unique)"
  - "Définition effective recopiée depuis 0017 (elle corrige 0006 cité par le plan) : seule la mapping du rôle enfant devient un refus, le reste du corps byte-identique (preuve par diff)"
  - "Oracle 22023 du chemin invitation testé sous service_role (l'appelant Edge légitime) : sous authenticated, l'appel échoue au privilège (42501, 0009) sans atteindre l'oracle — les deux refus sont testés"
  - "Ordre interne du RPC : update user_id=NULL AVANT delete profiles puis auth.users — l'inverse laisserait la cascade 0002 détruire la ligne membre et l'historique D-04"

requirements-completed: [ENF-04, ENF-01]

coverage:
  - id: D18
    description: "Décision irréversible D-18 : suppression réelle des comptes auth.users des enfants gérés, approuvée explicitement avant toute écriture"
    requirement: ENF-04
    verification:
      - kind: human
        ref: "approbation checkpoint du 2026-10-25 (formulation consignée ci-dessous)"
        status: pass
    human_judgment: true
  - id: D15
    description: "Conversion totale en une migration : RPC + self-call, rapport converted/skipped, exclusion multi-foyer"
    requirement: ENF-04
    verification:
      - kind: integration
        ref: "supabase/tests/0145_convert_managed_children.sql#(b) converted=1 + (d) skipped=1"
        status: pass
      - kind: other
        ref: "sh scripts/migrate.sh — sonde A1 (delete auth.users) et A2 (aucune FK non-cascade) prouvées à l'application"
        status: pass
    human_judgment: false
  - id: D16
    description: "Suppression réelle du compte (profiles + auth.users), ordre update-avant-delete, ligne membre conservée à l'identique"
    requirement: ENF-04
    verification:
      - kind: integration
        ref: "supabase/tests/0145_convert_managed_children.sql#(b) profiles/auth.users purgés, ligne membre et assignation de tâche intactes"
        status: pass
    human_judgment: false
  - id: D17a
    description: "Chemin invitation fermé : redeem_household_invite_token refuse p_role='enfant' (22023)"
    requirement: ENF-04
    verification:
      - kind: integration
        ref: "supabase/tests/0145_convert_managed_children.sql#(e) 42501 sous authenticated + 22023 sous service_role"
        status: pass
    human_judgment: false
  - id: D17b
    description: "Chemin rôle fermé : set_member_role refuse de transformer un membre-avec-compte en enfant géré (22023) ; invariant CHECK en filet final"
    requirement: ENF-04
    verification:
      - kind: integration
        ref: "supabase/tests/0145_convert_managed_children.sql#(f) 22023 nommant le compte + (c) ré-invariant avant/après multi-foyer"
        status: pass
    human_judgment: false
  - id: T2503
    description: "T-25-03 : double barrière sur le RPC de conversion (revoke public/anon/authenticated + grant service_role + garde runtime)"
    requirement: ENF-04
    verification:
      - kind: integration
        ref: "supabase/tests/0145_convert_managed_children.sql#(a) 42501 par le grant ET 42501 par la garde ('service' nommé)"
        status: pass
    human_judgment: false

duration: 52 min
completed: 2026-10-25
status: complete
actuals:
  tokens: 8754
  tasks: 3
  commits: 2
plan_head_before: 2164ebc817d229b6ab9ddda3cdfdc4fe54f5e68d
plan_head_after: aceaad8956a87777c27dc7aececa52bca9aa66c3
---

# Phase 25 Plan 02: Conversion des comptes enfants Summary

**Migration 0145 : RPC de conversion des enfants-avec-compte en profils gérés (service_role seul, double barrière 42501, exclusion multi-foyer, update-avant-delete), invariant chk_members_managed_child, chemins invitation et rôle refermés (22023), tests SQL verts avec oracles SQLSTATE**

## Décision D-18 (consignée)

Approbation explicite obtenue le **2026-10-25** (checkpoint Task 1, jamais auto-approuvable), formulation exacte :

> « approuvé, je mettrai un rôle adolescent ensuite, qui créera un compte ou l'enfant (ado) pourra se connecter »

La seconde partie de la formulation (« rôle adolescent avec compte propre ») est une **piste produit future signalée à l'approbation** — elle n'ouvre AUCUNE exception dans 0145 : aucun nouveau rôle, aucun affaiblissement d'invariant, aucune voie de recréation d'enfant-avec-compte. Si cette piste est retenue un jour, elle passera par ses propres décisions et migrations.

## Performance

- **Duration:** 52 min
- **Started:** 2026-10-25T17:10:39Z
- **Completed:** 2026-10-25T18:03:07Z
- **Tasks:** 3 (1 checkpoint décision + 2 auto)
- **Files created:** 2

## Accomplishments
- **RPC `public.convert_managed_children_to_profiles()`** (forme servante 0132) : garde d'acteur `auth.uid() → 42501` (défense en profondeur), verrou pessimiste `for update` ordonné, exclusion multi-foyer (un id aussi adulte ailleurs → `skipped`, compte préservé), `update user_id=null` sur TOUTES les lignes enfant-avec-compte AVANT `delete profiles` puis `delete auth.users` (ordre D-04 obligatoire, cascade 0002:47), rapport `jsonb` converted/skipped, idempotent (T-25-06)
- **Privilèges** : revoke public/anon/authenticated + grant `service_role` seul — double barrière avec la garde runtime (T-25-03)
- **Self-call par la migration** (QO-5) : la conversion s'exécute à l'application ; les sondes A1 (delete auth.users par le propriétaire) et A2 (aucune FK non-cascade — seul `households.created_by on delete set null` existe, non bloquant) sont prouvées par le passage de `migrate.sh`
- **Chemin invitation fermé (D-17a)** : `redeem_household_invite_token` refuse `p_role='enfant'` (22023, message « un enfant est créé par un parent depuis les paramètres du foyer ») ; corps recopié de 0017 byte-identique hormis le mapping devenu refus (preuve par diff)
- **Chemin rôle fermé (D-17b)** : `set_member_role` refuse `enfant` sur une ligne porteuse de compte (22023, « un membre disposant d''un compte ne peut pas devenir un enfant géré »), garde insérée après la protection du dernier admin ; corps recopié de 0036 byte-identique hormis la garde (preuve par diff)
- **Invariant `chk_members_managed_child`** posé EN DERNIER (après conversion et fermetures) + preuve de soi via `pg_constraint` + `comment on constraint`
- **Tests SQL 0145 verts** : 42501 par le grant ET par la garde, converted=1/skipped=0, ligne membre et assignation de tâche intactes, profiles/auth.users purgés, ré-invariant avant et après le scénario multi-foyer, skipped=1/converted=0 avec compte et profil survivants, 22023 nommant l'enfant (invitation) et le compte (rôle), Bob inchangé après refus

## Task Commits

1. **Task 2: Migration 0145** — `21cc7ef` (feat)
2. **Task 3: Tests SQL 0145 + chaîne BLOCKING** — `aceaad8` (test)

(Task 1 = checkpoint décision D-18, approuvé et consigné ci-dessus, aucun commit.)

**Plan metadata:** voir commit final docs(25-02)

## Files Created
- `supabase/migrations/0145_convert_managed_children.sql` — 390 lignes : RPC + grants + self-call + 2 fermetures + invariant
- `supabase/tests/0145_convert_managed_children.sql` — 402 lignes : 7 sections (a)-(f) + pré-assertions, oracles SQLSTATE forme 0051

## Validation (périmètre : 0145)

Chaîne BLOCKING passée dans l'ordre, Docker DISPONIBLE :
- `sh scripts/migrate.sh` — 0145 appliquée sans erreur (sondes A1/A2 levées)
- `python3 scripts/check-sql-statique.py` — vert (199 fonctions, 145 migrations, 82 tests, aucun défaut)
- `python3 scripts/test-check-sql-statique.py` — 6 cas, tous verts
- `sh scripts/test-db.sh 0145` — vert

Note de périmètre : la validation SQL est scopée à `test-db.sh 0145` (instruction héritée du plan). La suite complète comporte un échec PRÉEXISTANT sur `0139` (consigné dans `deferred-items.md` et WINDOWS.md, sans lien avec 0145) ; cette campagne ne l'a pas touché.

## Deviations from Plan

### Clarifications (choix documentés, conformes à l'intention)

**1. Source de la définition recopiée : 0017, pas 0006**
- **Found during:** Task 2
- **Issue:** Le plan citait `0006_security_helpers.sql` comme source de `redeem_household_invite_token`, mais 0017 la corrige (désactivation illusoire retirée, désactivation réelle confiée à `private.prune_expired_invite_tokens`). « Ce qui compte, c'est la définition effective d'une fonction : la dernière, celle que la base contient » (AGENTS.md §2.7 A)
- **Fix:** Corps recopié depuis 0017 ; preuve par `diff` que seuls le mapping→refus et des commentaires diffèrent
- **Committed in:** 21cc7ef

**2. Oracle 22023 de l'invitation testé sous service_role**
- **Found during:** Task 3 (préparation des tests)
- **Issue:** Le plan disait « sous as_user(parent) … oracle 22023 », mais authenticated n'a pas d'EXECUTE sur cette fonction (0009) : l'appel y échouerait au privilège (42501) sans jamais atteindre le refus métier
- **Fix:** 22023 testé sous `service_role` (l'appelant Edge légitime, `p_user_id` non nul) ET le refus 42501 d'authenticated est en outre affirmé — les deux barrières sont prouvées
- **Committed in:** aceaad8

### Auto-fixed Issues

**1. [Rule 1 - Bug] testkit inaccessible à service_role (pas d'USAGE sur le schéma)**
- **Found during:** Task 3 (première passe de test-db.sh 0145 — rouge attendu sur fichier neuf)
- **Issue:** Les do-blocs sous `set local role service_role` appelaient `testkit.ok` à l'intérieur : `permission denied for schema testkit` (le grant d'usage ne vise qu'anon/authenticated)
- **Fix:** Les refus sont capturés dans des variables (SQLSTATE + sqlerrm) sous service_role, `reset role`, PUIS affirmés via testkit
- **Files modified:** supabase/tests/0145_convert_managed_children.sql
- **Verification:** test-db.sh 0145 vert
- **Committed in:** aceaad8

---

**Total deviations:** 2 clarifications documentées + 1 auto-fix (Rule 1). Aucune expansion de périmètre.

## Known Stubs

None — aucun stub, aucun placeholder dans les deux fichiers créés.

## Next Phase Readiness
- Invariant actif et prouvé sur les données converties : 25-03 (0146) peut poser les gardes d'archivage lisant `managed_modules`
- La base de développement ne porte aucun enfant-avec-compte : le modèle géré est désormais le SEUL état possible (CHECK + chemins fermés)
- La phase 27 (RGDP purge) opérera sur des lignes enfants sans compte — plus aucune interaction avec auth.users pour les enfants
- Aucun bloqueur pour la suite ; l'échec préexistant de 0139 n'impacte pas les migrations 0146-0148

---
*Phase: 25-profils-enfants-g-r-s-par-le-parent*
*Completed: 2026-10-25*

## Self-Check: PASSED

- Fichiers créés vérifiés sur disque : migration 0145, tests 0145, SUMMARY — tous présents
- Commits vérifiés dans l'historique : `21cc7ef` (task 2), `aceaad8` (task 3) — 2 commits mesurés depuis le registre `2164ebc`
- Chaîne BLOCKING rejouée dans l'ordre : migrate.sh (sondes A1/A2), check-sql-statique, test-check-sql-statique, test-db.sh 0145 — tous verts
- Base laissée propre : 0 enfant-avec-compte, contrainte chk_members_managed_child présente, aucun schéma testkit résiduel (rollback test-db.sh)
- Périmètre de validation dit : scoped test-db.sh 0145 ; échec préexistant 0139 non touché, non contourné, déjà consigné
