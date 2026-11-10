---
phase: "40"
slug: "ardoise-rejoindre-via-mon-compte"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-09"
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (frontend) ; testkit SQL via `sh scripts/test-db.sh` (base) |
| **Config file** | Config Vitest existante du projet ; `supabase/tests/_setup.sql` |
| **Quick run command** | `cd app && npx vitest run src/modules/ardoise src/modules/landing` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && python3 scripts/check-sql-statique.py && sh scripts/test-db.sh` (+ `npm run test:e2e`) |
| **Estimated runtime** | ~90 s (suite complète, Docker requis pour test-db.sh) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/modules/ardoise src/modules/landing`
- **After every plan wave:** Run full suite command (test-db.sh obligatoire dès qu'une migration est posée — AGENTS.md §2.7)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | ARD-01 | T-40-01 / — | Aucun redeem sans confirmation explicite (dialog avant tout réseau) | unit (RTL) | `cd app && npx vitest run src/modules/ardoise/guest-ardoise-page.test.tsx` | ✅ | ✅ green |
| 40-01-02 | 01 | 1 | ARD-01 | — | Atterrissage `/ardoise` après redeem via bridge | unit (RTL) | `cd app && npx vitest run src/modules/landing/join-household-page.test.tsx` | ✅ | ✅ green |
| 40-01-03 | 01 | 1 | ARD-01 | — | `?code=`/token préservés via `state.from` | unit (RTL) | `cd app && npx vitest run src/modules/landing/join-household-page.test.tsx` | ✅ partiel | ✅ green |
| 40-02-01 | 02 | 1 | ARD-02 | T-40-02 | Réconciliation transactionnelle : lignes migrées, part du passé conservée | SQL (testkit) | `sh scripts/test-db.sh 0180` | ✅ `supabase/tests/0180_ardoise_bridge.test.sql` | ✅ green |
| 40-02-02 | 02 | 1 | ARD-03 | T-40-03 | Négatifs : déjà admin, déjà membre, double redemption concurrente (FOR UPDATE), rôle forcé côté serveur | SQL (testkit) | `sh scripts/test-db.sh 0180` | ✅ `supabase/tests/0180_ardoise_bridge.test.sql` | ✅ green |
| 40-02-03 | 02 | 1 | ARD-03 | — | Aucune colonne `household_id` sur le modèle de partage ardoise | statique | `python3 scripts/check-sql-statique.py` + revue migration | ✅ (contrôle existant) | ✅ green |
| 40-03-01 | 03 | 2 | ARD-01 | T-40-01 | `household-token` refuse publishable (401), refuse code mort/expiré (réponse uniforme) | unit Edge / revue + e2e | suite e2e existante / `cd app && npm run test:e2e` | ✅ suite | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `supabase/tests/0180_ardoise_bridge.test.sql` — stubs positifs/négatifs ARD-02/ARD-03 (couvre 0180/0180b/0181 : réconciliation, double redemption, refus rôle enfant, purge du pont)
- [x] Extension `app/src/modules/ardoise/guest-ardoise-page.test.tsx` — dialog pré-adhésion ARD-01
- [x] Extension `app/src/modules/landing/join-household-page.test.tsx` — atterrissage conditionnel ARD-01

*Existing vitest infrastructure covers the frontend; SQL testkit exists (`supabase/tests/_setup.sql`).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `test-dispatch-push.sh` (push réel) | — | Exige un appareil abonné réel ; hors périmètre de la phase | `sh scripts/test-dispatch-push.sh` sur machine avec appareil |
| Parcours invité complet sur navigateur réel (dialog → confirm → pré-écran → adhésion → atterrissage /ardoise) | ARD-01 | Parcours e2e couvert en vitest/e2e ; vérification visuelle finale recommandée | Suivre un lien de partage ardoise avec un compte sans foyer, cliquer « Rejoindre via mon compte » |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** verified 2026-11-09

---

## Validation Audit 2026-11-09
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Preuves d'exécution : `npx vitest run guest-ardoise-page.test.tsx join-household-page.test.tsx` → 38/38 verts (6,8 s) ; `sh scripts/test-db.sh 0180` → 1 fichier vert ; `python3 scripts/check-sql-statique.py` → aucun défaut (231 fonctions, 182 migrations, 107 tests). Test files déjà versionnés pendant l'exécution — aucun nouveau fichier de test à commiter.
