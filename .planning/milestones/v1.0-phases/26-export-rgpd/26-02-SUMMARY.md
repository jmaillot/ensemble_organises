---
phase: 26-export-rgpd
plan: "02"
subsystem: database
tags: [gdpr, rgpd, sql, postgresql, cron, rls, storage]

requires:
  - phase: 26-export-rgpd
    plan: "01"
    provides: "26-SPEC-DECISION.md (portée Option A, fusion multi-foyers, 22 modules, limite 1 Go), verdicts A1/A2/A3 OK"

provides:
  - "Migration 0158 : bucket gdpr-exports (privé, scellé <user_id>/), table gdpr_export_jobs + index unique partiel D-06, table gdpr_export_purge_log, RPC request_gdpr_export/gdpr_export_extract_batch, fonction post_gdpr_export_http, jobs cron minute+quotidien"
  - "Tests 0158 : isolement RGEX-03 (comptages bornés, expect_denied), machine à états, lease 5 min, purge expires_at, cron installé, politique bucket scellée"
  - "Corrections 0159/0160 : wrappers sans paramètre (conformité test 0004), exemption gdpr_export_purge_log (test 0001), REVOKE/GRANT service_role"

affects:
  - 26-03
  - 26-04
  - 26-05

actuals:
  tokens: 62000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Job asynchrone multipasse piloté par pg_cron minute : lease (pass_started_at + grâce 5 min), statuts (en_attente/en_cours/pret/echec), curseur (cursor_module/cursor_offset), idempotence (index unique partiel)"
    - "Fonction d'éveil HTTP sans paramètre en clair : post_gdpr_export_http lit Vault, les wrappers dispatch_gdpr_export_run/purge délèguent (conformité test 0004 : jobs appellent private.*() sans paramètre)"
    - "Table d'audit serveur : RLS activée, ZÉRO politique client, exemption explicite dans test 0001 (motif household_invite_tokens, push_subscriptions)"

key-files:
  created:
    - supabase/migrations/0158_gdpr_export.sql
    - supabase/migrations/0159_gdpr_export_fixes.sql
    - supabase/migrations/0160_gdpr_export_privileges.sql
    - supabase/tests/0158_gdpr_export.sql
  modified:
    - supabase/tests/0001_schema_contract.sql

key-decisions:
  - "Squelette gdpr_export_extract_batch : signature et contrat figés, corps réservé au plan 26-03 Task 1 (extraction par module + liste médias)"
  - "Wrappers sans paramètre pour conformité test 0004 : dispatch_gdpr_export_run/purge délèguent à post_gdpr_export_http('run'/'purge') — jobs cron n'appellent QUE private.*() sans paramètre"
  - "gdpr_export_purge_log : RLS activée, ZÉRO politique client, exemption test 0001 — audit RGEX-04 lisible par la base/opérateur, jamais par navigateur"

patterns-established:
  - "Job multipasse : statuts (en_attente/en_cours/pret/echec), lease (pass_started_at + grâce), curseur (cursor_module/cursor_offset/staging_ready), redrive naturel par cron-minute"
  - "Déclenchement idempotent D-06 : index unique partiel (user_id) where status in ('en_attente','en_cours'), capture unique_violation, relecture de la ligne active"
  - "Corrections vers l'avant (§2.7A) : 0158 appliquée, 0159/0160 corrigent (jamais de réécriture), test 0001 mis à jour pour reconnaître la nouvelle exemption"

requirements-completed: [RGEX-01, RGEX-02, RGEX-03, RGEX-04]

coverage:
  - id: D1
    description: "Bucket gdpr-exports créé (privé, 1 Go, allowed_mime_types=['application/zip']), politique scellée sur préfixe <user_id>/"
    requirement: RGEX-01
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 7 (bucket exists, privé, limite 1 Go)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Table gdpr_export_jobs avec machine à états (en_attente/en_cours/pret/echec), index unique partiel D-06, RLS select propre uniquement"
    requirement: RGEX-02
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 1-2-4 (déclenchement idempotent, course concurrentielle 23505, statuts/lease)"
        status: pass
    human_judgment: false
  - id: D3
    description: "RPC request_gdpr_export : acteur résolu en SQL (auth.uid() jamais paramètre), idempotence D-06, éveil immédiat post_gdpr_export_http('run')"
    requirement: RGEX-03
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 1 (sans session 28000, idempotence, un seul job actif)"
        status: pass
    human_judgment: false
  - id: D4
    description: "RPC gdpr_export_extract_batch : squelette SECURITY DEFINER service_role uniquement, signature/contrat figés, corps réservé plan 26-03"
    requirement: RGEX-03
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 3c (refusée à authenticated 42501)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Isolement RGEX-03 : Bob (même foyer) ne voit pas le job d'Alice via RLS, Charlie (foyer voisin) non plus, politique bucket scellée par préfixe"
    requirement: RGEX-03
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 3 (comptages bornés §2.7D, expect_denied, politique scellée)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Fonction post_gdpr_export_http : Vault+pg_net (motif 0019), comptage conditionnel (ne POSTe que si job dû), actions 'run'/'purge'"
    requirement: RGEX-02
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 6 (aucune clé dans cron.job.command)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Jobs cron eo-gdpr-export-run (minute) et eo-gdpr-export-purge (quotidien 4h27), wrappers sans paramètre, REVOKE service_role"
    requirement: RGEX-04
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 6 (deux jobs installés, command ~ ^select private.*()$) + test 0004"
        status: pass
    human_judgment: false
  - id: D8
    description: "Table gdpr_export_purge_log : audit RGEX-04, RLS activée ZÉRO politique client, exemption test 0001"
    requirement: RGEX-04
    verification:
      - kind: integration
        ref: "supabase/tests/0001_schema_contract.sql#section 2 (exemption explicite gdpr_export_purge_log)"
        status: pass
    human_judgment: false
  - id: D9
    description: "Machine à états/lease : statuts valides CHECK, lease 5 min (pass_started_at), statuts terminaux libèrent l'index partiel D-06"
    requirement: RGEX-02
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 4 (statut inconnu 23514, lease récent non dû, dépassé dû, nouveau job après terminal)"
        status: pass
    human_judgment: false
  - id: D10
    description: "Purge : candidats (status in pret/echec, expires_at < now()) détectés, fonction de sélection testée"
    requirement: RGEX-04
    verification:
      - kind: integration
        ref: "supabase/tests/0158_gdpr_export.sql#section 5 (expires_at futur non candidat, dépassé candidat)"
        status: pass
    human_judgment: false

duration: ~14 min
completed: 2026-10-27
status: complete
plan_head_before: 9524e51b9b3e9f08de72a626db4b1a020d72175e
plan_head_after: b7f47aa
---

# Phase 26 Plan 02: SQL d'extraction RGPD Summary

**Socle SQL complet de l'export RGPD : bucket privé scellé, table de jobs avec machine à états multipasse, RPC d'extraction bornée au demandeur (RGEX-03), driver cron minute + purge quotidienne**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-10-27T07:32:15Z
- **Completed:** 2026-10-27T07:46:42Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Migration 0158 appliquée [BLOCKING] : bucket `gdpr-exports` (privé, 1 Go, politique scellée `<user_id>/`), table `gdpr_export_jobs` avec machine à états (en_attente/en_cours/pret/echec) + index unique partiel D-06 (un actif par membre), table `gdpr_export_purge_log` (audit RGEX-04)
- RPC `request_gdpr_export` : déclenchement idempotent, acteur résolu en SQL (`auth.uid()` jamais paramètre), capture `unique_violation` (course concurrentielle), éveil immédiat `post_gdpr_export_http('run')`
- RPC `gdpr_export_extract_batch` : squelette SECURITY DEFINER service_role uniquement, signature et contrat figés, corps réservé au plan 26-03 Task 1 (extraction par module + liste des médias)
- Fonction `post_gdpr_export_http` : Vault+pg_net (motif 0019), comptage conditionnel (ne POSTe que si job dû), actions 'run'/'purge'
- Jobs cron `eo-gdpr-export-run` (minute) et `eo-gdpr-export-purge` (quotidien 4h27 UTC+1/+2) : wrappers sans paramètre `dispatch_gdpr_export_run`/`dispatch_gdpr_export_purge` (conformité test 0004)
- Suite SQL 0158 verte (7 sections) : isolement RGEX-03 (comptages bornés §2.7D, `expect_denied` inter-foyers), machine à états/lease, purge `expires_at`, cron installé, politique bucket scellée
- Campagne SQL complète verte (92 fichiers) après corrections 0159/0160

## Task Commits

1. **Task 1: Migration 0158 + tests SQL 0158** - `b7f47aa` (feat) — contient aussi les corrections 0159/0160

**Plan metadata:** skipped (commit_docs disabled)

## Files Created/Modified

- `supabase/migrations/0158_gdpr_export.sql` - Bucket privé, table jobs, RPC déclenchement/extraction, fonction Vault+pg_net, jobs cron
- `supabase/migrations/0159_gdpr_export_fixes.sql` - Wrappers sans paramètre (conformité test 0004), réinstallation jobs cron
- `supabase/migrations/0160_gdpr_export_privileges.sql` - REVOKE/GRANT service_role sur les trois fonctions privées
- `supabase/tests/0158_gdpr_export.sql` - 7 sections (déclenchement, course, isolement RGEX-03, machine à états, purge, cron, bucket)
- `supabase/tests/0001_schema_contract.sql` - Exemption `gdpr_export_purge_log` (table audit serveur, ZÉRO politique client)

## Decisions Made

1. **Squelette RPC extraction** — `gdpr_export_extract_batch` : signature et contrat figés (user_id, module, rows, cursor_module, cursor_offset, done, media_paths), corps réservé au plan 26-03 Task 1. Le plan 26-03 remplit la logique d'extraction par module (22 modules de 26-SPEC-DECISION.md) sans toucher aux paramètres ni au retour.
2. **Wrappers sans paramètre** — Les jobs cron appellent `dispatch_gdpr_export_run()` et `dispatch_gdpr_export_purge()` (zéro paramètre) qui délèguent à `post_gdpr_export_http('run'/'purge')`. Conformité test 0004 lignes 182-189 : jobs n'appellent QUE `private.*()` sans paramètre (regex `^select private\.[a-z_]+\(\)$`), garantie qu'aucune valeur n'est recopiée dans `cron.job.command`.
3. **Table d'audit serveur** — `gdpr_export_purge_log` : RLS activée, ZÉRO politique client, exemption explicite dans test 0001 section 2 (motif existant : `household_invite_tokens`, `push_subscriptions`, `message_notifications`). Preuve RGEX-04 lisible par la base et l'opérateur, jamais par le navigateur.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrappers sans paramètre manquants (non-conformité test 0004)**
- **Found during:** Task 3 (suite SQL complète), test 0004_cron.sql lignes 182-189
- **Issue:** Les jobs cron `eo-gdpr-export-run` et `eo-gdpr-export-purge` appelaient `private.post_gdpr_export_http('run')` et `post_gdpr_export_http('purge')` avec un paramètre de chaîne. Le test 0004 impose que les jobs n'appellent QUE des fonctions privées SANS paramètre (regex `^select private\.[a-z_]+\(\)$`), garantie qu'aucune valeur n'est recopiée dans le catalogue.
- **Fix:** Création de deux fonctions wrapper sans paramètre `private.dispatch_gdpr_export_run()` et `private.dispatch_gdpr_export_purge()` qui délèguent à `post_gdpr_export_http`, puis réinstallation des jobs avec ces wrappers (migration 0159).
- **Files modified:** supabase/migrations/0159_gdpr_export_fixes.sql
- **Verification:** Suite SQL complète verte, test 0004 passe
- **Committed in:** b7f47aa (correction vers l'avant, §2.7A)

**2. [Rule 1 - Bug] Table sans politique RLS (non-conformité test 0001)**
- **Found during:** Task 3 (suite SQL complète), test 0001_schema_contract.sql lignes 188-201
- **Issue:** `gdpr_export_purge_log` a RLS activée mais ZÉRO politique — le test 0001 détecte cette incohérence. La table est une preuve RGEX-04 lisible par la base et l'opérateur, jamais par le navigateur.
- **Fix:** Ajout de `gdpr_export_purge_log` à la liste d'exemption dans test 0001 ligne 194 (motif existant : `household_invite_tokens`, `gift_list_invites`, `push_subscriptions`, `message_notifications`, `conversation_membership_periods`), et assertion explicite ligne 237 documentant la raison (audit serveur uniquement, preuve RGEX-04).
- **Files modified:** supabase/tests/0001_schema_contract.sql
- **Verification:** Suite SQL complète verte, test 0001 passe
- **Committed in:** b7f47aa

**3. [Rule 1 - Bug] Privilèges non révoqués (non-conformité test 0001 section 7 bis)**
- **Found during:** Task 3 (suite SQL complète), test 0001_schema_contract.sql lignes 447-577
- **Issue:** Les fonctions privées `post_gdpr_export_http`, `dispatch_gdpr_export_run`, `dispatch_gdpr_export_purge` restaient exécutables par authenticated/anon sans raison déclarée. Le test 0001 section 7 bis parcourt TOUTES les fonctions de `private` et refuse celles qui n'ont pas de REVOKE/GRANT explicites.
- **Fix:** Migration 0160 ajoute les REVOKE/GRANT explicites : `revoke all ... from public, anon, authenticated; grant execute ... to service_role` sur les trois fonctions.
- **Files modified:** supabase/migrations/0160_gdpr_export_privileges.sql
- **Verification:** Suite SQL complète verte, test 0001 section 7 bis passe
- **Committed in:** b7f47aa (correction vers l'avant, §2.7A)

---

**Total deviations:** 3 auto-fixed (1 conformité cron, 1 conformité RLS, 1 conformité privilèges)
**Impact on plan:** Tous les auto-fixes nécessaires pour conformité aux tests de contrat du dépôt. Aucun changement de portée — les corrections 0159/0160 assurent que 0158 respecte les conventions établies (jobs sans paramètre, tables audit exemptées, fonctions privées réservées). Corrections vers l'avant uniquement (§2.7A).

## Issues Encountered

- Suite SQL échouait initialement (2 fichiers sur 92) : test 0001 refusait `gdpr_export_purge_log` sans politique, test 0004 refusait les jobs cron avec paramètre. Résolu par corrections 0159/0160 vers l'avant.
- Aucune difficulté d'application : migrations 0158/0159/0160 appliquées sans erreur, objets créés (bucket, tables, RPC, jobs cron) vérifiés en base.

## User Setup Required

None — aucune configuration externe requise pour ce plan. Le socle SQL est complet ; les plans 26-03/26-04/26-05 consomment ces objets (Edge Functions, frontend, push).

## Next Phase Readiness

**26-03 (Edge Function + frontend)** est débloqué :
- Bucket `gdpr-exports` créé, politique scellée `<user_id>/` vérifiée
- Table `gdpr_export_jobs` prête, RPC `request_gdpr_export` fonctionnel
- RPC `gdpr_export_extract_batch` : signature figée, 26-03 Task 1 remplit le corps (extraction par module + liste médias)
- Jobs cron installés et vérifiés : `eo-gdpr-export-run` (minute), `eo-gdpr-export-purge` (quotidien)

**26-04 (notification push)** est préparé :
- Colonne `notified_push` sur `gdpr_export_jobs` prête pour le marquage
- Fonction `post_gdpr_export_http` réutilisable pour le scope push (26-04 ajoutera la branche 'export' à `due_push_notifications`)

**26-05 (panneau UI)** est préparé :
- RLS `gdpr_export_jobs_select_own` : le panneau lit ses propres jobs via TanStack Query
- RPC `request_gdpr_export` : le bouton "Exporter" appelle ce RPC, reçoit le job_id

Aucun bloqueur pour la suite de la phase 26.

## Self-Check

- [x] `supabase/migrations/0158_gdpr_export.sql` existe et appliquée (schema_migrations)
- [x] `supabase/migrations/0159_gdpr_export_fixes.sql` existe et appliquée
- [x] `supabase/migrations/0160_gdpr_export_privileges.sql` existe et appliquée
- [x] `supabase/tests/0158_gdpr_export.sql` existe
- [x] Bucket `gdpr-exports` créé (privé, 1 Go) : `SELECT id, public FROM storage.buckets WHERE id = 'gdpr-exports'` → 1 ligne
- [x] Tables créées : `SELECT tablename FROM pg_tables WHERE tablename IN ('gdpr_export_jobs', 'gdpr_export_purge_log')` → 2 lignes
- [x] Jobs cron installés : `SELECT jobname FROM cron.job WHERE jobname LIKE 'eo-gdpr-export-%'` → 2 lignes
- [x] Suite SQL 0158 verte : `sh scripts/test-db.sh 0158` → OK
- [x] Suite SQL complète verte : `sh scripts/test-db.sh` → 92 fichiers, tous verts
- [x] Commit : b7f47aa

## Self-Check: PASSED

---
*Phase: 26-export-rgpd*
*Completed: 2026-10-27*
