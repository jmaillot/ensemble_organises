---
phase: "36"
slug: "outbox-plus-jamais-d-effacement-silencieux"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 + React Testing Library (`app/`) |
| **Config file** | `app/vitest.config.*` (existing v1.1 suite) |
| **Quick run command** | `cd app && npm test -- --run src/lib/outbox` |
| **Full suite command** | `cd app && npm run typecheck && npm test -- --run && npm run build` |
| **Estimated runtime** | ~30–60 s (quick), ~5 min (full) |

La chaîne §2.7 s'applique : SQL statique + test-db.sh uniquement si une migration est touchée (RESEARCH.md : aucune migration prévue — `supabase/migrations` hors périmètre sauf surprise).

---

## Sampling Rate

- **After every task commit:** Run `cd app && npm test -- --run src/lib/outbox`
- **After every plan wave:** Run full suite (typecheck + test + build)
- **Before `/gsd-verify-work`:** Full suite must be green + chaîne §2.7 complète
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | OBOX-01 | — | Classification PGRST116 terminal visible, jamais évaporée | integration (rouge d'abord) | `cd app && npm test -- --run src/lib/outbox/outbox-classify.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-02 | 01 | 1 | OBOX-02 | — | Matrice FAILURE_FAMILIES : chaque code → terminal/retryable | unit (table-driven) | `cd app && npm test -- --run src/lib/outbox/failure-families.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-03 | 01 | 1 | OBOX-01 | — | Libellé français dérivé de `failure.code` (fonction pure) | unit | `cd app && npm test -- --run src/lib/outbox/failure-label.test.ts` | ❌ W0 | ⬜ pending |
| 36-01-04 | 01 | 2 | OBOX-01 | — | Badge « N en attente / N bloquées » reflète les catégories | component | `cd app && npm test -- --run src/hooks/use-outbox-replay-badge` | ✅ (existe, à étendre) | ⬜ pending |
| 36-01-05 | 01 | 2 | OBOX-01 | — | Panneau : Abandonner (confirmé) / Réessayer par catégorie | component | `cd app && npm test -- --run app/src/components/…/offline-panel` | ✅ (existe, à étendre) | ⬜ pending |
| 36-01-06 | 01 | 2 | OBOX-01, OBOX-02 | — | Toast D-12 retiré sans régression du badge | regression | `cd app && npm test -- --run src/hooks/use-outbox-replay-badge.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/src/lib/outbox/outbox-classify.test.ts` — test d'intégration rouge : le scénario 404/PGRST116 d'origine doit échouer avant correctif (rouge→vert exigé par le critère de succès 4)
- [ ] `app/src/lib/outbox/failure-families.test.ts` — stubs table-driven sur `FAILURE_FAMILIES`
- [ ] `app/src/lib/outbox/failure-label.test.ts` — stubs sur le libellé dérivé

Les hooks `use-outbox-replay-badge` et le panneau ont déjà leurs fichiers de test (v1.1) — extension, pas création.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Message « cet élément a été supprimé entre-temps » à la reconnexion réelle (offline→online sur appareil) | OBOX-01 | Requiert un vrai cycle offline/online navigateur + IndexedDB réel | Déconnecter le réseau, écrire une entrée, supprimer l'élément côté serveur, reconnecter, vérifier badge + panneau + libellé |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
