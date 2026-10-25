---
phase: 05-cadeaux-contacts
plan: 02
subsystem: supabase-sql
tags: [rls, mirror, trigger, gift-invites, oracle, masked-view, surprise]
requires:
  - phase: 05-01
    provides: [gift_ideas-table, contact-lists-table, surprise-rls, contact-seed]
provides:
  - birthday-mirror-trigger
  - idea-gifted-propagation
  - gift-list-invite-rpcs
  - gift-items-masked-view
affects: [05-03-edge-ui, 05-04-cron-dispatch]
actuals:
  tokens: 14376
  tasks: 3
  commits: 3
plan_head_before: e19ae219dbd82c9596de23f869e6418e4caf1b4c
plan_head_after: 73c737e6e265efa9011f87f0380e2d181f5ef041
tech-stack:
  added: []
  patterns: [mirror-trigger-guard, rpc-only-nopolicy-table, security-invoker-mask-view, oracle-unique-message]
key-files:
  created:
    - supabase/migrations/0078_birthday_mirror.sql
    - supabase/migrations/0079_gift_invites.sql
    - supabase/migrations/0080_gift_items_mask.sql
    - supabase/tests/0026_gift_invites.sql
  modified:
    - supabase/tests/0025_contacts_mirror.sql
    - supabase/tests/0001_schema_contract.sql
key-decisions:
  - "Mirror trigger sans WHEN null : la date retiree supprime le miroir, pas de ligne orpheline"
  - "Redeem sans destinataire (ni membre ni e-mail) rend 'code invalide', pas un message distinct"
  - "0001 etendu (birthdays.contact_id, gift_list_invites, 4 RPC) : le contrat exact-colonnes l'exigeait"
  - "Vue 0080 en 0026 (pas de nouveau fichier) comme le plan l'autorisait"
patterns-established:
  - "Garde anti-doublon nom normalise + date sur trigger miroir (D-10)"
  - "RPC-only sans politique + GRANT service_role seuls, clone famille 0058 (D-15/D-16/D-17)"
  - "Masquage colonne par vue SECURITY INVOKER, jamais par RLS (T-05-03)"
requirements-completed: [D-03, D-06, D-10, D-12, D-14, D-15, D-16, D-17]
coverage:
  - id: D1
    description: "Un contact date cree une ligne birthdays miroir, sans doublon quand un anniversaire homonyme existe deja"
    requirement: "D-10"
    verification:
      - kind: integration
        ref: "supabase/tests/0025_contacts_mirror.sql#miroir + D-10 (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Marquer une idee 'offert' marque son item lie achete via trigger serveur"
    requirement: "D-06"
    verification:
      - kind: integration
        ref: "supabase/tests/0025_contacts_mirror.sql#D-06 (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Supprimer un contact supprime son miroir en cascade"
    requirement: "D-14"
    verification:
      - kind: integration
        ref: "supabase/tests/0025_contacts_mirror.sql#D-14 (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Les anniversaires existants n'ont genere aucun contact (pas de backfill)"
    requirement: "D-03"
    verification:
      - kind: integration
        ref: "supabase/tests/0025_contacts_mirror.sql#D-03 (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Code d'invitation cree/regenere/revoque via RPC service_role, oracle uniforme 'code invalide'"
    requirement: "D-15"
    verification:
      - kind: integration
        ref: "supabase/tests/0026_gift_invites.sql#sections 1-3 + oracle (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D6
    description: "gift_list_invites illisible et inscriptible par anon/authenticated, echange atomique idempotent"
    requirement: "D-17"
    verification:
      - kind: integration
        ref: "supabase/tests/0026_gift_invites.sql#sections 1,4,5 + 0001 sections 2bis/6/7 (test-db.sh)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Le owner d'une liste ne voit pas reserved_by via la vue masquee"
    requirement: "D-16"
    verification:
      - kind: integration
        ref: "supabase/tests/0026_gift_invites.sql#section 7 (test-db.sh)"
        status: pass
    human_judgment: false
duration: ~55 min
completed: 2026-10-05
status: complete
---

# Phase 05 Plan 02: Miroir + invites SQL Summary

**Miroir contacts→birthdays avec garde D-10, propagation offert, invites cadeau RPC-only à oracle unique et vue masquant reserved_by au owner, prouvés par 27/27 tests SQL verts.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-10-05T (wave 2 dispatch)
- **Completed:** 2026-10-05
- **Tasks:** 3
- **Files modified:** 6 (3 migrations + 1 test créés, 2 tests étendus)

## Accomplishments

- **Miroir contacts→birthdays (0078) :** `birthdays.contact_id` unique partiel + cascade D-14, trigger `mirror_contact_birthday` (crée/suit/retire le miroir, garde anti-doublon nom normalisé + date D-10), aucun backfill D-03 documenté, trigger `propagate_idea_gifted` (offert → `purchased`) D-06.
- **Invites liste cadeau RPC-only (0079) :** table `gift_list_invites` RLS sans politique + GRANT service_role seuls, 4 RPC `SECURITY DEFINER` (create/revoke/summary/redeem), gestion propriétaire OU admin, bornes D-15 (64-hex, 1-100, ≤ 90j ; défauts 20 / +90j), échange atomique idempotent en `reservation` avec oracle unique `code invalide` (T-05-04, T-05-05).
- **Vue masquée (0080) :** `gift_items_for_list` en `SECURITY INVOKER` rendant `reserved_by` NULL au propriétaire (T-05-03), `visibility = 'partagee'` désignée pour les listes partagées par code.
- **Preuves :** 0025 complété (13 assertions miroir/sync/cascade/D-03/offert), 0026 créé (~40 assertions invites + oracle + vue), 0001 étendu (contrat exact-colonnes) — suite complète **27/27 verte**, statique vert (126 fonctions), cron 0012 inchangé.

## Task Commits

Each task was committed atomically:

1. **Task 1: Miroir contacts→birthdays + propagation offert** - `d346c60` (feat)
2. **Task 2: Invites liste cadeau RPC-only sans politique** - `6bd2ade` (feat)
3. **Task 3: Vue gift_items_for_list masquant reserved_by** - `73c737e` (feat)

**Plan metadata:** skipped_gitignored — `.planning/` est gitignoré (`.gitignore:58`), le commit du SUMMARY a été refusé sans `git add -f` (interdit) ; le fichier est écrit sur disque pour l'orchestrateur.

## Files Created/Modified

- `supabase/migrations/0078_birthday_mirror.sql` - `contact_id` + 2 triggers (miroir D-10/D-14, offert D-06)
- `supabase/migrations/0079_gift_invites.sql` - table + 4 RPC + privilèges (D-15/D-16/D-17)
- `supabase/migrations/0080_gift_items_mask.sql` - vue `SECURITY INVOKER` (T-05-03)
- `supabase/tests/0026_gift_invites.sql` - cycle de vie, bornes, redeem, oracle, vue
- `supabase/tests/0025_contacts_mirror.sql` - partie miroir ajoutée avant les suppressions (invariant conservé)
- `supabase/tests/0001_schema_contract.sql` - `contact_id`, `gift_list_invites`, 4 RPC, exception sans-politique

## Decisions Made

- **Trigger miroir sans clause `WHEN (birth_date IS NOT NULL)` :** surveillé sur `birth_date, name, photo_url`, le retrait de la date supprime le miroir au lieu de le laisser orphelin ; le miroir existant est mis à jour plutôt que réinséré (évite la violation d'unicité partielle).
- **Redeem sans destinataire → `code invalide` :** ni membre du foyer ni e-mail (y compris acteur d'un autre foyer) rend l'oracle unique plutôt qu'un message distinct — T-05-04 de bout en bout.
- **E-mail invalide → message distinct `adresse e-mail invalide` :** erreur de saisie client, pas d'état d'invitation — même distinction que `pseudonyme invalide` en 0058.
- **0001 étendu malgré son absence du plan :** le contrat exact-colonnes aurait échoué sur `birthdays.contact_id` et la table sans politique aurait échoué en 2bis — correctness, pas scope creep.
- **Section 7 (vue) dans 0026 plutôt que nouveau fichier :** le plan l'autorisait ; la preuve par l'absence (0026 référençant la vue avant 0080 échouerait) garantit la non-vacuité.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 0001 étendu : `contact_id`, `gift_list_invites`, 4 RPC**
- **Found during:** Task 1 (analyse d'impact : le contrat exact-colonnes casse sur toute colonne ajoutée)
- **Issue:** Le plan ne listait pas 0001, mais `birthdays.contact_id` (0078) faisait échouer la section 1 (colonne inattendue) et `gift_list_invites` (0079, RLS sans politique) faisait échouer la section 2bis (table sans politique non exemptée).
- **Fix:** Ligne `birthdays` + `contact_id`, ligne `gift_list_invites` (colonnes exactes), exception 2bis + assertion 0-politique, boucle GRANT section 6, 4 signatures RPC section 7, compteur « Trois → Cinq exceptions ».
- **Files modified:** `supabase/tests/0001_schema_contract.sql`
- **Verification:** `test-db.sh` 27/27 vert dont 0001
- **Committed in:** `73c737e` (Task 3 commit)

**2. [Rule 3 - Structure] Section 7 (vue) mise de côté puis restaurée pour garder chaque commit vert**
- **Found during:** Task 2 (0026 référençait déjà la vue 0080 du task 3)
- **Issue:** Commiter 0026 avec la section 7 avant l'existence de la vue laissait le commit du task 2 rouge.
- **Fix:** Section 7 sauvegardée (`/tmp/opencode/0026-full.sql`), task 2 commité sans elle (vert), restaurée au task 3 avec 0080.
- **Files modified:** `supabase/tests/0026_gift_invites.sql`
- **Verification:** Task 2 vert sans section 7 ; suite 27/27 verte avec
- **Committed in:** `6bd2ade` puis `73c737e`

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 structure)
**Impact on plan:** Les deux auto-fixes garantissent la correction sans élargir le périmètre : aucune table, RPC ou politique hors plan.

## Issues Encountered

- **Troncation miroir 200 → 160 caractères :** `contacts.name` (200) dépasse `birthdays.name` (160) — le miroir tronque (`left(btrim(...), 160)`) plutôt que de bloquer la fiche, documenté en en-tête de 0078. Cas pathologique uniquement.
- **Normalisation garde D-10 sans désaccentuation :** `lower(btrim(...))` seul (extension `unaccent` non garantie sur la stack) — documenté, accents distinctifs.
- **Premiers verts immédiats (0025, 0026) :** non-vacuité prouvée par sondes — exercice manuel du trigger (1 miroir direct, 0 sur homonyme insensible à la casse, transaction annulée) et assertions bidirectionnelles (`= 1` et `= 0` sur les mêmes chemins) plus motif `ok(false)` + `sqlerrm` qui échoue si le raise manque ou si le message diffère.

## Threat Flags

T-05-03 (vue masquée, assertions owner/non-owner/inter-foyer 0026 §7), T-05-04 (oracle unique, 5 cas `like '%code invalide%'` 0026 §6), T-05-05 (FOR UPDATE + `token_hash_matches` + idempotence sans consommer, 0026 §4/§5) mitigées et testées. Aucune surface nouvelle hors plan : fonctions trigger révoquées (motif 0052/0077), table sans politique ni GRANT client (motif 0009), RPC service_role seuls vérifiés en-migration (bloc `has_function_privilege` 0079) et en 0001 §7.

## Known Stubs

Aucun.

## User Setup Required

None - no external service configuration required. Note : le secret `GIFT_LIST_INVITE_HMAC_SECRET` n'est que NOMMÉ en 0079 (jamais stocké) — son provisionnement Vault est le gate documenté du plan 05-03.

## Next Phase Readiness

- Socle serveur 05-02 complet et vert sur la DB dev partagée (0078/0079/0080 appliquées, journal `schema_migrations` à jour).
- Plan 05-03 (Edge + UI) peut consommer : `create/redeem_gift_list_invite` via `service_role`, lecture articles via `gift_items_for_list`, Rappels : le cron 06h40 est inchangé (D-12 découle de la garde miroir — une ligne par personne).
- Attention merge wave 1 + wave 2 : les deux vagues partagent la base dev et `.planning/` gitignoré — les SUMMARY vivent sur disque, les commits SQL sur `worktree-agent-p02-1791222150`.

## Self-Check

**PASSED** — 0078/0079/0080 et 0026 existent sur disque, 0025/0001 modifiés, les 3 commits (`d346c60`, `6bd2ade`, `73c737e`) existent sur `worktree-agent-p02-1791222150`, `test-db.sh` 27/27 et `check-sql-statique.py` verts, 0012 non modifié, SUMMARY écrit (commit refusé : `.planning/` gitignoré — `skipped_gitignored` explicite, aucun `git add -f`).

---
*Phase: 05-cadeaux-contacts*
*Completed: 2026-10-05*
