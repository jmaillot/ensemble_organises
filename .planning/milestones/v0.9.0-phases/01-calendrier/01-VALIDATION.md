---
phase: "01"
slug: "calendrier"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-06"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + RTL + user-event / Playwright 1.63 / SQL testkit (`sh scripts/test-db.sh`) + `python3 scripts/check-sql-statique.py` (8 contrôles) |
| **Config file** | `app/package.json` scripts (`test`, `test:e2e`, `typecheck`, `build`) |
| **Quick run command** | `cd app && npm run typecheck && npm test` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e && python3 scripts/check-sql-statique.py && sh scripts/test-db.sh` |
| **Estimated runtime** | ~300 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` + `python3 scripts/check-sql-statique.py` (si SQL touché)
- **After every plan wave:** Run full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-00-01 | 00 | 0 | D-01/D-02/D-05/D-08/D-14 | T-01-01 | Perso invisible admin, garde catégories, cron sans secret | SQL | `sh scripts/test-db.sh` (suite 0017) | ❌ W0 | ⬜ pending |
| 01-00-02 | 00 | 0 | D-09/D-10 | — | FilterBar cumulable, ref non masquable/non cliquable | e2e | `npm run test:e2e` (`calendrier.spec.ts`, alice-cal/bob-cal) | ❌ W0 | ⬜ pending |
| 01-00-03 | 00 | 0 | D-13/D-15 | — | useRefDays lit cache base | unit | `npm test` (`use-ref-days.test.ts` étendu) | ✅ partiel | ⬜ pending |
| 01-00-04 | 00 | 0 | D-03/D-04 | — | Choix explicite + confirmation Perso→Commun | unit | `npm test` (dialog) | ❌ W0 | ⬜ pending |
| 01-00-05 | 00 | 0 | D-06 | — | Enfant tague sans créer | SQL | `sh scripts/test-db.sh` (0016 §3) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/0017_calendrier_phase.sql` — D-01/D-02/D-05/D-08/D-14 (marque `Aaaa`, rôle `postgres` borné + `authenticated` négatifs)
- [ ] `app/e2e/calendrier.spec.ts` — 2 comptes alice-cal/bob-cal : Perso invisible inter-compte, toggles ref absents, tap-and-hold/+ avec calendrier explicite
- [ ] `supabase/functions/refresh-calendrier-ref/index.ts` + entrée `scripts/deploy-functions.sh`
- [ ] Étendre `use-ref-days.test.ts` (mapping lignes DB → FrenchHoliday/VacationRange, garder helpers purs)

*Existing infrastructure covers the rest (0016 RLS, 0004 cron motifs, Dexie rows cache).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Perso invisible total inter-comptes (2 navigateurs) | D-01 | Isolation visuelle + RLS | Connecter alice-cal et bob-cal, vérifier que le Perso de l'autre n'apparaît nulle part (listes, vues filtrées, Realtime) |
| Tap-and-hold crée avec date pré-remplie | D-11 | Geste tactile | Appui long sur une case → dialogue ouvert avec date pré-remplie et calendrier explicite |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
