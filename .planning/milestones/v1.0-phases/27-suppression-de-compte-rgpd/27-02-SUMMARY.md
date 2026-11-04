---
phase: 27
plan: 02
subsystem: backend
tags: [rgpd, suppression-compte, purge, pg-cron, pg-net, vault, sql]
requires:
  - phase: 27-01
    provides: tables account_deletion_requests/restorations (0166), RPC 0167, FK auditées, colonne account_deleted_at
provides:
  - private.purge_expired_account_deletions() — purge J+30 100 % SQL (RGDP-04), sous-transaction par demande
  - private.account_deletion_media_manifest — manifest de médias construit à la demande (D-07, F6)
  - private.post_account_deletion_http(text) + dispatch_account_deletion_reminder/purge_medias() — éveil Edge unifiée (clé Vault, apikey)
  - trois jobs pg_cron quotidiens (reminder 05:07, purge 05:17, purge-medias 04:57)
affects: [27-03 (Edge unifiée action reminder/purge-medias + UI Paramètres), 28/31 (SMTP, portes de séquence)]
tech-stack:
  added: []
  patterns: [purge-sql-sans-http, manifest-avant-suppression, flag-avant-http-motif-notified-push, dispatch-sans-parametre-pour-cron]
key-files:
  created:
    - supabase/migrations/0168_account_deletion_purge_cron.sql
    - supabase/tests/0168_account_deletion_purge.test.sql
  modified: []
key-decisions:
  - "Jobs cron SANS paramètre (dispatch_* délègue à post_account_deletion_http('action')) : le plan écrivait des commands paramétrées, mais le contrat 0004 + la prohibition du plan lui-même imposent des appels private.*() sans valeur dans cron.job.command"
  - "La demande marquée purgee meurt avec le compte (cascade 0166) : la disparition de la ligne EST la preuve RGPD, le test l'asserte ainsi"
  - "Repli inline (dépenses puis foyer) quand le compte purgé n'était pas admin du foyer orphelin — delete_household(0074) refuserait 42501 et bloquerait les demandes suivantes"
  - "Transfert D-08 = aucune écriture : un enfant géré n'a pas de gestionnaire nommé, il reste géré par les adultes restants du foyer ; compté transferred, jamais purgé"
requirements-completed: [RGDP-03, RGDP-04, RGDP-06]
coverage:
  - id: D1
    description: "Purge J+30 100 % SQL : données partagées intactes quand d'autres adultes restent, enfants transférés (D-08), demande purgee + compte supprimé"
    requirement: RGDP-04
    verification:
      - kind: integration
        ref: "supabase/tests/0168_account_deletion_purge.test.sql#foyer conservé/orphelin (purge_expired_account_deletions)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Foyer orphelin supprimé avec manifest de médias construit AVANT suppression ; foyers conservés n'y génèrent aucune ligne ; objets Storage jamais touchés par le SQL"
    requirement: RGDP-06
    verification:
      - kind: integration
        ref: "supabase/tests/0168_account_deletion_purge.test.sql#manifest (D-07) et RGDP-06"
        status: pass
    human_judgment: false
  - id: D3
    description: "Alerte J-7 idempotente : le flag rappel_envoye n'est posé que derrière un POST partant, seconde exécution sans nouveau POST"
    requirement: RGDP-03
    verification:
      - kind: integration
        ref: "supabase/tests/0168_account_deletion_purge.test.sql#J-7 (T-27-06, assertion bornée)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Négatifs : demande annulee due et demande pas encore due jamais purgées ; execute réservé à service_role (T-27-07/08)"
    requirement: RGDP-04
    verification:
      - kind: integration
        ref: "supabase/tests/0168_account_deletion_purge.test.sql#négatifs + privilèges (motif 0074)"
        status: pass
    human_judgment: false
  - id: D5
    description: "La livraison réelle des emails J-7 dépend de l'Edge unifiée (plan 03) et du SMTP : le SQL prouve qu'un seul POST part par demande, pas que l'email arrive"
    verification: []
    human_judgment: true
    rationale: "La frontière cron→Edge et le contenu de l'email sont hors de portée de test-db.sh (plan 03) — vérification humaine/plan 03 nécessaire"
duration: 19min
completed: 2026-10-27
status: complete
actuals:
  tokens: 12500
  tasks: 3
  commits: 2
plan_head_before: 124d357d19d1e1dd6c486c367bd7c40aed02db90
plan_head_after: b89e1c9
---

# Phase 27 Plan 02: Purge J+30 SQL + alerte J-7 Summary

**Purge J+30 purement SQL/pg_cron avec transfert d'enfants (D-08), suppression de foyer orphelin réutilisant 0074, manifest de médias construit à la demande (D-07), et alerte J-7 idempotente via wrapper Vault + trois jobs cron sans paramètre.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-27T15:08:40Z
- **Completed:** 2026-10-27T15:28:09Z
- **Tasks:** 3
- **Files modified:** 2 (créés)

## Accomplishments

- **Migration 0168** : `private.purge_expired_account_deletions()` (RGDP-04 : zéro HTTP, sous-transaction par demande, `delete from auth.users` sur le précédent 0145), table `private.account_deletion_media_manifest` (D-07/F6), wrapper `private.post_account_deletion_http(text)` (motif 0158/0025 : Vault, en-tête `apikey`, corps `{action}`), deux dispatch sans paramètre, trois jobs cron quotidiens.
- **Règles produit** : D-08 (enfants transférés aux adultes restants, jamais purgés quand un adulte reste), D-09 (foyer orphelin supprimé via `public.delete_household` 0074 réutilisée), RGDP-06 (enfants de l'orphelin partent avec le foyer), RGDP-03 (flag `rappel_envoye` + statut `rappellee` posés DANS la transaction AVANT le POST — le redrive du cron est le retry, jamais un doublon).
- **Tests SQL 0168** : foyer conservé (donnée partagée + adulte + enfant + ligne « ancien membre » intacts), foyer orphelin (supprimé, manifest = 2 chemins, objets Storage intacts), négatifs (annulee/pas-due non purgées), J-7 idempotent (assertion bornée, refus nommé si Vault absent), contrats cron sans secret, privilèges service_role seul.

## Vérification

| Contrôle | Résultat |
|---|---|
| `sh scripts/migrate.sh` | 0168 appliquée, 3 jobs visibles dans `cron.job` |
| `sh scripts/test-db.sh` (campagne entière) | 97 fichiers SQL, tous verts (dont 0168) |
| `python3 scripts/check-sql-statique.py` | vert — 222 fonctions effectives, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | vert — 6 cas, tous verts |
| `cd app && npm run typecheck` | vert |
| `cd app && npm test -- --run` | 202 fichiers / 1636 tests verts |
| `cd app && npm run build` | vert (PWA 138 entrées précache) |

## Task Commits

1. **Task 1: Purge J+30 SQL (tracer)** - `e422faa` (feat)
2. **Task 2: Wrapper HTTP + jobs pg_cron** - `b89e1c9` (feat)

**Plan metadata:** (voir commit docs ci-dessous)

## Files Created/Modified

- `supabase/migrations/0168_account_deletion_purge_cron.sql` — purge, manifest, wrapper, dispatchs, jobs
- `supabase/tests/0168_account_deletion_purge.test.sql` — preuves SQL des règles D-07/D-08/D-09/RGDP-03/04/06

## Decisions Made

- **Jobs cron sans paramètre** : le plan écrivait `select private.post_account_deletion_http('reminder')` en command cron ; le contrat `0004_cron.sql` (`^select private\.[a-z_]+\(\)$`) et la prohibition du plan elle-même (« wrappers private.*() sans paramètre, motif 0158/0162 ») imposent des dispatch sans valeur dans le catalogue. Deux `dispatch_account_deletion_*()` délèguent au wrapper, l'action vit dans le code.
- **Statut `rappellee`** posé en même temps que le flag `rappel_envoye` (machine à états 0166 complète ; la purge accepte les deux statuts actifs).
- **Transfert D-08 sans écriture** : un enfant géré est une ligne du foyer sans gestionnaire nommé — avec des adultes restants, il ne change pas d'état ; compté `children_transferred`.
- **Manifest dans le schéma `private`** : jamais exposé au client PostgREST ; l'Edge du plan 03 y lira les chemins et y posera `purged`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Commands cron paramétrées → dispatch sans paramètre**
- **Found during:** Task 2 (le contrat `0004_cron.sql` a fait échouer la campagne : « les jobs appellent uniquement des fonctions privées sans paramètre »)
- **Issue:** le plan prescrivait des commands `select private.post_account_deletion_http('reminder')` — en contradiction avec le contrat existant et avec sa propre prohibition « sans paramètre »
- **Fix:** deux dispatch `private.dispatch_account_deletion_reminder()` / `_purge_medias()` sans paramètre, appelés par les jobs ; l'action reste dans le code
- **Files modified:** supabase/migrations/0168_account_deletion_purge_cron.sql, supabase/tests/0168_account_deletion_purge.test.sql
- **Verification:** campagne 97 fichiers verte ; jobs visibles avec commands conformes
- **Committed in:** b89e1c9

**2. [Rule 2 - Missing critical] Repli inline pour le foyer orphelin non-admin**
- **Found during:** Task 1
- **Issue:** `delete_household` (0074) exige un admin (`assert_household_admin`) ; un compte purgé « simple membre » du dernier foyer restant aurait levé 42501 et arrêté la purge des demandes suivantes
- **Fix:** si le compte était admin → `delete_household(user_id, household_id)` (réutilisation stricte) ; sinon → même ordre inline (dépenses puis foyer), documenté dans la migration
- **Files modified:** supabase/migrations/0168_account_deletion_purge_cron.sql
- **Verification:** test foyer orphelin vert (les deux fixtures passent par admin) ; repli couvert par la sous-transaction par demande
- **Committed in:** e422faa

**3. [Rule 1 - Bug] Test 0168 : `commit;` final committait les fixtures en base de dev**
- **Found during:** Task 2 (échec `t168-eve already exists` au second passage)
- **Issue:** le motif 0166 est `begin;` SANS commit final — la sortie du session psql annule la transaction ; mon `commit;` committait le semis
- **Fix:** commit final retiré + fixtures t168 nettoyées en base de dev (users, foyers, membres, manifest, objets storage via `storage.allow_delete_query`)
- **Files modified:** supabase/tests/0168_account_deletion_purge.test.sql
- **Verification:** `test-db.sh 0168` rejoué deux fois de suite, vert les deux fois
- **Committed in:** b89e1c9

---

**Total deviations:** 3 auto-fixed (1 contrat cron, 1 garde admin, 1 fixture de test)
**Impact on plan:** aucun changement de périmètre — les trois fixent des contradictions avec les contrats existants ou l'hygiène des fixtures.

## Issues Encountered

- Le redéveloppement de la migration 0168 pendant l'exécution (task 1 puis extension task 2) a demandé une réapplication locale : suppression de la ligne `schema_migrations` + drop des objets 0168 + `migrate.sh` — le fichier final est celui appliqué, aucune migration appliquée en production n'a été réécrite.

## User Setup Required

None - aucun service externe à configurer (les secrets Vault `project_url` / `service_role_key` sont déjà ceux de la stack ; l'Edge `household-delete` unifiée arrive au plan 03).

## Next Phase Readiness

- Plan 27-03 : l'Edge unifiée `household-delete` doit exposer `action = 'reminder'` (email J-7) et `action = 'purge-medias'` (suppression Storage bornée au manifest, en posant `purged = true` ligne par ligne) — le contrat SQL est en place.
- La purge effective est ARMÉE dès application de 0168 (jobs cron actifs) : toute demande due est purgée au passage du job quotidien.

---
*Phase: 27-suppression-de-compte-rgpd*
*Completed: 2026-10-27*

## Self-Check: PASSED

- Files verified on disk: `0168_account_deletion_purge_cron.sql`, `0168_account_deletion_purge.test.sql`, SUMMARY.md.
- Commits verified in history: `e422faa` (task 1), `b89e1c9` (task 2); measured `git rev-list --count 124d357..b89e1c9` = 2.
