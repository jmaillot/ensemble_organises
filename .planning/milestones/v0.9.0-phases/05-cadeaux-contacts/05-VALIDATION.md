---
phase: "05"
slug: "cadeaux-contacts"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-05"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (frontend) ; testkit SQL (supabase/tests) |
| **Config file** | app/vite.config.ts (vitest section) ; supabase/tests/testkit |
| **Quick run command** | `cd app && npm test -- <scope>` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` + `python3 scripts/check-sql-statique.py` + `sh scripts/test-db.sh` (Docker requis) |
| **Estimated runtime** | ~120 seconds (vitest ciblé < 30s) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- <scope>`
- **After every plan wave:** Run `cd app && npm run typecheck && npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD by planner | — | — | D-01…D-18 | T-05-NN / — | TBD | unit/int/e2e | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: per-task rows are filled by the planner in PLAN.md `<verify>` blocks; this table is reconciled at validate-phase §6.*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no Wave 0 needed:
- Vitest + Testing Library + MSW + fake-indexeddb déjà en place (cf. phases 1–3).
- testkit SQL + `scripts/test-db.sh` + `scripts/check-sql-statique.py` déjà en place.
- Playwright e2e déjà en place (`cd app && npm run test:e2e`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code invitation scannable en caisse/appareil réel | D-18 | Scan physique non simulable | Générer un code liste, scanner avec un téléphone, vérifier la page de rachat |
| Rendu photo contact (priorité contact vs birthday) | D-13 | Appréciation visuelle | Créer contact daté + birthday homonyme, vérifier la photo affichée en vue agrégée |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
