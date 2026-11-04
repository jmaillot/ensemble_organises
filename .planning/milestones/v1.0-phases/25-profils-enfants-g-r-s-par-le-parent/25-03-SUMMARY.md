---
phase: 25-profils-enfants-g-r-s-par-le-parent
plan: 03
subsystem: backend
tags: [supabase, rls, sql, enfants-gérés, gardes-comportement]
requires:
  - "0144 (colonnes managed_child/managed_modules/deleted_at sur household_members)"
  - "0145 (invariant chk_members_managed_child + helpers is_managed_child d'observation)"
  - "25-02 (RPC de fiche D-01 sous le socle, migration 0145)"
affects:
  - "25-04 (push enfant D-23 consomme is_managed_child + managed_child_module_allowed)"
  - "25-05 (frontend : api.ts rebranche complete_routine_occurrence et les RPC de fiche)"
tech-stack:
  added: []
  patterns:
    - "le-comportement-vit-dans-la-migration-et-se-prouve-dans-la-suite-sql"
    - "oracle-par-SQLSTATE (22023/42501) pour les refus RPC ; testkit.affected pour les DELETE filtrés RLS"
    - "lecture des managed_modules DEPUIS LA LIGNE MEMBRE de l'enfant (D-05), jamais households"
key-files:
  created:
    - supabase/migrations/0146_child_behavior_guards.sql
    - supabase/tests/0146_child_behavior_guards.sql
  modified:
    - supabase/tests/0001_schema_contract.sql [Rule 3]
    - supabase/tests/_setup.sql (grant insert testkit.fx, approuvé par l'utilisatrice)
decisions:
  - "Gardes de module lues depuis la ligne membre (D-05) ; la seule liste fermée du fichier est le périmètre D-06 de update_managed_child_profile."
  - "Colonnes d'acteur ENF-03 en text (assigned_by_member_id, actor_member_id), écrites depuis auth.uid() résolu, jamais un paramètre client (T-25-11)."
  - "Refus adulte→adulte (D-13) et hors-module en forme « is not true », jamais de silent-no-op."
  - "Cercle : 3e branche DELETE adulte modère le contenu enfant (D-12) ; aucune voie INSERT/UPDATE/auto-suppression enfant."
  - "meal_entries : normalisation silencieuse par déclencheur (A3) ; conversations/birthdays : refus 22023."
  - "Contrat 0001 étendu par Rule 3 : assigned_by_member_id (tasks), actor_member_id (routine_completions), précédent 25-01 commit 9eaa643."
decisions-summary: >-
  Les gardes lisent managed_modules depuis la ligne membre (D-05) ;
  les colonnes d'acteur ENF-03 en text écrites depuis auth.uid() ;
  les refus sont des erreurs explicites (22023/42501), jamais un silent-no-op ;
  le contrat de schéma 0001 est étendu par Rule 3.
metrics:
  duration: "~1h35 (spawn → dernier commit de plan)"
  completed: 2026-10-25T19:34:00Z
  tasks: 2
  commits: 2
  plan_head_before: a7a669f43069666cdee0e9e9831dadd4e96edeb3
  plan_head_after: f849d81363c72d18a62d931b69c1ede835df8ab6
actuals:
  tokens: 17525
  tasks: 2
  commits: 2
  vs-estimate: "estimate 55000 → réalisé 17525 (sous l'estimation : la migration était déjà écrite au spawn, seule la boucle tests a coûté)"
status: complete
requirements: [ENF-02, ENF-03]
---

# Phase 25 Plan 03: Gardes de comportement des enfants gérés Summary

**Migration 0146** : gardes de module par enfant (D-05) sur les ensembles d'assignataires, RPC `complete_routine_occurrence` (délégation adulte→enfant, refus adulte→adulte D-13), colonnes d'acteur ENF-03 en text, 3e branche DELETE du Cercle (modération adulte D-12), normalisation `meal_entries.member_ids` (A3) et clauses D-06 conversations/birthdays — appliquée et prouvée par la suite SQL 0146 (10 sections, 60 assertions) verte.

## What was built

### Task 1 — Migration `0146_child_behavior_guards.sql` (commit `13961cd`)
- **Helpers** : `private.is_managed_child(member_id)` (vrai ssi `role='enfant'`, `user_id is null`, `deleted_at is null`) et `private.managed_child_module_allowed(member_id, module)` — lit `managed_modules` DE LA LIGNE MEMBRE de cet enfant (D-05), jamais `households`.
- **RPC de fiche D-01** : `create_managed_child_profile` / `update_managed_child_profile` / `archive_managed_child_profile` — tout adulte (`can_write_household`, D-03 : pas de propriété individuelle) ; archive = `deleted_at = now()`, jamais un delete (D-04) ; périmètre fermé des cinq modules D-06 dans update, refus-par-défaut.
- **Gardes d'assignation** : `replace_task_assignees` / `replace_routine_assignees` refusent (42501) l'assignation d'un enfant géré hors de SES `managed_modules`, admin inclus (T-25-07) ; les enfants du socle (taches+routines) restent assignables.
- **Complétion de routine** : `public.complete_routine_occurrence` (SECURITY DEFINER, types text) — cible = soi-même ou enfant géré du foyer, module exigé pour un enfant, refus adulte→adulte 42501 (D-13, forme « is not true »), upsert `on conflict (routine_id, occurrence_date)` sur la contrainte réelle `routine_completions_unique_occurrence` (T-25-08).
- **Colonnes d'acteur ENF-03** : `tasks.assigned_by_member_id` (écrite par replace_task_assignees depuis auth.uid() résolu) et `routine_completions.actor_member_id` (écrite par le RPC : `completed_by` = attributaire enfant, `actor_member_id` = acteur parent) — en **text**, jamais un paramètre client (T-25-11).
- **Cercle D-12** : troisième branche DELETE (`can_write_household AND is_managed_child(author_id)`) sur les politiques de `posts`, `post_comments`, `post_reactions` — un adulte (admin OU membre simple) modère le contenu d'un enfant ; INSERT/UPDATE intouchés, aucune auto-suppression enfant (T-25-09).
- **D-06 hors socle** : `create_conversation` (0041 recopiée-modifiée) refuse un enfant géré hors-module 'messages' (22023) ; déclencheur birthdays ('anniversaires', refus 22023) ; déclencheur `meal_entries` qui retire silencieusement les enfants hors-module 'menu' de `member_ids` (backstop A3) (T-25-16).

### Task 2 — Suite SQL `0146_child_behavior_guards.sql` (commit `f849d81`)
- **728 lignes, 17 do-blocs, 60 assertions** en 10 sections (a)–(j) :
  - **(a)** helpers observés sous postgres (vérité de table, security definer) ;
  - **(b)** RPC de fiche D-01 sous Bob (membre simple) : D-03 prouvée — tout adulte du foyer édite/archive une fiche créée par un autre ;
  - **(c)+(d)** garde d'assignation + `assigned_by_member_id` porté depuis la session ; un admin ne contourne pas le choix de la fiche ;
  - **(e)** complétion : délégation adulte→enfant (`completed_by` = Noé, `actor_member_id` = Bob), re-complétion ne duplique pas (on conflict prouvé), refus adulte→adulte 42501, hors-module 42501 (D-08/D-13/ENF-03) ;
  - **(f)** Cercle D-12 : membre simple non-auteur ET admin suppriment le post d'enfant (comptage eq) ; le post ADULTE reste protégé de la 3e branche (`testkit.affected = 0`) — oracles adaptés : un DELETE filtré par RLS ne lève pas, il n'affecte zéro ligne ;
  - **(g)** conversations : succès Bob+Noé (créateur inclus dans la liste), refus 22023 Lila hors-module, INSERT direct hors RPC refusé par le WITH CHECK RLS (42501) ;
  - **(h)** birthdays : refus 22023 hors-module, lien socle réussi ;
  - **(i)** meal_entries : Lila hors-module 'menu' retirée de `member_ids`, Noé (socle) conservé ;
  - **(j)** stub de rollback des objets 0146 (`drop ... cascade`), forme 0145.
- Fichiers d'appui : `_setup.sql` gagne `grant insert on testkit.fx to authenticated` (les tests enregistrent les ids créés sous rôle authentifié — **approuvé par l'utilisatrice**) ; `0001_schema_contract.sql` gagne les deux colonnes d'acteur (Rule 3).

### Validation (chaîne BLOCKING, dans l'ordre du plan)
1. `sh scripts/migrate.sh` → 0146 appliquée AVANT les vérifications (« 1 appliquée(s), 145 déjà connue(s) »).
2. `python3 scripts/check-sql-statique.py` → vert (208 fonctions / 146 migrations / 83 tests, aucun défaut) ; `python3 scripts/test-check-sql-statique.py` → 6 cas verts.
3. `sh scripts/test-db.sh 0146` → **vert** : `OK 0146_child_behavior_guards.sql — Tests SQL : 1 fichier(s), tous verts.`
4. `sh scripts/test-db.sh 0001` → vert (contrat de schéma à jour des deux colonnes).

Conventions respectées : SQL entièrement qualifié sous `search_path` vide, assertions bornées par foyer via les ids du fixture (`testkit.fx`), aucune tautologie, aucune donnée personnelle dans les erreurs (fixtures @example.fr uniquement), aucune directive de linter, aucune migration appliquée réécrite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Contrat de schéma 0001 non à jour** *(prévu par le plan, précédent 25-01 commit 9eaa643)*
- **Found during:** Task 2
- **Issue:** `supabase/tests/0001_schema_contract.sql` n'exposait pas les deux colonnes d'acteur posées par 0146.
- **Fix:** ajout de `'assigned_by_member_id'` à la ligne `tasks` (40) et `'actor_member_id'` à `routine_completions` (46) ; `test-db.sh 0001` vert.
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Commit:** f849d81

**2. [Rule 3 - Blocking] testkit.fx non inscriptible par authenticated** *(déviation non prévue, approuvée par l'utilisatrice)*
- **Found during:** Task 2
- **Issue:** Les tests créent des lignes sous rôle authentifié et doivent y enregistrer les ids dans `testkit.fx` (SELECT-only pour authenticated par design) ; sans le grant, les enregistrements échouent.
- **Fix:** `grant insert on testkit.fx to authenticated;` (une ligne). Impact : additif ; les autres suites résolvent leurs ids sous postgres et ne sont pas affectées (le rejet complet de la suite 0146 après le grant le confirme).
- **Files modified:** supabase/tests/_setup.sql
- **Commit:** f849d81

**3. [Rule 1 - Bug] create_conversation appelée sans son créateur**
- **Found during:** Task 2, itération rouge→vert de la section (g)
- **Issue:** le RPC 0041 exige que le créateur participe à sa conversation ; l'appel initial ne passait que Noé dans la liste.
- **Fix:** `to_jsonb(array[v_bob_m, v_noe_m])` (créateur Bob inclus) + oracles inchangés — conversation à 2 participants, assertions vertes.
- **Files modified:** supabase/tests/0146_child_behavior_guards.sql
- **Commit:** f849d81

## Known Stubs

Aucun — pas de stub, pas de `t.skip`/`test.todo`, aucune assertion tautologique (la sentinelle initiale a été retirée, `v_count` inutilisé supprimé).

## Threat Coverage

| Threat | Disposition | Où prouvé |
|---|---|---|
| T-25-07 (élévation, assignation hors-module) | mitigate | gardes replace_* — section (c), refus 42501 admin inclus |
| T-25-08 (élévation, complétion pour autrui) | mitigate | garde d'acteur complete_routine_occurrence — section (e), D-13 |
| T-25-09 (répudiation, modération Cercle) | mitigate | 3e branche DELETE — section (f), membre simple ET admin |
| T-25-11 (falsification, colonnes d'acteur) | mitigate | écrites depuis auth.uid(), jamais un paramètre — sections (d)/(e) |
| T-25-16 (élévation, placement hors socle) | mitigate | clauses D-06 — sections (g)/(h)/(i) |

## Next Steps

- **25-04** consomme `is_managed_child` + `managed_child_module_allowed` pour le push enfant (D-23).
- **25-05** rebranche le frontend : `routines/api.ts markOccurrenceDone` → `complete_routine_occurrence`, et les trois RPC de fiche dans `enfants/api.ts`.
- Pre-existing 0139 full-suite failure is NOT from this plan — deferred (see deferred-items.md).

## Self-Check: PASSED
- Commit `13961cd` FOUND in git log (Task 1, migration 0146)
- Commit `f849d81` FOUND in git log (Task 2, tests + contract + setup)
- Both artifacts exist on disk; final `sh scripts/test-db.sh 0146` rerun green.
- Test file verified: 728 lines, 17 do-blocks balanced, 60 assertions, 3 fixture emails only.
