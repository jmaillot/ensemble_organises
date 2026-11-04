---
phase: 27-suppression-de-compte-rgpd
plan: 04
gap_closure: true
subsystem: sql-rgpd
tags: [rgpd, suppression-compte, postgres, multi-foyer, instantané]
requires: [migrations 0166-0169, phase 25 (0145/0150), Edge household-delete]
provides:
  - table private.account_deletion_restoration_members (instantané par ligne membre)
  - request/cancel_account_deletion réécrites multi-foyer (CR-02 fermé)
  - manifest de médias avec bucket_id + claim enrichi (WR-02 fermé côté SQL)
affects: [Edge household-delete (27-05 : purge par bucket exact), panneau RGPD]
tech-stack:
  added: []
  patterns: [instantané par ligne enfant, unique élargi anti-jumeaux cross-bucket, vérités en comment on]
key-files:
  created:
    - supabase/migrations/0170_account_deletion_multifoyer_snapshot.sql
    - supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql
  modified:
    - supabase/tests/0169_account_deletion_manifest_rpc.test.sql
    - app/src/types/database.ts
key-decisions:
  - member_row_id/household_id en text (clés effectives de household_members/households, 0002) — même correction de supposition uuid que 0166
  - FK member_row_id → household_members on delete cascade (un instantané sans ligne à restaurer n'a plus de sens, et ne doit jamais bloquer la purge d'un foyer orphelin)
  - unicité du manifest élargie à (household_id, storage_path, bucket_id) — sinon le on conflict do nothing réintroduisait la confusion cross-bucket que bucket_id devait lever
  - re-demande avec demande encore active (surface déjà déshumanisée) : instantanés parent et par ligne conservés, jamais re-snapshotés
requirements-completed: [RGDP-02, RGDP-03, RGDP-04]
duration: ~50 min
completed: 2026-10-27
status: complete
actuals:
  tokens: 58000
  tasks: 3
  commits: 2
plan_head_before: c58fc102f07e5137e842b36da9258a8b07a39ff4
plan_head_after: cd4c55d
coverage:
  - deliverable: restauration multi-foyer exacte (CR-02)
    verification:
      - kind: test
        ref: supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql#1-2 (trois foyers, noms/avatars distincts, restauration exacte par foyer)
        status: pass
    human_judgment: false
  - deliverable: avatar NULL restauré comme NULL
    verification:
      - kind: test
        ref: supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql#2 (foyer gamma)
        status: pass
    human_judgment: false
  - deliverable: claim porte bucket_id, jumeaux cross-bucket distingués
    verification:
      - kind: test
        ref: supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql#4-5
        status: pass
    human_judgment: false
  - deliverable: vérités WR-01/WR-03 en commentaires (best-effort J-7, aucun filtre account_deleted_at)
    verification:
      - kind: command
        ref: comment on column/function posés par 0170 (vérifiés en base via migrate.sh)
        status: pass
    human_judgment: true
    rationale: la véracité d'un commentaire est un jugement de relecture — les libellés suivent 27-REVIEW-DISPOSITION §WR-01/WR-03
---

# Phase 27 Plan 04 : Instantané multi-foyer + bucket_id manifest Summary

Instantané de restauration PAR LIGNE household_members : l'annulation restitue le nom et l'avatar de chaque foyer (CR-02 fermé), le manifest de médias porte bucket_id (WR-02 côté SQL), les affirmations fausses WR-01/WR-03 sont remplacées par la vérité.

## Accomplishments

- **CR-02** : `private.account_deletion_restoration_members` (une ligne par foyer) ; `request_account_deletion` instantané TOUTES les lignes membres (`for update`) avant la déshumanisation globale ; `cancel_account_deletion` restaure chaque ligne depuis SA ligne d'instantané, jointe sur `member_row_id` — la propagation du nom d'ancrage aux autres foyers a disparu. Avatar NULL restauré comme NULL (jamais coalesce).
- **WR-02** : colonne `bucket_id not null` au manifest privé, unicité élargie `(household_id, storage_path, bucket_id)`, purge recréée pour porter `o.bucket_id`, `deletion_media_claim` retourne `bucket_id` par ligne. `deletion_media_mark_purged` inchangé (clé sur l'id).
- **WR-01/WR-03** : comment on function/column posés par 0170 — rappel J-7 best-effort assumé (flag posé AVANT le POST, échec de livraison = alerte perdue) et aucun sélecteur ne filtre `account_deleted_at` (marqueur d'audit, pas un filtre). Doc-comment `database.ts` corrigé dans le même sens.

## Verification (chaîne §2.7)

| Commande | Résultat |
|---|---|
| `sh scripts/migrate.sh` | 1 appliquée (0170), 0 table sans RLS — vert |
| `sh scripts/test-db.sh 0170` | OK |
| `sh scripts/test-db.sh` (complète) | 99 fichiers, tous verts |
| `cd app && npm run typecheck` | vert |
| `cd app && npm test` | 203 fichiers / 1641 tests, tous passés |
| `cd app && npm run build` | vert (precache 141 entries) |
| `python3 scripts/check-sql-statique.py` | 224 fonctions effectives, aucun défaut |
| `python3 scripts/test-check-sql-statique.py` | 6 cas, tous verts |

Docker disponible (conteneur `db` démarré) — `test-db.sh` exécuté réellement, non escamoté.

## Deviations from Plan

**1. [Rule 3 - Blocking] Clés `text`, pas uuid** — le plan supposait `member_row_id`/`household_id` uuid ; les clés effectives de `household_members`/`households` sont `text` (0002). Corrigé vers le schéma effectif (précédent 0166, note en entête du fichier).
**2. [Rule 2 - Missing critical] Unicité du manifest élargie au bucket** — le plan n'exigeait que la colonne ; sans l'élargissement de la contrainte, le `on conflict do nothing` de la purge aurait écrasé le second jumeau cross-bucket, réintroduisant la confusion que WR-02 devait lever. Backfill `household-media` documenté en commentaire de colonne.
**3. [Forward fix] Test 0169 réécrit** — son fixture insérait des lignes de manifest sans `bucket_id` (devenu not null) : test obsolète, réécrit vers la vérité 0170 (précédent post-0145). Aucune migration appliquée réécrite : 0167/0168/0169 intacts, tout passe par `create or replace`/commentaires.
**4. [Note] Tasks 1 et 2** partagent le même fichier (la migration) : un seul commit de code (`ca9141a`), l'application au conteneur (Task 2) est vérifiée dans le même commit.

**Total deviations :** 4 (3 auto-fixées, 1 note d'ordre). **Impact :** aucun écart de comportement vis-à-vis des must_haves — les corrections collent au schéma effectif.

## Issues Encountered

None.

## Self-Check: PASSED

- supabase/migrations/0170_account_deletion_multifoyer_snapshot.sql : présent, appliqué (`schema_migrations` contient la version).
- supabase/tests/0170_account_deletion_multifoyer_snapshot.test.sql : présent, vert.
- Commits `ca9141a` et `cd4c55d` : présents sur `main` (2 commits mesurés depuis c58fc10).
- Tous les critères d'acceptation des 3 tasks revérifiés : PASS.
