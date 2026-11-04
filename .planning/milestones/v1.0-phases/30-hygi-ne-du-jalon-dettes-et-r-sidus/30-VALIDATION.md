---
phase: "30"
slug: "hygi-ne-du-jalon-dettes-et-r-sidus"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-30"
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (app), psql + testkit (SQL), Playwright (e2e), bash -n / grep (scripts) |
| **Config file** | `app/vitest.config.ts` (existing), `supabase/tests/testkit` (existing) |
| **Quick run command** | `cd app && npm run typecheck && npm test` |
| **Full suite command** | `python3 scripts/check-sql-statique.py && sh scripts/test-db.sh && cd app && npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~120 seconds (quick ~40s) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` (frontend tasks) or `python3 scripts/check-sql-statique.py` (SQL tasks)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 0 | DET-01 | T-30-01 / — | RLS borne la lecture des occurrences au foyer | SQL test | `sh scripts/test-db.sh` | ✅ | ⬜ pending |
| 30-01-02 | 01 | 0 | DET-01 | — | N/A | diagnostic prod | `psql.sh < diag.sql` via conteneur db | ✅ (script) | ⬜ pending |
| 30-02-01 | 02 | 1 | DET-02 | — | N/A | unit + preuve | `cd app && npm run typecheck && npm test -- src/modules` | ✅ | ⬜ pending |
| 30-03-01 | 03 | 1 | DET-03 | — | N/A | contrat semis | `sh scripts/test-db.sh` + test vitest seeds | ✅ | ⬜ pending |
| 30-04-01 | 04 | 2 | DET-04 | — | N/A | source assertion | `grep` sur version panel + `npm run build` | ✅ | ⬜ pending |
| 30-05-01 | 05 | 2 | DET-05 | — | N/A | e2e | `cd app && npm run test:e2e` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/` — étendre le gabarit `0004_cron.sql` pour la preuve rouge-avant-vert de DET-01 (Edge branchée au pg_cron)
- [ ] `app/src/**` — tests vitest pour les semis de recettes avec photos (DET-03)
- Existing infrastructure covers the rest (vitest, testkit SQL, Playwright déjà en place).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Occurrence visible dans la vue du jour en prod | DET-01 | Le job pg_cron ne tourne que dans la stack prod | Vérifier `cron.job_run_details` le lendemain matin + vue du jour |
| Rendu « Anniversaires » sans césure sur vrai appareil mobile | DET-05 | La césure typographique dépend du viewport réel | iPhone/Android : ouvrir la feuille Anniversaires, vérifier le rendu |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
