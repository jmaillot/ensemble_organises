---
phase: "06"
slug: "cadeaux-invites"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-06"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Strategy derived from 06-RESEARCH.md "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + SQL testkit suites + Playwright e2e |
| **Config file** | `app/vitest.config.ts`, `supabase/tests/_setup.sql` |
| **Quick run command** | `cd app && npx vitest run src/modules/cadeaux` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` + `sh scripts/test-db.sh` + `python3 scripts/check-sql-statique.py` |
| **Estimated runtime** | ~60 seconds (Vitest cadeaux), ~3 min (test-db banner) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npx vitest run src/modules/cadeaux` (frontend) or `sh scripts/test-db.sh 0026` (SQL)
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | D-05/D-06/D-07 | T-06-01/02/03 | anon reserve + name + oracle + rate-limit | sql | `sh scripts/test-db.sh` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | D-08 | T-06-04 | owner release, non-owner denied | sql | `sh scripts/test-db.sh` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | D-01/D-02/D-03 | T-06-05 | send-email user-only, fail-closed SMTP | e2e/unit | `cd app && npm test -- cadeaux` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | D-05/D-06 | — | guest name+reserve UI, boolean-only payload | unit | `cd app && npx vitest run src/modules/cadeaux` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `supabase/tests/0027_guest_reserve.sql` (ou extension 0026) — stubs preuves anonymes
- [ ] Inbucket local (:2500) pour preuve d'envoi réel, pas de mocks

*Existing Vitest + testkit infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email reçu lisible (sobre + message) | D-02/D-03 | Rendu client mail non automatisable | Envoyer vers Inbucket local, ouvrir le message, vérifier expéditeur/lien/message |
| QR/lien invité sur téléphone réel | D-05 | Scan physique | Scanner le QR généré, parcourir nom + réserver |
| SMTP prod 465/TLS | D-01 | Secrets prod hors repo | Envoi réel supervisé une fois les secrets provisionnés |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
