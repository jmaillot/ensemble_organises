---
phase: "44"
slug: "d-cision-cache-maxage-par-famille-cache-01"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-11"
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (+ RTL) |
| **Config file** | `app/` (chaîne §2.7 existante) |
| **Quick run command** | `cd app && npm test -- query-policy` |
| **Full suite command** | `cd app && npm run typecheck && npm test && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm run typecheck && npm test` (le SQL n'est pas touché — D-08 le dit explicitement)
- **After every plan wave:** Run `cd app && npm run typecheck && npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds
- Chaîne §2.7 complète UNE fois à l'état final du dépôt, après le dernier commit de famille (D-08), résultat consigné en §7.6 du document MESURES

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner) | 01 | 1 | CACHE-01 | — | procédure humaine — la preuve est la consignation §7.4 | manual-only | — (mesure on-device dictée, §1/D-01) | n/a | ⬜ pending |
| (planner) | 01 | 1 | CACHE-02 | T-44-01 | Valeur par famille + gcTime ≥ maxAge max + préfixes ↔ constantes | unit | `cd app && npm test -- query-policy` (Tests F/G/H/I) | ✅ | ⬜ pending |
| (planner) | 01 | 1 | CACHE-03 | — | Consignation (document versionné + PROJECT.md) | manual-only | — (preuve par relecture du diff docs/PROJECT.md, forme 38-E2E-SIGNATURE) | n/a | ⬜ pending |
| (planner) | 01 | 1 | CACHE-04 | T-44-02 | (conditionnel) panneau lecture seule, contenu non sensible | unit (si livré) | `cd app && npm test -- offline-panel` | ❌ W0 si livrée | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/modules/parametres/components/offline-panel.test.ts(x)` — stub seulement si la tâche conditionnelle CACHE-04 s'exécute

*Otherwise: "Existing infrastructure covers all phase requirements." (Tests F/G/H/I de `query-policy.test.ts` en place.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Campagne on-device N=5 runs, purge froide §2.1, lecture panneau « Amorçage » | CACHE-01 | Mesure manuelle sur appareil de référence (dictée humaine, §1/D-01) | Suivre protocole §6 de `docs/MESURES-COLD-START-42.md` ; consigner dans les squelettes §7.1–7.3 |
| Grille de décision §7.4 remplie avant toute édition de code ; verdict reporté dans PROJECT.md | CACHE-03 | Décision humaine argumentée (a)(b)(c), pas automatisable | Remplir §7.4 données sous les yeux (D-06), puis PROJECT.md §Décision CACHE-01 (D-09/D-10/D-11) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
