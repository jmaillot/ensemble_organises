---
phase: "37"
slug: "filet-de-tests-fiable"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (unit) + Playwright (e2e) |
| **Config file** | `app/vite.config.ts` (test block: jsdom, forks pool, `restoreMocks: true`) / `app/playwright.config.ts` |
| **Quick run command** | `cd app && npm run typecheck && npm test` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |
| **Estimated runtime** | ~120 s (unit ~30 s, e2e ~90 s) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` (plus the task's targeted test file)
- **After every plan wave:** Run full §2.7 chain (`typecheck && test && build && test:e2e`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (à remplir par le planner) | 01 | 1 | TEST-01 | — | N/A (déterminisme test D) | unit (répétition sous charge) | `cd app && npx vitest run src/hooks/__tests__/auth-bootstrap-offline.test.tsx` | ✅ | ⬜ pending |
| (à remplir par le planner) | 01 | 1 | TEST-02 | — | N/A | unit | `cd app && npx vitest run src/modules/anniversaires/anniversaires-page.test.tsx` | ✅ | ⬜ pending |
| (à remplir par le planner) | 01 | 1 | TEST-03 | — | N/A | e2e | `cd app && npm run test:e2e -- offline-shared-device` (env vars) | ✅ | ⬜ pending |
| (à remplir par le planner) | 01 | 1 | TEST-04 | T-37-01 | aucune clé `sb-*-auth-token*` résiduelle après purge | unit + e2e | nouveau fichier unitaire (Wave 0) + extension `offline-shared-device.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fichier de test unitaire purge (TEST-04, rouge d'abord, D-09) — étendre `src/stores/session-store.test.ts` ou `session-purge.test.ts` dédié (discrétion D-07)
- [ ] e2e : `clesStockageBrutes()` + assertion localStorage dans `offline-shared-device.spec.ts` (TEST-03/TEST-04, D-08)

*Infrastructure existante couvre TEST-01/02/03 — aucun framework à installer.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Comptes e2e partagés provisionnés (Tier 1 pour A et B) | TEST-03 (D-05/D-06) | Données utilisateur réelles, non créables par le test | Utilisateur provisionne `E2E_SHARED_USER_A_EMAIL/PASSWORD` et `E2E_SHARED_USER_B_EMAIL/PASSWORD` (comptes réels du foyer) avant la exécution e2e ; vérifier que chaque compte a des données Tier 1 pour que l'assertion offline SC1 ne soit pas vacuose |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
