---
phase: 40
plan: 02
subsystem: ardoise, redeem, sql
tags: [ardoise, reconciliation, redeem, bridge-token, sql-tests]
requires: [0145 (redeem effectif), 0180/0180b (table pont + RPC), 0015 (contrainte unique), 0008/0056 (triggers parts)]
provides: [redeem_household_invite_token enrichi (0181), 8 cas SQL ARD-02/03]
affects: [40-03 (UI polish), Edge household-invite (aucun changement requis)]
tech-stack:
  added: []
  patterns: [recopie de définition effective vers l'avant, réconciliation transactionnelle bornée table pont, report de parts avant suppression]
key-files:
  created:
    - supabase/migrations/0181_ardoise_reconciliation.sql
    - supabase/tests/0180_ardoise_bridge.test.sql
  modified: []
decisions:
  - "Vocabulaire réel 'guest' (0056/0063), pas 'invite' du plan — les migrations font foi"
  - "Réconciliation exécutée AUSSI dans le chemin already_member : sinon la fusion verrouillée (garder la part membre) est inatteignable"
  - "Fusion = REPORT de la part guest sur la part gardée avant suppression (trigger différé 0008 somme=montant) — un simple delete ferait échouer le redeem à la validation"
  - "Insertion ardoise_members avant conversion (trigger validate_expense_participant exige l'inscription ardoise)"
metrics:
  duration: "~1h30"
  completed: 2026-11-09
status: complete
commits: 2
plan_head_before: 704265a
plan_head_after: 15e4f7a
---

# Phase 40 Plan 02 : Réconciliation guest→membre dans le redeem Summary

**Le redeem du token foyer convertit transactionnellement les participations invitées (pont OPTION B) en participations membre — fusion des doublons par report de part — prouvé par 8 cas SQL positifs/négatifs, vu rouge avant vert.**

## Commits

| Tâche | Description | Commit |
|---|---|---|
| 1 | Migration 0181 — redeem enrichi avec réconciliation transactionnelle | `35dcfd6` |
| 2 | Tests SQL 0180_ardoise_bridge — 8 cas, vu ROUGE avant application de 0181 | `15e4f7a` |

(Task 3 — application 0181 + chaîne complète — n'a produit aucun nouveau commit : la migration est appliquée en base, la chaîne verte est documentée ci-dessous.)

## Ce qui a été livré

1. **Migration 0181** : `create or replace public.redeem_household_invite_token` — définition effective 0145 recopiée intégralement (refus `p_role='enfant'`, verrou `for update`, idempotence déjà-membre, `v_role := 'membre'` en dur, incrément `use_count`), bloc réconciliation inséré :
   - (0) inscription `ardoise_members` des ardoises touchées (le trigger 0008/0056 refuse un participant membre non inscrit) ;
   - (1.a/1.a') fusion vers une part membre existante : report de la part guest PUIS suppression ;
   - (1.b/1.b') dédoublonnage de deux guests pontés sur la même dépense (0180b ponte TOUS les guests de l'ardoise) : report sur le plus petit id, suppression des surnuméraires ;
   - (2) conversion `guest`→`membre` bornée au couple (user_id, household_id) du pont ET au foyer de la dépense (T-40-05) ;
   - (3) purge du pont consommé.
2. **Tests SQL** (`supabase/tests/0180_ardoise_bridge.test.sql`) : 8 cas — conversion, non-application de la part zéro au bridge, fusion doublon, déjà admin, déjà membre, double redemption (22023 épuisé), rôle forcé (22023), grants bridge (42501 en authenticated).

## Déviations du plan

### [Rule 1 - Schéma] Vocabulaire `guest`, pas `invite`

Le plan écrivait `participant_type='invite'` ; le schéma réel (0056/0063) utilise `'guest'` avec colonne `guest_id`. Corrigé dans 0181 et les tests.

### [Rule 2 - Correction] La réconciliation tourne aussi dans le chemin `already_member`

Le plan plaçait le bloc uniquement après l'insert `household_members`. Or la fusion verrouillée (« garder la part membre ») n'est réalisable QUE pour un utilisateur déjà membre : sortir avant le bloc rendait la politique inatteignable. Restructuration : `v_already` booléen, réconciliation dans les deux chemins, sortie `already_member` sans incrément `use_count` (idempotence 0145 préservée).

### [Rule 1 - Bloquant] Fusion = report de part, pas simple delete

Le trigger différé `expense_participants_share_total` (0008) impose somme des parts = montant : un delete de fusion aurait fait échouer le redeem À LA VALIDATION (23514). Les parts supprimées sont REPORTÉES sur la part gardée avant suppression. Le cas 3 le prouve (part felix 0→20, somme de e3 intacte).

### [Rule 2 - Correction] Insertion `ardoise_members` avant conversion

Absente du plan : le trigger `validate_expense_participant` (0008/0056) refuse un participant `membre` non inscrit à l'ardoise de la dépense (23514). Étape (0) ajoutée, idempotente (`on conflict do nothing`).

### [Rule 3 - Test] Ajustements d'exécution des tests

`guest_id` requis dès l'INSERT (trigger), valeurs `testkit.fx` pré-résolues avant `set local role service_role` (sinon 42501 sur le schéma testkit), table pont lue dans `private.` (coquille corrigée).

## Vérifications

- **Rouge prouvé** (AGENTS §2.7-F) : fichier exécuté AVANT application de 0181 → « Cas 1 : la part guest de g1 sur e1 est devenue une part membre de gaston (attendu 1, obtenu 0) » — le redeem 0145 ne convertit rien.
- Après `sh scripts/migrate.sh` : `schema_migrations` contient 0181 ; `pg_get_functiondef` ancre `ardoise_bridge_identities` dans la définition effective.
- **Chaîne complète verte** : `check-sql-statique` (231 fonctions, 107 tests, aucun défaut), `test-check-sql-statique` (6 cas), `test-db.sh` **105 fichiers tous verts** (dont les régressions 0145/0176 existantes).
- Cas SQL couvrent T-40-05 (bornage pont+foyer), T-40-06 (22023 rôle forcé), T-40-07 (épuisé, FOR UPDATE recopié).

## Self-Check: PASSED

- Commits `35dcfd6`, `15e4f7a` présents ; 2 commits depuis `704265a`.
- Fichiers sur disque : migration 0181 + fichier de test 0180.
- Edge `household-invite` intouchée (prohibition respectée, `git diff` vide).
