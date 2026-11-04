---
phase: "25"
slug: "profils-enfants-g-r-s-par-le-parent"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-25"
---

# Phase 25 — Validation Strategy

> Contrat de validation par phase pour l'échantillonnage de feedback pendant l'exécution.
> Source : `25-RESEARCH.md` § « Validation architecture ».

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | SQL — `supabase/tests/*.sql` exécutés par `sh scripts/test-db.sh` (transaction par fichier, annulée en sortie) · Vitest 5 + React Testing Library (`npm run test`) · Playwright (`npm run test:e2e`) |
| **Config file** | `supabase/tests/_setup.sql` → schéma `testkit` (`testkit.eq`, `testkit.count`, `testkit.expect_denied`) · `app/vitest.config.ts` |
| **Quick run command** | `sh scripts/test-db.sh <numéro>` puis `cd app && npm run test` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && cd .. && python3 scripts/check-sql-statique.py && python3 scripts/test-check-sql-statique.py && sh scripts/test-db.sh` |
| **Estimated runtime** | ~180 s pour la suite complète ; ~15 s pour un fichier SQL isolé |

Contraintes d'écriture d'assertion portées par AGENTS.md §2.7 (D) : lire la fonction avant d'écrire l'assertion ; borner chaque comptage à *par foyer* ; aucune tautologie (`count(*) >= 0` est une fausse vérification) ; un fichier de test nouveau est censé échouer avant d'être vu vert ; `testkit.eq` exige deux valeurs du même type ; `testkit.count` s'exécute dans une fonction séparée, donc aucune variable du bloc appelant.

---

## Sampling Rate

- **After every task commit:** `sh scripts/test-db.sh <numéro>` + `cd app && npm run test`
- **After every plan wave:** `cd app && npm run typecheck && npm test && npm run build` → `python3 scripts/check-sql-statique.py` → `sh scripts/test-db.sh`
- **Before `/gsd-verify-work`:** chaîne complète verte ; `test-dispatch-push.sh` déclaré exécuté **ou** déclaré non exécutable (absence d'appareil abonné n'est pas un échec — elle doit être dite, pas passée sous silence)
- **Max feedback latency:** 180 s

`test-db.sh` s'arrête à la frontière HTTP : faute de pg_net, de Vault et d'un runtime `functions` dans la base, un changement de migration, de Vault ou d'Edge Function ne peut pas être validé par lui seul. `test-dispatch-push.sh` comble ce manque et exige un abonnement de push réel.

---

## Per-Task Verification Map

Les identifiants de tâche sont ceux des plans réels. La colonne *Requirement* porte les identifiants de la phase (`ENF-01`…`ENF-05`) et les décisions verrouillées (`D-xx`) de `25-CONTEXT.md`. Canon de nommage : la migration 0146 s'appelle `0146_child_behavior_guards.sql` (cette forme est la seule utilisée dans les plans, PATTERNS et VALIDATION).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | ENF-01, D-06, D-04, D-05 | T-25-01 | Migration 0144 : colonnes managed_modules (socle D-06 par membre), birth_date, deleted_at ; CHECK de format | SQL | `sh scripts/migrate.sh` puis `sh scripts/test-db.sh 0144` | ✅ | ✅ green |
| 25-01-02 | 01 | 1 | D-09 | T-25-01 | Doublons de noms permis, format seul validé, clé bien formée hors catalogue acceptée | SQL | `sh scripts/test-db.sh 0144` | ✅ | ✅ green |
| 25-02-01 | 02 | 2 | ENF-04, D-18 | T-25-03 | Checkpoint D-18 : approbation explicite avant toute écriture de 0145 | human-check | — (checkpoint) | ✅ | ✅ green (approbation consignée mot pour mot, 25-02-SUMMARY) |
| 25-02-02 | 02 | 2 | ENF-04, D-15, D-16 | T-25-03 | Conversion : user_id nullé, auth.users + profiles purgés, ligne membre conservée, skipped multi-foyer | SQL | `sh scripts/test-db.sh 0145` | ✅ | ✅ green |
| 25-02-03 | 02 | 2 | D-17 | T-25-05 | Chemins fermés : invitation refuse 'enfant' (22023), set_member_role refuse enfant-sur-compte (22023), invariant re-crée | SQL | `sh scripts/test-db.sh 0145` | ✅ | ✅ green |
| 25-03-01 | 03 | 3 | ENF-01, D-01 | T-25-07 | RPC de fiche (create/update/archive), périmètre D-06 des cinq espaces gardés (22023 hors périmètre) | SQL | `sh scripts/test-db.sh 0146` | ✅ | ✅ green |
| 25-03-02 | 03 | 3 | ENF-02, D-13 | T-25-07, T-25-08 | Gardes de module replace_* (42501 admin inclus) ; complétion adulte→enfant ok, adulte→adulte refusée | SQL | `sh scripts/test-db.sh 0146` | ✅ | ✅ green |
| 25-03-03 | 03 | 3 | ENF-04, D-12 | T-25-09 | Cercle DELETE : adulte (admin OU membre) modère le contenu d'enfant ; contenu adulte protégé | SQL | `sh scripts/test-db.sh 0146` | ✅ | ✅ green |
| 25-03-04 | 03 | 3 | ENF-02, D-06 | T-25-16 | Clauses conversations/birthdays (22023) et meal_entries (normalisation) | SQL | `sh scripts/test-db.sh 0146` | ✅ | ✅ green |
| 25-04-01 | 04 | 4 | ENF-04, D-23 | T-25-10 | Push : adultes destinataires quand l'attributaire est enfant ; zéro destinataire enfant | SQL | `sh scripts/test-db.sh 0147` | ✅ | ✅ green |
| 25-04-02 | 04 | 4 | ENF-02, D-19, D-20 | T-25-17 | Fusion link_managed_child : traces réattribuées, ligne supprimée, invariant intact, collision gérée | SQL | `sh scripts/test-db.sh 0148` | ✅ | ✅ green |
| 25-04-03 | 04 | 4 | ENF-04 | T-25-10 | Barrière finale backend : suite complète test-db.sh SANS argument (y compris 0051) | SQL | `sh scripts/test-db.sh` | ✅ (0051) | ✅ green (83/83, clôture 25-04 du 2026-10-26 ; SQL inchangé depuis) |
| 25-05-01 | 05 | 5 | ENF-01, D-01, D-04 | — | useIsAdult + filtre deleted_at unique dans household-store (setHousehold/setMembers), types + seed | Vitest | `cd app && npm test -- --run src/stores` | ✅ | ✅ green |
| 25-05-02 | 05 | 5 | ENF-01, D-01, D-02, D-05, D-21 | T-25-13, T-25-14 | CRUD enfant DANS la liste des membres via RPC, espaces par membre, âge, « Donner accès » | Vitest | `cd app && npm test -- --run src/modules/parametres` | ✅ | ✅ green |
| 25-05-03 | 05 | 5 | ENF-04, D-12 | — | Modération Cercle canDelete + fixture Playwright parcours parent-enfant | Vitest + E2E | `cd app && npm test -- --run src/modules/cercle && npm run test:e2e` | ✅ | ✅ green |
| 25-06-01 | 06 | 1 | ENF-01…ENF-05, D-12, D-06 | — | Alignement documentaire REQUIREMENTS.md/ROADMAP.md sur D-12 et D-06 (aucun code) | grep | `grep -n "réagir dans le Cercle\|réagit dans le Cercle" .planning/REQUIREMENTS.md .planning/ROADMAP.md` (exit 1 attendu) | ✅ | ✅ green (re-vérifié 2026-10-26, exit 1) |
| 25-07-01 | 07 | 6 | ENF-05, D-06 | T-25-22 | member-eligibility.ts : fonction pure, 0/1/n enfants, archivé exclu, refus-par-défaut | Vitest | `cd app && npm test -- --run src/lib/member-eligibility.test.ts` | ✅ | ✅ green |
| 25-07-02 | 07 | 6 | ENF-05, D-06 | T-25-20 | Quatre pickers inline : enfant hors-module absent des options | Vitest | `cd app && npm test -- --run src/modules/taches src/modules/routines src/modules/menu src/modules/ardoise` | ✅ | ✅ green |
| 25-07-03 | 07 | 6 | ENF-02, D-08, D-11 | T-25-20, T-25-21 | « Cocher pour » UI + markOccurrenceDone → RPC complete_routine_occurrence | Vitest | `cd app && npm test -- --run src/modules/routines` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/tests/0144_managed_child_schema.sql` — invariant, socle par défaut, refus de CHECK (ENF-01, D-06)
- [x] `supabase/tests/0145_convert_managed_children.sql` — conversion, purge `auth.users`, traces conservées (D-15, D-16, D-04)
- [x] `supabase/tests/0146_child_behavior_guards.sql` — RPC de fiche D-01 (périmètre D-06), délégation, refus D-13, modération D-12, clauses D-06 (ENF-01, ENF-02, ENF-03, ENF-04)
- [x] Tests Vitest : `household-store` (filtre deleted_at), `use-child-profiles` (CRUD enfant), `member-eligibility` (0/1/n), pickers (garde D-06), modération Cercle (bouton visible seulement pour un auteur enfant)
- [x] Fixture Playwright : foyer avec au moins un profil enfant créé en phase 25 + foyer avec un compte enfant **converti** (pour D-15/D-16)
- [x] Aucun changement de `app/src/lib/data/seed.ts` requis au-delà des nouvelles colonnes (D-05 : birth_date, managed_modules, deleted_at)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Envoi de notification push réelle depuis le cron | D-23 | Le conteneur n'a ni pg_net ni Vault ni runtime `functions` dans la base ; `test-db.sh` s'arrête à la frontière HTTP | `sh scripts/test-dispatch-push.sh` sur une machine avec un appareil réellement abonné ; sinon déclarer l'absence d'appareil dans `VERIFICATION.md` — un endpoint factice produirait `dropped` et non `delivered` |
| Conversion d'un compte enfant réel en compte existant | D-15, D-16 | Le test s'annihile dans la transaction SQL annulée en sortie ; l'état après conversion n'est observable qu'après rejeu | Exécuter la migration 0145 sur un foyer de préproduction avec un compte enfant réel, puis vérifier `auth.users` vide et l'historique intact |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (0 MISSING)
- [x] No watch-mode flags
- [x] Feedback latency < 180 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** orchestrator audit, 2026-10-26 — 0 gap automatisé, 2 vérifications manual-only par conception (voir table)

---

## Validation Audit 2026-10-26

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 2 (manual-only par conception — déjà tabulés) |

Preuves fraîches de l'audit (orchestrateur, 2026-10-26) :
- SQL : `sh scripts/test-db.sh` sans argument **83/83** (clôture 25-04, journal `/tmp/opencode/testdb-final.log`) ; `git log e73d7ea..HEAD -- supabase/` vide = SQL inchangé depuis.
- Frontend : `npm run typecheck` ✓ · `npm test` **201 fichiers / 1617/1617** ✓ · `npm run build` ✓ (PWA precache 138 entrées) · `npm run test:e2e` **155 passed** et re-filtre `child-profiles` **8/8** ✓ (post-25-07).
- Doc : grep ENF/25-06-01 exit 1 (= vert) re-vérifié.
- 0053 diagnostiqué pendant la clôture 25-04 : pas de bug produit (uid enfant ne résout aucun membre post-0145).
