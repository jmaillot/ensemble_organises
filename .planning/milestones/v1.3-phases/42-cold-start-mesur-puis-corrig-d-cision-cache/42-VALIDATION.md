---
phase: "42"
slug: "cold-start-mesur-puis-corrig-d-cision-cache"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-10"
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library (config existante `app/`) |
| **Config file** | existant (chaîne `npm test`) |
| **Quick run command** | `cd app && npm run typecheck && npm test` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build && npm run test:e2e` |
| **Estimated runtime** | ~120 seconds (full chain) |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test`
- **After every plan wave:** Run full §2.7 chain (`npm run typecheck && npm test && npm run build && npm run test:e2e` ; check-sql-statique non requis — aucune migration SQL dans cette phase)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (à remplir par le planner) | 01 | 0 | COLD-01 | — | N/A | unit | `cd app && npm test -- boot-marks` | ❌ W0 | ⬜ pending |
| (à remplir par le planner) | 01 | 1 | COLD-01 | — | Section Amorçage : durées et compteurs uniquement, jamais d'identifiants ni de clés de cache complètes (patron D-11) | component | `cd app && npm test -- offline-panel` | ✅ étendre | ⬜ pending |
| (à remplir par le planner) | 01 | 1 | COLD-01 | — | Aucune écriture IndexedDB ajoutée au démarrage (PD-02) | unit | test qui refuse tout `set(`/`persistQueryClientSave` nouveau dans boot-marks | ❌ W0 | ⬜ pending |
| (à remplir par le planner) | — | — | COLD-02 | — | N/A | manual-only | protocole doc mesures ; justification : PM-01 exige l'appareil Android réel | — | ⬜ pending |
| (à remplir par le planner) | — | — | CACHE-01 | — | Politique et tests divergents refusés | unit | `cd app && npm test -- query-policy` | ✅ | ⬜ pending |
| (à remplir par le planner) | — | — | CACHE-01 | — | Purge outbox indépendante du maxAge (régression) | unit | `cd app && npm test -- query-persistence` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/boot-marks.test.ts` — module de marks (bornes, store, total = borne à borne, pas la somme)
- [ ] Extension des tests `offline-panel` — section Amorçage (4 segments + total)
- [ ] Aucun framework à installer (zéro dépendance nouvelle — le plan ne doit contenir AUCUNE tâche d'installation npm)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mesure on-device avant/après correction (médiane de N=5 runs, cache froid PM-02, réseau coupé) | COLD-01, COLD-02 | PM-01 : l'émulateur est proscrit ; seul l'appareil Android réel de référence produit des mesures valides | Suivre le protocole écrit du doc mesures versionné (PM-03) ; consigner la branche hors-ligne empruntée par run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
