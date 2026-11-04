---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migration, household-members, managed-child]

requires:
  - phase: v0.9.0 (0140)
    provides: formalisme disabled_modules + helper immuable private.has_valid_module_keys + grants EXECUTE
  - phase: v0.9.0 (0002/0007)
    provides: table household_members (user_id nullable, role enfant) + politiques RLS admin-seules
provides:
  - household_members.managed_modules text[] NOT NULL, défaut socle D-06 '{taches,routines,anniversaires,menu}', CHECK chk_members_valid_modules (format, jamais un catalogue)
  - household_members.birth_date date nullable (D-05)
  - household_members.deleted_at timestamptz nullable (D-04, support archivage 0146)
  - re-grants idempotents EXECUTE sur private.has_valid_module_keys à authenticated/service_role
  - Tests SQL 0144 (socle, format, D-09, distinction RLS/contrainte) verts + preuve rouge par mutant
affects: [25-02 (0145 conversion/invariant), 25-03 (0146 gardes lisant managed_modules), 25-05 (frontend fiche enfant), phase 27 (RGDP purge)]

tech-stack:
  added: []
  patterns:
    - "Formalisme 0140 appliqué au niveau membre : colonne text[] + CHECK via helper immuable + re-grants idempotents"
    - "Contrat de schéma 0001 mis à jour dans le même commit que la migration (précédent 0140)"

key-files:
  created:
    - supabase/migrations/0144_managed_child_schema.sql
    - supabase/tests/0144_managed_child_schema.sql
  modified:
    - supabase/tests/0001_schema_contract.sql

key-decisions:
  - "Restriction par module portée par la ligne household_members (managed_modules), jamais par households — D-05 par enfant"
  - "CHECK de FORMAT uniquement (private.has_valid_module_keys de 0140 réutilisée, jamais recréée) : la validité sémantique du catalogue reste côté client (0140:22-24)"
  - "Invariant enfant-⟺-sans-session volontairement ABSENT de 0144 : il rejoint en 0145 après la conversion (les lignes héritées enfant-avec-compte le violeraient avant)"
  - "Aucune contrainte d'unicité (household_id, display_name) — D-09 permet les doublons, prouvé par test"

requirements-completed: [ENF-01]

coverage:
  - id: D1
    description: "Colonne household_members.managed_modules text[] NOT NULL avec défaut socle D-06 '{taches,routines,anniversaires,menu}' et CHECK chk_members_valid_modules (format via private.has_valid_module_keys)"
    requirement: ENF-01
    verification:
      - kind: integration
        ref: "supabase/tests/0144_managed_child_schema.sql#(a) défaut socle + (d) rejets format"
        status: pass
      - kind: other
        ref: "information_schema.columns + pg_constraint probe (défaut '::text[]', conname chk_members_valid_modules)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Colonnes household_members.birth_date (date, nullable) et household_members.deleted_at (timestamptz, nullable) posées"
    requirement: ENF-01
    verification:
      - kind: integration
        ref: "supabase/tests/0144_managed_child_schema.sql#(b) birth_date + (c) deleted_at"
        status: pass
      - kind: other
        ref: "information_schema.columns probe (date/timestamptz, nullable=YES)"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-09 : noms de fiches enfants en doublon permis (aucune contrainte d'unicité sur household_id+display_name)"
    requirement: ENF-01
    verification:
      - kind: integration
        ref: "supabase/tests/0144_managed_child_schema.sql#(e) doublon D-09 accepté"
        status: pass
    human_judgment: false
  - id: D4
    description: "Distinction affected=0 (update filtré par la RLS, membre non-admin) vs expect_denied (erreur de contrainte) prouvée — jamais l'inverse"
    requirement: ENF-01
    verification:
      - kind: integration
        ref: "supabase/tests/0144_managed_child_schema.sql#(f) refus silencieux RLS + intégrité après refus"
        status: pass
    human_judgment: false
  - id: D5
    description: "La validité sémantique de managed_modules reste côté client : une clé bien formée hors catalogue ('module_future') est acceptée par la base"
    requirement: ENF-01
    verification:
      - kind: integration
        ref: "supabase/tests/0144_managed_child_schema.sql#(d) acceptation clé hors catalogue"
        status: pass
    human_judgment: false
  - id: D6
    description: "Le contrat de nommage 0001 nomme les trois colonnes (le §1 refuse toute colonne non déclarée)"
    verification:
      - kind: integration
        ref: "supabase/tests/0001_schema_contract.sql (vert après mise à jour)"
        status: pass
    human_judgment: false

duration: 23 min
completed: 2026-10-25
status: complete
actuals:
  tokens: 4850
  tasks: 2
  commits: 3
plan_head_before: 680b774fd80dce9c15d8918f4e327f32c9aec6b9
plan_head_after: 9eaa643
---

# Phase 25 Plan 01: Socle schématique enfant Summary

**Migration 0144 : managed_modules (socle D-06 par enfant, CHECK de format via 0140), birth_date et deleted_at sur household_members, tests SQL complets avec preuve rouge par mutant**

## Performance

- **Duration:** 23 min
- **Started:** 2026-10-25T16:09:20Z
- **Completed:** 2026-10-25T16:32:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Migration 0144 appliquée : managed_modules text[] NOT NULL défaut '{taches,routines,anniversaires,menu}' avec CHECK chk_members_valid_modules (réutilisation de private.has_valid_module_keys de 0140, jamais recréée), birth_date date NULLABLE, deleted_at timestamptz NULLABLE — le tout sur household_members (D-05 par enfant, PAS sur households, vérifié : 0 colonne managed_modules sur households)
- Tests SQL 0144 verts : défaut socle par enfant, birth_date/deleted_at écrits et relus, rejets de format en 23514 ('Taches', 'module-inconnu', doublon), acceptation d'une clé bien formée hors catalogue (validité sémantique côté client), D-09 doublons acceptés, distinction affected=0 (RLS) vs expect_denied (contrainte) prouvée
- Preuve rouge par mutant : avec un socle attendu volontairement faux, la suite échoue (« attendu 1, obtenu 0 ») — les assertions vérifient réellement la base
- Re-grants idempotents EXECUTE sur private.has_valid_module_keys (piège 4 : une CHECK s'évalue avec le rôle qui écrit)
- Contrat de schéma 0001 mis à jour (nommage des 3 colonnes, précédent 0140)

## Task Commits

Chaque tâche a été commitée atomiquement :

1. **Task 1: Migration 0144** - `680b774` (feat) — commit de la session exécuteur précédente, vérifié contre les critères d'acceptation (colonnes, contrainte, grants, table cible) AVANT de poursuivre
2. **Task 2: Tests SQL 0144 + chaîne de validation** - `e6be8ea` (test)
3. **Task 2 fix (Rule 3): contrat 0001 nomme les colonnes enfant** - `9eaa643` (test)

**Plan metadata:** voir commit final docs(25-01)

## Files Created/Modified
- `supabase/migrations/0144_managed_child_schema.sql` — 3 colonnes + CHECK de format + re-grants (83 lignes)
- `supabase/tests/0144_managed_child_schema.sql` — 248 lignes, 17 assertions testkit
- `supabase/tests/0001_schema_contract.sql` — household_members : +managed_modules, birth_date, deleted_at

## Decisions Made
- managed_modules vit sur la ligne membre (D-05), jamais sur households — la base de données le prouve (0 colonne sur households)
- CHECK de format uniquement ; pas de catalogue codé en dur dans la contrainte (la base ne connaît pas la liste des espaces)
- L'invariant (user_id IS NULL) = (role = 'enfant') n'est PAS ajouté en 0144 (interdit par le plan : il rejoint en 0145)
- Aucune politique RLS nouvelle — les colonnes suivent les politiques 0007 existantes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Test (f) manquant : la distinction RLS/contrainte était documentée mais jamais exercée**
- **Found during:** Task 2 (relecture du fichier non commité de la session interrompue)
- **Issue:** L'en-tête du fichier promettait une section (f) « affected=0 pour un UPDATE filtré par la RLS vs expect_denied pour une contrainte » — exigence explicite du plan — mais aucune assertion ne l'exerçait
- **Fix:** Ajout d'un membre non-admin (bob), assertion affected=0 sur son update filtré, puis preuve d'intégrité (les fiches gardent leurs valeurs, rien ne porte 'courses') ; ligne PREUVE ROUGE ajoutée
- **Files modified:** supabase/tests/0144_managed_child_schema.sql
- **Verification:** test-db.sh 0144 vert ; mutant détecté
- **Committed in:** e6be8ea

**2. [Rule 3 - Blocking] Le contrat de schéma 0001 refuse les nouvelles colonnes**
- **Found during:** Task 2 (suite complète test-db.sh)
- **Issue:** 0001 §1 vérifie l'inventaire EXACT des colonnes — les 3 nouvelles colonnes de 0144 faisaient échouer le contrat (« colonnes inattendues »)
- **Fix:** Ajout de managed_modules, birth_date, deleted_at à la ligne household_members de 0001 (même geste que le commit 0140 pour disabled_modules)
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Verification:** test-db.sh 0001 vert
- **Committed in:** 9eaa643

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Les deux corrections nécessaires à la validité de la suite SQL. Aucune expansion de périmètre.

## Issues Encountered

- **0139 (préexistant, hors périmètre, NON corrigé) :** la suite complète `sh scripts/test-db.sh` échoue sur `0139_shopping_item_order.sql` — « le backfill a.numéroté les quatre articles (attendu 4, obtenu 5) ». `private.backfill_shopping_item_positions()` opère sur toute la table et renvoie un row_count global ; l'assertion n'est pas bornée au foyer du fixture (AGENTS.md §2.7 D-2) et la base de dev contient 1 article réel. Défaut latent introduit par `4450bc2` (v0.9.0), déclenché par des données réelles, sans lien avec 0144. Consigné dans `deferred-items.md` (phase 25) et WINDOWS.md (entrée ouverte). Sur une base sans article réel, 0139 reste vert ; `test-db.sh 0144` et `0001` sont verts isolément.
- Le serveur de testkit a nécessité un nettoyage manuel après la preuve rouge par mutant (le pipeline fermé a interrompu la transaction avant le cleanup — `drop schema testkit cascade` exécuté, vérifié absent ensuite, zéro pollution t144).

## User Setup Required

None - aucune configuration de service externe requise.

## Next Phase Readiness
- Socle 0144 en place : 25-02 (0145, conversion + invariant) peut s'exécuter — les colonnes qu'il consomme existent
- 25-03 (0146) lira managed_modules depuis la ligne membre : la colonne est posée
- Aucun bloqueur pour la suite ; l'échec préexistant de 0139 n'impacte pas les migrations 0145-0148 (il ne concerne que son propre fichier de test)

---
*Phase: 25-profils-enfants-g-r-s-par-le-parent*
*Completed: 2026-10-25*

## Self-Check: PASSED

- Fichiers créés vérifiés sur disque : 0144 migration, 0144 tests, 0001 modifié, SUMMARY, deferred-items — tous présents
- Commits vérifiés dans l'historique : 680b774 (task 1, session précédente), e6be8ea (task 2), 9eaa643 (fix Rule 3)
- Vérifications du plan rejouées : migrate.sh exit 0 ; test-db.sh 0144 vert ; test-db.sh 0001 vert ; check-sql-statique + test-check-sql-statique verts ; 3 colonnes sur household_members, 0 sur households ; git status migrations ne montre que 0144 (déjà appliqué)
- Preuve rouge par mutant : le défaut socle faux est attrapé (« attendu 1, obtenu 0 »)
- Base laissée propre : pas de schéma testkit résiduel, pas de lignes t144
- Note : `requirements mark-complete ENF-01` a été appliqué puis ANNULÉ — la porte shared-ID (#2388) s'applique : le plan 25-06 déclare aussi ENF-01 sans SUMMARY ; ENF-01 sera marqué Complete par le dernier plan déclarant à finir
